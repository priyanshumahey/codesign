import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function Section({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      {title && (
        <h3 className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-foreground/70">{label}</span>
      {children}
      {hint && (
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">{hint}</p>
      )}
    </div>
  )
}

/** Commits on blur so typing never fights the canvas re-render. */
export function TextField({
  label,
  value,
  placeholder,
  hint,
  mono,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  hint?: string
  mono?: boolean
  onCommit: (next: string) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        key={value}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className={mono ? "h-8 font-mono text-[12px]" : "h-8 text-[13px]"}
      />
    </Field>
  )
}

export function AreaField({
  label,
  value,
  placeholder,
  hint,
  mono,
  rows = 3,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  hint?: string
  mono?: boolean
  rows?: number
  onCommit: (next: string) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <Textarea
        key={value}
        rows={rows}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => onCommit(event.target.value)}
        className={
          mono
            ? "min-h-14 resize-none font-mono text-[12px] leading-relaxed"
            : "min-h-14 resize-none text-[13px] leading-relaxed"
        }
      />
    </Field>
  )
}
