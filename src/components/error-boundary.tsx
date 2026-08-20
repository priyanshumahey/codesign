import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react"
import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

/**
 * A desktop window has no address bar, so an unhandled render error would
 * otherwise leave a blank app with no way back.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("Codesign crashed", error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid h-full place-items-center bg-background p-8">
        <div className="flex max-w-md flex-col items-start">
          <span className="mb-4 grid size-9 place-items-center rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <WarningCircle className="size-4" weight="fill" />
          </span>
          <p className="text-[14px] font-medium">Codesign hit an unexpected error</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Your spaces are saved to disk, so reloading should pick up where you left
            off.
          </p>
          <pre className="mt-4 max-h-40 w-full overflow-auto rounded-lg border border-border/70 bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {error.message}
          </pre>
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              <ArrowClockwise />
              Reload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
