import { Check, Copy, PlugsConnected, WarningCircle } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { mcpConfig, type McpConfig } from "@/lib/ops"
import { errorMessage, type SpaceFile } from "@/lib/spaces"

export function ConnectAgentDialog({
  space,
  open,
  onOpenChange,
}: {
  space: SpaceFile
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [config, setConfig] = useState<McpConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setCopied(false)
    setError(null)
    // The path changes on rename, so ask each time it opens.
    mcpConfig(space.path, space.name)
      .then(setConfig)
      .catch((cause) => setError(errorMessage(cause)))
  }, [open, space.path, space.name])

  const copy = async () => {
    if (!config) return
    try {
      await navigator.clipboard.writeText(config.json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogDescription>
            Add this to Claude Desktop, Cursor or any MCP client. The agent can read
            and edit <span className="font-medium text-foreground">{space.name}</span>,
            and nothing else. Its changes land on the canvas within a couple of
            seconds, and undo with ⌘Z.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        )}

        {config && !config.ready && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            <WarningCircle className="mt-px size-3.5 shrink-0" weight="fill" />
            <span className="min-w-0 break-words">{config.hint}</span>
          </p>
        )}

        {/* min-w-0 keeps long absolute paths from stretching the dialog grid. */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <code className="min-w-0 truncate text-[11px] text-muted-foreground">
              {config?.serverName}
            </code>
            <Button
              size="sm"
              variant={copied ? "secondary" : "default"}
              onClick={copy}
              disabled={!config}
              className="h-7 shrink-0 gap-1.5"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <pre className="max-h-56 min-w-0 overflow-y-auto rounded-xl border border-border/70 bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
            <code>{config?.json ?? "…"}</code>
          </pre>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The agent gets <Tool>get_space</Tool>, <Tool>edit_space</Tool> and{" "}
          <Tool>search_icons</Tool>. Edits are all-or-nothing, so a bad instruction
          leaves the diagram untouched.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function Tool({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-px text-[10px] text-foreground/80">
      {children}
    </code>
  )
}

export function ConnectAgentButton({ space }: { space: SpaceFile }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Connect an agent over MCP"
        aria-label="Connect an agent over MCP"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <PlugsConnected />
      </Button>
      <ConnectAgentDialog space={space} open={open} onOpenChange={setOpen} />
    </>
  )
}
