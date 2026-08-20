import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react"
import { memo, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { useCanvasActions } from "../canvas-actions"
import { resolveEdgeDirection, type SystemEdgeData } from "../types"

function EdgeLabelInput({
  id,
  value,
  seed,
}: {
  id: string
  value: string
  /** First character typed, when the editor was opened by typing. */
  seed: string
}) {
  const { patchEdgeData, endEdgeLabelEdit } = useCanvasActions()
  const [draft, setDraft] = useState(seed || value)
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    if (!seed) ref.current?.select()
  }, [seed])

  // Blur fires after Enter/Escape too, so only the first outcome counts.
  const finish = (next: string | null) => {
    if (settled.current) return
    settled.current = true
    if (next !== null && next !== value) patchEdgeData(id, { label: next })
    endEdgeLabelEdit()
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft.trim())}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter") finish(draft.trim())
        else if (event.key === "Escape") finish(null)
      }}
      placeholder="Label"
      size={Math.max(draft.length, 6)}
      className="nodrag nopan max-w-64 rounded-md border border-foreground/40 bg-card px-1.5 py-0.5 text-center text-[10px] font-medium text-foreground outline-none shadow-sm"
    />
  )
}

function SystemEdgeBase({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerStart,
  markerEnd,
  style,
}: EdgeProps & { data?: SystemEdgeData }) {
  const { editingEdge, startEdgeLabelEdit } = useCanvasActions()

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: 22,
    stepPosition: data?.labelStep ?? 0.5,
  })

  const { label, method } = data ?? {}
  const direction = resolveEdgeDirection(data?.direction)
  const editing = editingEdge?.id === id ? editingEdge : null

  // A vertical run is crowded across x, a horizontal one across y.
  const shift = data?.labelShift ?? 0
  const acrossX = sourcePosition === Position.Top || sourcePosition === Position.Bottom

  return (
    <>
      <BaseEdge
        // WebKit does not repaint a path when its marker attributes change, so
        // the element is rebuilt whenever the arrowheads move.
        key={direction}
        path={path}
        markerStart={direction === "backward" || direction === "both" ? markerStart : undefined}
        markerEnd={direction === "forward" || direction === "both" ? markerEnd : undefined}
        style={{
          ...style,
          stroke: selected ? "var(--color-foreground)" : "var(--color-muted-foreground)",
          strokeWidth: selected ? 2 : 1.25,
          opacity: selected ? 1 : 0.55,
        }}
      />

      {(editing || label || method) && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + (acrossX ? shift : 0)}px, ${labelY + (acrossX ? 0 : shift)}px)`,
            }}
            // The edge label layer is pointer-events:none / user-select:none.
            className="pointer-events-auto absolute select-text"
          >
            {editing ? (
              <EdgeLabelInput id={id} value={label ?? ""} seed={editing.seed} />
            ) : (
              <div
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  startEdgeLabelEdit(id)
                }}
                title={[method, label].filter(Boolean).join(" ")}
                className={cn(
                  // `bg-card` rather than `bg-background`: in dark mode the
                  // background is the same colour as the canvas, so the chip
                  // disappears into it.
                  "nodrag nopan flex max-w-64 cursor-text items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm",
                  selected ? "border-foreground/50" : "border-foreground/15"
                )}
              >
                {method && (
                  <span className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] font-semibold uppercase text-foreground/70">
                    {method}
                  </span>
                )}
                {label && <span className="min-w-0 truncate">{label}</span>}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const SystemEdge = memo(SystemEdgeBase)
