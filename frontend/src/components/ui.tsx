/** Shared layout pieces on the design system: page header, sheet, rows, chips, money, empty/loading states. */

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang, type BiText } from './Bilingual'
import { formatMoney } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { ScanButton } from './ScanButton'

export function PageHeader({ title, back = true, right }: { title: string | BiText; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate()
  const { ur } = useLang()
  const Back = ur ? ChevronRight : ChevronLeft
  return (
    <div className="mb-3 flex items-center gap-2">
      {back ? (
        <button type="button" aria-label="Back" onClick={() => nav(-1)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
          <Back size={22} />
        <BtnText k={'common.back'} /></button>
      ) : null}
      <BiLabel text={title} size="lg" bold className="flex-1" />
      {right}
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string | BiText; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-ground p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <BiLabel text={title} size="lg" bold />
          <button type="button" aria-label="Close" onClick={onClose} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
            <X size={18} />
          <BtnText k={'common.close'} /></button>
        </div>
        {children}
      </div>
    </div>
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

export function MoneyText({ value, tone, size = 'md' }: { value: string | number | null | undefined; tone?: 'auto' | 'ink' | 'muted'; size?: 'sm' | 'md' | 'lg' }) {
  const n = Number(value ?? 0)
  const colour = tone === 'ink' ? 'text-ink' : tone === 'muted' ? 'text-muted' : n > 0 ? 'text-receivable' : n < 0 ? 'text-payable' : 'text-muted'
  const sz = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base'
  return (
    <span className={`num ${sz} ${colour}`} dir="ltr">
      {formatMoney(Math.abs(n))}
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
      <ScanButton size="sm" onImei={onChange} />
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

export function Section({ title, children, right }: { title: string | BiText; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <BiLabel text={title} size="sm" tone="text-muted" bold />
        {right}
      </div>
      {children}
    </section>
  )
}

export function KV({ k, v }: { k: string | BiText; v: ReactNode }) {
  const { pick } = useLang()
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted">{pick(k)}</span>
      <span className="text-sm font-semibold text-ink" dir="auto">
        {v}
      </span>
    </div>
  )
}

export function Stepper({ steps, current }: { steps: (string | BiText)[]; current: number }) {
  const { pick } = useLang()
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full ${i <= current ? 'bg-gold' : 'bg-line'}`} />
        ))}
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
