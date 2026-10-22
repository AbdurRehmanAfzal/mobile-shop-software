import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { Chip, Empty, ErrorText, KV, List, Loading, MoneyText, PageHeader, Row, Section, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useDocMutation, useGet } from '@/lib/queries'
import type { Party } from '@/lib/types'

interface Fault { code: string; en: string; ur: string }
interface Part { description: string; accessory_id?: string | null; qty: number; unit_cost?: string; unit_price: string | number }
interface Job {
  id: string; no: string; party_id: string | null; party_name: string | null; party_phone: string | null; device_id: string | null
  device_desc: string; imei: string | null; fault_codes: string[]; fault_text: string | null; received_accessories: string[]
  estimate: string; advance: string; promised_at: string | null; overdue: boolean; status: string; parts_total: string; labour: string
  discount: string; total: string; paid: string; balance_due: string; warranty_days: number; outside_party_name: string | null
  outside_cost: string; created_at: string; parts: Part[]; status_log: { to_status: string; note: string | null; user_name: string | null; at: string }[]
}
interface Accessory { id: string; name: string; qty: number; price: string }

const NEXT: Record<string, string[]> = {
  received: ['diagnosed', 'in_progress', 'waiting_parts', 'repaired', 'returned_unrepaired'],
  diagnosed: ['waiting_parts', 'in_progress', 'repaired', 'returned_unrepaired'],
  waiting_parts: ['in_progress', 'repaired', 'returned_unrepaired'],
  in_progress: ['waiting_parts', 'repaired', 'returned_unrepaired'],
  repaired: ['in_progress', 'unclaimed'],
  unclaimed: [],
}
const RECEIVED = ['sim', 'memory_card', 'cover', 'charger', 'box', 'earphones']
const tone = (s: string) => (s === 'repaired' ? 'ok' : s === 'delivered' ? 'ink' : s === 'returned_unrepaired' || s === 'unclaimed' ? 'bad' : 'warn')

export function RepairsPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [open, setOpen] = useState(true)
  const { data, isLoading } = useGet<Job[]>(['repairs', open], `/api/v1/repairs?open_only=${open}`)
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="repair.title" right={<button type="button" aria-label={pick('repair.new')} onClick={() => nav('/repairs/new')} className="well tap h-11 w-11 bg-emerald text-white shadow-cta"><Plus size={22} /></button>} />
      <BiSegmented value={open ? 'open' : 'all'} onChange={(v) => setOpen(v === 'open')} options={[{ value: 'open', text: 'repair.open' }, { value: 'all', text: 'repair.all' }]} />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="repair.none" /> : (
        <List>
          {data.map((j) => (
            <Row
              key={j.id}
              title={j.device_desc}
              sub={<span className="flex flex-wrap items-center gap-1.5"><span dir="ltr">{j.no}</span> · {j.party_name ?? pick('repair.ownStock')} <Chip text={`repair.status.${j.status}`} tone={tone(j.status)} />{j.overdue ? <Chip text="repair.overdue" tone="bad" /> : null}</span>}
              right={Number(j.total) > 0 ? <MoneyText value={j.total} tone="ink" /> : <MoneyText value={j.estimate} tone="muted" />}
              onClick={() => nav(`/repairs/${j.id}`)}
            />
          ))}
        </List>
      )}
    </div>
  )
}

