import { useReactFlow, type Node } from "@xyflow/react"

import { cn } from "@/lib/utils"
import {
  BOUNDARY_COLORS,
  BOUNDARY_COLOR_STYLES,
  GROUP_NODE_TYPE,
  NOTE_NODE_TYPE,
  resolveBoundaryColor,
  type GroupNodeData,
  type NoteNodeData,
  type ServiceNodeData,
} from "../types"
import { AreaField, Field, Section, TextField } from "./fields"

export function NodeInspector({ node }: { node: Node }) {
  const { updateNodeData } = useReactFlow()
  const patch = (data: Record<string, unknown>) => updateNodeData(node.id, data)

  if (node.type === GROUP_NODE_TYPE) {
    const data = node.data as GroupNodeData
    const active = resolveBoundaryColor(data.color)
    return (
      <Section>
        <TextField
          label="Name"
          value={data.label ?? ""}
          placeholder="Backend services"
          onCommit={(label) => patch({ label })}
        />
        <Field label="Colour">
          <div className="flex flex-wrap gap-1.5">
            {BOUNDARY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => patch({ color })}
                className={cn(
                  "size-7 rounded-lg border-2 transition-transform",
                  BOUNDARY_COLOR_STYLES[color].fill,
                  BOUNDARY_COLOR_STYLES[color].border,
                  active === color
                    ? "scale-105 ring-2 ring-foreground/30"
                    : "hover:scale-105"
                )}
              />
            ))}
          </div>
        </Field>
      </Section>
    )
  }

  if (node.type === NOTE_NODE_TYPE) {
    const data = node.data as NoteNodeData
    return (
      <Section>
        <AreaField
          label="Text"
          value={data.text ?? ""}
          rows={4}
          placeholder="Write a note…"
          onCommit={(text) => patch({ text })}
        />
        <Field label="Style">
          <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-1">
            {(["body", "heading"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                onClick={() => patch({ variant })}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1 text-[12px] font-medium capitalize transition-colors",
                  (data.variant ?? "body") === variant
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {variant}
              </button>
            ))}
          </div>
        </Field>
      </Section>
    )
  }

  const data = node.data as ServiceNodeData
  return (
    <div className="flex flex-col gap-6">
      <Section>
        <TextField
          label="Name"
          value={data.label ?? ""}
          placeholder="API Gateway"
          onCommit={(label) => patch({ label })}
        />
        <TextField
          label="Group"
          value={data.group ?? ""}
          placeholder="frontend / backend / data"
          onCommit={(group) => patch({ group })}
        />
      </Section>

      <Section title="Notes">
        <AreaField
          label="Description"
          value={data.description ?? ""}
          rows={4}
          placeholder="Responsibility, latency budget, scale, auth model…"
          onCommit={(description) => patch({ description })}
        />
      </Section>
    </div>
  )
}
