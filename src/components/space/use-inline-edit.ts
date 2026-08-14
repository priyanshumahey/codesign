import { useEffect, useRef, useState } from "react"

/**
 * Double-click-to-edit state shared by the node labels and the note body.
 * An external change to `value` is adopted whenever the field is idle.
 */
export function useInlineEdit<T extends HTMLInputElement | HTMLTextAreaElement>({
  value,
  onCommit,
  allowEmpty = false,
  initiallyEditing = false,
}: {
  value: string
  onCommit: (next: string) => void
  allowEmpty?: boolean
  initiallyEditing?: boolean
}) {
  const ref = useRef<T>(null)
  const [editing, setEditing] = useState(initiallyEditing)
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)

  if (!editing && seen !== value) {
    setSeen(value)
    setDraft(value)
  }

  useEffect(() => {
    if (!editing) return
    ref.current?.focus()
    ref.current?.select()
  }, [editing])

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  const commit = () => {
    setEditing(false)
    const next = allowEmpty ? draft : draft.trim()
    if (next !== value && (allowEmpty || next)) onCommit(next)
    else setDraft(value)
  }

  return {
    ref,
    editing,
    startEditing: () => setEditing(true),
    draft,
    setDraft,
    commit,
    cancel,
  }
}
