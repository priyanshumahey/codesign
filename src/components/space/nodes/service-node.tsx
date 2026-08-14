import { useReactFlow, type NodeProps } from "@xyflow/react"
import { memo } from "react"

import { cn } from "@/lib/utils"
import { NodeHandles } from "../handles"
import { IconGraphic } from "../icon-graphic"
import type { ServiceNodeData } from "../types"
import { useInlineEdit } from "../use-inline-edit"

function ServiceNodeBase({ id, data, selected }: NodeProps & { data: ServiceNodeData }) {
  const { updateNodeData } = useReactFlow()
  const edit = useInlineEdit<HTMLInputElement>({
    value: data.label,
    onCommit: (label) => updateNodeData(id, { label }),
  })

  return (
    <div
      className="group/node relative flex w-28 flex-col items-center gap-2"
      onDoubleClick={(event) => {
        event.stopPropagation()
        edit.startEditing()
      }}
    >
      <div
        className={cn(
          "relative grid size-16 place-items-center rounded-2xl border bg-card transition-all duration-150",
          selected
            ? "border-foreground/50 ring-2 ring-foreground/15"
            : "border-border/70 shadow-[0_1px_2px_rgba(16,24,40,0.05)] group-hover/node:-translate-y-0.5 group-hover/node:border-foreground/25 group-hover/node:shadow-[0_4px_12px_-4px_rgba(16,24,40,0.18)]"
        )}
      >
        {/* Anchored to the tile, not the wrapper, so edges meet the icon
            instead of the label box below it. */}
        <NodeHandles visible={Boolean(selected)} />
        <IconGraphic
          path={data.iconPath}
          mono={data.iconMono}
          className="size-9 text-foreground"
        />
      </div>

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
          className="nodrag nopan w-full rounded-md border border-foreground/30 bg-background px-1.5 py-0.5 text-center text-[11px] font-medium outline-none"
        />
      ) : (
        <div className="flex w-full flex-col items-center gap-0.5">
          <span
            className={cn(
              "max-w-full truncate rounded px-1 text-center text-[11px] font-medium leading-tight",
              selected && "bg-foreground/5"
            )}
          >
            {data.label}
          </span>
          {data.description && (
            <span className="max-w-full truncate text-center text-[9px] leading-tight text-muted-foreground">
              {data.description}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export const ServiceNode = memo(ServiceNodeBase)
