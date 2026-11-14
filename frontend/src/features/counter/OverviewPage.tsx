/** Business overview (owner 2026-11-14, ADR-076): every figure the shopkeeper asked for on one
 *  screen — the period's sales and purchases (paid / on udhaar, phones), profit, expenses, money in
 *  and out and from / to whom, returns, udhaar given and collected, customers and dealers, who owes
 *  and whom the shop owes, this month, top sold and bought, stock alerts, recent activity and every
 *  module's count — each with "View details" to the screen behind it. Owner / manager only. */

import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Loading, PageHeader, fmtDateTime } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import PeriodPicker, { periodOf, periodQuery, type Period } from './PeriodPicker'

type M = string
interface Who { party_id: string | null; name: string | null; phone?: string | null; amount: M; count?: number }
interface Overview {
  sales: { total: M; count: number; phones: number; paid: M; credit: M; profit: M | null }
  purchases: { count: number; total: M; paid: M; credit: M; phones: number; top: { name: string; qty: number; amount: M }[] }
  expenses: M; udhaar_given: M; udhaar_collected: M
  returns: { sale: { count: number; amount: M }; purchase: { count: number; amount: M } }
  payments: { in: { total: M; people: Who[]; people_count: number }; out: { total: M; people: Who[]; people_count: number } }
  people: { customers: number; dealers: number; new_customers: number; new_dealers: number }
  dues: { to_get: M; to_give: M; to_get_count: number; to_give_count: number; to_get_list: Who[]; to_give_list: Who[] }
  month: { from: string; sales: M; expenses: M; profit: M | null }
  top_sold: { name: string; qty: number; amount: M; profit: M | null }[]
  alerts: { on_hand: number; available: number; faulty: number; inspection: number; in_repair: number; reserved: number; old_60d: number; items_low: number; items_out: number }
  recent: { at: string; who: string | null; entity: string; action: string; ref: string | null }[]
  counts: { sales: number; purchases: number; returns: number; transfers: number; payments: number }
  show_cost: boolean
}

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const rs = (v: M | number | null | undefined) => (v == null ? '—' : withCur(n(v)))

function Card({ title, help, to, children, testid }: { title: string; help?: string; to?: string; children: ReactNode; testid?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <section className="card flex flex-col gap-2" data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1"><BiLabel text={title} size="md" bold />{help ? <Help term={help} size="sm" /> : null}</span>
        {to ? <Link to={to} className={`tap inline-flex min-h-9 items-center gap-0.5 rounded-xl px-2 font-bold text-emerald-deep ${ur ? cls('sm') : 'text-xs'}`}>{pick('ov.details')}<ChevronRight size={14} className="rtl:rotate-180" /></Link> : null}
      </div>
      {children}
    </section>
  )
}

function Fig({ k, v, tone = '', sub }: { k: string; v: ReactNode; tone?: string; sub?: ReactNode }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-ground px-3 py-2">
      <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
      <span className={`num truncate text-lg font-extrabold leading-tight ${tone}`} dir="ltr">{v}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-[11px]'}`}>{sub}</span> : null}
    </div>
  )
}

function People({ rows, empty, tone }: { rows: Who[]; empty: string; tone: string }) {
  const { pick } = useLang()
  if (!rows.length) return <BiLabel text={empty} size="sm" tone="text-muted" />
  return (
    <div className="divide-y divide-line">
      {rows.map((r) => {
        const body = (
          <>
            <span className="flex min-w-0 flex-col"><span className="truncate font-bold">{r.name ?? pick('ov.walkIn')}</span>{r.phone ? <span className="text-xs text-muted" dir="ltr">{r.phone}</span> : r.count ? <span className="text-xs text-muted">{r.count} × {pick('ov.payments')}</span> : null}</span>
            <span className={`num shrink-0 font-bold ${tone}`} dir="ltr">{rs(r.amount)}</span>
          </>
        )
        return r.party_id ? (
          <Link key={r.party_id} to={`/parties/${r.party_id}`} className="tap flex items-center justify-between gap-2 py-2">{body}</Link>
        ) : (
          <div key="walk-in" className="flex items-center justify-between gap-2 py-2">{body}</div>
        )
      })}
    </div>
  )
}

