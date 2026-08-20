/** Shared vocabulary for the design canvas. Keep node data JSON-serializable. */

export const SERVICE_NODE_TYPE = "service"
export const BOUNDARY_NODE_TYPE = "boundary"
export const NOTE_NODE_TYPE = "note"
export const SYSTEM_EDGE_TYPE = "system"

/** DataTransfer key used when dragging a palette tile onto the canvas. */
export const ICON_DRAG_MIME = "application/x-codesign-icon"

/** Synthetic ids so container tiles can share the icon drag payload. */
export const CONTAINER_BOUNDARY_ID = "__container__:boundary"
export const CONTAINER_NOTE_ID = "__container__:note"

export type IconEntry = {
  /** Stable id like `generic:network:api-gateway`. */
  id: string
  name: string
  /** Public path, e.g. `/icons/generic/network/api-gateway.svg`. */
  path: string
  category: string
  subcategory?: string
  /** Single-colour art that gets tinted with the current theme colour. */
  mono?: boolean
}

export type IconManifest = {
  generatedAt: string
  count: number
  categories: { id: string; label: string; count: number }[]
  byCategory: Record<string, IconEntry[]>
}

export const SERVICE_NODE_SIZE = { width: 112, height: 96 } as const
export const BOUNDARY_DEFAULT_SIZE = { width: 340, height: 240 } as const
export const NOTE_DEFAULT_SIZE = { width: 200, height: 44 } as const

export type ServiceNodeData = {
  iconId: string
  iconPath: string
  iconCategory: string
  iconMono?: boolean
  label: string
  description?: string
  /** Repo, runbook or dashboard backing this component. */
  link?: string
  /** Team or person accountable for it. */
  owner?: string
  status?: ServiceStatus
  [key: string]: unknown
}

export const SERVICE_STATUSES = ["live", "planned", "degraded", "deprecated"] as const

export type ServiceStatus = (typeof SERVICE_STATUSES)[number]

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  live: "Live",
  planned: "Planned",
  degraded: "Degraded",
  deprecated: "Deprecated",
}

/** Dot colour per status, tuned to read on light and dark. */
export const SERVICE_STATUS_STYLES: Record<ServiceStatus, string> = {
  live: "bg-emerald-500",
  planned: "bg-sky-500",
  degraded: "bg-amber-500",
  deprecated: "bg-rose-500",
}

export function resolveServiceStatus(value: unknown): ServiceStatus | null {
  return SERVICE_STATUSES.find((status) => status === value) ?? null
}

export type BoundaryNodeData = {
  label: string
  color?: BoundaryColor
  [key: string]: unknown
}

export type NoteNodeData = {
  text: string
  variant?: "heading" | "body"
  [key: string]: unknown
}

export type SystemEdgeData = {
  label?: string
  method?: string
  endpoint?: string
  notes?: string
  request?: string
  response?: string
  direction?: EdgeDirection
  /** Where the label rides along the path. Computed per render, never saved. */
  labelStep?: number
  /** Nudge across the run when the path itself has no clear spot. */
  labelShift?: number
  [key: string]: unknown
}

/** Which ends of a connection carry an arrowhead. */
export const EDGE_DIRECTIONS = ["forward", "backward", "both", "none"] as const

export type EdgeDirection = (typeof EDGE_DIRECTIONS)[number]

export const DEFAULT_EDGE_DIRECTION: EdgeDirection = "forward"

export const EDGE_DIRECTION_LABELS: Record<EdgeDirection, string> = {
  forward: "Source → target",
  backward: "Target → source",
  both: "Both ways",
  none: "No arrow",
}

export function resolveEdgeDirection(value: unknown): EdgeDirection {
  return EDGE_DIRECTIONS.find((direction) => direction === value) ?? DEFAULT_EDGE_DIRECTION
}

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "WS",
  "GRPC",
  "EVENT",
  "QUERY",
  "MUTATION",
] as const

export const BOUNDARY_COLORS = [
  "slate",
  "sky",
  "violet",
  "emerald",
  "amber",
  "rose",
] as const

export type BoundaryColor = (typeof BOUNDARY_COLORS)[number]

export const DEFAULT_BOUNDARY_COLOR: BoundaryColor = "slate"

/** Tailwind classes per boundary colour, tuned to read on light and dark. */
export const BOUNDARY_COLOR_STYLES: Record<
  BoundaryColor,
  { fill: string; border: string; borderSelected: string; chip: string }
> = {
  slate: {
    fill: "bg-slate-500/[0.06]",
    border: "border-slate-500/35",
    borderSelected: "border-slate-500/70",
    chip: "text-slate-600 dark:text-slate-300",
  },
  sky: {
    fill: "bg-sky-500/[0.07]",
    border: "border-sky-500/35",
    borderSelected: "border-sky-500/70",
    chip: "text-sky-700 dark:text-sky-300",
  },
  violet: {
    fill: "bg-violet-500/[0.07]",
    border: "border-violet-500/35",
    borderSelected: "border-violet-500/70",
    chip: "text-violet-700 dark:text-violet-300",
  },
  emerald: {
    fill: "bg-emerald-500/[0.07]",
    border: "border-emerald-500/35",
    borderSelected: "border-emerald-500/70",
    chip: "text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    fill: "bg-amber-500/[0.08]",
    border: "border-amber-500/40",
    borderSelected: "border-amber-500/70",
    chip: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    fill: "bg-rose-500/[0.07]",
    border: "border-rose-500/35",
    borderSelected: "border-rose-500/70",
    chip: "text-rose-700 dark:text-rose-300",
  },
}

export function resolveBoundaryColor(value: unknown): BoundaryColor {
  return BOUNDARY_COLORS.find((color) => color === value) ?? DEFAULT_BOUNDARY_COLOR
}
