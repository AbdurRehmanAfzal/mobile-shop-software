import { useState, type FormEvent } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { isQueued } from '@/lib/offline'
import PayPicker, { newPay, payInfo, payReady, remitPkr, type PayState } from '@/components/PayPicker'
import { ErrorText, MoneyText } from '@/components/ui'
import { useDocMutation } from '@/lib/queries'
import type { Party, Payment } from '@/lib/types'

export default function PaymentForm({ party, direction, onDone }: { party: Party; direction: 'in' | 'out'; onDone: (p: Payment) => void }) {
  const { pick } = useLang()
  const [amount, setAmount] = useState('')
  // cash / online / cheque / from abroad, the same as on a sale (owner 2026-10-28)
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<Payment | null>(null)
  const [queued, setQueued] = useState(false)
  const m = useDocMutation<Record<string, unknown>, Payment>('POST', () => '/api/v1/payments', undefined, { kind: 'payment', label: (b) => `${pick(direction === 'in' ? 'pay.in' : 'pay.out')} · ${party.name} · Rs. ${Number((b as { amount?: number }).amount ?? 0).toLocaleString('en-US')}` })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const res = await m.mutateAsync({ party_id: party.id, direction, amount: Number(amount), payment: payInfo(pay), notes: notes || undefined })
    if (isQueued(res)) {
      setQueued(true)
      return
    }
    setResult(res)
  }

  if (queued) return <BiAlert text="offline.queued" kind="info" />

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <BiLabel text="pay.saved" size="lg" bold tone="text-emerald-deep" />
        <div className="card flex items-center justify-between">
          <span className="text-sm text-muted">{result.no}</span>
          <MoneyText value={result.amount} tone="ink" size="lg" />
        </div>
        {result.allocations.length ? (
          <div className="card text-sm">
            <BiLabel text="pay.allocated" size="sm" tone="text-muted" />
            {result.allocations.map((a) => (
              <div key={a.document_id} className="flex justify-between py-1" dir="ltr">
                <span>{a.document_no}</span>
                <MoneyText value={a.amount} tone="ink" size="sm" />
              </div>
            ))}
          </div>
        ) : null}
        {Number(result.unallocated) > 0 ? (
          <div className="text-sm text-muted">
            {pick('pay.unallocated')}: <MoneyText value={result.unallocated} tone="ink" size="sm" />
          </div>
        ) : null}
        <div className="card flex items-center justify-between">
          <BiLabel text="party.balance" size="sm" tone="text-muted" />
          <MoneyText value={result.party_balance_after} />
        </div>
        <BiButton text="common.done" full onClick={() => onDone(result)} />
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="card flex items-center justify-between">
        <div>
          <div className="font-semibold">{party.name}</div>
          <div className="text-xs text-muted" dir="ltr">
            {party.phone}
          </div>
        </div>
        <MoneyText value={party.balance} />
      </div>
      <BiInput label="common.amount" type="number" inputMode="decimal" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
      <BiLabel text="pay.method" size="md" tone="text-muted" />
      <PayPicker value={pay} onChange={(p) => { setPay(p); if (p.method === 'remittance' && remitPkr(p) > 0) setAmount(String(remitPkr(p))) }} udhaar={false} remittance={direction === 'in'} />
      <BiInput label="common.notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorText error={m.error} />
      <BiButton type="submit" text={direction === 'in' ? 'party.receive' : 'party.pay'} full loading={m.isPending} disabled={!payReady(pay)} variant={direction === 'in' ? 'primary' : 'secondary'} />
    </form>
  )
}
