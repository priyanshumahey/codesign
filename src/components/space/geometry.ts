import type { Node, XYPosition } from "@xyflow/react"

import {
  BOUNDARY_DEFAULT_SIZE,
  BOUNDARY_NODE_TYPE,
  NOTE_DEFAULT_SIZE,
  NOTE_NODE_TYPE,
  SERVICE_NODE_SIZE,
} from "./types"

export function nodeSize(node: Node): { width: number; height: number } {
  const width = node.measured?.width ?? node.width
  const height = node.measured?.height ?? node.height
  if (width && height) return { width, height }
  if (node.type === BOUNDARY_NODE_TYPE) return { ...BOUNDARY_DEFAULT_SIZE }
  if (node.type === NOTE_NODE_TYPE) return { ...NOTE_DEFAULT_SIZE }
  return { ...SERVICE_NODE_SIZE }
}

/** Child positions are parent-relative, so walk up to get canvas coordinates. */
export function absolutePosition(node: Node, nodes: Node[]): XYPosition {
  let { x, y } = node.position
  let parent = node.parentId ? nodes.find((n) => n.id === node.parentId) : undefined
  const seen = new Set([node.id])
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id)
    x += parent.position.x
    y += parent.position.y
    parent = parent.parentId ? nodes.find((n) => n.id === parent!.parentId) : undefined
  }
  return { x, y }
}

/** Topmost boundary containing `point`; later nodes win, matching paint order. */
export function findBoundaryAt(
  nodes: Node[],
  point: XYPosition,
  excludeId?: string
): Node | undefined {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]
    if (node.type !== BOUNDARY_NODE_TYPE || node.id === excludeId) continue
    const { width, height } = nodeSize(node)
    const origin = absolutePosition(node, nodes)
    if (
      point.x >= origin.x &&
      point.x <= origin.x + width &&
      point.y >= origin.y &&
      point.y <= origin.y + height
    ) {
      return node
    }
  }
  return undefined
}

/** React Flow requires every parent to appear before its descendants. */
export function sortByBoundaryParenting(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const depthOf = (node: Node) => {
    let depth = 0
    let current = node
    const seen = new Set([node.id])
    while (current.parentId) {
      if (seen.has(current.parentId)) break
      const parent = byId.get(current.parentId)
      if (!parent) break
      seen.add(parent.id)
      depth += 1
      current = parent
    }
    return depth
  }

  return nodes
    .map((node, position) => ({
      node,
      position,
      depth: depthOf(node),
      kind: node.type === BOUNDARY_NODE_TYPE ? 0 : 1,
    }))
    .sort((a, b) => a.depth - b.depth || a.kind - b.kind || a.position - b.position)
    .map(({ node }) => node)
}
