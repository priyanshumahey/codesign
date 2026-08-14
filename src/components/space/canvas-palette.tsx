import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react"
import { useDeferredValue, useEffect, useMemo, useState, type DragEvent } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { setPendingIconDrag } from "./drag-payload"
import { IconGraphic } from "./icon-graphic"
import { loadIconManifest } from "./icon-manifest"
import {
  CONTAINER_GROUP_ID,
  CONTAINER_NOTE_ID,
  ICON_DRAG_MIME,
  type IconEntry,
  type IconManifest,
} from "./types"

function startIconDrag(event: DragEvent<HTMLDivElement>, entry: IconEntry) {
  setPendingIconDrag(entry)
  event.dataTransfer.setData(ICON_DRAG_MIME, JSON.stringify(entry))
  event.dataTransfer.setData("text/plain", entry.name)
  event.dataTransfer.effectAllowed = "copy"
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <CaretRight
          className={cn(
            "size-3 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="flex-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">{count}</span>
      </button>
      {open && <div className="px-2 pb-3">{children}</div>}
    </div>
  )
}

function Tile({
  entry,
  preview,
  onAdd,
}: {
  entry: IconEntry
  preview: React.ReactNode
  onAdd: (entry: IconEntry) => void
}) {
  return (
    <div
      draggable
      onDragStart={(event) => startIconDrag(event, entry)}
      onDragEnd={() => setPendingIconDrag(null)}
      onDoubleClick={() => onAdd(entry)}
      title={entry.name}
      className="group/tile flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-transparent px-1 py-2 transition-colors hover:border-border/70 hover:bg-muted/60 active:cursor-grabbing"
    >
      <span className="grid size-8 place-items-center transition-transform duration-150 group-hover/tile:scale-110">
        {preview}
      </span>
      <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground group-hover/tile:text-foreground">
        {entry.name}
      </span>
    </div>
  )
}

const CONTAINERS_SECTION = "__containers__"

const CONTAINERS: { entry: IconEntry; preview: React.ReactNode }[] = [
  {
    entry: { id: CONTAINER_GROUP_ID, name: "Boundary", path: "", category: "generic" },
    preview: <span className="size-5 rounded-md border-2 border-dashed border-foreground/45" />,
  },
  {
    entry: { id: CONTAINER_NOTE_ID, name: "Note", path: "", category: "generic" },
    preview: <span className="text-sm font-medium leading-none text-foreground/70">T</span>,
  },
]

export function CanvasPalette({ onAdd }: { onAdd: (entry: IconEntry) => void }) {
  const [manifest, setManifest] = useState<IconManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>({
    [CONTAINERS_SECTION]: true,
  })
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let cancelled = false
    loadIconManifest()
      .then((data) => {
        if (cancelled) return
        setManifest(data)
        const first = data.categories[0]?.id
        if (first) setOpen((prev) => ({ ...prev, [first]: true }))
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "failed to load")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const searching = deferredQuery.trim().length > 0

  const filtered = useMemo(() => {
    if (!manifest) return null
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) return manifest.byCategory
    const out: Record<string, IconEntry[]> = {}
    for (const [category, list] of Object.entries(manifest.byCategory)) {
      const hits = list.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) ||
          entry.id.toLowerCase().includes(needle)
      )
      if (hits.length > 0) out[category] = hits
    }
    return out
  }, [manifest, deferredQuery])

  const hasResults = filtered && Object.keys(filtered).length > 0

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60">
      <div className="border-b border-border/60 p-2.5">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={manifest ? `Search ${manifest.count} icons` : "Search icons"}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
        {!searching && (
          <Section
            title="Containers"
            count={CONTAINERS.length}
            open={open[CONTAINERS_SECTION] ?? true}
            onToggle={() =>
              setOpen((prev) => ({
                ...prev,
                [CONTAINERS_SECTION]: !(prev[CONTAINERS_SECTION] ?? true),
              }))
            }
          >
            <div className="grid grid-cols-3 gap-1">
              {CONTAINERS.map(({ entry, preview }) => (
                <Tile key={entry.id} entry={entry} preview={preview} onAdd={onAdd} />
              ))}
            </div>
          </Section>
        )}

        {error && (
          <p className="p-3 text-[12px] text-destructive">
            Couldn’t load icons: {error}. Run{" "}
            <code className="rounded bg-muted px-1">bun run icons</code>.
          </p>
        )}

        {!manifest && !error && (
          <p className="p-3 text-[12px] text-muted-foreground">Loading icons…</p>
        )}

        {manifest &&
          filtered &&
          manifest.categories.map((category) => {
            const list = filtered[category.id]
            if (!list?.length) return null
            const isOpen = searching || (open[category.id] ?? false)
            return (
              <Section
                key={category.id}
                title={category.label}
                count={list.length}
                open={isOpen}
                onToggle={() =>
                  setOpen((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
                }
              >
                <div className="grid grid-cols-3 gap-1">
                  {list.map((entry) => (
                    <Tile
                      key={entry.id}
                      entry={entry}
                      onAdd={onAdd}
                      preview={
                        <IconGraphic
                          path={entry.path}
                          mono={entry.mono}
                          className="size-7 text-foreground/80"
                        />
                      }
                    />
                  ))}
                </div>
              </Section>
            )
          })}

        {manifest && searching && !hasResults && (
          <p className="p-3 text-center text-[12px] text-muted-foreground">
            No icons match “{deferredQuery.trim()}”.
          </p>
        )}
      </div>
    </aside>
  )
}
