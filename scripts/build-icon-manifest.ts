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

const NAMED_COLORS: Record<string, number> = {
  black: 0,
  white: 1,
  none: -1,
  transparent: -1,
  currentcolor: -1,
}

function luminance(hex: string): number {
  let value = hex.slice(1)
  if (value.length === 3) value = value.split("").map((c) => c + c).join("")
  if (value.length === 8) value = value.slice(0, 6)
  if (value.length !== 6) return -1
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Monochrome art is anything that either paints with `currentColor` or whose
 * palette is entirely near-black or near-white — both disappear against one of
 * our themes unless we tint it ourselves.
 */
function isMonochrome(svg: string): boolean {
  if (svg.includes("currentColor")) return true

  const tones: number[] = []
  for (const hex of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    const tone = luminance(hex)
    if (tone >= 0) tones.push(tone)
  }
  for (const [, name] of svg.matchAll(/(?:fill|stroke)="([a-zA-Z]+)"/g)) {
    const tone = NAMED_COLORS[name.toLowerCase()]
    if (tone !== undefined && tone >= 0) tones.push(tone)
  }

  if (tones.length === 0) return true
  return tones.every((tone) => tone < 0.25) || tones.every((tone) => tone > 0.85)
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
