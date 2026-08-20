import { MagnifyingGlass } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import type { LauncherItem } from "./types"

/** Explains why a space survived the current search, when it matched on content. */
export function MatchSummary({
  item,
  className,
}: {
  item: LauncherItem
  className?: string
}) {
  const matches = item.matches
  if (!matches?.length) return null

  const shown = matches.slice(0, 3).map((match) => match.label)
  const extra = (item.matchTotal ?? matches.length) - shown.length

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      <MagnifyingGlass className="size-3 shrink-0" />
      <span className="truncate">{shown.join(" · ")}</span>
      {extra > 0 && <span className="shrink-0">+{extra}</span>}
    </span>
  )
}
