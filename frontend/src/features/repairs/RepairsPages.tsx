/** Repairs in three steps (docs/11 v2, teal job colour): take the phone in → fix it (parts + work
 *  charge, "it is fixed") → give it back (bill, advance, left to take; the rest goes to khata).
 *  A four-stage bar shows where every job is. */

import BillActions from '@/features/more/BillActions'
import DownloadButton from '@/components/DownloadButton'
import PeriodPicker, { periodOf, type Period } from '@/features/counter/PeriodPicker'
import { post } from '@/lib/api'
import { CheckCircle2, Clock, FlaskConical, HandCoins, Phone, Plus, Printer, Receipt, SlidersHorizontal, Tag, Trash2, Wrench, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import DocLangPicker from '@/components/DocLangPicker'
import { ImeiInput } from '@/components/FieldInputs'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { BtnText, Empty, ErrorText, fmtDate, IconChip, Loading, PageHeader, SearchBox, Section, Sheet } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import {isoDay, withCur } from '@/lib/format'
import { useDocMutation, useGet } from '@/lib/queries'
import type { Party } from '@/lib/types'
import { JobLabs, type Trip } from './RepairLabs'
import RepairSticker from './RepairSticker'
import { StatusLinkButton } from './RepairStatus'

interface Fault { code: string; en: string; ur: string }
interface Part { description: string; accessory_id?: string | null; qty: number; unit_cost?: string; unit_price: string | number }
interface Job {
  id: string; no: string; party_id: string | null; party_name: string | null; party_phone: string | null; device_id: string | null
  device_desc: string; imei: string | null; fault_codes: string[]; fault_text: string | null; received_accessories: string[]
  estimate: string; advance: string; promised_at: string | null; overdue: boolean; status: string; parts_total: string; labour: string
  discount: string; total: string; paid: string; balance_due: string; warranty_days: number; outside_party_name: string | null
  outside_cost: string; created_at: string; status_token?: string | null; parts: Part[]; status_log: { to_status: string; note: string | null; user_name: string | null; at: string }[]
  trips?: Trip[]; at_lab?: Trip | null
}
interface Accessory { id: string; name: string; qty: number; price: string }

const RECEIVED = ['sim', 'memory_card', 'cover', 'charger', 'box', 'earphones']
const STAGES = ['take', 'fix', 'ready', 'given'] as const
/** which of the four stages a backend status belongs to */
const stageOf = (s: string) =>
  s === 'received' || s === 'diagnosed' ? 0 : s === 'in_progress' || s === 'waiting_parts' ? 1 : s === 'repaired' || s === 'unclaimed' ? 2 : 3
const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })

function StageChip({ status, overdue }: { status: string; overdue?: boolean }) {
  const { pick, ur, cls } = useLang()
  const st = stageOf(status)
  const tone = st === 2 ? 'bg-sell text-sell-fg' : st === 3 ? 'bg-ground text-muted border border-line' : overdue ? 'bg-expense text-expense-fg' : 'bg-repair text-repair-fg'
  return <span className={`rounded-full px-2.5 py-0.5 font-bold ${tone} ${ur ? cls('sm') : 'text-xs'}`}>{status === 'cancelled' ? pick('sale.status.void') : status === 'returned_unrepaired' ? pick('counter.cantFix') : pick(`counter.rStage.${STAGES[st]}`)}</span>
}

