/** A person's len-den (docs/32): money given to / taken from them with no bill. It is a part of the
 *  one khata above; the card shows how much of it is len-den, the two buttons to record more, the
 *  entries, and — when money already given / taken could pay their open bills — an adjust button. */

import { HandCoins } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText, fmtDate, Sheet } from '@/components/ui'
import PaymentForm from '@/features/payments/PaymentForm'
import { post } from '@/lib/api'
import { withCur } from '@/lib/format'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

type M = string
interface Side { amount: M; open_bills: M; free: M }
interface Entry { id: string; no: string; direction: 'in' | 'out'; amount: M; open: M; date: string; method: string; notes: string | null; status: string }
interface Lending { balance: M; lending: M; bills: M; lent: M; borrowed: M; settle: { in: Side; out: Side }; entries: Entry[] }

const n = (v: M | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function PartyLending({ party }: { party: Party }) {
  const { pick, ur, cls } = useLang()
  const { data } = useGet<Lending>(['party-lending', party.id], `/api/v1/payments/lending/${party.id}`)
  const [giving, setGiving] = useState<'in' | 'out' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const inv = useInvalidate()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!data) return null
  const open = Number(data.lending)
  const canSettle = Number(data.settle.in.amount) > 0 || Number(data.settle.out.amount) > 0

  async function settle() {
    setBusy(true)
    setErr(null)
    try {
      const r = await post<{ total: M }>(`/api/v1/payments/settle/${party.id}`, {})
      setDone(pick('lending.settled').replace('{{amount}}', withCur(n(r.total))))
      await inv()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3" data-testid="party-lending">
      <div className="flex items-center gap-2">
        <span className="well h-10 w-10 shrink-0 bg-ground text-ink"><HandCoins size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <BiLabel text="lending.title" size="md" bold />
          <BiLabel text={open > 0 ? 'lending.theyOwe' : open < 0 ? 'lending.weOwe' : 'lending.clear'} size="sm" tone="text-muted" />
        </span>
        <span className={`num text-xl font-bold ${open > 0 ? 'text-receivable' : open < 0 ? 'text-payable' : 'text-muted'}`} dir="ltr" data-testid="lending-open">{open === 0 ? '0' : withCur(n(Math.abs(open)))}</span>
      </div>
      <BiLabel text="lending.hint" size="sm" tone="text-muted" />
      {data.entries.length || Number(data.bills) !== 0 ? (
        <div className={`grid grid-cols-3 gap-2 rounded-2xl bg-ground px-3 py-2 ${small}`}>
          <span className="flex flex-col"><span className="text-muted">{pick('lending.lent')}</span><span className="num font-bold" dir="ltr">{n(data.lent)}</span></span>
          <span className="flex flex-col"><span className="text-muted">{pick('lending.borrowed')}</span><span className="num font-bold" dir="ltr">{n(data.borrowed)}</span></span>
          <span className="flex flex-col"><span className="text-muted">{pick('lending.fromBills')}</span><span className="num font-bold" dir="ltr">{n(data.bills)}</span></span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setGiving('out')} className="tap flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface px-2 text-ink" data-testid="lending-give">
          <BiLabel text="lending.give" size="sm" bold tone="text-current" align="center" />
        </button>
        <button type="button" onClick={() => setGiving('in')} className="tap flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface px-2 text-ink" data-testid="lending-take">
          <BiLabel text="lending.take" size="sm" bold tone="text-current" align="center" />
        </button>
      </div>
      {canSettle ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-khata px-4 py-3 text-khata-fg" data-testid="lending-settle">
          <BiLabel text="lending.settleTitle" size="md" bold tone="text-current" />
          {(['in', 'out'] as const).map((d) => Number(data.settle[d].amount) > 0 ? (
            <span key={d} className={small}>{pick(d === 'in' ? 'lending.settleIn' : 'lending.settleOut').replace('{{amount}}', withCur(n(data.settle[d].amount)))}</span>
          ) : null)}
          <BiButton text="lending.settle" variant="secondary" loading={busy} onClick={settle} />
        </div>
      ) : null}
      {done ? <span className={`font-bold text-emerald-deep ${small}`} data-testid="lending-settled">{done}</span> : null}
      <ErrorText error={err} />
      {data.entries.length ? (
        <div className="flex flex-col divide-y divide-line" data-testid="lending-entries">
          {data.entries.slice(0, 8).map((e) => (
            <div key={e.id} className={`flex items-center gap-3 py-2 ${e.status === 'voided' ? 'opacity-50 line-through' : ''}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{pick(e.direction === 'out' ? 'lending.give' : 'lending.take')}{e.status === 'voided' ? ` · ${pick('lending.cancelled')}` : ''}</span>
                <span className={`text-muted ${small}`}><span dir="ltr">{e.no} · {fmtDate(e.date)}</span>{e.notes ? ` · ${e.notes}` : ''}</span>
              </span>
              <span className={`num font-bold ${e.direction === 'out' ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{e.direction === 'out' ? '-' : '+'}{n(e.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Sheet open={giving !== null} onClose={() => setGiving(null)} title={giving === 'in' ? 'lending.take' : 'lending.give'}>
        {giving ? <PaymentForm party={party} direction={giving} lending onDone={() => setGiving(null)} /> : null}
      </Sheet>
    </section>
  )
}
