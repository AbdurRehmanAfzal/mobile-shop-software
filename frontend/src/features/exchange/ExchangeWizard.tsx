/** Exchange: the customer's old phone comes in, a new one goes out, the difference is settled in one
 *  go. Owner 2026-10-29: brought onto the v2 look — four clear steps, the old and new phones as
 *  cards, a settlement card that says in words who pays whom, a done screen like the sale's. */

import { ArrowLeftRight, Check, FileText, Pencil, Plus, Printer, Receipt, ShieldAlert, ShieldCheck, Smartphone, UserCheck } from 'lucide-react'
import { useStepUrl } from '@/lib/steps'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import DocLangPicker from '@/components/DocLangPicker'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, KV, List, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
import { openPrintable } from '@/lib/files'
import { useDevice, useDevices, useDocMutation, useInvalidate } from '@/lib/queries'
import { api, get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Device, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import {withCur } from '@/lib/format'
import PayPicker, { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { uid } from '@/lib/id'

interface ExchangeOut { no: string; invoice_id: string; invoice_no: string | null; previous_balance: string; trade_in_value: string; new_total: string; new_balance: string; original_invoice_id?: string | null; original_invoice_no?: string | null; refund?: string }
const n = (v: number | string) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const STEPS = ['sale.steps.customer', 'exchange.oldDevice', 'exchange.newDevice', 'exchange.settle']

export default function ExchangeWizard() {
  const nav = useNavigate()
  const inv = useInvalidate()
  const { pick, ur, cls } = useLang()
  const [step, setStepRaw] = useState(0)
  const { go: setStep, back } = useStepUrl(step, setStepRaw, 4)
  const [party, setParty] = useState<Party | null>(null)
  const [old, setOld] = useState<DeviceLineDraft | null>(null)
  const [editingOld, setEditingOld] = useState(false)
  const [newDev, setNewDev] = useState<Device | null>(null)
  const [price, setPrice] = useState('')
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const [paid, setPaid] = useState('')
  // owner 2026-11-10 (ADR-057): the shop may pay back all, part or none of what it owes now
  const [giveBack, setGiveBack] = useState<string | null>(null)
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [idem, setIdem] = useState(uid)
  const [result, setResult] = useState<ExchangeOut | null>(null)
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined })
  const m = useDocMutation<Record<string, unknown>, ExchangeOut>('POST', () => '/api/v1/exchanges', undefined, undefined, { key: () => idem })
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  // ADR-128: the ID check never stops an exchange without a way on. The phone going out: check it
  // or skip it here (a stolen flag still needs the owner and a reason, as in a sale). The phone
  // coming in: skip its check now, or leave it for later, as in a purchase.
  const isOwner = useAuth((s) => s.me?.user.role) === 'owner'
  const { data: live } = useDevice(newDev?.id)
  const check = (live ?? newDev)?.verification_status
  const [skipNew, setSkipNew] = useState(false)
  const [why, setWhy] = useState('')
  const [skipOld, setSkipOld] = useState(false)
  const checkOk = check === 'flagged' ? isOwner && why.trim().length >= 5 : check !== 'pending' || skipNew
  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`

  const tradeIn = Number(old?.cost || 0)
  const total = Number(price || 0)
  const previous = Number(party?.balance ?? 0)
  const diff = total - tradeIn // > 0 the customer pays, < 0 the shop gives back
  const paidNow = diff > 0 ? Number(paid || 0) : 0
  const refundNow = diff < 0 ? Math.min(-diff, Math.max(0, giveBack === null ? -diff : Number(giveBack || 0))) : 0
  const moneyMoves = paidNow > 0 || refundNow > 0
  const newBalance = previous + diff - paidNow + refundNow
  const owesWord = (b: number) => (b > 0 ? 'exchange.toGet' : b < 0 ? 'exchange.toGive' : 'exchange.settled')
  const reset = () => { setStep(0); setParty(null); setOld(null); setNewDev(null); setPrice(''); setPaid(''); setGiveBack(null); setPay(newPay()); setIdem(uid()); setResult(null); setSkipNew(false); setWhy(''); setSkipOld(false); m.reset() }

  const oldCard = old ? (
    <div className="card flex items-center gap-3">
      <span className="well h-12 w-12 shrink-0 rounded-2xl bg-buy text-buy-fg"><Smartphone size={22} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{old.brand_name} {old.model_name}</span>
        <span className={`text-muted ${small}`} dir="ltr">{old.imei1}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="flex items-center gap-0.5"><span className={`text-muted ${small}`}>{pick('exchange.tradeValue')}</span><Help term="exchange.tradeValue" size="sm" /></span>
        <span className="num text-lg" dir="ltr">{n(tradeIn)}</span>
      </span>
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="exchange.title" help={<Help term="exchange.page" />} onBack={result ? undefined : back} />
      {!result ? (
        <>
          <div className="flex items-center gap-3 rounded-3xl bg-sell p-4 text-sell-fg">
            <span className="well h-12 w-12 shrink-0 rounded-2xl bg-white/15 text-current"><ArrowLeftRight size={22} /></span>
            <BiLabel text="counter.exchangeHint" size="sm" tone="text-current" className="opacity-90" />
          </div>
          <Stepper steps={STEPS} current={Math.min(step, 3)} onStep={result ? undefined : setStep} />
        </>
      ) : null}

      {step === 0 ? (
        <>
          <PartyPicker value={party} onChange={setParty} kind="customer" label="sale.selectCustomer" />
          <BiButton text="common.next" icon={<Check size={22} />} full disabled={!party} onClick={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <span className="flex items-center gap-1"><BiLabel text="exchange.oldHint" size="sm" tone="text-muted" /><Help term="exchange.oldPhone" size="sm" /></span>
          {old ? (
            <>
              {oldCard}
              <BiButton text="exchange.changeOld" icon={<Pencil size={18} />} variant="ghost" full onClick={() => setEditingOld(true)} />
            </>
          ) : <BiButton text="exchange.addOld" icon={<Plus size={22} />} variant="secondary" full onClick={() => setEditingOld(true)} />}
          <BiButton text="common.next" icon={<Check size={22} />} full disabled={!old || !tradeIn} onClick={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          {newDev ? (
            <>
              <div className="card p-0"><DeviceRow d={newDev} onClick={() => setPicking(true)} /></div>
              <BiInput label="sale.price" help={<Help term="exchange.newPrice" size="sm" />} type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="num text-2xl" />
            </>
          ) : <BiButton text="exchange.pickNew" icon={<Smartphone size={22} />} variant="secondary" full onClick={() => setPicking(true)} />}
          <BiButton text="common.next" icon={<Check size={22} />} full disabled={!newDev || !total} onClick={() => setStep(3)} />
        </>
      ) : null}

      {step === 3 && !result ? (
        <>
          {oldCard}
          {newDev ? <div className="card p-0"><DeviceRow d={newDev} /></div> : null}
          <div className="card">
            <KV k="exchange.newDevice" help="exchange.newPrice" v={<span className="num" dir="ltr">{n(total)}</span>} />
            <KV k="exchange.tradeValue" help="exchange.tradeValue" v={<span className="num" dir="ltr">− {n(tradeIn)}</span>} />
            {previous ? <KV k="exchange.previous" help="exchange.previous" v={<span className="num" dir="ltr">{n(previous)}</span>} /> : null}
          </div>
          <div className={`flex flex-col gap-1 rounded-3xl p-4 ${diff > 0 ? 'bg-khata text-khata-fg' : diff < 0 ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`}>
            <span className="flex items-center gap-1"><BiLabel text={diff > 0 ? 'exchange.customerPays' : diff < 0 ? 'exchange.shopPays' : 'exchange.even'} size="md" bold tone="text-current" /><span className="[&_button]:text-current"><Help term="exchange.difference" size="sm" /></span></span>
            {diff !== 0 ? <span className="num text-[32px] leading-none" dir="ltr">{withCur(n(Math.abs(diff)))}</span> : null}
          </div>
          {diff > 0 ? <BiInput label="sale.paidNow" help={<Help term="common.paid" size="sm" />} type="number" inputMode="numeric" min={0} max={diff} value={paid} onChange={(e) => setPaid(e.target.value)} className="num text-2xl" hint="exchange.paidHint" data-testid="exchange-paid" /> : null}
          {diff < 0 ? <BiInput label="exchange.shopPaysNow" help={<Help term="exchange.shopPaysNow" size="sm" />} type="number" inputMode="numeric" min={0} max={-diff} value={giveBack ?? String(-diff)} onChange={(e) => setGiveBack(e.target.value)} className="num text-2xl" hint="exchange.shopPaysHint" data-testid="exchange-give" /> : null}
          {moneyMoves ? <PayPicker value={pay} onChange={setPay} udhaar={false} /> : null}
          <div className="hero flex items-center justify-between p-4" data-testid="exchange-balance">
            <span className="flex items-center gap-1"><BiLabel text={owesWord(newBalance)} size="md" tone="text-gold-text" bold /><span className="[&_button]:text-gold-text"><Help term="exchange.newBalance" size="sm" /></span></span>
            {newBalance !== 0 ? <span className="num text-2xl text-gold-text" dir="ltr">{n(Math.abs(newBalance))}</span> : null}
          </div>
          <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-3" data-testid="exchange-old-check">
            <span className="flex items-center gap-1"><BiLabel text="exchange.oldCheck" size="sm" bold /><Help term="idcheck" size="sm" /></span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={!skipOld} onClick={() => setSkipOld(false)} className={chip(!skipOld)}><ShieldCheck size={22} />{pick('exchange.oldCheckLater')}</button>
              <button type="button" aria-pressed={skipOld} onClick={() => setSkipOld(true)} className={chip(skipOld)}><UserCheck size={22} />{pick('counter.skipCheck')}</button>
            </div>
          </div>
          {check === 'flagged' ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-expense p-3 text-expense-fg" data-testid="exchange-flagged">
              <div className="flex items-center gap-2"><ShieldAlert size={22} /><BiLabel text="counter.flaggedSale" size="md" bold tone="text-current" /><span className="[&_button]:text-current"><Help term="sale.flagged" size="sm" /></span></div>
              {isOwner ? <BiInput label="sale.override" help={<Help term="sale.override" size="sm" />} value={why} onChange={(e) => setWhy(e.target.value)} /> : null}
            </div>
          ) : check === 'pending' ? (
            <div className="flex flex-col gap-2 rounded-3xl bg-khata p-3 text-khata-fg" data-testid="exchange-pending">
              <div className="flex items-center gap-2"><ShieldAlert size={22} /><BiLabel text="exchange.pendingNew" size="md" bold tone="text-current" /><span className="[&_button]:text-current"><Help term="sale.pendingCheck" size="sm" /></span></div>
              <div className="grid grid-cols-2 gap-2">
                {/* in another window: the exchange being filled stays as it is, and the phone's state is read again on return */}
                <button type="button" onClick={() => window.open(`/stock/${newDev!.id}/verify`, '_blank')} className={chip(false)}><ShieldCheck size={22} />{pick('counter.checkNow')}</button>
                <button type="button" aria-pressed={skipNew} onClick={() => setSkipNew(!skipNew)} className={chip(skipNew)} data-testid="exchange-skip"><UserCheck size={22} />{pick('exchange.skipAndGive')}</button>
              </div>
            </div>
          ) : null}
          <ErrorText error={m.error} />
          <BiButton
            text="exchange.confirm"
            icon={<Check size={22} />}
            full
            loading={m.isPending}
            disabled={!checkOk || paidNow > Math.max(0, diff) || (moneyMoves && !payReady(pay))}
            onClick={async () => {
              const res = await m.mutateAsync({ party_id: party!.id, trade_in: [draftToApi(old!)], devices: [{ device_id: newDev!.id, price: total }], paid: paidNow, refund: refundNow, payment: moneyMoves ? payInfo(pay) : undefined, override_reason: check === 'flagged' ? why.trim() : check === 'pending' && skipNew ? pick('purchase.skipReason') : undefined })
              // the phone that came in: its check is skipped after the exchange is saved, and never undoes it
              if (skipOld && old?.imei1) {
                try {
                  const hit = await get<{ device: { id: string; verification_status: string } | null }>(`/api/v1/devices/imei/${encodeURIComponent(old.imei1)}`)
                  if (hit.device?.verification_status === 'pending') await api('POST', `/api/v1/devices/${hit.device.id}/verification/override`, { reason: pick('purchase.skipReason') })
                } catch { /* it stays pending and shows under "Needs attention" */ }
              }
              setResult(res)
              setStep(4)
              inv('devices', 'parties', 'dashboard', 'sales', 'purchases')
            }}
          />
        </>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-sell px-5 py-7 text-sell-fg">
            <span className="well mb-1 h-16 w-16 rounded-full bg-emerald text-white"><Check size={34} strokeWidth={2.6} /></span>
            <BiLabel text="exchange.done" size="lg" bold tone="text-current" align="center" />
            <span className="num text-sm opacity-80" dir="ltr">{result.no}{result.invoice_no ? ` · ${result.invoice_no}` : ''}</span>
            <span className={ur ? cls('sm') : 'text-sm font-semibold'} data-testid="exchange-result-balance">{pick(owesWord(Number(result.new_balance)))}{Number(result.new_balance) ? <>: <span className="num" dir="ltr">{n(Math.abs(Number(result.new_balance)))}</span></> : null}</span>
            {result.original_invoice_no ? <span className="num text-xs opacity-80" dir="ltr">{pick('exchange.firstBill')} {result.original_invoice_no}</span> : null}
          </div>
          <DocLangPicker />
          <BiButton text="sale.printThermal" icon={<Printer size={22} />} full onClick={() => openPrintable(`/api/v1/sales/${result.invoice_id}/receipt?format=thermal`)} />
          <BiButton text="sale.printA4" icon={<FileText size={22} />} full variant="secondary" onClick={() => openPrintable(`/api/v1/sales/${result.invoice_id}/receipt?format=a4`)} />
          <DocActions path={`/api/v1/sales/${result.invoice_id}/receipt?format=a4`} name={`invoice-${result.invoice_no ?? result.no}`} title={result.no} picker={false} />
          <BiButton text="exchange.another" icon={<Plus size={22} />} full variant="ghost" onClick={reset} />
          <BiButton text="exchange.viewBill" icon={<Receipt size={22} />} full variant="ghost" onClick={() => nav(`/sales/${result.invoice_id}`)} />
        </div>
      ) : null}

      <Sheet open={editingOld} onClose={() => setEditingOld(false)} title="exchange.oldDevice">
        {editingOld ? <DeviceLineSheet initial={old ?? emptyDraft('', 'trade_in')} onSave={(d) => { setOld(d); setEditingOld(false) }} /> : null}
      </Sheet>
      <Sheet open={picking} onClose={() => setPicking(false)} title="exchange.pickNew">
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />
          <List>{stock?.map((d) => <DeviceRow key={d.id} d={d} onClick={() => { setNewDev(d); setPrice(Number(d.asking_price) ? String(Number(d.asking_price)) : ''); setPicking(false) }} />)}</List>
        </div>
      </Sheet>
    </div>
  )
}
