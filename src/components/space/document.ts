import type { Edge, Node, XYPosition } from "@xyflow/react"

import type { SpaceDocument } from "@/lib/spaces"
import { sortByGroupParenting } from "./geometry"

/**
 * React Flow decorates nodes with runtime state (`measured`, `selected`,
 * `dragging`, handle bounds). Only the fields that define the diagram are
 * written to disk.
 */
export function toDocument(nodes: Node[], edges: Edge[]): SpaceDocument {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      ...(typeof node.width === "number" ? { width: node.width } : {}),
      ...(typeof node.height === "number" ? { height: node.height } : {}),
      ...(node.parentId ? { parentId: node.parentId, extent: node.extent } : {}),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      type: edge.type,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      data: edge.data,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPosition(value: unknown): value is XYPosition {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number"
}

function readNode(raw: unknown): Node | null {
  if (!isRecord(raw)) return null
  const { id, type, position, data, width, height, parentId, extent } = raw
  if (typeof id !== "string" || typeof type !== "string" || !isPosition(position)) {
    return null
  }
  return {
    id,
    type,
    position,
    data: isRecord(data) ? data : {},
    ...(typeof width === "number" ? { width } : {}),
    ...(typeof height === "number" ? { height } : {}),
    ...(typeof parentId === "string"
      ? { parentId, extent: extent === "parent" ? ("parent" as const) : undefined }
      : {}),
  }
}

function readEdge(raw: unknown, nodeIds: Set<string>): Edge | null {
  if (!isRecord(raw)) return null
  const { id, type, source, target, sourceHandle, targetHandle, data } = raw
  if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") {
    return null
  }
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null
  return {
    id,
    source,
    target,
    ...(typeof type === "string" ? { type } : {}),
    ...(typeof sourceHandle === "string" ? { sourceHandle } : {}),
    ...(typeof targetHandle === "string" ? { targetHandle } : {}),
    ...(isRecord(data) ? { data } : {}),
  }
}

/** Space files are user-editable, so anything malformed is dropped rather than trusted. */
export function fromDocument(document: SpaceDocument | undefined): {
  nodes: Node[]
  edges: Edge[]
} {
  const rawNodes = Array.isArray(document?.nodes) ? document.nodes : []
  const rawEdges = Array.isArray(document?.edges) ? document.edges : []

  const nodes: Node[] = []
  const seen = new Set<string>()
  for (const raw of rawNodes) {
    const node = readNode(raw)
    if (node && !seen.has(node.id)) {
      seen.add(node.id)
      nodes.push(node)
    }
  }
  // A parent that failed to load would leave its children unpositionable.
  for (const node of nodes) {
    if (node.parentId && !seen.has(node.parentId)) {
      delete node.parentId
      delete node.extent
    }
  }

  const edges: Edge[] = []
  const edgeIds = new Set<string>()
  for (const raw of rawEdges) {
    const edge = readEdge(raw, seen)
    if (edge && !edgeIds.has(edge.id)) {
      edgeIds.add(edge.id)
      edges.push(edge)
    }
  }

  return { nodes: sortByGroupParenting(nodes), edges }
}
