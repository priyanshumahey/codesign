import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"
import { memo } from "react"

import { cn } from "@/lib/utils"
import type { SystemEdgeData } from "../types"

function SystemEdgeBase({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerEnd,
  style,
}: EdgeProps & { data?: SystemEdgeData }) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
    offset: 22,
  })

  const { label, method } = data ?? {}

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? "var(--color-foreground)" : "var(--color-muted-foreground)",
          strokeWidth: selected ? 2 : 1.25,
          opacity: selected ? 1 : 0.55,
        }}
      />

      {(label || method) && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className={cn(
              "pointer-events-none absolute flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium shadow-sm",
              selected ? "border-foreground/40" : "border-border/70"
            )}
          >
            {method && (
              <span className="rounded bg-muted px-1 font-mono text-[9px] uppercase text-muted-foreground">
                {method}
              </span>
            )}
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const SystemEdge = memo(SystemEdgeBase)
