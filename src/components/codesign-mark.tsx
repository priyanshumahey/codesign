export function CodesignMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="2.5" width="6.75" height="5.25" rx="1.6" fill="currentColor" />
      <rect x="11.25" y="12.25" width="6.75" height="5.25" rx="1.6" fill="currentColor" />
      <path
        d="M5.4 7.75v4.15a1.6 1.6 0 0 0 1.6 1.6h4.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
