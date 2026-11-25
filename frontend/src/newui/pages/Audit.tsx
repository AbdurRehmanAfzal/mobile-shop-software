/** Shop audit in the new product (ADR-134, ADR-032), drawn from `22-shop-audit-executive-suite.html`
 *  ("Executive shop audit & master ledger"): its own full-screen frame (`AuditFrame`) — the bar with
 *  the shop's mark, Back, "books reconciled" (the server's own checks), the profit eye, the master
 *  ledger, the full audit report (A4), language and dark; the period strip (the drawing's today /
 *  yesterday / this week / this month / all time, the live audit's other presets, from–to and as-of)
 *  with the range the server resolved; and the drawing's tab bar. A tab the new product draws opens
 *  here, the others open the live screen for the same period.
 *
 *  The overview: net sales, real profit, phones in stock, the khata (lene / dene), needs a look now,
 *  the balances start → end → now, the books' own status, the period's flows, money by kind, the
 *  checks, the full report. Everything is the live audit's: `/shop-audit/period`, `/overview`,
 *  `/reconcile`, `/report`. The period lives in the address. The previous period is its own figure —
 *  the drawing's "+14.2% target" and "100% verified" are not worked out (the app works out no
 *  percentage). Not built: the drawing's branch picker (a branch is its own shop: switch shop). */

import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BookOpen, CalendarRange, CheckCircle2, ChevronLeft, ExternalLink, Eye, EyeOff, FileSpreadsheet, FileText,
  Globe, Landmark, Moon, Package, Receipt, ShieldCheck, Smartphone, Sun, Wallet, X, XCircle, type LucideIcon,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useGet } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { PRESETS, useAuditPeriod, type Preset } from '@/features/audit/period'
import type { Overview } from '@/features/audit/OverviewPage'
import { Caps, Secret, card, useAuditEye } from '../auditKit'

