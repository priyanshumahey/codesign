import { cn } from "@/lib/utils"

export type SegmentOption<T extends string> = {
  value: T
  label: string
  icon?: React.ReactNode
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  iconOnly = false,
  className,
}: {
  value: T
  options: readonly SegmentOption<T>[]
  onValueChange: (value: T) => void
  iconOnly?: boolean
  className?: string
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )

  return (
    <div
      className={cn("relative grid rounded-lg bg-muted/65 p-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 rounded-[6px] border border-border/70 bg-background shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={iconOnly ? option.label : undefined}
          aria-label={iconOnly ? option.label : undefined}
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            "relative z-10 flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[11px] font-medium transition-colors",
            value === option.value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.icon}
          {!iconOnly && <span className="truncate capitalize">{option.label}</span>}
        </button>
      ))}
    </div>
  )
}