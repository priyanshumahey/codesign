import type { SpaceDocument } from "@/lib/spaces"

export type DiagramChange = {
  id: string
  target: "node" | "edge"
  action: "added" | "updated" | "removed"
  label: string
  detail: string
}

type DocumentItem = Record<string, unknown>

function isRecord(value: unknown): value is DocumentItem {
  return typeof value === "object" && value !== null
}

function indexItems(items: unknown[]) {
  const indexed = new Map<string, DocumentItem>()
  for (const item of items) {
    if (isRecord(item) && typeof item.id === "string") indexed.set(item.id, item)
  }
  return indexed
}

function itemData(item: DocumentItem) {
  return isRecord(item.data) ? item.data : {}
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function titleCase(value: string) {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function nodeLabel(node: DocumentItem) {
  const data = itemData(node)
  return text(data.label) ?? text(data.text) ?? text(node.id) ?? "Component"
}

function nodeKind(node: DocumentItem) {
  return text(node.type) ? titleCase(String(node.type)) : "Component"
}

function edgeEndpoints(
  edge: DocumentItem,
  nodes: Map<string, DocumentItem>
) {
  const source = text(edge.source)
  const target = text(edge.target)
  const sourceLabel = source ? nodeLabel(nodes.get(source) ?? { id: source }) : "Source"
  const targetLabel = target ? nodeLabel(nodes.get(target) ?? { id: target }) : "Target"
  return `${sourceLabel} -> ${targetLabel}`
}

function edgeLabel(edge: DocumentItem, nodes: Map<string, DocumentItem>) {
  return text(itemData(edge).label) ?? edgeEndpoints(edge, nodes)
}

function changed(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after)
}

function nodeUpdateDetail(before: DocumentItem, after: DocumentItem) {
  if (changed(itemData(before), itemData(after))) return "Properties updated"
  if (before.parentId !== after.parentId) return "Grouping changed"
  if (changed(before.position, after.position)) return "Position changed"
  if (before.width !== after.width || before.height !== after.height) {
    return "Size changed"
  }
  return "Component updated"
}

function edgeUpdateDetail(before: DocumentItem, after: DocumentItem) {
  if (before.source !== after.source || before.target !== after.target) {
    return "Endpoints changed"
  }
  return "Connection updated"
}

export function diffDocuments(
  before: SpaceDocument,
  after: SpaceDocument
): DiagramChange[] {
  const beforeNodes = indexItems(before.nodes)
  const afterNodes = indexItems(after.nodes)
  const beforeEdges = indexItems(before.edges)
  const afterEdges = indexItems(after.edges)
  const allNodes = new Map([...beforeNodes, ...afterNodes])
  const changes: DiagramChange[] = []

  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) {
      changes.push({
        id,
        target: "node",
        action: "removed",
        label: nodeLabel(node),
        detail: nodeKind(node),
      })
    }
  }

  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id)
    if (!previous) {
      changes.push({
        id,
        target: "node",
        action: "added",
        label: nodeLabel(node),
        detail: nodeKind(node),
      })
    } else if (changed(previous, node)) {
      changes.push({
        id,
        target: "node",
        action: "updated",
        label: nodeLabel(node),
        detail: nodeUpdateDetail(previous, node),
      })
    }
  }

  for (const [id, edge] of beforeEdges) {
    if (!afterEdges.has(id)) {
      changes.push({
        id,
        target: "edge",
        action: "removed",
        label: edgeLabel(edge, allNodes),
        detail: edgeEndpoints(edge, allNodes),
      })
    }
  }

  for (const [id, edge] of afterEdges) {
    const previous = beforeEdges.get(id)
    if (!previous) {
      changes.push({
        id,
        target: "edge",
        action: "added",
        label: edgeLabel(edge, allNodes),
        detail: edgeEndpoints(edge, allNodes),
      })
    } else if (changed(previous, edge)) {
      changes.push({
        id,
        target: "edge",
        action: "updated",
        label: edgeLabel(edge, allNodes),
        detail: edgeUpdateDetail(previous, edge),
      })
    }
  }

  const order = { added: 0, updated: 1, removed: 2 }
  return changes.sort((left, right) => order[left.action] - order[right.action])
}