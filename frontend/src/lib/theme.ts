import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

function apply(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0B100E' : '#0E1613')
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        apply(theme)
        set({ theme })
      },
    }),
    {
      name: 'mobileshop.theme',
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'light'),
    },
  ),
)

apply(useTheme.getState().theme)
