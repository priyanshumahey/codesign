import { ArrowSquareOut } from "@phosphor-icons/react"
import type { Node } from "@xyflow/react"

import { SegmentedControl } from "@/components/ui/segmented-control"
import { openExternal, safeExternalUrl } from "@/lib/links"
import { cn } from "@/lib/utils"
import { useCanvasActions } from "../canvas-actions"
import {
  BOUNDARY_COLORS,
  BOUNDARY_COLOR_STYLES,
  BOUNDARY_NODE_TYPE,
  NOTE_NODE_TYPE,
  resolveBoundaryColor,
  resolveServiceStatus,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_STYLES,
  SERVICE_STATUSES,
  type BoundaryNodeData,
  type NoteNodeData,
  type ServiceNodeData,
} from "../types"
import { AreaField, Field, Section, TextField } from "./fields"

export function NodeInspector({ node }: { node: Node }) {
  const { patchNodeData } = useCanvasActions()
  const patch = (data: Record<string, unknown>) => patchNodeData(node.id, data)

  if (node.type === BOUNDARY_NODE_TYPE) {
    const data = node.data as BoundaryNodeData
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
          <SegmentedControl
            value={data.variant ?? "body"}
            options={[
              { value: "body", label: "Body" },
              { value: "heading", label: "Heading" },
            ]}
            onValueChange={(variant) => patch({ variant })}
          />
        </Field>
      </Section>
    )
  }

  const data = node.data as ServiceNodeData
  const status = resolveServiceStatus(data.status)
  const link = safeExternalUrl(data.link)
  return (
    <div className="flex flex-col gap-5">
      <Section>
        <TextField
          label="Name"
          value={data.label ?? ""}
          placeholder="API Gateway"
          onCommit={(label) => patch({ label })}
        />
      </Section>

      <Section title="Ownership">
        <TextField
          label="Owner"
          value={data.owner ?? ""}
          placeholder="Platform team"
          onCommit={(owner) => patch({ owner })}
        />
        <Field label="Status" hint="Click the active status again to clear it.">
          <div className="flex flex-wrap gap-1.5">
            {SERVICE_STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => patch({ status: status === option ? "" : option })}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors",
                  status === option
                    ? "border-foreground/25 bg-muted text-foreground"
                    : "border-transparent bg-muted/55 text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("size-1.5 rounded-full", SERVICE_STATUS_STYLES[option])} />
                {SERVICE_STATUS_LABELS[option]}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Notes">
        <TextField
          label="Link"
          value={data.link ?? ""}
          placeholder="github.com/acme/api-gateway"
          hint={data.link && !link ? "Only http and https links can be opened." : undefined}
          onCommit={(value) => patch({ link: value })}
        />
        {link && (
          <button
            type="button"
            onClick={() => void openExternal(link)}
            className="-mt-1 flex items-center gap-1.5 self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowSquareOut className="size-3.5" />
            Open link
          </button>
        )}
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
