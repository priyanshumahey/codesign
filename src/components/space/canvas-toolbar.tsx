import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CornersOut,
  GraphIcon,
  Minus,
  Plus,
  Shapes,
  SidebarSimple,
  Sparkle,
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
        "grid size-7 place-items-center rounded-md transition-colors",
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
  paletteOpen,
  onTogglePalette,
  detailsOpen,
  onToggleDetails,
  copilotOpen,
  onToggleCopilot,
}: {
  onUndo: () => void
  onRedo: () => void
  onAutoLayout: () => void
  paletteOpen: boolean
  onTogglePalette: () => void
  detailsOpen: boolean
  onToggleDetails: () => void
  copilotOpen: boolean
  onToggleCopilot: () => void
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_10px_28px_-20px_rgba(0,0,0,0.55)] backdrop-blur">
      <ToolbarButton label="Undo" onClick={onUndo}>
        <ArrowCounterClockwise className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={onRedo}>
        <ArrowClockwise className="size-3.5" />
      </ToolbarButton>

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <ToolbarButton
        label="Component palette (⌘B)"
        active={paletteOpen}
        onClick={onTogglePalette}
      >
        <Shapes className="size-3.5" weight={paletteOpen ? "fill" : "regular"} />
      </ToolbarButton>
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
      <ToolbarButton label="Copilot" active={copilotOpen} onClick={onToggleCopilot}>
        <Sparkle className="size-3.5" weight={copilotOpen ? "fill" : "regular"} />
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
