import LockedLineSheet from './LockedLineSheet'
import { Lock, Check, Headphones, PackagePlus, Pencil, Plus, Printer, ShieldCheck, SlidersHorizontal, Smartphone, Store, Trash2, UserCheck, UserRound, Watch } from 'lucide-react'
import { faultText } from '@/features/stock/Faults'
import { useEffect, useState, type ReactNode } from 'react'
import { clearDrafts, useDraft } from '@/lib/draft'
import { useLaptop } from '@/lib/useMedia'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PayPicker, { PartPay, billPayReady, billPayment, newPay, type PayState } from '@/components/PayPicker'
import NotInPackage from '@/components/NotInPackage'
import StockItemPicker from '@/components/StockItemPicker'
import PartyPicker from '@/components/PartyPicker'
import { BtnText, Chip, ErrorText, IconChip, MoneyText, PageHeader, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { useStepUrl } from '@/lib/steps'
import { api, get } from '@/lib/api'
import { openPrintable } from '@/lib/files'
import LabelSheet from '@/components/LabelSheet'
import { Tag } from 'lucide-react'
import { useTrade } from '@/lib/modules'
import { isQueued } from '@/lib/offline'
import { useColours, useDocMutation, useStorages } from '@/lib/queries'
import type { DeviceDetail, Party, Purchase } from '@/lib/types'
import DeviceLineSheet, { draftToApi, emptyDraft, expandDraft, type DeviceLineDraft } from './DeviceLineSheet'
import {withCur } from '@/lib/format'

type Kind = 'supplier' | 'walk_in' | 'shop' | 'trade_in'
interface Misc {
  key: string
  description: string
  qty: string
  unit_cost: string
  /** an accessory / watch from the shop's counted stock: its count goes up */
  accessory_id?: string
  /** ADR-124: what one piece sells for (shown beside its cost), and a discount on this line */
  price?: string
  discount?: string
  /** owner addendum 5: bought by the dozen / box; `units` = pieces per unit for this item */
  unit?: string
  units?: Record<string, number>
}
const UNITS = ['piece', 'dozen', 'box', 'carton']
const per = (x: Misc) => (x.units ?? { piece: 1 })[x.unit ?? 'piece'] ?? 1

/** ADR-124: under an item's line on the bill — what the line comes to, what one piece will sell
 *  for and earn, and (folded) a discount the dealer gave on this line alone */
function LineFoot({ x, onDiscount }: { x: Misc; onDiscount: (v: string) => void }) {
  const { pick, ur, cls } = useLang()
  const [open, setOpen] = useState(Number(x.discount || 0) > 0)
  const gross = Number(x.qty || 0) * Number(x.unit_cost || 0)
  const off = Math.min(Number(x.discount || 0), gross)
  const pieces = Number(x.qty || 0) * per(x)
  const each = pieces > 0 ? (gross - off) / pieces : 0
  const price = Number(x.price || 0)
  const gain = price - each
  const n = (v: number) => withCur(v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="col-span-full flex flex-col gap-1.5 border-t border-line pt-2" data-testid="line-foot">
      {gross > 0 ? <span className="flex items-center justify-between gap-2"><span className={`text-muted ${small}`}>{pick('buy.lineTotal')}</span><span className="num text-base font-extrabold" dir="ltr" data-testid="line-total">{n(gross - off)}</span></span> : null}
      {price > 0 && each > 0 ? <span className={`${gain < 0 ? 'text-payable' : 'text-emerald-deep'} ${small}`} data-testid="line-profit">{pick(gain < 0 ? 'buy.lossAt' : 'buy.sellsAt').replace('{{p}}', n(price)).replace('{{g}}', n(Math.abs(gain)))}</span> : null}
      {open ? (
        <BiInput label="buy.lineDiscount" help={null} type="number" inputMode="numeric" min={0} value={x.discount ?? ''} onChange={(e) => onDiscount(e.target.value)} className="num" error={Number(x.discount || 0) > gross ? 'buy.lineDiscountBig' : null} data-testid="line-discount" />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`tap w-fit rounded-xl py-1 font-bold text-emerald-deep underline-offset-4 hover:underline ${small}`} data-testid="line-discount-open">{pick('buy.addDiscount')}</button>
      )}
    </div>
  )
}

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
  // ADR-124: discounts given on single lines come off with the bill's own discount (the server works the total out the same way)
  const lineOff = misc.reduce((s, x) => s + Number(x.discount || 0), 0)
  const total = Math.max(0, subtotal - lineOff - Number(discount || 0)) + Number(extraCosts || 0)
  const udhaar = pay.method === 'udhaar'
  const paid = udhaar ? Math.min(Number(paidNow || 0), total) : total
  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`
  const partyKind = kind === 'supplier' ? 'supplier' : kind === 'shop' ? 'shop' : 'customer'

  // ADR-090: Edit a purchase — the form opens filled from it; saving replaces it (the old one kept as Deleted)
  const [replaceId] = useState(() => params.get('replace'))
  const [replaceNo, setReplaceNo] = useState('')
  const [replaceWhy, setReplaceWhy] = useState('')
  const rep = useDocMutation<Record<string, unknown>, Purchase>('POST', () => `/api/v1/purchases/${replaceId}/replace`)
  useEffect(() => {
    if (!replaceId) return
    void (async () => {
      const pur = await get<Purchase>(`/api/v1/purchases/${replaceId}`)
      setReplaceNo(pur.no)
      setKind(pur.kind)
      setChosen(true)
      const live = pur.lines.filter((l) => !l.returned_at)
      const devs = await Promise.all(live.filter((l) => l.device_id).map((l) => get<DeviceDetail>(`/api/v1/devices/${l.device_id}`)))
      setDevices(live.filter((l) => l.device_id).map((l, i) => toDraft(devs[i], pur.kind, String(Number(l.unit_cost)))))
      setMisc(live.filter((l) => !l.device_id).map((l) => ({ key: uid(), description: l.description ?? '', qty: String(l.qty), unit_cost: String(Number(l.unit_cost)), accessory_id: l.accessory_id ?? undefined })))
      setDiscount(Number(pur.discount) ? String(Number(pur.discount)) : '')
      setPaidNow(String(Number(pur.paid)))
      if (Number(pur.paid) < Number(pur.total)) setPay({ ...newPay(), method: 'udhaar' })
      setParty(await get<Party>(`/api/v1/parties/${pur.party_id}`))
      setStep(1)
    })().catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const body = {
      kind,
      party_id: party!.id,
      devices: devices.map(draftToApi),
      misc: misc.filter((x) => x.description).map((x) => ({ description: x.description, qty: Number(x.qty || 1), unit_cost: Number(x.unit_cost || 0), accessory_id: x.accessory_id, unit: x.unit ?? 'piece', ...(Number(x.discount || 0) > 0 ? { discount: Number(x.discount) } : {}) })),
      discount: Number(discount || 0),
      supplier_invoice_no: kind === 'supplier' && supplierBill ? supplierBill : undefined,
      extra_costs: Number(extraCosts || 0),
      extra_costs_note: extraNote || undefined,
      paid,
      payment: billPayment(pay, part, paid),
      reference: reference || undefined,
      due_date: udhaar && dueDate ? dueDate : undefined,
      purchased_at: earlier && when ? new Date(when).toISOString() : undefined,
    }
    const res = replaceId ? await rep.mutateAsync({ ...body, reason: replaceWhy.trim() }) : await m.mutateAsync(body)
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

  // ADR-109: a shop without mobiles says "stock", not "phone"; one without phones or laptops
  // (accessories only) has no device to add and nobody's phone to buy
  const trade = useTrade()
  // ADR-132 (docs/43 mock-up 01): on a laptop "from whom" and the bill are side by side — the bill
  // opens once the seller is chosen; a phone keeps its steps
  const laptop = useLaptop()
  const steps = [trade.devices ? 'counter.fromWhom' : 'goods.stepDealer', trade.mobiles ? 'counter.phoneAndCost' : 'goods.stepItems', 'counter.doneTitle']
  // ADR-123: an accessories shop buys from dealers only — one choice is no question, so the
  // dealer is asked straight away
  useEffect(() => { if (!trade.devices && (!chosen || kind !== 'supplier')) { setKind('supplier'); setChosen(true) } }, [trade.devices]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.addStock" help={<Help term="purchase.page" />} onBack={back} />
      <div className={step < 2 ? 'lg:hidden' : ''}><Stepper steps={steps} current={step} onStep={step < 2 ? setStep : undefined} /></div>
      {replaceId ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-gold/40 bg-gold/15 px-3 py-2.5" data-testid="purchase-editing">
          <span className="text-sm font-bold text-ink">{pick('sedit.editing').replace('{{no}}', replaceNo)}</span>
          <BiInput label="common.reason" value={replaceWhy} onChange={(e) => setReplaceWhy(e.target.value)} minLength={3} data-testid="purchase-edit-reason" />
        </div>
      ) : null}

      <div className={laptop && step !== 2 ? 'grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] items-start gap-6' : 'contents'} data-testid="buy-panes">
      {step === 0 || (laptop && step === 1) ? (
        <div className="flex flex-col gap-3 lg:sticky lg:top-24" data-testid="buy-from">
          {trade.devices ? <span className="flex items-center gap-1"><BiLabel text={trade.mobiles ? 'purchase.chooseTitle' : 'goods.chooseTitle'} size="lg" bold /><Help term="purchase.source" size="sm" /></span> : <BiLabel text="goods.dealerTitle" size="lg" bold />}
          {trade.devices ? <SourceCard
            help="purchase.fromDealer"
            active={chosen && kind === 'supplier'}
            icon={<Store size={26} />}
            title="purchase.fromDealer"
            hint={trade.mobiles ? 'purchase.fromDealerHint' : 'goods.fromDealerHint'}
            onClick={() => { if (kind !== 'supplier') setParty(null); setKind('supplier'); setChosen(true) }}
          /> : null}
          {trade.devices ? <SourceCard
            help="purchase.fromCustomer"
            active={chosen && kind === 'walk_in'}
            icon={<UserRound size={26} />}
            title="purchase.fromCustomer"
            hint="purchase.fromCustomerHint"
            onClick={() => { if (kind !== 'walk_in') setParty(null); setKind('walk_in'); setChosen(true) }}
          /> : null}
          {chosen ? (
            <>
              <div className="flex items-start gap-1"><div className="min-w-0 flex-1"><PartyPicker value={party} onChange={setParty} kind={partyKind} label={kind === 'supplier' ? 'purchase.selectDealer' : 'purchase.selectSeller'} /></div>{kind === 'supplier' ? <Help term="purchase.dealer" size="sm" /> : <Help term="purchase.seller" size="sm" />}</div>
              {step === 0 && !(laptop && party && !startImei && !scanned) ? <BiButton text="common.next" full disabled={!party} onClick={() => { setStep(1); if (!devices.length && (startImei || scanned)) setEditing({ ...emptyDraft(startImei, kind), manufacturer_code: startImei ? '' : scanned }) }} /> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {laptop && step === 0 && !party ? <div className="card flex items-center gap-3 border-dashed" data-testid="buy-wait"><Store size={22} className="shrink-0 text-muted" /><BiLabel text="buy.pickFirst" size="md" tone="text-muted" /></div> : null}
      {step === 1 || (laptop && step === 0 && !!party) ? (
        <div className="flex flex-col gap-3" data-testid="buy-bill">
          {trade.devices ? (!devices.length ? <BiLabel text="purchase.noDevices" size="md" tone="text-muted" align="center" className="py-4" /> : null) : !misc.length ? <BiLabel text="goods.none" size="md" tone="text-muted" align="center" className="py-4" /> : null}
          {devices.map((d) => (
            <div key={d.key} className="card flex items-center gap-3">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(d)}>
                <div className="truncate font-semibold">
                  {d.brand_name} {d.model_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {d.imei1 ? <span dir="ltr">{d.imei1}</span> : null}
                  {d.lock_type ? <Chip text={`locked.type.${d.lock_type}`} tone="bad" /> : <Chip text={`stock.condition.${d.condition}`} />}
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
          {trade.devices ? <div className="flex items-center gap-1"><BiButton text="purchase.addDevice" icon={<Plus size={22} />} variant="secondary" className="flex-1" onClick={() => setEditing(emptyDraft('', kind))} /><Help term="purchase.lines" size="sm" /></div> : null}
          {/* owner 2026-11-15 (ADR-085): a locked phone (iCloud / FRP), for parts or to sell as it is */}
          {trade.mobiles ? <div className="flex items-center gap-1"><BiButton text="locked.add" icon={<Lock size={20} />} variant="secondary" className="flex-1" onClick={() => setEditing({ ...emptyDraft('', kind), lock_type: 'icloud', condition: 'used', pta_status: 'unknown' })} data-testid="add-locked" /><Help term="locked.lock" size="sm" /></div> : null}

          {trade.accessories ? <div className="flex items-center gap-1"><BiButton text="items.buyButton" icon={<Watch size={22} />} variant={trade.devices ? 'secondary' : 'primary'} className="flex-1" onClick={() => setPickingItem(true)} /><Help term="purchase.items" size="sm" /></div> : null}
          {/* ADR-122: what this shop's package does not include, and how to ask for it */}
          <NotInPackage />
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
                  {x.accessory_id ? <LineFoot x={x} onDiscount={(v) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, discount: v } : y)))} /> : null}
                </div>
              ))}
              {kind === 'supplier' ? <div className="flex flex-col gap-1"><div><IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_cost: '' }])} /></div><BiLabel text="buy.typedHint" size="sm" tone="text-muted" /></div> : null}
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

              <div className="flex flex-col gap-3 lg:sticky lg:bottom-3 lg:z-[5] lg:rounded-3xl lg:border lg:border-line lg:bg-ground/95 lg:p-2.5 lg:shadow-hero lg:backdrop-blur" data-testid="buy-foot">
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
              <ErrorText error={m.error ?? rep.error} />
              <BiButton text="counter.putInStock" icon={<PackagePlus size={22} />} full loading={m.isPending} disabled={(earlier && !when) || total <= 0 || !billPayReady(pay, part, paid) || (!!replaceId && replaceWhy.trim().length < 3)} onClick={() => { setChecked(false); m.reset(); setReviewing(true) }} data-testid="purchase-review-open" />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      </div>

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
          <ErrorText error={m.error ?? rep.error} />
          <BiButton text="counter.putInStock" icon={<PackagePlus size={22} />} full loading={m.isPending || rep.isPending} disabled={!checked} onClick={async () => { await submit(); setReviewing(false) }} data-testid="purchase-save" />
        </div>
      </Sheet>

      <Sheet open={pickingItem} onClose={() => setPickingItem(false)} title="items.buyTitle">
        {pickingItem ? (
          <StockItemPicker
            mode="buy"
            onPick={(it, bought) => {
              setMisc((ms) => [...ms, { key: uid(), description: it.variant ? `${it.name} · ${it.variant}` : it.name, qty: bought?.qty || '1', unit_cost: bought?.cost || (it.avg_cost && Number(it.avg_cost) ? String(Number(it.avg_cost)) : ''), accessory_id: it.id, unit: 'piece', price: it.price, units: it.units && Object.keys(it.units).length ? it.units : { piece: 1, dozen: 12, box: 10, carton: 120, ...(it.pack_units ?? {}) } }])
              setPickingItem(false)
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && devices.some((x) => x.key === editing.key) ? 'purchase.editDevice' : 'purchase.addDevice'}>
        {editing && editing.lock_type ? (
          <LockedLineSheet
            key={editing.key}
            initial={editing}
            again={devices.some((x) => x.key === editing.key)}
            onSave={(d) => {
              setDevices((xs) => (xs.some((x) => x.key === d.key) ? xs.map((x) => (x.key === d.key ? d : x)) : [...xs, d]))
              setEditing(null)
            }}
          />
        ) : editing ? (
          <DeviceLineSheet
            key={editing.key}
            initial={editing}
            again={devices.some((x) => x.key === editing.key)}
            draftKey="purchase-line"
            many
            onSave={(d) => {
              // ADR-110: a line with several pieces becomes one line per piece (a piece already on this bill is left out)
              setDevices((xs) => (xs.some((x) => x.key === d.key) ? xs.map((x) => (x.key === d.key ? d : x)) : [...xs, ...expandDraft(d).filter((n) => !xs.some((x) => (n.imei1 && x.imei1 === n.imei1) || (!n.imei1 && n.serial && x.serial === n.serial)))]))
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

/** a bought phone back into the purchase form (ADR-090 edit): every field the form has, from the
 *  phone's record; its barcode stays with the phone */
function toDraft(dev: DeviceDetail, kind: Purchase['kind'], cost: string): DeviceLineDraft {
  const base = emptyDraft(dev.imei1, kind)
  const src = dev as unknown as Record<string, unknown>
  const out: Record<string, unknown> = { ...base }
  for (const k of Object.keys(base)) {
    if (k === 'key' || k === 'barcode' || k === 'manufacturer_code' || k === 'accessories') continue
    const v = src[k]
    if (v === null || v === undefined) continue
    out[k] = typeof base[k as keyof DeviceLineDraft] === 'string' ? String(v) : v
  }
  return { ...(out as unknown as DeviceLineDraft), cost, asking_price: dev.asking_price != null ? String(Number(dev.asking_price)) : '' }
}

