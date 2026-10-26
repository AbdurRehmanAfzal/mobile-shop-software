/** Sale in three steps (docs/11 v2): which phone → how much and how paid (cash / an account / udhaar)
 *  → done. Customer is asked only for udhaar; discount, warranty and box/charger sit behind
 *  "more options" so the everyday sale stays three taps. */

import { Banknote, BookOpen, Check, FileText, Headphones, Plus, Printer, Receipt, SlidersHorizontal, Smartphone, Trash2, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { BtnText, Chip, ErrorText, IconChip, List, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { ApiError, get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useCashAccounts, useDevices, useDocMutation } from '@/lib/queries'
import type { Device, Invoice, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'

interface Line {
  device: Device
  price: string
  warranty_days: string
  given: string[]
  pending: { kind: string; promised_at: string }[]
}
interface Misc {
  key: string
  description: string
  qty: string
  unit_price: string
}
/** an account id, or udhaar */
type Pay = { kind: 'account'; id: string } | { kind: 'udhaar' }
const ACC = ['box', 'charger', 'cable', 'earphones', 'airpods'] as const
const newLine = (d: Device): Line => ({ device: d, price: d.asking_price ? String(Number(d.asking_price)) : '', warranty_days: '0', given: [], pending: [] })

export default function SaleWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const [step, setStep] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [misc, setMisc] = useState<Misc[]>([])
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Line | null>(null)
  const [more, setMore] = useState(false)
  const [q, setQ] = useState('')
  const [discount, setDiscount] = useState('')
  const [pay, setPay] = useState<Pay | null>(null)
  const [party, setParty] = useState<Party | null>(null)
  const [paidNow, setPaidNow] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [result, setResult] = useState<Invoice | null>(null)
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined })
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, Invoice>('POST', () => '/api/v1/sales')

  useEffect(() => {
    const id = params.get('device')
    if (id && !lines.length)
      get<Device>(`/api/v1/devices/${id}`).then((d) => { setLines([newLine(d)]); setStep(1) }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // default: money into the shop's main cash account
  useEffect(() => {
    if (!pay && accounts?.length) setPay({ kind: 'account', id: (accounts.find((a) => a.is_default) ?? accounts[0]).id })
  }, [accounts, pay])

  const subtotal = lines.reduce((s, l) => s + Number(l.price || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const udhaar = pay?.kind === 'udhaar'
  const paid = udhaar ? Math.min(Number(paidNow || 0), total) : total
  const needsOverride = lines.some((l) => l.device.verification_status === 'pending' || l.device.verification_status === 'flagged')
  const notSellableErr = m.error instanceof ApiError && (m.error.code === 'not_sellable' || m.error.code === 'device_flagged')
  const cashId = accounts?.find((a) => a.is_default)?.id ?? accounts?.[0]?.id
  const canSave = total > 0 && !!pay && (!udhaar || !!party) && lines.every((l) => Number(l.price) > 0) && misc.every((x) => x.description.trim() && Number(x.unit_price) > 0)

  function pickDevice(d: Device) {
    setLines((ls) => (ls.some((l) => l.device.id === d.id) ? ls : [...ls, newLine(d)]))
    setPicking(false)
    setStep(1)
  }

  async function submit() {
    const res = await m.mutateAsync({
      party_id: party?.id ?? null,
      devices: lines.map((l) => ({ device_id: l.device.id, price: Number(l.price || 0), warranty_days: Number(l.warranty_days || 0), accessories_given: l.given, accessories_pending: l.pending.map((p) => ({ kind: p.kind, promised_at: p.promised_at || null })) })),
      misc: misc.map((x) => ({ description: x.description.trim(), qty: Number(x.qty || 1), unit_price: Number(x.unit_price || 0) })),
      discount: Number(discount || 0),
      paid,
      cash_account_id: pay?.kind === 'account' ? pay.id : cashId,
      override_reason: overrideReason || undefined,
    })
    setResult(res)
    setStep(2)
  }

  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.sell" />
      <Stepper steps={['counter.whichPhone', 'counter.howMuch', 'counter.doneTitle']} current={step} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />
          <BiLabel text="counter.tapPhone" size="sm" tone="text-muted" />
          {stock?.length ? (
            <List>
              {stock.map((d) => <DeviceRow key={d.id} d={d} onClick={() => pickDevice(d)} />)}
            </List>
          ) : (
            <BiLabel text="counter.noStock" size="md" tone="text-muted" align="center" className="py-6" />
          )}
          <div>
            <IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => { setMisc([{ key: uid(), description: '', qty: '1', unit_price: '' }]); setStep(1) }} />
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.device.id} className="card flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-extrabold">{l.device.brand_name} {l.device.model_name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span dir="ltr">{l.device.imei1}</span>
                    {l.device.verification_status === 'pending' || l.device.verification_status === 'flagged' ? <Chip text={`stock.verification.${l.device.verification_status}`} tone={l.device.verification_status === 'flagged' ? 'bad' : 'warn'} /> : null}
                    {l.given.length ? <Chip text={{ en: l.given.join(', '), ur: l.given.map((g) => pick(`stock.acc.${g}`)).join('، ') }} tone="ok" /> : null}
                  </div>
                </div>
                <button type="button" aria-label={pick('crud.delete')} onClick={() => setLines(lines.filter((x) => x.device.id !== l.device.id))} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 text-payable">
                  <Trash2 size={16} />
                <BtnText k={'crud.delete'} /></button>
              </div>
              <BiInput label="counter.soldFor" type="number" inputMode="numeric" min={0} value={l.price} onChange={(e) => setLines(lines.map((x) => (x.device.id === l.device.id ? { ...x, price: e.target.value } : x)))} className="num text-2xl" />
              {more ? <div><IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreOptions" onClick={() => setEditing(l)} /></div> : null}
            </div>
          ))}
          {misc.map((x) => (
            <div key={x.key} className="card grid grid-cols-[1fr_64px_104px_auto] items-end gap-2">
              <BiInput label="counter.itemName" value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
              <BiInput label="purchase.qty" type="number" inputMode="numeric" min={1} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
              <BiInput label="sale.unitPrice" type="number" inputMode="numeric" min={0} value={x.unit_price} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_price: e.target.value } : y)))} />
              <button type="button" aria-label={pick('crud.delete')} onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="tap mb-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable">
                <Trash2 size={16} />
              <BtnText k={'crud.delete'} /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <IconChip icon={<Smartphone size={18} />} text="counter.addAnother" onClick={() => setPicking(true)} />
            <IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_price: '' }])} />
            {!more ? <IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreOptions" onClick={() => setMore(true)} /> : null}
          </div>
          {more ? <BiInput label="common.discount" type="number" inputMode="numeric" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /> : null}

          <BiLabel text="counter.howPaid" size="md" bold />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" aria-pressed={pay?.kind === 'account' && pay.id === cashId} onClick={() => cashId && setPay({ kind: 'account', id: cashId })} className={chip(pay?.kind === 'account' && pay.id === cashId)}><Banknote size={22} />{pick('counter.cash')}</button>
            {accounts?.filter((a) => a.id !== cashId).map((a) => (
              <button key={a.id} type="button" aria-pressed={pay?.kind === 'account' && pay.id === a.id} onClick={() => setPay({ kind: 'account', id: a.id })} className={chip(pay?.kind === 'account' && pay.id === a.id)}>
                <Wallet size={22} />
                <span className="block max-w-full truncate">{ur && a.name_ur ? a.name_ur : a.name}</span>
              </button>
            ))}
            <button type="button" aria-pressed={udhaar} onClick={() => setPay({ kind: 'udhaar' })} className={chip(udhaar)}><BookOpen size={22} />{pick('counter.udhaar')}</button>
          </div>

          {udhaar ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-khata p-3 text-khata-fg">
              <PartyPicker value={party} onChange={setParty} kind="customer" label="counter.whoTakes" />
              <BiInput label="counter.paidNowOpt" type="number" inputMode="numeric" min={0} max={total} value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            </div>
          ) : more ? (
            <PartyPicker value={party} onChange={setParty} kind="customer" label="counter.customerOpt" allowNone />
          ) : null}

          {needsOverride && (role === 'owner' || role === 'manager') ? <BiInput label="sale.override" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /> : null}

          <div className="hero flex flex-col gap-1 px-5 py-4">
            <div className="flex items-center justify-between">
              <BiLabel text="common.total" size="md" tone="text-hero-text" bold />
              <span className="num text-3xl" dir="ltr">Rs. {total.toLocaleString('en-US')}</span>
            </div>
            {udhaar ? (
              <div className="flex items-center justify-between border-t border-white/15 pt-1.5">
                <BiLabel text="counter.remaining" size="sm" tone="text-gold-text" bold />
                <span className="num text-xl text-gold-text" dir="ltr">{(total - paid).toLocaleString('en-US')}</span>
              </div>
            ) : null}
          </div>
          {notSellableErr ? <Chip text="sale.notSellable" tone="bad" /> : null}
          <ErrorText error={m.error} />
          <BiButton text="sale.complete" icon={<Check size={22} />} full loading={m.isPending} disabled={!canSave} onClick={submit} />
          {!lines.length && !misc.length ? <BiButton text="counter.whichPhone" variant="secondary" full onClick={() => setStep(0)} /> : null}
        </div>
      ) : null}

      {step === 2 && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-sell px-5 py-7 text-sell-fg">
            <span className="well mb-1 h-16 w-16 rounded-full bg-emerald text-white"><Check size={34} strokeWidth={2.6} /></span>
            <BiLabel text="sale.created" size="lg" bold tone="text-current" align="center" />
            <span className="num text-[34px]" dir="ltr">Rs. {Number(result.total).toLocaleString('en-US')}</span>
            <span className="num text-sm opacity-80" dir="ltr">{result.no}</span>
            {result.party_balance_after && Number(result.party_balance_after) !== 0 ? (
              <span className={ur ? cls('sm') : 'text-sm font-semibold'}>{pick('party.balance')}: <span className="num" dir="ltr">{Number(result.party_balance_after).toLocaleString('en-US')}</span></span>
            ) : null}
          </div>
          <BiButton text="sale.printThermal" icon={<Printer size={22} />} full onClick={() => openPrintable(`/api/v1/sales/${result.id}/receipt?format=thermal`)} />
          <BiButton text="sale.printA4" icon={<FileText size={22} />} full variant="secondary" onClick={() => openPrintable(`/api/v1/sales/${result.id}/receipt?format=a4`)} />
          <BiButton text="counter.newSale" icon={<Plus size={22} />} full variant="ghost" onClick={() => { setLines([]); setMisc([]); setParty(null); setPaidNow(''); setDiscount(''); setResult(null); setPay(null); setStep(0); m.reset() }} />
          <BiButton text="sale.viewSale" icon={<Receipt size={22} />} full variant="ghost" onClick={() => nav(`/sales/${result.id}`)} />
        </div>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="counter.whichPhone">
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />
          <List>
            {stock?.filter((d) => !lines.some((l) => l.device.id === d.id)).map((d) => <DeviceRow key={d.id} d={d} onClick={() => pickDevice(d)} />)}
          </List>
        </div>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? { en: `${editing.device.brand_name} ${editing.device.model_name}`, ur: `${editing.device.brand_name} ${editing.device.model_name}` } : ''}>
        {editing ? (
          <LineEditor
            line={editing}
            onSave={(l) => {
              setLines(lines.map((x) => (x.device.id === l.device.id ? l : x)))
              setEditing(null)
            }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

function LineEditor({ line, onSave }: { line: Line; onSave: (l: Line) => void }) {
  const { pick } = useLang()
  const [l, setL] = useState<Line>(line)
  const toggleGiven = (k: string) => setL({ ...l, given: l.given.includes(k) ? l.given.filter((x) => x !== k) : [...l.given, k], pending: l.pending.filter((p) => p.kind !== k) })
  const togglePending = (k: string) => setL({ ...l, pending: l.pending.some((p) => p.kind === k) ? l.pending.filter((p) => p.kind !== k) : [...l.pending, { kind: k, promised_at: '' }], given: l.given.filter((x) => x !== k) })
  return (
    <div className="flex flex-col gap-3">
      <BiInput label="sale.warrantyDays" type="number" inputMode="numeric" min={0} value={l.warranty_days} onChange={(e) => setL({ ...l, warranty_days: e.target.value })} />
      <BiLabel text="stock.accessories" size="md" tone="text-muted" />
      <div className="card flex flex-col divide-y divide-line p-0">
        {ACC.map((k) => {
          const given = l.given.includes(k)
          const pend = l.pending.find((p) => p.kind === k)
          return (
            <div key={k} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-semibold">{pick(`stock.acc.${k}`)}</span>
                <button type="button" onClick={() => toggleGiven(k)} className={`tap rounded-full px-3 py-1 text-xs font-bold ${given ? 'bg-emerald-tint text-emerald-deep' : 'border border-line text-muted'}`}>
                  {pick('stock.accGiven')}
                </button>
                <button type="button" onClick={() => togglePending(k)} className={`tap rounded-full px-3 py-1 text-xs font-bold ${pend ? 'bg-receivable-tint text-receivable' : 'border border-line text-muted'}`}>
                  {pick('stock.accPendingShop')}
                </button>
              </div>
              {pend ? <input type="date" value={pend.promised_at} onChange={(e) => setL({ ...l, pending: l.pending.map((p) => (p.kind === k ? { ...p, promised_at: e.target.value } : p)) })} className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm" /> : null}
            </div>
          )
        })}
      </div>
      <BiButton text="common.save" full onClick={() => onSave(l)} />
    </div>
  )
}
