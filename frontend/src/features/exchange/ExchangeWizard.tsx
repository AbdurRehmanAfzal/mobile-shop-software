/** Exchange: the customer's old phone comes in, a new one goes out, the difference is settled in one
 *  go. Owner 2026-10-29: brought onto the v2 look — four clear steps, the old and new phones as
 *  cards, a settlement card that says in words who pays whom, a done screen like the sale's. */

import { ArrowLeftRight, Check, FileText, Pencil, Plus, Printer, Receipt, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import DocLangPicker from '@/components/DocLangPicker'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, KV, List, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
import { openPrintable } from '@/lib/files'
import { useDevices, useDocMutation, useInvalidate } from '@/lib/queries'
import type { Device, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'

interface ExchangeOut { no: string; invoice_id: string; invoice_no: string | null; previous_balance: string; trade_in_value: string; new_total: string; new_balance: string }
const n = (v: number | string) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const STEPS = ['sale.steps.customer', 'exchange.oldDevice', 'exchange.newDevice', 'exchange.settle']

export default function ExchangeWizard() {
  const nav = useNavigate()
  const inv = useInvalidate()
  const { pick, ur, cls } = useLang()
  const [step, setStep] = useState(0)
  const [party, setParty] = useState<Party | null>(null)
  const [old, setOld] = useState<DeviceLineDraft | null>(null)
  const [editingOld, setEditingOld] = useState(false)
  const [newDev, setNewDev] = useState<Device | null>(null)
  const [price, setPrice] = useState('')
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const [paid, setPaid] = useState('')
  const [result, setResult] = useState<ExchangeOut | null>(null)
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined })
  const m = useDocMutation<Record<string, unknown>, ExchangeOut>('POST', () => '/api/v1/exchanges')
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  const tradeIn = Number(old?.cost || 0)
  const total = Number(price || 0)
  const previous = Number(party?.balance ?? 0)
  const diff = total - tradeIn // > 0 the customer pays, < 0 the shop gives back
  const paidNow = diff > 0 ? Number(paid || 0) : 0
  const newBalance = previous + Math.max(0, diff) - paidNow
  const reset = () => { setStep(0); setParty(null); setOld(null); setNewDev(null); setPrice(''); setPaid(''); setResult(null); m.reset() }

  const oldCard = old ? (
    <div className="card flex items-center gap-3">
      <span className="well h-12 w-12 shrink-0 rounded-2xl bg-buy text-buy-fg"><Smartphone size={22} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{old.brand_name} {old.model_name}</span>
        <span className={`text-muted ${small}`} dir="ltr">{old.imei1}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className={`text-muted ${small}`}>{pick('exchange.tradeValue')}</span>
        <span className="num text-lg" dir="ltr">{n(tradeIn)}</span>
      </span>
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="exchange.title" />
      {!result ? (
        <>
          <div className="flex items-center gap-3 rounded-3xl bg-sell p-4 text-sell-fg">
            <span className="well h-12 w-12 shrink-0 rounded-2xl bg-white/15 text-current"><ArrowLeftRight size={22} /></span>
            <BiLabel text="counter.exchangeHint" size="sm" tone="text-current" className="opacity-90" />
          </div>
          <Stepper steps={STEPS} current={Math.min(step, 3)} />
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
          <BiLabel text="exchange.oldHint" size="sm" tone="text-muted" />
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
              <BiInput label="sale.price" type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="num text-2xl" />
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
            <KV k="exchange.newDevice" v={<span className="num" dir="ltr">{n(total)}</span>} />
            <KV k="exchange.tradeValue" v={<span className="num" dir="ltr">− {n(tradeIn)}</span>} />
            {previous ? <KV k="exchange.previous" v={<span className="num" dir="ltr">{n(previous)}</span>} /> : null}
          </div>
          <div className={`flex flex-col gap-1 rounded-3xl p-4 ${diff > 0 ? 'bg-khata text-khata-fg' : diff < 0 ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`}>
            <BiLabel text={diff > 0 ? 'exchange.customerPays' : diff < 0 ? 'exchange.shopPays' : 'exchange.even'} size="md" bold tone="text-current" />
            {diff !== 0 ? <span className="num text-[32px] leading-none" dir="ltr">Rs. {n(Math.abs(diff))}</span> : null}
          </div>
          {diff > 0 ? <BiInput label="sale.paidNow" type="number" inputMode="numeric" min={0} max={diff} value={paid} onChange={(e) => setPaid(e.target.value)} className="num text-2xl" hint="exchange.paidHint" /> : null}
          <div className="hero flex items-center justify-between p-4">
            <BiLabel text="exchange.newBalance" size="md" tone="text-gold-text" bold />
            <span className="num text-2xl text-gold-text" dir="ltr">{n(newBalance)}</span>
          </div>
          <ErrorText error={m.error} />
          <BiButton
            text="exchange.confirm"
            icon={<Check size={22} />}
            full
            loading={m.isPending}
            disabled={paidNow > Math.max(0, diff)}
            onClick={async () => {
              const res = await m.mutateAsync({ party_id: party!.id, trade_in: [draftToApi(old!)], devices: [{ device_id: newDev!.id, price: total }], paid: paidNow, refund: diff < 0 ? -diff : 0 })
              setResult(res)
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
            <span className={ur ? cls('sm') : 'text-sm font-semibold'}>{pick('exchange.newBalance')}: <span className="num" dir="ltr">{n(result.new_balance)}</span></span>
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
