import { Check, ShieldCheck, Store, Trash2, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { Chip, ErrorText, KV, MoneyText, PageHeader, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useCashAccounts, useDocMutation } from '@/lib/queries'
import type { Party, Purchase } from '@/lib/types'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from './DeviceLineSheet'

type Kind = 'supplier' | 'walk_in' | 'shop' | 'trade_in'
interface Misc {
  key: string
  description: string
  qty: string
  unit_cost: string
}

export default function PurchaseWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick } = useLang()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<Kind>(params.get('imei') ? 'walk_in' : 'supplier')
  const [chosen, setChosen] = useState(!!params.get('imei'))
  const [skipped, setSkipped] = useState<Record<string, boolean>>({})
  const role = useAuth((s) => s.me?.user.role)
  const canSkip = role === 'owner' || role === 'manager'
  const [party, setParty] = useState<Party | null>(null)
  const [devices, setDevices] = useState<DeviceLineDraft[]>([])
  const [misc, setMisc] = useState<Misc[]>([])
  const [editing, setEditing] = useState<DeviceLineDraft | null>(null)
  const [discount, setDiscount] = useState('')
  const [paid, setPaid] = useState('')
  const [accountId, setAccountId] = useState('')
  const [reference, setReference] = useState('')
  const [result, setResult] = useState<Purchase | null>(null)
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, Purchase>('POST', () => '/api/v1/purchases')

  const subtotal = devices.reduce((s, d) => s + Number(d.cost || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_cost || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const partyKind = kind === 'supplier' ? 'supplier' : kind === 'shop' ? 'shop' : 'customer'

  async function submit() {
    const res = await m.mutateAsync({
      kind,
      party_id: party!.id,
      devices: devices.map(draftToApi),
      misc: misc.filter((x) => x.description).map((x) => ({ description: x.description, qty: Number(x.qty || 1), unit_cost: Number(x.unit_cost || 0) })),
      discount: Number(discount || 0),
      paid: Number(paid || 0),
      cash_account_id: accountId || undefined,
      reference: reference || undefined,
    })
    setResult(res)
    setStep(3)
  }

  const steps = ['purchase.steps.from', 'purchase.steps.devices', 'purchase.steps.payment', 'purchase.steps.done']

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="purchase.title" />
      <Stepper steps={steps} current={step} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <BiLabel text="purchase.chooseTitle" size="lg" bold />
          <SourceCard
            active={chosen && kind === 'supplier'}
            icon={<Store size={26} />}
            title="purchase.fromDealer"
            hint="purchase.fromDealerHint"
            onClick={() => { if (kind !== 'supplier') setParty(null); setKind('supplier'); setChosen(true) }}
          />
          <SourceCard
            active={chosen && kind === 'walk_in'}
            icon={<UserRound size={26} />}
            title="purchase.fromCustomer"
            hint="purchase.fromCustomerHint"
            onClick={() => { if (kind !== 'walk_in') setParty(null); setKind('walk_in'); setChosen(true) }}
          />
          {chosen ? (
            <>
              <PartyPicker value={party} onChange={setParty} kind={partyKind} label={kind === 'supplier' ? 'purchase.selectDealer' : 'purchase.selectSeller'} />
              <BiButton text="common.next" full disabled={!party} onClick={() => { setStep(1); if (!devices.length && params.get('imei')) setEditing(emptyDraft(params.get('imei')!, kind)) }} />
            </>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {!devices.length ? <BiLabel text="purchase.noDevices" size="md" tone="text-muted" align="center" className="py-4" /> : null}
          {devices.map((d) => (
            <div key={d.key} className="card flex items-center gap-3">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(d)}>
                <div className="truncate font-semibold">
                  {d.brand_name} {d.model_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span dir="ltr">{d.imei1}</span>
                  <Chip text={`stock.condition.${d.condition}`} />
                  {d.pta_status !== 'pta_approved' ? <Chip text={`stock.pta.${d.pta_status}`} tone="warn" /> : null}
                </div>
              </button>
              <MoneyText value={d.cost} tone="ink" />
              <button type="button" aria-label={pick('purchase.remove')} onClick={() => setDevices(devices.filter((x) => x.key !== d.key))} className="well tap h-9 w-9 text-payable">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <BiButton text="purchase.addDevice" variant="secondary" full onClick={() => setEditing(emptyDraft('', kind))} />

          {kind === 'supplier' ? (
            <>
          <BiLabel text="purchase.misc" size="md" tone="text-muted" className="mt-2" />
          {misc.map((x) => (
            <div key={x.key} className="grid grid-cols-[1fr_64px_96px_36px] items-end gap-2">
              <BiInput label="purchase.miscDesc" value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
              <BiInput label="purchase.qty" type="number" inputMode="numeric" min={1} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
              <BiInput label="purchase.unitCost" type="number" inputMode="decimal" min={0} value={x.unit_cost} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_cost: e.target.value } : y)))} />
              <button type="button" aria-label={pick('purchase.remove')} onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="well tap mb-1 h-9 w-9 text-payable">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <BiButton text="common.add" variant="ghost" size="md" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_cost: '' }])} />

            </>
          ) : null}

          <div className="card flex items-center justify-between">
            <BiLabel text="common.total" size="md" tone="text-muted" />
            <MoneyText value={subtotal} tone="ink" size="lg" />
          </div>
          <BiButton text="common.next" full disabled={!devices.length && !misc.some((x) => x.description)} onClick={() => setStep(2)} />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <div className="card">
            <KV k="common.total" v={<MoneyText value={subtotal} tone="ink" />} />
            {party ? <KV k="party.balance" v={<MoneyText value={party.balance} />} /> : null}
          </div>
          <BiInput label="common.discount" type="number" inputMode="decimal" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <BiInput label="common.paid" type="number" inputMode="decimal" min={0} max={total} value={paid} onChange={(e) => setPaid(e.target.value)} />
          {accounts && accounts.length > 1 ? (
            <div>
              <BiLabel text="purchase.cashAccount" size="md" tone="text-muted" className="mb-1.5" />
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 font-semibold">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === 'supplier' ? <BiInput label="purchase.reference" value={reference} onChange={(e) => setReference(e.target.value)} /> : null}
          <div className="hero flex flex-col gap-1 p-4">
            <KV k="common.total" v={<MoneyText value={total} tone="ink" />} />
            <KV k="common.paid" v={<MoneyText value={Number(paid || 0)} tone="ink" />} />
            <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-2">
              <BiLabel text="common.due" size="md" tone="text-gold-text" bold />
              <span className="num text-2xl text-gold-text" dir="ltr">
                {(total - Number(paid || 0)).toLocaleString('en-US')}
              </span>
            </div>
          </div>
          <ErrorText error={m.error} />
          <BiButton text="common.confirm" full loading={m.isPending} onClick={submit} />
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col gap-3">
          <div className="hero flex flex-col items-center gap-1 p-5">
            <BiLabel text="purchase.created" size="lg" bold tone="text-gold-text" />
            <div className="num text-xl" dir="ltr">
              {result.no}
            </div>
            <MoneyText value={result.total} tone="ink" size="lg" />
          </div>
          {kind !== 'supplier' && result.lines.some((l) => l.device_id) ? (
            <div className="rounded-2xl border border-gold/40 bg-gold-tint/40 px-4 py-3">
              <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-gold-text" /><BiLabel text="purchase.verifyTitle" size="md" bold /></div>
              <BiLabel text="purchase.verifyHint" size="sm" tone="text-muted" className="mt-1" />
            </div>
          ) : null}
          {result.lines.filter((l) => l.device_id).map((l) => {
            const needsCheck = kind !== 'supplier' || devices.find((d) => d.imei1 === l.imei1)?.condition !== 'box_pack'
            return (
              <div key={l.id} className="card flex flex-col gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{l.device_label}</div>
                  <div className="text-xs text-muted" dir="ltr">{l.imei1}</div>
                </div>
                {needsCheck && skipped[l.device_id!] ? (
                  <div className="flex items-center gap-1.5 text-emerald-deep"><Check size={16} /><BiLabel text="purchase.skipped" size="sm" tone="text-emerald-deep" bold /></div>
                ) : needsCheck ? (
                  <div className="flex flex-wrap gap-2">
                    <BiButton text="purchase.verifyNow" size="sm" variant="gold" onClick={() => nav(`/stock/${l.device_id}/verify`)} />
                    {canSkip ? (
                      <BiButton
                        text="purchase.skipKnown"
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await api('POST', `/api/v1/devices/${l.device_id}/verification/override`, { reason: pick('purchase.skipReason') })
                          setSkipped((x) => ({ ...x, [l.device_id!]: true }))
                        }}
                      />
                    ) : null}
                    <BiButton text="common.print" size="sm" variant="ghost" onClick={() => openPrintable(`/api/v1/devices/${l.device_id}/verification/declaration`)} />
                  </div>
                ) : null}
              </div>
            )
          })}
          <BiButton text="nav.stock" full variant="secondary" onClick={() => nav('/stock')} />
        </div>
      ) : null}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="purchase.addDevice">
        {editing ? (
          <DeviceLineSheet
            key={editing.key}
            initial={editing}
            onSave={(d) => {
              setDevices((xs) => (xs.some((x) => x.key === d.key) ? xs.map((x) => (x.key === d.key ? d : x)) : [...xs, d]))
              setEditing(null)
            }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

function SourceCard({ active, icon, title, hint, onClick }: { active: boolean; icon: ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap flex items-center gap-4 rounded-3xl border-2 px-4 py-4 text-start transition ${active ? 'border-emerald bg-emerald-tint/60' : 'border-line bg-surface'}`}
    >
      <span className={`well h-14 w-14 shrink-0 ${active ? 'bg-emerald text-white' : 'bg-emerald-tint text-emerald-deep'}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <BiLabel text={title} size="lg" bold />
        <BiLabel text={hint} size="sm" tone="text-muted" className="mt-1 leading-loose" />
      </span>
      {active ? <Check size={22} className="shrink-0 text-emerald-deep" /> : null}
    </button>
  )
}
