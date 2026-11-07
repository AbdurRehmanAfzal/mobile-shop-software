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
