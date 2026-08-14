import { useReactFlow, type NodeProps } from "@xyflow/react"
import { memo } from "react"

import { cn } from "@/lib/utils"
import { NodeHandles } from "../handles"
import type { NoteNodeData } from "../types"
import { useInlineEdit } from "../use-inline-edit"

function NoteNodeBase({ id, data, selected }: NodeProps & { data: NoteNodeData }) {
  const variant = data.variant ?? "body"
  const { updateNodeData } = useReactFlow()
  const edit = useInlineEdit<HTMLTextAreaElement>({
    value: data.text,
    onCommit: (text) => updateNodeData(id, { text }),
    allowEmpty: true,
    // A freshly dropped note is empty, so open straight into edit mode.
    initiallyEditing: data.text.length === 0,
  })

  const textClass = variant === "heading" ? "text-base font-semibold" : "text-[13px]"

  return (
    <div
      className={cn(
        "group/node relative min-h-9 w-50 rounded-lg px-2 py-1.5 transition-colors",
        selected ? "ring-2 ring-foreground/30" : "hover:ring-1 hover:ring-border"
      )}
      onDoubleClick={(event) => {
        event.stopPropagation()
        edit.startEditing()
      }}
    >
      <NodeHandles visible={Boolean(selected)} />

      {edit.editing ? (
        <textarea
          ref={edit.ref}
          value={edit.draft}
          rows={1}
          onChange={(event) => edit.setDraft(event.target.value)}
          onBlur={edit.commit}
          onKeyDown={(event) => {
            if (event.key === "Escape") edit.cancel()
          }}
          placeholder={variant === "heading" ? "Heading…" : "Note…"}
          className={cn(
            "nodrag nopan field-sizing-content w-full resize-none bg-transparent leading-snug outline-none placeholder:text-muted-foreground/60",
            textClass
          )}
        />
      ) : (
        <p
          className={cn(
            "whitespace-pre-wrap break-words leading-snug",
            textClass,
            !data.text && "text-muted-foreground/60"
          )}
        >
          {data.text || "Empty note"}
        </p>
      )}
    </div>
  )
}

export const NoteNode = memo(NoteNodeBase)
