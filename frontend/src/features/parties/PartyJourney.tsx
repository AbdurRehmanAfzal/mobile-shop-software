/** The person's whole journey on their page (docs/16 §5, docs/17 P5): first and last dealing,
 *  phones sold to / bought from them, money both ways, returns, the balance — and, with an
 *  "as of" day, the same picture on that day. Owner and manager only. */

import { CalendarRange, Route } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import {isoDay, withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { Link } from 'react-router-dom'
import DownloadButton from '@/components/DownloadButton'

type M = string
interface Journey {
  party: { id: string; name: string }
  as_of: string
  first_transaction: string | null
  last_transaction: string | null
  sold: { bills: number; phones: number; value: M; profit: M | null }
  bought: { bills: number; phones: number; value: M | null; sourced_sold: number; sourced_profit: M | null }
  money: { received_at_counter: M; received_later: M; received_total: M; paid_at_counter: M | null; paid_later: M | null; paid_total: M | null; refunded_to_them: M; refunded_by_them: M | null; payments: number }
  returns: { sale: { count: number; amount: M }; purchase: { count: number; amount: M } }
  balance_as_of: M
  receivable_open: M
  payable_open: M | null
  timeline: { date: string; kind: string; no: string; id: string; ref_id?: string; amount: M; paid?: M; status?: string; devices: { label: string; imei1: string }[] }[]
}

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function PartyJourney({ partyId }: { partyId: string }) {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const [asOf, setAsOf] = useState<string | null>(null)
  const { data } = useGet<Journey>(['party-journey', partyId, asOf], canCost ? `/api/v1/shop-audit/parties/${partyId}/journey${asOf ? `?as_of=${asOf}` : ''}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!canCost || !data) return null
  const bal = Number(data.balance_as_of)
  const tile = ({ k, v, sub, help }: { k: string; v: string; sub?: string; help: string }) => (
    <div className="rounded-2xl bg-ground px-3 py-2"><span className="flex items-center gap-1"><BiLabel text={k} size="sm" tone="text-muted" /><Help term={help} size="sm" /></span><div className="num text-lg font-bold" dir="ltr">{v}</div>{sub ? <div className={`text-muted ${small}`}>{sub}</div> : null}</div>
  )
  return (
    <section className="card flex flex-col gap-3" data-testid="party-journey">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Route size={18} /><BiLabel text="audit.journey.title" size="md" bold /><Help term="party.journey" size="sm" /></div>
        <span className="flex min-w-0 flex-wrap items-center gap-2"><DownloadButton path={`/api/v1/exports/parties/${partyId}/journey${asOf ? `?as_of=${asOf}` : ''}`} name={`journey-${partyId.slice(0, 8)}`} /><label className={`inline-flex items-center gap-1.5 text-muted ${small}`}><CalendarRange size={14} />{pick('audit.asOf')}<input type="date" aria-label="journey as of" value={asOf ?? isoDay(0)} max={isoDay(0)} onChange={(e) => setAsOf(e.target.value || null)} className="h-8 rounded-xl border border-line bg-surface px-2 text-xs font-bold text-ink" dir="ltr" /></label><Help term="common.asOf" size="sm" /></span>
      </div>
      <div className={`flex flex-wrap items-center gap-x-3 text-muted ${small}`}>
        {data.first_transaction ? <span>{pick('audit.journey.first')} <span dir="ltr">{fmtDate(data.first_transaction)}</span></span> : <span>{pick('audit.journey.none')}</span>}
        {data.last_transaction ? <span>{pick('audit.journey.last')} <span dir="ltr">{fmtDate(data.last_transaction)}</span></span> : null}
        <Help term="party.j.firstLast" size="sm" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile({ k: 'audit.journey.soldTo', v: `${data.sold.phones}`, sub: `${data.sold.bills} ${pick('audit.bills')} · ${withCur(n(data.sold.value))}`, help: 'party.j.soldTo' })}
        {tile({ k: 'audit.journey.boughtFrom', v: `${data.bought.phones}`, sub: `${data.bought.bills} ${pick('audit.bills')}${data.bought.value != null ? ` · ${withCur(n(data.bought.value))}` : ''}`, help: 'party.j.boughtFrom' })}
        {tile({ k: 'audit.journey.received', v: `${withCur(n(data.money.received_total))}`, sub: `${pick('audit.journey.atCounter')} ${n(data.money.received_at_counter)} · ${pick('audit.journey.later')} ${n(data.money.received_later)}`, help: 'party.j.received' })}
        {tile({ k: 'audit.journey.paid', v: `${withCur(n(data.money.paid_total))}`, sub: data.money.paid_at_counter != null ? `${pick('audit.journey.atCounter')} ${n(data.money.paid_at_counter)} · ${pick('audit.journey.later')} ${n(data.money.paid_later)}` : undefined, help: 'party.j.paid' })}
        {tile({ k: 'audit.journey.profitOnSales', v: `${withCur(n(data.sold.profit))}`, help: 'party.j.profitOnSales' })}
        {data.bought.phones ? tile({ k: 'audit.journey.profitOnSourced', v: `${withCur(n(data.bought.sourced_profit))}`, sub: `${data.bought.sourced_sold} ${pick('audit.journey.sourcedSold')}`, help: 'party.j.profitOnSourced' }) : null}
        {tile({ k: 'audit.journey.returns', v: `${data.returns.sale.count + data.returns.purchase.count}`, sub: `${withCur(n(Number(data.returns.sale.amount) + Number(data.returns.purchase.amount)))} · ${pick('audit.journey.refunded')} ${n(data.money.refunded_to_them)}`, help: 'party.j.returns' })}
        {tile({ k: asOf ? 'audit.journey.balanceAsOf' : 'audit.journey.balance', v: `${withCur(n(Math.abs(bal)))}`, sub: bal > 0 ? pick('audit.udhaar.theyOwe') : bal < 0 ? pick('audit.udhaar.weOweShort') : pick('audit.journey.settled'), help: 'party.j.balance' })}
      </div>
      {data.timeline.length ? (
        <details>
          <summary className={`cursor-pointer font-bold ${ur ? cls('sm') : 'text-sm'}`}>{pick('audit.journey.timeline')} ({data.timeline.length}) <Help term="party.j.timeline" size="sm" /></summary>
          <div className="mt-2 divide-y divide-line" data-testid="journey-timeline">
            {data.timeline.map((t, i) => (
              <Link key={i} to={t.kind === 'sale' ? `/sales/${t.id}` : t.kind === 'purchase' ? `/purchases/${t.id}` : t.kind === 'sale_return' ? `/sales/${t.ref_id ?? ''}` : t.kind === 'purchase_return' ? `/purchases/${t.ref_id ?? ''}` : '/payments'} className="tap flex items-center gap-3 py-1.5" data-testid="journey-link">
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-semibold">{pick(`audit.journey.k.${t.kind}`)} <span className="font-medium text-muted" dir="ltr">· {t.no}</span></span><span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(t.date)}</span>{t.devices.length ? ` · ${t.devices.map((d) => d.label).join(', ')}` : ''}</span></span>
                <span className="num font-bold" dir="ltr">{n(t.amount)}</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
