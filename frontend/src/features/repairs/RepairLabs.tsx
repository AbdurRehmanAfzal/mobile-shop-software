/** Repair labs (owner 2026-11-03, docs/34): a repair job sent to an outside repair lab / technician in
 *  the market — one trip at a time, back fixed or not with the lab's charge (to its khata, part paid
 *  on the spot) — and the complete record of every lab. */

import { AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, Phone, Plus, Undo2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { Empty, ErrorText, fmtDate, Loading, PageHeader, Section, Sheet } from '@/components/ui'
import PartyForm from '@/features/parties/PartyForm'
import { isoDay, withCur } from '@/lib/format'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

type M = string
export interface Trip {
  id: string; job_id: string; job_no: string | null; device_desc: string | null; customer_name: string | null
  lab_party_id: string; lab_name: string | null; lab_phone: string | null; status: 'at_lab' | 'back' | 'cancelled'
  problem: string | null; quoted_cost: M; sent_on: string; expected_back: string | null; sent_by_name: string | null
  back_on: string | null; received_by_name: string | null; outcome: 'fixed' | 'not_fixed' | null; final_cost: M; paid_now: M
  days: number; late: boolean; notes: string | null; back_note: string | null
}
interface Lab { party_id: string; name: string; phone: string | null; address: string | null; notes: string | null; balance: M; sent: number; at_lab: number; late: number; fixed: number; not_fixed: number; fix_rate: number | null; avg_days: number | null; cost: M; paid_now: M; last_sent: string | null }
interface LabDetail extends Lab { is_lab: boolean; trips: Trip[] }

const n = (v: M | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })

