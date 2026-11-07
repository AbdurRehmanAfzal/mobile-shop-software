import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
/** the colours: Modern (Stripe x Google, default), Professional, Navy, or the earlier Colorful tiles */
export type Palette = 'modern' | 'pro' | 'navy' | 'colorful'
/** owner 2026-11-07: how the dashboard and the laptop side panel are laid out */
export type Layout = 'classic' | 'tiles' | 'simple' | 'bold'
/** the main button / highlight colour; 'auto' keeps the colours' own */
export type Accent = 'auto' | 'emerald' | 'blue' | 'violet' | 'rose' | 'orange' | 'teal'
export type TextSize = 'normal' | 'large' | 'xl'
export type Corners = 'auto' | 'round' | 'soft' | 'square'
export type Font = 'auto' | 'inter' | 'manrope' | 'system'

export interface Look {
  theme: Theme
  palette: Palette
  layout: Layout
  accent: Accent
  text: TextSize
  corners: Corners
  font: Font
}

export const DEFAULT_LOOK: Look = { theme: 'light', palette: 'modern', layout: 'classic', accent: 'auto', text: 'normal', corners: 'auto', font: 'auto' }

/** RGB triplets for --emerald / --emerald-deep / --emerald-tint, light then dark */
export const ACCENTS: Record<Exclude<Accent, 'auto'>, { light: [string, string, string]; dark: [string, string, string]; swatch: string }> = {
  emerald: { light: ['30 107 69', '20 72 47', '221 239 227'], dark: ['38 128 84', '170 225 192', '22 48 35'], swatch: '#1E6B45' },
  blue: { light: ['37 99 235', '30 64 175', '219 234 254'], dark: ['59 130 246', '191 219 254', '23 37 84'], swatch: '#2563EB' },
  violet: { light: ['109 40 217', '76 29 149', '237 233 254'], dark: ['139 92 246', '221 214 254', '46 16 101'], swatch: '#6D28D9' },
  rose: { light: ['225 29 72', '159 18 57', '255 228 230'], dark: ['244 63 94', '254 205 211', '76 5 25'], swatch: '#E11D48' },
  orange: { light: ['234 88 12', '154 52 18', '255 237 213'], dark: ['249 115 22', '254 215 170', '67 20 7'], swatch: '#EA580C' },
  teal: { light: ['13 148 136', '17 94 89', '204 251 241'], dark: ['20 184 166', '153 246 228', '4 47 46'], swatch: '#0D9488' },
}
const CORNERS: Record<Exclude<Corners, 'auto'>, [string, string]> = { round: ['18px', '24px'], soft: ['10px', '14px'], square: ['4px', '6px'] }
const FONTS: Record<Exclude<Font, 'auto'>, string> = { inter: 'Inter', manrope: 'Manrope', system: 'system-ui' }
const TEXT: Record<TextSize, string> = { normal: '', large: '109%', xl: '118%' }

const isDark = (theme: Theme) => theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

export function apply(look: Partial<Look>) {
  if (typeof document === 'undefined') return
  const l = { ...DEFAULT_LOOK, ...look }
  const root = document.documentElement
  root.dataset.theme = l.theme
  root.dataset.palette = l.palette
  root.dataset.layout = l.layout
  const dark = isDark(l.theme)
  const set = (k: string, v: string | null) => (v ? root.style.setProperty(k, v) : root.style.removeProperty(k))
  const acc = l.accent !== 'auto' ? ACCENTS[l.accent]?.[dark ? 'dark' : 'light'] : null
  set('--emerald', acc?.[0] ?? null)
  set('--emerald-deep', acc?.[1] ?? null)
  set('--emerald-tint', acc?.[2] ?? null)
  const c = l.corners !== 'auto' ? CORNERS[l.corners] : null
  set('--r-btn', c?.[0] ?? null)
  set('--r-card', c?.[1] ?? null)
  set('--font-sans', l.font !== 'auto' ? FONTS[l.font] ?? null : null)
  root.style.fontSize = TEXT[l.text] ?? ''
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0B100E' : '#0E1613')
}

interface ThemeState extends Look {
  setTheme: (t: Theme) => void
  setPalette: (p: Palette) => void
  setLook: (p: Partial<Look>) => void
  reset: () => void
}

const pickLook = (s: Look): Look => ({ theme: s.theme, palette: s.palette, layout: s.layout, accent: s.accent, text: s.text, corners: s.corners, font: s.font })

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_LOOK,
      setTheme: (theme) => get().setLook({ theme }),
      setPalette: (palette) => get().setLook({ palette }),
      setLook: (p) => {
        const next = { ...pickLook(get()), ...p }
        apply(next)
        set(p)
      },
      reset: () => {
        apply(DEFAULT_LOOK)
        set({ ...DEFAULT_LOOK })
      },
    }),
    {
      name: 'mobileshop.look',
      onRehydrateStorage: () => (state) => apply(state ? pickLook({ ...DEFAULT_LOOK, ...state }) : DEFAULT_LOOK),
    },
  ),
)

apply(pickLook(useTheme.getState()))
// "same as phone": the accent's dark shades follow the phone switching to dark and back
if (typeof window !== 'undefined') window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => apply(pickLook(useTheme.getState())))

/** the current layout, for the dashboard and the side panel */
export const useLayout = () => useTheme((s) => s.layout)
