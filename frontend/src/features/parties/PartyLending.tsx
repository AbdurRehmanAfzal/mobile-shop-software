/** A person's len-den (docs/32): money given to / taken from them with no bill. It is a part of the
 *  one khata above; the card shows how much of it is len-den, the two buttons to record more, the
 *  entries, and — when money already given / taken could pay their open bills — an adjust button.
 *  Return dates (§7): when it is due back, a WhatsApp reminder, and changing the date. */

import { BellRing, CalendarClock, HandCoins } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText, fmtDate, Sheet } from '@/components/ui'
import PaymentForm from '@/features/payments/PaymentForm'
import { api, post } from '@/lib/api'
import { withCur } from '@/lib/format'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Message, Party } from '@/lib/types'

type M = string
interface Side { amount: M; open_bills: M; free: M }
interface Entry { id: string; no: string; direction: 'in' | 'out'; amount: M; open: M; date: string; method: string; notes: string | null; status: string; due_date: string | null }
interface Due { side: 'owes_us' | 'we_owe'; amount: M; due_date: string; days_late: number; status: 'late' | 'today' | 'soon' | 'later'; reminded_at: string | null }
interface Lending { balance: M; lending: M; bills: M; lent: M; borrowed: M; settle: { in: Side; out: Side }; due: Due | null; entries: Entry[] }

const n = (v: M | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function PartyLending({ party }: { party: Party }) {
  const { pick, ur, cls } = useLang()
  const { data } = useGet<Lending>(['party-lending', party.id], `/api/v1/payments/lending/${party.id}`)
  const [giving, setGiving] = useState<'in' | 'out' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const [dating, setDating] = useState<Entry | null>(null)
  const [newDate, setNewDate] = useState('')
  const inv = useInvalidate()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!data) return null
  const open = Number(data.lending)
  const canSettle = Number(data.settle.in.amount) > 0 || Number(data.settle.out.amount) > 0

  async function remind() {
    setBusy(true)
    setErr(null)
    try {
      const m = await post<Message>(`/api/v1/payments/lending/${party.id}/remind`, {})
      if (m.status !== 'sent' && m.link) {
        window.open(m.link, '_blank', 'noopener')
        await api('POST', `/api/v1/notifications/${m.id}/mark-sent`).catch(() => undefined)
        setDone(pick('lending.reminderOpened'))
      } else setDone(pick('lending.reminderSent'))
      await inv()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  async function saveDate() {
    if (!dating) return
    setBusy(true)
    setErr(null)
    try {
      await api('PATCH', `/api/v1/payments/${dating.id}/due-date`, { due_date: newDate || null })
      setDating(null)
      await inv()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const due = data.due
  const dueText = !due ? null : due.status === 'late' ? `${pick('lending.dueOn').replace('{{date}}', fmtDate(due.due_date))} · ${pick('lending.lateBy').replace('{{n}}', String(due.days_late))}` : due.status === 'today' ? pick('lending.dueToday') : pick(due.side === 'we_owe' ? 'lending.weGiveBy' : 'lending.dueOn').replace('{{date}}', fmtDate(due.due_date))

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
      {due ? (
        <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${due.status === 'late' ? 'bg-payable-tint text-payable' : due.status === 'later' ? 'bg-ground text-ink' : 'bg-receivable-tint text-receivable'}`} data-testid="lending-due">
          <CalendarClock size={16} className="shrink-0" />
          <span className={`flex-1 font-bold ${small}`}>{dueText}</span>
          {due.reminded_at ? <span className={`opacity-80 ${small}`}>{pick('lending.lastReminded').replace('{{date}}', fmtDate(due.reminded_at))}</span> : null}
        </div>
      ) : null}
      {open > 0 && party.phone ? (
        <BiButton text="lending.remind" icon={<BellRing size={18} />} variant="secondary" loading={busy} onClick={remind} />
      ) : null}
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
                {e.status === 'posted' && Number(e.open) > 0 ? (
                  <button type="button" onClick={() => { setDating(e); setNewDate(e.due_date ?? '') }} className={`relative z-10 mt-1 flex min-h-8 items-center gap-1 self-start text-emerald-deep underline ${small}`} data-testid="lending-date">
                    <CalendarClock size={13} />{e.due_date ? pick('lending.dueOn').replace('{{date}}', fmtDate(e.due_date)) : pick('lending.changeDate')}
                  </button>
                ) : null}
              </span>
              <span className={`num font-bold ${e.direction === 'out' ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{e.direction === 'out' ? '-' : '+'}{n(e.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Sheet open={dating !== null} onClose={() => setDating(null)} title="lending.changeDate">
        <div className="flex flex-col gap-3">
          <BiInput label="lending.dueDate" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} dir="ltr" />
          <ErrorText error={err} />
          <BiButton text="lending.saveDate" full loading={busy} onClick={saveDate} />
        </div>
      </Sheet>
      <Sheet open={giving !== null} onClose={() => setGiving(null)} title={giving === 'in' ? 'lending.take' : 'lending.give'}>
        {giving ? <PaymentForm party={party} direction={giving} lending onDone={() => setGiving(null)} /> : null}
      </Sheet>
    </section>
  )
}
