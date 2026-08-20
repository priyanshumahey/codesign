import { Moon, Sun } from "@phosphor-icons/react"
import { LogicalPosition, getCurrentWindow } from "@tauri-apps/api/window"
import { useRef } from "react"

import { CodesignMark } from "@/components/codesign-mark"
import { Button } from "@/components/ui/button"

/**
 * The window is moved by absolute position rather than `startDragging`, whose
 * synthesized mouse event cannot hand the window off to another display.
 */
function useWindowDrag() {
  const drag = useRef<{ origin: LogicalPosition; screenX: number; screenY: number } | null>(
    null
  )
  const frame = useRef(0)

  const stop = (event: React.PointerEvent<HTMLElement>) => {
    drag.current = null
    cancelAnimationFrame(frame.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as Element).closest("button")) return
      const { screenX, screenY } = event
      event.currentTarget.setPointerCapture(event.pointerId)
      void (async () => {
        const window = getCurrentWindow()
        const origin = (await window.outerPosition()).toLogical(await window.scaleFactor())
        drag.current = { origin, screenX, screenY }
      })()
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const active = drag.current
      if (!active) return
      const x = active.origin.x + (event.screenX - active.screenX)
      const y = active.origin.y + (event.screenY - active.screenY)
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => {
        void getCurrentWindow().setPosition(new LogicalPosition(x, y))
      })
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  }
}

export function TitleBar({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark"
  onToggleTheme: () => void
}) {
  const drag = useWindowDrag()

  return (
    <header
      {...drag}
      className="flex h-10 shrink-0 touch-none items-center border-b border-border/70 bg-background px-3 pl-[76px]"
    >
      <div className="pointer-events-none flex min-w-0 select-none items-center gap-2 text-foreground/90">
        <CodesignMark className="size-4" />
        <span className="truncate font-heading text-[12px] font-semibold">Codesign</span>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className="ml-auto text-muted-foreground hover:text-foreground"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </header>
  )
}
