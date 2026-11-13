import { Check, Headphones, PackagePlus, Pencil, Plus, Printer, ShieldCheck, SlidersHorizontal, Smartphone, Store, Trash2, UserCheck, UserRound, Watch } from 'lucide-react'
import { faultText } from '@/features/stock/Faults'
import { useState, type ReactNode } from 'react'
import { clearDrafts, useDraft } from '@/lib/draft'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PayPicker, { PartPay, billPayReady, billPayment, newPay, type PayState } from '@/components/PayPicker'
import StockItemPicker from '@/components/StockItemPicker'
import PartyPicker from '@/components/PartyPicker'
import { BtnText, Chip, ErrorText, IconChip, MoneyText, PageHeader, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { useStepUrl } from '@/lib/steps'
import { api } from '@/lib/api'
import { openPrintable } from '@/lib/files'
import LabelSheet from '@/components/LabelSheet'
import { Tag } from 'lucide-react'
import { isQueued } from '@/lib/offline'
import { useColours, useDocMutation, useStorages } from '@/lib/queries'
import type { Party, Purchase } from '@/lib/types'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from './DeviceLineSheet'
import {withCur } from '@/lib/format'

type Kind = 'supplier' | 'walk_in' | 'shop' | 'trade_in'
interface Misc {
  key: string
  description: string
  qty: string
  unit_cost: string
  /** an accessory / watch from the shop's counted stock: its count goes up */
  accessory_id?: string
  /** owner addendum 5: bought by the dozen / box; `units` = pieces per unit for this item */
  unit?: string
  units?: Record<string, number>
}
const UNITS = ['piece', 'dozen', 'box', 'carton']
const per = (x: Misc) => (x.units ?? { piece: 1 })[x.unit ?? 'piece'] ?? 1

export default function PurchaseWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick, ur, cls } = useLang()
  const [step, setStepRaw] = useDraft('purchase.step', 0)
  const { go: setStep, back } = useStepUrl(step, setStepRaw, 2)
  // a scanned code nobody knows ("Add it"): an IMEI starts a walk-in line; any other code is kept as the maker's barcode
  const scanned = params.get('code') ?? ''
  const startImei = params.get('imei') ?? (/^\d{15}$/.test(scanned) ? scanned : '')
  const [kind, setKind] = useDraft<Kind>('purchase.kind', startImei ? 'walk_in' : 'supplier')
  const [chosen, setChosen] = useDraft('purchase.chosen', !!startImei)
  const [skipped, setSkipped] = useDraft<Record<string, boolean>>('purchase.skipped', {})
  const [labels, setLabels] = useState(false)
  const [party, setParty] = useDraft<Party | null>('purchase.party', null)
  const [devices, setDevices] = useDraft<DeviceLineDraft[]>('purchase.devices', [])
  const [misc, setMisc] = useDraft<Misc[]>('purchase.misc', [])
  const [pickingItem, setPickingItem] = useState(false)
  const [editing, setEditing] = useDraft<DeviceLineDraft | null>('purchase.editing', null)
  const [discount, setDiscount] = useDraft('purchase.discount', '')
  const [paidNow, setPaidNow] = useDraft('purchase.paidNow', '')
  const [dueDate, setDueDate] = useDraft('purchase.dueDate', '')
  const [pay, setPay] = useDraft<PayState>('purchase.payment', () => newPay())
  // on udhaar: how the part paid now was paid (cash / online / cheque)
  const [part, setPart] = useDraft<PayState>('purchase.partPay', () => newPay())
  const [more, setMore] = useDraft('purchase.more', false)
  const [skipCheck, setSkipCheck] = useDraft('purchase.skipCheck', false)
  const [reference, setReference] = useDraft('purchase.reference', '')
  const [supplierBill, setSupplierBill] = useDraft('purchase.supplierBill', '')
  const [extraCosts, setExtraCosts] = useDraft('purchase.extraCosts', '')
  const [extraNote, setExtraNote] = useDraft('purchase.extraNote', '')
  const [itemLabels, setItemLabels] = useState(false)
  const [earlier, setEarlier] = useDraft('purchase.earlier', false)
  const [when, setWhen] = useDraft('purchase.when', localNow())
  const [result, setResult] = useState<Purchase | null>(null)
  // owner 2026-11-09: everything is shown once more and ticked as right before it is saved
  const [reviewing, setReviewing] = useState(false)
  const [checked, setChecked] = useState(false)
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const m = useDocMutation<Record<string, unknown>, Purchase>('POST', () => '/api/v1/purchases', undefined, { kind: 'purchase', label: (b) => `${pick('counter.addStock')} · ${withCur(Number((b as { paid?: number }).paid ?? 0).toLocaleString('en-US'))}` })

  const subtotal = devices.reduce((s, d) => s + Number(d.cost || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_cost || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0)) + Number(extraCosts || 0)
  const udhaar = pay.method === 'udhaar'
  const paid = udhaar ? Math.min(Number(paidNow || 0), total) : total
  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`
  const partyKind = kind === 'supplier' ? 'supplier' : kind === 'shop' ? 'shop' : 'customer'

  async function submit() {
    const res = await m.mutateAsync({
      kind,
      party_id: party!.id,
      devices: devices.map(draftToApi),
      misc: misc.filter((x) => x.description).map((x) => ({ description: x.description, qty: Number(x.qty || 1), unit_cost: Number(x.unit_cost || 0), accessory_id: x.accessory_id, unit: x.unit ?? 'piece' })),
      discount: Number(discount || 0),
      supplier_invoice_no: kind === 'supplier' && supplierBill ? supplierBill : undefined,
      extra_costs: Number(extraCosts || 0),
      extra_costs_note: extraNote || undefined,
      paid,
      payment: billPayment(pay, part, paid),
      reference: reference || undefined,
      due_date: udhaar && dueDate ? dueDate : undefined,
      purchased_at: earlier && when ? new Date(when).toISOString() : undefined,
    })
    if (isQueued(res)) {
      // no internet: the purchase waits on the phone (the strip under the header says so)
      clearDrafts('purchase.')
      m.reset()
      nav('/')
      return
    }
    if (skipCheck && kind !== 'supplier') {
      // "I know this person": mark each phone checked now; the skip and who did it go into its history
      const done: Record<string, boolean> = {}
      for (const l of res.lines.filter((x) => x.device_id)) {
        await api('POST', `/api/v1/devices/${l.device_id}/verification/override`, { reason: pick('purchase.skipReason') })
        done[l.device_id!] = true
      }
      setSkipped(done)
    }
    clearDrafts('purchase.')
    setResult(res)
    setStep(2)
  }

  const steps = ['counter.fromWhom', 'counter.phoneAndCost', 'counter.doneTitle']

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.addStock" help={<Help term="purchase.page" />} onBack={back} />
      <Stepper steps={steps} current={step} onStep={step < 2 ? setStep : undefined} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="purchase.chooseTitle" size="lg" bold /><Help term="purchase.source" size="sm" /></span>
          <SourceCard
            help="purchase.fromDealer"
            active={chosen && kind === 'supplier'}
            icon={<Store size={26} />}
            title="purchase.fromDealer"
            hint="purchase.fromDealerHint"
            onClick={() => { if (kind !== 'supplier') setParty(null); setKind('supplier'); setChosen(true) }}
          />
          <SourceCard
            help="purchase.fromCustomer"
            active={chosen && kind === 'walk_in'}
            icon={<UserRound size={26} />}
            title="purchase.fromCustomer"
            hint="purchase.fromCustomerHint"
            onClick={() => { if (kind !== 'walk_in') setParty(null); setKind('walk_in'); setChosen(true) }}
          />
          {chosen ? (
            <>
              <div className="flex items-start gap-1"><div className="min-w-0 flex-1"><PartyPicker value={party} onChange={setParty} kind={partyKind} label={kind === 'supplier' ? 'purchase.selectDealer' : 'purchase.selectSeller'} /></div>{kind === 'supplier' ? <Help term="purchase.dealer" size="sm" /> : <Help term="purchase.seller" size="sm" />}</div>
              <BiButton text="common.next" full disabled={!party} onClick={() => { setStep(1); if (!devices.length && (startImei || scanned)) setEditing({ ...emptyDraft(startImei, kind), manufacturer_code: startImei ? '' : scanned }) }} />
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
              <button type="button" aria-label={pick('common.edit')} onClick={() => setEditing(d)} className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-emerald-deep" data-testid="device-edit">
                <Pencil size={16} />
              <BtnText k={'common.edit'} /></button>
              <button type="button" aria-label={pick('purchase.remove')} onClick={() => setDevices(devices.filter((x) => x.key !== d.key))} className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable">
                <Trash2 size={16} />
              <BtnText k={'purchase.remove'} /></button>
            </div>
          ))}
          <div className="flex items-center gap-1"><BiButton text="purchase.addDevice" icon={<Plus size={22} />} variant="secondary" className="flex-1" onClick={() => setEditing(emptyDraft('', kind))} /><Help term="purchase.lines" size="sm" /></div>

          <div className="flex items-center gap-1"><BiButton text="items.buyButton" icon={<Watch size={22} />} variant="secondary" className="flex-1" onClick={() => setPickingItem(true)} /><Help term="purchase.items" size="sm" /></div>
          {misc.length || kind === 'supplier' ? (
            <>
              {misc.map((x) => (
                <div key={x.key} className={`card grid items-end gap-2 ${x.accessory_id ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-[1fr_64px_96px_auto]'}`}>
                  {x.accessory_id ? (
                    <div className="col-span-3 flex min-w-0 flex-col gap-1.5">
                      <span className="text-base font-extrabold">{x.description}</span>
                      {/* dozen / box / carton: the count is kept in pieces, the cost typed is per unit */}
                      <div className="flex flex-wrap items-center gap-1" data-testid="unit-chips">
                        <Help term="purchase.packUnit" size="sm" />
                        {UNITS.filter((u) => u === 'piece' || (x.units ?? {})[u]).map((u) => (
                          <button key={u} type="button" aria-pressed={(x.unit ?? 'piece') === u} onClick={() => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit: u } : y)))} className={`tap h-8 rounded-full border-2 px-2.5 text-[12px] font-bold ${(x.unit ?? 'piece') === u ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{pick(`acc.units.${u}`)}{u !== 'piece' ? <span className="num" dir="ltr"> ×{(x.units ?? {})[u]}</span> : null}</button>
                        ))}
                      </div>
                      {per(x) > 1 ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} dir="ltr">= {Number(x.qty || 0) * per(x)} {pick('purchase.pieces')}{Number(x.unit_cost) > 0 ? ` · ${withCur((Number(x.unit_cost) / per(x)).toLocaleString('en-US', { maximumFractionDigits: 2 }))} ${pick('purchase.perPiece')}` : ''}</span> : null}
                    </div>
                  ) : (
                    <BiInput label="purchase.miscDesc" help={<Help term="purchase.miscItem" size="sm" />} value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
                  )}
                  <BiInput label="purchase.qty" help={<Help term="common.qty" size="sm" />} type="number" inputMode="numeric" min={1} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
                  <BiInput label="purchase.unitCost" help={<Help term="purchase.unitCost" size="sm" />} type="number" inputMode="numeric" min={0} value={x.unit_cost} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_cost: e.target.value } : y)))} />
                  <button type="button" aria-label={pick('purchase.remove')} onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="tap mb-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable">
                    <Trash2 size={16} />
                  <BtnText k={'purchase.remove'} /></button>
                </div>
              ))}
              {kind === 'supplier' ? <div><IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_cost: '' }])} /></div> : null}
            </>
          ) : null}

          {devices.length || misc.some((x) => x.description) ? (
            <>
              <div className="flex items-center gap-1"><BiLabel text="counter.paidHowBuy" size="md" bold /><Help term="purchase.paidHow" size="sm" /></div>
              <PayPicker value={pay} onChange={setPay} />
              {kind !== 'supplier' ? (
                <>
                  <span className="flex items-center gap-1"><BiLabel text="counter.idCheck" size="md" bold /><Help term="purchase.idCheck" size="sm" /></span>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={!skipCheck} onClick={() => setSkipCheck(false)} className={chip(!skipCheck)}><ShieldCheck size={22} />{pick('counter.checkLater')}</button>
                    <button type="button" aria-pressed={skipCheck} onClick={() => setSkipCheck(true)} className={chip(skipCheck)}><UserCheck size={22} />{pick('counter.skipCheck')}</button>
                  </div>
                </>
              ) : null}
              {udhaar ? <BiInput label="counter.paidNowBuy" help={<Help term="purchase.paidNow" size="sm" />} type="number" inputMode="numeric" min={0} max={total} value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /> : null}
              {udhaar ? <PartPay value={part} onChange={setPart} amount={paid} /> : null}
              {udhaar ? <BiInput label="counter.promiseDateBuy" help={<Help term="purchase.dueDate" size="sm" />} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} dir="ltr" hint="counter.promiseHint" /> : null}

              <div className="card flex flex-col gap-2">
                <span className="flex items-center gap-1"><BiLabel text="purchase.when" size="md" tone="text-muted" /><Help term="purchase.when" size="sm" /></span>
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
                  <BiInput label="common.discount" help={<Help term="purchase.discount" size="sm" />} type="number" inputMode="numeric" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  {kind === 'supplier' ? <BiInput label="purchase.reference" help={<Help term="purchase.reference" size="sm" />} value={reference} onChange={(e) => setReference(e.target.value)} /> : null}
                  {kind === 'supplier' ? <BiInput label="purchase.supplierInvoice" help={<Help term="purchase.supplierBill" size="sm" />} value={supplierBill} onChange={(e) => setSupplierBill(e.target.value)} dir="ltr" maxLength={40} /> : null}
                  {kind === 'supplier' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <BiInput label="purchase.extraCosts" help={<Help term="purchase.extraCosts" size="sm" />} type="number" inputMode="numeric" min={0} value={extraCosts} onChange={(e) => setExtraCosts(e.target.value)} className="num" hint="purchase.extraHint" />
                      <BiInput label="purchase.extraNote" help={<Help term="purchase.extraNote" size="sm" />} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} maxLength={120} />
                    </div>
                  ) : null}
                </>
              ) : (
                <div><IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreBuyOptions" onClick={() => setMore(true)} /></div>
              )}

              <div className="hero flex flex-col gap-1 px-5 py-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1"><BiLabel text="common.total" size="md" tone="text-hero-text" bold /><Help term="purchase.total" size="sm" /></span>
                  <span className="num text-3xl" dir="ltr">{withCur(total.toLocaleString('en-US'))}</span>
                </div>
                {udhaar ? (
                  <div className="flex items-center justify-between border-t border-white/15 pt-1.5">
                    <span className="flex items-center gap-1"><BiLabel text="counter.stillToGive" size="sm" tone="text-gold-text" bold /><Help term="purchase.stillToGive" size="sm" /></span>
                    <span className="num text-xl text-gold-text" dir="ltr">{(total - paid).toLocaleString('en-US')}</span>
                  </div>
                ) : null}
              </div>
              <ErrorText error={m.error} />
              <BiButton text="counter.putInStock" icon={<PackagePlus size={22} />} full loading={m.isPending} disabled={(earlier && !when) || total <= 0 || !billPayReady(pay, part, paid)} onClick={() => { setChecked(false); m.reset(); setReviewing(true) }} data-testid="purchase-review-open" />
            </>
          ) : null}
        </div>
      ) : null}

      {step === 2 && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-buy px-5 py-7 text-buy-fg">
            <span className="well mb-1 h-16 w-16 rounded-full bg-ink text-ground"><Check size={34} strokeWidth={2.6} /></span>
            <BiLabel text="purchase.created" size="lg" bold tone="text-current" align="center" />
            <span className="num text-[34px]" dir="ltr">{withCur(Number(result.total).toLocaleString('en-US'))}</span>
            <span className="num text-sm opacity-80" dir="ltr">{result.no}</span>
          </div>
          {kind !== 'supplier' && result.lines.some((l) => l.device_id) ? (
            <div className="rounded-2xl border border-gold/40 bg-gold-tint/40 px-4 py-3">
              <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-gold-text" /><BiLabel text="purchase.verifyTitle" size="md" bold /><Help term="idcheck" size="sm" /></div>
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
          {result.lines.some((l) => l.device_id) ? <BiButton text="label.forThese" icon={<Tag size={22} />} full onClick={() => setLabels(true)} /> : null}
          <LabelSheet kind="devices" ids={result.lines.filter((l) => l.device_id).map((l) => l.device_id!)} open={labels} onClose={() => setLabels(false)} />
          {result.lines.some((l) => l.accessory_id) ? <BiButton text="purchase.itemLabels" icon={<Tag size={22} />} full variant="secondary" onClick={() => setItemLabels(true)} /> : null}
          <LabelSheet kind="items" ids={[...new Set(result.lines.filter((l) => l.accessory_id).map((l) => l.accessory_id!))]} open={itemLabels} onClose={() => setItemLabels(false)} />
          <BiButton text="nav.stock" icon={<Smartphone size={22} />} full variant="secondary" onClick={() => nav('/stock')} />
        </div>
      ) : null}

      <Sheet open={reviewing} onClose={() => setReviewing(false)} title="purchase.review.title">
        <div className="flex flex-col gap-3" data-testid="purchase-review">
          <span className="flex items-center gap-1"><BiLabel text="purchase.review.hint" size="sm" tone="text-muted" /><Help term="purchase.review" size="sm" /></span>
          <div className="card flex flex-col gap-1">
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(kind === 'supplier' ? 'purchase.selectDealer' : 'purchase.selectSeller')}</span>
            <span className="text-[16px] font-extrabold">{party?.name}</span>
            {party?.phone ? <span className="num text-sm text-muted" dir="ltr">{party.phone}</span> : null}
          </div>
          {devices.map((d, i) => {
            const rows: [string, string | null][] = [
              ['stock.imei', d.imei1 || null],
              ['stock.imei2', d.imei2 || null],
              ['devcat.serial', d.serial || null],
              ['stock.storageShort', storages?.find((s) => s.id === d.storage_id)?.name ?? null],
              // owner 2026-11-13: RAM is checked before saving too
              ['devx.ram', d.ram_gb || null],
              ['stock.col.colour', colours?.find((c) => c.id === d.colour_id)?.name ?? null],
              ['stock.conditionShort', pick(`stock.condition.${d.condition}`)],
              ['stock.ptaShort', (d.category ?? 'phone') === 'phone' || d.cellular ? pick(`stock.pta.${d.pta_status}`) : null],
              ['stock.simTime', d.sim_time_months || null],
              ['stock.col.battery', d.battery_health ? `${d.battery_health}%` : null],
              ['stock.col.cycles', d.battery_cycles || null],
              ['devx.region', d.region_code || null],
              ['faulty.chip', d.faults?.length ? faultText(d.faults, pick) : null],
              ['simlock.label', d.sim_lock ? [pick(`simlock.${d.sim_lock}`), d.sim_lock === 'locked' ? d.sim_lock_carrier : ''].filter(Boolean).join(' · ') : null],
              ['purchase.cost', d.cost ? withCur(Number(d.cost).toLocaleString('en-US')) : null],
              ['stock.asking', d.asking_price ? withCur(Number(d.asking_price).toLocaleString('en-US')) : null],
            ]
            return (
              <div key={d.key} className="card flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="num well h-7 w-7 shrink-0 rounded-full bg-ground text-xs font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{d.brand_name} {d.model_name}</span>
                  <button type="button" onClick={() => { setReviewing(false); setEditing(d) }} className="tap inline-flex h-9 items-center gap-1 rounded-xl px-2 text-emerald-deep" data-testid="review-edit"><Pencil size={15} /><BtnText k="common.edit" /></button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {rows.filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-col">
                      <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
                      <span className="num truncate text-sm font-bold" dir={k.startsWith('stock.imei') || k === 'devcat.serial' ? 'ltr' : 'auto'}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {misc.filter((x) => x.description).map((x) => (
            <div key={x.key} className="card flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-bold">{x.description} <span className="num text-muted" dir="ltr">× {x.qty}</span></span>
              <MoneyText value={Number(x.qty || 0) * Number(x.unit_cost || 0)} tone="ink" />
            </div>
          ))}
          <div className="card flex flex-col gap-1.5">
            {Number(discount || 0) > 0 ? <div className="flex justify-between text-sm"><BiLabel text="common.discount" size="sm" tone="text-muted" /><MoneyText value={-Number(discount)} tone="ink" size="sm" /></div> : null}
            {Number(extraCosts || 0) > 0 ? <div className="flex justify-between text-sm"><BiLabel text="purchase.extraCosts" size="sm" tone="text-muted" /><MoneyText value={extraCosts} tone="ink" size="sm" /></div> : null}
            <div className="flex justify-between"><BiLabel text="common.total" size="md" bold /><MoneyText value={total} tone="ink" size="lg" /></div>
            <div className="flex justify-between text-sm"><BiLabel text="counter.paidHowBuy" size="sm" tone="text-muted" /><span className="font-bold">{pick(`purchase.review.method.${pay.method}`)}</span></div>
            <div className="flex justify-between text-sm"><BiLabel text="purchase.review.paidNow" size="sm" tone="text-muted" /><MoneyText value={paid} tone="ink" size="sm" /></div>
            {udhaar && paid > 0 ? <div className="flex justify-between text-sm" data-testid="review-part"><BiLabel text="paym.partBy" size="sm" tone="text-muted" /><span className="font-bold">{pick(`purchase.review.method.${part.method}`)}{part.bank ? ` · ${part.bank}` : ''}{part.reference ? ` · ${part.reference}` : ''}</span></div> : null}
            {total - paid > 0 ? <div className="flex justify-between text-sm"><BiLabel text="counter.stillToGive" size="sm" tone="text-muted" /><MoneyText value={total - paid} tone="ink" size="sm" /></div> : null}
            <div className="flex justify-between text-sm"><BiLabel text="purchase.when" size="sm" tone="text-muted" /><span className="num font-bold" dir="ltr">{earlier && when ? when.replace('T', ' ') : pick('purchase.whenNow')}</span></div>
          </div>
          <label className={`tap flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 ${checked ? 'border-emerald bg-emerald-tint' : 'border-line bg-surface'}`}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="h-6 w-6 shrink-0 accent-[rgb(var(--emerald))]" data-testid="review-ok" />
            <BiLabel text="purchase.review.ok" size="md" bold />
          </label>
          <ErrorText error={m.error} />
          <BiButton text="counter.putInStock" icon={<PackagePlus size={22} />} full loading={m.isPending} disabled={!checked} onClick={async () => { await submit(); setReviewing(false) }} data-testid="purchase-save" />
        </div>
      </Sheet>

      <Sheet open={pickingItem} onClose={() => setPickingItem(false)} title="items.buyTitle">
        {pickingItem ? (
          <StockItemPicker
            mode="buy"
            onPick={(it) => {
              setMisc((ms) => [...ms, { key: uid(), description: it.name, qty: '1', unit_cost: it.avg_cost && Number(it.avg_cost) ? String(Number(it.avg_cost)) : '', accessory_id: it.id, unit: 'piece', units: it.units && Object.keys(it.units).length ? it.units : { piece: 1, dozen: 12, box: 10, carton: 120, ...(it.pack_units ?? {}) } }])
              setPickingItem(false)
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && devices.some((x) => x.key === editing.key) ? 'purchase.editDevice' : 'purchase.addDevice'}>
        {editing ? (
          <DeviceLineSheet
            key={editing.key}
            initial={editing}
            again={devices.some((x) => x.key === editing.key)}
            draftKey="purchase-line"
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

function SourceCard({ active, icon, title, hint, onClick, help }: { active: boolean; icon: ReactNode; title: string; hint: string; onClick: () => void; help: string }) {
  // the "?" sits beside the card, not inside it, so a tap on it does not choose the card (docs/33)
  return (
    <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // chosen = accent border + light accent wash; words keep the normal ink colour so they never vanish
      // into the card (owner 2026-10-27: on some looks the chosen card hid its icon and title)
      className={`tap flex min-w-0 flex-1 items-center gap-4 rounded-3xl border-2 px-4 py-4 text-start text-ink transition-colors ${active ? 'border-emerald bg-emerald-tint' : 'border-line bg-surface hover:border-muted/40'}`}
    >
      <span className={`well h-14 w-14 shrink-0 ${active ? 'bg-emerald text-white' : 'bg-ink text-ground'}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <BiLabel text={title} size="lg" bold />
        <BiLabel text={hint} size="sm" tone="text-muted" className="mt-1 leading-loose" />
      </span>
      {active ? <Check size={22} className="shrink-0 text-emerald" /> : null}
    </button>
    <Help term={help} size="sm" />
    </div>
  )
}

/** Current local time as a datetime-local value: "2026-10-22T18:05". */
function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
