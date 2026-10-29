/** Installments / qist (owner 2026-10-29): who pays what and when. Today's and late installments
 *  first; a plan opens to its schedule, where an installment is collected (a normal payment on the
 *  bill) or a WhatsApp reminder sent. */

import { BellRing, Check, HandCoins, MessageCircle, Phone, Receipt, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, useLang } from '@/components/Bilingual'
import PayPicker, { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { Chip, Empty, ErrorText, KV, Loading, PageHeader, SearchBox, Section, Sheet, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

interface Row {
  id: string; invoice_id: string; invoice_no: string; party_id: string; party_name: string; party_phone: string | null; item: string
  total: string; advance: string; months: number; monthly: string; due_day: number; paid: string; remaining: string
  paid_count: number; overdue_count: number; overdue_amount: string; next_due: string | null; next_amount: string | null; days_late: number
  status: 'active' | 'closed' | 'void'; guarantor_name: string | null; guarantor_phone: string | null; guarantor_cnic: string | null; notes: string | null; last_reminded_at: string | null; created_at: string
}
interface Detail extends Row { schedule: { seq: number; due_date: string; amount: string; paid: string; status: 'paid' | 'partial' | 'today' | 'late' | 'due' }[]; payment_no?: string | null }
type View = 'today' | 'overdue' | 'active' | 'closed'
const VIEWS: View[] = ['today', 'overdue', 'active', 'closed']
const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export function InstallmentsPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('view') as View) ? params.get('view') : 'active') as View
  const [q, setQ] = useState('')
  const { data, isLoading } = useGet<Row[]>(['installments', view, q], `/api/v1/installments?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="inst.title" />
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setParams(v === 'active' ? {} : { view: v }, { replace: true })} className={`tap h-10 rounded-full border-2 px-3.5 font-bold ${view === v ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
            {pick(`inst.view.${v}`)}
          </button>
        ))}
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="inst.search" />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="inst.none" /> : (
        <div className="card divide-y divide-line p-0">
          {data.map((r) => (
            <button key={r.id} type="button" onClick={() => nav(`/installments/${r.id}`)} className="tap flex w-full items-center gap-3 px-4 py-3 text-start">
              <span className={`well h-11 w-11 shrink-0 rounded-2xl ${r.overdue_count ? 'bg-payable-tint text-payable' : 'bg-khata text-khata-icon'}`}><HandCoins size={20} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{r.party_name}{r.item ? <span className="font-medium text-muted"> · {r.item}</span> : null}</span>
                <span className={`text-muted ${small}`} dir="ltr">{r.invoice_no} · {r.paid_count}/{r.months} · {pick('inst.remaining')} {n(r.remaining)}</span>
                {r.status === 'active' && r.next_due ? (
                  <span className={`${small} ${r.days_late > 0 ? 'text-payable' : 'text-muted'}`}>
                    {r.days_late > 0 ? pick('inst.lateBy').replace('{{n}}', String(r.days_late)) : `${pick('inst.nextDue')} ${fmtDate(r.next_due)}`}
                  </span>
                ) : <Chip text={`inst.status.${r.status}`} tone={r.status === 'closed' ? 'ok' : 'bad'} />}
              </span>
              <span className="flex flex-col items-end">
                <span className="num text-lg" dir="ltr">{n(r.next_amount ?? r.monthly)}</span>
                {r.overdue_count > 1 ? <span className={`text-payable ${small}`}>{pick('inst.overdueN').replace('{{n}}', String(r.overdue_count))}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function InstallmentDetailPage() {
  const { id } = useParams()
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const { data: p, isLoading } = useGet<Detail>(['installment', id], id ? `/api/v1/installments/${id}` : null)
  const collect = useDocMutation<Record<string, unknown>, Detail>('POST', () => `/api/v1/installments/${id}/collect`)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [done, setDone] = useState<string | null>(null)
  const [remindMsg, setRemindMsg] = useState<string | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (isLoading || !p) return <Loading />
  const amt = amount === '' ? String(Number(p.next_amount ?? p.monthly)) : amount
  const tone = (s: string) => (s === 'paid' ? 'ok' : s === 'late' ? 'bad' : s === 'partial' || s === 'today' ? 'warn' : undefined)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="inst.title" />
      <div className={`flex flex-col gap-2 rounded-3xl p-4 ${p.overdue_count ? 'bg-payable-tint text-payable' : 'bg-hero text-hero-text shadow-hero'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-extrabold">{p.party_name}</span>
            <span className={`opacity-80 ${small}`}>{p.item} · <span dir="ltr">{p.invoice_no}</span></span>
          </span>
          <Chip text={`inst.status.${p.status}`} tone={p.status === 'active' ? 'warn' : p.status === 'closed' ? 'ok' : 'bad'} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['inst.total', p.total], ['inst.paidSoFar', p.paid], ['inst.remaining', p.remaining]].map(([k, v]) => (
            <div key={k} className="flex flex-col rounded-2xl bg-white/10 px-3 py-2">
              <span className={`opacity-80 ${small}`}>{pick(k)}</span>
              <span className="num text-lg" dir="ltr">{n(v)}</span>
            </div>
          ))}
        </div>
        <span className={small}>{pick('inst.planLine').replace('{{adv}}', n(p.advance)).replace('{{m}}', String(p.months)).replace('{{x}}', n(p.monthly)).replace('{{d}}', String(p.due_day))}</span>
      </div>

      {p.status === 'active' ? (
        <div className="grid grid-cols-2 gap-2">
          <BiButton text="inst.collect" icon={<HandCoins size={20} />} full onClick={() => { setAmount(''); setPay(newPay()); collect.reset(); setDone(null); setOpen(true) }} />
          <BiButton text="inst.remind" icon={<BellRing size={20} />} variant="secondary" full onClick={async () => { const m = await api<{ status: string; link: string | null }>('POST', `/api/v1/installments/${id}/remind`); if (m.status !== 'sent' && m.link) window.open(m.link, '_blank', 'noopener'); setRemindMsg(m.status === 'sent' ? 'inst.reminded' : 'inst.remindOpened'); inv('installment') }} />
        </div>
      ) : null}
      {remindMsg ? <BiAlert text={remindMsg} kind="success" /> : null}
      {done ? <BiAlert text={{ en: `${pick('inst.collected')} ${done}`, ur: `${pick('inst.collected')} ${done}`, roman: `${pick('inst.collected')} ${done}` }} kind="success" /> : null}

      <Section title="inst.schedule">
        <div className="card divide-y divide-line p-0">
          {p.schedule.map((s) => (
            <div key={s.seq} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`well h-9 w-9 shrink-0 rounded-xl ${s.status === 'paid' ? 'bg-emerald-tint text-emerald-deep' : s.status === 'late' ? 'bg-payable-tint text-payable' : 'bg-ground text-muted'}`}>{s.status === 'paid' ? <Check size={16} /> : <span className="num text-sm">{s.seq}</span>}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-bold" dir="ltr">{fmtDate(s.due_date)}</span>
                {s.status === 'partial' ? <span className={`text-muted ${small}`}>{pick('inst.partial').replace('{{n}}', n(s.paid))}</span> : null}
              </span>
              <span className="num" dir="ltr">{n(s.amount)}</span>
              <Chip text={`inst.st.${s.status}`} tone={tone(s.status)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="inst.people">
        <div className="card flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold">{p.party_name}</span><span className="text-xs text-muted" dir="ltr">{p.party_phone}</span></span>
            {p.party_phone ? <><a href={`tel:${p.party_phone}`} aria-label="call" className="tap flex h-10 w-10 items-center justify-center rounded-full border border-line"><Phone size={16} /></a><a href={`https://wa.me/92${p.party_phone.replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="tap flex h-10 w-10 items-center justify-center rounded-full bg-emerald text-white"><MessageCircle size={16} /></a></> : null}
          </div>
          {p.guarantor_name ? (
            <div className="flex items-center gap-3 border-t border-line pt-2">
              <span className="well h-9 w-9 shrink-0 bg-ground text-muted"><UserCheck size={16} /></span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold">{p.guarantor_name} <span className="font-medium text-muted">· {pick('inst.guarantor')}</span></span><span className="text-xs text-muted" dir="ltr">{[p.guarantor_phone, p.guarantor_cnic].filter(Boolean).join(' · ')}</span></span>
              {p.guarantor_phone ? <a href={`tel:${p.guarantor_phone}`} aria-label="call guarantor" className="tap flex h-10 w-10 items-center justify-center rounded-full border border-line"><Phone size={16} /></a> : null}
            </div>
          ) : null}
          {p.notes ? <span className="text-sm text-muted">{p.notes}</span> : null}
        </div>
        <BiButton text="inst.viewBill" icon={<Receipt size={18} />} variant="ghost" full onClick={() => nav(`/sales/${p.invoice_id}`)} />
      </Section>

      <Sheet open={open} onClose={() => setOpen(false)} title="inst.collect">
        <div className="flex flex-col gap-3">
          <KV k="inst.nextDue" v={<span dir="ltr">{p.next_due ? fmtDate(p.next_due) : '—'}</span>} />
          <BiInput label="inst.amount" type="number" inputMode="numeric" min={1} max={Number(p.remaining)} value={amt} onChange={(e) => setAmount(e.target.value)} className="num text-2xl" />
          <PayPicker value={pay} onChange={setPay} />
          <ErrorText error={collect.error} />
          <BiButton text="inst.collectNow" full loading={collect.isPending} disabled={!Number(amt) || Number(amt) > Number(p.remaining) || !payReady(pay)} onClick={async () => { const r = await collect.mutateAsync({ amount: Number(amt), payment: payInfo(pay) }); setDone(r.payment_no ?? ''); setOpen(false); inv('installment', 'installments', 'dashboard', 'parties') }} />
        </div>
      </Sheet>
    </div>
  )
}
