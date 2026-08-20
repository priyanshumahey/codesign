import type { Edge, Node } from "@xyflow/react"

const KIND = "codesign/subgraph"
const VERSION = 1

export type SubgraphPayload = {
  kind: typeof KIND
  version: number
  nodes: Node[]
  edges: Edge[]
}

/**
 * Module scope, so a copy survives switching spaces. The system clipboard is a
 * best-effort mirror: WKWebView can refuse `readText`, and that must not break
 * pasting within the app.
 */
let held: SubgraphPayload | null = null

function isNode(value: unknown): value is Node {
  const node = value as Node | undefined
  return (
    typeof node?.id === "string" &&
    typeof node.position?.x === "number" &&
    typeof node.position?.y === "number"
  )
}

function isEdge(value: unknown): value is Edge {
  const edge = value as Edge | undefined
  return (
    typeof edge?.id === "string" &&
    typeof edge.source === "string" &&
    typeof edge.target === "string"
  )
}

/** The system clipboard is untrusted input, so every field is checked. */
function parse(text: string): SubgraphPayload | null {
  try {
    const value = JSON.parse(text) as Partial<SubgraphPayload>
    if (value?.kind !== KIND) return null
    if (!Array.isArray(value.nodes) || !value.nodes.every(isNode)) return null
    if (!Array.isArray(value.edges) || !value.edges.every(isEdge)) return null

    const ids = new Set(value.nodes.map((node) => node.id))
    return {
      kind: KIND,
      version: VERSION,
      nodes: value.nodes,
      edges: value.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    }
  } catch {
    return null
  }
}

export function writeSubgraph(nodes: Node[], edges: Edge[]): void {
  held = { kind: KIND, version: VERSION, nodes, edges }
  void navigator.clipboard?.writeText(JSON.stringify(held)).catch(() => {})
}

/** Prefers the system clipboard so copies move between windows, then falls back. */
export async function readSubgraph(): Promise<SubgraphPayload | null> {
  try {
    const text = await navigator.clipboard?.readText()
    const parsed = text ? parse(text) : null
    if (parsed) return parsed
  } catch {
    /* clipboard read is unavailable — use the in-process copy */
  }
  return held
}

export function hasSubgraph(): boolean {
  return held !== null
}
