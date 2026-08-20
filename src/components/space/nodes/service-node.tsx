import { ArrowSquareOut } from "@phosphor-icons/react"
import type { NodeProps } from "@xyflow/react"
import { memo } from "react"

import { openExternal, safeExternalUrl } from "@/lib/links"
import { cn } from "@/lib/utils"
import { useCanvasActions } from "../canvas-actions"
import { NodeHandles } from "../handles"
import { IconGraphic } from "../icon-graphic"
import {
  resolveServiceStatus,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_STYLES,
  type ServiceNodeData,
} from "../types"
import { useInlineEdit } from "../use-inline-edit"

function ServiceNodeBase({ id, data, selected }: NodeProps & { data: ServiceNodeData }) {
  const label = data.label ?? ""
  const status = resolveServiceStatus(data.status)
  const link = safeExternalUrl(data.link)
  const { patchNodeData } = useCanvasActions()
  const edit = useInlineEdit<HTMLInputElement>({
    value: label,
    onCommit: (next) => patchNodeData(id, { label: next }),
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
          "relative grid size-16 place-items-center rounded-lg border bg-card transition-colors duration-150",
          selected
            ? "border-brand/60 ring-2 ring-brand/15"
            : "border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.06)] group-hover/node:border-foreground/25"
        )}
      >
        {/* Anchored to the tile, not the wrapper, so edges meet the icon
            instead of the label box below it. */}
        <NodeHandles visible={Boolean(selected)} />
        <IconGraphic
          path={data.iconPath}
          mono={data.iconMono}
          className="size-9"
        />
        {status && (
          <span
            title={SERVICE_STATUS_LABELS[status]}
            className={cn(
              "absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-card",
              SERVICE_STATUS_STYLES[status]
            )}
          />
        )}
        {link && (
          <button
            type="button"
            title="Open link"
            onClick={(event) => {
              event.stopPropagation()
              void openExternal(link)
            }}
            className="nodrag nopan absolute -left-1 -top-1 grid size-4.5 place-items-center rounded-full border border-border/80 bg-card text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/node:opacity-100"
          >
            <ArrowSquareOut className="size-2.5" />
          </button>
        )}
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
          className="nodrag nopan w-full rounded-md border border-foreground/30 bg-background px-1.5 py-0.5 text-center text-[12px] font-medium outline-none"
        />
      ) : (
        <div className="flex w-full flex-col items-center gap-0.5">
          <span
            className={cn(
              "max-w-full break-words rounded px-1 text-center text-[12px] font-medium leading-tight",
              selected && "bg-brand/8"
            )}
          >
            {label}
          </span>
          {data.owner && (
            <span className="max-w-full truncate text-center text-[9px] leading-tight text-muted-foreground/80">
              {data.owner}
            </span>
          )}
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
