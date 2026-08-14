import dagre from "@dagrejs/dagre"
import type { Edge, Node, XYPosition } from "@xyflow/react"

import { nodeSize } from "./geometry"

/**
 * Left-to-right dagre pass over top-level nodes. Children of a boundary keep
 * their relative positions and travel with it.
 */
export function computeAutoLayout(nodes: Node[], edges: Edge[]): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>()
  const roots = nodes.filter((node) => !node.parentId)
  if (roots.length === 0) return positions

  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 96, marginx: 48, marginy: 48 })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const node of roots) {
    const { width, height } = nodeSize(node)
    graph.setNode(node.id, { width, height })
  }

  const rootIds = new Set(roots.map((node) => node.id))
  for (const edge of edges) {
    if (rootIds.has(edge.source) && rootIds.has(edge.target)) {
      graph.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(graph)

  for (const node of roots) {
    const laid = graph.node(node.id) as { x: number; y: number } | undefined
    if (!laid) continue
    const { width, height } = nodeSize(node)
    positions.set(node.id, { x: laid.x - width / 2, y: laid.y - height / 2 })
  }

  return positions
}
