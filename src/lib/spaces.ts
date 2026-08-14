import { invoke } from "@tauri-apps/api/core"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"

export const SPACE_EXTENSION = "codesign"

export type EntryKind = "file" | "folder"

export type RecentItem = {
  path: string
  name: string
  kind: EntryKind
  lastOpened: number
  pinned: boolean
  exists: boolean
  modified: number | null
  size: number | null
}

export type SpaceSummary = {
  path: string
  name: string
  modified: number | null
  size: number | null
}

export type SpaceDocument = { nodes: unknown[]; edges: unknown[] }

export type SpaceFile = {
  version: number
  id: string
  name: string
  createdAt: number
  updatedAt: number
  document: SpaceDocument
  path: string
}

export const listRecents = () => invoke<RecentItem[]>("list_recents")

export const openSpace = (path: string) => invoke<SpaceFile>("open_space", { path })

/** Writes the canvas back to disk. Resolves with the new `updatedAt`. */
export const saveSpace = (path: string, document: SpaceDocument) =>
  invoke<number>("save_space", { path, document })

/** Resolves with the space only if it changed on disk since `knownUpdatedAt`. */
export const pollSpace = (path: string, knownUpdatedAt: number) =>
  invoke<SpaceFile | null>("poll_space", { path, knownUpdatedAt })

export const renameSpace = (path: string, name: string) =>
  invoke<SpaceFile>("rename_space", { path, name })

export const deleteSpace = (path: string) => invoke<void>("delete_space", { path })

export const forgetRecent = (path: string) => invoke<void>("forget_recent", { path })

export const setPinned = (path: string, pinned: boolean) =>
  invoke<void>("set_pinned", { path, pinned })

export const addFolder = (path: string) => invoke<void>("add_folder", { path })

export const listFolderSpaces = (path: string) =>
  invoke<SpaceSummary[]>("list_folder_spaces", { path })

export const revealInFileManager = (path: string) =>
  invoke<void>("reveal_in_file_manager", { path })

export const defaultSpaceDir = () => invoke<string>("default_space_dir")

const SPACE_FILTER = { name: "Codesign space", extensions: [SPACE_EXTENSION] }

/** Native picker for an existing `.codesign` file. */
export async function pickSpaceFile(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [SPACE_FILTER],
  })
  return typeof selected === "string" ? selected : null
}

/** Native picker for a folder to track in the launcher. */
export async function pickFolder(): Promise<string | null> {
  const selected = await openDialog({ multiple: false, directory: true })
  return typeof selected === "string" ? selected : null
}

/** Ask where to put a new space, then create it on disk. */
export async function createSpaceViaDialog(name: string): Promise<SpaceFile | null> {
  const dir = await defaultSpaceDir().catch(() => null)
  const target = await saveDialog({
    title: "New space",
    defaultPath: dir ? `${dir}/${name}.${SPACE_EXTENSION}` : `${name}.${SPACE_EXTENSION}`,
    filters: [SPACE_FILTER],
  })
  if (!target) return null
  return invoke<SpaceFile>("create_space", { path: target, name })
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return "Something went wrong."
}
