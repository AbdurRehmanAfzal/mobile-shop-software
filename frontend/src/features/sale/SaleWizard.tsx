import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { Chip, ErrorText, KV, List, MoneyText, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
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
const ACC = ['box', 'charger', 'cable', 'earphones', 'airpods'] as const

export default function SaleWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const [step, setStep] = useState(0)
  const [party, setParty] = useState<Party | null>(null)
  const [cashCustomer, setCashCustomer] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [misc, setMisc] = useState<Misc[]>([])
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Line | null>(null)
  const [q, setQ] = useState('')
  const [discount, setDiscount] = useState('')
  const [paid, setPaid] = useState('')
  const [accountId, setAccountId] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [result, setResult] = useState<Invoice | null>(null)
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined })
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, Invoice>('POST', () => '/api/v1/sales')

  useEffect(() => {
    const id = params.get('device')
    if (id && !lines.length) get<Device>(`/api/v1/devices/${id}`).then((d) => setLines([{ device: d, price: d.asking_price ?? '', warranty_days: '0', given: [], pending: [] }])).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = lines.reduce((s, l) => s + Number(l.price || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const needsOverride = lines.some((l) => l.device.verification_status === 'pending' || l.device.verification_status === 'flagged')
  const notSellableErr = m.error instanceof ApiError && (m.error.code === 'not_sellable' || m.error.code === 'device_flagged')

  async function submit() {
    const res = await m.mutateAsync({
      party_id: cashCustomer ? null : party?.id,
      devices: lines.map((l) => ({ device_id: l.device.id, price: Number(l.price || 0), warranty_days: Number(l.warranty_days || 0), accessories_given: l.given, accessories_pending: l.pending.map((p) => ({ kind: p.kind, promised_at: p.promised_at || null })) })),
      misc: misc.filter((x) => x.description).map((x) => ({ description: x.description, qty: Number(x.qty || 1), unit_price: Number(x.unit_price || 0) })),
      discount: Number(discount || 0),
      paid: Number(paid || 0),
      cash_account_id: accountId || undefined,
      override_reason: overrideReason || undefined,
    })
    setResult(res)
    setStep(3)
  }

  const steps = ['sale.steps.customer', 'sale.steps.items', 'sale.steps.payment', 'sale.steps.done']
  const canNext0 = cashCustomer || !!party

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="sale.title" />
      <Stepper steps={steps} current={step} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          {cashCustomer ? (
            <div className="card flex items-center justify-between">
              <BiLabel text="sale.cashCustomer" size="md" bold />
              <BiButton text="common.edit" size="sm" variant="ghost" onClick={() => setCashCustomer(false)} />
            </div>
          ) : (
            <PartyPicker value={party} onChange={(p) => { setParty(p); if (!p) setCashCustomer(true) }} kind="customer" label="sale.selectCustomer" allowNone />
          )}
          <BiButton text="common.next" full disabled={!canNext0} onClick={() => setStep(1)} />
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {!lines.length && !misc.length ? <BiLabel text="sale.noItems" size="md" tone="text-muted" align="center" className="py-4" /> : null}
          {lines.map((l) => (
            <div key={l.device.id} className="card flex items-center gap-3">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(l)}>
                <div className="truncate font-semibold">
                  {l.device.brand_name} {l.device.model_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span dir="ltr">{l.device.imei1}</span>
                  {l.device.verification_status === 'pending' || l.device.verification_status === 'flagged' ? <Chip text={`stock.verification.${l.device.verification_status}`} tone={l.device.verification_status === 'flagged' ? 'bad' : 'warn'} /> : null}
                  {l.given.length ? <Chip text={{ en: l.given.join(', '), ur: l.given.map((g) => pick(`stock.acc.${g}`)).join('، ') }} tone="ok" /> : null}
                  {l.pending.length ? <Chip text={{ en: `pending: ${l.pending.map((p) => p.kind).join(', ')}`, ur: `باقی: ${l.pending.map((p) => pick(`stock.acc.${p.kind}`)).join('، ')}` }} tone="warn" /> : null}
                </div>
              </button>
              <MoneyText value={l.price} tone="ink" />
              <button type="button" aria-label="remove" onClick={() => setLines(lines.filter((x) => x.device.id !== l.device.id))} className="well tap h-9 w-9 text-payable">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <BiButton text="sale.pickDevice" variant="secondary" full onClick={() => setPicking(true)} />
          <BiLabel text="sale.misc" size="md" tone="text-muted" className="mt-2" />
          {misc.map((x) => (
            <div key={x.key} className="grid grid-cols-[1fr_64px_96px_36px] items-end gap-2">
              <BiInput label="purchase.miscDesc" value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
              <BiInput label="purchase.qty" type="number" inputMode="numeric" min={1} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
              <BiInput label="sale.unitPrice" type="number" inputMode="decimal" min={0} value={x.unit_price} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_price: e.target.value } : y)))} />
              <button type="button" aria-label="remove" onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="well tap mb-1 h-9 w-9 text-payable">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <BiButton text="common.add" variant="ghost" size="md" onClick={() => setMisc([...misc, { key: crypto.randomUUID(), description: '', qty: '1', unit_price: '' }])} />
          <div className="card flex items-center justify-between">
            <BiLabel text="common.total" size="md" tone="text-muted" />
            <MoneyText value={subtotal} tone="ink" size="lg" />
          </div>
          <BiButton text="common.next" full disabled={!lines.length && !misc.some((x) => x.description)} onClick={() => { if (cashCustomer) setPaid(String(total)); setStep(2) }} />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <div className="card">
            <KV k="common.total" v={<MoneyText value={subtotal} tone="ink" />} />
            {party ? <KV k="party.balance" v={<MoneyText value={party.balance} />} /> : null}
          </div>
          <BiInput label="common.discount" type="number" inputMode="decimal" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <BiInput label="sale.paidNow" type="number" inputMode="decimal" min={0} max={total} value={paid} onChange={(e) => setPaid(e.target.value)} />
          {accounts && accounts.length > 1 ? (
            <div>
              <BiLabel text="sale.receivedIn" size="md" tone="text-muted" className="mb-1.5" />
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 font-semibold">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {needsOverride && (role === 'owner' || role === 'manager') ? <BiInput label="sale.override" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /> : null}
          <div className="hero flex flex-col gap-1 p-4">
            <KV k="common.total" v={<MoneyText value={total} tone="ink" />} />
            <KV k="sale.paidNow" v={<MoneyText value={Number(paid || 0)} tone="ink" />} />
            <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-2">
              <BiLabel text={party ? 'sale.newBalance' : 'common.due'} size="md" tone="text-gold-text" bold />
              <span className="num text-2xl text-gold-text" dir="ltr">
                {(Number(party?.balance ?? 0) + total - Number(paid || 0)).toLocaleString('en-US')}
              </span>
            </div>
          </div>
          {notSellableErr ? <Chip text="sale.notSellable" tone="bad" /> : null}
          <ErrorText error={m.error} />
          <BiButton text="sale.complete" full loading={m.isPending} onClick={submit} />
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col gap-3">
          <div className="hero flex flex-col items-center gap-1 p-5">
            <BiLabel text="sale.created" size="lg" bold tone="text-gold-text" />
            <div className="num text-xl" dir="ltr">
              {result.no}
            </div>
            <MoneyText value={result.total} tone="ink" size="lg" />
            {result.party_balance_after && Number(result.party_balance_after) !== 0 ? (
              <div className="text-sm text-hero-text/80">
                {pick('party.balance')}: <MoneyText value={result.party_balance_after} />
              </div>
            ) : null}
          </div>
          <BiButton text="sale.printThermal" full onClick={() => openPrintable(`/api/v1/sales/${result.id}/receipt?format=thermal`)} />
          <BiButton text="sale.printA4" full variant="secondary" onClick={() => openPrintable(`/api/v1/sales/${result.id}/receipt?format=a4`)} />
          <BiButton text="sale.viewSale" full variant="ghost" onClick={() => nav(`/sales/${result.id}`)} />
        </div>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="sale.pickDevice">
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />
          <List>
            {stock?.filter((d) => !lines.some((l) => l.device.id === d.id)).map((d) => (
              <DeviceRow key={d.id} d={d} onClick={() => { setLines([...lines, { device: d, price: d.asking_price ?? '', warranty_days: '0', given: [], pending: [] }]); setPicking(false) }} />
            ))}
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
      <BiInput label="sale.price" type="number" inputMode="decimal" min={0} value={l.price} onChange={(e) => setL({ ...l, price: e.target.value })} autoFocus />
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
