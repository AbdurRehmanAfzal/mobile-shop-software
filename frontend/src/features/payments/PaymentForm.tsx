import { useState, type FormEvent } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { isQueued } from '@/lib/offline'
import PayPicker, { newPay, payInfo, payReady, remitPkr, type PayState } from '@/components/PayPicker'
import Help from '@/components/Help'
import { ErrorText, MoneyText } from '@/components/ui'
import { Printer } from 'lucide-react'
import { openPrintable } from '@/lib/files'
import { useDocMutation } from '@/lib/queries'
import { uid } from '@/lib/id'
import type { Party, Payment } from '@/lib/types'
import {withCur } from '@/lib/format'

/** owner 2026-10-30: a payment for one specific bill (one phone) — allocated to it, up to what is left */
export interface Allocation { document_type: 'invoice' | 'purchase'; document_id: string; document_no: string; remaining: number }

/** `lending` = len-den (docs/32): money given / taken with no bill, never put on a bill when it is made */
/** `amount`: prefilled (an open balance with no bill behind it); `noAllocation`: the money is for
 *  something that is not a bill (a lab charge, a return credit), so it must not be put on another
 *  bill of the same person; one Idempotency-Key per form, so a retry posts it once (ADR-058) */
export default function PaymentForm({ party, direction, onDone, allocation, allocations, lending, amount: start, noAllocation }: { party: Party; direction: 'in' | 'out'; onDone: (p: Payment) => void; allocation?: Allocation; allocations?: Allocation[]; lending?: boolean; amount?: number; noAllocation?: boolean }) {
  const { pick } = useLang()
  // owner 2026-11-13: several bills at once (a brand's or a model's phones); a bill shared by two
  // phones comes once with both remainders, never more than the bill has left
  const many = (() => {
    if (!allocations?.length) return null
    const by = new Map<string, Allocation>()
    for (const a of allocations) { const x = by.get(a.document_id); by.set(a.document_id, x ? { ...x, remaining: x.remaining + a.remaining } : { ...a }) }
    return [...by.values()]
  })()
  const manyTotal = many ? Math.round(many.reduce((t, a) => t + a.remaining, 0) * 100) / 100 : 0
  const [amount, setAmount] = useState(allocation ? String(allocation.remaining) : many ? String(manyTotal) : start ? String(start) : '')
  const [idem] = useState(uid)
  // cash / online / cheque / from abroad, the same as on a sale (owner 2026-10-28)
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [result, setResult] = useState<Payment | null>(null)
  const [queued, setQueued] = useState(false)
  const m = useDocMutation<Record<string, unknown>, Payment>('POST', () => '/api/v1/payments', undefined, { kind: 'payment', label: (b) => `${pick(lending ? (direction === 'in' ? 'lending.take' : 'lending.give') : direction === 'in' ? 'pay.in' : 'pay.out')} · ${party.name} · ${withCur(Number((b as { amount?: number }).amount ?? 0).toLocaleString('en-US'))}` }, { key: () => idem })

  async function submit(e: FormEvent) {
    e.preventDefault()
    let alloc = allocation ? [{ document_type: allocation.document_type, document_id: allocation.document_id, amount: Math.min(Number(amount), allocation.remaining) }] : undefined
    if (many) {
      // oldest bill first, each up to what it has left; anything more stays on the khata
      let left = Number(amount)
      alloc = []
      for (const a of many) { if (left <= 0) break; const x = Math.min(left, a.remaining); if (x > 0) alloc.push({ document_type: a.document_type, document_id: a.document_id, amount: Math.round(x * 100) / 100 }); left -= x }
    }
    const res = await m.mutateAsync({ party_id: party.id, direction, amount: Number(amount), payment: payInfo(pay), notes: notes || undefined, allocations: alloc ?? (noAllocation ? [] : undefined), purpose: lending ? 'lending' : undefined, due_date: lending && due ? due : undefined })
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
            <span className="flex items-center gap-1"><BiLabel text="pay.allocated" size="sm" tone="text-muted" /><Help term="payment.allocated" size="sm" /></span>
            {result.allocations.map((a) => (
              <div key={a.document_id} className="flex justify-between py-1" dir="ltr">
                <span>{a.document_no}</span>
                <MoneyText value={a.amount} tone="ink" size="sm" />
              </div>
            ))}
          </div>
        ) : null}
        {Number(result.unallocated) > 0 && !lending ? (
          <div className="flex items-center gap-1 text-sm text-muted">
            {pick('pay.unallocated')}<Help term="payment.advance" size="sm" />: <MoneyText value={result.unallocated} tone="ink" size="sm" />
          </div>
        ) : null}
        <div className="card flex items-center justify-between">
          <span className="flex items-center gap-1"><BiLabel text="party.balance" size="sm" tone="text-muted" /><Help term="payment.balance" size="sm" /></span>
          <MoneyText value={result.party_balance_after} />
        </div>
        <BiButton text="unit.printReceipt" icon={<Printer size={20} />} variant="secondary" full onClick={() => openPrintable(`/api/v1/payments/${result.id}/receipt?format=thermal`)} />
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
        <span className="flex items-center gap-1"><MoneyText value={party.balance} /><Help term="payment.balance" size="sm" /></span>
      </div>
      {allocation ? (
        <div className="flex items-center justify-between rounded-2xl bg-khata px-4 py-3 text-khata-fg">
          <span className="flex flex-col"><span className="flex items-center gap-1"><BiLabel text="unit.forBill" size="sm" tone="text-current" /><span className="[&_button]:text-current"><Help term="payment.forBill" size="sm" /></span></span><span className="font-bold" dir="ltr">{allocation.document_no}</span></span>
          <span className="flex flex-col items-end"><BiLabel text={direction === 'in' ? 'unit.stillToGet' : 'unit.stillToPay'} size="sm" tone="text-current" /><span className="num text-lg" dir="ltr">{allocation.remaining.toLocaleString('en-US')}</span></span>
        </div>
      ) : null}
      {many ? (
        <div className="flex items-center justify-between rounded-2xl bg-khata px-4 py-3 text-khata-fg" data-testid="pay-many">
          <span className="flex flex-col"><span className="flex items-center gap-1"><BiLabel text="unit.forBills" size="sm" tone="text-current" /><span className="[&_button]:text-current"><Help term="payment.forBill" size="sm" /></span></span><span className="font-bold" dir="ltr">{many.map((a) => a.document_no).join(', ')}</span></span>
          <span className="flex flex-col items-end"><BiLabel text={direction === 'in' ? 'unit.stillToGet' : 'unit.stillToPay'} size="sm" tone="text-current" /><span className="num text-lg" dir="ltr">{manyTotal.toLocaleString('en-US')}</span></span>
        </div>
      ) : null}
      {lending ? <span className="flex items-center gap-1"><BiLabel text={direction === 'in' ? 'lending.formHintIn' : 'lending.formHintOut'} size="sm" tone="text-muted" /><Help term="payment.lending" size="sm" /></span> : null}
      <BiInput label="common.amount" help={lending ? <Help term="payment.lendAmount" size="sm" /> : <Help term="payment.amount" size="sm" />} type="number" inputMode="decimal" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus hint={allocation && Number(amount) > allocation.remaining ? 'unit.moreThanLeft' : undefined} />
      <span className="flex items-center gap-1"><BiLabel text="pay.method" size="md" tone="text-muted" /><Help term="common.method" size="sm" /></span>
      <PayPicker value={pay} onChange={(p) => { setPay(p); if (p.method === 'remittance' && remitPkr(p) > 0) setAmount(String(remitPkr(p))) }} udhaar={false} remittance={direction === 'in'} />
      {lending ? <BiInput label="lending.dueDate" help={<Help term="payment.lendDue" size="sm" />} type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" /> : null}
      <BiInput label="common.notes" help={<Help term="common.notes" size="sm" />} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorText error={m.error} />
      <BiButton type="submit" text={lending ? (direction === 'in' ? 'lending.saveTake' : 'lending.saveGive') : direction === 'in' ? 'party.receive' : 'party.pay'} full loading={m.isPending} disabled={!payReady(pay)} variant={direction === 'in' ? 'primary' : 'secondary'} />
    </form>
  )
}
