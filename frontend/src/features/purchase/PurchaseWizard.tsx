import { Banknote, BookOpen, Check, Headphones, PackagePlus, Plus, Printer, ShieldCheck, SlidersHorizontal, Smartphone, Store, Trash2, UserCheck, UserRound, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { Chip, ErrorText, IconChip, MoneyText, PageHeader, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { api } from '@/lib/api'
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
  const { pick, ur, cls } = useLang()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<Kind>(params.get('imei') ? 'walk_in' : 'supplier')
  const [chosen, setChosen] = useState(!!params.get('imei'))
  const [skipped, setSkipped] = useState<Record<string, boolean>>({})
  const [party, setParty] = useState<Party | null>(null)
  const [devices, setDevices] = useState<DeviceLineDraft[]>([])
  const [misc, setMisc] = useState<Misc[]>([])
  const [editing, setEditing] = useState<DeviceLineDraft | null>(null)
  const [discount, setDiscount] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [pay, setPay] = useState<string>('') // cash account id, or 'udhaar'
  const [more, setMore] = useState(false)
  const [skipCheck, setSkipCheck] = useState(false)
  const [reference, setReference] = useState('')
  const [earlier, setEarlier] = useState(false)
  const [when, setWhen] = useState(localNow())
  const [result, setResult] = useState<Purchase | null>(null)
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, Purchase>('POST', () => '/api/v1/purchases')

  const subtotal = devices.reduce((s, d) => s + Number(d.cost || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_cost || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const cashId = accounts?.find((a) => a.is_default)?.id ?? accounts?.[0]?.id ?? ''
  const payWith = pay || cashId
  const udhaar = payWith === 'udhaar'
  const paid = udhaar ? Math.min(Number(paidNow || 0), total) : total
  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`
  const partyKind = kind === 'supplier' ? 'supplier' : kind === 'shop' ? 'shop' : 'customer'

  async function submit() {
    const res = await m.mutateAsync({
      kind,
      party_id: party!.id,
      devices: devices.map(draftToApi),
      misc: misc.filter((x) => x.description).map((x) => ({ description: x.description, qty: Number(x.qty || 1), unit_cost: Number(x.unit_cost || 0) })),
      discount: Number(discount || 0),
      paid,
      cash_account_id: (udhaar ? cashId : payWith) || undefined,
      reference: reference || undefined,
      purchased_at: earlier && when ? new Date(when).toISOString() : undefined,
    })
    if (skipCheck && kind !== 'supplier') {
      // "I know this person": mark each phone checked now; the skip and who did it go into its history
      const done: Record<string, boolean> = {}
      for (const l of res.lines.filter((x) => x.device_id)) {
        await api('POST', `/api/v1/devices/${l.device_id}/verification/override`, { reason: pick('purchase.skipReason') })
        done[l.device_id!] = true
      }
      setSkipped(done)
    }
    setResult(res)
    setStep(2)
  }

  const steps = ['counter.fromWhom', 'counter.phoneAndCost', 'counter.doneTitle']

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.addStock" />
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
          <BiButton text="purchase.addDevice" icon={<Plus size={22} />} variant="secondary" full onClick={() => setEditing(emptyDraft('', kind))} />

          {kind === 'supplier' ? (
            <>
              {misc.map((x) => (
                <div key={x.key} className="card grid grid-cols-[1fr_64px_96px_36px] items-end gap-2">
                  <BiInput label="purchase.miscDesc" value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
                  <BiInput label="purchase.qty" type="number" inputMode="numeric" min={1} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
                  <BiInput label="purchase.unitCost" type="number" inputMode="numeric" min={0} value={x.unit_cost} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_cost: e.target.value } : y)))} />
                  <button type="button" aria-label={pick('purchase.remove')} onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="well tap mb-2 h-9 w-9 text-payable">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div><IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_cost: '' }])} /></div>
            </>
          ) : null}

          {devices.length || misc.some((x) => x.description) ? (
            <>
              <BiLabel text="counter.paidHowBuy" size="md" bold />
              <div className="grid grid-cols-3 gap-2">
                {accounts?.map((a) => (
                  <button key={a.id} type="button" aria-pressed={payWith === a.id} onClick={() => setPay(a.id)} className={chip(payWith === a.id)}>
                    {a.id === cashId ? <Banknote size={22} /> : <Wallet size={22} />}
                    <span className="block max-w-full truncate">{a.id === cashId ? pick('counter.cash') : ur && a.name_ur ? a.name_ur : a.name}</span>
                  </button>
                ))}
                <button type="button" aria-pressed={udhaar} onClick={() => setPay('udhaar')} className={chip(udhaar)}><BookOpen size={22} />{pick('counter.udhaar')}</button>
              </div>
              {kind !== 'supplier' ? (
                <>
                  <BiLabel text="counter.idCheck" size="md" bold />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={!skipCheck} onClick={() => setSkipCheck(false)} className={chip(!skipCheck)}><ShieldCheck size={22} />{pick('counter.checkLater')}</button>
                    <button type="button" aria-pressed={skipCheck} onClick={() => setSkipCheck(true)} className={chip(skipCheck)}><UserCheck size={22} />{pick('counter.skipCheck')}</button>
                  </div>
                </>
              ) : null}
              {udhaar ? <BiInput label="counter.paidNowBuy" type="number" inputMode="numeric" min={0} max={total} value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /> : null}

              <div className="card flex flex-col gap-2">
                <BiLabel text="purchase.when" size="md" tone="text-muted" />
                <BiSegmented<'now' | 'earlier'>
                  value={earlier ? 'earlier' : 'now'}
                  onChange={(v) => { setEarlier(v === 'earlier'); if (v === 'earlier') setWhen(localNow()) }}
                  options={[{ value: 'now', text: 'purchase.whenNow' }, { value: 'earlier', text: 'purchase.whenEarlier' }]}
                />
                {earlier ? (
                  <input type="datetime-local" aria-label={pick('purchase.when')} value={when} max={localNow()} onChange={(e) => setWhen(e.target.value)} dir="ltr" className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3 font-semibold" />
                ) : null}
              </div>

              {more ? (
                <>
                  <BiInput label="common.discount" type="number" inputMode="numeric" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  {kind === 'supplier' ? <BiInput label="purchase.reference" value={reference} onChange={(e) => setReference(e.target.value)} /> : null}
                </>
              ) : (
                <div><IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreBuyOptions" onClick={() => setMore(true)} /></div>
              )}

              <div className="hero flex flex-col gap-1 px-5 py-4">
                <div className="flex items-center justify-between">
                  <BiLabel text="common.total" size="md" tone="text-hero-text" bold />
                  <span className="num text-3xl" dir="ltr">Rs. {total.toLocaleString('en-US')}</span>
                </div>
                {udhaar ? (
                  <div className="flex items-center justify-between border-t border-white/15 pt-1.5">
                    <BiLabel text="counter.stillToGive" size="sm" tone="text-gold-text" bold />
                    <span className="num text-xl text-gold-text" dir="ltr">{(total - paid).toLocaleString('en-US')}</span>
                  </div>
                ) : null}
              </div>
              <ErrorText error={m.error} />
              <BiButton text="counter.putInStock" icon={<PackagePlus size={22} />} full loading={m.isPending} disabled={(earlier && !when) || total <= 0} onClick={submit} />
            </>
          ) : null}
        </div>
      ) : null}

      {step === 2 && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-buy px-5 py-7 text-buy-fg">
            <span className="well mb-1 h-16 w-16 rounded-full bg-ink text-ground"><Check size={34} strokeWidth={2.6} /></span>
            <BiLabel text="purchase.created" size="lg" bold tone="text-current" align="center" />
            <span className="num text-[34px]" dir="ltr">Rs. {Number(result.total).toLocaleString('en-US')}</span>
            <span className="num text-sm opacity-80" dir="ltr">{result.no}</span>
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
                    <BiButton text="purchase.verifyNow" icon={<ShieldCheck size={18} />} size="sm" variant="gold" onClick={() => nav(`/stock/${l.device_id}/verify`)} />
                    <BiButton
                      text="purchase.skipKnown"
                      icon={<UserCheck size={18} />}
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await api('POST', `/api/v1/devices/${l.device_id}/verification/override`, { reason: pick('purchase.skipReason') })
                        setSkipped((x) => ({ ...x, [l.device_id!]: true }))
                      }}
                    />
                    <BiButton text="common.print" icon={<Printer size={18} />} size="sm" variant="ghost" onClick={() => openPrintable(`/api/v1/devices/${l.device_id}/verification/declaration`)} />
                  </div>
                ) : null}
              </div>
            )
          })}
          <BiButton text="nav.stock" icon={<Smartphone size={22} />} full variant="secondary" onClick={() => nav('/stock')} />
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
      className={`tap flex items-center gap-4 rounded-3xl border-2 px-4 py-4 text-start transition ${active ? 'border-buy-fg bg-buy text-buy-fg' : 'border-line bg-surface'}`}
    >
      <span className={`well h-14 w-14 shrink-0 ${active ? 'bg-buy-fg text-white' : 'bg-buy text-buy-fg'}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <BiLabel text={title} size="lg" bold />
        <BiLabel text={hint} size="sm" tone="text-muted" className="mt-1 leading-loose" />
      </span>
      {active ? <Check size={22} className="shrink-0" /> : null}
    </button>
  )
}

/** Current local time as a datetime-local value: "2026-10-22T18:05". */
function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
