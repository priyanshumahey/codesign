import { useEffect, useState } from "react"

import { searchSpaces, type SpaceMatch } from "@/lib/spaces"

/** Below this the results are too broad to be worth a disk scan. */
const MIN_QUERY = 2
const DEBOUNCE_MS = 180
const SEPARATOR = "\u0000"

/**
 * Searches inside spaces as the launcher query changes. Every candidate file is
 * read on the Rust side, so the query is debounced and short ones are skipped.
 *
 * Callers must pass candidates derived from the *unfiltered* space list —
 * feeding search results back in would re-trigger the search forever.
 */
export function useSpaceSearch(paths: string[], query: string) {
  const [matches, setMatches] = useState<Map<string, SpaceMatch>>(new Map())
  const key = paths.join(SEPARATOR)

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < MIN_QUERY || key.length === 0) {
      setMatches(new Map())
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      searchSpaces(key.split(SEPARATOR), needle)
        .then((results) => {
          if (cancelled) return
          setMatches(new Map(results.map((result) => [result.path, result])))
        })
        // A failed search just falls back to matching on name.
        .catch(() => !cancelled && setMatches(new Map()))
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, query])

  return matches
}
