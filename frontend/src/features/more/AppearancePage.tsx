/** Appearance (owner 2026-11-07): the user picks how the app looks — light / dark, the design of
 *  the dashboard and the laptop side panel, the colours, the main colour, text size, corners and
 *  font. Every choice shows straight away and is kept on this phone or computer (lib/theme.ts). */

import { Check, Monitor, Moon, RotateCcw, Sun, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ACCENTS, DEFAULT_LOOK, useTheme, type Accent, type Corners, type Font, type Layout, type Look, type Palette, type TextSize, type Theme } from '@/lib/theme'

const THEMES: { v: Theme; text: string; Icon: LucideIcon }[] = [
  { v: 'light', text: 'more.themeLight', Icon: Sun },
  { v: 'dark', text: 'more.themeDark', Icon: Moon },
  { v: 'system', text: 'more.themeSystem', Icon: Monitor },
]
const LAYOUTS: Layout[] = ['classic', 'tiles', 'simple', 'bold']
/** a few colours of each set, for the swatch strip (the real values live in index.css) */
const PALETTES: { v: Palette; text: string; sw: string[] }[] = [
  { v: 'modern', text: 'more.lookModern', sw: ['#0A2540', '#635BFF', '#F6F9FC'] },
  { v: 'pro', text: 'more.lookPro', sw: ['#111827', '#0F766E', '#F5F6F8'] },
  { v: 'navy', text: 'more.lookNavy', sw: ['#102040', '#15803D', '#B08942'] },
  { v: 'colorful', text: 'more.lookColorful', sw: ['#1B1F24', '#1E6B45', '#C8A14F'] },
]
const TEXTS: { v: TextSize; px: string }[] = [{ v: 'normal', px: '15px' }, { v: 'large', px: '18px' }, { v: 'xl', px: '21px' }]
const CORNER_SET: { v: Corners; r: string }[] = [{ v: 'auto', r: '12px' }, { v: 'round', r: '20px' }, { v: 'soft', r: '10px' }, { v: 'square', r: '3px' }]
const FONT_SET: { v: Font; family: string }[] = [{ v: 'auto', family: 'var(--font-sans)' }, { v: 'inter', family: 'Inter' }, { v: 'manrope', family: 'Manrope' }, { v: 'system', family: 'system-ui' }]

