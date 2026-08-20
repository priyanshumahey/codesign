import { cn } from "@/lib/utils"

/** A "C" drawn as a diagram: an orthogonal edge routed between two nodes. */
export function CodesignMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13.6 5.5H9A4.4 4.4 0 0 0 4.6 9.9v4.2A4.4 4.4 0 0 0 9 18.5h4.6"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <rect x="13.6" y="2.2" width="6.6" height="6.6" rx="2.1" fill="currentColor" />
      <rect x="13.6" y="15.2" width="6.6" height="6.6" rx="2.1" fill="currentColor" />
    </svg>
  )
}

/** The mark on a brand tile, for icon-sized placements. */
export function CodesignBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground shadow-sm",
        className
      )}
    >
      <CodesignMark className="size-[62%]" />
    </span>
  )
}
