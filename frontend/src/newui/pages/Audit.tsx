/** Shop audit in the new product (ADR-134, ADR-032). No mock-up draws it (owner 2026-11-23: design it
 *  from what the live software does, in the files' own visual language) — so it is drawn like the
 *  business overview (file 02): its own frame (`AuditFrame`: the shared rail, the bar with the period
 *  — the nine presets, from–to, as-of — and the audit's fourteen sections down the side) and, first,
 *  the Overview: net sales and real profit, needs attention, the period's flows, the balances with
 *  opening → closing → now, money by kind, the books' own checks, the full report.
 *
 *  Everything is the live audit: `/shop-audit/period`, `/shop-audit/overview`, `/shop-audit/
 *  reconcile`, `/shop-audit/report` (PDF / Excel). The period lives in the address, as in the live
 *  audit, so a link and a reload keep it. The other sections are not drawn yet: in the side they open
 *  the live screen for the same period. The previous period is shown as its own figure — the app works
 *  out no percentage. Owner / manager (the `reports` module), as the server. */

import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, BookOpen, CalendarRange, CheckCircle2, ClipboardCheck, ExternalLink, FileSpreadsheet, FileText, Landmark, Languages, Moon, Package, Receipt, ShieldCheck, Smartphone, Sun, Wallet, XCircle, type LucideIcon } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useGet } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { PRESETS, useAuditPeriod, type Preset } from '@/features/audit/period'
import type { Overview } from '@/features/audit/OverviewPage'
import FileRail from '../FileRail'

