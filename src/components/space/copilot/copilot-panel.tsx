import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretRight,
  ChatCircleDots,
  Check,
  DotsSixVertical,
  PaperPlaneRight,
  Plus,
  Sparkle,
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
import type { ChatMessage } from "./use-copilot"
import { useCopilotPanel } from "./use-copilot-panel"

const SUGGESTIONS = [
  "Sketch a three-tier web app",
  "Add a Redis cache in front of the database",
  "Group the backend services into a VPC boundary",
]

export type CopilotPanelProps = {
  messages: ChatMessage[]
  busy: boolean
  status: AiStatus | null
  models: string[]
  conversations: ConversationSummary[]
  conversationId: string
  onSend: (text: string) => void
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
        className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl"
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
      className="relative flex min-w-0 shrink-0 flex-col border-l border-border/70 bg-background"
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
  status,
  models,
  conversations,
  conversationId,
  onSend,
  onUndo,
  onClose,
  onModelChange,
  onNewConversation,
  onOpenConversation,
  onDeleteConversation,
  panel,
}: CopilotPanelProps & { panel: ReturnType<typeof useCopilotPanel> }) {
  const [draft, setDraft] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const floating = panel.mode === "floating"

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  const submit = useCallback(() => {
    if (busy || !draft.trim()) return
    onSend(draft)
    setDraft("")
  }, [busy, draft, onSend])

  return (
    <>
      <header
        onPointerDown={floating ? panel.startMove : undefined}
        className={cn(
          "flex items-center gap-1.5 border-b border-border/70 px-2 py-2",
          floating && "cursor-grab touch-none active:cursor-grabbing"
        )}
      >
        {floating ? (
          <DotsSixVertical className="size-4 shrink-0 text-muted-foreground/60" />
        ) : (
          <Sparkle className="size-4 shrink-0 text-muted-foreground" weight="fill" />
        )}
        <span className="shrink-0 text-[13px] font-medium">Copilot</span>

        {/* Controls sit on the drag handle, so stop them starting a drag. */}
        <select
          aria-label="Model"
          value={status?.model ?? ""}
          disabled={busy || !status}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onModelChange(event.target.value)}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent py-0.5 text-[11px] text-muted-foreground outline-none hover:text-foreground disabled:opacity-50"
        >
          {(models.length > 0 ? models : [status?.model ?? ""]).map((model) => (
            <option key={model} value={model}>
              {model.replace(/^gemini-/, "")}
            </option>
          ))}
        </select>

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

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {messages.length === 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Describe what you want on the canvas. The copilot adds nodes, connects
                them and groups them — and the whole reply undoes with one ⌘Z.
              </p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSend(suggestion)}
                  disabled={busy}
                  className="rounded-lg border border-border/70 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {messages.map((message, index) => (
            <Bubble
              key={message.id}
              message={message}
              onUndo={onUndo}
              canUndo={Boolean(message.changed && index === messages.length - 1)}
              live={busy && index === messages.length - 1}
            />
          ))}

          {busy && (
            <span className="px-1 text-[11px] text-muted-foreground">Thinking…</span>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border/70 p-2">
        <div className="flex items-end gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-1.5 focus-within:border-border">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="Add a queue between the API and the worker…"
            className="min-h-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="Send"
            disabled={busy || !draft.trim()}
            onClick={submit}
          >
            <PaperPlaneRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </>
  )
}

function Bubble({
  message,
  onUndo,
  canUndo,
  live,
}: {
  message: ChatMessage
  onUndo: () => void
  canUndo: boolean
  live: boolean
}) {
  if (message.role === "user") {
    return (
      <p className="self-end rounded-xl rounded-br-sm bg-muted px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap">
        {message.text}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {message.tools.length > 0 && <ToolTrace tools={message.tools} live={live} />}

      {message.text && <Markdown>{message.text}</Markdown>}

      {message.error && (
        <p role="alert" className="text-[11px] leading-relaxed text-destructive">
          {message.error}
        </p>
      )}

      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="self-start text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Undo these changes
        </button>
      )}
    </div>
  )
}

/** Open while the turn runs so there is live progress, then folded away. */
function ToolTrace({
  tools,
  live,
}: {
  tools: ChatMessage["tools"]
  live: boolean
}) {
  const [open, setOpen] = useState(live)
  const wasLive = useRef(live)

  useEffect(() => {
    if (wasLive.current && !live) setOpen(false)
    if (!wasLive.current && live) setOpen(true)
    wasLive.current = live
  }, [live])

  const failed = tools.filter((tool) => !tool.ok).length

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 self-start rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <CaretRight
          className={cn("size-3 transition-transform", open && "rotate-90")}
          weight="bold"
        />
        {tools.length} step{tools.length === 1 ? "" : "s"}
        {failed > 0 && (
          <span className="text-destructive">
            · {failed} failed
          </span>
        )}
        {!open && live && (
          <span className="min-w-0 truncate text-muted-foreground/80">
            · {tools[tools.length - 1]?.message}
          </span>
        )}
      </button>

      {open && (
        <ul className="flex flex-col gap-0.5 border-l border-border/70 pl-2">
          {tools.map((tool, index) => (
            <li
              key={`${tool.name}-${index}`}
              className={cn(
                "flex items-start gap-1.5 text-[11px]",
                tool.ok ? "text-muted-foreground" : "text-destructive"
              )}
            >
              {tool.ok ? (
                <Check className="mt-px size-3 shrink-0" />
              ) : (
                <WarningCircle className="mt-px size-3 shrink-0" />
              )}
              <span className="min-w-0 flex-1 leading-relaxed">{tool.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
