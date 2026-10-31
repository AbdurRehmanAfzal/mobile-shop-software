/** Hardware barcode scanners (USB / Bluetooth) type like a keyboard: the whole code in a burst and
 *  Enter at the end (owner addendum 4, docs/22 §D). One window-level listener tells that burst
 *  from a person typing (key gaps, length, the terminator) and raises a `scan` event the screens
 *  subscribe to with `useScan`. It reads `e.code` for digits and letters, so an Urdu keyboard
 *  layout does not change what the scanner "typed"; prefixes like `]C1` and stray control
 *  characters are stripped. Beeps come from the Web Audio API — no sound files. */

import { useEffect, useRef } from 'react'
import { toLatinDigits } from './format'

export interface ScanEvent {
  code: string
  at: number
}

const MIN_LENGTH = 4
const MAX_GAP_MS = 80 // a scanner sends keys every few ms; a fast human needs 100+ ms
const MAX_SCAN_MS = 1500 // the whole burst
type Handler = (code: string) => void | Promise<void>

const handlers: Handler[] = []
let buf = ''
let first = 0
let last = 0
let slowSeen = false
let installed = false

/** `]C1490154203237518\r` → `490154203237518`; Urdu digits → Latin; control chars gone */
export function cleanCode(raw: string): string {
  let v = toLatinDigits(raw).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  v = v.replace(/^\][A-Za-z]\d/, '') // AIM symbology identifier some scanners prefix
  return v.trim()
}

/** the character a key event stands for, independent of the keyboard layout where possible */
export function charOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): string | null {
  // an English layout reports the right character itself (case included); only when the key is
  // not printable ASCII (Urdu layout) do we fall back to the physical key
  if (e.key.length === 1 && /[ -~]/.test(e.key)) return e.key
  const c = e.code
  if (/^Digit\d$/.test(c)) return c.slice(5)
  if (/^Numpad\d$/.test(c)) return c.slice(6)
  if (/^Key[A-Z]$/.test(c)) return e.shiftKey ? c.slice(3) : c.slice(3).toLowerCase()
  if (c === 'Minus') return e.shiftKey ? '_' : '-'
  if (c === 'Period') return e.shiftKey ? '>' : '.'
  if (c === 'Slash') return e.shiftKey ? '?' : '/'
  if (c === 'Space') return ' '
  if (c === 'Equal') return e.shiftKey ? '+' : '='
  if (c === 'Backslash') return e.shiftKey ? '|' : '\\'
  if (c === 'BracketRight') return e.shiftKey ? '}' : ']'
  if (c === 'BracketLeft') return e.shiftKey ? '{' : '['
  if (c === 'Semicolon') return e.shiftKey ? ':' : ';'
  if (c === 'Quote') return e.shiftKey ? '"' : "'"
  if (c === 'Comma') return e.shiftKey ? '<' : ','
  if (e.key.length === 1) return e.key
  return null
}

/** Pure decision logic, so it can be unit-tested without a DOM: feed key events, get a scan back. */
export class WedgeDetector {
  private buf = ''
  private first = 0
  private last = 0
  private slow = false
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** returns the scanned code when this key completed a scan, else null */
  push(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'> & { timeStamp?: number }): string | null {
    // the event's own time stamp: a busy main thread (a screen rendering) handles queued keys late,
    // which must not look like a pause in the burst
    const t = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : this.now()
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'NumpadEnter') {
      const code = cleanCode(this.buf)
      const fast = !this.slow && code.length >= MIN_LENGTH && t - this.first <= MAX_SCAN_MS
      this.reset()
      return fast ? code : null
    }
    const ch = charOf(e)
    if (ch === null) return null
    if (this.buf && t - this.last > MAX_GAP_MS) {
      // a pause: whatever came before was typing (or the start of a new burst)
      this.buf = ''
      this.slow = false
    }
    if (!this.buf) this.first = t
    this.buf += ch
    this.last = t
    return null
  }

  private reset() {
    this.buf = ''
    this.first = 0
    this.last = 0
    this.slow = false
  }
}

const detector = new WedgeDetector()

function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  const code = detector.push(e)
  if (code === null) return
  // a scan: do not submit the form the scanner typed into, and let the screen act
  e.preventDefault()
  e.stopPropagation()
  const h = handlers[handlers.length - 1]
  if (h) void h(code)
  else if (fallbacks.size) fallbacks.forEach((f) => void f(code))
  else pending.push(code) // scanned before the app finished mounting: delivered on subscribe
  window.dispatchEvent(new CustomEvent<ScanEvent>('scan', { detail: { code, at: Date.now() } }))
}

const fallbacks = new Set<Handler>()
let pending: string[] = []

/** the shell's default (lookup → open): called for scans no screen claimed, including ones that
 *  arrived while the app was still mounting */
export function onUnclaimedScan(fn: Handler): () => void {
  fallbacks.add(fn)
  const queued = pending
  pending = []
  for (const code of queued) void fn(code)
  return () => {
    fallbacks.delete(fn)
  }
}

export function installScanner(): () => void {
  if (installed) return () => undefined
  installed = true
  window.addEventListener('keydown', onKey, true)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    installed = false
  }
}

/** The screen on top handles scans; when no screen does, the global listener (lookup → open) runs. */
export function useScan(handler: Handler | null) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!handler) return
    const h: Handler = (code) => ref.current?.(code)
    handlers.push(h)
    return () => {
      const i = handlers.indexOf(h)
      if (i >= 0) handlers.splice(i, 1)
    }
  }, [handler !== null]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** a short tone: high for found, low twice for not found */
export function beep(kind: 'ok' | 'error' = 'ok') {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const tone = (freq: number, at: number, len: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = freq
      g.gain.value = 0.08
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + len)
    }
    if (kind === 'ok') tone(1760, 0, 0.09)
    else { tone(330, 0, 0.12); tone(330, 0.16, 0.12) }
    setTimeout(() => void ctx.close(), 600)
  } catch {
    /* no audio: the screen still shows the result */
  }
}

// installed the moment the app's code runs, so a scan during the first paint is not cut short
if (typeof window !== 'undefined') installScanner()

// keep the module-level buffer variables referenced (older bundlers warn otherwise)
void buf; void first; void last; void slowSeen
