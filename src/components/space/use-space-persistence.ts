import type { Edge, Node } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { errorMessage, pollSpace, saveSpace, type SpaceDocument } from "@/lib/spaces"
import { toDocument } from "./document"

const AUTOSAVE_DELAY = 700
const POLL_DELAY = 2000

export type SaveState = "idle" | "saving" | "error"

/**
 * Debounced autosave. Writes are queued so two flushes can never interleave,
 * and an unchanged document is never written — selection alone churns the node
 * array on every click.
 *
 * Also picks up edits made to the file by something else (the MCP server), and
 * only adopts them while the canvas has nothing unsaved, so an external write
 * can never discard local work.
 */
export function useSpacePersistence({
  path,
  updatedAt,
  nodes,
  edges,
  baseline,
  onExternalChange,
}: {
  path: string
  /** `updatedAt` as loaded, so a later value on disk means someone else wrote. */
  updatedAt: number
  nodes: Node[]
  edges: Edge[]
  /** Serialized document as loaded from disk, so a fresh open writes nothing. */
  baseline: string
  onExternalChange: (document: SpaceDocument) => void
}) {
  const [state, setState] = useState<SaveState>("idle")
  const [error, setError] = useState<string | null>(null)

  const latest = useRef({ nodes, edges })
  latest.current = { nodes, edges }

  // A rename moves the file, so writes always target the newest path.
  const pathRef = useRef(path)
  pathRef.current = path

  const external = useRef(onExternalChange)
  external.current = onExternalChange

  const lastSaved = useRef(baseline)
  const savedAt = useRef(updatedAt)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const json = JSON.stringify(toDocument(latest.current.nodes, latest.current.edges))
      if (json === lastSaved.current) return
      setState("saving")
      try {
        savedAt.current = await saveSpace(pathRef.current, JSON.parse(json))
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

  useEffect(() => {
    const timer = setInterval(() => {
      queue.current = queue.current.then(async () => {
        const pending = JSON.stringify(
          toDocument(latest.current.nodes, latest.current.edges)
        )
        // Local edits win; they are about to be written anyway.
        if (pending !== lastSaved.current) return

        const space = await pollSpace(pathRef.current, savedAt.current).catch(() => null)
        if (!space) return

        savedAt.current = space.updatedAt
        lastSaved.current = JSON.stringify(space.document)
        external.current(space.document)
      })
    }, POLL_DELAY)
    return () => clearInterval(timer)
  }, [])

  return { state, error, flush }
}
