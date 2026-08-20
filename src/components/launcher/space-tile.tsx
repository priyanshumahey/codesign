import { DotsThree, Folder, PushPin } from "@phosphor-icons/react"
import { Fragment } from "react"

import { CodesignBadge } from "@/components/codesign-mark"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { SpacePreview } from "@/lib/preview"
import { buildSpaceActions, type SpaceActionHandlers } from "./space-actions"
import { SpaceThumbnail } from "./space-thumbnail"
import type { LauncherItem } from "./types"

function Thumbnail({
  item,
  preview,
}: {
  item: LauncherItem
  preview?: SpacePreview
}) {
  const hasPreview = !item.missing && item.kind === "file" && preview?.nodes.length

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/25 transition-colors",
        item.missing ? "border-dashed border-border" : "border-border/70 group-hover:border-foreground/25"
      )}
    >
      {hasPreview ? (
        <SpaceThumbnail preview={preview} />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          {item.kind === "folder" ? (
            <Folder
              className={cn(
                "size-7",
                item.missing ? "text-muted-foreground/40" : "text-muted-foreground/70"
              )}
            />
          ) : (
            <CodesignBadge
              className={cn(item.missing && "bg-muted text-muted-foreground/50 shadow-none")}
            />
          )}
        </div>
      )}

      {item.missing && (
        <span className="absolute left-2 top-2 rounded border border-border/70 bg-background/90 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          Missing
        </span>
      )}
    </div>
  )
}

export function SpaceTile({
  item,
  preview,
  handlers,
}: {
  item: LauncherItem
  preview?: SpacePreview
  handlers: SpaceActionHandlers
}) {
  const actions = buildSpaceActions(item, handlers)

  return (
    <ContextMenu>
      <ContextMenuTrigger className="group relative block text-left">
        <button
          type="button"
          onClick={() => handlers.onOpen(item)}
          className="w-full rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Thumbnail item={item} preview={preview} />
          <div className="mt-2 flex items-start gap-1.5 px-0.5">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-[13px] font-medium",
                  item.missing && "text-muted-foreground"
                )}
              >
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.meta}</p>
            </div>
            {item.pinned && (
              <PushPin weight="fill" className="mt-0.5 size-3 shrink-0 text-amber-500" />
            )}
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute right-2 top-2 grid size-6 place-items-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/60 transition-opacity outline-none hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
            aria-label={`Actions for ${item.name}`}
          >
            <DotsThree weight="bold" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {actions.map((action) => (
              <Fragment key={action.id}>
                {action.dividerBefore && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant={action.destructive ? "destructive" : "default"}
                  onSelect={action.onSelect}
                >
                  <action.icon />
                  {action.label}
                </DropdownMenuItem>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        {actions.map((action) => (
          <Fragment key={action.id}>
            {action.dividerBefore && <ContextMenuSeparator />}
            <ContextMenuItem
              variant={action.destructive ? "destructive" : "default"}
              onSelect={action.onSelect}
            >
              <action.icon />
              {action.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
