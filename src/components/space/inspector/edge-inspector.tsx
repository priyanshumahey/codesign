import { useReactFlow, type Edge } from "@xyflow/react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HTTP_METHODS, type SystemEdgeData } from "../types"
import { AreaField, Field, Section, TextField } from "./fields"

const NO_METHOD = "__none__"

export function EdgeInspector({ edge }: { edge: Edge }) {
  const { updateEdgeData } = useReactFlow()
  const data = (edge.data ?? {}) as SystemEdgeData
  const patch = (next: Record<string, unknown>) => updateEdgeData(edge.id, next)

  return (
    <div className="flex flex-col gap-6">
      <Section>
        <TextField
          label="Label"
          value={data.label ?? ""}
          placeholder="fetchProject"
          hint="Shown on the edge — keep it short."
          onCommit={(label) => patch({ label })}
        />

        <Field label="Method">
          <Select
            value={data.method || NO_METHOD}
            onValueChange={(value) => patch({ method: value === NO_METHOD ? "" : value })}
          >
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_METHOD}>None</SelectItem>
              {HTTP_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <TextField
          label="Endpoint"
          value={data.endpoint ?? ""}
          placeholder="/api/projects/:id"
          mono
          onCommit={(endpoint) => patch({ endpoint })}
        />
      </Section>

      <Section title="Contract">
        <AreaField
          label="Request"
          value={data.request ?? ""}
          placeholder='{"projectId": "abc"}'
          mono
          onCommit={(request) => patch({ request })}
        />
        <AreaField
          label="Response"
          value={data.response ?? ""}
          placeholder='{"id": "abc", "name": "…"}'
          mono
          onCommit={(response) => patch({ response })}
        />
      </Section>

      <Section title="Notes">
        <AreaField
          label="Detail"
          value={data.notes ?? ""}
          rows={4}
          placeholder="When this fires, who calls it, retry behaviour…"
          onCommit={(notes) => patch({ notes })}
        />
      </Section>
    </div>
  )
}
