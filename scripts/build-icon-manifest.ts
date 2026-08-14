/**
 * Builds `public/icons-manifest.json` from the SVG tree in `public/icons`.
 *
 * Run with: bun run icons
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const ICONS_DIR = join(ROOT, "public", "icons")
const MANIFEST = join(ROOT, "public", "icons-manifest.json")

type IconEntry = {
  id: string
  name: string
  path: string
  category: string
  subcategory?: string
  /** Single-colour art that should be tinted with the current theme colour. */
  mono?: boolean
}

type Rgb = [number, number, number]

const NAMED_COLORS: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  navy: [0, 0, 128],
  maroon: [128, 0, 0],
  purple: [128, 0, 128],
  green: [0, 128, 0],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
  red: [255, 0, 0],
  blue: [0, 0, 255],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
}

function parseHex(token: string): Rgb | null {
  let value = token.slice(1)
  if (value.length === 3 || value.length === 4) {
    value = value
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("")
  }
  if (value.length === 8) value = value.slice(0, 6)
  if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) return null
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance, which needs the sRGB gamma removed first. */
function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const v = channel / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The two backdrops an icon can land on: the dark theme card, and paper. */
const DARK_SURFACE = luminance([28, 28, 28])
const LIGHT_SURFACE = luminance([255, 255, 255])

/** Below this a colour is effectively invisible against the surface. */
const MIN_CONTRAST = 1.6

/**
 * Colours are read from real paint declarations only — attributes, `style="…"`
 * and `<style>` blocks all count, and so do gradient stops. Editor leftovers
 * (Inkscape's `pagecolor`, `bordercolor`, metadata blocks) are not paint and
 * would otherwise drag a bright icon into the "too dark" bucket.
 */
const PAINT =
  /(?:fill|stroke|stop-color|flood-color|lighting-color)(?![\w-])\s*[:=]\s*["']?\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/g

function paletteOf(svg: string): Rgb[] {
  const painted = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
    .replace(/<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/gi, "")

  const colors: Rgb[] = []
  for (const [, value] of painted.matchAll(PAINT)) {
    if (value.startsWith("#")) {
      const rgb = parseHex(value)
      if (rgb) colors.push(rgb)
      continue
    }
    const fn = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
    if (fn) {
      colors.push([Number(fn[1]), Number(fn[2]), Number(fn[3])])
      continue
    }
    const named = NAMED_COLORS[value.toLowerCase()]
    if (named) colors.push(named)
  }
  return colors
}

/**
 * Art whose whole palette disappears against one of our surfaces is a
 * silhouette, so it is masked and tinted with the theme colour. Anything with
 * a colour that reads on both keeps its own palette — tinting a brand mark
 * would throw the brand away.
 */
function isMonochrome(svg: string): boolean {
  if (svg.includes("currentColor")) return true

  const tones = paletteOf(svg).map(luminance)
  // No declared colour means the SVG default fill, which is black.
  if (tones.length === 0) return true

  const vanishesOn = (surface: number) =>
    tones.every((tone) => contrast(tone, surface) < MIN_CONTRAST)
  return vanishesOn(DARK_SURFACE) || vanishesOn(LIGHT_SURFACE)
}

const CATEGORY_LABELS: Record<string, string> = {
  generic: "Generic",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  kubernetes: "Kubernetes",
  "open-libs": "Open Libraries",
  "tech-logos": "Tech Logos",
  "brand-logos": "Brand Logos",
  "brand-logos-extra": "Brand Logos (Extra)",
}

/** Most useful for system design first. */
const CATEGORY_ORDER = [
  "generic",
  "tech-logos",
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "brand-logos",
  "open-libs",
  "brand-logos-extra",
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith(".svg")) out.push(full)
  }
  return out
}

function humanize(filename: string): string {
  return filename
    .replace(/\.svg$/i, "")
    .replace(/^(?:aws|gcp|azure|k8s)-/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
}

const files = walk(ICONS_DIR).sort()
const entries: IconEntry[] = files.map((file) => {
  const rel = relative(ICONS_DIR, file)
  const parts = rel.split("/")
  const filename = parts[parts.length - 1]!
  const mono = isMonochrome(readFileSync(file, "utf8"))
  return {
    id: rel.replace(/\.svg$/i, "").replace(/[\\/]/g, ":"),
    name: humanize(filename),
    path: `/icons/${rel}`,
    category: parts[0] ?? "misc",
    subcategory: parts.length > 2 ? parts[1] : undefined,
    ...(mono ? { mono: true } : {}),
  }
})

const byCategory: Record<string, IconEntry[]> = {}
for (const entry of entries) {
  ;(byCategory[entry.category] ??= []).push(entry)
}

for (const list of Object.values(byCategory)) {
  list.sort((a, b) => {
    const sa = a.subcategory ?? ""
    const sb = b.subcategory ?? ""
    return sa !== sb ? sa.localeCompare(sb) : a.name.localeCompare(b.name)
  })
}

const known = new Set(CATEGORY_ORDER)
const orderedIds = [
  ...CATEGORY_ORDER.filter((id) => byCategory[id]),
  ...Object.keys(byCategory).filter((id) => !known.has(id)).sort(),
]

writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: entries.length,
      categories: orderedIds.map((id) => ({
        id,
        label: CATEGORY_LABELS[id] ?? humanize(id),
        count: byCategory[id]?.length ?? 0,
      })),
      byCategory,
    },
    null,
    2
  )
)

console.log(
  `[icons] ${entries.length} icons (${entries.filter((e) => e.mono).length} monochrome) across ${orderedIds.length} categories → public/icons-manifest.json`
)
