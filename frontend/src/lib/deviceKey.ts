/** This phone's / browser's own random key (owner 2026-11-15, ADR-080), sent with every request as
 *  X-Device-Key. When the owner switches on device approval, a staff member can log in only on a
 *  device whose key the owner approved. Made once and kept; clearing the browser's data makes the
 *  device new again (the owner approves it once more). */

const KEY = 'mobileshop.deviceKey'
let cached: string | null = null

function fresh(): string {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function deviceKey(): string {
  if (cached) return cached
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && saved.length >= 20) return (cached = saved)
    const k = fresh()
    localStorage.setItem(KEY, k)
    return (cached = k)
  } catch {
    // storage blocked: a key for this visit only
    return (cached = fresh())
  }
}
