import { Trash, X } from "@phosphor-icons/react"
import type { Edge, Node } from "@xyflow/react"

import { cn } from "@/lib/utils"
import { IconGraphic } from "../icon-graphic"
import {
  BOUNDARY_NODE_TYPE,
  NOTE_NODE_TYPE,
  type BoundaryNodeData,
  type NoteNodeData,
  type ServiceNodeData,
} from "../types"
import { EdgeInspector } from "./edge-inspector"
import { NodeInspector } from "./node-inspector"

type Summary = { kind: string; title: string; subtitle?: string; badge?: React.ReactNode }

function summarise(node: Node | null, edge: Edge | null, nodes: Node[]): Summary {
  if (edge) {
    const nameOf = (id: string) => {
      const found = nodes.find((candidate) => candidate.id === id)
      const data = found?.data as { label?: string } | undefined
      return data?.label ?? "—"
    }
    return {
      kind: "Connection",
      title: nameOf(edge.source),
      subtitle: nameOf(edge.target),
    }
  }

  if (!node) return { kind: "", title: "" }

  if (node.type === BOUNDARY_NODE_TYPE) {
    const data = node.data as BoundaryNodeData
    return { kind: "Boundary", title: data.label || "Untitled boundary" }
  }
  if (node.type === NOTE_NODE_TYPE) {
    const data = node.data as NoteNodeData
    return { kind: "Note", title: data.text?.split("\n")[0] || "Empty note" }
  }

  const data = node.data as ServiceNodeData
  return {
    kind: "Component",
    title: data.label,
    subtitle: data.iconId,
    badge: (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-card">
        <IconGraphic path={data.iconPath} mono={data.iconMono} className="size-5" />
      </span>
    ),
  }
}

export function Inspector({
  node,
  edge,
  nodes,
  onClose,
  onDelete,
}: {
  node: Node | null
  edge: Edge | null
  nodes: Node[]
  onClose: () => void
  onDelete: () => void
}) {
  const summary = summarise(node, edge, nodes)
  const empty = !node && !edge

  return (
    <aside className="pointer-events-auto absolute right-3 top-3 bottom-3 flex w-[296px] flex-col overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_18px_48px_-24px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <header className="flex min-h-14 items-center gap-2.5 border-b border-border/70 px-3 py-2.5">
        {summary.badge}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground/75">
            {empty ? "Details" : summary.kind}
          </p>
          <p className="truncate text-[13px] font-medium leading-tight text-foreground/90">
            {empty ? "Nothing selected" : summary.title}
          </p>
          {summary.subtitle && (
            <p
              className={cn(
                "truncate text-[10px] leading-tight text-muted-foreground",
                edge && "before:mr-1 before:content-['→']"
              )}
            >
              {summary.subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3.5">
        {edge ? (
          <EdgeInspector edge={edge} />
        ) : node ? (
          <NodeInspector node={node} />
        ) : (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Right-click a component or connection on the canvas to edit its details
            here.
          </p>
        )}
      </div>

      {!empty && (
        <footer className="border-t border-border/70 p-2">
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash className="size-3.5" />
            Delete {edge ? "connection" : summary.kind.toLowerCase()}
          </button>
        </footer>
      )}
    </aside>
  )
}