const LIME = '#B4F000'
type M = string
/** the audit's sections, in the live audit's order; `drawn` ones live in the new product */
export const SECTIONS: { key: string; live: string; drawn?: string; owner?: boolean }[] = [
  { key: 'overview', live: '/audit', drawn: '/new/audit' },
  { key: 'finance', live: '/audit/finance' }, { key: 'sales', live: '/audit/sales' }, { key: 'returns', live: '/audit/returns' },
  { key: 'people', live: '/audit/people' }, { key: 'udhaar', live: '/audit/udhaar' }, { key: 'lending', live: '/audit/lending' },
  { key: 'repairs', live: '/audit/repairs' }, { key: 'stock', live: '/audit/stock' }, { key: 'products', live: '/audit/products' },
  { key: 'bills', live: '/audit/bills' }, { key: 'staff', live: '/audit/staff' }, { key: 'security', live: '/audit/security', owner: true },
  { key: 'reports', live: '/audit/reports' },
]
interface Resolved { date_from: string; date_to: string; as_of: string; days: number }
interface Reconcile { ok: boolean; checks: { key: string; ok: boolean; diff: string | number; name?: string }[] }
const n = (v: M | number | null | undefined) => (v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const signed = (v: M | number | null | undefined) => `${Number(v ?? 0) < 0 ? '−' : ''}${withCur(n(v))}`

/** the audit's frame: rail, bar, period, the sections down the side */
export function AuditFrame({ section, children, testid }: { section: string; children: ReactNode; testid: string }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const { search } = useLocation()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { period, set, query } = useAuditPeriod()
  const { data: resolved } = useGet<Resolved>(['audit-period', query], manager ? `/api/v1/shop-audit/period?${query}` : null)
  const [asOfOpen, setAsOfOpen] = useState(!!period.asOf)
  const date = 'px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700'
  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid={testid} data-newui="1" data-file="02">
      <FileRail lit="/new/audit" lime={LIME} testid="naudit-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#548C00] text-white flex items-center justify-center"><ClipboardCheck className="w-4 h-4" /></span>
            <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('audit.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr" data-testid="naudit-range">{resolved ? `${fmtDate(resolved.date_from)} → ${fmtDate(resolved.date_to)} · ${resolved.days} ${pick('audit.days')}` : ''}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="naudit-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#B4F000]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </header>
        {!manager ? <div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="naudit-managers"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('naudit.managersOnly')}</p></div></div> : (
          <>
            <div className="shrink-0 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2 space-y-2" data-testid="naudit-period">
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESETS.map((k: Preset) => <button key={k} type="button" onClick={() => set({ preset: k })} aria-pressed={period.preset === k} data-testid={`naudit-p-${k}`} className={`px-3 py-1 rounded-lg text-xs whitespace-nowrap cursor-pointer ${period.preset === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-850'}`}>{pick(`audit.preset.${k}`)}</button>)}
                <button type="button" onClick={() => { if (asOfOpen) set({ asOf: null }); setAsOfOpen(!asOfOpen) }} aria-pressed={asOfOpen} className={`ms-auto px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${asOfOpen ? 'bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`} data-testid="naudit-asof"><CalendarRange className="w-3.5 h-3.5" />{pick('audit.asOf')}{resolved && period.asOf ? <span dir="ltr"> · {fmtDate(resolved.as_of)}</span> : null}</button>
              </div>
              {period.preset === 'custom' || asOfOpen ? (
                <div className="flex flex-wrap items-center gap-2" dir="ltr">
                  {period.preset === 'custom' ? <><input type="date" aria-label="from" value={period.from} max={period.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className={date} data-testid="naudit-from" /><span className="text-slate-400">→</span><input type="date" aria-label="to" value={period.to} min={period.from} max={isoDay(0)} onChange={(e) => e.target.value && set({ to: e.target.value })} className={date} data-testid="naudit-to" /></> : null}
                  {asOfOpen ? <span className="flex items-center gap-1.5"><span className="text-[11px] text-slate-500">{pick('audit.asOfHint')}</span><input type="date" aria-label="as of" value={period.asOf ?? period.to} max={isoDay(0)} onChange={(e) => e.target.value && set({ asOf: e.target.value })} className={date} /></span> : null}
                </div>
              ) : null}
            </div>
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
              <nav className="shrink-0 lg:w-52 lg:h-full lg:overflow-y-auto bg-white dark:bg-obsidian-900 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-slate-800 p-2.5 flex lg:flex-col gap-1 overflow-x-auto" data-testid="naudit-sections">
                {SECTIONS.filter((s) => !s.owner || role === 'owner').map((s) => s.key === section ? (
                  <span key={s.key} aria-current="page" className="shrink-0 px-3 py-2 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 text-xs font-extrabold whitespace-nowrap">{pick(`audit.nav.${s.key}`)}</span>
                ) : s.drawn ? (
                  <Link key={s.key} to={`${s.drawn}${search}`} className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-850 whitespace-nowrap">{pick(`audit.nav.${s.key}`)}</Link>
                ) : (
                  <button key={s.key} type="button" onClick={() => nav(`${s.live}${search}`)} className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-850 whitespace-nowrap flex items-center justify-between gap-2 cursor-pointer text-start" title={pick('naudit.liveScreen')} data-testid={`naudit-live-${s.key}`}>{pick(`audit.nav.${s.key}`)}<ExternalLink className="w-3 h-3 text-slate-400 shrink-0" /></button>
                ))}
              </nav>
              <main className="flex-1 min-w-0 lg:overflow-y-auto px-4 sm:px-6 py-4 space-y-4">{children}</main>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function NewAudit() {
  const { pick, ur, cls } = useLang()
  const { search } = useLocation()
  const { period, query } = useAuditPeriod()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const { data } = useGet<Overview>(['audit-overview', query], manager ? `/api/v1/shop-audit/overview?${query}` : null)
  const { data: rc } = useGet<Reconcile>(['audit-reconcile', query], manager ? `/api/v1/shop-audit/reconcile?${query}` : null)
  const [busy, setBusy] = useState(false)
  const asOf = !!period.asOf
  const range = data ? `from=${data.period.date_from}&to=${data.period.date_to}` : ''
  const caps = ur ? `font-bold ${cls('sm')}` : 'text-[10px] font-extrabold uppercase tracking-wider'
  const report = (fmt: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&mode=detail&format=${fmt}${ur ? '&lang=ur' : ''}`
  const att = data?.attention
  const attCount = att ? att.verification_pending + att.verification_flagged + att.alerts_total + att.installments_overdue + att.installments_due_today + (att.lending_late ?? 0) + (att.lending_we_owe_due ?? 0) : 0
  const byKind = Object.entries(data?.money.by_kind ?? {}).filter(([, v]) => Number(v) > 0)
  const top = Math.max(1, ...byKind.map(([, v]) => Number(v)))

  return (
    <AuditFrame section="overview" testid="naudit">
      <section className="rounded-2xl bg-obsidian-900 text-white border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="naudit-report">
        <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-white/10 text-[#B4F000] flex items-center justify-center"><FileText className="w-5 h-5" /></span><div><div className="font-display font-extrabold text-sm">{pick('audit.fullReport')}</div><div className="text-[11px] text-slate-400">{pick('audit.fullReportHint')}</div></div></div>
        <div className="flex gap-2"><button type="button" onClick={() => void openPrintable(report('pdf'))} className="px-3 py-1.5 rounded-xl bg-[#B4F000] text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="naudit-pdf"><FileText className="w-3.5 h-3.5" />PDF</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadFile(report('xlsx'), 'shop-audit-report.xlsx') } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="naudit-xlsx"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('counter.excel')}</button></div>
      </section>
      {!data ? <div className="py-16 text-center text-xs text-slate-400">…</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to={`/new/invoices?kind=sale&${range}`} className="smart-card rounded-2xl bg-[#B4F000] text-slate-950 p-5 flex flex-col gap-1.5" data-testid="naudit-sales">
              <div className="flex items-center justify-between"><span className={caps}>{pick('audit.netSales')}</span><span className="text-[11px] font-bold opacity-70">{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.net_sales)}</span></span></div>
              <div className="font-display font-extrabold text-3xl tracking-tight" dir="ltr">{signed(data.sales.net_sales)}</div>
              <div className="text-xs font-semibold opacity-80"><span dir="ltr">{data.sales.invoices}</span> {pick('audit.bills')} · <span dir="ltr">{data.sales.phones_sold}</span> {pick('audit.phones')}{Number(data.sales.discounts) ? <> · {pick('counter.discounts')} <span dir="ltr">{n(data.sales.discounts)}</span></> : null}{Number(data.sales.sales_returns) ? <> · {pick('counter.salesReturns')} <span dir="ltr">{n(data.sales.sales_returns)}</span></> : null}</div>
            </Link>
            {data.profit ? (
              <Link to="/reports?tab=profit" className={`smart-card rounded-2xl p-5 flex flex-col gap-1.5 ${Number(data.profit.net_profit) >= 0 ? 'bg-obsidian-900 text-white border border-slate-800' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200'}`} data-testid="naudit-profit">
                <div className="flex items-center justify-between"><span className={caps}>{pick(Number(data.profit.net_profit) >= 0 ? 'counter.netProfit' : 'counter.netLoss')}</span>{data.previous.net_profit != null ? <span className="text-[11px] font-bold opacity-70">{pick('audit.vsPrevious')} <span dir="ltr">{signed(data.previous.net_profit)}</span></span> : null}</div>
                <div className={`font-display font-extrabold text-3xl tracking-tight ${Number(data.profit.net_profit) >= 0 ? 'text-[#B4F000]' : ''}`} dir="ltr">{signed(data.profit.net_profit)}</div>
                <div className="text-xs font-semibold opacity-80">{pick('counter.grossProfit')} <span dir="ltr">{n(data.profit.gross_profit)}</span> · {pick('counter.cogs')} <span dir="ltr">{n(data.profit.cogs)}</span> · {pick('audit.expenses')} <span dir="ltr">{n(data.profit.operating_expenses)}</span></div>
              </Link>
            ) : null}
          </div>

          {att && attCount > 0 ? (
            <section className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 p-4 space-y-2.5" data-testid="naudit-attention">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4" /><span className="font-display font-extrabold text-sm">{pick('audit.att.title')}</span></div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {att.verification_pending + att.verification_flagged ? <Chip to={`/audit/stock?tab=verification&${search.slice(1)}`}>{pick('audit.att.idChecks')} <b dir="ltr">{att.verification_pending + att.verification_flagged}</b>{att.verification_flagged ? <span className="text-rose-600"> · {pick('stock.verification.flagged')} <b dir="ltr">{att.verification_flagged}</b></span> : null}</Chip> : null}
                {Object.entries(att.alerts).map(([k, v]) => <Chip key={k} to="/audit/stock?tab=ageing">{pick(`audit.alert.${k}`)} <b dir="ltr">{v}</b></Chip>)}
                {att.installments_overdue ? <Chip to="/new/installments?view=overdue" bad>{pick('audit.att.lateInstallments')} <b dir="ltr">{att.installments_overdue}</b> · <span dir="ltr">{withCur(n(att.installments_late_amount))}</span></Chip> : null}
                {att.installments_due_today ? <Chip to="/new/installments?view=today">{pick('audit.att.dueToday')} <b dir="ltr">{att.installments_due_today}</b></Chip> : null}
                {att.lending_late ? <Chip to={`/audit/lending?${range}`} bad>{pick('audit.att.lendingLate')} <b dir="ltr">{att.lending_late}</b> · <span dir="ltr">{withCur(n(att.lending_late_amount))}</span></Chip> : null}
                {att.lending_we_owe_due ? <Chip to={`/audit/lending?${range}`}>{pick('audit.att.lendingWeOwe')} <b dir="ltr">{att.lending_we_owe_due}</b> · <span dir="ltr">{withCur(n(att.lending_we_owe_amount))}</span></Chip> : null}
              </div>
            </section>
          ) : null}

          <div><h3 className={`text-slate-500 dark:text-slate-400 mb-2.5 ${caps}`}>{pick('audit.inPeriod')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Fig to={`/new/purchases`} Icon={Package} tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" label="audit.purchases" value={withCur(n(data.purchases.purchases_net))} sub={<><span dir="ltr">{data.purchases.purchases}</span> {pick('audit.bills')} · <span dir="ltr">{data.purchases.phones_bought}</span> {pick('audit.phones')}</>} testid="naudit-purchases" />
              <Fig to="/new/expenses" Icon={Wallet} tone="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" label="audit.expenses" value={withCur(n(data.expenses.total))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.total_expenses)}</span></>} testid="naudit-expenses" />
              <Fig to="/new/more/cash" Icon={ArrowDownLeft} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" label="audit.moneyIn" value={withCur(n(data.money.inflows))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.inflows)}</span></>} testid="naudit-in" />
              <Fig to="/new/more/cash" Icon={ArrowUpRight} tone="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" label="audit.moneyOut" value={withCur(n(data.money.outflows))} sub={<>{pick('audit.vsPrevious')} <span dir="ltr">{n(data.previous.outflows)}</span></>} testid="naudit-out" />
            </div>
            {Number(data.money.transfers) ? <p className="text-[11px] text-slate-500 mt-2">{pick('audit.transfersNote')} <span dir="ltr">{withCur(n(data.money.transfers))}</span></p> : null}
          </div>

          <div><h3 className={`text-slate-500 dark:text-slate-400 mb-2.5 ${caps}`}>{pick(asOf ? 'audit.balancesAsOf' : 'audit.balances')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Bal to="/new/more/cash" Icon={Landmark} label="audit.cashBank" bal={data.money} asOf={asOf} testid="naudit-money" extra={<div className="flex flex-wrap gap-x-3 gap-y-0.5">{data.money.accounts.map((a) => <span key={a.cash_account_id}>{ur && a.name_ur ? a.name_ur : a.name} <b dir="ltr">{signed(asOf ? a.as_of : a.closing)}</b></span>)}</div>} />
              <Bal to="/new/stock/summary" Icon={Smartphone} label="audit.stock" unit={pick('audit.phones')} bal={{ opening: String(data.stock.opening.count), closing: String(data.stock.closing.count), as_of: String(data.stock.as_of.count), current: String(data.stock.current.count) }} asOf={asOf} testid="naudit-stock" extra={<>{(asOf ? data.stock.as_of : data.stock.closing).cost_value != null ? <>{pick('audit.atCost')} <b dir="ltr">{n((asOf ? data.stock.as_of : data.stock.closing).cost_value)}</b> · </> : null}{pick('audit.atAsking')} <b dir="ltr">{n((asOf ? data.stock.as_of : data.stock.closing).asking_value)}</b></>} />
              <Bal to="/new/khata" Icon={BookOpen} label="audit.receivable" tone="amber" bal={data.debt.receivable} asOf={asOf} testid="naudit-receivable" extra={<>{pick('audit.receivedInPeriod')} <b dir="ltr">{n(data.debt.received_in_period)}</b> · <b dir="ltr">{data.debt.receivable.parties}</b> {pick('audit.people')}</>} />
              <Bal to="/new/khata" Icon={Receipt} label="audit.payable" tone="rose" bal={data.debt.payable} asOf={asOf} testid="naudit-payable" extra={<>{pick('audit.paidInPeriod')} <b dir="ltr">{n(data.debt.paid_in_period)}</b> · <b dir="ltr">{data.debt.payable.parties}</b> {pick('audit.people')}</>} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byKind.length ? (
              <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5" data-testid="naudit-bykind">
                <div className="font-display font-extrabold text-sm">{pick('audit.chart.moneyByKind')}</div>
                {byKind.map(([k, v]) => <div key={k} className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="font-semibold">{pick(`pay.${k}`)}</span><b dir="ltr">{withCur(n(v))}</b></div><div className="h-2 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className="h-full rounded-full bg-[#548C00] dark:bg-[#B4F000]" style={{ width: `${Math.max(3, Math.round((Number(v) / top) * 100))}%` }} /></div></div>)}
              </section>
            ) : null}
            {rc ? (
              <section className={`rounded-2xl border p-4 space-y-2.5 ${rc.ok ? 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-800/60' : 'bg-rose-50 dark:bg-rose-950/25 border-rose-200'}`} data-testid="naudit-checks">
                <div className={`flex items-center gap-2 font-display font-extrabold text-sm ${rc.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-700'}`}><ShieldCheck className="w-4 h-4" />{pick(rc.ok ? 'audit.checksOk' : 'audit.checksFail')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">{rc.checks.map((c, i) => <span key={i} className={`flex items-center gap-1.5 ${c.ok ? 'text-slate-600 dark:text-slate-300' : 'text-rose-600 font-bold'}`}>{c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}{pick(`audit.check.${c.key}`)}{c.name ? ` · ${c.name}` : ''}{!c.ok ? <span dir="ltr"> ({String(c.diff)})</span> : null}</span>)}</div>
              </section>
            ) : null}
          </div>

          <div className="text-[11px] text-slate-500 space-y-0.5">
            {data.coverage.first_day ? <div>{pick('audit.coverage')} <span dir="ltr">{data.coverage.first_day}</span></div> : <div>{pick('audit.noRecords')}</div>}
            <div>{pick('audit.limitations')}</div>
          </div>
        </>
      )}
    </AuditFrame>
  )
}

function Chip({ to, bad, children }: { to: string; bad?: boolean; children: ReactNode }) {
  return <Link to={to} className={`px-2.5 py-1.5 rounded-lg font-semibold border ${bad ? 'bg-rose-100/80 border-rose-200 text-rose-700' : 'bg-white dark:bg-obsidian-900 border-amber-200 dark:border-amber-800/60 text-slate-700 dark:text-slate-200'}`}>{children}</Link>
}
function Fig({ to, Icon, tone, label, value, sub, testid }: { to: string; Icon: LucideIcon; tone: string; label: string; value: string; sub: ReactNode; testid: string }) {
  const { pick } = useLang()
  return (
    <Link to={to} className="smart-card rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 flex flex-col gap-1.5" data-testid={testid}>
      <div className="flex items-center gap-2"><span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></span><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick(label)}</span></div>
      <div className="font-display font-extrabold text-xl" dir="ltr">{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </Link>
  )
}
function Bal({ to, Icon, label, bal, asOf, unit, tone, extra, testid }: { to: string; Icon: LucideIcon; label: string; bal: { opening: M; closing: M; as_of: M; current: M }; asOf: boolean; unit?: string; tone?: 'amber' | 'rose'; extra?: ReactNode; testid: string }) {
  const { pick } = useLang()
  const main = asOf ? bal.as_of : bal.closing
  const fmt = (v: M) => (unit ? `${n(v)} ${unit}` : signed(v))
  const box = tone === 'amber' ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/60' : tone === 'rose' ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-800/60' : 'bg-white dark:bg-obsidian-900 border-slate-200/90 dark:border-slate-800'
  return (
    <Link to={to} className={`smart-card rounded-2xl border p-4 flex flex-col gap-2 ${box}`} data-testid={testid}>
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Icon className="w-4 h-4 text-slate-500" /><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick(label)}</span></span><span className="text-[10px] font-bold text-slate-400">{pick(asOf ? 'audit.asOf' : 'audit.closing')}</span></div>
      <div className="font-display font-extrabold text-2xl" dir="ltr">{fmt(main)}</div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500" dir="ltr"><span>{pick('audit.opening')} <b>{n(bal.opening)}</b></span><span>→</span><span>{pick(asOf ? 'audit.asOf' : 'audit.closing')} <b>{n(main)}</b></span>{asOf ? <><span>·</span><span>{pick('audit.closing')} <b>{n(bal.closing)}</b></span></> : null}<span>·</span><span>{pick('audit.now')} <b>{n(bal.current)}</b></span></div>
      {extra ? <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-1.5 border-t border-slate-100 dark:border-slate-800">{extra}</div> : null}
    </Link>
  )
}