export function RepairsPage() {
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const { data, isLoading } = useGet<Job[]>(['repairs', open, q], `/api/v1/repairs?open_only=${open}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
  const ready = (data ?? []).filter((j) => stageOf(j.status) === 2)
  const listRole = useAuth((x) => x.me?.user.role)
  const manager = listRole === 'owner' || listRole === 'manager'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="repair.title" help={<Help term="repair.page" />} right={<button type="button" aria-label={pick('counter.rTitleNew')} onClick={() => nav('/repairs/new')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground"><Plus size={22} /><BtnText k={'counter.rTitleNew'} /></button>} />
      <button type="button" onClick={() => nav('/repairs/new')} className="tap flex min-h-16 items-center gap-3 rounded-3xl bg-repair px-4 text-repair-fg">
        <span className="well h-11 w-11 bg-surface"><Plus size={22} /></span>
        <span className={ur ? cls('lg') : 'text-lg font-extrabold'}>{pick('counter.rTitleNew')}</span>
      </button>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => nav('/repairs/labs')} className="tap flex min-h-12 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-ink" data-testid="open-labs">
          <FlaskConical size={20} /><BiLabel text="rlab.labs" size="md" bold tone="text-current" />
        </button>
        <Help term="rlab.labs" size="sm" />
      </div>
      {manager ? <RepairReports /> : null}
      {ready.length ? <BiLabel text="counter.readyCall" size="sm" bold tone="text-sell-fg" /> : null}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiSegmented value={open ? 'open' : 'all'} onChange={(v) => setOpen(v === 'open')} options={[{ value: 'open', text: 'repair.open' }, { value: 'all', text: 'repair.all' }]} /></div>
        <Help term="repair.view" size="sm" />
      </div>
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="repair.searchPlaceholder" /></div><Help term="common.search" size="sm" /></div>
      {isLoading ? <Loading /> : !data?.length ? <Empty text="repair.none" /> : (
        <div className="card divide-y divide-line p-0">
          {[...ready, ...data.filter((j) => stageOf(j.status) !== 2)].map((j) => (
            <div key={j.id} className="flex items-center">
            <button type="button" onClick={() => nav(`/repairs/${j.id}`)} className="tap flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-extrabold">{j.device_desc}</span>
                <span className="truncate text-xs text-muted">{j.party_name ?? pick('repair.ownStock')} · <span dir="ltr">{j.no}</span>{j.promised_at ? <> · <span dir="ltr">{fmtDate(j.promised_at)}</span></> : null}{j.at_lab ? <> · <span className={j.at_lab.late ? 'font-bold text-payable' : 'font-bold text-repair-fg'}>{pick('rlab.atLabShort')}: {j.at_lab.lab_name}</span></> : null}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <StageChip status={j.status} overdue={j.overdue} />
                <span className="num text-sm" dir="ltr">{n(Number(j.total) > 0 ? j.total : j.estimate)}</span>
              </span>
            </button>
            {/* owner 2026-11-15 (ADR-087): edit / delete a repair taken in by mistake */}
            {j.status !== 'delivered' && j.status !== 'cancelled' ? <BillActions kind="repair" id={j.id} no={j.no} canDelete={manager} /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function NewRepairPage() {
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  // owner 2026-11-15 (ADR-087): from a phone's page (?device=) the shop's own phone goes to repair
  const deviceId = new URLSearchParams(window.location.search).get('device')
  const { data: dev } = useGet<{ id: string; brand_name: string; model_name: string; imei1: string }>(['device', deviceId], deviceId ? `/api/v1/devices/${deviceId}` : null)
  const { data: faults } = useGet<Fault[]>(['faults'], '/api/v1/repairs/fault-codes')
  const { data: techs } = useGet<{ id: string; name: string; role: string }[]>(['repair-techs'], '/api/v1/repairs/technicians')
  const [party, setParty] = useState<Party | null>(null)
  const [f, setF] = useState({ device_desc: '', imei: '', fault_text: '', estimate: '', advance: '', promised_at: isoDay(1) })
  const [codes, setCodes] = useState<string[]>([])
  const [received, setReceived] = useState<string[]>([])
  const [more, setMore] = useState(false)
  // who repairs it: the shop's own technician, or an outside lab / technician in the market
  const [who, setWho] = useState<'' | 'shop' | 'lab'>('')
  const [tech, setTech] = useState('')
  const [lab, setLab] = useState<Party | null>(null)
  const [l, setL] = useState({ problem: '', quote: '', back: isoDay(2) })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const m = useDocMutation<Record<string, unknown>, Job>('POST', () => '/api/v1/repairs')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const toggle = (xs: string[], x: string, fn: (v: string[]) => void) => fn(xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])
  const chip = (on: boolean) => `tap rounded-full border px-3 py-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const days = [{ d: isoDay(0), t: 'counter.today' }, { d: isoDay(1), t: 'counter.tomorrow' }, { d: isoDay(3), t: 'counter.in3days' }]
  const own = !!deviceId
  const ready = (own ? !!dev : !!party && !!f.device_desc) && (codes.length > 0 || !!f.fault_text) && !!who && (who === 'shop' || !!lab)
  const card = (k: 'shop' | 'lab', Icon: typeof Wrench, title: string, hint: string) => (
    <button type="button" aria-pressed={who === k} onClick={() => setWho(k)} className={`tap flex min-h-[96px] flex-col items-start gap-1 rounded-3xl border-2 p-3 text-start ${who === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid={`repair-who-${k}`}>
      <Icon size={22} />
      <span className={ur ? cls('md') + ' font-bold' : 'text-[15px] font-extrabold leading-tight'}>{pick(title)}</span>
      <span className={`opacity-80 ${ur ? cls('sm') : 'text-xs'}`}>{pick(hint)}</span>
    </button>
  )

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const problem = [...codes.map((c) => faults?.find((x) => x.code === c)?.en ?? c), f.fault_text].filter(Boolean).join(', ')
      const j = await m.mutateAsync({
        ...(own ? { device_id: deviceId } : { party_id: party!.id, device_desc: f.device_desc, imei: f.imei || undefined, advance: Number(f.advance || 0) }),
        fault_codes: codes, fault_text: f.fault_text || undefined, received_accessories: received, estimate: Number(f.estimate || 0), promised_at: f.promised_at || undefined,
        technician_id: who === 'shop' && tech ? tech : undefined,
      })
      if (who === 'lab' && lab) {
        await post(`/api/v1/repairs/${j.id}/lab`, { lab_party_id: lab.id, problem: l.problem || problem || undefined, quoted_cost: Number(l.quote || 0), expected_back: l.back || undefined })
      }
      if (!own) openPrintable(`/api/v1/repairs/${j.id}/job-sheet`)
      nav(`/repairs/${j.id}`, { replace: true })
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.rTitleNew" help={<Help term="repair.new" />} />
      {own ? (
        <div className="card flex flex-col" data-testid="repair-own-phone">
          <BiLabel text="repair.ownStock" size="sm" tone="text-muted" />
          <span className="text-[15px] font-extrabold">{dev ? `${dev.brand_name} ${dev.model_name}` : '…'}</span>
          {dev ? <span className="text-xs text-muted" dir="ltr">{dev.imei1}</span> : null}
        </div>
      ) : (
        <>
          <PartyPicker value={party} onChange={setParty} kind="customer" label="repair.customer" />
          <BiInput label="counter.phoneName" help={<Help term="repair.device" size="sm" />} value={f.device_desc} onChange={set('device_desc')} />
        </>
      )}
      <span className="flex items-center gap-1"><BiLabel text="counter.whatProblem" size="md" bold /><Help term="repair.faults" size="sm" /></span>
      <div className="flex flex-wrap gap-1.5">
        {faults?.map((x) => (
          <button key={x.code} type="button" aria-pressed={codes.includes(x.code)} onClick={() => toggle(codes, x.code, setCodes)} className={chip(codes.includes(x.code))}>
            {ur ? x.ur : x.en}
          </button>
        ))}
      </div>
      <BiInput label="counter.otherProblem" help={<Help term="repair.faultText" size="sm" />} value={f.fault_text} onChange={set('fault_text')} />

      {/* owner 2026-11-15 (ADR-087): the shop's own technician, or an outside lab / technician */}
      <span className="flex items-center gap-1"><BiLabel text="rwho.title" size="md" bold /><Help term="rwho.choice" size="sm" /></span>
      <div className="grid grid-cols-2 gap-2">
        {card('shop', Wrench, 'rwho.shop', 'rwho.shopHint')}
        {card('lab', FlaskConical, 'rwho.lab', 'rwho.labHint')}
      </div>
      {who === 'shop' ? (
        <label className="flex flex-col gap-1">
          <BiLabel text="rwho.tech" size="sm" bold />
          <select value={tech} onChange={(e) => setTech(e.target.value)} className="min-h-12 rounded-2xl border border-line bg-surface px-3 font-semibold" data-testid="repair-tech">
            <option value="">{pick('rwho.anyTech')}</option>
            {techs?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      ) : null}
      {who === 'lab' ? (
        <div className="flex flex-col gap-2 rounded-3xl border-2 border-repair/40 p-3" data-testid="repair-lab-box">
          <PartyPicker value={lab} onChange={setLab} kind="technician" label="rwho.labName" />
          <BiInput label="rwho.labProblem" value={l.problem} onChange={(e) => setL({ ...l, problem: e.target.value })} placeholder={pick('rwho.labProblemPh')} />
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="rwho.labQuote" type="number" inputMode="numeric" min={0} value={l.quote} onChange={(e) => setL({ ...l, quote: e.target.value })} className="num" />
            <BiInput label="rwho.labBack" type="date" value={l.back} onChange={(e) => setL({ ...l, back: e.target.value })} dir="ltr" />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <BiInput label="counter.estimateCost" help={<Help term="repair.estimate" size="sm" />} type="number" inputMode="numeric" min={0} value={f.estimate} onChange={set('estimate')} />
        {own ? null : <BiInput label="counter.advanceTaken" help={<Help term="repair.advance" size="sm" />} type="number" inputMode="numeric" min={0} value={f.advance} onChange={set('advance')} />}
      </div>
      <span className="flex items-center gap-1"><BiLabel text="counter.whenReady" size="md" bold /><Help term="repair.promised" size="sm" /></span>
      <div className="flex flex-wrap gap-1.5">
        {days.map((x) => <button key={x.d} type="button" aria-pressed={f.promised_at === x.d} onClick={() => setF({ ...f, promised_at: x.d })} className={chip(f.promised_at === x.d)}>{pick(x.t)}</button>)}
        <input type="date" aria-label={pick('counter.whenReady')} value={f.promised_at} min={isoDay(0)} onChange={set('promised_at')} className="h-10 rounded-full border border-line bg-surface px-3 text-sm font-bold" dir="ltr" />
      </div>
      {own ? null : more ? (
        <>
          <ImeiInput label="repair.imei" help={<Help term="imei" size="sm" />} value={f.imei} onChange={(imei) => setF({ ...f, imei })} />
          <span className="flex items-center gap-1"><BiLabel text="repair.received" size="md" tone="text-muted" /><Help term="repair.received" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {RECEIVED.map((x) => <button key={x} type="button" aria-pressed={received.includes(x)} onClick={() => toggle(received, x, setReceived)} className={chip(received.includes(x))}>{pick(`repair.acc.${x}`)}</button>)}
          </div>
        </>
      ) : (
        <div><IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreDetails" onClick={() => setMore(true)} /></div>
      )}
      <ErrorText error={err ?? m.error} />
      <BiButton text={own ? 'rwho.send' : 'counter.saveAndPrint'} icon={own ? <Wrench size={22} /> : <Printer size={22} />} full loading={busy} disabled={!ready} onClick={() => void save()} data-testid="repair-save" />
      {!who ? <BiLabel text="rwho.pick" size="sm" tone="text-muted" /> : null}
    </div>
  )
}

export function RepairDetailPage() {
  const { id } = useParams()
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data: j, isLoading } = useGet<Job>(['repair', id], id ? `/api/v1/repairs/${id}` : null)
  const { data: faults } = useGet<Fault[]>(['faults'], '/api/v1/repairs/fault-codes')
  const { data: stock } = useGet<Accessory[]>(['accessories', 'all'], '/api/v1/accessories')
  const [sheet, setSheet] = useState<null | 'fix' | 'give'>(null)
  const [sticker, setSticker] = useState(false)
  const [parts, setParts] = useState<Part[]>([])
  const [labour, setLabour] = useState('')
  const [paid, setPaid] = useState('')
  const [warranty, setWarranty] = useState('')
  const [outsideCost, setOutsideCost] = useState('')
  const partsM = useDocMutation<Part[], Job>('PUT', () => `/api/v1/repairs/${id}/parts`, (x) => x)
  const labourM = useDocMutation<Record<string, unknown>, Job>('PATCH', () => `/api/v1/repairs/${id}`)
  const statusM = useDocMutation<{ status: string; note?: string }, Job>('POST', () => `/api/v1/repairs/${id}/status`)
  const deliverM = useDocMutation<Record<string, unknown>, Job>('POST', () => `/api/v1/repairs/${id}/deliver`)
  if (isLoading || !j) return <Loading />
  const stage = stageOf(j.status)
  const closed = stage === 3
  const canGive = role !== 'technician'
  const faultName = (c: string) => { const x = faults?.find((y) => y.code === c); return x ? (ur ? x.ur : x.en) : c }
  const draftTotal = parts.reduce((s, p) => s + Number(p.unit_price || 0) * p.qty, 0) + Number(labour || 0)
  const left = Math.max(0, Number(j.total) - Number(j.advance))
  const small = ur ? cls('sm') : 'text-sm font-semibold'

  function openFix() {
    setParts(j!.parts.map((p) => ({ ...p })))
    setLabour(Number(j!.labour) ? String(Number(j!.labour)) : '')
    setSheet('fix')
  }
  async function saveBill(markReady: boolean) {
    await partsM.mutateAsync(parts.filter((p) => p.description).map((p) => ({ description: p.description, accessory_id: p.accessory_id ?? null, qty: p.qty, unit_price: Number(p.unit_price || 0) })))
    await labourM.mutateAsync({ labour: Number(labour || 0) })
    if (markReady) await statusM.mutateAsync({ status: 'repaired' })
    setSheet(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={{ en: j.device_desc, ur: j.device_desc }} help={<Help term="repair.job" />} right={<span className="flex items-center gap-1"><StageChip status={j.status} overdue={j.overdue} />{(role === 'owner' || role === 'manager') && j.status !== 'delivered' && j.status !== 'cancelled' ? <BillActions kind="repair" id={j.id} no={j.no} canDelete editTo={null} /> : null}</span>} />

      <section className="flex flex-col gap-2 rounded-3xl bg-repair p-4 text-repair-fg">
        <div className="flex items-center gap-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-extrabold">{j.party_name ?? pick('repair.ownStock')}</span>
            <span className="text-xs opacity-80" dir="ltr">{j.no}{j.imei ? ` · ${j.imei}` : ''}</span>
          </span>
          {j.party_phone ? (
            <a href={`tel:${j.party_phone}`} className="tap flex h-11 items-center gap-1.5 rounded-2xl bg-surface px-3 text-ink">
              <Phone size={18} /> <span className={small}>{pick('counter.call')}</span>
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {j.fault_codes.map((c) => <span key={c} className={`rounded-full bg-surface px-2.5 py-0.5 font-bold text-ink ${ur ? cls('sm') : 'text-xs'}`}>{faultName(c)}</span>)}
          {j.fault_text ? <span className={`rounded-full bg-surface px-2.5 py-0.5 font-bold text-ink ${ur ? cls('sm') : 'text-xs'}`}>{j.fault_text}</span> : null}
        </div>
        {j.promised_at && !closed ? <span className={small}>{pick('counter.whenReady')}: <span dir="ltr">{fmtDate(j.promised_at)}</span></span> : null}
      </section>

      <div className="flex items-center gap-1">
      <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
        {STAGES.map((s, i) => (
          <div key={s} className="flex flex-col gap-1">
            <span className={`h-1.5 rounded-full ${i <= stage ? 'bg-repair-fg' : 'bg-line'}`} />
            <span className={`${i === stage ? 'font-bold text-ink' : 'text-muted'} ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(`counter.rStage.${s}`)}</span>
          </div>
        ))}
      </div>
      <Help term="repair.stages" size="sm" />
      </div>

      {stage < 2 ? (
        <>
          <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><BiButton text="counter.markReady" icon={<CheckCircle2 size={22} />} full onClick={openFix} /></div><Help term="repair.steps" size="sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            {j.status !== 'in_progress' ? <BiButton text="counter.startFix" icon={<Wrench size={18} />} size="md" variant="secondary" loading={statusM.isPending} onClick={() => statusM.mutate({ status: 'in_progress' })} /> : null}
            {j.status !== 'waiting_parts' ? <BiButton text="counter.waitParts" icon={<Clock size={18} />} size="md" variant="secondary" loading={statusM.isPending} onClick={() => statusM.mutate({ status: 'waiting_parts' })} /> : null}
            <BiButton text="counter.cantFix" icon={<XCircle size={18} />} size="md" variant="secondary" loading={statusM.isPending} onClick={() => statusM.mutate({ status: 'returned_unrepaired' })} />
          </div>
        </>
      ) : null}
      <JobLabs jobId={j.id} open={!closed} trips={j.trips ?? []} atLab={j.at_lab ?? null} />
      {stage === 2 && canGive ? (
        <>
          <BiButton text="counter.giveBackCustomer" icon={<HandCoins size={22} />} full onClick={() => { setPaid(String(left)); setSheet('give') }} />
          <BiButton text="counter.billTitle" icon={<Receipt size={20} />} size="md" variant="secondary" full onClick={openFix} />
        </>
      ) : null}
      <ErrorText error={statusM.error} />

      <Section title="repair.bill" help="repair.bill">
        <div className="card flex flex-col p-0">
          {j.parts.map((p, i) => <Row key={i} label={`${p.description}${p.qty > 1 ? ` × ${p.qty}` : ''}`} value={n(Number(p.unit_price) * p.qty)} />)}
          <Row label={pick('counter.labourCharge')} value={n(j.labour)} help="repair.labour" />
          <Row label={pick('common.total')} value={n(Number(j.total) > 0 ? j.total : j.estimate)} strong help="repair.total" />
          {Number(j.advance) ? <Row label={pick('counter.advanceTaken')} value={`− ${n(j.advance)}`} help="repair.advance" /> : null}
          {closed ? <Row label={pick('common.paid')} value={n(j.paid)} help="repair.paid" /> : <Row label={pick('counter.leftToTake')} value={n(Number(j.total) > 0 ? left : Math.max(0, Number(j.estimate) - Number(j.advance)))} strong help="repair.left" />}
        </div>
      </Section>
      <DocLangPicker />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiButton text="rlab.printSticker" icon={<Tag size={20} />} size="md" variant="secondary" full onClick={() => setSticker(true)} /></div>
        <Help term="rlab.sticker" size="sm" />
      </div>
      <RepairSticker ids={[j.id]} open={sticker} onClose={() => setSticker(false)} />
      {j.party_id ? <StatusLinkButton token={j.status_token} phone={j.party_phone} name={j.party_name} device={j.device_desc} no={j.no} /> : null}
      <BiButton text="counter.printSlip" icon={<Printer size={20} />} size="md" variant="ghost" onClick={() => openPrintable(`/api/v1/repairs/${j.id}/job-sheet`)} />
      <DocActions path={`/api/v1/repairs/${j.id}/job-sheet`} name={`repair-${j.no}`} title={j.no} picker={false} />

      <Section title="stock.history" help="repair.history">
        <div className="card p-0">
          {[...j.status_log].reverse().map((l, i) => (
            <div key={i} className={`flex items-center justify-between gap-2 px-4 py-2.5 ${i ? 'border-t border-line' : ''}`}>
              <div>
                <div className="text-sm font-bold">{pick(`repair.status.${l.to_status}`)}</div>
                {l.note ? <div className="text-xs text-muted">{l.note}</div> : null}
              </div>
              <div className="text-end text-xs text-muted"><div dir="ltr">{fmtDate(l.at)}</div>{l.user_name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Sheet open={sheet === 'fix'} onClose={() => setSheet(null)} title="counter.billTitle">
        <div className="flex flex-col gap-3">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_96px_auto] items-end gap-2">
              <BiInput label="counter.partName" help={<Help term="repair.part" size="sm" />} value={p.description} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              <BiInput label="purchase.qty" help={<Help term="common.qty" size="sm" />} type="number" min={1} value={p.qty} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 1 } : x)))} />
              <BiInput label="repair.partPrice" help={<Help term="repair.partPrice" size="sm" />} type="number" inputMode="numeric" min={0} value={p.unit_price} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, unit_price: e.target.value } : x)))} />
              <button type="button" aria-label={pick('crud.delete')} onClick={() => setParts(parts.filter((_, k) => k !== i))} className="tap mb-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable"><Trash2 size={16} /><BtnText k={'crud.delete'} /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <IconChip icon={<Plus size={18} />} text="counter.addPart" onClick={() => setParts([...parts, { description: '', qty: 1, unit_price: '' }])} />
            <Help term="repair.fromStock" size="sm" />
            {stock?.filter((a) => a.qty > 0).slice(0, 8).map((a) => (
              <button key={a.id} type="button" onClick={() => setParts([...parts, { description: a.name, accessory_id: a.id, qty: 1, unit_price: a.price }])} className="tap rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted">+ {a.name} ({a.qty})</button>
            ))}
          </div>
          <BiInput label="counter.labourCharge" help={<Help term="repair.labour" size="sm" />} type="number" inputMode="numeric" min={0} value={labour} onChange={(e) => setLabour(e.target.value)} />
          <div className="hero flex items-center justify-between px-5 py-3">
            <span className="flex items-center gap-1 [&_button]:text-current"><BiLabel text="common.total" size="md" tone="text-hero-text" bold /><Help term="repair.total" size="sm" /></span>
            <span className="num text-2xl" dir="ltr">{withCur(draftTotal.toLocaleString('en-US'))}</span>
          </div>
          <ErrorText error={partsM.error ?? labourM.error ?? statusM.error} />
          {stage < 2 ? <BiButton text="counter.markReady" full loading={partsM.isPending || labourM.isPending || statusM.isPending} onClick={() => saveBill(true)} /> : null}
          <BiButton text="common.save" full variant={stage < 2 ? 'secondary' : 'primary'} loading={partsM.isPending || labourM.isPending} onClick={() => saveBill(false)} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'give'} onClose={() => setSheet(null)} title="counter.giveBackCustomer">
        <div className="flex flex-col gap-3">
          <div className="card flex flex-col p-0">
            <Row label={pick('common.total')} value={n(j.total)} help="repair.total" />
            {Number(j.advance) ? <Row label={pick('counter.advanceTaken')} value={`− ${n(j.advance)}`} help="repair.advance" /> : null}
            <Row label={pick('counter.leftToTake')} value={n(left)} strong help="repair.left" />
          </div>
          {j.party_id ? (
            <>
              <BiInput label="counter.takeNow" help={<Help term="common.paid" size="sm" />} type="number" inputMode="numeric" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} className="num text-2xl" />
              {Number(paid || 0) < left ? <BiLabel text="counter.restToKhata" size="sm" tone="text-receivable" /> : null}
            </>
          ) : (j.trips ?? []).some((t) => t.status === 'back') ? null : (
            <BiInput label="counter.outsideCostOpt" help={<Help term="repair.outsideCost" size="sm" />} type="number" inputMode="numeric" min={0} value={outsideCost} onChange={(e) => setOutsideCost(e.target.value)} />
          )}
          <BiInput label="counter.warrantyOpt" help={<Help term="warranty" size="sm" />} type="number" inputMode="numeric" min={0} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          <ErrorText error={deliverM.error} />
          <BiButton text="counter.giveBackCustomer" full loading={deliverM.isPending} onClick={async () => { await deliverM.mutateAsync({ paid: Number(paid || 0), warranty_days: warranty ? Number(warranty) : undefined, outside_cost: outsideCost ? Number(outsideCost) : undefined }); setSheet(null) }} />
        </div>
      </Sheet>
    </div>
  )
}

