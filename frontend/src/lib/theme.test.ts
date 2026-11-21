import { describe, expect, it } from 'vitest'
import { useTheme } from './theme'

describe('theme store', () => {
  it('defaults to light and applies data-theme on the document', () => {
    expect(useTheme.getState().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
  it('switches to dark and system', () => {
    useTheme.getState().setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    useTheme.getState().setTheme('system')
    expect(document.documentElement.dataset.theme).toBe('system')
    useTheme.getState().setTheme('light')
  })
})

describe('appearance', () => {
  it('applies layout, accent, corners and text size, and resets', async () => {
    const { useTheme } = await import('./theme')
    const root = document.documentElement
    useTheme.getState().setLook({ layout: 'tiles', accent: 'blue', corners: 'square', text: 'large' })
    expect(root.dataset.layout).toBe('tiles')
    expect(root.style.getPropertyValue('--emerald')).toBe('37 99 235')
    expect(root.style.getPropertyValue('--r-card')).toBe('6px')
    expect(root.style.fontSize).toBe('109%')
    useTheme.getState().setTheme('dark')
    expect(root.style.getPropertyValue('--emerald')).toBe('59 130 246')
    useTheme.getState().reset()
    expect(root.dataset.layout).toBe('classic')
    expect(root.style.getPropertyValue('--emerald')).toBe('')
    expect(root.style.fontSize).toBe('')
    expect(useTheme.getState().theme).toBe('light')
  })
})

describe('colour sets (ADR-129)', () => {
  it('every set has its light, dark and same-as-phone colours and a name in three languages', async () => {
    const { PALETTES } = await import('./theme')
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/index.css', 'utf8')
    // "colorful" is the base :root itself
    for (const p of PALETTES.filter((x) => x !== 'colorful')) {
      expect(css, p).toContain(`:root[data-palette='${p}']:not([data-theme='dark'])`)
      expect(css, p).toContain(`:root[data-palette='${p}'][data-theme='dark']`)
      expect(css, p).toContain(`:root[data-palette='${p}'][data-theme='system']`)
    }
    for (const lang of ['en', 'ur', 'roman']) {
      const more = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).more
      for (const p of PALETTES) expect(more[`look${p[0].toUpperCase()}${p.slice(1)}`], `${lang} ${p}`).toBeTruthy()
    }
  })
  it('applies a new set, and a set this build does not know falls back to Modern', async () => {
    const { useTheme, apply } = await import('./theme')
    useTheme.getState().setPalette('lime')
    expect(document.documentElement.dataset.palette).toBe('lime')
    apply({ palette: 'neon' as never })
    expect(document.documentElement.dataset.palette).toBe('modern')
    useTheme.getState().reset()
    expect(document.documentElement.dataset.palette).toBe('modern')
  })
})
