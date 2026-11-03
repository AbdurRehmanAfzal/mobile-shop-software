/** Shop Audit → Sales & purchases (docs/31 R2 / R3): the bills of the period with how they were
 *  paid — at the counter or on credit, fully / partly / not yet — per employee and per person, a
 *  series, and a filtered bill list where every row opens its bill. */

import { HandCoins, Search, ShoppingBag, Truck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import Help from '@/components/Help'
import { Empty, fmtDate, Pending } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import SectionDownload from './SectionDownload'
import { useAuditPeriod } from './period'

type M = string
type Tab = 'sales' | 'purchases'
type St = 'paid' | 'partial' | 'unpaid' | 'returned'
interface StatusRow { status: St; count: number; amount: M; due: M }
interface Sales {
  granularity: string
  totals: { bills: number; units: number; billed: M; discount: M; tax: M; returned: M; at_counter: M; on_credit: M; paid: M; due: M; profit: M | null; margin_pct: number | null; avg_bill: M; cash_bills: number; credit_bills: number; previous_billed: M; change_pct: number | null }
  by_status: StatusRow[]
  series: { bucket: string; bills: number; billed: M; at_counter: M; on_credit: M; profit: M | null }[]
  by_user: { user_id: string | null; user_name: string | null; bills: number; billed: M; discount: M; on_credit: M; profit: M | null; margin_pct: number | null; returns: number }[]
  by_party: { party_id: string | null; name: string | null; bills: number; billed: M; due: M }[]
  rows: { id: string; no: string; date: string; party_name: string | null; user_name: string | null; billed: M; paid: M; due: M; pay_status: St; on_credit: M }[]
  rows_total: number
}
interface Purchases {
  granularity: string
  totals: { bills: number; phones: number; items: number; total: M; at_counter: M; on_credit: M; owed: M; cash_bills: number; credit_bills: number; returns: number; returns_amount: M; previous_total: M; change_pct: number | null }
  by_status: StatusRow[]
  series: { bucket: string; bills: number; total: M; phones: number }[]
  by_user: { user_id: string | null; user_name: string | null; bills: number; total: M; phones: number }[]
  by_party: { party_id: string | null; name: string | null; bills: number; phones: number; total: M; owed: M }[]
  rows: { id: string; no: string; date: string; party_name: string | null; user_name: string | null; supplier_invoice_no: string | null; total: M; paid: M; owed: M; pay_status: St; phones: number; items: number }[]
  rows_total: number
}

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const label = (bucket: string, g: string) => (g === 'month' ? bucket.slice(0, 7) : bucket.slice(5))
const STATUSES: St[] = ['paid', 'partial', 'unpaid', 'returned']
/** help per pay status and per tab (docs/33) */
const STATUS_HELP: { key: St; helpKey: string }[] = [
  { key: 'paid', helpKey: 'audit.trade.st.paid' },
  { key: 'partial', helpKey: 'audit.trade.st.partial' },
  { key: 'unpaid', helpKey: 'audit.trade.st.unpaid' },
  { key: 'returned', helpKey: 'audit.trade.st.returned' },
]
const statusHelp = (k: St) => STATUS_HELP.find((x) => x.key === k)?.helpKey ?? 'audit.trade.st.paid'
const TONE: Record<St, string> = { paid: 'text-emerald-deep', partial: 'text-receivable', unpaid: 'text-payable', returned: 'text-muted' }

export default function TradePage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const tab = ((['sales', 'purchases'] as const).find((t) => t === sp.get('tab')) ?? 'sales') as Tab
  const status = STATUSES.find((s) => s === sp.get('status')) ?? null
  const user = sp.get('user') ?? ''
  const q = sp.get('q') ?? ''
  const set = (k: string, v: string | null) => { const o = new URLSearchParams(sp); if (v) o.set(k, v); else o.delete(k); setSp(o, { replace: true }) }
  const filters = `${status ? `&status=${status}` : ''}${user ? `&user_id=${user}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  const s = useGet<Sales>(['audit-sales', query, filters], tab === 'sales' ? `/api/v1/shop-audit/sales?${query}${filters}` : null)
  const p = useGet<Purchases>(['audit-purchases', query, filters], tab === 'purchases' && canCost ? `/api/v1/shop-audit/purchases?${query}${filters}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap shrink-0 whitespace-nowrap rounded-full border font-bold min-h-10 px-3.5 py-2 ${ur ? 'leading-[1.9]' : 'leading-tight text-sm'} ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : ''}`
  const users = tab === 'sales' ? s.data?.by_user ?? [] : p.data?.by_user ?? []

  const statusCards = (rows: StatusRow[]) => (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="trade-status">
      {rows.map((r) => (
        <div key={r.status} className="relative min-w-0">
        <button type="button" aria-pressed={status === r.status} onClick={() => set('status', status === r.status ? null : r.status)} className={`card tap flex w-full min-w-0 flex-col gap-1 text-start ${status === r.status ? 'ring-2 ring-ink' : ''}`}>
          <BiLabel text={`audit.trade.st.${r.status}`} size="sm" tone="text-muted" bold />
          <span className={`num text-xl font-bold ${TONE[r.status]}`}>{r.count}</span>
          <span className={`text-muted ${small}`} dir="ltr">{withCur(n(r.amount))}{Number(r.due) ? ` · ${pick('audit.doc.due')} ${n(r.due)}` : ''}</span>
        </button>
        <span className="absolute end-1.5 top-1.5"><Help term={statusHelp(r.status)} size="sm" /></span>
        </div>
      ))}
    </div>
  )
  const filterBar = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3">
        <Search size={16} className="text-muted" />
        <input value={q} onChange={(e) => set('q', e.target.value)} placeholder={pick(tab === 'sales' ? 'audit.trade.searchSales' : 'audit.trade.searchPurchases')} aria-label="search" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
      </label>
      <Help term="common.search" size="sm" />
      </div>
      {users.length > 1 || user ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="trade-users">
          <Help term="audit.trade.userFilter" size="sm" />
          <button type="button" aria-pressed={!user} onClick={() => set('user', null)} className={chip(!user)}>{pick('common.all')}</button>
          {users.filter((u) => u.user_id).map((u) => <button key={u.user_id} type="button" aria-pressed={user === u.user_id} onClick={() => set('user', u.user_id)} className={chip(user === u.user_id)}>{u.user_name ?? '—'}</button>)}
        </div>
      ) : null}
    </div>
  )

  return (
    <AuditLayout right={<SectionDownload sections={tab === 'sales' ? ['sales'] : ['purchases']} name={tab === 'sales' ? 'sales-report' : 'purchase-report'} />}>
      {canCost ? (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><BiSegmented<Tab> value={tab} onChange={(t) => set('tab', t)} options={[{ value: 'sales', text: 'audit.trade.sales' }, { value: 'purchases', text: 'audit.trade.purchases' }]} /></div>
          {tab === 'sales' ? <Help term="audit.trade.tab.sales" size="sm" /> : <Help term="audit.trade.tab.purchases" size="sm" />}
        </div>
      ) : null}

      {tab === 'sales' ? (!s.data ? <Pending error={s.error} retry={s.refetch} /> : (() => {
        const d = s.data, t = d.totals
        return (
          <>
            <section className="flex flex-col gap-1 rounded-3xl bg-sell px-5 py-4 text-sell-fg" data-testid="trade-hero">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShoppingBag size={20} /><BiLabel text="audit.trade.billed" size="md" bold tone="text-current" /><Help term="audit.trade.billed" size="sm" /></span>{t.change_pct != null ? <span className="num" dir="ltr">{t.change_pct >= 0 ? '+' : ''}{t.change_pct}%</span> : null}</div>
              <span className="num text-[32px] leading-tight" dir="ltr">{withCur(n(t.billed))}</span>
              <span className={`opacity-80 ${small}`}><span className="num">{t.bills}</span> {pick('audit.bills')} · <span className="num">{t.units}</span> {pick('audit.trade.units')}{canCost && t.profit != null ? <> · {pick('counter.grossProfit')} <span className="num" dir="ltr">{n(t.profit)}</span>{t.margin_pct != null ? <span dir="ltr"> ({t.margin_pct}%)</span> : null}</> : null}</span>
            </section>
            <div className="grid grid-cols-2 gap-2" data-testid="trade-counter">
              <div className="card flex min-w-0 flex-col gap-1"><span className="flex items-center gap-2"><HandCoins size={16} className="text-emerald-deep" /><BiLabel text="audit.trade.atCounter" size="sm" tone="text-muted" bold /><Help term="audit.trade.atCounter" size="sm" /></span><span className="num text-xl font-bold" dir="ltr">{withCur(n(t.at_counter))}</span><span className={`text-muted ${small}`}><span className="num">{t.cash_bills}</span> {pick('audit.bills')}</span></div>
              <div className="card flex min-w-0 flex-col gap-1"><span className="flex items-center gap-1"><BiLabel text="audit.trade.onCredit" size="sm" tone="text-muted" bold /><Help term="audit.trade.onCredit" size="sm" /></span><span className="num text-xl font-bold text-receivable" dir="ltr">{withCur(n(t.on_credit))}</span><span className={`text-muted ${small}`}><span className="num">{t.credit_bills}</span> {pick('audit.bills')} · {pick('audit.doc.due')} <span className="num" dir="ltr">{n(t.due)}</span></span></div>
            </div>
            <div className={`flex flex-wrap gap-x-4 text-muted ${small}`}>
              <span className="inline-flex items-center gap-1">{pick('counter.discounts')} <span className="num" dir="ltr">{n(t.discount)}</span><Help term="audit.trade.discounts" size="sm" /></span>
              <span className="inline-flex items-center gap-1">{pick('audit.trade.tax')} <span className="num" dir="ltr">{n(t.tax)}</span><Help term="common.tax" size="sm" /></span>
              <span className="inline-flex items-center gap-1">{pick('counter.salesReturns')} <span className="num" dir="ltr">{n(t.returned)}</span><Help term="audit.trade.returned" size="sm" /></span>
              <span className="inline-flex items-center gap-1">{pick('audit.trade.avgBill')} <span className="num" dir="ltr">{n(t.avg_bill)}</span><Help term="audit.trade.avgBill" size="sm" /></span>
            </div>
            {statusCards(d.by_status)}
            <section className="card"><div className="flex justify-end"><Help term="audit.trade.salesSeries" size="sm" /></div><Bars data={d.series.map((x) => ({ label: label(x.bucket, d.granularity), value: Number(x.billed), hint: `${pick('audit.trade.onCredit')} ${n(x.on_credit)}`, key: x.bucket }))} testid="trade-series" empty="audit.noData" /></section>
            {filterBar}
            <span className="flex items-center gap-1"><BiLabel text="audit.trade.byUser" size="md" bold /><Help term="audit.trade.byUser" size="sm" /></span>
            <div className="card divide-y divide-line p-0" data-testid="trade-by-user">
              {d.by_user.map((u, i) => (
                <button key={i} type="button" onClick={() => set('user', u.user_id && user !== u.user_id ? u.user_id : null)} className="tap flex w-full items-center gap-3 px-4 py-2 text-start">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{u.user_name ?? '—'}</span><span className={`text-muted ${small}`}><span className="num">{u.bills}</span> {pick('audit.bills')} · {pick('counter.discounts')} <span className="num" dir="ltr">{n(u.discount)}</span>{Number(u.on_credit) ? <> · {pick('audit.trade.onCredit')} <span className="num" dir="ltr">{n(u.on_credit)}</span></> : null}{u.returns ? <> · <span className="num">{u.returns}</span> {pick('audit.trade.returns')}</> : null}{canCost && u.profit != null ? <> · {pick('counter.grossProfit')} <span className="num" dir="ltr">{n(u.profit)}</span></> : null}</span></span>
                  <span className="num font-bold" dir="ltr">{withCur(n(u.billed))}</span>
                </button>
              ))}
            </div>
            <span className="flex items-center gap-1"><BiLabel text="audit.trade.byCustomer" size="md" bold /><Help term="audit.trade.byCustomer" size="sm" /></span>
            <div className="card divide-y divide-line p-0" data-testid="trade-by-party">
              {d.by_party.map((r, i) => (
                <Link key={i} to={r.party_id ? `/parties/${r.party_id}` : '/invoices?kind=sale'} className="tap flex items-center gap-3 px-4 py-2">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{r.name ?? pick('audit.trade.walkIn')}</span><span className={`text-muted ${small}`}><span className="num">{r.bills}</span> {pick('audit.bills')}{Number(r.due) ? <> · {pick('audit.doc.due')} <span className="num" dir="ltr">{n(r.due)}</span></> : null}</span></span>
                  <span className="num font-bold" dir="ltr">{withCur(n(r.billed))}</span>
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2"><BiLabel text="audit.trade.bills" size="md" bold /><Help term="audit.trade.bills" size="sm" /><span className={`text-muted ${small}`}>({d.rows_total})</span></div>
            {!d.rows.length ? <Empty text="audit.noData" /> : (
              <div className="card divide-y divide-line p-0" data-testid="trade-rows">
                {d.rows.map((r) => (
                  <Link key={r.id} to={`/sales/${r.id}`} className="tap flex items-center gap-3 px-4 py-2">
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold"><span dir="ltr">{r.no}</span> · {r.party_name ?? pick('audit.trade.walkIn')}</span><span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(r.date)}</span>{r.user_name ? ` · ${r.user_name}` : ''} · <span className={TONE[r.pay_status]}>{pick(`audit.trade.st.${r.pay_status}`)}</span>{Number(r.due) ? <> · {pick('audit.doc.due')} <span className="num" dir="ltr">{n(r.due)}</span></> : null}</span></span>
                    <span className="num font-bold" dir="ltr">{n(r.billed)}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )
      })()) : null}

      {tab === 'purchases' ? (!p.data ? <Pending error={p.error} retry={p.refetch} /> : (() => {
        const d = p.data, t = d.totals
        return (
          <>
            <section className="flex flex-col gap-1 rounded-3xl bg-buy px-5 py-4 text-buy-fg" data-testid="trade-hero">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><Truck size={20} /><BiLabel text="audit.trade.bought" size="md" bold tone="text-current" /><Help term="audit.trade.bought" size="sm" /></span>{t.change_pct != null ? <span className="num" dir="ltr">{t.change_pct >= 0 ? '+' : ''}{t.change_pct}%</span> : null}</div>
              <span className="num text-[32px] leading-tight" dir="ltr">{withCur(n(t.total))}</span>
              <span className={`opacity-80 ${small}`}><span className="num">{t.bills}</span> {pick('audit.bills')} · <span className="num">{t.phones}</span> {pick('audit.phones')}{t.items ? <> · <span className="num">{t.items}</span> {pick('audit.trade.items')}</> : null}</span>
            </section>
            <div className="grid grid-cols-2 gap-2" data-testid="trade-counter">
              <div className="card flex min-w-0 flex-col gap-1"><span className="flex items-center gap-1"><BiLabel text="audit.trade.paidNow" size="sm" tone="text-muted" bold /><Help term="audit.trade.paidNow" size="sm" /></span><span className="num text-xl font-bold" dir="ltr">{withCur(n(t.at_counter))}</span><span className={`text-muted ${small}`}><span className="num">{t.cash_bills}</span> {pick('audit.bills')}</span></div>
              <Link to="/khata?f=give" className="card tap flex min-w-0 flex-col gap-1"><span className="flex items-center gap-1"><BiLabel text="audit.trade.onCredit" size="sm" tone="text-muted" bold /><Help term="audit.trade.purchaseCredit" size="sm" /></span><span className="num text-xl font-bold text-payable" dir="ltr">{withCur(n(t.on_credit))}</span><span className={`text-muted ${small}`}><span className="num">{t.credit_bills}</span> {pick('audit.bills')} · {pick('audit.trade.owed')} <span className="num" dir="ltr">{n(t.owed)}</span></span></Link>
            </div>
            {t.returns ? <span className={`flex items-center gap-1 text-muted ${small}`}>{pick('audit.trade.returnedToSupplier')} <span className="num">{t.returns}</span> · <span className="num" dir="ltr">{withCur(n(t.returns_amount))}</span><Help term="audit.trade.returnedToSupplier" size="sm" /></span> : null}
            {statusCards(d.by_status.filter((r) => r.status !== 'returned'))}
            <section className="card"><div className="flex justify-end"><Help term="audit.trade.purchaseSeries" size="sm" /></div><Bars data={d.series.map((x) => ({ label: label(x.bucket, d.granularity), value: Number(x.total), hint: `${x.phones} ${pick('audit.phones')}`, key: x.bucket }))} tone="rgb(var(--payable))" testid="trade-series" empty="audit.noData" /></section>
            {filterBar}
            <span className="flex items-center gap-1"><BiLabel text="audit.trade.bySupplier" size="md" bold /><Help term="audit.trade.bySupplier" size="sm" /></span>
            <div className="card divide-y divide-line p-0" data-testid="trade-by-party">
              {d.by_party.map((r, i) => (
                <Link key={i} to={r.party_id ? `/parties/${r.party_id}` : '/invoices?kind=purchase'} className="tap flex items-center gap-3 px-4 py-2">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{r.name ?? '—'}</span><span className={`text-muted ${small}`}><span className="num">{r.bills}</span> {pick('audit.bills')} · <span className="num">{r.phones}</span> {pick('audit.phones')}{Number(r.owed) ? <> · {pick('audit.trade.owed')} <span className="num" dir="ltr">{n(r.owed)}</span></> : null}</span></span>
                  <span className="num font-bold" dir="ltr">{withCur(n(r.total))}</span>
                </Link>
              ))}
            </div>
            <span className="flex items-center gap-1"><BiLabel text="audit.trade.byUser" size="md" bold /><Help term="audit.trade.byUser" size="sm" /></span>
            <div className="card divide-y divide-line p-0" data-testid="trade-by-user">
              {d.by_user.map((u, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2"><span className="flex-1 font-bold">{u.user_name ?? '—'}</span><span className={`text-muted ${small}`}><span className="num">{u.bills}</span> {pick('audit.bills')} · <span className="num">{u.phones}</span> {pick('audit.phones')}</span><span className="num font-bold" dir="ltr">{withCur(n(u.total))}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-2"><BiLabel text="audit.trade.bills" size="md" bold /><Help term="audit.trade.bills" size="sm" /><span className={`text-muted ${small}`}>({d.rows_total})</span></div>
            {!d.rows.length ? <Empty text="audit.noData" /> : (
              <div className="card divide-y divide-line p-0" data-testid="trade-rows">
                {d.rows.map((r) => (
                  <Link key={r.id} to={`/purchases/${r.id}`} className="tap flex items-center gap-3 px-4 py-2">
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold"><span dir="ltr">{r.no}</span> · {r.party_name ?? '—'}</span><span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(r.date)}</span>{r.supplier_invoice_no ? <span dir="ltr"> · {r.supplier_invoice_no}</span> : null}{r.user_name ? ` · ${r.user_name}` : ''} · <span className={TONE[r.pay_status]}>{pick(`audit.trade.st.${r.pay_status}`)}</span>{Number(r.owed) ? <> · {pick('audit.trade.owed')} <span className="num" dir="ltr">{n(r.owed)}</span></> : null}</span></span>
                    <span className="num font-bold" dir="ltr">{n(r.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )
      })()) : null}
    </AuditLayout>
  )
}
