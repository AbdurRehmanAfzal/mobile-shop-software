/** The parts the redesigned pages are built from (ADR-132, docs/43 §2): a figure card, the list +
 *  inspector pair, a row of pills, a tab strip, a drawer and the frame of a printed slip's preview.
 *  They draw with the design tokens only, so every colour set, dark mode and Urdu (RTL) work; a
 *  text is a locale key or a ready string, as in `ui.tsx`. */

import { X, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BiLabel, useLang, type BiText } from './Bilingual'
import { BtnText, Sheet } from './ui'
import Help from './Help'
import { useLaptop } from '@/lib/useMedia'

type Text = string | BiText
export type Tone = 'plain' | 'hero' | 'in' | 'out' | 'wait' | 'go'

const CARD: Record<Tone, string> = {
  plain: 'border-line bg-surface text-ink',
  hero: 'border-transparent bg-hero text-hero-text shadow-hero',
  in: 'border-emerald/30 bg-emerald-tint text-emerald-deep',
  out: 'border-payable/30 bg-payable-tint text-payable',
  wait: 'border-receivable/30 bg-receivable-tint text-receivable',
  go: 'border-transparent bg-sell text-sell-fg',
}

/** A figure with its label: the row of cards on top of a page. `value` is given ready (a
 *  `<MoneyText>`, a count); `note` is the small line under it; with `onClick` the card is a button. */
