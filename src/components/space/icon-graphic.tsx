import { cn } from "@/lib/utils"

/**
 * Vendor art is drawn on a white plate in dark mode: most brand SVGs bake in
 * dark ink and would otherwise disappear. Monochrome art is painted through a
 * CSS mask rather than an `<img>`, because an external SVG cannot resolve
 * `currentColor` from the page and would render black in either theme.
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
  // `--icon-ink` is the light-theme foreground, i.e. the ink to use on a plate.
  const frame = cn(
    "grid place-items-center overflow-hidden rounded-[5px] dark:bg-white dark:p-[8%] dark:[--icon-ink:oklch(0.145_0_0)]",
    className
  )

  if (mono) {
    // Encoded so a filename with spaces or quotes cannot break out of url().
    const url = `url("${encodeURI(path)}")`
    return (
      <span aria-hidden className={frame}>
        <span
          className="size-full bg-[var(--icon-ink,var(--foreground))]"
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
      </span>
    )
  }

  return (
    <span className={frame}>
      <img
        src={path}
        alt=""
        loading="lazy"
        draggable={false}
        className="size-full object-contain"
      />
    </span>
  )
}
