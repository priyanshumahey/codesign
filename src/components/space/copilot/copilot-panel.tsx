import {
  ArrowClockwise,
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretRight,
  ChatCircleDots,
  Check,
  CircleNotch,
  DotsSixVertical,
  PaperPlaneRight,
  Plus,
  ShieldCheck,
  Sparkle,
  Stack,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AiStatus, ConversationSummary } from "@/lib/ai"
import { Markdown } from "./markdown"
import type { DiagramChange } from "./document-diff"
import type { ChangeProposal, ChatMessage, SendOptions } from "./use-copilot"
import { useCopilotPanel } from "./use-copilot-panel"

const REVIEW_KEY = "codesign.copilot.review"

const SUGGESTIONS = [
  "Sketch a three-tier web app",
  "Add a Redis cache in front of the database",
  "Group the backend services into a VPC boundary",
]

export type CopilotContextItem = {
  id: string
  label: string
  kind: string
  detail?: string
}

export type CopilotPanelProps = {
  messages: ChatMessage[]
  busy: boolean
  context: CopilotContextItem[]
  status: AiStatus | null
  models: string[]
  conversations: ConversationSummary[]
  conversationId: string
  onSend: (text: string, options?: SendOptions) => void
  onApplyProposal: (messageId: string) => void
  onDismissProposal: (messageId: string) => void
  onClearContext: () => void
  onUndo: () => void
  onClose: () => void
  onModelChange: (model: string) => void
  onNewConversation: () => void
  onOpenConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}

export function CopilotPanel(props: CopilotPanelProps) {
  const panel = useCopilotPanel()

  if (panel.mode === "floating") {
    return (
      <div
        role="dialog"
        aria-label="Copilot"
        style={{
          left: panel.rect.x,
          top: panel.rect.y,
          width: panel.rect.width,
          height: panel.rect.height,
        }}
        className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background shadow-[0_18px_60px_-24px_rgba(0,0,0,0.42)]"
      >
        <PanelBody {...props} panel={panel} />
        <div
          onPointerDown={panel.startResize}
          aria-hidden
          className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none"
        />
      </div>
    )
  }

  return (
    <aside
      style={{ width: panel.dockedWidth }}
      className="relative flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-border/70 bg-background"
    >
      <div
        role="separator"
        aria-label="Resize copilot"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          const move = (moved: PointerEvent) => panel.resizeDock(moved.clientX)
          const stop = () => {
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", stop)
            document.body.style.userSelect = ""
          }
          document.body.style.userSelect = "none"
          window.addEventListener("pointermove", move)
          window.addEventListener("pointerup", stop)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") panel.nudgeDock(24)
          if (event.key === "ArrowRight") panel.nudgeDock(-24)
        }}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:outline-none"
      />
      <PanelBody {...props} panel={panel} />
    </aside>
  )
}

