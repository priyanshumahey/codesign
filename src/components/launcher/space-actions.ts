import {
  ArrowUpRight,
  EyeSlash,
  FolderOpen,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"

import type { LauncherItem } from "./types"

export type SpaceAction = {
  id: string
  label: string
  icon: Icon
  onSelect: () => void
  destructive?: boolean
  dividerBefore?: boolean
}

export type SpaceActionHandlers = {
  onOpen: (item: LauncherItem) => void
  onRename: (item: LauncherItem) => void
  onTogglePin: (item: LauncherItem) => void
  onReveal: (item: LauncherItem) => void
  onForget: (item: LauncherItem) => void
  onDelete: (item: LauncherItem) => void
}

/**
 * Folders are only ever tracked, never renamed or trashed from here — deleting
 * a user's project folder is not ours to offer.
 */
export function buildSpaceActions(
  item: LauncherItem,
  handlers: SpaceActionHandlers
): SpaceAction[] {
  const isFile = item.kind === "file"
  const actions: SpaceAction[] = [
    {
      id: "open",
      label: item.kind === "folder" ? "Open folder" : "Open",
      icon: ArrowUpRight,
      onSelect: () => handlers.onOpen(item),
    },
  ]

  if (isFile && !item.missing) {
    actions.push({
      id: "rename",
      label: "Rename…",
      icon: PencilSimple,
      onSelect: () => handlers.onRename(item),
    })
  }

  if (item.tracked) {
    actions.push({
      id: "pin",
      label: item.pinned ? "Unpin" : "Pin",
      icon: item.pinned ? PushPinSlash : PushPin,
      onSelect: () => handlers.onTogglePin(item),
    })
  }

  if (!item.missing) {
    actions.push({
      id: "reveal",
      label: "Reveal in Finder",
      icon: FolderOpen,
      onSelect: () => handlers.onReveal(item),
      dividerBefore: true,
    })
  }

  if (item.tracked) {
    actions.push({
      id: "forget",
      label: "Remove from recents",
      icon: EyeSlash,
      onSelect: () => handlers.onForget(item),
      dividerBefore: item.missing,
    })
  }

  if (isFile && !item.missing) {
    actions.push({
      id: "delete",
      label: "Move to Trash",
      icon: Trash,
      onSelect: () => handlers.onDelete(item),
      destructive: true,
    })
  }

  return actions
}
