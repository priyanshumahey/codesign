import { useCallback, useEffect, useRef, useState } from "react"

export type PanelMode = "docked" | "floating"

export type FloatingRect = { x: number; y: number; width: number; height: number }

const MODE_KEY = "codesign.copilot.mode"
const RECT_KEY = "codesign.copilot.rect"
const DOCKED_WIDTH_KEY = "codesign.copilot.width"

const MIN_WIDTH = 320
const MAX_WIDTH = 760
const MIN_HEIGHT = 280
const DEFAULT_DOCKED_WIDTH = 384

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function defaultRect(): FloatingRect {
  const width = 420
  const height = Math.min(620, Math.max(MIN_HEIGHT, window.innerHeight - 160))
  return { width, height, x: window.innerWidth - width - 32, y: 88 }
}

/** Keeps the panel reachable after the window is resized or moved. */
function clamp(rect: FloatingRect): FloatingRect {
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), MAX_WIDTH)
  const height = Math.max(rect.height, MIN_HEIGHT)
  return {
    width,
    height: Math.min(height, window.innerHeight - 24),
    // Always leave a grabbable strip of the title bar on screen.
    x: Math.min(Math.max(rect.x, -width + 120), window.innerWidth - 120),
    y: Math.min(Math.max(rect.y, 0), window.innerHeight - 48),
  }
}

export function useCopilotPanel() {
  const [mode, setMode] = useState<PanelMode>(() =>
    read<PanelMode>(MODE_KEY, "docked") === "floating" ? "floating" : "docked"
  )
  const [dockedWidth, setDockedWidth] = useState(() =>
    read<number>(DOCKED_WIDTH_KEY, DEFAULT_DOCKED_WIDTH)
  )
  const [rect, setRect] = useState<FloatingRect>(() =>
    clamp(read<FloatingRect>(RECT_KEY, defaultRect()))
  )

  const drag = useRef<{ kind: "move" | "resize"; dx: number; dy: number } | null>(null)

  useEffect(() => localStorage.setItem(MODE_KEY, JSON.stringify(mode)), [mode])
  useEffect(() => localStorage.setItem(RECT_KEY, JSON.stringify(rect)), [rect])
  useEffect(
    () => localStorage.setItem(DOCKED_WIDTH_KEY, JSON.stringify(dockedWidth)),
    [dockedWidth]
  )

  useEffect(() => {
    const onResize = () => setRect((current) => clamp(current))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = drag.current
      if (!active) return
      event.preventDefault()
      setRect((current) =>
        clamp(
          active.kind === "move"
            ? { ...current, x: event.clientX - active.dx, y: event.clientY - active.dy }
            : {
                ...current,
                width: event.clientX - current.x + active.dx,
                height: event.clientY - current.y + active.dy,
              }
        )
      )
    }
    const stop = () => {
      if (!drag.current) return
      drag.current = null
      document.body.style.userSelect = ""
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])

  const startMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      drag.current = {
        kind: "move",
        dx: event.clientX - rect.x,
        dy: event.clientY - rect.y,
      }
      document.body.style.userSelect = "none"
    },
    [rect.x, rect.y]
  )

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      drag.current = {
        kind: "resize",
        dx: rect.x + rect.width - event.clientX,
        dy: rect.y + rect.height - event.clientY,
      }
      document.body.style.userSelect = "none"
    },
    [rect]
  )

  const popOut = useCallback(() => {
    setRect(clamp(defaultRect()))
    setMode("floating")
  }, [])

  const dock = useCallback(() => setMode("docked"), [])

  const resizeDock = useCallback((clientX: number) => {
    setDockedWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - clientX)))
  }, [])

  const nudgeDock = useCallback((delta: number) => {
    setDockedWidth((current) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, current + delta)))
  }, [])

  return {
    mode,
    rect,
    dockedWidth,
    popOut,
    dock,
    startMove,
    startResize,
    resizeDock,
    nudgeDock,
  }
}
