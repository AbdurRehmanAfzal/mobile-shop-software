import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
/** the look: Modern (Stripe x Google, default), Professional, Navy, or the earlier Colorful tiles */
export type Palette = 'modern' | 'pro' | 'navy' | 'colorful'

function apply(theme: Theme, palette: Palette = 'modern') {
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
      palette: 'modern',
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
      name: 'mobileshop.look',
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'light', state?.palette ?? 'modern'),
    },
  ),
)

apply(useTheme.getState().theme, useTheme.getState().palette)