export default function AppearancePage() {
  const look = useTheme()
  const set = (p: Partial<Look>) => look.setLook(p)
  const changed = (Object.keys(DEFAULT_LOOK) as (keyof Look)[]).some((k) => look[k] !== DEFAULT_LOOK[k])
  return (
    <div className="flex flex-col gap-5" data-testid="appearance-page">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1"><BiLabel text="look.title" size="xl" bold /><Help term="look.page" /></span>
        <BiLabel text="look.hint" size="sm" tone="text-muted" />
      </div>

      <Section title="look.theme" help="look.theme">
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(({ v, text, Icon }) => (
            <Choice key={v} on={look.theme === v} onClick={() => set({ theme: v })} testid={`look-theme-${v}`}>
              <Icon size={22} /><BiLabel text={text} size="sm" bold tone="text-current" align="center" />
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="look.design" help="look.design">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {LAYOUTS.map((v) => (
            <Choice key={v} on={look.layout === v} onClick={() => set({ layout: v })} testid={`look-layout-${v}`} tall>
              <DesignPreview layout={v} />
              <BiLabel text={`look.designs.${v}.name`} size="md" bold tone="text-current" align="center" />
              <BiLabel text={`look.designs.${v}.hint`} size="sm" tone="text-muted" align="center" />
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="look.palette" help="look.palette">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {PALETTES.map(({ v, text, sw }) => (
            <Choice key={v} on={look.palette === v} onClick={() => set({ palette: v })} testid={`look-palette-${v}`}>
              <span className="flex overflow-hidden rounded-lg border border-line">{sw.map((c) => <span key={c} className="h-6 w-8" style={{ background: c }} />)}</span>
              <BiLabel text={text} size="sm" bold tone="text-current" align="center" />
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="look.accent" help="look.accent">
        <div className="flex flex-wrap gap-2.5">
          {(['auto', ...Object.keys(ACCENTS)] as Accent[]).map((v) => {
            const on = look.accent === v
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => set({ accent: v })} className="tap flex w-[68px] flex-col items-center gap-1" data-testid={`look-accent-${v}`}>
                <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${on ? 'border-ink' : 'border-transparent'}`}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ background: v === 'auto' ? 'conic-gradient(#1E6B45, #2563EB, #6D28D9, #E11D48, #EA580C, #0D9488, #1E6B45)' : ACCENTS[v as Exclude<Accent, 'auto'>].swatch }}>
                    {on ? <Check size={18} strokeWidth={3} /> : null}
                  </span>
                </span>
                <BiLabel text={`look.accents.${v}`} size="sm" bold={on} tone={on ? 'text-ink' : 'text-muted'} align="center" />
              </button>
            )
          })}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="look.text" help="look.text">
          <div className="grid grid-cols-3 gap-2">
            {TEXTS.map(({ v, px }) => (
              <Choice key={v} on={look.text === v} onClick={() => set({ text: v })} testid={`look-text-${v}`}>
                <span className="font-extrabold leading-none" style={{ fontSize: px }} dir="ltr">Aa</span>
                <BiLabel text={`look.texts.${v}`} size="sm" bold tone="text-current" align="center" />
              </Choice>
            ))}
          </div>
        </Section>
        <Section title="look.corners" help="look.corners">
          <div className="grid grid-cols-4 gap-2">
            {CORNER_SET.map(({ v, r }) => (
              <Choice key={v} on={look.corners === v} onClick={() => set({ corners: v })} testid={`look-corners-${v}`}>
                <span className="h-8 w-10 border-2 border-current bg-emerald-tint" style={{ borderRadius: r }} />
                <BiLabel text={`look.cornerSet.${v}`} size="sm" bold tone="text-current" align="center" />
              </Choice>
            ))}
          </div>
        </Section>
        <Section title="look.font" help="look.font">
          <div className="grid grid-cols-4 gap-2">
            {FONT_SET.map(({ v, family }) => (
              <Choice key={v} on={look.font === v} onClick={() => set({ font: v })} testid={`look-font-${v}`}>
                <span className="text-lg font-extrabold leading-none" style={{ fontFamily: family }} dir="ltr">1,250</span>
                <BiLabel text={`look.fonts.${v}`} size="sm" bold tone="text-current" align="center" />
              </Choice>
            ))}
          </div>
        </Section>
      </div>

      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiButton text="look.reset" variant="secondary" full icon={<RotateCcw size={20} />} disabled={!changed} onClick={look.reset} data-testid="look-reset" /></div>
        <Help term="look.reset" size="sm" />
      </div>
    </div>
  )
}

function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="flex items-center gap-1"><BiLabel text={title} size="md" bold /><Help term={help} size="sm" /></span>
      {children}
    </section>
  )
}

function Choice({ on, onClick, testid, tall = false, children }: { on: boolean; onClick: () => void; testid: string; tall?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid} className={`tap relative flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-surface px-2 text-ink transition-colors ${tall ? 'py-3' : 'min-h-[76px] py-2'} ${on ? 'border-emerald shadow-cta' : 'border-line hover:border-ink/30'}`}>
      {on ? <span className="absolute -end-1.5 -top-1.5 z-[1] flex h-5 w-5 items-center justify-center rounded-full bg-emerald text-white ring-2 ring-ground"><Check size={13} strokeWidth={3} /></span> : null}
      {children}
    </button>
  )
}

/** a small drawing of each design: the side panel on the left, the dashboard beside it */
function DesignPreview({ layout }: { layout: Layout }) {
  const { dir } = useLang()
  const box = 'h-[72px] w-full max-w-[150px] overflow-hidden rounded-xl border border-line bg-ground p-1.5'
  const panel = (() => {
    if (layout === 'tiles') return <div className="grid w-9 shrink-0 grid-cols-2 content-start gap-0.5">{['bg-sell', 'bg-buy', 'bg-khata', 'bg-stockt', 'bg-repair', 'bg-ret'].map((c) => <span key={c} className={`h-3 rounded-[3px] ${c}`} />)}</div>
    if (layout === 'simple') return <div className="flex w-9 shrink-0 flex-col gap-1 pt-0.5">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'bg-emerald' : 'bg-line'}`} />)}</div>
    if (layout === 'bold') return <div className="flex w-9 shrink-0 flex-col gap-1 rounded-md bg-hero p-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'bg-white/70' : 'bg-white/25'}`} />)}</div>
    return <div className="flex w-9 shrink-0 flex-col gap-0.5">{['bg-sell', 'bg-buy', 'bg-khata', 'bg-stockt', 'bg-repair'].map((c) => <span key={c} className={`h-2 rounded-[3px] ${c}`} />)}</div>
  })()
  const main = (() => {
    if (layout === 'tiles') return <div className="grid flex-1 grid-cols-2 gap-1">{['bg-sell', 'bg-ink', 'bg-emerald-tint', 'bg-khata'].map((c) => <span key={c} className={`rounded-md ${c}`} />)}</div>
    if (layout === 'simple') return <div className="flex flex-1 flex-col gap-1 rounded-md border border-line bg-surface p-1">{[0, 1, 2, 3].map((i) => <span key={i} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-tint" /><span className="h-1 flex-1 rounded-full bg-line" /><span className="h-1.5 w-3 rounded-full bg-ink/60" /></span>)}</div>
    if (layout === 'bold') return <div className="flex flex-1 flex-col gap-1"><span className="flex-[2] rounded-md bg-hero" /><span className="grid flex-1 grid-cols-3 gap-1">{[0, 1, 2].map((i) => <span key={i} className="rounded-sm border border-line bg-surface" />)}</span></div>
    return <div className="grid flex-1 grid-cols-2 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="rounded-md border border-line bg-surface p-0.5"><span className="block h-1.5 w-1.5 rounded-sm bg-emerald-tint" /></span>)}</div>
  })()
  return <div className={box} dir={dir}><div className="flex h-full gap-1.5">{panel}{main}</div></div>
}
