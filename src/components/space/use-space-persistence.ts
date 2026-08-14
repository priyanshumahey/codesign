import type { Edge, Node } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { errorMessage, saveSpace } from "@/lib/spaces"
import { toDocument } from "./document"

const AUTOSAVE_DELAY = 700

export type SaveState = "idle" | "saving" | "error"

/**
 * Debounced autosave. Writes are queued so two flushes can never interleave,
 * and an unchanged document is never written — selection alone churns the node
 * array on every click.
 */
export function useSpacePersistence({
  path,
  nodes,
  edges,
  baseline,
}: {
  path: string
  nodes: Node[]
  edges: Edge[]
  /** Serialized document as loaded from disk, so a fresh open writes nothing. */
  baseline: string
}) {
  const [state, setState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)

  const latest = useRef({ nodes, edges })
  latest.current = { nodes, edges }

  // A rename moves the file, so writes always target the newest path.
  const pathRef = useRef(path)
  pathRef.current = path

  const lastSaved = useRef(baseline)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const json = JSON.stringify(toDocument(latest.current.nodes, latest.current.edges))
      if (json === lastSaved.current) return
      setState("saving")
      try {
        await saveSpace(pathRef.current, JSON.parse(json))
        lastSaved.current = json
        setState("idle")
        setError(null)
      } catch (cause) {
        setState("error")
        setError(errorMessage(cause))
      }
    })
    return queue.current
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY)
    return () => clearTimeout(timer)
  }, [nodes, edges, flush])

  // Leaving the space must not drop the last edit still sitting in the debounce.
  useEffect(() => () => void flush(), [flush])

  return { state, error, flush }
}
