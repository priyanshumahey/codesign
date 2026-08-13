const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms) return "—"
  const diff = Date.now() - ms
  if (diff < MINUTE) return "Just now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < DAY * 2) return "Yesterday"
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)}d ago`

  const date = new Date(ms)
  const thisYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  })
}

export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return index > 0 ? path.slice(0, index) : path
}

/** Collapse the home prefix so paths stay readable in tight rows. */
export function shortenPath(path: string, home: string | null): string {
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`
  return path
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
