import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CornersOut,
  GraphIcon,
  Minus,
  Plus,
  SidebarSimple,
} from "@phosphor-icons/react"
import { useReactFlow } from "@xyflow/react"

import { cn } from "@/lib/utils"

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-lg transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export function CanvasToolbar({
  onUndo,
  onRedo,
  onAutoLayout,
  detailsOpen,
  onToggleDetails,
}: {
  onUndo: () => void
  onRedo: () => void
  onAutoLayout: () => void
  detailsOpen: boolean
  onToggleDetails: () => void
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-background/95 p-1 shadow-sm backdrop-blur">
      <ToolbarButton label="Undo" onClick={onUndo}>
        <ArrowCounterClockwise className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={onRedo}>
        <ArrowClockwise className="size-3.5" />
      </ToolbarButton>

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <ToolbarButton label="Tidy layout" onClick={onAutoLayout}>
        <GraphIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Details panel"
        active={detailsOpen}
        onClick={onToggleDetails}
      >
        <SidebarSimple className="size-3.5" />
      </ToolbarButton>

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <ToolbarButton label="Zoom out" onClick={() => zoomOut()}>
        <Minus className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Zoom in" onClick={() => zoomIn()}>
        <Plus className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Fit view"
        onClick={() => fitView({ padding: 0.3, duration: 300 })}
      >
        <CornersOut className="size-3.5" />
      </ToolbarButton>
    </div>
  )
}