export function StatCard({ label, value, note, tone = 'plain', icon: Icon, badge, help, onClick, on, testid }: {
  label: Text; value: ReactNode; note?: ReactNode; tone?: Tone; icon?: LucideIcon; badge?: ReactNode; help?: string; onClick?: () => void; on?: boolean; testid?: string
}) {
  const { ur, pick, cls } = useLang()
  const box = `flex min-w-0 flex-col gap-1 rounded-3xl border p-4 text-start ${CARD[tone]} ${on ? 'ring-2 ring-ink' : ''}`
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className={`min-w-0 opacity-80 ${ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'}`}>{pick(label)}{help ? <> <Help term={help} /></> : null}</span>
        {badge ?? (Icon ? <Icon size={18} strokeWidth={2} className="shrink-0 opacity-70" /> : null)}
      </span>
      <span className="num font-display text-2xl font-extrabold leading-tight tracking-[-0.01em]" dir="ltr">{value}</span>
      {note ? <span className={`opacity-80 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{note}</span> : null}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={on} className={`tap ${box}`} data-testid={testid}>{body}</button>
    : <div className={box} data-testid={testid}>{body}</div>
}

/** the row of figure cards: two to a row on a phone, all in one row on a laptop */
export function StatRow({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const lg = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[cols]
  return <div className={`grid grid-cols-2 gap-2.5 ${lg}`}>{children}</div>
}

/** A list with the chosen row's details beside it. On a laptop both show, the details staying in
 *  view while the list scrolls; on a phone the details replace the list while `open` (the page
 *  gives a way back, usually by clearing its choice). */
export function SplitView({ list, detail, open, wide = false }: { list: ReactNode; detail: ReactNode; open: boolean; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start" data-testid="split">
      <div className={`min-w-0 flex-1 ${open ? 'max-lg:hidden' : ''}`} data-testid="split-list">{list}</div>
      <div className={`min-w-0 lg:sticky lg:top-20 lg:shrink-0 ${wide ? 'lg:w-[46%]' : 'lg:w-[40%]'} ${open ? '' : 'max-lg:hidden'}`} data-testid="split-detail">{detail}</div>
    </div>
  )
}

export interface Option<T extends string> { value: T; label: Text; count?: number; icon?: LucideIcon; testid?: string }

/** One of several, as pills that wrap (a kind, a brand, a condition) — in place of a dropdown.
 *  `segmented` draws them as one joined control for two to four short choices. */
export function Pills<T extends string>({ options, value, onChange, segmented = false, label, testid }: {
  options: Option<T>[]; value: T | null; onChange: (v: T) => void; segmented?: boolean; label?: Text; testid?: string
}) {
  const { ur, pick, cls } = useLang()
  const size = ur ? cls('sm') : 'text-[13px]'
  return (
    <div role="radiogroup" aria-label={label ? pick(label) : undefined} className={segmented ? 'inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-ground p-1' : 'flex flex-wrap gap-1.5'} data-testid={testid}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} data-testid={o.testid}
            className={`tap flex min-h-10 shrink-0 items-center gap-1.5 px-3 font-bold transition-colors ${size} ${segmented ? 'rounded-xl' : 'rounded-full border'} ${on ? 'border-ink bg-ink text-ground' : segmented ? 'text-muted hover:text-ink' : 'border-line bg-surface text-ink hover:border-ink/40'}`}>
            {o.icon ? <o.icon size={15} strokeWidth={2} className="shrink-0" /> : null}
            <span>{pick(o.label)}</span>
            {o.count != null ? <span className={`num rounded-full px-1.5 text-[11px] ${on ? 'bg-ground/20' : 'bg-ground text-muted'}`} dir="ltr">{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** The tabs of a page (its parts, not a choice in a form): a strip that scrolls sideways on a phone */
export function TabStrip<T extends string>({ tabs, value, onChange, testid }: { tabs: Option<T>[]; value: T; onChange: (v: T) => void; testid?: string }) {
  const { ur, pick, cls } = useLang()
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" data-testid={testid}>
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <button key={t.value} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.value)} data-testid={t.testid}
            className={`tap flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3.5 font-bold transition-colors ${ur ? cls('sm') : 'text-sm'} ${on ? 'bg-ink text-ground' : 'text-muted hover:bg-surface hover:text-ink'}`}>
            {t.icon ? <t.icon size={16} strokeWidth={2} className="shrink-0" /> : null}
            <span>{pick(t.label)}</span>
            {t.count != null ? <span className={`num rounded-full px-1.5 text-[11px] ${on ? 'bg-ground/20' : 'bg-receivable-tint text-receivable'}`} dir="ltr">{t.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** An entry form that opens over the page: from the side on a laptop, the usual sheet on a phone */
export function Drawer({ open, onClose, title, children, foot }: { open: boolean; onClose: () => void; title: Text; children: ReactNode; foot?: ReactNode }) {
  const laptop = useLaptop()
  useEffect(() => {
    if (!open || !laptop) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, laptop, onClose])
  if (!laptop) return <Sheet open={open} onClose={onClose} title={title}>{children}{foot ? <div className="mt-4">{foot}</div> : null}</Sheet>
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/40 backdrop-blur-sm" onClick={onClose} data-testid="drawer-backdrop">
      <div role="dialog" aria-modal="true" className="flex h-full w-full max-w-[460px] flex-col border-s border-line bg-ground shadow-hero" onClick={(e) => e.stopPropagation()} data-testid="drawer">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <BiLabel text={title} size="lg" bold />
          <button type="button" aria-label="Close" onClick={onClose} className="tap flex min-h-12 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink">
            <X size={18} />
            <BtnText k={'common.close'} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {foot ? <div className="border-t border-line bg-surface p-4">{foot}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/** The frame around a printed page's preview (a bill, a slip, a sticker). What is inside is the
 *  server's own page (ADR-114, ADR-119) — this only holds it at the paper's width; printed paper is
 *  white in every colour set, so the frame does not follow the theme. */
export function SlipFrame({ title, width = 80, children, right }: { title: Text; width?: 58 | 80; children: ReactNode; right?: ReactNode }) {
  const { ur, pick, cls } = useLang()
  return (
    <div className="flex flex-col gap-2" data-testid="slip-frame">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-2 text-muted ${ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'}`}><span className="h-2 w-2 rounded-full bg-emerald" />{pick(title)}</span>
        {right ?? <span className="font-mono text-[11px] text-muted" dir="ltr">{width} mm</span>}
      </div>
      <div className={`mx-auto w-full overflow-hidden rounded-2xl border border-line bg-white text-black shadow-hero ${width === 58 ? 'max-w-[240px]' : 'max-w-[320px]'}`}>{children}</div>
    </div>
  )
}