function PanelBody({
  messages,
  busy,
  context,
  status,
  models,
  conversations,
  conversationId,
  onSend,
  onApplyProposal,
  onDismissProposal,
  onClearContext,
  onUndo,
  onClose,
  onModelChange,
  onNewConversation,
  onOpenConversation,
  onDeleteConversation,
  panel,
}: CopilotPanelProps & { panel: ReturnType<typeof useCopilotPanel> }) {
  const [draft, setDraft] = useState("")
  const [reviewChanges, setReviewChanges] = useState(
    () => localStorage.getItem(REVIEW_KEY) === "true"
  )
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const floating = panel.mode === "floating"

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  useEffect(() => {
    localStorage.setItem(REVIEW_KEY, String(reviewChanges))
  }, [reviewChanges])

  const submit = useCallback(() => {
    if (busy || !draft.trim()) return
    onSend(draft, { review: reviewChanges })
    setDraft("")
  }, [busy, draft, onSend, reviewChanges])

  return (
    <>
      <header
        onPointerDown={floating ? panel.startMove : undefined}
        className={cn(
          "flex h-11 items-center gap-2 border-b border-border/70 px-3",
          floating && "cursor-grab touch-none active:cursor-grabbing"
        )}
      >
        {floating ? (
          <DotsSixVertical className="size-4 shrink-0 text-muted-foreground/60" />
        ) : (
          <Sparkle className="size-4 shrink-0 text-muted-foreground" weight="fill" />
        )}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-none">
            Copilot
          </span>
          <span className="mt-1 block text-[10px] leading-none text-muted-foreground">
            Canvas agent
          </span>
        </div>

        {/* Controls sit on the drag handle, so stop them starting a drag. */}
        <div
          className="flex shrink-0 items-center gap-0.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Conversations"
                aria-label="Conversations"
                className="text-muted-foreground hover:text-foreground"
              >
                <ChatCircleDots />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={onNewConversation} disabled={busy}>
                <Plus />
                New chat
              </DropdownMenuItem>

              {conversations.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Recent</DropdownMenuLabel>
                  {conversations.map((conversation) => (
                    <DropdownMenuItem
                      key={conversation.id}
                      disabled={busy}
                      onSelect={() => onOpenConversation(conversation.id)}
                      className="group items-start gap-1.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{conversation.title}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {conversation.turns} message
                          {conversation.turns === 1 ? "" : "s"} ·{" "}
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </span>
                      {conversation.id === conversationId && (
                        <Check className="mt-0.5 size-3 shrink-0" />
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${conversation.title}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onDeleteConversation(conversation.id)
                        }}
                        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      >
                        <Trash className="size-3" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-sm"
            title={floating ? "Dock to the side" : "Pop out"}
            aria-label={floating ? "Dock to the side" : "Pop out"}
            onClick={floating ? panel.dock : panel.popOut}
            className="text-muted-foreground hover:text-foreground"
          >
            {floating ? <ArrowsInSimple /> : <ArrowsOutSimple />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close copilot"
            aria-label="Close copilot"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X />
          </Button>
        </div>
      </header>

      {status && !status.ready && (
        <p
          role="alert"
          className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] leading-relaxed text-destructive"
        >
          {status.detail}
        </p>
      )}

      <ScrollArea
        className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden"
        viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0 [&>div]:!max-w-full"
      >
        <div className="flex w-full min-w-0 max-w-full flex-col gap-4 p-4">
          {messages.length === 0 && (
            <div className="flex flex-col pt-3">
              <span className="mb-4 grid size-9 place-items-center rounded-lg border border-border/80 bg-muted/35 text-foreground shadow-sm">
                <Sparkle className="size-4" weight="fill" />
              </span>
              <p className="text-[14px] font-medium">What should we design?</p>
              <p className="mt-1 max-w-[32rem] text-[12px] leading-relaxed text-muted-foreground">
                Describe a system or ask for a change. Copilot works directly on the
                canvas and keeps the whole turn undoable.
              </p>
              <div className="mt-5 border-t border-border/60 pt-2">
                <p className="px-1 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  Try a prompt
                </p>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSend(suggestion, { review: reviewChanges })}
                    disabled={busy}
                    className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
                  >
                    <CaretRight className="size-3 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
                    <span className="min-w-0 flex-1">{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <Bubble
              key={message.id}
              message={message}
              onUndo={onUndo}
              onRetry={(tool) =>
                onSend(retryPrompt(tool), { review: reviewChanges })
              }
              onApplyProposal={() => onApplyProposal(message.id)}
              onDismissProposal={() => onDismissProposal(message.id)}
              onFollowUp={(prompt) => onSend(prompt)}
              canUndo={Boolean(message.changed && index === messages.length - 1)}
              live={busy && index === messages.length - 1}
            />
          ))}

          {busy && <ThinkingState />}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border/70 bg-background p-2.5">
        {context.length > 0 && (
          <ContextCards items={context} onClear={onClearContext} />
        )}
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_-18px_rgba(0,0,0,0.5)] transition-colors focus-within:border-foreground/25">
          <textarea
            ref={inputRef}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="Add a queue between the API and the worker…"
            className="block min-h-0 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/65"
          />
          <div className="flex h-9 items-center gap-1 px-1.5 pb-1.5">
            <Sparkle className="ml-1 size-3.5 text-muted-foreground/60" />
            <select
              aria-label="Model"
              value={status?.model ?? ""}
              disabled={busy || !status}
              onChange={(event) => onModelChange(event.target.value)}
              className="min-w-0 flex-1 truncate bg-transparent px-1 py-1 text-[11px] text-muted-foreground outline-none hover:text-foreground disabled:opacity-50"
            >
              {(models.length > 0 ? models : [status?.model ?? ""]).map((model) => (
                <option key={model} value={model}>
                  {model.replace(/^gemini-/, "")}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={reviewChanges}
              title="Review changes before applying"
              onClick={() => setReviewChanges((value) => !value)}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[9px] font-medium transition-colors",
                reviewChanges
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <ShieldCheck className="size-3" weight={reviewChanges ? "fill" : "regular"} />
              Review
            </button>
            <Button
              size="icon"
              className="size-7 shrink-0 rounded-lg"
              aria-label="Send"
              disabled={busy || !draft.trim()}
              onClick={submit}
            >
              <PaperPlaneRight className="size-3.5" weight="bold" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function ContextCards({
  items,
  onClear,
}: {
  items: CopilotContextItem[]
  onClear: () => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border/70 bg-muted/25">
      <div className="flex h-8 items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left"
        >
          <Stack className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[10px] font-medium text-foreground/80">Canvas context</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {items.length} selected
          </span>
          <CaretRight
            className={cn(
              "ml-auto size-3 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
            weight="bold"
          />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear canvas context"
          title="Clear canvas context"
          className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>

      {open && (
        <ul className="border-t border-border/50 bg-background/55 px-1.5 py-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="codesign-fade-up flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-muted/40 font-mono text-[9px] font-medium uppercase text-muted-foreground">
                {item.kind.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-medium text-foreground/85">
                  {item.label}
                </span>
                <span className="block truncate text-[9px] text-muted-foreground">
                  {item.detail ? `${item.kind} · ${item.detail}` : item.kind}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Bubble({
  message,
  onUndo,
  onRetry,
  onApplyProposal,
  onDismissProposal,
  onFollowUp,
  canUndo,
  live,
}: {
  message: ChatMessage
  onUndo: () => void
  onRetry: (tool: ChatMessage["tools"][number]) => void
  onApplyProposal: () => void
  onDismissProposal: () => void
  onFollowUp: (prompt: string) => void
  canUndo: boolean
  live: boolean
}) {
  if (message.role === "user") {
    return (
      <p className="codesign-fade-up max-w-[88%] self-end rounded-xl rounded-br-sm bg-muted px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap">
        {message.text}
      </p>
    )
  }

  return (
    <div className="codesign-fade-up flex w-full min-w-0 max-w-full flex-col gap-2.5 overflow-hidden">
      {message.tools.length > 0 && (
        <ToolTrace tools={message.tools} live={live} onRetry={onRetry} />
      )}

      {message.text && <Markdown streaming={live}>{message.text}</Markdown>}

      {message.error && (
        <p role="alert" className="text-[11px] leading-relaxed text-destructive">
          {message.error}
        </p>
      )}

      {message.proposal && message.proposal.status !== "applied" && (
        <ProposalCard
          proposal={message.proposal}
          onApply={onApplyProposal}
          onDismiss={onDismissProposal}
        />
      )}

      {message.changes && message.changes.length > 0 && (
        <ChangeReview
          changes={message.changes}
          onUndo={canUndo ? onUndo : undefined}
        />
      )}

      {!live && (message.usage || message.durationMs) && (
        <TurnInsights usage={message.usage} durationMs={message.durationMs} />
      )}

      {canUndo && message.changes && message.changes.length > 0 && (
        <FollowUpRecommendation
          changes={message.changes}
          onRun={onFollowUp}
        />
      )}

      {canUndo && (!message.changes || message.changes.length === 0) && (
        <button
          type="button"
          onClick={onUndo}
          className="self-start rounded-md border border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Undo these changes
        </button>
      )}
    </div>
  )
}

type FollowUpOption = {
  key: string
  label: string
  title: string
  description: string
  prompt: string
}

function followUpOptions(changes: DiagramChange[]): FollowUpOption[] {
  const options: FollowUpOption[] = []
  const addedNodes = changes.filter(
    (change) => change.target === "node" && change.action === "added"
  ).length
  const changedEdges = changes.filter((change) => change.target === "edge").length
  const removals = changes.filter((change) => change.action === "removed").length

  if (changedEdges > 0) {
    options.push({
      key: "contracts",
      label: "Connection review",
      title: "Review the changed connections",
      description: `Check ${changedEdges} changed connection${changedEdges === 1 ? "" : "s"} for protocols, data contracts, and failure paths.`,
      prompt:
        "Review the connections changed in the last update. Check protocols, data contracts, retries, and failure paths. Explain findings only; do not change the diagram.",
    })
  }

  if (addedNodes > 0) {
    options.push({
      key: "resilience",
      label: "Resilience review",
      title: "Stress-test the new components",
      description: `Inspect ${addedNodes} added component${addedNodes === 1 ? "" : "s"} for availability, scaling, and recovery gaps.`,
      prompt:
        "Review the components added in the last update for availability, scaling, backpressure, and recovery gaps. Explain findings only; do not change the diagram.",
    })
  }

  if (removals > 0) {
    options.push({
      key: "impact",
      label: "Impact review",
      title: "Check removal impact",
      description: `Verify that ${removals} removal${removals === 1 ? "" : "s"} left no orphaned dependencies or missing flows.`,
      prompt:
        "Review the removals from the last update for orphaned dependencies, missing flows, and downstream impact. Explain findings only; do not change the diagram.",
    })
  }

  options.push(
    {
      key: "security",
      label: "Security review",
      title: "Inspect trust boundaries",
      description: "Look for missing controls, exposed data paths, and unclear ownership around the update.",
      prompt:
        "Review the last update for trust-boundary, authentication, authorization, and sensitive-data risks. Explain findings only; do not change the diagram.",
    },
    {
      key: "explain",
      label: "Change summary",
      title: "Explain the updated design",
      description: "Summarize what changed, why it matters, and how the updated path works end to end.",
      prompt:
        "Explain the last diagram update, why each change matters, and how the affected flow now works end to end. Do not change the diagram.",
    }
  )

  return options
}

function FollowUpRecommendation({
  changes,
  onRun,
}: {
  changes: DiagramChange[]
  onRun: (prompt: string) => void
}) {
  const options = followUpOptions(changes)
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)
  const active = options[selected] ?? options[0]!

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
      <div className="px-3 py-2.5">
        <span className="text-[10px] font-semibold text-foreground/85">
          Continue with a focused review?
        </span>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">{active.title}.</span>{" "}
          {active.description}
        </p>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-200"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/50 bg-muted/25 p-1.5">
            <p className="px-1.5 pb-1 text-[9px] font-medium text-muted-foreground">
              Other reviews
            </p>
            {options.map((option, index) =>
              index === selected ? null : (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelected(index)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-background"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-[5px] border border-border/70 bg-background">
                    <Sparkle className="size-2.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/80">
                    {option.title}
                  </span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {option.label}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="flex h-10 items-center justify-between gap-2 border-t border-border/50 bg-muted/15 px-2.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Sparkle className="size-3 shrink-0 text-muted-foreground" weight="fill" />
          <span className="truncate text-[9px] font-medium text-muted-foreground">
            {active.label}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="h-7 rounded-md px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Alternatives
          </button>
          <button
            type="button"
            onClick={() => onRun(active.prompt)}
            className="h-7 rounded-md bg-foreground px-2.5 text-[10px] font-medium text-background transition-opacity hover:opacity-85"
          >
            Run review
          </button>
        </span>
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  onApply,
  onDismiss,
}: {
  proposal: ChangeProposal
  onApply: () => void
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(true)
  const pending = proposal.status === "pending"
  const counts = proposal.changes.reduce(
    (current, change) => ({
      ...current,
      [change.action]: current[change.action] + 1,
    }),
    { added: 0, updated: 0, removed: 0 }
  )

  if (proposal.status === "dismissed") {
    return (
      <div className="flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 text-[10px] text-muted-foreground">
        <X className="size-3" />
        Proposal dismissed
      </div>
    )
  }

  if (proposal.status === "stale") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
        <div className="flex items-start gap-2">
          <WarningCircle className="mt-px size-3.5 shrink-0 text-amber-700 dark:text-amber-300" weight="fill" />
          <span>
            <span className="block text-[10px] font-medium text-foreground/85">
              Proposal needs a refresh
            </span>
            <span className="mt-0.5 block text-[9px] leading-relaxed text-muted-foreground">
              The canvas changed after this proposal was created, so it was not applied.
            </span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-foreground/15 bg-background shadow-[0_8px_24px_-20px_rgba(0,0,0,0.5)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2.5 px-2.5 text-left"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground text-background">
          <ShieldCheck className="size-3.5" weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-foreground/90">
            Review proposed changes
          </span>
          <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">
            +{counts.added} &nbsp;~{counts.updated} &nbsp;-{counts.removed}
          </span>
        </span>
        <CaretRight
          className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-90")}
          weight="bold"
        />
      </button>

      {open && (
        <>
          <ul className="max-h-48 overflow-y-auto border-t border-border/50 bg-muted/15">
            {proposal.changes.map((change) => {
              const style = CHANGE_STYLE[change.action]
              return (
                <li
                  key={`${change.target}-${change.id}`}
                  className="codesign-fade-up flex items-center gap-2 border-b border-border/40 px-2.5 py-2 last:border-b-0"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[5px] font-mono text-[10px] font-semibold",
                      style.tone
                    )}
                  >
                    {style.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-medium text-foreground/85">
                      {change.label}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {style.label} {change.target} · {change.detail}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex h-11 items-center justify-end gap-1.5 border-t border-border/50 px-2">
            <button
              type="button"
              disabled={!pending}
              onClick={onDismiss}
              className="h-7 rounded-md px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={!pending}
              onClick={onApply}
              className="h-7 rounded-md bg-foreground px-2.5 text-[10px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              Apply {proposal.changes.length} change
              {proposal.changes.length === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const CHANGE_STYLE: Record<
  DiagramChange["action"],
  { symbol: string; label: string; tone: string }
> = {
  added: {
    symbol: "+",
    label: "Added",
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  updated: {
    symbol: "~",
    label: "Updated",
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  removed: {
    symbol: "-",
    label: "Removed",
    tone: "bg-destructive/10 text-destructive",
  },
}

function ChangeReview({
  changes,
  onUndo,
}: {
  changes: DiagramChange[]
  onUndo?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reverted, setReverted] = useState(false)
  const counts = changes.reduce(
    (current, change) => ({
      ...current,
      [change.action]: current[change.action] + 1,
    }),
    { added: 0, updated: 0, removed: 0 }
  )

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 px-2.5 text-left"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/70 bg-background">
          <Check className="size-3" weight="bold" />
        </span>
        <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground/85">
          {changes.length} diagram change{changes.length === 1 ? "" : "s"}
        </span>
        {counts.added > 0 && (
          <span className="font-mono text-[9px] text-emerald-700 dark:text-emerald-300">
            +{counts.added}
          </span>
        )}
        {counts.updated > 0 && (
          <span className="font-mono text-[9px] text-amber-700 dark:text-amber-300">
            ~{counts.updated}
          </span>
        )}
        {counts.removed > 0 && (
          <span className="font-mono text-[9px] text-destructive">-{counts.removed}</span>
        )}
        <CaretRight
          className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          weight="bold"
        />
      </button>

      {open && (
        <>
          <ul className="max-h-52 overflow-y-auto border-t border-border/50 bg-background/60">
            {changes.map((change) => {
              const style = CHANGE_STYLE[change.action]
              return (
                <li
                  key={`${change.target}-${change.id}`}
                  className="codesign-fade-up flex items-center gap-2 border-b border-border/40 px-2.5 py-2 last:border-b-0"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-[5px] font-mono text-[10px] font-semibold",
                      style.tone
                    )}
                  >
                    {style.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-medium text-foreground/85">
                      {change.label}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {style.label} {change.target} · {change.detail}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex h-9 items-center justify-between border-t border-border/50 px-2.5">
            <span className="text-[9px] font-medium text-muted-foreground">
              {reverted ? "Changes reverted" : "Applied to canvas"}
            </span>
            {onUndo && !reverted && (
              <button
                type="button"
                onClick={() => {
                  onUndo()
                  setReverted(true)
                }}
                className="rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Undo all
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function compactNumber(value: number) {
  if (value < 1_000) return String(value)
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

function TurnInsights({
  usage,
  durationMs,
}: {
  usage?: { input: number; output: number }
  durationMs?: number
}) {
  const metrics = [
    ...(durationMs != null
      ? [{ label: "Time", value: `${(durationMs / 1_000).toFixed(1)}s` }]
      : []),
    ...(usage
      ? [
          { label: "Input", value: compactNumber(usage.input) },
          { label: "Output", value: compactNumber(usage.output) },
        ]
      : []),
  ]

  return (
    <dl className="grid grid-flow-col auto-cols-fr overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="border-r border-border/50 px-2.5 py-2 last:border-r-0"
        >
          <dt className="text-[9px] font-medium uppercase text-muted-foreground/65">
            {metric.label}
          </dt>
          <dd className="mt-0.5 font-mono text-[10px] tabular-nums text-foreground/75">
            {metric.value}
            {metric.label !== "Time" && (
              <span className="ml-1 text-[8px] text-muted-foreground/55">tokens</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Open while the turn runs so there is live progress, then folded away. */
function ToolTrace({
  tools,
  live,
  onRetry,
}: {
  tools: ChatMessage["tools"]
  live: boolean
  onRetry: (tool: ChatMessage["tools"][number]) => void
}) {
  const [open, setOpen] = useState(live)
  const wasLive = useRef(live)
  const failed = tools.filter((tool) => toolStatus(tool) === "failed").length
  const running = tools.filter((tool) => toolStatus(tool) === "running").length

  useEffect(() => {
    if (wasLive.current && !live) setOpen(failed > 0)
    if (!wasLive.current && live) setOpen(true)
    wasLive.current = live
  }, [failed, live])

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-md border border-border/70 bg-background">
          {running > 0 ? (
            <CircleNotch className="size-3 animate-spin" />
          ) : (
            <Sparkle className="size-3" weight="fill" />
          )}
        </span>
        <span className="min-w-0 max-w-[45%] truncate font-medium text-foreground/80">
          {running > 0
            ? `${running} active`
            : `${tools.length} task${tools.length === 1 ? "" : "s"}`}
        </span>
        {failed > 0 ? (
          <span className="min-w-0 flex-1 truncate text-destructive">
            {failed} failed
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground/75">
            {running > 0 ? toolLabel(tools[tools.length - 1]?.name) : "Completed"}
          </span>
        )}
        <CaretRight
          className={cn("ml-auto size-3 shrink-0 transition-transform", open && "rotate-90")}
          weight="bold"
        />
      </button>

      {open && (
        <ul className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border/70 bg-muted/20">
          {tools.map((tool, index) => (
            <ToolTaskRow
              key={`${tool.name}-${index}`}
              tool={tool}
              onRetry={() => onRetry(tool)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const TOOL_LABELS: Record<string, string> = {
  search_icons: "Find matching icons",
  create_service: "Add service",
  create_boundary: "Add boundary",
  create_note: "Add note",
  update_node: "Update component",
  move_node: "Move component",
  resize_node: "Resize component",
  set_parent: "Change grouping",
  connect: "Connect components",
  update_edge: "Update connection",
  delete: "Remove component",
  auto_layout: "Tidy diagram",
}

function toolLabel(name?: string) {
  if (!name) return "Working"
  return (
    TOOL_LABELS[name] ??
    name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  )
}

function toolStatus(tool: ChatMessage["tools"][number]) {
  return tool.status ?? (tool.ok ? "completed" : "failed")
}

function toolValue(value: unknown) {
  const formatted =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value)
  if (!formatted) return "—"
  return formatted.length > 120 ? `${formatted.slice(0, 117)}…` : formatted
}

function retryPrompt(tool: ChatMessage["tools"][number]) {
  const args = tool.args ? ` with these inputs: ${JSON.stringify(tool.args)}` : ""
  return `Retry the failed ${tool.name} step${args}. The previous error was: ${tool.message}. Use the current canvas state and adjust the approach if needed.`
}

function ToolTaskRow({
  tool,
  onRetry,
}: {
  tool: ChatMessage["tools"][number]
  onRetry: () => void
}) {
  const status = toolStatus(tool)
  const [open, setOpen] = useState(status === "failed")
  const details = Object.entries(tool.args ?? {})
  const hasDetails = details.length > 0 || (status !== "running" && Boolean(tool.message))

  useEffect(() => {
    if (status === "failed") setOpen(true)
  }, [status])

  return (
    <li
      className={cn(
        "codesign-fade-up border-b border-border/50 text-[11px] last:border-b-0",
        status === "failed" && "text-destructive"
      )}
    >
      <button
        type="button"
        disabled={!hasDetails}
        aria-expanded={hasDetails ? open : undefined}
        onClick={() => hasDetails && setOpen((value) => !value)}
        className="group flex w-full items-center gap-2.5 px-2.5 py-2 text-left disabled:cursor-default"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full border bg-background",
            status === "failed" ? "border-destructive/35" : "border-border/80"
          )}
        >
          {status === "running" ? (
            <CircleNotch className="size-2.5 animate-spin" />
          ) : status === "completed" ? (
            <Check className="size-2.5" weight="bold" />
          ) : (
            <WarningCircle className="size-2.5" weight="fill" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground/85">
            {toolLabel(tool.name)}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {status === "running" ? "In progress" : tool.message}
          </span>
        </span>
        <span className="font-mono text-[9px] uppercase text-muted-foreground/60">
          {status === "completed" ? "done" : status}
        </span>
        {hasDetails && (
          <CaretRight
            className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
            weight="bold"
          />
        )}
      </button>

      {open && hasDetails && (
        <div className="border-t border-border/40 bg-background/60 px-3 py-2.5">
          {details.length > 0 && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              {details.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-[9px] text-muted-foreground/70">{key}</dt>
                  <dd className="min-w-0 break-words font-mono text-[9px] leading-relaxed text-foreground/70">
                    {toolValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {status !== "running" && (
            <p
              className={cn(
                "leading-relaxed",
                details.length > 0 && "mt-2 border-t border-border/40 pt-2"
              )}
            >
              {tool.message}
            </p>
          )}
          {status === "failed" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 flex h-7 items-center gap-1.5 rounded-md border border-destructive/20 bg-background px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/5"
            >
              <ArrowClockwise className="size-3" weight="bold" />
              Retry step
            </button>
          )}
        </div>
      )}
    </li>
  )
}

const THINKING_DELAYS = [90, 180, 270, 0, 90, 180, 90, 180, 270]

function ThinkingState() {
  const [deciseconds, setDeciseconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setDeciseconds((value) => value + 1), 100)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div role="status" className="codesign-fade-up flex items-center gap-2.5 px-1 py-1">
      <span aria-hidden className="grid shrink-0 grid-cols-3 gap-[1.5px]">
        {THINKING_DELAYS.map((delay, index) => (
          <span
            key={index}
            className="codesign-loader-cell size-1 rounded-[1px] bg-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="codesign-shimmer text-[11px] font-medium">Thinking</span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
        {(deciseconds / 10).toFixed(1)}s
      </span>
    </div>
  )
}
