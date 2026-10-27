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