function Row({ label, value, strong, help }: { label: string; value: string; strong?: boolean; help?: string }) {
  const { ur, cls } = useLang()
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 ${strong ? 'bg-ground/60' : ''}`}>
      <span className={`flex items-center gap-1 ${ur ? cls('md') : 'text-[15px]'} ${strong ? 'font-bold' : ''}`}>{label}{help ? <Help term={help} size="sm" /> : null}</span>
      <span className={`num ${strong ? 'text-lg' : 'text-base'}`} dir="ltr">{value}</span>
    </div>
  )
}


/** owner 2026-11-15 (ADR-087): the repairs and the outside-labs reports for a period — A4 PDF /
 *  Excel, download, share or print */
function RepairReports() {
  const { pick } = useLang()
  const [period, setPeriod] = useState<Period>(() => periodOf('month'))
  const q = `date_from=${period.from}&date_to=${period.to}`
  return (
    <section className="card flex flex-col gap-2" data-testid="repair-reports">
      <span className="flex items-center gap-1"><Receipt size={18} className="text-repair-fg" /><BiLabel text="rwho.reports" size="md" bold /><Help term="rwho.reports" size="sm" /></span>
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ground px-3 py-2">
        <span className="font-bold">{pick('rwho.jobsReport')}</span>
        <DownloadButton path={`/api/v1/repairs/report?${q}`} name={`repairs-${period.from}-${period.to}`} formats={['pdf', 'xlsx']} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ground px-3 py-2" data-testid="labs-report">
        <span className="font-bold">{pick('rwho.labsReport')}</span>
        <DownloadButton path={`/api/v1/repairs/labs/report?${q}`} name={`repair-labs-${period.from}-${period.to}`} formats={['pdf', 'xlsx']} />
      </div>
    </section>
  )
}
