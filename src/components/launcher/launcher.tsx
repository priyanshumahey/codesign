import { useCallback, useEffect, useMemo, useState } from "react"
import { homeDir } from "@tauri-apps/api/path"
import {
  ArrowsDownUp,
  FolderPlus,
  List,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  X,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { formatRelativeTime, parentDir, shortenPath } from "@/lib/format"
import { useSpacePreviews } from "@/lib/preview"
import {
  addFolder,
  createSpaceViaDialog,
  defaultSpaceDir,
  deleteSpace,
  errorMessage,
  forgetRecent,
  listFolderSpaces,
  listRecents,
  openSpace,
  pickFolder,
  pickSpaceFile,
  renameSpace,
  revealInFileManager,
  setPinned,
  type RecentItem,
  type SpaceFile,
  type SpaceSummary,
} from "@/lib/spaces"
import { DeleteDialog, RenameDialog } from "./dialogs"
import { LauncherSidebar } from "./launcher-sidebar"
import type { SpaceActionHandlers } from "./space-actions"
import { SpaceRow } from "./space-row"
import { SpaceTile } from "./space-tile"
import type { LauncherItem, LauncherView, SortKey } from "./types"

const SORT_LABELS: Record<SortKey, string> = {
  opened: "Last opened",
  name: "Name",
  modified: "Last modified",
}

export function Launcher({ onOpenSpace }: { onOpenSpace: (space: SpaceFile) => void }) {
  const [recents, setRecents] = useState<RecentItem[]>([])
  const [folderSpaces, setFolderSpaces] = useState<SpaceSummary[]>([])
  const [view, setView] = useState<LauncherView>({ kind: "recents" })
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("opened")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [renameTarget, setRenameTarget] = useState<LauncherItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LauncherItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [home, setHome] = useState<string | null>(null)
  const [onDisk, setOnDisk] = useState<SpaceSummary[]>([])

  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await listRecents())
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  // Spaces can be created without the app — by the MCP server, or by dropping a
  // file in — so the default folder is always listed, not just what was opened.
  const refreshOnDisk = useCallback(async () => {
    try {
      setOnDisk(await listFolderSpaces(await defaultSpaceDir()))
    } catch {
      setOnDisk([])
    }
  }, [])

  useEffect(() => {
    void refreshRecents()
    void refreshOnDisk()
    void homeDir()
      .then((dir) => setHome(dir.replace(/\/$/, "")))
      .catch(() => setHome(null))
  }, [refreshRecents, refreshOnDisk])

  useEffect(() => {
    if (view.kind !== "folder") return
    let cancelled = false
    listFolderSpaces(view.path)
      .then((spaces) => !cancelled && setFolderSpaces(spaces))
      .catch((cause) => !cancelled && setError(errorMessage(cause)))
    return () => {
      cancelled = true
    }
  }, [view])

  const folders = useMemo(() => recents.filter((item) => item.kind === "folder"), [recents])
  const pinnedCount = useMemo(() => recents.filter((item) => item.pinned).length, [recents])

  const items = useMemo<LauncherItem[]>(() => {
    const source: LauncherItem[] =
      view.kind === "folder"
        ? folderSpaces.map((space) => ({
            path: space.path,
            name: space.name,
            kind: "file" as const,
            pinned: recents.some((r) => r.path === space.path && r.pinned),
            missing: false,
            tracked: recents.some((r) => r.path === space.path),
            lastOpened: recents.find((r) => r.path === space.path)?.lastOpened ?? 0,
            modified: space.modified,
            meta: `Edited ${formatRelativeTime(space.modified)}`,
          }))
        : recents
            .filter((item) => (view.kind === "pinned" ? item.pinned : true))
            .map((item) => ({
              path: item.path,
              name: item.name,
              kind: item.kind,
              pinned: item.pinned,
              missing: !item.exists,
              tracked: true,
              lastOpened: item.lastOpened,
              modified: item.modified,
              meta: item.exists
                ? `Opened ${formatRelativeTime(item.lastOpened)}`
                : "No longer on disk",
            }))

    // Anything in the default folder the app has not opened yet.
    if (view.kind === "recents") {
      const known = new Set(source.map((item) => item.path))
      for (const space of onDisk) {
        if (known.has(space.path)) continue
        source.push({
          path: space.path,
          name: space.name,
          kind: "file",
          pinned: false,
          missing: false,
          tracked: false,
          lastOpened: 0,
          modified: space.modified,
          meta: `Edited ${formatRelativeTime(space.modified)}`,
        })
      }
    }

    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? source.filter(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            item.path.toLowerCase().includes(needle)
        )
      : source

    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === "name") return a.name.localeCompare(b.name)
      if (sort === "modified") return (b.modified ?? 0) - (a.modified ?? 0)
      return b.lastOpened - a.lastOpened
    })
  }, [view, folderSpaces, recents, onDisk, query, sort])

  const previews = useSpacePreviews(
    useMemo(
      () =>
        items
          .filter((item) => item.kind === "file" && !item.missing)
          .map((item) => item.path),
      [items]
    )
  )

  const openItem = useCallback(
    async (item: LauncherItem) => {
      if (item.kind === "folder") {
        setView({ kind: "folder", path: item.path, name: item.name })
        return
      }
      try {
        onOpenSpace(await openSpace(item.path))
        void refreshRecents()
      } catch (cause) {
        setError(errorMessage(cause))
        void refreshRecents()
      }
    },
    [onOpenSpace, refreshRecents]
  )

  const handlers: SpaceActionHandlers = {
    onOpen: (item) => void openItem(item),
    onRename: (item) => setRenameTarget(item),
    onDelete: (item) => setDeleteTarget(item),
    onTogglePin: (item) => {
      void setPinned(item.path, !item.pinned)
        .then(refreshRecents)
        .catch((cause) => setError(errorMessage(cause)))
    },
    onReveal: (item) => {
      void revealInFileManager(item.path).catch((cause) => setError(errorMessage(cause)))
    },
    onForget: (item) => {
      void forgetRecent(item.path)
        .then(refreshRecents)
        .catch((cause) => setError(errorMessage(cause)))
    },
  }

  const handleNewSpace = async () => {
    try {
      const space = await createSpaceViaDialog("Untitled space")
      if (!space) return
      await refreshRecents()
      onOpenSpace(space)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const handleOpenSpace = async () => {
    try {
      const path = await pickSpaceFile()
      if (!path) return
      onOpenSpace(await openSpace(path))
      await refreshRecents()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const handleAddFolder = async () => {
    try {
      const path = await pickFolder()
      if (!path) return
      await addFolder(path)
      await refreshRecents()
      setView({ kind: "folder", path, name: path.split("/").pop() ?? path })
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const title =
    view.kind === "folder" ? view.name : view.kind === "pinned" ? "Pinned" : "Recents"
  const subtitle =
    view.kind === "folder"
      ? shortenPath(view.path, home)
      : `${items.length} ${items.length === 1 ? "space" : "spaces"}`

  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <LauncherSidebar
        view={view}
        folders={folders}
        recentCount={recents.length}
        pinnedCount={pinnedCount}
        onSelectView={setView}
        onNewSpace={() => void handleNewSpace()}
        onOpenSpace={() => void handleOpenSpace()}
        onAddFolder={() => void handleAddFolder()}
      />

      <main className="min-w-0 flex-1 border-l border-border/70 bg-background">
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-4">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-[15px] font-semibold tracking-tight">
                {title}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search spaces"
                  className="h-8 w-52 border-transparent bg-muted/55 pl-8 text-[12px] shadow-none focus-visible:border-foreground/20"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <ArrowsDownUp />
                    {SORT_LABELS[sort]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as SortKey)}
                  >
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                      <DropdownMenuRadioItem key={key} value={key}>
                        {SORT_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <SegmentedControl
                value={layout}
                options={[
                  {
                    value: "grid",
                    label: "Grid view",
                    icon: <SquaresFour className="size-3.5" />,
                  },
                  {
                    value: "list",
                    label: "List view",
                    icon: <List className="size-3.5" />,
                  },
                ]}
                onValueChange={setLayout}
                iconOnly
                className="w-[68px]"
              />
            </div>
          </header>

          {error && (
            <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
              <span className="min-w-0 flex-1 truncate">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="grid size-5 place-items-center rounded transition-colors hover:bg-destructive/10"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                query={query}
                view={view}
                onNewSpace={() => void handleNewSpace()}
                onOpenSpace={() => void handleOpenSpace()}
                onAddFolder={() => void handleAddFolder()}
              />
            ) : layout === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-x-4 gap-y-5 p-5">
                {items.map((item) => (
                  <SpaceTile
                    key={item.path}
                    item={item}
                    preview={previews[item.path]}
                    handlers={handlers}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col p-3">
                <div className="flex items-center gap-3 px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="w-7 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">Name</span>
                  <span className="hidden min-w-0 flex-1 md:block">Location</span>
                  <span className="w-24 shrink-0 text-right">
                    {view.kind === "folder" ? "Edited" : "Opened"}
                  </span>
                  <span className="w-6 shrink-0" aria-hidden />
                </div>
                {items.map((item) => (
                  <SpaceRow
                    key={item.path}
                    item={item}
                    location={shortenPath(parentDir(item.path), home)}
                    handlers={handlers}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <RenameDialog
        item={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSubmit={(item, name) => {
          setRenameTarget(null)
          void renameSpace(item.path, name)
            .then(async () => {
              await Promise.all([refreshRecents(), refreshOnDisk()])
              if (view.kind === "folder") setFolderSpaces(await listFolderSpaces(view.path))
            })
            .catch((cause) => setError(errorMessage(cause)))
        }}
      />

      <DeleteDialog
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(item) => {
          setDeleteTarget(null)
          void deleteSpace(item.path)
            .then(async () => {
              await Promise.all([refreshRecents(), refreshOnDisk()])
              if (view.kind === "folder") setFolderSpaces(await listFolderSpaces(view.path))
            })
            .catch((cause) => setError(errorMessage(cause)))
        }}
      />
    </div>
  )
}

function EmptyState({
  query,
  view,
  onNewSpace,
  onOpenSpace,
  onAddFolder,
}: {
  query: string
  view: LauncherView
  onNewSpace: () => void
  onOpenSpace: () => void
  onAddFolder: () => void
}) {
  if (query.trim()) {
    return (
      <Shell title="No matches" body={`Nothing here matches “${query.trim()}”.`} />
    )
  }

  if (view.kind === "folder") {
    return (
      <Shell
        title="No spaces in this folder"
        body="Create a space and save it here to see it in this view."
        action={
          <Button onClick={onNewSpace}>
            <Plus />
            New space
          </Button>
        }
      />
    )
  }

  if (view.kind === "pinned") {
    return (
      <Shell
        title="Nothing pinned yet"
        body="Pin the spaces you return to and they'll stay at the top."
      />
    )
  }

  return (
    <Shell
      title="Start your first space"
      body="A space holds one system design. Create a new one, open an existing file, or add a folder you already work in."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onNewSpace}>
            <Plus />
            New space
          </Button>
          <Button variant="outline" onClick={onOpenSpace}>
            Open space…
          </Button>
          <Button variant="ghost" onClick={onAddFolder} className="text-muted-foreground">
            <FolderPlus />
            Add folder
          </Button>
        </div>
      }
    />
  )
}

function Shell({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 px-6 py-8 text-center">
        <h2 className="font-heading text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  )
}
