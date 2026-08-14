/** Shared vocabulary for the design canvas. Keep node data JSON-serializable. */

export const SERVICE_NODE_TYPE = "service"
export const GROUP_NODE_TYPE = "group"
export const NOTE_NODE_TYPE = "note"
export const SYSTEM_EDGE_TYPE = "system"

/** DataTransfer key used when dragging a palette tile onto the canvas. */
export const ICON_DRAG_MIME = "application/x-codesign-icon"

/** Synthetic ids so container tiles can share the icon drag payload. */
export const CONTAINER_GROUP_ID = "__container__:group"
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
export const GROUP_DEFAULT_SIZE = { width: 340, height: 240 } as const
export const NOTE_DEFAULT_SIZE = { width: 200, height: 44 } as const

export type ServiceNodeData = {
  iconId: string
  iconPath: string
  iconCategory: string
  iconMono?: boolean
  label: string
  description?: string
  group?: string
  [key: string]: unknown
}

export type GroupNodeData = {
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
  [key: string]: unknown
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
  return typeof value === "string" &&
    (BOUNDARY_COLORS as readonly string[]).includes(value)
    ? (value as BoundaryColor)
    : DEFAULT_BOUNDARY_COLOR
}
