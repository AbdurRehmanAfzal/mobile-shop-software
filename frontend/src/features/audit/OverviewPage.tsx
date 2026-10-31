/** Shop Audit → Overview (docs/16 §2–3, docs/17 P3-4): the KPI set for the chosen period.
 *  Balances show opening → closing (and as-of / current), flows show the period's sum; every tile
 *  opens the list behind it. */

import { ArrowDownLeft, ArrowUpRight, BookOpen, CheckCircle2, Landmark, Package, Receipt, ShieldCheck, Smartphone, Wallet, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Loading } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import Donut from '@/components/charts/Donut'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
interface Bal { opening: M; closing: M; as_of: M; current: M; parties?: number }
interface StockAt { count: number; cost_value: M | null; asking_value: M }
export interface Overview {
  period: { preset: string; date_from: string; date_to: string; as_of: string; prev_from: string; prev_to: string; days: number }
  coverage: { first_day: string | null; limitations: string[] }
  sales: { gross_sales: M; discounts: M; sales_returns: M; net_sales: M; tax_collected: M; invoices: number; invoices_total: M; phones_sold: number; sale_returns: { count: number; amount: M } }
  purchases: { purchases: number; purchases_total: M; purchases_net: M; phones_bought: number; purchase_returns: { count: number; amount: M } }
  profit: { cogs: M; gross_profit: M; operating_expenses: M; operating_profit: M; repair_income: M; other_income: M; net_profit: M; owner_drawing: M } | null
  expenses: { total: M; by_category: Record<string, M> }
  money: { opening: M; inflows: M; outflows: M; transfers: M; net: M; closing: M; as_of: M; current: M; by_kind: Record<string, M>; accounts: { cash_account_id: string; name: string; name_ur: string | null; kind: string; opening: M; cash_in: M; cash_out: M; transfers_in: M; transfers_out: M; closing: M; as_of: M; current: M }[] }
  debt: { receivable: Bal; payable: Bal; received_in_period: M; paid_in_period: M }
  stock: { opening: StockAt; closing: StockAt; as_of: StockAt; current: StockAt; note: string }
  previous: { net_sales: M; net_profit: M | null; total_expenses: M; inflows: M; outflows: M }
}
interface Reconcile { ok: boolean; checks: { key: string; ok: boolean; left: string | number; right: string | number; diff: string | number; name?: string }[] }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function OverviewPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const { data, isLoading } = useGet<Overview>(['audit-overview', query], `/api/v1/shop-audit/overview?${query}`)
  const { data: rc } = useGet<Reconcile>(['audit-reconcile', query], `/api/v1/shop-audit/reconcile?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const range = period.preset === 'custom' ? `from=${period.from}&to=${period.to}` : data ? `from=${data.period.date_from}&to=${data.period.date_to}` : ''
  const asOf = !!period.asOf
  const delta = (now: M, before: M) => {
    const a = Number(now), b = Number(before)
    if (!b) return null
    const pct = Math.round(((a - b) / Math.abs(b)) * 100)
    return <span className={`num ${pct >= 0 ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{pct >= 0 ? '+' : ''}{pct}%</span>
  }

  return (
    <AuditLayout>
      {isLoading || !data ? <Loading /> : (
        <>
          {/* hero: net sales and real profit for the period */}
          <section className="grid gap-2 sm:grid-cols-2">
            <Link to={`/invoices?kind=sale&${range}`} className="tap flex flex-col gap-1 rounded-3xl bg-sell px-5 py-4 text-sell-fg" data-testid="kpi-sales">
              <div className="flex items-center justify-between"><BiLabel text="audit.netSales" size="md" bold tone="text-current" />{delta(data.sales.net_sales, data.previous.net_sales)}</div>
              <span className="num text-[32px] leading-tight" dir="ltr">Rs. {n(data.sales.net_sales)}</span>
              <span className={`opacity-80 ${small}`}><span className="num">{data.sales.invoices}</span> {pick('audit.bills')} · <span className="num">{data.sales.phones_sold}</span> {pick('audit.phones')}{Number(data.sales.discounts) ? <> · {pick('counter.discounts')} <span className="num" dir="ltr">{n(data.sales.discounts)}</span></> : null}{Number(data.sales.sales_returns) ? <> · {pick('counter.salesReturns')} <span className="num" dir="ltr">{n(data.sales.sales_returns)}</span></> : null}</span>
            </Link>
            {canCost && data.profit ? (
              <Link to="/reports" className={`tap flex flex-col gap-1 rounded-3xl px-5 py-4 ${Number(data.profit.net_profit) >= 0 ? 'bg-ink text-ground' : 'bg-expense text-expense-fg'}`} data-testid="kpi-profit">
                <div className="flex items-center justify-between"><BiLabel text={Number(data.profit.net_profit) >= 0 ? 'counter.netProfit' : 'counter.netLoss'} size="md" bold tone="text-current" />{data.previous.net_profit ? delta(data.profit.net_profit, data.previous.net_profit) : null}</div>
                <span className="num text-[32px] leading-tight" dir="ltr">Rs. {n(data.profit.net_profit)}</span>
                <span className={`opacity-80 ${small}`}>{pick('counter.grossProfit')} <span className="num" dir="ltr">{n(data.profit.gross_profit)}</span> · {pick('counter.cogs')} <span className="num" dir="ltr">{n(data.profit.cogs)}</span> · {pick('audit.expenses')} <span className="num" dir="ltr">{n(data.profit.operating_expenses)}</span></span>
              </Link>
            ) : null}
          </section>

          {/* flows of the period */}
          <BiLabel text="audit.inPeriod" size="md" bold />
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Tile to={`/invoices?kind=purchase&${range}`} icon={Package} tone="bg-buy text-buy-fg" label="audit.purchases" value={n(data.purchases.purchases_net)} sub={<><span className="num">{data.purchases.purchases}</span> {pick('audit.bills')} · <span className="num">{data.purchases.phones_bought}</span> {pick('audit.phones')}</>} testid="kpi-purchases" />
            <Tile to="/expenses" icon={Wallet} tone="bg-expense text-expense-fg" label="audit.expenses" value={n(data.expenses.total)} sub={delta(data.expenses.total, data.previous.total_expenses) ?? <span>{pick('audit.vsPrevious')}: <span className="num" dir="ltr">{n(data.previous.total_expenses)}</span></span>} testid="kpi-expenses" />
            <Tile to="/more/cash" icon={ArrowDownLeft} tone="bg-emerald-tint text-emerald-deep" label="audit.moneyIn" value={n(data.money.inflows)} sub={<span>{pick('audit.vsPrevious')}: <span className="num" dir="ltr">{n(data.previous.inflows)}</span></span>} testid="kpi-inflows" />
            <Tile to="/more/cash" icon={ArrowUpRight} tone="bg-payable-tint text-payable" label="audit.moneyOut" value={n(data.money.outflows)} sub={<span>{pick('audit.vsPrevious')}: <span className="num" dir="ltr">{n(data.previous.outflows)}</span></span>} testid="kpi-outflows" />
          </section>
          {Number(data.money.transfers) ? <BiLabel text={{ en: `${pick('audit.transfersNote')} Rs. ${n(data.money.transfers)}`, ur: `${pick('audit.transfersNote')} Rs. ${n(data.money.transfers)}` }} size="sm" tone="text-muted" /> : null}

          {/* balances: opening → closing, as-of, current */}
          <BiLabel text={asOf ? 'audit.balancesAsOf' : 'audit.balances'} size="md" bold />
          <section className="grid gap-2 sm:grid-cols-2">
            <BalanceCard to="/more/cash" icon={Landmark} tone="bg-sell text-sell-fg" label="audit.cashBank" bal={data.money} asOf={asOf} testid="kpi-money"
              extra={<div className={`flex flex-wrap gap-x-3 ${small}`}>{data.money.accounts.map((a) => <span key={a.cash_account_id}>{ur && a.name_ur ? a.name_ur : a.name} <span className="num" dir="ltr">{n(asOf ? a.as_of : a.closing)}</span></span>)}</div>} />
            <BalanceCard to="/stock/summary" icon={Smartphone} tone="bg-stockt text-stockt-fg" label="audit.stock" bal={{ opening: String(data.stock.opening.count), closing: String(data.stock.closing.count), as_of: String(data.stock.as_of.count), current: String(data.stock.current.count) }} asOf={asOf} unit={pick('audit.phones')} testid="kpi-stock"
              extra={<div className={small}>{canCost && data.stock.current.cost_value != null ? <>{pick('audit.atCost')} <span className="num" dir="ltr">{n((asOf ? data.stock.as_of : data.stock.closing).cost_value)}</span> · </> : null}{pick('audit.atAsking')} <span className="num" dir="ltr">{n((asOf ? data.stock.as_of : data.stock.closing).asking_value)}</span></div>} />
            <BalanceCard to="/khata?f=get" icon={BookOpen} tone="bg-receivable-tint text-receivable" label="audit.receivable" bal={data.debt.receivable} asOf={asOf} testid="kpi-receivable"
              extra={<div className={small}>{pick('audit.receivedInPeriod')} <span className="num" dir="ltr">{n(data.debt.received_in_period)}</span> · <span className="num">{data.debt.receivable.parties}</span> {pick('audit.people')}</div>} />
            <BalanceCard to="/khata?f=give" icon={Receipt} tone="bg-payable-tint text-payable" label="audit.payable" bal={data.debt.payable} asOf={asOf} testid="kpi-payable"
              extra={<div className={small}>{pick('audit.paidInPeriod')} <span className="num" dir="ltr">{n(data.debt.paid_in_period)}</span> · <span className="num">{data.debt.payable.parties}</span> {pick('audit.people')}</div>} />
          </section>

          {Object.values(data.money.by_kind).some((v) => Number(v) > 0) ? (
            <section className="card" data-testid="overview-donut">
              <BiLabel text="audit.chart.moneyByKind" size="sm" tone="text-muted" bold />
              <Donut data={Object.entries(data.money.by_kind).map(([k, v]) => ({ label: pick(`pay.${k}`), value: Math.max(0, Number(v)), key: k }))} empty="audit.noData" />
            </section>
          ) : null}
          {/* the books prove themselves */}
          {rc ? (
            <section className="card flex flex-col gap-2" data-testid="audit-checks">
              <div className="flex items-center gap-2"><ShieldCheck size={18} className={rc.ok ? 'text-emerald-deep' : 'text-payable'} /><BiLabel text={rc.ok ? 'audit.checksOk' : 'audit.checksFail'} size="md" bold /></div>
              <div className={`flex flex-wrap gap-x-4 gap-y-1 ${small}`}>
                {rc.checks.map((c, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 ${c.ok ? 'text-muted' : 'text-payable'}`}>{c.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{pick(`audit.check.${c.key}`)}{c.name ? ` · ${c.name}` : ''}{!c.ok ? <span className="num" dir="ltr"> ({String(c.diff)})</span> : null}</span>
                ))}
              </div>
            </section>
          ) : null}

          <div className={`flex flex-col gap-1 text-muted ${small}`}>
            {data.coverage.first_day ? <span>{pick('audit.coverage')} <span dir="ltr">{data.coverage.first_day}</span></span> : <span>{pick('audit.noRecords')}</span>}
            <span>{pick('audit.limitations')}</span>
          </div>
        </>
      )}
    </AuditLayout>
  )
}

function Tile({ to, icon: Icon, tone, label, value, sub, testid }: { to: string; icon: LucideIcon; tone: string; label: string; value: string; sub?: ReactNode; testid?: string }) {
  const { ur, cls } = useLang()
  return (
    <Link to={to} className="card tap flex min-w-0 flex-col gap-2" data-testid={testid}>
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
        <BiLabel text={label} size="sm" tone="text-muted" bold />
      </div>
      <span className="num text-2xl font-bold" dir="ltr">{value}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span> : null}
    </Link>
  )
}

function BalanceCard({ to, icon: Icon, tone, label, bal, asOf, unit, extra, testid }: { to: string; icon: LucideIcon; tone: string; label: string; bal: { opening: M; closing: M; as_of: M; current: M }; asOf: boolean; unit?: string; extra?: ReactNode; testid?: string }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const main = asOf ? bal.as_of : bal.closing
  return (
    <Link to={to} className="card tap flex min-w-0 flex-col gap-2" data-testid={testid}>
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
        <BiLabel text={label} size="sm" tone="text-muted" bold />
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="num text-2xl font-bold" dir="ltr">{unit ? `${n(main)} ${unit}` : `Rs. ${n(main)}`}</span>
        <span className={`text-muted ${small}`}>{pick(asOf ? 'audit.asOf' : 'audit.closing')}</span>
      </div>
      <div className={`flex flex-wrap gap-x-3 text-muted ${small}`}>
        <span>{pick('audit.opening')} <span className="num" dir="ltr">{n(bal.opening)}</span></span>
        {asOf ? <span>{pick('audit.closing')} <span className="num" dir="ltr">{n(bal.closing)}</span></span> : null}
        <span>{pick('audit.now')} <span className="num" dir="ltr">{n(bal.current)}</span></span>
      </div>
      {extra}
    </Link>
  )
}