export default function OverviewPage() {
  const { pick, ur, cls } = useLang()
  const [period, setPeriod] = useState<Period>(() => periodOf('today'))
  const { data: o, isLoading } = useGet<Overview>(['overview', period.from, period.to], `/api/v1/reports/overview?${periodQuery(period)}`)
  const small = ur ? cls('sm') : 'text-xs'
  const hisaab = `/hisaab?from=${period.from}&to=${period.to}`
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="ov.title" help={<Help term="ov.page" />} />
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      {isLoading || !o ? <Loading /> : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="ov.sales" help="ov.sales" to="/sales" testid="ov-sales">
              <div className="grid grid-cols-2 gap-2">
                <Fig k="ov.total" v={rs(o.sales.total)} sub={`${o.sales.count} ${pick('ov.bills')} · ${o.sales.phones} ${pick('ov.phones')}`} />
                {o.show_cost ? <Fig k="ov.profit" v={rs(o.sales.profit)} tone={Number(o.sales.profit ?? 0) < 0 ? 'text-payable' : 'text-emerald-deep'} /> : <Fig k="ov.phonesSold" v={o.sales.phones} />}
                <Fig k="ov.paidNow" v={rs(o.sales.paid)} tone="text-emerald-deep" />
                <Fig k="ov.onCredit" v={rs(o.sales.credit)} tone="text-receivable" />
              </div>
            </Card>
            <Card title="ov.purchases" help="ov.purchases" to="/purchases" testid="ov-purchases">
              <div className="grid grid-cols-2 gap-2">
                <Fig k="ov.total" v={rs(o.purchases.total)} sub={`${o.purchases.count} ${pick('ov.bills')} · ${o.purchases.phones} ${pick('ov.phones')}`} />
                <Fig k="ov.phonesBought" v={o.purchases.phones} />
                <Fig k="ov.paidNow" v={rs(o.purchases.paid)} tone="text-emerald-deep" />
                <Fig k="ov.onCredit" v={rs(o.purchases.credit)} tone="text-payable" />
              </div>
            </Card>
            <Card title="ov.money" help="ov.money" to="/payments" testid="ov-money">
              <div className="grid grid-cols-2 gap-2">
                <Fig k="ov.received" v={rs(o.payments.in.total)} tone="text-emerald-deep" sub={`${o.payments.in.people_count} ${pick('ov.people')}`} />
                <Fig k="ov.paidOut" v={rs(o.payments.out.total)} tone="text-payable" sub={`${o.payments.out.people_count} ${pick('ov.people')}`} />
                <Fig k="ov.udhaarGiven" v={rs(o.udhaar_given)} />
                <Fig k="ov.udhaarCollected" v={rs(o.udhaar_collected)} />
                <Fig k="ov.expenses" v={rs(o.expenses)} tone="text-payable" />
                <Fig k="ov.returns" v={rs(Number(o.returns.sale.amount) + Number(o.returns.purchase.amount))} sub={`${o.returns.sale.count + o.returns.purchase.count} ${pick('ov.returnsN')}`} />
              </div>
            </Card>
            <Card title="ov.month" help="ov.month" to={`/hisaab?from=${o.month.from}&to=${period.to}`} testid="ov-month">
              <div className="grid grid-cols-2 gap-2">
                <Fig k="ov.salesMonth" v={rs(o.month.sales)} />
                <Fig k="ov.expensesMonth" v={rs(o.month.expenses)} tone="text-payable" />
                {o.show_cost ? <Fig k="ov.profitMonth" v={rs(o.month.profit)} tone={Number(o.month.profit ?? 0) < 0 ? 'text-payable' : 'text-emerald-deep'} /> : null}
              </div>
            </Card>
            <Card title="ov.customersDealers" help="ov.people" to="/parties" testid="ov-people">
              <div className="grid grid-cols-2 gap-2">
                <Fig k="ov.customers" v={o.people.customers} sub={`+${o.people.new_customers} ${pick('ov.new')}`} />
                <Fig k="ov.dealers" v={o.people.dealers} sub={`+${o.people.new_dealers} ${pick('ov.new')}`} />
                <Fig k="ov.customerDue" v={rs(o.dues.to_get)} tone="text-receivable" sub={`${o.dues.to_get_count} ${pick('ov.people')}`} />
                <Fig k="ov.weOwe" v={rs(o.dues.to_give)} tone="text-payable" sub={`${o.dues.to_give_count} ${pick('ov.people')}`} />
              </div>
            </Card>
            <Card title="ov.alerts" help="ov.alerts" to="/stock" testid="ov-alerts">
              <div className="grid grid-cols-3 gap-2">
                <Fig k="ov.onHand" v={o.alerts.on_hand} />
                <Fig k="ov.available" v={o.alerts.available} />
                <Fig k="ov.faulty" v={o.alerts.faulty} tone={o.alerts.faulty ? 'text-payable' : ''} />
                <Fig k="ov.idPending" v={o.alerts.inspection} tone={o.alerts.inspection ? 'text-gold-text' : ''} />
                <Fig k="ov.inRepair" v={o.alerts.in_repair} />
                <Fig k="ov.old60" v={o.alerts.old_60d} tone={o.alerts.old_60d ? 'text-gold-text' : ''} />
                <Fig k="ov.reserved" v={o.alerts.reserved} />
                <Fig k="ov.itemsLow" v={o.alerts.items_low} tone={o.alerts.items_low ? 'text-gold-text' : ''} />
                <Fig k="ov.itemsOut" v={o.alerts.items_out} tone={o.alerts.items_out ? 'text-payable' : ''} />
              </div>
            </Card>
            <Card title="ov.remindGet" help="ov.remind" to="/khata?f=get" testid="ov-get">
              <People rows={o.dues.to_get_list} empty="ov.nobody" tone="text-receivable" />
            </Card>
            <Card title="ov.remindGive" help="ov.remind" to="/khata?f=give" testid="ov-give">
              <People rows={o.dues.to_give_list} empty="ov.nobody" tone="text-payable" />
            </Card>
            <Card title="ov.receivedFrom" help="ov.whom" to="/payments" testid="ov-from">
              <People rows={o.payments.in.people} empty="ov.nothing" tone="text-emerald-deep" />
            </Card>
            <Card title="ov.paidTo" help="ov.whom" to="/payments" testid="ov-to">
              <People rows={o.payments.out.people} empty="ov.nothing" tone="text-payable" />
            </Card>
            <Card title="ov.topSold" help="ov.top" to="/audit/products" testid="ov-top-sold">
              {o.top_sold.length ? (
                <div className="divide-y divide-line">
                  {o.top_sold.map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate font-bold">{r.name} <span className="font-medium text-muted" dir="ltr">× {r.qty}</span></span>
                      <span className="flex shrink-0 flex-col items-end"><span className="num font-bold" dir="ltr">{rs(r.amount)}</span>{r.profit != null ? <span className={`num ${small} ${Number(r.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{pick('ov.profit')} {n(r.profit)}</span> : null}</span>
                    </div>
                  ))}
                </div>
              ) : <BiLabel text="ov.nothing" size="sm" tone="text-muted" />}
            </Card>
            <Card title="ov.topBought" help="ov.top" to="/purchases" testid="ov-top-bought">
              {o.purchases.top.length ? (
                <div className="divide-y divide-line">
                  {o.purchases.top.map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate font-bold">{r.name} <span className="font-medium text-muted" dir="ltr">× {r.qty}</span></span>
                      <span className="num shrink-0 font-bold" dir="ltr">{rs(r.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : <BiLabel text="ov.nothing" size="sm" tone="text-muted" />}
            </Card>
            <Card title="ov.recent" help="ov.recent" to="/more/staff?tab=activity" testid="ov-recent">
              {o.recent.length ? (
                <div className="divide-y divide-line">
                  {o.recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate text-sm"><b>{r.who ?? '—'}</b> · {pick(`ov.entity.${r.entity}`) === `ov.entity.${r.entity}` ? r.entity.replace(/_/g, ' ') : pick(`ov.entity.${r.entity}`)} · {r.action.replace(/_/g, ' ')}{r.ref ? <span dir="ltr"> · {r.ref}</span> : null}</span>
                      <span className={`num shrink-0 text-muted ${small}`} dir="ltr">{fmtDateTime(r.at)}</span>
                    </div>
                  ))}
                </div>
              ) : <BiLabel text="ov.nothing" size="sm" tone="text-muted" />}
            </Card>
            <Card title="ov.modules" help="ov.modules" testid="ov-modules">
              <div className="grid grid-cols-3 gap-2">
                {([['ov.sales', o.counts.sales, '/sales'], ['ov.purchases', o.counts.purchases, '/purchases'], ['ov.returnsN', o.counts.returns, '/returns'], ['ov.transfers', o.counts.transfers, '/transfers'], ['ov.payments', o.counts.payments, '/payments'], ['ov.customers', o.people.customers, '/parties'], ['ov.dealers', o.people.dealers, '/parties']] as [string, number, string][]).map(([k, v, to]) => (
                  <Link key={k} to={to} className="tap flex flex-col rounded-xl bg-ground px-3 py-2">
                    <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
                    <span className="num text-lg font-extrabold" dir="ltr">{n(v)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
          <Link to={hisaab} className={`tap self-start rounded-xl border border-line px-3 py-2 font-bold ${small}`}>{pick('ov.fullHisaab')}</Link>
        </>
      )}
    </div>
  )
}
