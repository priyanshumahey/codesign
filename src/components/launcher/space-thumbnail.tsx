import { getSmoothStepPath, Position } from "@xyflow/react"
import { useEffect, useRef, useState } from "react"

import { IconGraphic } from "@/components/space/icon-graphic"
import { BOUNDARY_COLOR_STYLES, resolveBoundaryColor } from "@/components/space/types"
import type { PreviewNode, SpacePreview } from "@/lib/preview"
import { cn } from "@/lib/utils"

const PADDING = 24
/** Matches the icon tile in the real service node, which is what edges meet. */
const TILE = 64

type Rect = { x: number; y: number; width: number; height: number }

function anchorOf(node: PreviewNode): Rect {
  if (node.kind !== "service") {
    return { x: node.x, y: node.y, width: node.width, height: node.height }
  }
  return { x: node.x + (node.width - TILE) / 2, y: node.y, width: TILE, height: TILE }
}

/** Meets on the facing sides, the same rule the canvas uses while dragging. */
function sides(from: Rect, to: Rect) {
  const fx = from.x + from.width / 2
  const fy = from.y + from.height / 2
  const tx = to.x + to.width / 2
  const ty = to.y + to.height / 2

  if (Math.abs(tx - fx) >= Math.abs(ty - fy)) {
    const right = tx >= fx
    return {
      sourceX: right ? from.x + from.width : from.x,
      sourceY: fy,
      sourcePosition: right ? Position.Right : Position.Left,
      targetX: right ? to.x : to.x + to.width,
      targetY: ty,
      targetPosition: right ? Position.Left : Position.Right,
    }
  }

  const down = ty >= fy
  return {
    sourceX: fx,
    sourceY: down ? from.y + from.height : from.y,
    sourcePosition: down ? Position.Bottom : Position.Top,
    targetX: tx,
    targetY: down ? to.y : to.y + to.height,
    targetPosition: down ? Position.Top : Position.Bottom,
  }
}

/**
 * The launcher tile draws the document itself — same node markup, same icons,
 * same boundary colours — scaled down, rather than an abstraction of it.
 */
export function SpaceThumbnail({ preview }: { preview: SpacePreview }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (preview.nodes.length === 0) return null

  const content = { width: preview.width + PADDING * 2, height: preview.height + PADDING * 2 }
  const scale =
    box.width > 0 ? Math.min(box.width / content.width, box.height / content.height) : 0

  const byId = new Map(preview.nodes.map((node) => [node.id, node]))

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <div
        style={{
          width: content.width,
          height: content.height,
          transform: `translate(${(box.width - content.width * scale) / 2}px, ${
            (box.height - content.height * scale) / 2
          }px) scale(${scale})`,
          transformOrigin: "0 0",
          // Nothing is measured until the observer reports, so avoid a flash.
          opacity: scale > 0 ? 1 : 0,
        }}
        className="relative transition-opacity"
      >
        <svg
          width={content.width}
          height={content.height}
          className="absolute inset-0 overflow-visible"
        >
          {preview.edges.map((edge, index) => {
            const source = byId.get(edge.source)
            const target = byId.get(edge.target)
            if (!source || !target) return null
            const [path] = getSmoothStepPath({
              ...sides(anchorOf(source), anchorOf(target)),
              borderRadius: 14,
              offset: 22,
            })
            return (
              <path
                key={index}
                d={path}
                transform={`translate(${PADDING}, ${PADDING})`}
                fill="none"
                stroke="var(--color-muted-foreground)"
                strokeWidth={1.25}
                opacity={0.55}
              />
            )
          })}
        </svg>

        {preview.nodes.map((node) => (
          <Node key={node.id} node={node} />
        ))}
      </div>
    </div>
  )
}

function Node({ node }: { node: PreviewNode }) {
  const style = {
    left: node.x + PADDING,
    top: node.y + PADDING,
    width: node.width,
    height: node.height,
  }

  if (node.kind === "boundary") {
    const styles = BOUNDARY_COLOR_STYLES[resolveBoundaryColor(node.color)]
    return (
      <div
        style={style}
        className={cn("absolute rounded-2xl border-2 border-dashed", styles.fill, styles.border)}
      >
        {node.label && (
          <span
            className={cn(
              "absolute -top-2.5 left-3 rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              styles.chip
            )}
          >
            {node.label}
          </span>
        )}
      </div>
    )
  }

  if (node.kind === "note") {
    return (
      <div
        style={style}
        className="absolute flex items-center text-[11px] leading-tight text-foreground/80"
      >
        <span className="line-clamp-2">{node.label}</span>
      </div>
    )
  }

  return (
    <div style={style} className="absolute flex flex-col items-center gap-2">
      <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        {node.icon && <IconGraphic path={node.icon} mono={node.mono} className="size-9" />}
      </div>
      {node.label && (
        <span className="max-w-full truncate px-1 text-center text-[11px] font-medium leading-tight">
          {node.label}
        </span>
      )}
    </div>
  )
}