export function NewRepairPage() {
  const nav = useNavigate()
  const { pick, ur } = useLang()
  const { data: faults } = useGet<Fault[]>(['faults'], '/api/v1/repairs/fault-codes')
  const [party, setParty] = useState<Party | null>(null)
  const [f, setF] = useState({ device_desc: '', imei: '', fault_text: '', estimate: '', advance: '', promised_at: '' })
  const [codes, setCodes] = useState<string[]>([])
  const [received, setReceived] = useState<string[]>([])
  const m = useDocMutation<Record<string, unknown>, Job>('POST', () => '/api/v1/repairs')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const toggle = (xs: string[], x: string, fn: (v: string[]) => void) => fn(xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="repair.new" />
      <PartyPicker value={party} onChange={setParty} kind="customer" label="repair.customer" />
      <BiInput label="repair.device" value={f.device_desc} onChange={set('device_desc')} />
      <BiInput label="repair.imei" inputMode="numeric" value={f.imei} onChange={set('imei')} maxLength={20} />
      <BiLabel text="repair.faults" size="md" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">
        {faults?.map((x) => (
          <button key={x.code} type="button" onClick={() => toggle(codes, x.code, setCodes)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${codes.includes(x.code) ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>
            {ur ? x.ur : x.en}
          </button>
        ))}
      </div>
      <BiInput label="repair.faultText" value={f.fault_text} onChange={set('fault_text')} />
      <BiLabel text="repair.received" size="md" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">
        {RECEIVED.map((x) => (
          <button key={x} type="button" onClick={() => toggle(received, x, setReceived)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${received.includes(x) ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>
            {pick(`repair.acc.${x}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="repair.estimate" type="number" inputMode="decimal" min={0} value={f.estimate} onChange={set('estimate')} />
        <BiInput label="repair.advance" type="number" inputMode="decimal" min={0} value={f.advance} onChange={set('advance')} />
      </div>
      <BiInput label="repair.promised" type="date" value={f.promised_at} onChange={set('promised_at')} />
      <ErrorText error={m.error} />
      <BiButton
        text="common.save"
        full
        loading={m.isPending}
        disabled={!party || !f.device_desc || (!codes.length && !f.fault_text)}
        onClick={async () => {
          const j = await m.mutateAsync({ party_id: party!.id, device_desc: f.device_desc, imei: f.imei || undefined, fault_codes: codes, fault_text: f.fault_text || undefined, received_accessories: received, estimate: Number(f.estimate || 0), advance: Number(f.advance || 0), promised_at: f.promised_at || undefined })
          openPrintable(`/api/v1/repairs/${j.id}/job-sheet`)
          nav(`/repairs/${j.id}`, { replace: true })
        }}
      />
    </div>
  )
}

export function RepairDetailPage() {
  const { id } = useParams()
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data: j, isLoading } = useGet<Job>(['repair', id], id ? `/api/v1/repairs/${id}` : null)
  const { data: stock } = useGet<Accessory[]>(['accessories', 'all'], '/api/v1/accessories')
  const [sheet, setSheet] = useState<null | 'parts' | 'status' | 'deliver'>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [labour, setLabour] = useState('')
  const [paid, setPaid] = useState('')
  const [warranty, setWarranty] = useState('')
  const [outsideCost, setOutsideCost] = useState('')
  const [note, setNote] = useState('')
  const partsM = useDocMutation<Part[], Job>('PUT', () => `/api/v1/repairs/${id}/parts`, (x) => x)
  const labourM = useDocMutation<Record<string, unknown>, Job>('PATCH', () => `/api/v1/repairs/${id}`)
  const statusM = useDocMutation<{ status: string; note?: string }, Job>('POST', () => `/api/v1/repairs/${id}/status`)
  const deliverM = useDocMutation<Record<string, unknown>, Job>('POST', () => `/api/v1/repairs/${id}/deliver`)
  if (isLoading || !j) return <Loading />
  const closed = ['delivered', 'returned_unrepaired'].includes(j.status)
  const canDeliver = role !== 'technician'
  const draftTotal = parts.reduce((s, p) => s + Number(p.unit_price || 0) * p.qty, 0) + Number(labour || 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={{ en: j.no, ur: j.no }} right={<Chip text={`repair.status.${j.status}`} tone={tone(j.status)} />} />
      <div className="card">
        <KV k="repair.device" v={j.device_desc} />
        {j.imei ? <KV k="repair.imei" v={<span dir="ltr">{j.imei}</span>} /> : null}
        <KV k="repair.customer" v={j.party_name ? `${j.party_name} · ${j.party_phone ?? ''}` : pick('repair.ownStock')} />
        {j.outside_party_name ? <KV k="repair.outsideTech" v={j.outside_party_name} /> : null}
        {j.promised_at ? <KV k="repair.promised" v={<span dir="ltr">{fmtDate(j.promised_at)}</span>} /> : null}
        {j.fault_text ? <KV k="repair.faultText" v={j.fault_text} /> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {j.fault_codes.map((c) => <Chip key={c} text={{ en: c, ur: c }} tone="warn" />)}
        {j.received_accessories.map((c) => <Chip key={c} text={`repair.acc.${c}`} />)}
      </div>
      <Section title="repair.bill">
        <div className="card">
          {j.parts.map((p, i) => <KV key={i} k={{ en: `${p.description} × ${p.qty}`, ur: `${p.description} × ${p.qty}` }} v={<MoneyText value={Number(p.unit_price) * p.qty} tone="ink" />} />)}
          <KV k="repair.labour" v={<MoneyText value={j.labour} tone="ink" />} />
          <KV k="common.total" v={<MoneyText value={j.total} tone="ink" size="lg" />} />
          <KV k="repair.advance" v={<MoneyText value={j.advance} tone="ink" />} />
          {j.status === 'delivered' ? <KV k="common.paid" v={<MoneyText value={j.paid} tone="ink" />} /> : <KV k="repair.estimate" v={<MoneyText value={j.estimate} tone="muted" />} />}
        </div>
      </Section>
      <div className="grid grid-cols-2 gap-2">
        <BiButton text="repair.jobSheet" size="md" variant="secondary" onClick={() => openPrintable(`/api/v1/repairs/${j.id}/job-sheet`)} />
        {!closed ? <BiButton text="repair.setStatus" size="md" variant="secondary" onClick={() => setSheet('status')} /> : null}
        {!closed ? <BiButton text="repair.parts" size="md" variant="secondary" onClick={() => { setParts(j.parts.map((p) => ({ ...p }))); setLabour(j.labour); setSheet('parts') }} /> : null}
        {!closed && canDeliver ? <BiButton text="repair.deliver" size="md" onClick={() => { setPaid(String(Math.max(0, Number(j.total) - Number(j.advance)))); setSheet('deliver') }} /> : null}
      </div>
      <Section title="stock.history">
        <div className="card p-0">
          {[...j.status_log].reverse().map((l, i) => (
            <div key={i} className={`flex items-center justify-between gap-2 px-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
              <div>
                <div className="text-sm font-bold">{pick(`repair.status.${l.to_status}`)}</div>
                {l.note ? <div className="text-xs text-muted">{l.note}</div> : null}
              </div>
              <div className="text-end text-xs text-muted"><div dir="ltr">{fmtDate(l.at)}</div>{l.user_name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Sheet open={sheet === 'status'} onClose={() => setSheet(null)} title="repair.setStatus">
        <div className="flex flex-col gap-2">
          <BiInput label="common.notes" value={note} onChange={(e) => setNote(e.target.value)} />
          {(NEXT[j.status] ?? []).map((s) => <BiButton key={s} text={`repair.status.${s}`} variant={s === 'repaired' ? 'primary' : 'secondary'} full size="md" loading={statusM.isPending} onClick={async () => { await statusM.mutateAsync({ status: s, note: note || undefined }); setSheet(null); setNote('') }} />)}
          <ErrorText error={statusM.error} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'parts'} onClose={() => setSheet(null)} title="repair.parts">
        <div className="flex flex-col gap-3">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_88px_36px] items-end gap-2">
              <BiInput label="repair.partDesc" value={p.description} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              <BiInput label="purchase.qty" type="number" min={1} value={p.qty} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 1 } : x)))} />
              <BiInput label="repair.partPrice" type="number" min={0} value={p.unit_price} onChange={(e) => setParts(parts.map((x, k) => (k === i ? { ...x, unit_price: e.target.value } : x)))} />
              <button type="button" aria-label="remove" onClick={() => setParts(parts.filter((_, k) => k !== i))} className="well tap mb-1 h-9 w-9 text-payable"><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            <BiButton text="common.add" size="sm" variant="ghost" onClick={() => setParts([...parts, { description: '', qty: 1, unit_price: '' }])} />
            {stock?.filter((a) => a.qty > 0).slice(0, 8).map((a) => (
              <button key={a.id} type="button" onClick={() => setParts([...parts, { description: a.name, accessory_id: a.id, qty: 1, unit_price: a.price }])} className="tap rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">+ {a.name} ({a.qty})</button>
            ))}
          </div>
          <BiInput label="repair.labour" type="number" inputMode="decimal" min={0} value={labour} onChange={(e) => setLabour(e.target.value)} />
          <KV k="common.total" v={<MoneyText value={draftTotal} tone="ink" size="lg" />} />
          <ErrorText error={partsM.error ?? labourM.error} />
          <BiButton text="common.save" full loading={partsM.isPending || labourM.isPending} onClick={async () => { await partsM.mutateAsync(parts.filter((p) => p.description).map((p) => ({ description: p.description, accessory_id: p.accessory_id ?? null, qty: p.qty, unit_price: Number(p.unit_price || 0) }))); await labourM.mutateAsync({ labour: Number(labour || 0) }); setSheet(null) }} />
        </div>
      </Sheet>

      <Sheet open={sheet === 'deliver'} onClose={() => setSheet(null)} title="repair.deliver">
        <div className="flex flex-col gap-3">
          <div className="card">
            <KV k="common.total" v={<MoneyText value={j.total} tone="ink" size="lg" />} />
            <KV k="repair.advance" v={<MoneyText value={j.advance} tone="ink" />} />
          </div>
          {j.party_id ? <BiInput label="sale.paidNow" type="number" inputMode="decimal" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} /> : <BiInput label="repair.outsideCost" type="number" inputMode="decimal" min={0} value={outsideCost} onChange={(e) => setOutsideCost(e.target.value)} />}
          <BiInput label="repair.warrantyDays" type="number" inputMode="numeric" min={0} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          <ErrorText error={deliverM.error} />
          <BiButton text="repair.deliver" full loading={deliverM.isPending} onClick={async () => { await deliverM.mutateAsync({ paid: Number(paid || 0), warranty_days: warranty ? Number(warranty) : undefined, outside_cost: outsideCost ? Number(outsideCost) : undefined }); setSheet(null) }} />
        </div>
      </Sheet>
    </div>
  )
}
