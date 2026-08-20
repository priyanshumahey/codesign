import type { Edge, Node } from "@xyflow/react"

import { absolutePosition, nodeSize } from "./geometry"
import type { HandleSide } from "./handles"
import { BOUNDARY_NODE_TYPE, SERVICE_NODE_TYPE } from "./types"

/**
 * Connection chips ride the middle of a smooth-step path, so every edge
 * crossing the same corridor parks its label in the same place. `stepPosition`
 * slides that midpoint along the run, which separates the chips without
 * detaching them from the line they belong to.
 */

/** Must match the `offset` handed to `getSmoothStepPath` by the edge. */
const HANDLE_GAP = 22
/** Handles hang off the icon tile, not the full node with its caption. */
const SERVICE_TILE = 64
const LABEL_HEIGHT = 20
const MAX_LABEL_WIDTH = 256
const CLEARANCE = 6

/** Centre first, then progressively further along the run in both directions. */
const STEPS = [
  0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9,
]

/** Last resort for a crowded run: sit just off the line instead of on a peer. */
const SHIFTS = [0, -24, 24, -46, 46]

export type Placement = { step: number; shift: number }

export type Rect = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }

const DIRECTION: Record<HandleSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

function sideOf(handle: string | null | undefined, fallback: HandleSide): HandleSide {
  const side = handle?.split("-")[0]
  return side === "top" || side === "right" || side === "bottom" || side === "left"
    ? side
    : fallback
}

function handleRect(node: Node, nodes: Node[]): Rect {
  const origin = absolutePosition(node, nodes)
  const { width, height } = nodeSize(node)
  if (node.type === SERVICE_NODE_TYPE) {
    return {
      x: origin.x + (width - SERVICE_TILE) / 2,
      y: origin.y,
      width: SERVICE_TILE,
      height: SERVICE_TILE,
    }
  }
  return { x: origin.x, y: origin.y, width, height }
}

function handlePoint(rect: Rect, side: HandleSide): Point {
  switch (side) {
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y }
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
  }
}

/** Mirrors the centre `getSmoothStepPath` reports for its label. */
function labelCentre(
  source: Point,
  sourceSide: HandleSide,
  target: Point,
  targetSide: HandleSide,
  step: number
): Point {
  const from = {
    x: source.x + DIRECTION[sourceSide].x * HANDLE_GAP,
    y: source.y + DIRECTION[sourceSide].y * HANDLE_GAP,
  }
  const to = {
    x: target.x + DIRECTION[targetSide].x * HANDLE_GAP,
    y: target.y + DIRECTION[targetSide].y * HANDLE_GAP,
  }

  const axis: "x" | "y" = sourceSide === "left" || sourceSide === "right" ? "x" : "y"
  // Facing handles get a jog whose position `stepPosition` controls; any other
  // pairing lands the label on a corner, where the step is ignored.
  if (DIRECTION[sourceSide][axis] * DIRECTION[targetSide][axis] !== -1) {
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  }

  return axis === "x"
    ? { x: from.x + (to.x - from.x) * step, y: (from.y + to.y) / 2 }
    : { x: (from.x + to.x) / 2, y: from.y + (to.y - from.y) * step }
}

/** Mirrors the chip in `system-edge`: a method badge, a gap, then the label. */
function labelSize(method: string, label: string) {
  const badge = method ? method.length * 5.6 + 8 : 0
  const gap = method && label ? 4 : 0
  return {
    width: Math.min(MAX_LABEL_WIDTH, badge + label.length * 5.4 + gap + 12),
    height: LABEL_HEIGHT,
  }
}

function overlap(a: Rect, b: Rect): number {
  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return x > 0 && y > 0 ? x * y : 0
}

/**
 * A boundary is a container edges are meant to cross, so only its title chip
 * blocks a label. Everything else blocks whole.
 */
function obstacles(nodes: Node[]): Rect[] {
  return nodes.map((node) => {
    const origin = absolutePosition(node, nodes)
    const { width, height } = nodeSize(node)
    if (node.type !== BOUNDARY_NODE_TYPE) {
      return { x: origin.x, y: origin.y, width, height }
    }
    const label = typeof node.data?.label === "string" ? node.data.label : ""
    return { x: origin.x + 12, y: origin.y - 10, width: label.length * 5.6 + 12, height: 18 }
  })
}

function boxAt(centre: Point, size: { width: number; height: number }): Rect {
  return {
    x: centre.x - size.width / 2 - CLEARANCE,
    y: centre.y - size.height / 2 - CLEARANCE,
    width: size.width + CLEARANCE * 2,
    height: size.height + CLEARANCE * 2,
  }
}

/**
 * Picks a `stepPosition` per labelled edge so chips stop stacking on top of
 * each other. Unlabelled edges are left alone — nothing is drawn on them.
 */
export function layoutEdgeLabels(nodes: Node[], edges: Edge[]) {
  const placements = new Map<string, Placement>()
  const boxes = new Map<string, Rect>()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const blocked = obstacles(nodes)

  const labelled = edges
    .map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) return null

      const data = (edge.data ?? {}) as Record<string, unknown>
      const method = typeof data.method === "string" ? data.method : ""
      const label = typeof data.label === "string" ? data.label : ""
      if (!method && !label) return null

      const sourceSide = sideOf(edge.sourceHandle, "right")
      const targetSide = sideOf(edge.targetHandle, "left")
      return {
        id: edge.id,
        from: handlePoint(handleRect(source, nodes), sourceSide),
        to: handlePoint(handleRect(target, nodes), targetSide),
        sourceSide,
        targetSide,
        size: labelSize(method, label),
      }
    })
    .filter((candidate) => candidate !== null)

  // Widest chips first: they have the fewest places they can sit cleanly.
  labelled.sort((a, b) => b.size.width - a.size.width || a.id.localeCompare(b.id))

  const placed: Rect[] = []
  for (const candidate of labelled) {
    const across: "x" | "y" =
      candidate.sourceSide === "left" || candidate.sourceSide === "right" ? "y" : "x"
    let best: { step: number; shift: number; rect: Rect; score: number } | null = null

    search: for (const shift of SHIFTS) {
      for (const step of STEPS) {
        const centre = labelCentre(
          candidate.from,
          candidate.sourceSide,
          candidate.to,
          candidate.targetSide,
          step
        )
        const rect = boxAt(
          { ...centre, [across]: centre[across] + shift },
          candidate.size
        )

        let score = 0
        for (const other of placed) score += overlap(rect, other)
        for (const other of blocked) score += overlap(rect, other)

        if (!best || score < best.score) best = { step, shift, rect, score }
        if (score === 0) break search
      }
    }

    if (!best) continue
    placements.set(candidate.id, { step: best.step, shift: best.shift })
    boxes.set(candidate.id, best.rect)
    placed.push(best.rect)
  }

  return { placements, boxes }
}