type M = string
/** the drawing's tabs, mapped onto the live audit's sections (`covers`); `drawn` ones live in the new product */
export const SECTIONS: { key: string; live: string; drawn?: string; covers: string[] }[] = [
  { key: 'overview', live: '/audit', drawn: '/new/audit', covers: ['overview'] },
  { key: 'finance', live: '/audit/finance', drawn: '/new/audit/finance', covers: ['finance'] },
  { key: 'sales', live: '/audit/sales', drawn: '/new/audit/sales', covers: ['sales'] },
  { key: 'bills', live: '/audit/bills', drawn: '/new/audit/bills', covers: ['bills'] },
  { key: 'udhaar', live: '/audit/udhaar', drawn: '/new/audit/udhaar', covers: ['udhaar', 'lending'] },
  { key: 'stock', live: '/audit/stock', drawn: '/new/audit/stock', covers: ['stock'] },
  { key: 'products', live: '/audit/products', drawn: '/new/audit/products', covers: ['products', 'people'] },
  { key: 'returns', live: '/audit/returns', drawn: '/new/audit/returns', covers: ['returns', 'repairs'] },
  { key: 'staff', live: '/audit/staff', drawn: '/new/audit/staff', covers: ['staff', 'security'] },
  { key: 'ledger', live: '/reports/ledger', drawn: '/new/audit/ledger', covers: [] },
  { key: 'reports', live: '/audit/reports', drawn: '/new/audit/reports', covers: ['reports'] },
]
/** the drawing's five presets first, then the live audit's others */
const ORDER: Preset[] = ['today', 'yesterday', 'this_week', 'this_month', 'all_time', 'last_week', 'last_month', 'this_year', 'custom']
interface Resolved { date_from: string; date_to: string; as_of: string; days: number }
export interface Reconcile { ok: boolean; checks: { key: string; ok: boolean; diff: string | number; name?: string }[] }
/** only the period of the address (preset, from, to, as-of) — what another tab keeps */
export function periodSearch(search: string): string {
  const all = new URLSearchParams(search)
  const q = new URLSearchParams()
  for (const k of ['preset', 'from', 'to', 'as_of']) { const v = all.get(k); if (v) q.set(k, v) }
  const s = q.toString()
  return s ? `?${s}` : ''
}
const n = (v: M | number | null | undefined) => (v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const signed = (v: M | number | null | undefined) => `${Number(v ?? 0) < 0 ? '−' : ''}${withCur(n(v))}`

/** the audit's frame: the bar, the period, the tabs */
export function AuditFrame({ section, children, testid }: { section: string; children: ReactNode; testid: string }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const search = periodSearch(useLocation().search)
  const role = useAuth((s) => s.me?.user.role)
  const shop = useAuth(activeShop)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const eye = useAuditEye()
  const { period, set, query } = useAuditPeriod()
  const { data: resolved } = useGet<Resolved>(['audit-period', query], manager ? `/api/v1/shop-audit/period?${query}` : null)
  const { data: rc } = useGet<Reconcile>(['audit-reconcile', query], manager ? `/api/v1/shop-audit/reconcile?${query}` : null)
  const [asOfOpen, setAsOfOpen] = useState(!!period.asOf)
  const [report, setReport] = useState(false)
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const date = 'px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700'
  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer bg-slate-100 dark:bg-obsidian-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
  return (
    <div className="font-sans bg-[#F2F4F7] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid={testid} data-newui="1" data-file="22">
      <header className="bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-[1640px] mx-auto px-3 sm:px-6 min-h-14 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-2 pe-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0">
              <span className="w-8 h-8 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center">{mark}</span>
              <div className="hidden sm:block"><div className="font-display font-extrabold text-sm tracking-tight leading-none" dir="auto">{ur ? shop?.name_ur || shop?.name : shop?.name}</div><div className={ur ? `ur text-slate-400 ${cls('sm')}` : 'text-[10px] text-slate-400 font-medium mt-0.5'}>{pick('nau.executive')}</div></div>
            </div>
            <button type="button" onClick={() => nav('/new')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 dark:bg-obsidian-800 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0" data-testid="naudit-back"><ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />{pick('nau.back')}</button>
            {rc ? <Link to={`/new/audit${search}#checks`} className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${rc.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'}`} data-testid="naudit-books">{rc.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{pick(rc.ok ? 'nau.booksOk' : 'audit.checksFail')}</Link> : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {manager ? <button type="button" onClick={eye.toggle} aria-pressed={!eye.show} className={btn} data-testid="naudit-eye">{eye.show ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden md:inline">{pick(eye.show ? 'nau.profitShown' : 'nau.profitHidden')}</span></button> : null}
            {manager ? <Link to={`/new/audit/ledger${search}`} className={btn} data-testid="naudit-ledger"><BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nau.tab.ledger')}</span></Link> : null}
            {manager ? <button type="button" onClick={() => setReport(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 cursor-pointer" data-testid="naudit-a4"><FileText className="w-3.5 h-3.5" /><span>{pick('nau.a4')}</span></button> : null}
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-800 cursor-pointer" data-testid="naudit-lang"><Globe className="w-3.5 h-3.5" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-obsidian-950 dark:bg-white text-white dark:text-obsidian-950 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
      </header>
      {!manager ? <div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="naudit-managers"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('naudit.managersOnly')}</p></div></div> : (
        <>
          <section className="bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-14 z-30" data-testid="naudit-period">
            <div className="max-w-[1640px] mx-auto px-3 sm:px-6 py-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto max-w-full">
                  {ORDER.filter((k) => (PRESETS as readonly string[]).includes(k)).map((k) => <button key={k} type="button" onClick={() => set({ preset: k })} aria-pressed={period.preset === k} data-testid={`naudit-p-${k}`} className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap cursor-pointer ${period.preset === k ? 'font-bold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-obsidian-800'}`}>{pick(`audit.preset.${k}`)}</button>)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300"><CalendarRange className="w-3.5 h-3.5" /><span className="font-mono font-semibold text-[11px]" dir="ltr" data-testid="naudit-range">{resolved ? `${fmtDate(resolved.date_from)} → ${fmtDate(resolved.date_to)} (${resolved.days} ${pick('audit.days')})` : ''}</span></span>
                  <button type="button" onClick={() => { if (asOfOpen) set({ asOf: null }); setAsOfOpen(!asOfOpen) }} aria-pressed={asOfOpen} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer border ${asOfOpen ? 'bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-transparent' : 'bg-slate-100 dark:bg-obsidian-800 border-slate-200 dark:border-slate-700'}`} data-testid="naudit-asof">{pick('audit.asOf')}{resolved && period.asOf ? <span dir="ltr"> · {fmtDate(resolved.as_of)}</span> : null}</button>
                </div>
              </div>
              {period.preset === 'custom' || asOfOpen ? (
                <div className="flex flex-wrap items-center gap-2" dir="ltr">
                  {period.preset === 'custom' ? <><input type="date" aria-label="from" value={period.from} max={period.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className={date} data-testid="naudit-from" /><span className="text-slate-400">→</span><input type="date" aria-label="to" value={period.to} min={period.from} max={isoDay(0)} onChange={(e) => e.target.value && set({ to: e.target.value })} className={date} data-testid="naudit-to" /></> : null}
                  {asOfOpen ? <span className="flex items-center gap-1.5"><span className="text-[11px] text-slate-500">{pick('audit.asOfHint')}</span><input type="date" aria-label="as of" value={period.asOf ?? period.to} max={isoDay(0)} onChange={(e) => e.target.value && set({ asOf: e.target.value })} className={date} /></span> : null}
                </div>
              ) : null}
              <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-testid="naudit-sections">
                {SECTIONS.map((s) => s.key === section ? (
                  <span key={s.key} aria-current="page" className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950">{pick(`nau.tab.${s.key}`)}</span>
                ) : s.drawn ? (
                  <Link key={s.key} to={`${s.drawn}${search}`} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800" data-testid={`naudit-tab-${s.key}`}>{pick(`nau.tab.${s.key}`)}</Link>
                ) : (
                  <button key={s.key} type="button" onClick={() => nav(`${s.live}${search}`)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 flex items-center gap-1 cursor-pointer" title={pick('naudit.liveScreen')} data-testid={`naudit-live-${s.key}`}>{pick(`nau.tab.${s.key}`)}<ExternalLink className="w-3 h-3" /></button>
                ))}
              </nav>
            </div>
          </section>
          <main className="max-w-[1640px] w-full mx-auto px-3 sm:px-6 py-5 flex-1 space-y-5">{children}</main>
          {report ? <ReportDrawer onClose={() => setReport(false)} /> : null}
        </>
      )}
    </div>
  )
}

/** the complete audit report as the drawing's "A4 builder": tick the sections, summary or detail, PDF or Excel (the live `/shop-audit/report`) */
export const REPORT_SECTIONS = ['summary', 'insights', 'sales', 'purchases', 'pnl', 'cash', 'expenses', 'tax', 'customers', 'suppliers', 'udhaar', 'lending', 'repairs', 'inventory', 'ageing', 'products', 'invoices', 'verification', 'checks', 'staff', 'security'] as const

export function ReportBuilder({ testid }: { testid: string }) {
  const { pick, ur } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { query } = useAuditPeriod()
  const all = REPORT_SECTIONS.filter((s) => s !== 'security' || role === 'owner')
  const [picked, setPicked] = useState<string[]>([...all])
  const [mode, setMode] = useState<'summary' | 'detail'>('detail')
  const [busy, setBusy] = useState(false)
  const url = (f: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&sections=${picked.join(',')}&mode=${mode}&format=${f}${ur ? '&lang=ur' : ''}`
  return (
    <div className="space-y-3" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-2">
        <Caps className="text-slate-500">{pick('nau.include')}</Caps>
        <button type="button" onClick={() => setPicked(picked.length === all.length ? ['summary'] : [...all])} className="text-[11px] font-bold text-slate-500 underline cursor-pointer">{pick(picked.length === all.length ? 'audit.rep.onlySummary' : 'common.all')}</button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {all.map((s) => <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={picked.includes(s)} onChange={() => setPicked(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s])} className="accent-[#A3E635] rounded" data-testid={`${testid}-s-${s}`} /><span className="font-semibold">{pick(`audit.rep.s.${s}`)}</span></label>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-950">{(['summary', 'detail'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${mode === m ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'text-slate-600 dark:text-slate-300'}`}>{pick(m === 'summary' ? 'audit.rep.modeSummary' : 'audit.rep.modeDetail')}</button>)}</div>
        <div className="flex gap-1.5">
          <button type="button" disabled={!picked.length || busy} onClick={async () => { setBusy(true); try { await downloadFile(url('xlsx'), 'shop-audit-report.xlsx') } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid={`${testid}-xlsx`}><FileSpreadsheet className="w-3.5 h-3.5" />{pick('audit.rep.xlsx')}</button>
          <button type="button" disabled={!picked.length} onClick={() => void openPrintable(url('pdf'))} className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid={`${testid}-pdf`}><FileText className="w-3.5 h-3.5" />{pick('nau.printA4')}</button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{pick('audit.rep.footer')}</p>
    </div>
  )
}

function ReportDrawer({ onClose }: { onClose: () => void }) {
  const { pick } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-5 bg-black/70 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-4 animate-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5"><FileText className="w-5 h-5 text-[#65A30D] dark:text-[#A3E635]" /><div><h3 className="font-display font-extrabold text-sm sm:text-base">{pick('audit.rep.full')}</h3><p className="text-[11px] text-slate-500">{pick('audit.rep.fullHint')}</p></div></div>
          <button type="button" onClick={onClose} aria-label="close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5"><ReportBuilder testid="naudit-rep" /></div>
      </div>
    </div>
  )
}

export default function NewAudit() {
  const { pick, ur } = useLang()
  const search = periodSearch(useLocation().search)
  const { period, query } = useAuditPeriod()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const { data } = useGet<Overview>(['audit-overview', query], manager ? `/api/v1/shop-audit/overview?${query}` : null)
  const { data: rc } = useGet<Reconcile>(['audit-reconcile', query], manager ? `/api/v1/shop-audit/reconcile?${query}` : null)
  const [busy, setBusy] = useState(false)
  const asOf = !!period.asOf
  const report = (fmt: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&mode=detail&format=${fmt}${ur ? '&lang=ur' : ''}`
  const att = data?.attention
  const attCount = att ? att.verification_pending + att.verification_flagged + att.alerts_total + att.installments_overdue + att.installments_due_today + (att.lending_late ?? 0) + (att.lending_we_owe_due ?? 0) : 0
  const byKind = Object.entries(data?.money.by_kind ?? {}).filter(([, v]) => Number(v) > 0)
  const top = Math.max(1, ...byKind.map(([, v]) => Number(v)))
  /** another tab of the audit, the same period, with its own sub-tab */
  const tab = (k: string, extra = '') => {
    const q = new URLSearchParams(search)
    new URLSearchParams(extra).forEach((v, key) => q.set(key, v))
    const s = q.toString()
    return `/new/audit/${k}${s ? `?${s}` : ''}`
  }

  return (
    <AuditFrame section="overview" testid="naudit">
      {!data ? <div className="py-16 text-center text-xs text-slate-400">…</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to={tab('sales')} className="p-5 rounded-2xl bg-[#A3E635] text-obsidian-950 hover:brightness-95 transition flex flex-col gap-1.5" data-testid="naudit-sales">
              <div className="flex items-center justify-between gap-2"><Caps>{pick('audit.netSales')}</Caps><span className="px-2 py-0.5 rounded-full bg-obsidian-950 text-[#A3E635] text-[10px] font-bold">{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.net_sales)}</span></span></div>
              <div className="font-display font-extrabold text-2xl sm:text-3xl" dir="ltr">{signed(data.sales.net_sales)}</div>
              <div className="text-xs font-bold"><span dir="ltr">{data.sales.invoices}</span> {pick('audit.bills')} · <span dir="ltr">{data.sales.phones_sold}</span> {pick('audit.phones')}{Number(data.sales.discounts) ? <> · {pick('counter.discounts')} <span dir="ltr">{n(data.sales.discounts)}</span></> : null}{Number(data.sales.sales_returns) ? <> · {pick('counter.salesReturns')} <span dir="ltr">{n(data.sales.sales_returns)}</span></> : null}</div>
            </Link>
            {data.profit ? (
              <Link to={tab('finance')} className={`p-5 rounded-2xl border transition flex flex-col gap-1.5 ${Number(data.profit.net_profit) >= 0 ? 'bg-obsidian-950 text-white border-slate-800 hover:border-[#A3E635]' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200'}`} data-testid="naudit-profit">
                <div className="flex items-center justify-between gap-2"><Caps className="text-slate-400">{pick(Number(data.profit.net_profit) >= 0 ? 'counter.netProfit' : 'counter.netLoss')}</Caps>{data.previous.net_profit != null ? <span className="text-[10px] font-bold text-[#A3E635]">{pick('audit.vsPrevious')} <span dir="ltr"><Secret>{signed(data.previous.net_profit)}</Secret></span></span> : null}</div>
                <div className={`font-display font-extrabold text-2xl sm:text-3xl ${Number(data.profit.net_profit) >= 0 ? 'text-[#A3E635]' : ''}`} dir="ltr"><Secret>{signed(data.profit.net_profit)}</Secret></div>
                <div className="text-xs text-slate-400">{pick('counter.grossProfit')} <span dir="ltr"><Secret>{n(data.profit.gross_profit)}</Secret></span> · {pick('counter.cogs')} <span dir="ltr"><Secret>{n(data.profit.cogs)}</Secret></span> · {pick('audit.expenses')} <span dir="ltr">{n(data.profit.operating_expenses)}</span></div>
              </Link>
            ) : null}
            <Bal to={tab('stock')} Icon={Smartphone} label="audit.stock" unit={pick('audit.phones')} bal={{ opening: String(data.stock.opening.count), closing: String(data.stock.closing.count), as_of: String(data.stock.as_of.count), current: String(data.stock.current.count) }} asOf={asOf} testid="naudit-stock" extra={<>{(asOf ? data.stock.as_of : data.stock.closing).cost_value != null ? <>{pick('audit.atCost')} <b dir="ltr"><Secret>{n((asOf ? data.stock.as_of : data.stock.closing).cost_value)}</Secret></b> · </> : null}{pick('audit.atAsking')} <b dir="ltr">{n((asOf ? data.stock.as_of : data.stock.closing).asking_value)}</b></>} />
            <Link to={tab('udhaar')} className={`p-5 flex flex-col gap-1.5 hover:border-[#A3E635] transition ${card}`} data-testid="naudit-khata">
              <Caps className="text-slate-400">{pick('nau.marketKhata')}</Caps>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div><div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{pick('nau.lene')}</div><div className="font-display font-extrabold text-lg sm:text-xl text-amber-700 dark:text-amber-300" dir="ltr">{withCur(n(asOf ? data.debt.receivable.as_of : data.debt.receivable.closing))}</div></div>
                <div><div className="text-[11px] font-bold text-rose-600 dark:text-rose-300">{pick('nau.dene')}</div><div className="font-display font-extrabold text-lg sm:text-xl text-rose-600 dark:text-rose-300" dir="ltr">{withCur(n(asOf ? data.debt.payable.as_of : data.debt.payable.closing))}</div></div>
              </div>
              <div className="text-xs text-slate-500"><span dir="ltr">{data.debt.receivable.parties}</span> / <span dir="ltr">{data.debt.payable.parties}</span> {pick('audit.people')}</div>
            </Link>
          </div>

          <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="naudit-attention">
            <div className="flex items-center justify-between gap-2"><h3 className="font-display font-extrabold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />{pick('audit.att.title')}</h3><span className="text-[11px] font-bold text-slate-400">{pick('nau.tapToOpen')}</span></div>
            {!att || !attCount ? <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{pick('nau.nothingNeedsLook')}</p> : (
              <div className="flex flex-wrap gap-2">
                {att.verification_pending + att.verification_flagged ? <Chip to={tab('stock', 'tab=verification')} tone="amber">{pick('audit.att.idChecks')} <b dir="ltr">{att.verification_pending + att.verification_flagged}</b>{att.verification_flagged ? <> · {pick('stock.verification.flagged')} <b dir="ltr">{att.verification_flagged}</b></> : null}</Chip> : null}
                {Object.entries(att.alerts).map(([k, v]) => <Chip key={k} to={tab('stock', 'tab=ageing')} tone="sky">{pick(`audit.alert.${k}`)} <b dir="ltr">{v}</b></Chip>)}
                {att.installments_overdue ? <Chip to="/new/installments?view=overdue" tone="rose">{pick('audit.att.lateInstallments')} <b dir="ltr">{att.installments_overdue}</b> · <span dir="ltr">{withCur(n(att.installments_late_amount))}</span></Chip> : null}
                {att.installments_due_today ? <Chip to="/new/installments?view=today" tone="amber">{pick('audit.att.dueToday')} <b dir="ltr">{att.installments_due_today}</b></Chip> : null}
                {att.lending_late ? <Chip to={tab('udhaar', 'tab=lending')} tone="rose">{pick('audit.att.lendingLate')} <b dir="ltr">{att.lending_late}</b> · <span dir="ltr">{withCur(n(att.lending_late_amount))}</span></Chip> : null}
                {att.lending_we_owe_due ? <Chip to={tab('udhaar', 'tab=lending')} tone="amber">{pick('audit.att.lendingWeOwe')} <b dir="ltr">{att.lending_we_owe_due}</b> · <span dir="ltr">{withCur(n(att.lending_we_owe_amount))}</span></Chip> : null}
              </div>
            )}
          </section>

          <div><Caps className="block text-slate-500 dark:text-slate-400 mb-2.5">{pick(asOf ? 'audit.balancesAsOf' : 'audit.balances')}</Caps>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Bal to="/new/more/cash" Icon={Landmark} label="audit.cashBank" bal={data.money} asOf={asOf} testid="naudit-money" extra={<div className="flex flex-wrap gap-x-3 gap-y-0.5">{data.money.accounts.map((a) => <span key={a.cash_account_id}>{ur && a.name_ur ? a.name_ur : a.name} <b dir="ltr">{signed(asOf ? a.as_of : a.closing)}</b></span>)}</div>} />
              <Bal to={tab('udhaar')} Icon={BookOpen} label="audit.receivable" tone="amber" bal={data.debt.receivable} asOf={asOf} testid="naudit-receivable" extra={<>{pick('audit.receivedInPeriod')} <b dir="ltr">{n(data.debt.received_in_period)}</b> · <b dir="ltr">{data.debt.receivable.parties}</b> {pick('audit.people')}</>} />
              <Bal to={tab('udhaar')} Icon={Receipt} label="audit.payable" tone="rose" bal={data.debt.payable} asOf={asOf} testid="naudit-payable" extra={<>{pick('audit.paidInPeriod')} <b dir="ltr">{n(data.debt.paid_in_period)}</b> · <b dir="ltr">{data.debt.payable.parties}</b> {pick('audit.people')}</>} />
              {rc ? (
                <a href="#checks" className={`p-4 rounded-2xl border flex flex-col gap-1.5 ${rc.ok ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-rose-500/10 border-rose-500/25'}`} data-testid="naudit-status">
                  <Caps className={rc.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-700'}>{pick('nau.booksStatus')}</Caps>
                  <div className={`font-display font-extrabold text-xl flex items-center gap-1.5 ${rc.ok ? 'text-emerald-700 dark:text-[#A3E635]' : 'text-rose-700'}`}>{rc.ok ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}{pick(rc.ok ? 'nau.booksMatched' : 'audit.checksFail')}</div>
                  <div className={`text-xs ${rc.ok ? 'text-emerald-800/80 dark:text-emerald-300/80' : 'text-rose-700'}`}><span dir="ltr">{rc.checks.filter((c) => c.ok).length} / {rc.checks.length}</span> {pick('nau.checksPassed')}</div>
                </a>
              ) : null}
            </div>
          </div>

          <div><Caps className="block text-slate-500 dark:text-slate-400 mb-2.5">{pick('audit.inPeriod')}</Caps>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Fig to={tab('sales', 'side=purchases')} Icon={Package} tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" label="audit.purchases" value={withCur(n(data.purchases.purchases_net))} sub={<><span dir="ltr">{data.purchases.purchases}</span> {pick('audit.bills')} · <span dir="ltr">{data.purchases.phones_bought}</span> {pick('audit.phones')}</>} testid="naudit-purchases" />
              <Fig to={tab('finance', 'tab=expenses')} Icon={Wallet} tone="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" label="audit.expenses" value={withCur(n(data.expenses.total))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.total_expenses)}</span></>} testid="naudit-expenses" />
              <Fig to={tab('finance', 'tab=cash')} Icon={ArrowDownLeft} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" label="audit.moneyIn" value={withCur(n(data.money.inflows))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.inflows)}</span></>} testid="naudit-in" />
              <Fig to={tab('finance', 'tab=cash')} Icon={ArrowUpRight} tone="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" label="audit.moneyOut" value={withCur(n(data.money.outflows))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.outflows)}</span></>} testid="naudit-out" />
            </div>
            {Number(data.money.transfers) ? <p className="text-[11px] text-slate-500 mt-2">{pick('audit.transfersNote')} <span dir="ltr">{withCur(n(data.money.transfers))}</span></p> : null}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byKind.length ? (
              <section className={`p-4 space-y-2.5 ${card}`} data-testid="naudit-bykind">
                <div className="font-display font-extrabold text-sm">{pick('audit.chart.moneyByKind')}</div>
                {byKind.map(([k, v]) => <div key={k} className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="font-semibold">{pick(`pay.${k}`)}</span><b dir="ltr">{withCur(n(v))}</b></div><div className="h-2 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className="h-full rounded-full bg-[#65A30D] dark:bg-[#A3E635]" style={{ width: `${Math.max(3, Math.round((Number(v) / top) * 100))}%` }} /></div></div>)}
              </section>
            ) : null}
            {rc ? (
              <section id="checks" className={`rounded-2xl border p-4 space-y-2.5 ${rc.ok ? 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-800/60' : 'bg-rose-50 dark:bg-rose-950/25 border-rose-200'}`} data-testid="naudit-checks">
                <div className={`flex items-center gap-2 font-display font-extrabold text-sm ${rc.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-700'}`}><ShieldCheck className="w-4 h-4" />{pick(rc.ok ? 'audit.checksOk' : 'audit.checksFail')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">{rc.checks.map((c, i) => <span key={i} className={`flex items-center gap-1.5 ${c.ok ? 'text-slate-600 dark:text-slate-300' : 'text-rose-600 font-bold'}`}>{c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}{pick(`audit.check.${c.key}`)}{c.name ? ` · ${c.name}` : ''}{!c.ok ? <span dir="ltr"> ({String(c.diff)})</span> : null}</span>)}</div>
              </section>
            ) : null}
          </div>

          <section className="rounded-2xl bg-obsidian-950 text-white border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="naudit-report">
            <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-white/10 text-[#A3E635] flex items-center justify-center"><FileText className="w-5 h-5" /></span><div><div className="font-display font-extrabold text-sm">{pick('audit.fullReport')}</div><div className="text-[11px] text-slate-400">{pick('audit.fullReportHint')}</div></div></div>
            <div className="flex gap-2"><button type="button" onClick={() => void openPrintable(report('pdf'))} className="px-3 py-1.5 rounded-xl bg-[#A3E635] text-obsidian-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="naudit-pdf"><FileText className="w-3.5 h-3.5" />PDF</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadFile(report('xlsx'), 'shop-audit-report.xlsx') } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="naudit-xlsx"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('counter.excel')}</button></div>
          </section>

          <div className="text-[11px] text-slate-500 space-y-0.5">
            {data.coverage.first_day ? <div>{pick('audit.coverage')} <span dir="ltr">{data.coverage.first_day}</span></div> : <div>{pick('audit.noRecords')}</div>}
            <div>{pick('audit.limitations')}</div>
          </div>
        </>
      )}
    </AuditFrame>
  )
}

function Chip({ to, tone, children }: { to: string; tone: 'amber' | 'sky' | 'rose'; children: ReactNode }) {
  const t = { amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30', sky: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30', rose: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30' }[tone]
  return <Link to={to} className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border ${t}`}>{children}</Link>
}
function Fig({ to, Icon, tone, label, value, sub, testid }: { to: string; Icon: LucideIcon; tone: string; label: string; value: string; sub: ReactNode; testid: string }) {
  const { pick } = useLang()
  return (
    <Link to={to} className={`p-4 flex flex-col gap-1.5 hover:border-[#A3E635] transition ${card}`} data-testid={testid}>
      <div className="flex items-center gap-2"><span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></span><Caps className="text-slate-500">{pick(label)}</Caps></div>
      <div className="font-display font-extrabold text-xl" dir="ltr">{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </Link>
  )
}
function Bal({ to, Icon, label, bal, asOf, unit, tone, extra, testid }: { to: string; Icon: LucideIcon; label: string; bal: { opening: M; closing: M; as_of: M; current: M }; asOf: boolean; unit?: string; tone?: 'amber' | 'rose'; extra?: ReactNode; testid: string }) {
  const { pick } = useLang()
  const main = asOf ? bal.as_of : bal.closing
  const fmt = (v: M) => (unit ? `${n(v)} ${unit}` : signed(v))
  const box = tone === 'amber' ? 'bg-amber-500/10 border-amber-500/25' : tone === 'rose' ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800'
  const fig = tone === 'amber' ? 'text-amber-900 dark:text-amber-200' : tone === 'rose' ? 'text-rose-700 dark:text-rose-300' : Number(main) < 0 ? 'text-rose-600' : ''
  return (
    <Link to={to} className={`rounded-2xl border p-4 sm:p-5 flex flex-col gap-1.5 hover:border-[#A3E635] transition ${box}`} data-testid={testid}>
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Icon className="w-4 h-4 text-slate-500" /><Caps className="text-slate-500">{pick(label)}</Caps></span><span className="text-[10px] font-bold text-slate-400">{pick(asOf ? 'audit.asOf' : 'audit.closing')}</span></div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl ${fig}`} dir="ltr">{fmt(main)}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500" dir="ltr"><span>{pick('audit.opening')} <b>{n(bal.opening)}</b></span><span>→</span><span>{pick(asOf ? 'audit.asOf' : 'audit.closing')} <b>{n(main)}</b></span>{asOf ? <><span>·</span><span>{pick('audit.closing')} <b>{n(bal.closing)}</b></span></> : null}<span>·</span><span>{pick('audit.now')} <b>{n(bal.current)}</b></span></div>
      {extra ? <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-1.5 border-t border-slate-200/70 dark:border-slate-800">{extra}</div> : null}
    </Link>
  )
}
