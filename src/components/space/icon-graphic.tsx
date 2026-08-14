import { cn } from "@/lib/utils"

/**
 * Monochrome art is painted through a CSS mask so it picks up the current text
 * colour; `<img>` cannot resolve `currentColor` inside an external SVG, which
 * is why those icons render black (and vanish in dark mode) otherwise.
 */
export function IconGraphic({
  path,
  mono,
  className,
}: {
  path: string
  mono?: boolean
  className?: string
}) {
  if (mono) {
    // Encoded so a filename with spaces or quotes cannot break out of url().
    const url = `url("${encodeURI(path)}")`
    return (
      <span
        aria-hidden
        className={cn("bg-current", className)}
        style={{
          maskImage: url,
          WebkitMaskImage: url,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskPosition: "center",
          WebkitMaskPosition: "center",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
    )
  }

  return (
    <img
      src={path}
      alt=""
      loading="lazy"
      draggable={false}
      className={cn("object-contain", className)}
    />
  )
}
