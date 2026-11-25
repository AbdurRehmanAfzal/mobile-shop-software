/** Shop audit → Sales & purchases in the new product (ADR-134), drawn from mock-up 22's third tab:
 *  Sales analytics / Purchases analytics (`?side=`), the three hero figures, then brand & model-wise
 *  cards (units, sales, cost, profit, the highest-profit and lowest-cost phone, every phone with its
 *  bill, IMEI, who it came from and who it went to, the bill's paid / due) or every bill with the
 *  drawing's pay-state chips (`?view=`, `?status=`), the series, by employee and by person.
 *
 *  Every figure is the live audit's: `/shop-audit/sales`, `/purchases` (the bills, the status, the
 *  series, by employee / person) and `/sales/units`, `/purchases/units` (each phone's trail and the
 *  model totals and picks, `shopaudit/units.py`), with `/products` for the days to sell. The app adds
 *  nothing up. Differences: the drawing's percentages ("32.4% instant collection") are the period
 *  before's figure or left out; "Receive Rs. …" on a bill opens the bill (money is taken on the
 *  khata, never from an audit); purchases are for the owner / manager, as the server. */

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ShoppingBag, Truck, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame } from './Audit'
import { Caps, Notes, PayPill, Pill, Secret, SectionReport, Segs, Table, Tile, Wait, card, n, rs, type M } from '../auditKit'

type St = 'paid' | 'partial' | 'unpaid' | 'returned'
interface StatusRow { status: St; count: number; amount: M; due: M }
interface Sales {
  granularity: string
  totals: { bills: number; units: number; billed: M; discount: M; tax: M; returned: M; at_counter: M; on_credit: M; paid: M; due: M; profit: M | null; cash_bills: number; credit_bills: number; previous_billed: M; avg_bill: M }
  by_status: StatusRow[]
  series: { bucket: string; billed: M; on_credit: M }[]
  by_user: { user_id: string | null; user_name: string | null; bills: number; billed: M; discount: M; on_credit: M; profit: M | null; returns: number }[]
  by_party: { party_id: string | null; name: string | null; bills: number; billed: M; due: M }[]
  rows: { id: string; no: string; date: string; party_name: string | null; user_name: string | null; billed: M; paid: M; due: M; pay_status: St }[]
  rows_total: number
}
interface Purchases {
  granularity: string
  totals: { bills: number; phones: number; items: number; total: M; at_counter: M; on_credit: M; owed: M; cash_bills: number; credit_bills: number; returns: number; returns_amount: M; previous_total: M }
  by_status: StatusRow[]
  series: { bucket: string; total: M; phones: number }[]
  by_user: { user_id: string | null; user_name: string | null; bills: number; total: M; phones: number }[]
  by_party: { party_id: string | null; name: string | null; bills: number; phones: number; total: M; owed: M }[]
  rows: { id: string; no: string; date: string; party_name: string | null; user_name: string | null; supplier_invoice_no: string | null; total: M; paid: M; owed: M; pay_status: St; phones: number; items: number }[]
  rows_total: number
}
interface Unit { device_id: string; imei1: string; storage: string | null; colour: string | null; condition: string; pta_status: string; status_now: string; date: string; supplier: string | null; supplier_id: string | null; purchase_id: string | null; purchase_no: string | null; cost: M | null; profit: M | null; pay_status: St; bill_paid: M; invoice_id: string | null; invoice_no: string | null; buyer: string | null; buyer_id: string | null }
interface SoldUnit extends Unit { invoice_id: string; invoice_no: string; price: M; bill_due: M }
interface BoughtUnit extends Unit { purchase_id: string; purchase_no: string; cost: M; bill_owed: M; sold: boolean; sold_for: M | null }
interface SoldModel { key: string; brand: string; label: string; units: number; revenue: M; cost: M | null; profit: M | null; highest_profit: SoldUnit | null; lowest_cost: SoldUnit | null; rows: SoldUnit[] }
interface BoughtModel { key: string; brand: string; label: string; units: number; invested: M; sold: number; in_stock: number; profit: M; lowest_cost: BoughtUnit; highest_cost: BoughtUnit; rows: BoughtUnit[] }
interface Units<T> { models: T[]; units: number; truncated: boolean; notes: string[] }
interface Products { rows: { key: string; avg_holding_days: number | null }[] }

