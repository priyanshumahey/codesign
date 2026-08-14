import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"

export type PreviewNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
  kind: string
  color?: string
  label?: string
  icon?: string
  mono?: boolean
}

export type PreviewEdge = { source: string; target: string }

export type SpacePreview = {
  path: string
  width: number
  height: number
  nodes: PreviewNode[]
  edges: PreviewEdge[]
}

export const spacePreviews = (paths: string[]) =>
  invoke<SpacePreview[]>("space_previews", { paths })

/**
 * One request for the whole grid, keyed by path. Tiles mount and unmount as the
 * list is filtered, so the fetch is owned by the launcher rather than the tile.
 */
export function useSpacePreviews(paths: string[]) {
  const [previews, setPreviews] = useState<Record<string, SpacePreview>>({})
  const key = paths.join("\u0000")

  useEffect(() => {
    const wanted = key ? key.split("\u0000") : []
    if (wanted.length === 0) return

    let cancelled = false
    spacePreviews(wanted)
      .then((results) => {
        if (cancelled) return
        setPreviews((current) => {
          const next = { ...current }
          for (const preview of results) next[preview.path] = preview
          return next
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [key])

  return previews
}
