import { ChatCircleDots, Copy, Question, Sparkle } from "@phosphor-icons/react"

export function SelectionActions({
  count,
  busy,
  onExplain,
  onImprove,
  onCopy,
  onOpenCopilot,
}: {
  count: number
  busy: boolean
  onExplain: () => void
  onImprove: () => void
  onCopy: () => void
  onOpenCopilot: () => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="codesign-fade-up flex h-10 items-center rounded-xl border border-border/80 bg-background/95 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_14px_36px_-18px_rgba(0,0,0,0.5)] backdrop-blur-md"
    >
      <span className="px-2 text-[10px] font-medium text-muted-foreground">
        {count} selected
      </span>
      <span className="mx-0.5 h-5 w-px bg-border/70" aria-hidden />
      <button
        type="button"
        disabled={busy}
        onClick={onExplain}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-45"
      >
        <Question className="size-3.5" />
        Explain
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onImprove}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted disabled:opacity-45"
      >
        <Sparkle className="size-3.5" weight="fill" />
        Improve
      </button>
      <span className="mx-0.5 h-5 w-px bg-border/70" aria-hidden />
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy selection"
        title="Copy selection (⌘C) — paste into any space"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onOpenCopilot}
        aria-label="Open Copilot"
        title="Open Copilot"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChatCircleDots className="size-3.5" />
      </button>
    </div>
  )
}