type Side = 'sales' | 'purchases'
type View = 'models' | 'bills'
const STATUSES: St[] = ['paid', 'partial', 'unpaid', 'returned']
const label = (b: string, g: string) => (g === 'month' ? b.slice(0, 7) : g === 'day' ? b.slice(8, 10) : b.slice(5))

export default function NewAuditSales() {
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const side: Side = canCost && sp.get('side') === 'purchases' ? 'purchases' : 'sales'
  const view: View = sp.get('view') === 'bills' ? 'bills' : 'models'
  const status = STATUSES.find((s) => s === sp.get('status')) ?? null
  const set = (k: string, v: string | null) => { const o = new URLSearchParams(sp); if (v) o.set(k, v); else o.delete(k); setSp(o, { replace: true }) }
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  // the whole period for the figures and the chips; the bills of one pay state when a chip is on
  const s = useGet<Sales>(['audit-sales', query, ''], side === 'sales' ? `/api/v1/shop-audit/sales?${query}` : null)
  const p = useGet<Purchases>(['audit-purchases', query, ''], side === 'purchases' ? `/api/v1/shop-audit/purchases?${query}` : null)
  const sf = useGet<Sales>(['audit-sales', query, status], side === 'sales' && view === 'bills' && status ? `/api/v1/shop-audit/sales?${query}&status=${status}` : null)
  const pf = useGet<Purchases>(['audit-purchases', query, status], side === 'purchases' && view === 'bills' && status ? `/api/v1/shop-audit/purchases?${query}&status=${status}` : null)
  const su = useGet<Units<SoldModel>>(['audit-sales-units', query], side === 'sales' && view === 'models' ? `/api/v1/shop-audit/sales/units?${query}` : null)
  const bu = useGet<Units<BoughtModel>>(['audit-purchases-units', query], side === 'purchases' && view === 'models' ? `/api/v1/shop-audit/purchases/units?${query}` : null)
  const pr = useGet<Products>(['audit-products', query, 'model'], side === 'sales' && view === 'models' ? `/api/v1/shop-audit/products?${query}&group=model` : null)
  const days = useMemo(() => new Map((pr.data?.rows ?? []).map((r) => [r.key, r.avg_holding_days])), [pr.data])
  const models = (side === 'sales' ? su.data?.models : bu.data?.models) ?? []
  const brands = [...new Set(models.map((m) => m.brand))].sort()
  const match = (m: SoldModel | BoughtModel) => {
    if (brand && m.brand !== brand) return false
    const t = q.trim().toLowerCase()
    if (!t) return true
    return `${m.label}`.toLowerCase().includes(t) || (m.rows as Unit[]).some((u) => `${u.imei1} ${u.supplier ?? ''} ${u.buyer ?? ''} ${u.invoice_no ?? ''} ${u.purchase_no ?? ''}`.toLowerCase().includes(t))
  }

  return (
    <AuditFrame section="sales" testid="nsa">
      <div className={`p-3 flex flex-wrap items-center justify-between gap-3 ${card}`}>
        <Segs<Side> tabs={canCost ? ['sales', 'purchases'] : ['sales']} value={side} onChange={(t) => set('side', t === 'sales' ? null : t)} label={(t) => <span className="flex items-center gap-1.5">{t === 'sales' ? <ShoppingBag className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}{pick(`nau.sa.${t}`)}</span>} testid="nsa-side" />
        <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500 font-medium">{pick(side === 'sales' ? 'nau.sa.salesHint' : 'nau.sa.purchasesHint')}</span><SectionReport sections={[side]} name={side === 'sales' ? 'sales-report' : 'purchase-report'} testid="nsa-report" /></div>
      </div>

      {side === 'sales' ? (!s.data ? <Wait /> : <SalesHero d={s.data} onView={(v, st) => { const o = new URLSearchParams(sp); o.set('view', v); if (st) o.set('status', st); else o.delete('status'); setSp(o, { replace: true }) }} />) : (!p.data ? <Wait /> : <PurchasesHero d={p.data} />)}

      <section className={`p-4 sm:p-5 space-y-4 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segs<View> tabs={['models', 'bills']} value={view} onChange={(v) => set('view', v === 'models' ? null : v)} label={(v) => pick(`nau.sa.view.${side}.${v}`)} testid="nsa-view" />
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {view === 'models' && brands.length > 1 ? <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={pick('nau.sa.allBrands')} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="nsa-brand"><option value="">{pick('nau.sa.allBrands')}</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select> : null}
            {view === 'models' ? <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 w-full sm:w-64"><Search className="w-3.5 h-3.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick(side === 'sales' ? 'nau.sa.searchSales' : 'nau.sa.searchPurchases')} className="min-w-0 flex-1 bg-transparent text-xs outline-none" data-testid="nsa-search" /></label> : null}
          </div>
        </div>

        {view === 'models' ? (
          side === 'sales' ? (!su.data ? <Wait /> : !su.data.models.length ? <Empty /> : (
            <div className="space-y-4" data-testid="nsa-models">{su.data.models.filter(match).map((m) => <SoldCard key={m.key} m={m} days={days.get(m.key) ?? null} />)}<Notes notes={su.data.notes} /></div>
          )) : (!bu.data ? <Wait /> : !bu.data.models.length ? <Empty /> : (
            <div className="space-y-4" data-testid="nsa-models">{bu.data.models.filter(match).map((m) => <BoughtCard key={m.key} m={m} />)}<Notes notes={bu.data.notes} /></div>
          ))
        ) : side === 'sales' ? (!s.data || (status && !sf.data) ? <Wait /> : <SalesBills d={s.data} rows={status && sf.data ? sf.data : s.data} status={status} onStatus={(x) => set('status', x)} />) : (!p.data || (status && !pf.data) ? <Wait /> : <PurchaseBills d={p.data} rows={status && pf.data ? pf.data : p.data} status={status} onStatus={(x) => set('status', x)} />)}
      </section>

      {side === 'sales' && s.data ? <SalesPeople d={s.data} /> : side === 'purchases' && p.data ? <PurchasePeople d={p.data} /> : null}
    </AuditFrame>
  )
}

const Empty = () => { const { pick } = useLang(); return <p className="py-10 text-center text-sm text-slate-400">{pick('audit.noData')}</p> }

function Series({ data, tone, testid }: { data: { key: string; label: string; value: number; hint: string }[]; tone: string; testid: string }) {
  const top = Math.max(1, ...data.map((x) => x.value))
  if (!data.some((x) => x.value)) return null
  return (
    <section className={`p-4 ${card}`} data-testid={testid}>
      <div className="flex items-end gap-1 h-24" dir="ltr">{data.map((x) => <div key={x.key} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${x.key} · ${x.hint}`}><span className={`w-full rounded-t ${tone}`} style={{ height: `${Math.max(x.value ? 4 : 0, Math.round((x.value / top) * 100))}%` }} /><span className="text-[9px] text-slate-400">{x.label}</span></div>)}</div>
    </section>
  )
}

