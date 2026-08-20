import { openUrl } from "@tauri-apps/plugin-opener"

/**
 * Node links are user- and agent-supplied, so only web schemes are ever handed
 * to the OS opener — `file:`, `javascript:` and friends stay inert.
 */
export function safeExternalUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export async function openExternal(raw: string | undefined): Promise<void> {
  const url = safeExternalUrl(raw)
  if (!url) return
  await openUrl(url)
}
