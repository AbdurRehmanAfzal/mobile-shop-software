/** docs/33: every "?" in the code has a title, an explanation and an example in English, Urdu and
 *  Roman Urdu — so a shopkeeper never taps one and gets an empty or missing text. */

import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.json'
import roman from '@/i18n/locales/roman.json'
import ur from '@/i18n/locales/ur.json'

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// <Help term="x" />, <Help term='x' />, help="x" on Section / KV, and helpKey: 'x' in screen tables
const PATTERNS = [/<Help\s+term=["']([\w.]+)["']/g, /\bhelp=["']([\w.]+)["']/g, /\bhelp(?:Key)?:\s*["']([\w.]+)["']/g]

function used(): Map<string, string> {
  const out = new Map<string, string>()
  for (const [file, src] of Object.entries(sources)) {
    if (file.includes('.test.')) continue
    for (const re of PATTERNS) for (const m of src.matchAll(re)) out.set(m[1], file)
  }
  return out
}

function at(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

describe('help texts', () => {
  const terms = used()
  it('finds the help terms in the code', () => {
    expect(terms.size).toBeGreaterThan(15)
  })
  for (const [name, locale] of [['en', en], ['ur', ur], ['roman', roman]] as const) {
    it(`every term has a title, body and example in ${name}`, () => {
      const missing: string[] = []
      for (const [term, file] of terms) {
        for (const part of ['title', 'body', 'example']) {
          const v = at((locale as Record<string, unknown>).help, `${term}.${part}`)
          if (typeof v !== 'string' || !v.trim()) missing.push(`${term}.${part} (${file})`)
        }
      }
      expect(missing).toEqual([])
    })
  }
})