function SalesHero({ d, onView }: { d: Sales; onView: (v: View, st: St | null) => void }) {
  const { pick } = useLang()
  const t = d.totals
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile tone="lime" label={pick('nau.sa.billed')} value={withCur(n(t.billed))} onClick={() => onView('models', null)} testid="nsa-billed" sub={<><span dir="ltr">{t.bills}</span> {pick('audit.bills')} · <span dir="ltr">{t.units}</span> {pick('audit.trade.units')}{t.profit != null ? <> · {pick('counter.grossProfit')} <span dir="ltr"><Secret>{n(t.profit)}</Secret></span></> : null} · {pick('audit.vsPrevious')} <span dir="ltr">{n(t.previous_billed)}</span></>} />
        <Tile label={pick('audit.trade.atCounter')} value={withCur(n(t.at_counter))} valueTone="text-emerald-600 dark:text-[#A3E635]" onClick={() => onView('bills', 'paid')} testid="nsa-counter" sub={<><span dir="ltr">{t.cash_bills}</span> {pick('audit.bills')}</>} />
        <Tile label={pick('nau.sa.onCredit')} value={withCur(n(t.on_credit))} valueTone="text-amber-600 dark:text-amber-400" onClick={() => onView('bills', 'unpaid')} testid="nsa-credit" sub={<><span dir="ltr">{t.credit_bills}</span> {pick('audit.bills')} · {pick('audit.doc.due')} <span dir="ltr">{n(t.due)}</span></>} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" data-testid="nsa-extras">
        <span>{pick('counter.discounts')} <b dir="ltr">{n(t.discount)}</b></span><span>{pick('audit.trade.tax')} <b dir="ltr">{n(t.tax)}</b></span><span>{pick('counter.salesReturns')} <b dir="ltr">{n(t.returned)}</b></span><span>{pick('audit.trade.avgBill')} <b dir="ltr">{n(t.avg_bill)}</b></span>
      </div>
      <Series data={d.series.map((x) => ({ key: x.bucket, label: label(x.bucket, d.granularity), value: Number(x.billed), hint: `${n(x.billed)} · ${pick('nau.sa.onCredit')} ${n(x.on_credit)}` }))} tone="bg-[#A3E635]" testid="nsa-series" />
    </>
  )
}

