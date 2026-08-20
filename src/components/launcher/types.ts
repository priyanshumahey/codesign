import type { EntryKind, NodeMatch } from "@/lib/spaces"

export type LauncherView =
  | { kind: "recents" }
  | { kind: "pinned" }
  | { kind: "folder"; path: string; name: string }

/** Normalized row shared by recents and folder listings. */
export type LauncherItem = {
  path: string
  name: string
  kind: EntryKind
  pinned: boolean
  missing: boolean
  meta: string
  /** Present in the recents index, so it can be pinned or forgotten. */
  tracked: boolean
  lastOpened: number
  modified: number | null
  /** Nodes inside the space that matched the current search, if any. */
  matches?: NodeMatch[]
  matchTotal?: number
}

export type SortKey = "opened" | "name" | "modified"
