/** Shop audit → Finance in the new product (ADR-134), in the audit's own frame (`AuditFrame`). No
 *  mock-up draws it, so it is drawn like the business overview (file 02): profit & loss (the hero,
 *  the series as bars, the statement with the period before beside each line), cash & bank (opening
 *  → in → out → closing, why money came in and went out, each account, the channels, money from
 *  abroad), expenses (the total, by day, by category, the largest, by whom and from which account) and
 *  tax (taxed bills, taxable, tax on bills, net of returns, each bill). The tab lives in the address.
 *
 *  Every figure is the live audit's: `/shop-audit/pnl`, `/cash`, `/international`, `/expenses`,
 *  `/tax`, and the section's report (PDF / Excel). The period before is shown as its own figure — the
 *  app works out no percentage; a bar's length only draws the server's figures beside each other. */

import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import i18next from 'i18next'
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, FileText, Globe, Landmark, Receipt, Wallet } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame } from './Audit'

type M = string
type Tab = 'pnl' | 'cash' | 'expenses' | 'tax'
interface PnlDict { gross_sales: M; discounts: M; sales_returns: M; net_sales: M; cogs: M; gross_profit: M; operating_expenses: M; operating_profit: M; repair_income: M; other_income: M; net_profit: M; owner_drawing: M; tax_collected: M }
interface Pnl { granularity: 'day' | 'week' | 'month'; current: PnlDict; previous: PnlDict; series: { bucket: string; net_sales: M; net_profit: M }[]; notes: string[] }
interface Account { cash_account_id: string; name: string; name_ur: string | null; kind: string; opening: M; in: Record<string, M>; out: Record<string, M>; cash_in: M; cash_out: M; transfers_in: M; transfers_out: M; closing: M; as_of: M; current: M }
interface Cash { opening: M; closing: M; as_of: M; current: M; in: Record<string, M>; out: Record<string, M>; in_total: M; out_total: M; in_keys: string[]; out_keys: string[]; accounts: Account[]; by_kind: { kind: string; in: M; out: M; closing: M }[]; payments_by_method: { method: string; in: M; out: M; count: number }[]; notes: string[] }
interface Intl { rows: unknown[]; total_pkr_in: M; total_pkr_out: M; total_fees: M; by_currency: { currency: string; foreign_amount: M; pkr_amount: M; count: number }[] }
interface Expenses { granularity: string; total: M; owner_drawing: M; count: number; previous_total: M; by_category: { key: string; name: string; name_ur: string | null; amount: M; count: number }[]; previous_by_category: { key: string; amount: M }[]; by_account: { name: string | null; kind: string | null; amount: M; count: number }[]; by_user: { user_name: string | null; amount: M; count: number }[]; series: { bucket: string; amount: M }[]; largest: { id: string; no: string; date: string; amount: M; category_name: string; description: string | null; account: string | null; user_name: string | null }[]; notes: string[] }
interface Tax { invoices: number; taxed_invoices: number; taxable_sales: M; tax_on_invoices: M; tax_net_of_returns: M; rows: { invoice_id: string; no: string; date: string; party_name: string | null; taxable: M; tax_rate: M; tax_inclusive: boolean; tax_amount: M; returned_total: M }[]; notes: string[] }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const s = (v: M | number | null | undefined) => `${Number(v ?? 0) < 0 ? '−' : ''}${n(v)}`
const bucketLabel = (b: string, g: string) => (g === 'month' ? b.slice(0, 7) : g === 'day' ? b.slice(8, 10) : b.slice(5))
const TABS: Tab[] = ['pnl', 'cash', 'expenses', 'tax']

