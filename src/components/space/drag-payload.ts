import type { IconEntry } from "./types"

/**
 * WKWebView does not always carry custom MIME payloads through a drag, so the
 * dragged entry is mirrored here and used when `dataTransfer` comes back empty.
 */
let pending: IconEntry | null = null

export function setPendingIconDrag(entry: IconEntry | null) {
  pending = entry
}

export function peekPendingIconDrag(): IconEntry | null {
  return pending
}
