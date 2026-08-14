import type { IconManifest } from "./types"

/** The manifest is generated at build time by `bun run icons`. */
let cached: Promise<IconManifest> | null = null

export function loadIconManifest(): Promise<IconManifest> {
  cached ??= fetch("/icons-manifest.json", { cache: "force-cache" }).then(
    (response) => {
      if (!response.ok) throw new Error(`icons-manifest.json: ${response.status}`)
      return response.json() as Promise<IconManifest>
    }
  )
  return cached
}
