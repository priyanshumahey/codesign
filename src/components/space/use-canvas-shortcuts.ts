import { useEffect } from "react"

type Options = {
  onUndo: () => void
  onRedo: () => void
  onDuplicate: () => void
  onSelectAll: () => void
  onDelete: () => void
  onEscape: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(
    element &&
      (element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable)
  )
}

export function useCanvasShortcuts({
  onUndo,
  onRedo,
  onDuplicate,
  onSelectAll,
  onDelete,
  onEscape,
}: Options) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape()
        return
      }
      if (isTypingTarget(event.target)) return

      const mod = event.metaKey || event.ctrlKey

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        onDelete()
        return
      }
      if (!mod) return

      switch (event.key.toLowerCase()) {
        case "z":
          event.preventDefault()
          if (event.shiftKey) onRedo()
          else onUndo()
          break
        case "y":
          event.preventDefault()
          onRedo()
          break
        case "d":
          event.preventDefault()
          onDuplicate()
          break
        case "a":
          event.preventDefault()
          onSelectAll()
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onUndo, onRedo, onDuplicate, onSelectAll, onDelete, onEscape])
}
