import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
/** the look: Professional (default), Navy, or the earlier Colorful tiles */
export type Palette = 'pro' | 'navy' | 'colorful'

function apply(theme: Theme, palette: Palette = 'pro') {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.palette = palette
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0B100E' : '#0E1613')
}

interface ThemeState {
  theme: Theme
  palette: Palette
  setTheme: (t: Theme) => void
  setPalette: (p: Palette) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      palette: 'pro',
      setTheme: (theme) => {
        apply(theme, get().palette)
        set({ theme })
      },
      setPalette: (palette) => {
        apply(get().theme, palette)
        set({ palette })
      },
    }),
    {
      name: 'mobileshop.theme',
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'light', state?.palette ?? 'pro'),
    },
  ),
)

apply(useTheme.getState().theme, useTheme.getState().palette)