function PurchasesHero({ d }: { d: Purchases }) {
  const { pick } = useLang()
  const t = d.totals
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile tone="dark" label={pick('nau.sa.bought')} value={<Secret>{withCur(n(t.total))}</Secret>} testid="nsa-bought" sub={<><span dir="ltr">{t.bills}</span> {pick('audit.bills')} · <span dir="ltr">{t.phones}</span> {pick('audit.phones')}{t.items ? <> · <span dir="ltr">{t.items}</span> {pick('audit.trade.items')}</> : null} · {pick('audit.vsPrevious')} <span dir="ltr"><Secret>{n(t.previous_total)}</Secret></span></>} />
        <Tile label={pick('audit.trade.paidNow')} value={withCur(n(t.at_counter))} valueTone="text-emerald-600 dark:text-[#A3E635]" testid="nsa-paidnow" sub={<><span dir="ltr">{t.cash_bills}</span> {pick('audit.bills')}</>} />
        <Tile label={pick('nau.sa.boughtOnKhata')} value={withCur(n(t.on_credit))} valueTone="text-rose-600 dark:text-rose-400" to="/new/khata" testid="nsa-owed" sub={<><span dir="ltr">{t.credit_bills}</span> {pick('audit.bills')} · {pick('audit.trade.owed')} <span dir="ltr">{n(t.owed)}</span></>} />
      </div>
      {t.returns ? <p className="text-xs text-slate-500">{pick('audit.trade.returnedToSupplier')} <b dir="ltr">{t.returns}</b> · <b dir="ltr">{withCur(n(t.returns_amount))}</b></p> : null}
      <Series data={d.series.map((x) => ({ key: x.bucket, label: label(x.bucket, d.granularity), value: Number(x.total), hint: `${n(x.total)} · ${x.phones} ${pick('audit.phones')}` }))} tone="bg-sky-500" testid="nsa-series" />
    </>
  )
}

function specs(u: Unit, pick: (k: string) => string) {
  return [u.storage, u.colour, pick(`stock.condition.${u.condition}`), pick(`stock.pta.${u.pta_status}`)].filter(Boolean).join(' · ')
}

