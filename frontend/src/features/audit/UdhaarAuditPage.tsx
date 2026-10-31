/** Shop Audit → Udhaar (docs/16 §13, docs/17 P5-4): receivables and payables kept apart, the
 *  period's movement, the age of every debt (no due dates exist: nothing is called overdue),
 *  the people and the phones behind the money. */

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import { Empty, Loading, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
interface Bal { opening: M; closing: M; as_of: M; current: M; parties: number }
interface Band { band: string; amount: M; parties: number }
interface Row { party_id: string; name: string | null; phone: string | null; amount: M; oldest_bill: string | null; age_days: number | null; band: string; last_payment: string | null }
interface Phone { side: 'receivable' | 'payable'; party_id: string; party_name: string | null; device_id: string; label: string; imei1: string; doc_type: string; doc_id: string; no: string; date: string; agreed: M | null; doc_remaining: M | null; age_days: number }
interface Udhaar { receivable: Bal; payable: Bal; received_in_period: M; paid_in_period: M; movement: Record<string, M | null>; bands: string[]; receivable_bands: Band[]; payable_bands: Band[]; receivable_rows: Row[]; payable_rows: Row[]; phones: Phone[]; notes: string[] }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function UdhaarAuditPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const { data, isLoading } = useGet<Udhaar>(['audit-udhaar', query], `/api/v1/shop-audit/udhaar?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const asOf = !!period.asOf
  const main = (b: Bal) => (asOf ? b.as_of : b.closing)
  const bandLabel = (b: string) => (b === 'no_bill' ? pick('audit.udhaar.noBill') : `${b} ${pick('audit.days')}`)
  return (
    <AuditLayout>
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="grid gap-2 sm:grid-cols-2">
            <Link to="/khata?f=get" className="tap flex flex-col gap-1 rounded-3xl bg-receivable-tint px-5 py-4 text-receivable" data-testid="udhaar-receivable">
              <div className="flex items-center gap-2"><ArrowDownLeft size={18} /><BiLabel text="audit.receivable" size="md" bold tone="text-current" /></div>
              <span className="num text-[30px] leading-tight" dir="ltr">Rs. {n(main(data.receivable))}</span>
              <span className={`opacity-80 ${small}`}>{pick('audit.opening')} <span className="num" dir="ltr">{n(data.receivable.opening)}</span> · {pick('audit.now')} <span className="num" dir="ltr">{n(data.receivable.current)}</span> · <span className="num">{data.receivable.parties}</span> {pick('audit.people')}</span>
            </Link>
            {canCost ? (
              <Link to="/khata?f=give" className="tap flex flex-col gap-1 rounded-3xl bg-payable-tint px-5 py-4 text-payable" data-testid="udhaar-payable">
                <div className="flex items-center gap-2"><ArrowUpRight size={18} /><BiLabel text="audit.payable" size="md" bold tone="text-current" /></div>
                <span className="num text-[30px] leading-tight" dir="ltr">Rs. {n(main(data.payable))}</span>
                <span className={`opacity-80 ${small}`}>{pick('audit.opening')} <span className="num" dir="ltr">{n(data.payable.opening)}</span> · {pick('audit.now')} <span className="num" dir="ltr">{n(data.payable.current)}</span> · <span className="num">{data.payable.parties}</span> {pick('audit.people')}</span>
              </Link>
            ) : null}
          </section>

          <BiLabel text="audit.udhaar.movement" size="md" bold />
          <div className="card grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4" data-testid="udhaar-movement">
            {(['udhaar_given', 'received', 'sale_returns', 'udhaar_taken', 'paid', 'purchase_returns', 'repairs', 'other'] as const).map((k) => data.movement[k] == null ? null : (
              <div key={k} className="flex items-center justify-between gap-2"><span className={`text-muted ${small}`}>{pick(`audit.udhaar.m.${k}`)}</span><span className="num font-bold" dir="ltr">{n(data.movement[k])}</span></div>
            ))}
          </div>

          <BiLabel text="audit.udhaar.age" size="md" bold />
          <BiLabel text="audit.udhaar.ageHint" size="sm" tone="text-muted" />
          <section className="grid gap-2 sm:grid-cols-2">
            <div className="card" data-testid="age-receivable">
              <BiLabel text="audit.receivable" size="sm" tone="text-muted" bold />
              <Bars data={data.receivable_bands.map((b) => ({ label: bandLabel(b.band), value: Number(b.amount), hint: `${b.parties} ${pick('audit.people')}`, key: b.band }))} tone="rgb(var(--receivable))" empty="audit.noData" />
            </div>
            {canCost ? (
              <div className="card" data-testid="age-payable">
                <BiLabel text="audit.payable" size="sm" tone="text-muted" bold />
                <Bars data={data.payable_bands.map((b) => ({ label: bandLabel(b.band), value: Number(b.amount), hint: `${b.parties} ${pick('audit.people')}`, key: b.band }))} tone="rgb(var(--payable))" empty="audit.noData" />
              </div>
            ) : null}
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <People title="audit.udhaar.owesUs" rows={data.receivable_rows} testid="rows-receivable" />
            {canCost ? <People title="audit.udhaar.weOwe" rows={data.payable_rows} testid="rows-payable" /> : null}
          </section>

          <BiLabel text="audit.udhaar.phones" size="md" bold />
          {!data.phones.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="udhaar-phones">
              {data.phones.map((p, i) => (
                <Link key={i} to={`/stock/${p.device_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{p.label} <span className="font-medium text-muted" dir="ltr">· {p.imei1}</span></span>
                    <span className={`text-muted ${small}`}>{p.party_name ?? '—'} · <span dir="ltr">{p.no} · {fmtDate(p.date)}</span> · <span className="num">{p.age_days}</span> {pick('audit.days')}</span>
                  </span>
                  <span className="flex flex-col items-end"><span className={`num font-bold ${p.side === 'receivable' ? 'text-receivable' : 'text-payable'}`} dir="ltr">{n(p.doc_remaining)}</span><span className={`text-muted ${small}`}>{pick(p.side === 'receivable' ? 'audit.udhaar.theyOwe' : 'audit.udhaar.weOweShort')}</span></span>
                </Link>
              ))}
            </div>
          )}
          <BiLabel text="audit.udhaar.notes" size="sm" tone="text-muted" />
        </>
      )}
    </AuditLayout>
  )
}

function People({ title, rows, testid }: { title: string; rows: Row[]; testid: string }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="card flex flex-col gap-1 p-0" data-testid={testid}>
      <div className="px-4 pt-3"><BiLabel text={title} size="md" bold /></div>
      {!rows.length ? <div className={`px-4 pb-3 text-muted ${small}`}>—</div> : rows.map((r) => (
        <Link key={r.party_id} to={`/parties/${r.party_id}`} className="tap flex items-center gap-3 border-t border-line px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{r.name ?? '—'}</span>
            <span className={`text-muted ${small}`}>{r.age_days != null ? <><span className="num">{r.age_days}</span> {pick('audit.days')} · </> : <>{pick('audit.udhaar.noBill')} · </>}{r.last_payment ? <>{pick('audit.udhaar.lastPaid')} <span dir="ltr">{fmtDate(r.last_payment)}</span></> : pick('audit.udhaar.neverPaid')}</span>
          </span>
          <span className="num font-bold" dir="ltr">{n(r.amount)}</span>
        </Link>
      ))}
    </div>
  )
}
