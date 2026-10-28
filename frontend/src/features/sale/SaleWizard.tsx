/** Sale in three steps (docs/11 v2): which phone → how much and how paid (cash / an account / udhaar)
 *  → done. Customer is asked only for udhaar. Warranty and box/charger are shown under each phone
 *  (owner, 2026-10-27: hidden behind "more options" nobody found them); discount stays behind it. */

import { Check, CirclePause, FileText, Headphones, Plus, Printer, Receipt, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Trash2, TriangleAlert, UserCheck, Watch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { clearDrafts, useDraft } from '@/lib/draft'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import PayPicker, { newPay, payInfo, payReady, remitPkr, type PayState } from '@/components/PayPicker'
import StockItemPicker from '@/components/StockItemPicker'
import { AccessoryPicker, type AccValue } from '@/components/AccessoryPicker'
import { BtnText, Chip, ErrorText, IconChip, List, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
import { uid } from '@/lib/id'
import { ApiError, api, get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useDevices, useDocMutation, useGet } from '@/lib/queries'
import type { Device, DeviceDetail, Invoice, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'
import { HeldButton, HeldSalesSheet, useHeldSales, type HeldSale } from './HeldSales'

interface Line {
  device: Device
  price: string
  warranty_days: string
  acc: AccValue
}
interface Misc {
  key: string
  description: string
  qty: string
  unit_price: string
  /** from the shop's counted stock (accessory / watch): its count goes down when sold */
  accessory_id?: string
  stock?: number
}
// what came with the phone goes with it unless the seller changes it
const newLine = (d: Device): Line => ({
  device: d,
  price: d.asking_price ? String(Number(d.asking_price)) : '',
  warranty_days: '0',
  acc: Object.fromEntries(((d as Partial<DeviceDetail>).accessories ?? []).filter((a) => a.came_with && a.kind !== 'other').map((a) => [a.kind, { state: 'now', date: '' }])),
})
const WARRANTY = [0, 7, 30, 90, 180, 365] as const
/** what a held sale keeps: the screen's cart as it was */
interface Cart { lines: Line[]; misc: Misc[]; discount: string; pay: PayState; party: Party | null; paidNow: string; taxOn: boolean; taxRate: string; more: boolean }

export default function SaleWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const [step, setStep] = useDraft('sale.step', 0)
  const [lines, setLines] = useDraft<Line[]>('sale.lines', [])
  const [misc, setMisc] = useDraft<Misc[]>('sale.misc', [])
  const [picking, setPicking] = useState(false)
  const [pickingItem, setPickingItem] = useState(false)
  const [more, setMore] = useDraft('sale.more', false)
  const [q, setQ] = useState('')
  const [discount, setDiscount] = useDraft('sale.discount', '')
  const [pay, setPay] = useDraft<PayState>('sale.payment', () => newPay())
  const [party, setParty] = useDraft<Party | null>('sale.party', null)
  const [paidNow, setPaidNow] = useDraft('sale.paidNow', '')
  const [overrideReason, setOverrideReason] = useDraft('sale.overrideReason', '')
  const [lossOk, setLossOk] = useDraft('sale.lossOk', false)
  // owner 2026-10-28: tax only when the shopkeeper ticks it; the rate starts at the shop's setting
  const [taxOn, setTaxOn] = useDraft('sale.taxOn', false)
  const [taxRate, setTaxRate] = useDraft('sale.taxRate', '')
  const { data: shopSet } = useGet<{ tax_rate: string }>(['shop-full'], '/api/v1/shops/current')
  const rateShown = taxRate !== '' ? taxRate : String(Number(shopSet?.tax_rate) || 18)
  const [result, setResult] = useState<Invoice | null>(null)
  const [devCat, setDevCat] = useState<'' | 'phone' | 'tablet' | 'watch'>('')
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined, category: devCat || undefined })
  const m = useDocMutation<Record<string, unknown>, Invoice>('POST', () => '/api/v1/sales')
  // POS hold (owner 2026-10-28): park this bill, serve the next customer, resume it later
  const { data: held } = useHeldSales<Cart>()
  const [holding, setHolding] = useState(false)
  const [holdName, setHoldName] = useState('')
  const [heldOpen, setHeldOpen] = useState(false)
  const [holdMsg, setHoldMsg] = useState<{ k: 'held' } | { k: 'sold'; n: number } | null>(null)
  const hold = useDocMutation<Record<string, unknown>, HeldSale>('POST', () => '/api/v1/sales/held')

  useEffect(() => {
    const id = params.get('device')
    if (id && !lines.length)
      get<Device>(`/api/v1/devices/${id}`).then((d) => { setLines([newLine(d)]); setStep(1) }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  const subtotal = lines.reduce((s, l) => s + Number(l.price || 0), 0) + misc.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0)
  const base = Math.max(0, subtotal - Number(discount || 0))
  const taxAmount = taxOn ? Math.round(base * Number(rateShown || 0)) / 100 : 0
  const total = Math.round((base + taxAmount) * 100) / 100
  const udhaar = pay.method === 'udhaar'
  // a remittance may cover only part of the bill: the rest goes on the customer's khata
  const paid = udhaar ? Math.min(Number(paidNow || 0), total) : pay.method === 'remittance' ? Math.min(remitPkr(pay), total) : total
  const owes = paid < total
  const pendingLine = lines.find((l) => l.device.verification_status === 'pending')
  const flaggedLine = lines.find((l) => l.device.verification_status === 'flagged')
  const manager = role === 'owner' || role === 'manager'
  // a pending check may be skipped by whoever sells; a stolen flag needs the owner/manager and a reason
  // FR-VER-04: only the owner may sell a phone flagged as possibly stolen (backend Cap.VERIFY_OVERRIDE)
  const isOwner = role === 'owner'
  const checkOk = (!pendingLine || !!overrideReason) && (!flaggedLine || (isOwner && overrideReason.trim().length >= 3))
  const notSellableErr = m.error instanceof ApiError && (m.error.code === 'not_sellable' || m.error.code === 'device_flagged')
  // owner: no selling below the buying price; only the owner/manager may, after saying so
  // (the buying price is only sent to them; for others the server refuses with below_cost)
  const belowCost = (l: Line) => l.device.cost_price != null && l.price !== '' && Number(l.price) < Number(l.device.cost_price)
  const lossLine = lines.some(belowCost)
  const canSave = (!lossLine || (manager && lossOk)) && checkOk && total > 0 && payReady(pay) && (!owes || !!party) && lines.every((l) => Number(l.price) > 0) && misc.every((x) => x.description.trim() && Number(x.unit_price) > 0 && (x.stock === undefined || Number(x.qty) <= x.stock))

  const setLine = (l: Line, patch: Partial<Line>) => setLines((ls) => ls.map((x) => (x.device.id === l.device.id ? { ...x, ...patch } : x)))

  function pickDevice(d: Device) {
    setLines((ls) => (ls.some((l) => l.device.id === d.id) ? ls : [...ls, newLine(d)]))
    setPicking(false)
    setStep(1)
    // the stock list has no box/charger details; fetch them so they start as "given"
    get<DeviceDetail>(`/api/v1/devices/${d.id}`)
      .then((full) => setLines((ls) => ls.map((x) => (x.device.id === d.id && !Object.keys(x.acc).length ? { ...x, acc: newLine(full).acc } : x))))
      .catch(() => undefined)
  }

  function resetCart() {
    setLines([]); setMisc([]); setParty(null); setPaidNow(''); setDiscount(''); setPay(newPay()); setTaxOn(false); setTaxRate(''); setMore(false); setOverrideReason(''); setLossOk(false)
  }

  async function holdSale() {
    const cart: Cart = { lines, misc, discount, pay, party, paidNow, taxOn, taxRate, more }
    await hold.mutateAsync({ label: holdName.trim() || party?.name || null, total, items: lines.length + misc.length, cart })
    clearDrafts('sale.')
    resetCart()
    setHolding(false)
    setHoldName('')
    setHoldMsg({ k: 'held' })
    setStep(0)
  }

  async function resume(h: HeldSale<Cart>) {
    const c = h.cart
    // a phone may have been sold while the bill was held: it comes off this bill
    const now = await Promise.all(c.lines.map((l) => get<Device>(`/api/v1/devices/${l.device.id}`).catch(() => null)))
    const still = c.lines.filter((_, i) => now[i]?.status === 'in_stock')
    await api('DELETE', `/api/v1/sales/held/${h.id}`).catch(() => undefined)
    setLines(still); setMisc(c.misc ?? []); setDiscount(c.discount ?? ''); setPay(c.pay ?? newPay()); setParty(c.party ?? null)
    setPaidNow(c.paidNow ?? ''); setTaxOn(!!c.taxOn); setTaxRate(c.taxRate ?? ''); setMore(!!c.more)
    setHoldMsg(still.length < c.lines.length ? { k: 'sold', n: c.lines.length - still.length } : null)
    setHeldOpen(false)
    m.reset()
    setStep(1)
  }

  async function submit() {
    const res = await m.mutateAsync({
      party_id: party?.id ?? null,
      devices: lines.map((l) => ({ device_id: l.device.id, price: Number(l.price || 0), warranty_days: Number(l.warranty_days || 0), ...accOut(l.acc) })),
      misc: misc.map((x) => ({ description: x.description.trim(), qty: Number(x.qty || 1), unit_price: Number(x.unit_price || 0), accessory_id: x.accessory_id })),
      discount: Number(discount || 0),
      tax_rate: taxOn ? Number(rateShown || 0) : 0,
      paid,
      payment: payInfo(pay),
      override_reason: overrideReason || undefined,
      below_cost_ok: lossLine && lossOk,
    })
    clearDrafts('sale.')
    setResult(res)
    setStep(2)
  }

  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.sell" />
      <Stepper steps={['counter.whichPhone', 'counter.howMuch', 'counter.doneTitle']} current={step} />

      {holdMsg?.k === 'held' ? <BiAlert text="hold.done" kind="success" /> : null}
      {holdMsg?.k === 'sold' ? <BiAlert text={soldText(pick, holdMsg.n)} kind="info" /> : null}

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <HeldButton count={held?.length ?? 0} onClick={() => setHeldOpen(true)} />
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />
          <div className="flex flex-wrap gap-1.5">
            {(['', 'phone', 'tablet', 'watch'] as const).map((c) => (
              <button key={c || 'all'} type="button" aria-pressed={devCat === c} onClick={() => setDevCat(c)} className={`tap h-10 rounded-full border-2 px-3.5 font-bold ${devCat === c ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
                {pick(c ? `devcat.${c}` : 'common.all')}
              </button>
            ))}
          </div>
          <BiLabel text="counter.tapPhone" size="sm" tone="text-muted" />
          {stock?.length ? (
            <List>
              {stock.map((d) => <DeviceRow key={d.id} d={d} onClick={() => pickDevice(d)} />)}
            </List>
          ) : (
            <BiLabel text="counter.noStock" size="md" tone="text-muted" align="center" className="py-6" />
          )}
          <BiButton text="items.sellButton" icon={<Watch size={22} />} variant="secondary" full onClick={() => setPickingItem(true)} />
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
                  </div>
                </div>
                <button type="button" aria-label={pick('crud.delete')} onClick={() => setLines(lines.filter((x) => x.device.id !== l.device.id))} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 text-payable">
                  <Trash2 size={16} />
                <BtnText k={'crud.delete'} /></button>
              </div>
              <BiInput label="counter.soldFor" type="number" inputMode="numeric" min={0} value={l.price} onChange={(e) => setLines(lines.map((x) => (x.device.id === l.device.id ? { ...x, price: e.target.value } : x)))} className="num text-2xl" />
              {belowCost(l) ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-expense p-3 text-expense-fg">
                  <div className="flex items-start gap-2">
                    <TriangleAlert size={20} className="mt-0.5 shrink-0" />
                    <span className={`font-semibold ${cls('sm')}`}>{pick('field.belowCost').replace('{{cost}}', `Rs. ${Number(l.device.cost_price).toLocaleString('en-US')}`)}</span>
                  </div>
                  {manager ? (
                    <button type="button" aria-pressed={lossOk} onClick={() => setLossOk(!lossOk)} className={chip(lossOk)}><Check size={20} />{pick('field.belowCostOk')}</button>
                  ) : (
                    <BiLabel text="field.belowCostBlocked" size="sm" bold tone="text-current" />
                  )}
                </div>
              ) : null}
              <div>
                <div className="mb-1.5 flex items-center gap-1"><BiLabel text="accx.warranty" size="md" bold /><Help term="warranty" /></div>
                <div className="flex flex-wrap gap-1.5">
                  {WARRANTY.map((w) => (
                    <button key={w} type="button" aria-pressed={Number(l.warranty_days) === w} onClick={() => setLine(l, { warranty_days: String(w) })} className={`tap h-11 rounded-full border-2 px-3.5 font-bold ${Number(l.warranty_days) === w ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
                      {pick(`accx.w${w}`)}
                    </button>
                  ))}
                </div>
              </div>
              <AccessoryPicker mode="sell" value={l.acc} onChange={(acc) => setLine(l, { acc })} />
            </div>
          ))}
          {misc.map((x) => (
            <div key={x.key} className={`card grid items-end gap-2 ${x.accessory_id ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-[1fr_64px_104px_auto]'}`}>
              {x.accessory_id ? (
                // an item from stock: its whole name on its own line, then how many and the price
                <div className="col-span-3 flex min-w-0 flex-col">
                  <span className="text-base font-extrabold">{x.description}</span>
                  <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('items.inStock')} <span className="num">{x.stock}</span></span>
                </div>
              ) : (
                <BiInput label="counter.itemName" value={x.description} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, description: e.target.value } : y)))} />
              )}
              <BiInput label="purchase.qty" type="number" inputMode="numeric" min={1} max={x.stock} error={x.stock !== undefined && Number(x.qty) > x.stock ? 'items.tooMany' : null} value={x.qty} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, qty: e.target.value } : y)))} />
              <BiInput label="sale.unitPrice" type="number" inputMode="numeric" min={0} value={x.unit_price} onChange={(e) => setMisc(misc.map((y) => (y.key === x.key ? { ...y, unit_price: e.target.value } : y)))} />
              <button type="button" aria-label={pick('crud.delete')} onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="tap mb-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable">
                <Trash2 size={16} />
              <BtnText k={'crud.delete'} /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <IconChip icon={<Smartphone size={18} />} text="counter.addAnother" onClick={() => setPicking(true)} />
            <IconChip icon={<Watch size={18} />} text="items.sellButton" onClick={() => setPickingItem(true)} />
            <IconChip icon={<Headphones size={18} />} text="counter.otherItem" onClick={() => setMisc([...misc, { key: uid(), description: '', qty: '1', unit_price: '' }])} />
            {!more ? <IconChip icon={<SlidersHorizontal size={18} />} text="counter.moreOptions" onClick={() => setMore(true)} /> : null}
          </div>
          {more ? <BiInput label="common.discount" type="number" inputMode="numeric" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /> : null}

          <label className="tap flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4">
            <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--emerald))]" />
            <BiLabel text="saleTax.add" size="md" bold className="flex-1" />
            {taxOn ? <span className="num text-sm text-muted" dir="ltr">+ Rs. {taxAmount.toLocaleString('en-US')}</span> : null}
          </label>
          {taxOn ? <BiInput label="saleTax.rate" type="number" inputMode="decimal" min={0} max={100} value={rateShown} onChange={(e) => setTaxRate(e.target.value)} className="num" /> : null}

          <div className="flex items-center gap-1"><BiLabel text="counter.howPaid" size="md" bold /><Help term="udhaar" /></div>
          <PayPicker value={pay} onChange={setPay} remittance />

          {udhaar ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-khata p-3 text-khata-fg">
              <PartyPicker value={party} onChange={setParty} kind="customer" label="counter.whoTakes" />
              <BiInput label="counter.paidNowOpt" type="number" inputMode="numeric" min={0} max={total} value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            </div>
          ) : owes && remitPkr(pay) > 0 ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-khata p-3 text-khata-fg">
              <span className={`font-bold ${cls('sm')}`}>{pick('paym.restUdhaar').replace('{{n}}', (total - paid).toLocaleString('en-US'))}</span>
              <PartyPicker value={party} onChange={setParty} kind="customer" label="counter.whoTakes" />
            </div>
          ) : more ? (
            <PartyPicker value={party} onChange={setParty} kind="customer" label="counter.customerOpt" allowNone />
          ) : null}

          {flaggedLine ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-expense p-3 text-expense-fg">
              <div className="flex items-center gap-2"><ShieldAlert size={22} /><BiLabel text="counter.flaggedSale" size="md" bold tone="text-current" /></div>
              {isOwner ? <BiInput label="sale.override" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} /> : null}
            </div>
          ) : pendingLine ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-khata p-3 text-khata-fg">
              <div className="flex items-center gap-2"><ShieldAlert size={22} /><BiLabel text="counter.pendingSale" size="md" bold tone="text-current" /></div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => nav(`/stock/${pendingLine.device.id}/verify`)} className={chip(false)}><ShieldCheck size={22} />{pick('counter.checkNow')}</button>
                <button type="button" aria-pressed={!!overrideReason} onClick={() => setOverrideReason(overrideReason ? '' : pick('purchase.skipReason'))} className={chip(!!overrideReason)}><UserCheck size={22} />{pick('counter.skipAndSell')}</button>
              </div>
            </div>
          ) : null}

          <div className="hero flex flex-col gap-1 px-5 py-4">
            <div className="flex items-center justify-between">
              <BiLabel text="common.total" size="md" tone="text-hero-text" bold />
              <span className="num text-3xl" dir="ltr">Rs. {total.toLocaleString('en-US')}</span>
            </div>
            {taxOn && taxAmount > 0 ? (
              <span className={`text-hero-text/75 ${ur ? cls('sm') : 'text-xs font-semibold'}`} dir="ltr">
                {pick('saleTax.incl')} Rs. {taxAmount.toLocaleString('en-US')} ({rateShown}%)
              </span>
            ) : null}
            {owes ? (
              <div className="flex items-center justify-between border-t border-white/15 pt-1.5">
                <BiLabel text="counter.remaining" size="sm" tone="text-gold-text" bold />
                <span className="num text-xl text-gold-text" dir="ltr">{(total - paid).toLocaleString('en-US')}</span>
              </div>
            ) : null}
          </div>
          {notSellableErr ? <Chip text="sale.notSellable" tone="bad" /> : null}
          <ErrorText error={m.error} />
          <BiButton text="sale.complete" icon={<Check size={22} />} full loading={m.isPending} disabled={!canSave} onClick={submit} />
          {lines.length || misc.length ? <BiButton text="hold.button" icon={<CirclePause size={22} />} full variant="secondary" onClick={() => { setHoldName(party?.name ?? ''); hold.reset(); setHolding(true) }} /> : null}
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
          <BiButton text="counter.newSale" icon={<Plus size={22} />} full variant="ghost" onClick={() => { resetCart(); setResult(null); setHoldMsg(null); setStep(0); m.reset() }} />
          <BiButton text="sale.viewSale" icon={<Receipt size={22} />} full variant="ghost" onClick={() => nav(`/sales/${result.id}`)} />
        </div>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="counter.whichPhone">
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />
          <List>
            {stock?.filter((d) => !lines.some((l) => l.device.id === d.id)).map((d) => <DeviceRow key={d.id} d={d} onClick={() => pickDevice(d)} />)}
          </List>
        </div>
      </Sheet>

      <Sheet open={holding} onClose={() => setHolding(false)} title="hold.title">
        <div className="flex flex-col gap-3">
          <BiLabel text="hold.explain" size="sm" tone="text-muted" />
          <BiInput label="hold.name" value={holdName} onChange={(e) => setHoldName(e.target.value)} maxLength={80} />
          <ErrorText error={hold.error} />
          <BiButton text="hold.save" icon={<CirclePause size={22} />} full loading={hold.isPending} onClick={holdSale} />
        </div>
      </Sheet>

      <HeldSalesSheet<Cart> open={heldOpen} onClose={() => setHeldOpen(false)} onResume={resume} />

      <Sheet open={pickingItem} onClose={() => setPickingItem(false)} title="items.sellTitle">
        {pickingItem ? (
          <StockItemPicker
            mode="sell"
            onPick={(it) => {
              setMisc((ms) => {
                const same = ms.find((m) => m.accessory_id === it.id)
                if (same) return ms.map((m) => (m === same ? { ...m, qty: String(Math.min(Number(m.qty || 0) + 1, it.qty)) } : m))
                return [...ms, { key: uid(), description: ur && it.name_ur ? it.name_ur : it.name, qty: '1', unit_price: String(Number(it.price) || ''), accessory_id: it.id, stock: it.qty }]
              })
              setPickingItem(false)
              setStep(1)
            }}
          />
        ) : null}
      </Sheet>

    </div>
  )
}

/** "n phones were sold meanwhile", already in the shown language */
function soldText(pick: (k: string) => string, n: number) {
  const t = pick('hold.sold').replace('{{n}}', String(n))
  return { en: t, ur: t, roman: t }
}

/** given now / promised for later, as the sales API takes them */
function accOut(acc: AccValue) {
  const rows = Object.entries(acc)
  return {
    accessories_given: rows.filter(([, v]) => v.state === 'now').map(([k]) => k),
    accessories_pending: rows.filter(([, v]) => v.state === 'later').map(([k, v]) => ({ kind: k, promised_at: v.date || null })),
  }
}
