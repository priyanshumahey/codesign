import type { Edge, Node } from "@xyflow/react"

import { absolutePosition, nodeSize } from "./geometry"
import { SOURCE_HANDLE_IDS, TARGET_HANDLE_IDS, type HandleSide } from "./handles"

function centre(node: Node, nodes: Node[]) {
  const origin = absolutePosition(node, nodes)
  const { width, height } = nodeSize(node)
  return { x: origin.x + width / 2, y: origin.y + height / 2 }
}

/** Attach an edge to whichever sides face each other, so it never loops back. */
export function chooseHandles(source: Node, target: Node, nodes: Node[]) {
  const from = centre(source, nodes)
  const to = centre(target, nodes)
  const dx = to.x - from.x
  const dy = to.y - from.y

  let sourceSide: HandleSide
  let targetSide: HandleSide
  // Diagrams read left-to-right, and a horizontal exit avoids crossing the
  // label that sits under each icon, so only go vertical when clearly stacked.
  if (Math.abs(dx) * 1.6 >= Math.abs(dy)) {
    sourceSide = dx >= 0 ? "right" : "left"
    targetSide = dx >= 0 ? "left" : "right"
  } else {
    sourceSide = dy >= 0 ? "bottom" : "top"
    targetSide = dy >= 0 ? "top" : "bottom"
  }

  return {
    sourceHandle: SOURCE_HANDLE_IDS[sourceSide],
    targetHandle: TARGET_HANDLE_IDS[targetSide],
  }
}

/** Returns the same array when nothing moved, so callers can skip a re-render. */
export function retargetEdges(edges: Edge[], nodes: Node[]): Edge[] {
  if (edges.length === 0) return edges
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let changed = false

  const next = edges.map((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return edge

    const handles = chooseHandles(source, target, nodes)
    if (
      edge.sourceHandle === handles.sourceHandle &&
      edge.targetHandle === handles.targetHandle
    ) {
      return edge
    }
    changed = true
    return { ...edge, ...handles }
  })

  return changed ? next : edges
}
