import { useState } from 'react'
import { BiButton, BiInput, BiLabel } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, KV, List, MoneyText, PageHeader, SearchBox, Sheet, Stepper } from '@/components/ui'
import { openPrintable } from '@/lib/files'
import { useDevices, useDocMutation } from '@/lib/queries'
import type { Device, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'

interface ExchangeOut { no: string; invoice_id: string; previous_balance: string; trade_in_value: string; new_total: string; new_balance: string }

export default function ExchangeWizard() {
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

  const tradeIn = Number(old?.cost || 0)
  const total = Number(price || 0)
  const previous = Number(party?.balance ?? 0)
  const diff = total - tradeIn
  const newBalance = previous + diff - Number(paid || 0) + (diff < 0 ? -diff : 0)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="exchange.title" />
      <BiLabel text="counter.exchangeHint" size="sm" tone="text-muted" />
      <Stepper steps={['sale.steps.customer', 'exchange.oldDevice', 'exchange.newDevice', 'sale.steps.payment']} current={Math.min(step, 3)} />

      {step === 0 ? (
        <>
          <PartyPicker value={party} onChange={setParty} kind="customer" label="sale.selectCustomer" />
          <BiButton text="common.next" full disabled={!party} onClick={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          {old ? (
            <button type="button" onClick={() => setEditingOld(true)} className="card text-start">
              <div className="font-semibold">{old.brand_name} {old.model_name}</div>
              <div className="flex justify-between text-sm text-muted"><span dir="ltr">{old.imei1}</span><MoneyText value={old.cost} tone="ink" /></div>
            </button>
          ) : <BiButton text="exchange.oldDevice" variant="secondary" full onClick={() => setEditingOld(true)} />}
          <BiButton text="common.next" full disabled={!old} onClick={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          {newDev ? (
            <div className="card p-0"><DeviceRow d={newDev} onClick={() => setPicking(true)} /></div>
          ) : <BiButton text="sale.pickDevice" variant="secondary" full onClick={() => setPicking(true)} />}
          {newDev ? <BiInput label="sale.price" type="number" inputMode="decimal" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /> : null}
          <BiButton text="common.next" full disabled={!newDev || !price} onClick={() => setStep(3)} />
        </>
      ) : null}

      {step === 3 && !result ? (
        <>
          <div className="card">
            <KV k="exchange.newDevice" v={<MoneyText value={total} tone="ink" />} />
            <KV k="exchange.tradeValue" v={<MoneyText value={-tradeIn} tone="ink" />} />
            <KV k="exchange.previous" v={<MoneyText value={previous} />} />
          </div>
          {diff > 0 ? <BiInput label="sale.paidNow" type="number" inputMode="decimal" min={0} max={diff} value={paid} onChange={(e) => setPaid(e.target.value)} /> : <KV k="exchange.refund" v={<MoneyText value={-diff} tone="ink" />} />}
          <div className="hero flex items-center justify-between p-4">
            <BiLabel text="exchange.newBalance" size="md" tone="text-gold-text" bold />
            <span className="num text-2xl text-gold-text" dir="ltr">{newBalance.toLocaleString('en-US')}</span>
          </div>
          <ErrorText error={m.error} />
          <BiButton
            text="common.confirm"
            full
            loading={m.isPending}
            onClick={async () => {
              const res = await m.mutateAsync({ party_id: party!.id, trade_in: [draftToApi(old!)], devices: [{ device_id: newDev!.id, price: total }], paid: diff > 0 ? Number(paid || 0) : 0, refund: diff < 0 ? -diff : 0 })
              setResult(res)
            }}
          />
        </>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="hero flex flex-col items-center gap-1 p-5">
            <BiLabel text="exchange.done" size="lg" bold tone="text-gold-text" />
            <div className="num text-xl" dir="ltr">{result.no}</div>
            <KV k="exchange.newBalance" v={<MoneyText value={result.new_balance} tone="ink" size="lg" />} />
          </div>
          <BiButton text="sale.printThermal" full onClick={() => openPrintable(`/api/v1/sales/${result.invoice_id}/receipt?format=thermal`)} />
        </div>
      ) : null}

      <Sheet open={editingOld} onClose={() => setEditingOld(false)} title="exchange.oldDevice">
        {editingOld ? <DeviceLineSheet initial={old ?? emptyDraft('', 'trade_in')} onSave={(d) => { setOld(d); setEditingOld(false) }} /> : null}
      </Sheet>
      <Sheet open={picking} onClose={() => setPicking(false)} title="sale.pickDevice">
        <div className="flex flex-col gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />
          <List>{stock?.map((d) => <DeviceRow key={d.id} d={d} onClick={() => { setNewDev(d); setPrice(d.asking_price ?? ''); setPicking(false) }} />)}</List>
        </div>
      </Sheet>
    </div>
  )
}
