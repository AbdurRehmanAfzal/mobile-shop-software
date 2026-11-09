/** Shared layout pieces on the design system: page header, sheet, rows, chips, money, empty/loading states. */

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang, type BiText } from './Bilingual'
import { formatMoney } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { ScanButton } from './ScanButton'
import Help from './Help'

/** `onBack`: a step-by-step form goes back one step instead of leaving the page */
export function PageHeader({ title, back = true, right, help, onBack }: { title: string | BiText; back?: boolean; right?: ReactNode; help?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate()
  const { ur } = useLang()
  const Back = ur ? ChevronRight : ChevronLeft
  return (
    // narrow phones: when the buttons on the right do not fit beside the title, they move under it
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {back ? (
        <button type="button" aria-label="Back" onClick={() => (onBack ? onBack() : nav(-1))} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
          <Back size={22} />
        <BtnText k={'common.back'} /></button>
      ) : null}
      <div className="flex min-w-[110px] flex-1 items-center gap-1">
        <BiLabel text={title} size="lg" bold />
        {help}
      </div>
      {right ? <div className="ms-auto flex shrink-0">{right}</div> : null}
    </div>
  )
}

/** A bottom sheet. Owner 2026-11-09: a tap beside a form by mistake closed it and everything typed
 *  was lost. Once anything inside has been typed or chosen, a tap outside no longer closes it: a hint
 *  points to Close instead. A sheet nobody touched (help, a list to look at) still closes outside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string | BiText; children: ReactNode }) {
  const { pick } = useLang()
  const [touched, setTouched] = useState(false)
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!open) { setTouched(false); setHint(false); return }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(false), 2500)
    return () => clearTimeout(t)
  }, [hint])
  if (!open) return null
  // rendered into <body>: a sheet opened from inside a moved / transformed box (a "?" pinned with
  // translate, a card) would otherwise be placed relative to that box instead of the screen
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); if (touched) setHint(true); else onClose() }} data-testid="sheet-backdrop">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-ground p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} onInput={() => setTouched(true)} onChange={() => setTouched(true)} onClickCapture={(e) => { if ((e.target as HTMLElement).closest('[aria-pressed],[aria-checked],[role="radio"],[role="switch"],input,select,textarea')) setTouched(true) }}>
        <div className="mb-4 flex items-center justify-between">
          <BiLabel text={title} size="lg" bold />
          <button type="button" aria-label="Close" onClick={onClose} className={`tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border ${hint ? 'border-payable bg-payable-tint text-payable' : 'border-line bg-surface'}`}>
            <X size={18} />
          <BtnText k={'common.close'} /></button>
        </div>
        {hint ? <div role="status" className="mb-3 rounded-2xl bg-payable-tint px-4 py-2 text-sm font-bold text-payable" data-testid="sheet-keep">{pick('common.sheetKeep')}</div> : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Row({ title, sub, right, onClick, icon, iconTone = 'bg-emerald-tint text-emerald-deep' }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; icon?: ReactNode; iconTone?: string }) {
  const { ur } = useLang()
  const Chev = ur ? ChevronLeft : ChevronRight
  const inner = (
    <>
      {icon ? <span className={`well h-10 w-10 shrink-0 ${iconTone}`}>{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">{title}</div>
        {sub ? <div className="truncate text-sm text-muted">{sub}</div> : null}
      </div>
      {right ? <div className="shrink-0 text-end">{right}</div> : null}
      {onClick ? <Chev size={18} className="shrink-0 text-muted/60" /> : null}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-3 py-3 text-start'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} tap`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <div className="card divide-y divide-line p-0">{children}</div>
}

/** Money with its sign told apart. `auto` (the default) colours it — green to get, red to give — and
 *  shows the amount alone, for places that say "lena hai / dena hai" beside it. With `ink` / `muted`
 *  the colour says nothing, so a figure below zero carries "−"; `signed` always does, for a profit
 *  that can be a loss (owner 2026-11-05: a minus must never read as a plus). */
export function MoneyText({ value, tone, size = 'md', signed }: { value: string | number | null | undefined; tone?: 'auto' | 'ink' | 'muted'; size?: 'sm' | 'md' | 'lg'; signed?: boolean }) {
  const n = Number(value ?? 0)
  const colour = tone === 'ink' ? 'text-ink' : tone === 'muted' ? 'text-muted' : n > 0 ? 'text-receivable' : n < 0 ? 'text-payable' : 'text-muted'
  const sz = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base'
  const minus = n < 0 && (signed || tone === 'ink' || tone === 'muted')
  return (
    <span className={`num ${sz} ${colour}`} dir="ltr">
      {minus ? '− ' : ''}{formatMoney(Math.abs(n))}
    </span>
  )
}

/** "Lena hai / Dena hai" wording for a party balance. */
export function BalanceLabel({ value }: { value: string | number | null | undefined }) {
  const n = Number(value ?? 0)
  const { pick } = useLang()
  const key = n > 0 ? 'party.receivable' : n < 0 ? 'party.payable' : 'party.clear'
  return (
    <div className="flex flex-col items-end">
      <MoneyText value={n} />
      <span className={`text-xs font-semibold ${n > 0 ? 'text-receivable' : n < 0 ? 'text-payable' : 'text-muted'}`}>{pick(key)}</span>
    </div>
  )
}

export function Chip({ text, tone = 'muted' }: { text: string | BiText; tone?: 'ok' | 'warn' | 'bad' | 'muted' | 'ink' }) {
  const { pick } = useLang()
  const cls = {
    ok: 'bg-emerald-tint text-emerald-deep',
    warn: 'bg-receivable-tint text-receivable',
    bad: 'bg-payable-tint text-payable',
    muted: 'bg-ground text-muted border border-line',
    ink: 'bg-ink text-ground',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{pick(text)}</span>
}

/** with `scan`, a Scan button beside it fills the box with the IMEI read from the barcode */
export function SearchBox({ value, onChange, placeholder, scan }: { value: string; onChange: (v: string) => void; placeholder: string | BiText; scan?: boolean }) {
  const { pick } = useLang()
  const box = (
    <label className="relative block flex-1">
      <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={pick(placeholder)}
        className="min-h-12 w-full rounded-2xl border border-line bg-surface ps-11 pe-4 text-base font-medium text-ink placeholder:text-muted/60 focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/30"
      />
    </label>
  )
  if (!scan) return box
  return (
    <div className="flex gap-2">
      {box}
      <ScanButton size="sm" onImei={onChange} onCode={onChange} />
    </div>
  )
}

export function Empty({ text }: { text: string | BiText }) {
  return (
    <div className="py-12 text-center">
      <BiLabel text={text} size="md" align="center" tone="text-muted" />
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col gap-3 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  )
}

export function ErrorText({ error }: { error: unknown }) {
  const { ur } = useLang()
  if (!error) return null
  const msg = error instanceof ApiError ? (ur ? error.messageUr : error.messageEn) : ur ? 'کچھ غلط ہو گیا' : 'Something went wrong'
  return <div className="rounded-2xl border border-payable/30 bg-payable-tint/40 px-4 py-3 text-sm font-semibold text-payable">{msg}</div>
}

/** What a screen shows while its data is not there: the skeleton, or — when the request failed —
 *  the reason and a retry button (never a skeleton forever). */
export function Pending({ error, retry }: { error: unknown; retry?: () => unknown }) {
  if (!error) return <Loading />
  return (
    <div className="flex flex-col items-start gap-2 py-2" data-testid="load-error">
      <ErrorText error={error} />
      {retry ? (
        <button type="button" onClick={() => retry()} className="tap min-h-10 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink">
          <BiLabel text="offline.retry" size="sm" />
        </button>
      ) : null}
    </div>
  )
}

/** `help`: a key under `help.` — a "?" with an explanation and an example beside the title (docs/33) */
export function Section({ title, children, right, help }: { title: string | BiText; children: ReactNode; right?: ReactNode; help?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1"><BiLabel text={title} size="sm" tone="text-muted" bold />{help ? <Help term={help} size="sm" /> : null}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

export function KV({ k, v, help }: { k: string | BiText; v: ReactNode; help?: string }) {
  const { pick } = useLang()
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-1 text-sm text-muted">{pick(k)}{help ? <Help term={help} size="sm" /> : null}</span>
      <span className="text-sm font-semibold text-ink" dir="auto">
        {v}
      </span>
    </div>
  )
}

/** `onStep`: an earlier step can be tapped to go back to it (nothing filled in is lost) */
export function Stepper({ steps, current, onStep }: { steps: (string | BiText)[]; current: number; onStep?: (i: number) => void }) {
  const { pick } = useLang()
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) =>
          onStep && i < current ? (
            <button key={i} type="button" aria-label={`${i + 1}/${steps.length} · ${pick(s)}`} onClick={() => onStep(i)} className="tap -my-2 flex h-6 items-center" data-testid={`step-${i + 1}`}>
              <span className="h-1.5 w-full rounded-full bg-gold" />
            </button>
          ) : (
            <div key={i} className={`h-1.5 rounded-full ${i <= current ? 'bg-gold' : 'bg-line'}`} />
          ),
        )}
      </div>
      <div className="text-sm font-semibold text-muted">
        {current + 1}/{steps.length} · {pick(steps[current])}
      </div>
    </div>
  )
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

/** "22-10-2026 3:05 PM" in the viewer's local time. Server times without a zone are UTC. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  const h = d.getHours() % 12 || 12
  return `${fmtDate(d.toISOString())} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

/** A small action that must look like a button, never a bare text link: icon + words in a pill. */
export function IconChip({ icon, text, onClick, tone = 'border-line bg-surface text-ink' }: { icon: ReactNode; text: string | BiText; onClick: () => void; tone?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <button type="button" onClick={onClick} className={`tap inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3 font-bold ${tone} ${ur ? cls('sm') : 'text-sm'}`}>
      <span className="shrink-0">{icon}</span>
      <span className="leading-tight">{pick(text)}</span>
    </button>
  )
}

/** The words under (or beside) an icon button: users are not technical, so no icon goes unlabelled. */
export function BtnText({ k }: { k: string | BiText }) {
  const { pick, ur } = useLang()
  return <span className={`max-w-[84px] text-center leading-tight ${ur ? 'ur text-[12px] leading-snug' : 'text-[11px] font-bold'}`}>{pick(k)}</span>
}
