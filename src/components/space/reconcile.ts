import type { Edge, Node } from "@xyflow/react"

/**
 * Merge a document computed in Rust back into live React Flow state.
 *
 * React Flow decorates nodes with runtime fields (`measured`, `selected`,
 * `dragging`) that the document does not carry. Replacing the arrays wholesale
 * would drop measurements — and an unmeasured node renders invisible — so
 * untouched entries keep their existing object identity and only real changes
 * produce new ones.
 */
export function reconcileNodes(current: Node[], next: Node[]): Node[] {
  const existing = new Map(current.map((node) => [node.id, node]))

  return next.map((node) => {
    const previous = existing.get(node.id)
    if (!previous) return node

    const merged: Node = {
      ...node,
      ...(previous.measured ? { measured: previous.measured } : {}),
      ...(previous.selected ? { selected: previous.selected } : {}),
    }
    return unchanged(previous, merged) ? previous : merged
  })
}

export function reconcileEdges(current: Edge[], next: Edge[]): Edge[] {
  const existing = new Map(current.map((edge) => [edge.id, edge]))

  return next.map((edge) => {
    const previous = existing.get(edge.id)
    if (!previous) return edge

    const merged: Edge = {
      ...edge,
      ...(previous.selected ? { selected: previous.selected } : {}),
    }
    return unchanged(previous, merged) ? previous : merged
  })
}

/** Compares the fields the document owns; runtime decoration is ignored. */
function unchanged<T extends Node | Edge>(previous: T, next: T): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof T>
  for (const key of keys) {
    if (key === "measured" || key === "selected" || key === "dragging") continue
    if (!deepEqual(previous[key], next[key])) return false
  }
  return true
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (typeof a !== "object") return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (!deepEqual(left[key], right[key])) return false
  }
  return true
}