function Head({ brand, label, pills, line, right }: { brand: string; label: string; pills: ReactNode; line: ReactNode; right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {brand ? <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950" dir="auto">{brand}</span> : null}
          <h4 className="font-display font-extrabold text-base sm:text-lg" dir="auto">{label}</h4>{pills}
        </div>
        <p className="text-xs text-slate-500 mt-1">{line}</p>
      </div>
      {right}
    </div>
  )
}

function Pick({ tone, title, unit, extra, badge, testid }: { tone: 'emerald' | 'amber'; title: string; unit: Unit; extra: ReactNode; badge: ReactNode; testid: string }) {
  const box = tone === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'
  return (
    <div className={`p-3.5 rounded-xl border flex items-start justify-between gap-2 ${box}`} data-testid={testid}>
      <div className="min-w-0">
        <Caps className={tone === 'emerald' ? 'text-emerald-800 dark:text-[#A3E635]' : 'text-amber-800 dark:text-amber-300'}>{title}</Caps>
        <Link to={`/new/item/${unit.device_id}`} className="block font-mono font-bold mt-0.5 hover:underline" dir="ltr">{unit.imei1}</Link>
        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{extra}</div>
      </div>
      <span className={`px-2.5 py-1 rounded-lg font-mono font-extrabold shrink-0 ${tone === 'emerald' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-obsidian-950'}`} dir="ltr">{badge}</span>
    </div>
  )
}

const PREVIEW = 5

function SoldCard({ m, days }: { m: SoldModel; days: number | null }) {
  const { pick } = useLang()
  const [all, setAll] = useState(false)
  const rows = all ? m.rows : m.rows.slice(0, PREVIEW)
  const who = (name: string | null, id: string | null, walkIn: string) => (id ? <Link to={`/new/parties/${id}`} className="font-bold hover:underline" dir="auto">{name ?? '—'}</Link> : <span className="font-bold" dir="auto">{name ?? walkIn}</span>)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-850/60 p-4 sm:p-5 space-y-4" data-testid="nsa-model">
      <Head brand={m.brand} label={m.label}
        pills={<span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635] border border-emerald-500/30"><span dir="ltr">{m.units}</span> {pick('nau.sa.unitsSold')}</span>}
        line={<>{pick('nau.sa.totalSales')}: <b dir="ltr">{withCur(n(m.revenue))}</b>{m.cost != null ? <> · {pick('nau.sa.totalCost')}: <b dir="ltr"><Secret>{withCur(n(m.cost))}</Secret></b></> : null}{days != null ? <> · {pick('audit.prod.avgDays')}: <b dir="ltr">{days}</b></> : null}</>}
        right={<div className="flex items-center gap-3">{m.profit != null ? <div className="text-end"><Caps className="text-slate-400">{pick('nau.sa.modelProfit')}</Caps><div className={`font-mono font-extrabold text-base ${Number(m.profit) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr"><Secret>{rs(m.profit)}</Secret></div></div> : null}{m.rows.length > PREVIEW ? <button type="button" onClick={() => setAll(!all)} className="px-3.5 py-2 rounded-xl text-xs font-display font-extrabold bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 cursor-pointer" data-testid="nsa-inspect">{all ? <X className="w-3.5 h-3.5" /> : <>{pick('nau.sa.inspectAll')} <span dir="ltr">{m.units}</span></>}</button> : null}</div>}
      />
      {m.highest_profit && m.lowest_cost ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <Pick tone="emerald" title={pick('nau.sa.highestProfit')} unit={m.highest_profit} badge={<Secret>{rs(m.highest_profit.profit)}</Secret>} testid="nsa-best" extra={<>{pick('nau.sa.from')}: {who(m.highest_profit.supplier, m.highest_profit.supplier_id, '—')} (<Secret><span dir="ltr">{n(m.highest_profit.cost)}</span></Secret>) → {pick('nau.sa.to')}: {who(m.highest_profit.buyer, m.highest_profit.buyer_id, pick('audit.trade.walkIn'))} (<span dir="ltr">{n(m.highest_profit.price)}</span>)</>} />
          <Pick tone="amber" title={pick('nau.sa.lowestCost')} unit={m.lowest_cost} badge={<Secret>{withCur(n(m.lowest_cost.cost))}</Secret>} testid="nsa-cheapest" extra={<>{pick('nau.sa.from')}: {who(m.lowest_cost.supplier, m.lowest_cost.supplier_id, '—')} · {pick('nau.sa.to')}: {who(m.lowest_cost.buyer, m.lowest_cost.buyer_id, pick('audit.trade.walkIn'))} ({pick('counter.grossProfit')}: <Secret><span dir="ltr">{n(m.lowest_cost.profit)}</span></Secret>)</>} />
        </div>
      ) : null}
      <div className="bg-white dark:bg-obsidian-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <Table head={[pick('nau.sa.dateBill'), pick('nau.sa.imeiSpecs'), pick('nau.sa.supplier'), pick('nau.sa.buyer'), pick('nau.sa.debit'), pick('nau.sa.credit'), pick('counter.grossProfit'), pick('nau.sa.khataStatus')]} testid="nsa-units">
          {rows.map((u) => (
            <tr key={`${u.invoice_id}${u.device_id}`} className="hover:bg-slate-50 dark:hover:bg-obsidian-850">
              <td className="py-2.5 px-3"><Link to={`/sales/${u.invoice_id}`} className="font-mono font-bold hover:underline" dir="ltr">{u.invoice_no}</Link><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(u.date)}</div></td>
              <td className="py-2.5 px-3"><Link to={`/new/item/${u.device_id}`} className="font-mono font-bold hover:underline" dir="ltr">{u.imei1}</Link><div className="text-[10px] text-slate-400" dir="auto">{specs(u, pick)}</div></td>
              <td className="py-2.5 px-3">{who(u.supplier, u.supplier_id, '—')}<div className="text-[10px] text-slate-400"><span dir="ltr">{u.purchase_no ?? ''}</span>{u.cost != null ? <> · {pick('nau.sa.cost')} <Secret><span dir="ltr">{n(u.cost)}</span></Secret></> : null}</div></td>
              <td className="py-2.5 px-3">{who(u.buyer, u.buyer_id, pick('audit.trade.walkIn'))}</td>
              <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr">{n(u.price)}</td>
              <td className="py-2.5 px-3 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{n(u.bill_paid)}</td>
              <td className={`py-2.5 px-3 text-end font-mono font-extrabold ${Number(u.profit) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr">{u.profit != null ? <Secret>{rs(u.profit)}</Secret> : '—'}</td>
              <td className="py-2.5 px-3 text-end"><PayPill status={u.pay_status} due={u.bill_due} /></td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  )
}

function BoughtCard({ m }: { m: BoughtModel }) {
  const { pick } = useLang()
  const [all, setAll] = useState(false)
  const rows = all ? m.rows : m.rows.slice(0, PREVIEW)
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-850/60 p-4 sm:p-5 space-y-4" data-testid="nsa-model">
      <Head brand={m.brand} label={m.label}
        pills={<><span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30"><span dir="ltr">{m.units}</span> {pick('nau.sa.unitsBought')}</span><Pill tone="emerald"><span dir="ltr">{m.sold}</span> {pick('nau.sa.soldN')}</Pill><Pill tone="amber"><span dir="ltr">{m.in_stock}</span> {pick('nau.sa.inShop')}</Pill></>}
        line={<>{pick('nau.sa.invested')}: <b dir="ltr"><Secret>{withCur(n(m.invested))}</Secret></b> · {pick('nau.sa.profitSoFar')}: <b className="text-emerald-600 dark:text-[#A3E635]" dir="ltr"><Secret>{rs(m.profit)}</Secret></b></>}
        right={m.rows.length > PREVIEW ? <button type="button" onClick={() => setAll(!all)} className="px-3.5 py-2 rounded-xl text-xs font-display font-extrabold bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 cursor-pointer" data-testid="nsa-inspect">{all ? <X className="w-3.5 h-3.5" /> : <>{pick('nau.sa.inspectAll')} <span dir="ltr">{m.units}</span></>}</button> : null}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <Pick tone="emerald" title={pick('nau.sa.cheapestDeal')} unit={m.lowest_cost} badge={<Secret>{withCur(n(m.lowest_cost.cost))}</Secret>} testid="nsa-cheapest" extra={<>{pick('nau.sa.supplier')}: <b dir="auto">{m.lowest_cost.supplier ?? '—'}</b> (<span dir="ltr">{fmtDate(m.lowest_cost.date)}</span>) · {pick(`nau.sa.now.${m.lowest_cost.sold ? 'sold' : m.lowest_cost.status_now === 'in_stock' ? 'in_stock' : 'other'}`)}</>} />
        <Pick tone="amber" title={pick('nau.sa.dearestDeal')} unit={m.highest_cost} badge={<Secret>{withCur(n(m.highest_cost.cost))}</Secret>} testid="nsa-dearest" extra={<>{pick('nau.sa.supplier')}: <b dir="auto">{m.highest_cost.supplier ?? '—'}</b> (<span dir="ltr">{fmtDate(m.highest_cost.date)}</span>) · {pick(`nau.sa.now.${m.highest_cost.sold ? 'sold' : m.highest_cost.status_now === 'in_stock' ? 'in_stock' : 'other'}`)}</>} />
      </div>
      <div className="bg-white dark:bg-obsidian-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <Table head={[pick('nau.sa.dateBill'), pick('nau.sa.imeiSpecs'), pick('nau.sa.supplier'), pick('nau.sa.cost'), pick('nau.sa.billState'), pick('nau.sa.nowBuyer'), pick('counter.grossProfit')]} testid="nsa-units">
          {rows.map((u) => (
            <tr key={`${u.purchase_id}${u.device_id}`} className="hover:bg-slate-50 dark:hover:bg-obsidian-850">
              <td className="py-2.5 px-3"><Link to={`/purchases/${u.purchase_id}`} className="font-mono font-bold hover:underline" dir="ltr">{u.purchase_no}</Link><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(u.date)}</div></td>
              <td className="py-2.5 px-3"><Link to={`/new/item/${u.device_id}`} className="font-mono font-bold hover:underline" dir="ltr">{u.imei1}</Link><div className="text-[10px] text-slate-400" dir="auto">{specs(u, pick)}</div></td>
              <td className="py-2.5 px-3">{u.supplier_id ? <Link to={`/new/parties/${u.supplier_id}`} className="font-bold hover:underline" dir="auto">{u.supplier}</Link> : '—'}</td>
              <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr"><Secret>{n(u.cost)}</Secret></td>
              <td className="py-2.5 px-3"><PayPill status={u.pay_status} due={u.bill_owed} /></td>
              <td className="py-2.5 px-3"><Pill tone={u.sold ? 'emerald' : u.status_now === 'in_stock' ? 'amber' : 'slate'}>{pick(`nau.sa.now.${u.sold ? 'sold' : u.status_now === 'in_stock' ? 'in_stock' : 'other'}`)}</Pill>{u.sold ? <div className="text-[10px] text-slate-500 mt-0.5">{u.buyer_id ? <Link to={`/new/parties/${u.buyer_id}`} className="font-bold hover:underline" dir="auto">{u.buyer}</Link> : pick('audit.trade.walkIn')}{u.invoice_id ? <> · <Link to={`/sales/${u.invoice_id}`} className="hover:underline" dir="ltr">{u.invoice_no}</Link></> : null}</div> : null}</td>
              <td className={`py-2.5 px-3 text-end font-mono font-extrabold ${u.profit == null ? 'text-slate-400' : Number(u.profit) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr">{u.profit != null ? <Secret>{rs(u.profit)}</Secret> : '—'}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  )
}

function StatusChips({ rows, status, onStatus, total }: { rows: StatusRow[]; status: St | null; onStatus: (s: St | null) => void; total: number }) {
  const { pick } = useLang()
  const on = 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950'
  return (
    <div className="flex flex-wrap gap-1.5 text-xs pb-2 border-b border-slate-100 dark:border-slate-800" data-testid="nsa-status">
      <button type="button" onClick={() => onStatus(null)} aria-pressed={!status} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${!status ? on : 'bg-slate-100 dark:bg-obsidian-800'}`}>{pick('nau.sa.allBills')} (<span dir="ltr">{total}</span>)</button>
      {rows.map((r) => <button key={r.status} type="button" onClick={() => onStatus(status === r.status ? null : r.status)} aria-pressed={status === r.status} data-testid={`nsa-st-${r.status}`} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${status === r.status ? on : 'bg-slate-100 dark:bg-obsidian-800'}`}>{pick(`audit.trade.st.${r.status}`)} (<span dir="ltr">{r.count}</span>) · <span dir="ltr">{n(r.amount)}</span></button>)}
    </div>
  )
}

function SalesBills({ d: all, rows: d, status, onStatus }: { d: Sales; rows: Sales; status: St | null; onStatus: (s: St | null) => void }) {
  const { pick } = useLang()
  return (
    <>
      <StatusChips rows={all.by_status} status={status} onStatus={onStatus} total={all.rows_total} />
      {!d.rows.length ? <Empty /> : (
        <Table head={[pick('nau.sa.invoice'), pick('nau.sa.customer'), pick('nau.sa.byWhom'), pick('nau.sa.settlement'), pick('nau.sa.amount'), '']} testid="nsa-bills">
          {d.rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-obsidian-850">
              <td className="py-2.5 px-3"><span className="font-mono font-bold" dir="ltr">{r.no}</span><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(r.date)}</div></td>
              <td className="py-2.5 px-3 font-bold" dir="auto">{r.party_name ?? pick('audit.trade.walkIn')}</td>
              <td className="py-2.5 px-3 text-slate-500" dir="auto">{r.user_name ?? '—'}</td>
              <td className="py-2.5 px-3"><PayPill status={r.pay_status} due={r.due} /></td>
              <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr">{n(r.billed)}</td>
              <td className="py-2.5 px-3 text-end"><Link to={`/sales/${r.id}`} className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-slate-100 dark:bg-obsidian-800 whitespace-nowrap">{pick('nau.openBill')}</Link></td>
            </tr>
          ))}
        </Table>
      )}
      {d.rows_total > d.rows.length ? <p className="text-[11px] text-slate-500">{pick('nau.firstOf')} <span dir="ltr">{d.rows.length} / {d.rows_total}</span></p> : null}
    </>
  )
}

function PurchaseBills({ d: all, rows: d, status, onStatus }: { d: Purchases; rows: Purchases; status: St | null; onStatus: (s: St | null) => void }) {
  const { pick } = useLang()
  return (
    <>
      <StatusChips rows={all.by_status.filter((r) => r.status !== 'returned')} status={status} onStatus={onStatus} total={all.rows_total} />
      {!d.rows.length ? <Empty /> : (
        <Table head={[pick('nau.sa.purchaseBill'), pick('nau.sa.supplier'), pick('nau.sa.byWhom'), pick('nau.sa.settlement'), pick('nau.sa.amount'), '']} testid="nsa-bills">
          {d.rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-obsidian-850">
              <td className="py-2.5 px-3"><span className="font-mono font-bold" dir="ltr">{r.no}</span><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(r.date)}{r.supplier_invoice_no ? ` · ${r.supplier_invoice_no}` : ''}</div></td>
              <td className="py-2.5 px-3 font-bold" dir="auto">{r.party_name ?? '—'}<div className="text-[10px] font-normal text-slate-400"><span dir="ltr">{r.phones}</span> {pick('audit.phones')}{r.items ? <> · <span dir="ltr">{r.items}</span> {pick('audit.trade.items')}</> : null}</div></td>
              <td className="py-2.5 px-3 text-slate-500" dir="auto">{r.user_name ?? '—'}</td>
              <td className="py-2.5 px-3"><PayPill status={r.pay_status} due={r.owed} /></td>
              <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr"><Secret>{n(r.total)}</Secret></td>
              <td className="py-2.5 px-3 text-end"><Link to={`/purchases/${r.id}`} className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-slate-100 dark:bg-obsidian-800 whitespace-nowrap">{pick('nau.openBill')}</Link></td>
            </tr>
          ))}
        </Table>
      )}
      {d.rows_total > d.rows.length ? <p className="text-[11px] text-slate-500">{pick('nau.firstOf')} <span dir="ltr">{d.rows.length} / {d.rows_total}</span></p> : null}
    </>
  )
}

function List({ title, children, testid }: { title: string; children: ReactNode; testid: string }) {
  return <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid={testid}><h3 className="font-display font-extrabold text-sm">{title}</h3><div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{children}</div></section>
}

function SalesPeople({ d }: { d: Sales }) {
  const { pick } = useLang()
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <List title={pick('audit.trade.byUser')} testid="nsa-by-user">{d.by_user.map((u, i) => <div key={i} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{u.user_name ?? '—'}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{u.bills}</span> {pick('audit.bills')} · {pick('counter.discounts')} <span dir="ltr">{n(u.discount)}</span>{Number(u.on_credit) ? <> · {pick('nau.sa.onCredit')} <span dir="ltr">{n(u.on_credit)}</span></> : null}{u.returns ? <> · <span dir="ltr">{u.returns}</span> {pick('audit.trade.returns')}</> : null}{u.profit != null ? <> · {pick('counter.grossProfit')} <span dir="ltr"><Secret>{n(u.profit)}</Secret></span></> : null}</div></div><span className="font-mono font-extrabold shrink-0" dir="ltr">{withCur(n(u.billed))}</span></div>)}</List>
      <List title={pick('audit.trade.byCustomer')} testid="nsa-by-party">{d.by_party.map((r, i) => <Link key={i} to={r.party_id ? `/new/parties/${r.party_id}` : '/new/khata'} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-obsidian-850/60"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.name ?? pick('audit.trade.walkIn')}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{r.bills}</span> {pick('audit.bills')}{Number(r.due) ? <> · {pick('audit.doc.due')} <span className="text-rose-600" dir="ltr">{n(r.due)}</span></> : null}</div></div><span className="font-mono font-extrabold shrink-0" dir="ltr">{withCur(n(r.billed))}</span></Link>)}</List>
    </div>
  )
}

function PurchasePeople({ d }: { d: Purchases }) {
  const { pick } = useLang()
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <List title={pick('audit.trade.bySupplier')} testid="nsa-by-party">{d.by_party.map((r, i) => <Link key={i} to={r.party_id ? `/new/parties/${r.party_id}` : '/new/khata'} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-obsidian-850/60"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.name ?? '—'}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{r.bills}</span> {pick('audit.bills')} · <span dir="ltr">{r.phones}</span> {pick('audit.phones')}{Number(r.owed) ? <> · {pick('audit.trade.owed')} <span className="text-rose-600" dir="ltr">{n(r.owed)}</span></> : null}</div></div><span className="font-mono font-extrabold shrink-0" dir="ltr"><Secret>{withCur(n(r.total))}</Secret></span></Link>)}</List>
      <List title={pick('audit.trade.byUser')} testid="nsa-by-user">{d.by_user.map((u, i) => <div key={i} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{u.user_name ?? '—'}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{u.bills}</span> {pick('audit.bills')} · <span dir="ltr">{u.phones}</span> {pick('audit.phones')}</div></div><span className="font-mono font-extrabold shrink-0" dir="ltr"><Secret>{withCur(n(u.total))}</Secret></span></div>)}</List>
    </div>
  )
}

