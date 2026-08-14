import { NodeResizer, type NodeProps } from "@xyflow/react"
import { memo } from "react"

import { cn } from "@/lib/utils"
import { useCanvasActions } from "../canvas-actions"
import { NodeHandles } from "../handles"
import {
  BOUNDARY_COLOR_STYLES,
  resolveBoundaryColor,
  type GroupNodeData,
} from "../types"
import { useInlineEdit } from "../use-inline-edit"

function GroupNodeBase({ id, data, selected }: NodeProps & { data: GroupNodeData }) {
  const label = data.label ?? "Boundary"
  const styles = BOUNDARY_COLOR_STYLES[resolveBoundaryColor(data.color)]
  const { patchNodeData, checkpoint } = useCanvasActions()
  const edit = useInlineEdit<HTMLInputElement>({
    value: label,
    onCommit: (next) => patchNodeData(id, { label: next }),
  })

  return (
    <div
      className={cn(
        "group/node relative size-full rounded-2xl border-2 border-dashed transition-colors",
        styles.fill,
        selected ? styles.borderSelected : styles.border
      )}
    >
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={200}
        minHeight={140}
        onResizeStart={checkpoint}
        lineClassName="!border-transparent"
        handleClassName="!size-2 !rounded-[3px] !border !border-background !bg-foreground/60"
      />

      <NodeHandles visible={Boolean(selected)} />

      <div
        className="absolute -top-2.5 left-3 z-10"
        onDoubleClick={(event) => {
          event.stopPropagation()
          edit.startEditing()
        }}
      >
        {edit.editing ? (
          <input
            ref={edit.ref}
            value={edit.draft}
            onChange={(event) => edit.setDraft(event.target.value)}
            onBlur={edit.commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") edit.commit()
              else if (event.key === "Escape") edit.cancel()
            }}
            className="nodrag nopan rounded-md border border-foreground/30 bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider outline-none"
          />
        ) : (
          <span
            className={cn(
              "rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              styles.chip
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeBase)
