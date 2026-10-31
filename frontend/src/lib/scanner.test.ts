import { describe, expect, it } from 'vitest'
import { WedgeDetector, charOf, cleanCode } from './scanner'

function keys(text: string): { key: string; code: string; shiftKey: boolean }[] {
  return [...text].map((ch) => {
    if (/\d/.test(ch)) return { key: ch, code: `Digit${ch}`, shiftKey: false }
    if (/[a-z]/i.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, shiftKey: ch === ch.toUpperCase() }
    if (ch === '-') return { key: '-', code: 'Minus', shiftKey: false }
    if (ch === ']') return { key: ']', code: 'BracketRight', shiftKey: false }
    return { key: ch, code: '', shiftKey: false }
  })
}
const ENTER = { key: 'Enter', code: 'Enter', shiftKey: false }

function feed(text: string, gapMs: number, terminator = ENTER): string | null {
  let t = 1000
  const d = new WedgeDetector(() => t)
  let out: string | null = null
  for (const k of keys(text)) {
    out = d.push(k) ?? out
    t += gapMs
  }
  return d.push(terminator) ?? out
}

describe('keyboard-wedge scanner detection', () => {
  it('a fast burst ending in Enter is a scan', () => {
    expect(feed('MS000123', 5)).toBe('MS000123')
    expect(feed('490154203237518', 12)).toBe('490154203237518')
  })
  it('a person typing (slow keys) is not a scan, even with Enter', () => {
    expect(feed('MS000123', 150)).toBeNull()
  })
  it('needs a terminator and a minimum length', () => {
    let t = 0
    const d = new WedgeDetector(() => (t += 5))
    for (const k of keys('MS000123')) expect(d.push(k)).toBeNull()
    expect(feed('ab1', 5)).toBeNull()
  })
  it('Tab works as the terminator too', () => {
    expect(feed('MS000123', 5, { key: 'Tab', code: 'Tab', shiftKey: false })).toBe('MS000123')
  })
  it('strips scanner prefixes and suffixes and is layout independent', () => {
    expect(cleanCode(']C1MS000123\r')).toBe('MS000123')
    expect(cleanCode('  490154203237518\n')).toBe('490154203237518')
    expect(cleanCode('۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸')).toBe('490154203237518')
    // Urdu layout: the key reports an Urdu letter but the physical key is Digit4 / KeyM
    expect(charOf({ key: '۴', code: 'Digit4', shiftKey: false })).toBe('4')
    expect(charOf({ key: 'م', code: 'KeyM', shiftKey: true })).toBe('M')
    expect(feed(']C1MS000123', 5)).toBe('MS000123')
  })
  it('a pause between two bursts starts a new scan', () => {
    let t = 0
    const d = new WedgeDetector(() => t)
    for (const k of keys('OLD1')) { d.push(k); t += 5 }
    t += 2000
    for (const k of keys('MS000123')) { d.push(k); t += 5 }
    expect(d.push(ENTER)).toBe('MS000123')
  })
})
