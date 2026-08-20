import { DotsThree, Folder, PushPin } from "@phosphor-icons/react"
import { Fragment } from "react"

import { CodesignMark } from "@/components/codesign-mark"
import { MatchSummary } from "./match-summary"
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
import { buildSpaceActions, type SpaceActionHandlers } from "./space-actions"
import type { LauncherItem } from "./types"

export function SpaceRow({
  item,
  location,
  handlers,
}: {
  item: LauncherItem
  location: string
  handlers: SpaceActionHandlers
}) {
  const actions = buildSpaceActions(item, handlers)

  return (
    <ContextMenu>
      <ContextMenuTrigger className="group relative block">
        <button
          type="button"
          onClick={() => handlers.onOpen(item)}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md border",
              item.missing
                ? "border-dashed border-border text-muted-foreground/50"
                : "border-border/70 bg-background text-foreground"
            )}
          >
            {item.kind === "folder" ? (
              <Folder className="size-3.5 text-muted-foreground" />
            ) : (
              <CodesignMark className="size-3.5" />
            )}
          </span>

          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "truncate text-[13px] font-medium",
                item.missing && "text-muted-foreground"
              )}
            >
              {item.name}
            </span>
            {item.pinned && (
              <PushPin weight="fill" className="size-3 shrink-0 text-amber-500" />
            )}
            {item.missing && (
              <span className="shrink-0 rounded border border-border/70 px-1.5 py-px text-[10px] text-muted-foreground">
                Missing
              </span>
            )}
          </span>

          <span className="hidden min-w-0 flex-1 truncate text-[12px] text-muted-foreground md:block">
            {item.matches?.length ? <MatchSummary item={item} /> : location}
          </span>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {item.meta}
          </span>
          <span className="w-6 shrink-0" aria-hidden />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
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
