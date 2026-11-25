/** Pieces shared by the shop audit's pages in the new product (mock-up 22, ADR-134): the profit eye's
 *  state, the money texts, cards, figure tiles, sub-tabs kept in the address, the section's own
 *  report (PDF / Excel of the live `/shop-audit/report` for the same sections and period) and the
 *  server's notes. Nothing here works out a figure — it only shows what a page passes in. */

import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { create } from 'zustand'
import { FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useAuditPeriod } from '@/features/audit/period'

export type M = string

/** the bar's "profit visible" eye: hides cost and profit on screen (the server still decides who gets them) */
export const useAuditEye = create<{ show: boolean; toggle: () => void }>((set) => ({ show: true, toggle: () => set((s) => ({ show: !s.show })) }))

export const n = (v: M | number | null | undefined) => (v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
export const signed = (v: M | number | null | undefined) => (v == null ? '—' : `${Number(v) < 0 ? '−' : ''}${n(v)}`)
export const rs = (v: M | number | null | undefined) => (v == null ? '—' : withCur(signed(v)))

/** a cost / profit figure: masked when the eye is shut */
export function Secret({ children }: { children: ReactNode }) {
  const show = useAuditEye((s) => s.show)
  return show ? <>{children}</> : <span className="tracking-widest">•••••</span>
}

export const card = 'rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'
export const soft = 'rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800'
export const Wait = () => <div className="py-16 text-center text-xs text-slate-400">…</div>

export function Caps({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ur, cls } = useLang()
  return <span className={`${ur ? `font-bold ${cls('sm')}` : 'text-[10px] font-extrabold uppercase tracking-wider'} ${className}`}>{children}</span>
}

export function H({ children, right, testid }: { children: ReactNode; right?: ReactNode; testid?: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2" data-testid={testid}><h3 className="font-display font-extrabold text-sm sm:text-base">{children}</h3>{right}</div>
}

type Tone = 'lime' | 'dark' | 'amber' | 'rose' | 'emerald' | 'sky' | 'plain'
const TONES: Record<Tone, string> = {
  lime: 'bg-[#A3E635] text-obsidian-950 border-transparent',
  dark: 'bg-obsidian-950 text-white border-slate-800',
  amber: 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200',
  rose: 'bg-rose-500/10 border-rose-500/25 text-rose-800 dark:text-rose-200',
  emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-200',
  sky: 'bg-sky-500/10 border-sky-500/25 text-sky-900 dark:text-sky-200',
  plain: 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800',
}

/** a figure tile as the drawing's: caps label, a big number, a line under it; a link when `to` */
export function Tile({ label, value, sub, tone = 'plain', to, onClick, Icon, testid, valueTone = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; to?: string; onClick?: () => void; Icon?: LucideIcon; testid?: string; valueTone?: string }) {
  const cls = `block text-start p-4 sm:p-5 rounded-2xl border transition ${TONES[tone]} ${to || onClick ? 'cursor-pointer hover:border-[#A3E635]' : ''}`
  const body = (
    <>
      <div className={`flex items-center gap-1.5 ${tone === 'dark' ? 'text-slate-400' : tone === 'lime' ? '' : 'opacity-70'}`}>{Icon ? <Icon className="w-3.5 h-3.5" /> : null}<Caps>{label}</Caps></div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl mt-1.5 ${valueTone || (tone === 'dark' ? 'text-[#A3E635]' : '')}`} dir="ltr">{value}</div>
      {sub ? <div className={`text-xs mt-1.5 ${tone === 'dark' ? 'text-slate-400' : tone === 'lime' ? 'font-bold' : 'opacity-75'}`}>{sub}</div> : null}
    </>
  )
  if (to) return <Link to={to} className={cls} data-testid={testid}>{body}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full`} data-testid={testid}>{body}</button>
  return <div className={cls} data-testid={testid}>{body}</div>
}

/** sub-tabs kept in the address (`?tab=`), the drawing's segmented control */
export function useTab<T extends string>(tabs: readonly T[]): [T, (t: T) => void] {
  const [sp, setSp] = useSearchParams()
  const tab = (tabs.find((t) => t === sp.get('tab')) ?? tabs[0]) as T
  const set = (t: T) => { const o = new URLSearchParams(sp); o.set('tab', t); setSp(o, { replace: true }) }
  return [tab, set]
}

export function Segs<T extends string>({ tabs, value, onChange, label, testid }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; label: (t: T) => ReactNode; testid: string }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto p-1 rounded-xl bg-slate-100 dark:bg-obsidian-950 border border-slate-200 dark:border-slate-800" role="tablist">
      {tabs.map((t) => <button key={t} type="button" onClick={() => onChange(t)} aria-pressed={value === t} data-testid={`${testid}-${t}`} className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-display font-extrabold cursor-pointer ${value === t ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'text-slate-600 dark:text-slate-300'}`}>{label(t)}</button>)}
    </div>
  )
}

/** the section's report: the live audit report with these sections, the same period */
export function SectionReport({ sections, name, testid }: { sections: string[]; name: string; testid: string }) {
  const { pick, ur } = useLang()
  const { query } = useAuditPeriod()
  const [busy, setBusy] = useState(false)
  const url = (f: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&sections=${sections.join(',')}&mode=detail&format=${f}${ur ? '&lang=ur' : ''}`
  return (
    <div className="flex gap-2" data-testid={testid}>
      <button type="button" onClick={() => void openPrintable(url('pdf'))} className="px-3 py-1.5 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"><FileText className="w-3.5 h-3.5" />PDF</button>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadFile(url('xlsx'), `${name}.xlsx`) } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('counter.excel')}</button>
    </div>
  )
}

/** the server's notes (English); in Urdu the audit's own limitations line */
export function Notes({ notes }: { notes?: string[] }) {
  const { ur, pick } = useLang()
  if (ur) return <p className="text-[11px] text-slate-500">{pick('audit.limitations')}</p>
  return notes?.length ? <ul className="list-disc ps-5 text-[11px] text-slate-500 space-y-0.5">{notes.map((x, i) => <li key={i}>{x}</li>)}</ul> : null
}

export function Pill({ tone, children }: { tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'slate'; children: ReactNode }) {
  const t = { emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', sky: 'bg-sky-500/15 text-sky-800 dark:text-sky-300', slate: 'bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300' }[tone]
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${t}`}>{children}</span>
}

/** a table in the drawing's style that scrolls sideways on a phone */
export function Table({ head, children, testid }: { head: ReactNode[]; children: ReactNode; testid?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="w-full text-start text-xs">
        <thead><tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-400">{head.map((h, i) => <th key={i} className="py-2 px-3 text-start font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  )
}

/** the pay state of a bill as the server names it (`audit.trade.st.*`) */
export function PayPill({ status, due }: { status: string; due?: M | null }) {
  const { pick } = useLang()
  const tone = status === 'paid' ? 'emerald' : status === 'returned' ? 'slate' : 'rose'
  return <Pill tone={tone}>{pick(`audit.trade.st.${status}`)}{due && Number(due) > 0 ? <> · <span dir="ltr">{n(due)}</span></> : null}</Pill>
}

/** the server's figures as bars beside each other (the length only compares them) */
export function HBars({ rows, tone, testid }: { rows: { key: string; label: ReactNode; value: M | number; hint?: ReactNode }[]; tone: string; testid?: string }) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(Number(r.value))))
  if (!rows.length) return <p className="text-xs text-slate-400">—</p>
  return (
    <div className="space-y-2" data-testid={testid}>
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold">{r.label}{r.hint ? <span className="font-normal text-slate-400"> · {r.hint}</span> : null}</span><b className="font-mono" dir="ltr">{n(r.value)}</b></div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Number(r.value) ? Math.max(3, Math.round((Math.abs(Number(r.value)) / top) * 100)) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
