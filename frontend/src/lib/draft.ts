/** Form state that survives the page reloading. On Android, opening the camera app (photo of an ID
 *  card or a barcode) can make Chrome drop the page; the shopkeeper then came back to step 1 with
 *  everything gone (owner, 2026-10-27). Kept in sessionStorage (this tab only) for 30 minutes. */

import { useEffect, useState } from 'react'

const PREFIX = 'draft:'
const MAX_AGE = 30 * 60 * 1000
/** A draft comes back only on the page the browser itself (re)loaded, and only until the user moves
 *  to another screen. Opening "Add stock" from the app always starts at step 1 (owner, 2026-10-27:
 *  an old unfinished entry made it jump straight to step 2). */
const bootPath = typeof location !== 'undefined' ? location.pathname : ''
let leftBootPage = false
export function noteRoute(pathname: string) {
  if (pathname !== bootPath) leftBootPage = true
}

/** prefixes cleared after a save: the finished form must not write itself back */
const frozen = new Set<string>()
const isFrozen = (key: string) => [...frozen].some((p) => key.startsWith(p))

function read<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const { at, v } = JSON.parse(raw) as { at: number; v: T }
    return Date.now() - at < MAX_AGE ? v : undefined
  } catch {
    return undefined
  }
}

/** like useState; with `key` null it is plain useState (nothing saved) */
export function useDraft<T>(key: string | null, initial: T | (() => T)) {
  const [v, setV] = useState<T>(() => {
    if (key === null) return typeof initial === 'function' ? (initial as () => T)() : initial
    for (const p of frozen) if (key.startsWith(p)) frozen.delete(p) // a fresh form starts recording again
    const saved = leftBootPage ? undefined : read<T>(key)
    if (saved !== undefined) return saved
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  useEffect(() => {
    if (key === null || isFrozen(key)) return
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v }))
    } catch {
      /* storage full or blocked: the form still works, it just won't survive a reload */
    }
  }, [key, v])
  return [v, setV] as const
}

/** forget every draft whose key starts with `prefix` (after saving, or when starting fresh) */
export function clearDrafts(prefix: string) {
  frozen.add(prefix)
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX + prefix)) sessionStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
