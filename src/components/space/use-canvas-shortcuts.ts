import { useEffect } from "react"

type Options = {
  onUndo: () => void
  onRedo: () => void
  onDuplicate: () => void
  onSelectAll: () => void
  onDelete: () => void
  onSave: () => void
  onEscape: () => void
  onTogglePalette: () => void
  /** A printable key pressed with nothing focused, used to start typing a label. */
  onType: (key: string) => void
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(
    element &&
      (element.isContentEditable ||
        element.closest(
          "input, textarea, select, button, a, [role='menuitem'], [role='option']"
        ))
  )
}

export function useCanvasShortcuts({
  onUndo,
  onRedo,
  onDuplicate,
  onSelectAll,
  onDelete,
  onSave,
  onEscape,
  onTogglePalette,
  onType,
}: Options) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape()
        return
      }

      const mod = event.metaKey || event.ctrlKey

      // Saving stays available while a label or inspector field has focus.
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault()
        onSave()
        return
      }
      if (isInteractiveTarget(event.target)) return

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        onDelete()
        return
      }
      if (!mod) {
        // A bare printable key types straight into the selected edge's label.
        // Space is left alone because React Flow pans with it.
        if (event.key.length === 1 && event.key !== " " && !event.altKey) {
          onType(event.key)
        } else if (event.key === "Enter" || event.key === "F2") {
          onType("")
        }
        return
      }

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
        case "b":
          event.preventDefault()
          onTogglePalette()
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [
    onUndo,
    onRedo,
    onDuplicate,
    onSelectAll,
    onDelete,
    onSave,
    onEscape,
    onTogglePalette,
    onType,
  ])
}