/** on the repair job: the trip open now, sending, coming back, cancelling, and every trip so far */
export function JobLabs({ jobId, open, trips, atLab }: { jobId: string; open: boolean; trips: Trip[]; atLab: Trip | null }) {
  const { pick, ur, cls } = useLang()
  const [sheet, setSheet] = useState<null | 'send' | 'back' | 'cancel'>(null)
  const [lab, setLab] = useState<Party | null>(null)
  const [f, setF] = useState({ problem: '', quoted: '', expected: isoDay(2), notes: '' })
  const [b, setB] = useState({ outcome: 'fixed', cost: '', paid: '', note: '' })
  const [reason, setReason] = useState('')
  const send = useDocMutation<Record<string, unknown>, Trip>('POST', () => `/api/v1/repairs/${jobId}/lab`)
  const back = useDocMutation<Record<string, unknown>, Trip>('POST', () => `/api/v1/repairs/${jobId}/lab/${atLab?.id}/back`)
  const cancel = useDocMutation<Record<string, unknown>, Trip>('POST', () => `/api/v1/repairs/${jobId}/lab/${atLab?.id}/cancel`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const past = trips.filter((t) => t.status !== 'at_lab')
  return (
    <>
      {atLab ? (
        <section className={`flex flex-col gap-2 rounded-3xl border p-4 ${atLab.late ? 'border-payable/40 bg-payable-tint' : 'border-line bg-surface'}`} data-testid="at-lab">
          <div className="flex items-center gap-2">
            <span className="well h-10 w-10 shrink-0 bg-repair text-repair-fg"><FlaskConical size={20} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1"><BiLabel text="rlab.atLab" size="sm" tone="text-muted" /><Help term="rlab.atLab" size="sm" /></span>
              <Link to={`/repairs/labs/${atLab.lab_party_id}`} className="truncate text-base font-extrabold underline">{atLab.lab_name}</Link>
            </span>
            {atLab.lab_phone ? <a href={`tel:${atLab.lab_phone}`} className="tap flex h-11 items-center gap-1.5 rounded-2xl bg-ground px-3 text-ink"><Phone size={18} /><span className={small}>{pick('counter.call')}</span></a> : null}
          </div>
          <span className={small}>
            {pick('rlab.sentOn')} <span dir="ltr">{fmtDate(atLab.sent_on)}</span> · <span className="num">{atLab.days}</span> {pick('audit.days')}
            {atLab.expected_back ? <> · {pick('rlab.expected')} <span dir="ltr">{fmtDate(atLab.expected_back)}</span></> : null}
            {Number(atLab.quoted_cost) ? <> · {pick('rlab.quoted')} <span className="num" dir="ltr">{withCur(n(atLab.quoted_cost))}</span></> : null}
          </span>
          {atLab.problem ? <span className={small}>{atLab.problem}</span> : null}
          {atLab.late ? <span className={`flex items-center gap-1 font-bold text-payable ${small}`}><AlertTriangle size={14} />{pick('rlab.late')}</span> : null}
          <div className="grid grid-cols-2 gap-2">
            <BiButton text="rlab.back" icon={<Undo2 size={18} />} size="md" onClick={() => { setB({ outcome: 'fixed', cost: Number(atLab.quoted_cost) ? String(Number(atLab.quoted_cost)) : '', paid: '', note: '' }); setSheet('back') }} />
            <BiButton text="rlab.cancel" icon={<XCircle size={18} />} size="md" variant="secondary" onClick={() => { setReason(''); setSheet('cancel') }} />
          </div>
        </section>
      ) : open ? (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><BiButton text="rlab.send" icon={<FlaskConical size={20} />} size="md" variant="secondary" full onClick={() => { setLab(null); setSheet('send') }} /></div>
          <Help term="rlab.send" size="sm" />
        </div>
      ) : null}

      {past.length ? (
        <Section title="rlab.trips" help="rlab.trips">
          <div className="card divide-y divide-line p-0" data-testid="lab-trips">
            {past.map((t) => (
              <Link key={t.id} to={`/repairs/labs/${t.lab_party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                <span className={`well h-8 w-8 shrink-0 ${t.status === 'cancelled' ? 'bg-ground text-muted' : t.outcome === 'fixed' ? 'bg-sell text-sell-fg' : 'bg-payable-tint text-payable'}`}>
                  {t.status === 'cancelled' ? <XCircle size={16} /> : t.outcome === 'fixed' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{t.lab_name}</span>
                  <span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(t.sent_on)}{t.back_on ? ` → ${fmtDate(t.back_on)}` : ''}</span> · {pick(t.status === 'cancelled' ? 'rlab.cancelled' : `rlab.o.${t.outcome}`)}</span>
                </span>
                {Number(t.final_cost) ? <span className="num font-bold" dir="ltr">{n(t.final_cost)}</span> : null}
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <Sheet open={sheet === 'send'} onClose={() => setSheet(null)} title="rlab.send">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="rlab.sendHint" size="sm" tone="text-muted" /><Help term="rlab.send" size="sm" /></span>
          <PartyPicker value={lab} onChange={setLab} kind="technician" label="rlab.lab" />
          <BiInput label="rlab.problem" help={<Help term="rlab.problem" size="sm" />} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="rlab.quoted" help={<Help term="rlab.quoted" size="sm" />} type="number" inputMode="numeric" min={0} value={f.quoted} onChange={(e) => setF({ ...f, quoted: e.target.value })} />
            <BiInput label="rlab.expected" help={<Help term="rlab.expected" size="sm" />} type="date" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} dir="ltr" />
          </div>
          <BiInput label="common.notes" help={<Help term="common.notes" size="sm" />} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <ErrorText error={send.error} />
          <BiButton text="rlab.sendNow" icon={<ArrowRight size={20} />} full disabled={!lab} loading={send.isPending} onClick={async () => {
            await send.mutateAsync({ lab_party_id: lab!.id, problem: f.problem || undefined, quoted_cost: Number(f.quoted || 0), expected_back: f.expected || undefined, notes: f.notes || undefined })
            setSheet(null)
          }} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'back'} onClose={() => setSheet(null)} title="rlab.back">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="rlab.outcome" size="md" bold /><Help term="rlab.outcome" size="sm" /></span>
          <BiSegmented value={b.outcome} onChange={(v) => setB({ ...b, outcome: v })} options={[{ value: 'fixed', text: 'rlab.o.fixed' }, { value: 'not_fixed', text: 'rlab.o.not_fixed' }]} />
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="rlab.charge" help={<Help term="rlab.charge" size="sm" />} type="number" inputMode="numeric" min={0} value={b.cost} onChange={(e) => setB({ ...b, cost: e.target.value })} />
            <BiInput label="rlab.paidNow" help={<Help term="rlab.paidNow" size="sm" />} type="number" inputMode="numeric" min={0} value={b.paid} onChange={(e) => setB({ ...b, paid: e.target.value })} />
          </div>
          {Number(b.cost || 0) > Number(b.paid || 0) ? <BiLabel text={{ en: pick('rlab.toKhata').replace('{{n}}', n(Number(b.cost) - Number(b.paid || 0))), ur: pick('rlab.toKhata').replace('{{n}}', n(Number(b.cost) - Number(b.paid || 0))), roman: pick('rlab.toKhata').replace('{{n}}', n(Number(b.cost) - Number(b.paid || 0))) }} size="sm" tone="text-receivable" /> : null}
          <BiInput label="common.notes" help={<Help term="common.notes" size="sm" />} value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} />
          <ErrorText error={back.error} />
          <BiButton text="rlab.saveBack" full loading={back.isPending} onClick={async () => {
            await back.mutateAsync({ outcome: b.outcome, final_cost: Number(b.cost || 0), paid_now: Number(b.paid || 0), note: b.note || undefined })
            setSheet(null)
          }} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'cancel'} onClose={() => setSheet(null)} title="rlab.cancel">
        <div className="flex flex-col gap-3">
          <BiInput label="rlab.reason" help={<Help term="rlab.cancel" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorText error={cancel.error} />
          <BiButton text="rlab.cancel" full variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onClick={async () => { await cancel.mutateAsync({ reason }); setSheet(null) }} />
        </div>
      </Sheet>
    </>
  )
}

function Stat({ k, v, help }: { k: string; v: string | number; help: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <span className="flex flex-col">
      <span className={`flex items-center gap-1 text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(k)}<Help term={help} size="sm" /></span>
      <span className="num text-lg font-bold" dir="ltr">{v}</span>
    </span>
  )
}

/** /repairs/labs — every lab in the market the shop works with, and its record */
export function LabsPage() {
  const { pick, ur, cls } = useLang()
  const { data, isLoading } = useGet<Lab[]>(['repair-labs'], '/api/v1/repairs/labs')
  const [adding, setAdding] = useState(false)
  const inv = useInvalidate()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="rlab.labs" help={<Help term="rlab.labs" />} right={<button type="button" aria-label={pick('rlab.addLab')} onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-ink px-1.5 py-1 text-ground"><Plus size={22} /></button>} />
      <BiLabel text="rlab.labsHint" size="sm" tone="text-muted" />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="rlab.noLabs" /> : (
        <div className="flex flex-col gap-2" data-testid="labs">
          {data.map((l) => (
            <Link key={l.party_id} to={`/repairs/labs/${l.party_id}`} className="card tap flex flex-col gap-2">
              <span className="flex items-center gap-2">
                <span className="well h-10 w-10 shrink-0 bg-repair text-repair-fg"><FlaskConical size={20} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-extrabold">{l.name}</span><span className={`text-muted ${small}`} dir="ltr">{l.phone}</span></span>
                {l.late ? <span className={`rounded-full bg-payable-tint px-2.5 py-1 font-bold text-payable ${small}`}>{pick('rlab.lateN').replace('{{n}}', String(l.late))}</span> : null}
              </span>
              <span className={`grid grid-cols-4 gap-2 ${small}`}>
                <span className="flex flex-col"><span className="text-muted">{pick('rlab.sent')}</span><span className="num font-bold">{l.sent}</span></span>
                <span className="flex flex-col"><span className="text-muted">{pick('rlab.atLabShort')}</span><span className="num font-bold">{l.at_lab}</span></span>
                <span className="flex flex-col"><span className="text-muted">{pick('rlab.fixRate')}</span><span className="num font-bold">{l.fix_rate == null ? '—' : `${l.fix_rate}%`}</span></span>
                <span className="flex flex-col"><span className="text-muted">{pick('rlab.owe')}</span><span className={`num font-bold ${Number(l.balance) < 0 ? 'text-payable' : ''}`} dir="ltr">{Number(l.balance) < 0 ? n(l.balance) : 0}</span></span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="rlab.addLab">
        <PartyForm defaultKinds={['technician']} onDone={async () => { setAdding(false); await inv('repair-labs') }} />
      </Sheet>
    </div>
  )
}

/** /repairs/labs/:id — one lab: its record and every phone the shop sent it */
export function LabDetailPage() {
  const { id } = useParams()
  const { pick, ur, cls } = useLang()
  const { data: l, isLoading } = useGet<LabDetail>(['repair-lab', id], id ? `/api/v1/repairs/labs/${id}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (isLoading || !l) return <Loading />
  const owe = Number(l.balance) < 0 ? Math.abs(Number(l.balance)) : 0
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={{ en: l.name, ur: l.name }} help={<Help term="rlab.labPage" />} />
      <section className="flex flex-col gap-1 rounded-3xl bg-repair p-4 text-repair-fg">
        <span className="flex items-center gap-1 [&_button]:text-current"><BiLabel text="rlab.owe" size="md" bold tone="text-current" /><Help term="rlab.owe" size="sm" /></span>
        <span className="num text-[30px] leading-tight" dir="ltr" data-testid="lab-owe">{withCur(n(owe))}</span>
        <span className={`opacity-85 ${small}`} dir="ltr">{l.phone}{l.address ? ` · ${l.address}` : ''}</span>
        <Link to={`/parties/${l.party_id}`} className={`underline ${small}`}>{pick('rlab.khata')}</Link>
      </section>
      <div className="card grid grid-cols-3 gap-3" data-testid="lab-stats">
        <Stat k="rlab.sent" v={l.sent} help="rlab.sent" />
        <Stat k="rlab.atLabShort" v={l.at_lab} help="rlab.atLabShort" />
        <Stat k="rlab.lateShort" v={l.late} help="rlab.late" />
        <Stat k="rlab.o.fixed" v={l.fixed} help="rlab.fixed" />
        <Stat k="rlab.o.not_fixed" v={l.not_fixed} help="rlab.notFixed" />
        <Stat k="rlab.fixRate" v={l.fix_rate == null ? '—' : `${l.fix_rate}%`} help="rlab.fixRate" />
        <Stat k="rlab.avgDays" v={l.avg_days ?? '—'} help="rlab.avgDays" />
        <Stat k="rlab.charges" v={n(l.cost)} help="rlab.charges" />
        <Stat k="rlab.paidSpot" v={n(l.paid_now)} help="rlab.paidNow" />
      </div>
      <Section title="rlab.trips" help="rlab.trips">
        {!l.trips.length ? <Empty text="rlab.noTrips" /> : (
          <div className="card divide-y divide-line p-0" data-testid="lab-history">
            {l.trips.map((t) => (
              <Link key={t.id} to={`/repairs/${t.job_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{t.device_desc}{t.customer_name ? ` · ${t.customer_name}` : ''}</span>
                  <span className={`text-muted ${small}`}><span dir="ltr">{t.job_no} · {fmtDate(t.sent_on)}{t.back_on ? ` → ${fmtDate(t.back_on)}` : ''}</span> · <span className="num">{t.days}</span> {pick('audit.days')}{t.problem ? ` · ${t.problem}` : ''}</span>
                </span>
                <span className="flex flex-col items-end">
                  <span className={`font-bold ${small} ${t.status === 'at_lab' ? (t.late ? 'text-payable' : 'text-receivable') : t.outcome === 'fixed' ? 'text-emerald-deep' : 'text-muted'}`}>{pick(t.status === 'at_lab' ? 'rlab.atLabShort' : t.status === 'cancelled' ? 'rlab.cancelled' : `rlab.o.${t.outcome}`)}</span>
                  {Number(t.final_cost) ? <span className="num text-sm" dir="ltr">{n(t.final_cost)}</span> : null}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