export default function NewAuditFinance() {
  const { pick, ur } = useLang()
  const role = useAuth((x) => x.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((t) => t === sp.get('tab')) ?? 'pnl') as Tab
  const setTab = (t: Tab) => { const o = new URLSearchParams(sp); o.set('tab', t); setSp(o, { replace: true }) }
  const [busy, setBusy] = useState(false)
  const report = (fmt: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&sections=${tab}&mode=detail&format=${fmt}${ur ? '&lang=ur' : ''}`
  return (
    <AuditFrame section="finance" testid="nfin">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" role="tablist">{TABS.map((t) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} data-testid={`nfin-tab-${t}`} className={`px-3.5 py-1.5 rounded-lg text-xs cursor-pointer ${tab === t ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-300'}`}>{pick(`audit.fin.${t}`)}</button>)}</div>
        <div className="flex gap-2"><button type="button" onClick={() => void openPrintable(report('pdf'))} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nfin-pdf"><FileText className="w-3.5 h-3.5" />PDF</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadFile(report('xlsx'), `finance-${tab}.xlsx`) } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('counter.excel')}</button></div>
      </div>
      {!manager ? null : tab === 'pnl' ? <PnlTab query={query} /> : tab === 'cash' ? <CashTab query={query} asOf={!!period.asOf} /> : tab === 'expenses' ? <ExpensesTab query={query} /> : <TaxTab query={query} />}
    </AuditFrame>
  )
}

const card = 'rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'
const Wait = () => <div className="py-16 text-center text-xs text-slate-400">…</div>

function PnlTab({ query }: { query: string }) {
  const { pick } = useLang()
  const { data: p } = useGet<Pnl>(['audit-pnl', query], `/api/v1/shop-audit/pnl?${query}`)
  if (!p) return <Wait />
  // one scale for both bars: the biggest sales or profit figure of the period
  const top = Math.max(1, ...p.series.flatMap((x) => [Math.abs(Number(x.net_sales)), Math.abs(Number(x.net_profit))]))
  const h = (v: M) => `${Math.max(3, Math.round((Math.abs(Number(v)) / top) * 100))}%`
  const pos = Number(p.current.net_profit) >= 0
  const other = Number(p.current.repair_income) + Number(p.current.other_income)
  const otherPrev = Number(p.previous.repair_income) + Number(p.previous.other_income)
  return (
    <div className="space-y-4" data-testid="nfin-pnl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={`rounded-2xl p-5 flex flex-col justify-between ${pos ? 'bg-[#A3E635] text-slate-950' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200'}`} data-testid="nfin-hero">
          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{pick(pos ? 'counter.netProfit' : 'counter.netLoss')}</div>
          <div className="font-display font-extrabold text-4xl tracking-tight my-2" dir="ltr">{withCur(s(p.current.net_profit))}</div>
          <div className="text-xs font-semibold opacity-80">{pick('audit.vsPrevious')} <span dir="ltr">{withCur(s(p.previous.net_profit))}</span> · {pick(`audit.gran.${p.granularity}`)}</div>
        </section>
        <section className={`lg:col-span-2 p-5 ${card}`} data-testid="nfin-series">
          <div className="font-display font-extrabold text-sm mb-3">{pick('audit.chart.revenueVsProfit')}</div>
          {!p.series.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : (
            <div className="flex items-end gap-1.5 h-36" dir="ltr">{p.series.map((x) => <div key={x.bucket} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${x.bucket} · ${pick('audit.netSales')} ${n(x.net_sales)} · ${pick('counter.netProfit')} ${s(x.net_profit)}`}><div className="w-full flex items-end gap-0.5 h-full"><span className="flex-1 rounded-t bg-slate-200 dark:bg-slate-700" style={{ height: h(x.net_sales) }} /><span className={`flex-1 rounded-t ${Number(x.net_profit) < 0 ? 'bg-rose-500' : 'bg-obsidian-900 dark:bg-[#A3E635]'}`} style={{ height: h(x.net_profit) }} /></div><span className="text-[9px] text-slate-400">{bucketLabel(x.bucket, p.granularity)}</span></div>)}</div>
          )}
          <div className="flex gap-4 mt-2 text-[10px] text-slate-500"><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-200 dark:bg-slate-700" />{pick('audit.netSales')}</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-obsidian-900 dark:bg-[#A3E635]" />{pick('counter.netProfit')}</span></div>
        </section>
      </div>
      <section className={`${card} divide-y divide-slate-100 dark:divide-slate-800`} data-testid="nfin-statement">
        <div className="px-4 py-2.5 grid grid-cols-12 text-[10px] font-extrabold uppercase tracking-wider text-slate-400"><span className="col-span-6" /><span className="col-span-3 text-end">{pick('nfin.now')}</span><span className="col-span-3 text-end">{pick('audit.vsPrevious')}</span></div>
        <Row k="counter.grossSales" v={p.current.gross_sales} prev={p.previous.gross_sales} />
        {Number(p.current.discounts) || Number(p.previous.discounts) ? <Row k="counter.discounts" v={p.current.discounts} prev={p.previous.discounts} minus /> : null}
        {Number(p.current.sales_returns) || Number(p.previous.sales_returns) ? <Row k="counter.salesReturns" v={p.current.sales_returns} prev={p.previous.sales_returns} minus /> : null}
        <Row k="counter.netSales" v={p.current.net_sales} prev={p.previous.net_sales} strong />
        <Row k="counter.cogs" v={p.current.cogs} prev={p.previous.cogs} minus />
        <Row k="counter.grossProfit" v={p.current.gross_profit} prev={p.previous.gross_profit} strong />
        <Row k="audit.expenses" v={p.current.operating_expenses} prev={p.previous.operating_expenses} minus />
        <Row k="counter.operatingProfit" v={p.current.operating_profit} prev={p.previous.operating_profit} />
        {other || otherPrev ? <Row k="counter.otherIncome" v={other} prev={otherPrev} plus /> : null}
        <Row k="counter.netProfit" v={p.current.net_profit} prev={p.previous.net_profit} strong lime />
        <Row k="counter.taxCollected" v={p.current.tax_collected} prev={p.previous.tax_collected} muted />
        {Number(p.current.owner_drawing) ? <Row k="counter.ownerTook" v={p.current.owner_drawing} prev={p.previous.owner_drawing} muted /> : null}
      </section>
      <Notes notes={p.notes} />
    </div>
  )
}

function Row({ k, v, prev, strong, minus, plus, muted, lime }: { k: string; v: M | number; prev: M | number; strong?: boolean; minus?: boolean; plus?: boolean; muted?: boolean; lime?: boolean }) {
  const { pick } = useLang()
  const sign = minus ? '− ' : plus ? '+ ' : ''
  return (
    <div className={`px-4 py-2.5 grid grid-cols-12 items-center ${strong ? 'bg-slate-50 dark:bg-obsidian-850/60' : ''} ${lime ? 'bg-[#A3E635]/20' : ''}`} data-testid="nfin-row">
      <span className={`col-span-6 text-sm ${strong ? 'font-extrabold' : muted || minus ? 'text-slate-500' : 'font-semibold'}`}>{pick(k)}</span>
      <span className={`col-span-3 text-end font-mono ${strong ? 'text-base font-extrabold' : 'text-sm'} ${minus || muted ? 'text-slate-500' : ''}`} dir="ltr">{sign}{minus || plus ? n(v) : s(v)}</span>
      <span className="col-span-3 text-end font-mono text-xs text-slate-400" dir="ltr">{minus || plus ? n(prev) : s(prev)}</span>
    </div>
  )
}

function CashTab({ query, asOf }: { query: string; asOf: boolean }) {
  const { pick, ur } = useLang()
  const { data: c } = useGet<Cash>(['audit-cash', query], `/api/v1/shop-audit/cash?${query}`)
  const { data: intl } = useGet<Intl>(['audit-intl', query], `/api/v1/shop-audit/international?${query}`)
  if (!c) return <Wait />
  const payLabel = (k: string) => (i18next.exists(`pay.${k}`) ? pick(`pay.${k}`) : k)
  const reason = (k: string) => (k.startsWith('reversal_of_') ? `${pick('audit.reason.reversal')}: ${pick(`audit.reason.${k.slice(12)}`)}` : pick(`audit.reason.${k}`))
  return (
    <div className="space-y-4" data-testid="nfin-cash">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Fig Icon={Landmark} label="audit.opening" v={withCur(s(c.opening))} testid="nfin-c-open" />
        <Fig Icon={ArrowDownLeft} label="audit.moneyIn" v={withCur(n(c.in_total))} tone="emerald" testid="nfin-c-in" />
        <Fig Icon={ArrowUpRight} label="audit.moneyOut" v={withCur(n(c.out_total))} tone="rose" testid="nfin-c-out" />
        <Fig Icon={Landmark} label={asOf ? 'audit.asOf' : 'audit.closing'} v={withCur(s(asOf ? c.as_of : c.closing))} sub={<>{pick('audit.now')} <span dir="ltr">{s(c.current)}</span></>} tone="dark" testid="nfin-c-close" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Reasons title="audit.fin.cameIn" keys={c.in_keys} values={c.in} total={c.in_total} tone="emerald" reason={reason} testid="nfin-cameIn" />
        <Reasons title="audit.fin.wentOut" keys={c.out_keys} values={c.out} total={c.out_total} tone="rose" reason={reason} testid="nfin-wentOut" />
      </div>
      <div><h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2.5">{pick('audit.fin.perAccount')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="nfin-accounts">{c.accounts.map((a) => (
          <Link key={a.cash_account_id} to="/new/more/cash" className={`p-4 space-y-2 hover:border-slate-400 ${card}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-display font-extrabold text-sm" dir="auto">{ur && a.name_ur ? a.name_ur : a.name}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850">{payLabel(a.kind)}</span></div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono" dir="ltr"><span className="text-slate-500">{n(a.opening)}</span><span className="text-emerald-700">+ {n(a.cash_in)}</span><span className="text-rose-600">− {n(a.cash_out)}</span><span className="font-extrabold">= {s(a.closing)}</span></div>
            {Number(a.transfers_in) || Number(a.transfers_out) ? <div className="text-[11px] text-slate-500">{pick('audit.fin.ofWhichTransfers')} <span dir="ltr">+{n(a.transfers_in)} / −{n(a.transfers_out)}</span></div> : null}
            <div className="flex flex-wrap gap-1 text-[10px]">{Object.entries(a.in).filter(([, v]) => Number(v)).map(([k, v]) => <span key={`i${k}`} className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700">{reason(k)} <span dir="ltr">{n(v)}</span></span>)}{Object.entries(a.out).filter(([, v]) => Number(v)).map(([k, v]) => <span key={`o${k}`} className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700">{reason(k)} <span dir="ltr">{n(v)}</span></span>)}</div>
          </Link>
        ))}</div>
      </div>
      <section className={`p-4 space-y-2 ${card}`} data-testid="nfin-channels">
        <div className="font-display font-extrabold text-sm">{pick('audit.fin.channels')}</div>
        {c.by_kind.map((k) => <div key={k.kind} className="flex items-center justify-between text-xs"><span className="font-bold">{payLabel(k.kind)}</span><span className="font-mono" dir="ltr"><span className="text-emerald-700">+ {n(k.in)}</span> · <span className="text-rose-600">− {n(k.out)}</span> · = {s(k.closing)}</span></div>)}
        {c.payments_by_method.length ? <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">{pick('audit.fin.paymentsByMethod')}: {c.payments_by_method.map((m) => `${payLabel(m.method)} +${n(m.in)} / −${n(m.out)} (${m.count})`).join(' · ')}</div> : null}
      </section>
      {intl && intl.rows.length ? (
        <Link to={`/new/remittance`} className={`p-4 flex flex-wrap items-center justify-between gap-3 hover:border-slate-400 ${card}`} data-testid="nfin-intl">
          <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-slate-500" /><div><div className="font-display font-extrabold text-sm">{pick('audit.fin.international')}</div><div className="text-[11px] text-slate-500">{intl.by_currency.map((x) => `${x.currency} ${n(x.foreign_amount)} → ${n(x.pkr_amount)} (${x.count})`).join(' · ')}</div></div></div>
          <span className="font-mono text-sm font-extrabold text-emerald-700" dir="ltr">+ {withCur(n(intl.total_pkr_in))}</span>
        </Link>
      ) : null}
      <Notes notes={c.notes} />
    </div>
  )
}

function ExpensesTab({ query }: { query: string }) {
  const { pick, ur } = useLang()
  const { data: e } = useGet<Expenses>(['audit-expenses', query], `/api/v1/shop-audit/expenses?${query}`)
  if (!e) return <Wait />
  const top = Math.max(1, ...e.series.map((x) => Number(x.amount)))
  const catTop = Math.max(1, ...e.by_category.map((x) => Number(x.amount)))
  return (
    <div className="space-y-4" data-testid="nfin-expenses">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-2xl p-5 bg-orange-50 dark:bg-orange-950/25 border border-orange-200 dark:border-orange-800/60 text-orange-900 dark:text-orange-200" data-testid="nfin-exp-hero">
          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{pick('audit.expenses')}</div>
          <div className="font-display font-extrabold text-4xl tracking-tight my-2" dir="ltr">{withCur(n(e.total))}</div>
          <div className="text-xs font-semibold opacity-80"><span dir="ltr">{e.count}</span> {pick('audit.fin.entries')} · {pick('audit.vsPrevious')} <span dir="ltr">{n(e.previous_total)}</span>{Number(e.owner_drawing) ? <> · {pick('counter.ownerTook')} <span dir="ltr">{n(e.owner_drawing)}</span></> : null}</div>
        </section>
        <section className={`lg:col-span-2 p-5 ${card}`}>
          {!e.series.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : <div className="flex items-end gap-1.5 h-32" dir="ltr">{e.series.map((x) => <div key={x.bucket} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${x.bucket} · ${n(x.amount)}`}><span className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(3, Math.round((Number(x.amount) / top) * 100))}%` }} /><span className="text-[9px] text-slate-400">{bucketLabel(x.bucket, e.granularity)}</span></div>)}</div>}
        </section>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`p-4 space-y-2.5 ${card}`} data-testid="nfin-cats">
          <div className="font-display font-extrabold text-sm">{pick('nfin.byCategory')}</div>
          {!e.by_category.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : e.by_category.map((c) => { const prev = e.previous_by_category.find((x) => x.key === c.key); return (
            <Link key={c.key} to="/new/expenses" className="block space-y-1">
              <div className="flex items-center justify-between text-xs"><span className="font-bold" dir="auto">{ur && c.name_ur ? c.name_ur : c.name} <span className="font-normal text-slate-400">({c.count})</span></span><span className="font-mono font-bold" dir="ltr">{n(c.amount)}</span></div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.max(3, Math.round((Number(c.amount) / catTop) * 100))}%` }} /></div>
              {prev ? <div className="text-[10px] text-slate-400">{pick('audit.vsPrevious')} <span dir="ltr">{n(prev.amount)}</span></div> : null}
            </Link>
          ) })}
        </section>
        <section className={`${card}`} data-testid="nfin-largest">
          <div className="p-4 pb-2 font-display font-extrabold text-sm">{pick('audit.fin.largest')}</div>
          {!e.largest.length ? <p className="px-4 pb-4 text-xs text-slate-400">{pick('audit.noData')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{e.largest.map((x) => <Link key={x.id} to="/new/expenses" className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-obsidian-850/60"><span className="min-w-0"><span className="block font-bold truncate" dir="auto">{x.category_name}{x.description ? ` · ${x.description}` : ''}</span><span className="block text-[10px] text-slate-500"><span dir="ltr">{fmtDate(x.date)} · {x.no}</span>{x.user_name ? ` · ${x.user_name}` : ''}{x.account ? ` · ${x.account}` : ''}</span></span><span className="font-mono font-bold shrink-0" dir="ltr">{n(x.amount)}</span></Link>)}</div>}
          {e.by_user.length || e.by_account.length ? <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex flex-wrap gap-x-3">{e.by_user.map((u, i) => <span key={i}>{u.user_name ?? '—'}: <span dir="ltr">{n(u.amount)}</span> ({u.count})</span>)}{e.by_account.map((a, i) => <span key={`a${i}`}>{a.name ?? a.kind}: <span dir="ltr">{n(a.amount)}</span></span>)}</div> : null}
        </section>
      </div>
      <Notes notes={e.notes} />
    </div>
  )
}

function TaxTab({ query }: { query: string }) {
  const { pick } = useLang()
  const { data: t } = useGet<Tax>(['audit-tax', query], `/api/v1/shop-audit/tax?${query}`)
  if (!t) return <Wait />
  return (
    <div className="space-y-4" data-testid="nfin-tax">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Fig Icon={Receipt} label="audit.fin.taxedBills" v={`${t.taxed_invoices} / ${t.invoices}`} testid="nfin-t-bills" />
        <Fig Icon={Receipt} label="audit.fin.taxable" v={withCur(n(t.taxable_sales))} />
        <Fig Icon={Wallet} label="counter.taxCollected" v={withCur(n(t.tax_on_invoices))} tone="emerald" testid="nfin-t-tax" />
        <Fig Icon={Wallet} label="audit.fin.taxNet" v={withCur(n(t.tax_net_of_returns))} tone="dark" />
      </div>
      <section className={card} data-testid="nfin-t-rows">
        {!t.rows.length ? <p className="p-8 text-center text-sm text-slate-400">{pick('audit.fin.noTax')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{t.rows.map((r) => <Link key={r.invoice_id} to={`/sales/${r.invoice_id}`} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-obsidian-850/60"><span className="min-w-0"><span className="block font-bold truncate" dir="auto">{r.party_name ?? pick('audit.fin.walkIn')} <span className="font-normal text-slate-500" dir="ltr">· {r.no}</span></span><span className="block text-[10px] text-slate-500" dir="ltr">{fmtDate(r.date)} · {n(r.taxable)} @ {Number(r.tax_rate)}% {pick(r.tax_inclusive ? 'audit.fin.inclusive' : 'audit.fin.exclusive')}{Number(r.returned_total) ? ` · ${pick('counter.salesReturns')} ${n(r.returned_total)}` : ''}</span></span><span className="font-mono font-bold shrink-0" dir="ltr">{n(r.tax_amount)}</span></Link>)}</div>}
      </section>
      <Notes notes={t.notes} />
    </div>
  )
}

function Fig({ Icon, label, v, sub, tone, testid }: { Icon: typeof Receipt; label: string; v: string; sub?: ReactNode; tone?: 'emerald' | 'rose' | 'dark'; testid?: string }) {
  const { pick } = useLang()
  const box = tone === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60' : tone === 'rose' ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/60' : tone === 'dark' ? 'bg-obsidian-900 text-white border-slate-800' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800'
  return (
    <div className={`p-4 rounded-2xl border ${box}`} data-testid={testid}>
      <div className="flex items-center gap-2"><Icon className="w-4 h-4 opacity-60" /><span className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">{pick(label)}</span></div>
      <div className={`font-display font-extrabold text-xl mt-1 ${tone === 'dark' ? 'text-[#A3E635]' : ''}`} dir="ltr">{v}</div>
      {sub ? <div className="text-[11px] opacity-70 mt-0.5">{sub}</div> : null}
    </div>
  )
}

function Reasons({ title, keys, values, total, tone, reason, testid }: { title: string; keys: string[]; values: Record<string, M>; total: M; tone: 'emerald' | 'rose'; reason: (k: string) => string; testid: string }) {
  const { pick } = useLang()
  const entries = [...keys.filter((k) => Number(values[k])).map((k) => [k, values[k]] as const), ...Object.entries(values).filter(([k, v]) => !keys.includes(k) && Number(v))]
  const top = Math.max(1, ...entries.map(([, v]) => Number(v)))
  return (
    <section className={`p-4 space-y-2 ${card}`} data-testid={testid}>
      <div className="flex items-center justify-between"><span className="font-display font-extrabold text-sm">{pick(title)}</span><span className={`font-mono font-extrabold ${tone === 'emerald' ? 'text-emerald-700' : 'text-rose-600'}`} dir="ltr">{n(total)}</span></div>
      {!entries.length ? <p className="text-xs text-slate-400">—</p> : entries.map(([k, v]) => <div key={k} className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="font-semibold">{reason(k)}</span><span className="font-mono" dir="ltr">{n(v)}</span></div><div className="h-1.5 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${Math.max(3, Math.round((Number(v) / top) * 100))}%` }} /></div></div>)}
    </section>
  )
}

function Notes({ notes }: { notes: string[] }) {
  const { ur, pick } = useLang()
  // the server's notes are in English; in Urdu the audit's own limitations line says the same
  if (ur) return <p className="text-[11px] text-slate-500">{pick('audit.limitations')}</p>
  return notes.length ? <ul className="list-disc ps-5 text-[11px] text-slate-500 space-y-0.5">{notes.map((x, i) => <li key={i}>{x}</li>)}</ul> : null
}
