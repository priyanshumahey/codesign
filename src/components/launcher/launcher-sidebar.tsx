import { Clock, Folder, FolderPlus, Plus, PushPin } from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RecentItem } from "@/lib/spaces"
import type { LauncherView } from "./types"

function NavItem({
  icon: ItemIcon,
  label,
  active,
  count,
  onClick,
}: {
  icon: Icon
  label: string
  active?: boolean
  count?: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/65 hover:text-foreground"
      )}
    >
      <ItemIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count ? (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </button>
  )
}

export function LauncherSidebar({
  view,
  folders,
  recentCount,
  pinnedCount,
  onSelectView,
  onNewSpace,
  onOpenSpace,
  onAddFolder,
}: {
  view: LauncherView
  folders: RecentItem[]
  recentCount: number
  pinnedCount: number
  onSelectView: (view: LauncherView) => void
  onNewSpace: () => void
  onOpenSpace: () => void
  onAddFolder: () => void
}) {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-1 bg-sidebar px-2.5 py-3 text-sidebar-foreground">
      <div className="flex flex-col gap-0.5 pb-3">
        <Button
          variant="ghost"
          onClick={onNewSpace}
          className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-[12px] font-medium hover:bg-sidebar-accent"
        >
          <Plus />
          New space
        </Button>
        <Button
          variant="ghost"
          onClick={onOpenSpace}
          className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-[12px] font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Folder />
          Open space
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5">
        <NavItem
          icon={Clock}
          label="Recents"
          count={recentCount}
          active={view.kind === "recents"}
          onClick={() => onSelectView({ kind: "recents" })}
        />
        <NavItem
          icon={PushPin}
          label="Pinned"
          count={pinnedCount}
          active={view.kind === "pinned"}
          onClick={() => onSelectView({ kind: "pinned" })}
        />
      </nav>

      <div className="mt-4 flex items-center justify-between px-2 pb-1">
        <span className="text-[10px] font-medium text-muted-foreground/80">
          Folders
        </span>
        <button
          type="button"
          onClick={onAddFolder}
          title="Add folder"
          className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <FolderPlus className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {folders.length === 0 ? (
          <p className="px-2 py-1 text-[12px] leading-relaxed text-muted-foreground/80">
            Add a folder to keep a project's spaces together.
          </p>
        ) : (
          folders.map((folder) => (
            <NavItem
              key={folder.path}
              icon={Folder}
              label={folder.name}
              active={view.kind === "folder" && view.path === folder.path}
              onClick={() =>
                onSelectView({ kind: "folder", path: folder.path, name: folder.name })
              }
            />
          ))
        )}
      </div>
    </aside>
  )
}
