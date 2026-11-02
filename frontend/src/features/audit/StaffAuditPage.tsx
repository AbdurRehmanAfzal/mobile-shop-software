/** Shop Audit → Staff (docs/31 R4): one card per employee for the period — sales with discount,
 *  profit, credit and returns, purchases, payments, expenses — and, for the owner, the security
 *  counts with their flags. Each card opens that person's sales or their activity log. */

import { AlertTriangle, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Pending } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import SectionDownload from './SectionDownload'
import { useAuditPeriod } from './period'

type M = string
interface Row {
  user_id: string | null
  user_name: string | null
  sales: { bills: number; units: number; billed: M; discount: M; on_credit: M; due: M; profit: M | null; margin_pct: number | null; returns: number; returns_amount: M } | null
  purchases: { bills: number; phones: number; items: number; total: M; owed: M } | null
  expenses: { count: number; amount: M } | null
  payments: { in_count: number; in_amount: M; out_count: number; out_amount: M } | null
  security: { kinds: Record<string, number>; total: number; flags: string[] } | null
}
interface Staff { rows: Row[]; totals: { people: number; sales_billed: M; sales_profit: M | null; discount: M; purchases_total: M | null; expenses: M }; flag_at: Record<string, number> | null; security_shown: boolean }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function StaffAuditPage() {
  const { pick, ur, cls } = useLang()
  const { query } = useAuditPeriod()
  const { data, error, refetch } = useGet<Staff>(['audit-staff', query], `/api/v1/shop-audit/staff?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const stat = (k: string, v: ReactNode) => <span className="flex flex-col"><span className={`text-muted ${small}`}>{pick(k)}</span><span className="num font-bold" dir="ltr">{v}</span></span>
  return (
    <AuditLayout right={<SectionDownload sections={['staff']} name="staff-report" />}>
      {!data ? <Pending error={error} retry={refetch} /> : (
        <>
          <section className="flex items-center justify-between rounded-3xl bg-ink px-5 py-4 text-ground" data-testid="staff-total">
            <span className="flex flex-col"><BiLabel text="audit.staff.title" size="md" bold tone="text-current" /><span className={`opacity-80 ${small}`}><span className="num">{data.totals.people}</span> {pick('audit.people')} · {pick('counter.discounts')} <span className="num" dir="ltr">{n(data.totals.discount)}</span></span></span>
            <span className="num text-2xl font-bold" dir="ltr">{withCur(n(data.totals.sales_billed))}</span>
          </section>
          <BiLabel text={data.security_shown ? 'audit.staff.hintOwner' : 'audit.staff.hint'} size="sm" tone="text-muted" />
          {!data.rows.length ? <Empty text="audit.noData" /> : (
            <div className="grid gap-2 lg:grid-cols-2" data-testid="staff-rows">
              {data.rows.map((r, i) => (
                <section key={i} className="card flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ground"><UserRound size={18} /></span>
                    <span className="min-w-0 flex-1 truncate font-bold">{r.user_name ?? '—'}</span>
                    {r.security?.flags.length ? <span className="inline-flex items-center gap-1 rounded-full bg-payable-tint px-2.5 py-1 text-payable" data-testid="staff-flag"><AlertTriangle size={14} /><span className={small}>{r.security.flags.map((f) => pick(`audit.sec.k.${f}`)).join(' · ')}</span></span> : null}
                  </div>
                  {r.sales ? (
                    <Link to={`/audit/sales?${new URLSearchParams(window.location.search).toString()}&user=${r.user_id ?? ''}`} className="tap grid grid-cols-3 gap-2 rounded-2xl bg-ground px-3 py-2">
                      {stat('audit.staff.sold', `${withCur(n(r.sales.billed))}`)}
                      {stat('audit.bills', r.sales.bills)}
                      {stat('counter.discounts', n(r.sales.discount))}
                      {r.sales.profit != null ? stat('counter.grossProfit', n(r.sales.profit)) : null}
                      {stat('audit.trade.onCredit', n(r.sales.on_credit))}
                      {stat('audit.trade.returns', r.sales.returns)}
                    </Link>
                  ) : null}
                  <div className={`flex flex-wrap gap-x-4 gap-y-1 text-muted ${small}`}>
                    {r.purchases ? <span>{pick('audit.trade.purchases')} <span className="num">{r.purchases.bills}</span> · <span className="num" dir="ltr">{n(r.purchases.total)}</span></span> : null}
                    {r.payments ? <span>{pick('audit.staff.payments')} <span className="num" dir="ltr">{r.payments.in_count} / {r.payments.out_count}</span></span> : null}
                    {r.expenses ? <span>{pick('audit.expenses')} <span className="num">{r.expenses.count}</span> · <span className="num" dir="ltr">{n(r.expenses.amount)}</span></span> : null}
                  </div>
                  {r.security ? (
                    <Link to={`/audit/security?${new URLSearchParams(window.location.search).toString()}`} className={`tap flex flex-wrap gap-x-3 gap-y-1 ${small}`} data-testid="staff-security">
                      {Object.entries(r.security.kinds).map(([k, v]) => <span key={k} className={r.security?.flags.includes(k) ? 'text-payable' : 'text-muted'}>{pick(`audit.sec.k.${k}`)} <span className="num">{v}</span></span>)}
                    </Link>
                  ) : null}
                  <Link to="/more/staff?tab=activity" className={`tap self-start text-emerald-deep underline ${small}`}>{pick('audit.staff.log')}</Link>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </AuditLayout>
  )
}
