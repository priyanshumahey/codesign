import { primeIconIndex } from "@/lib/ops"
import type { IconManifest } from "./types"

/** The manifest is generated at build time by `bun run icons`. */
let cached: Promise<IconManifest> | null = null

export function loadIconManifest(): Promise<IconManifest> {
  cached ??= fetch("/icons-manifest.json", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`icons-manifest.json: ${response.status}`)
      return response.text()
    })
    .then((raw) => {
      // The op layer resolves icon ids in Rust, where the bundle is unreadable.
      void primeIconIndex(raw).catch(() => {})
      return JSON.parse(raw) as IconManifest
    })
  return cached
}
