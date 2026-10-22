import { useState, type FormEvent } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { ErrorText, MoneyText } from '@/components/ui'
import { useCashAccounts, useDocMutation } from '@/lib/queries'
import type { Party, Payment } from '@/lib/types'

type Method = 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'card'

export default function PaymentForm({ party, direction, onDone }: { party: Party; direction: 'in' | 'out'; onDone: (p: Payment) => void }) {
  const { pick } = useLang()
  const { data: accounts } = useCashAccounts()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [accountId, setAccountId] = useState<string>('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<Payment | null>(null)
  const m = useDocMutation<Record<string, unknown>, Payment>('POST', () => '/api/v1/payments')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const res = await m.mutateAsync({ party_id: party.id, direction, amount: Number(amount), method, cash_account_id: accountId || undefined, reference: reference || undefined, notes: notes || undefined })
    setResult(res)
  }

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
      <div>
        <BiLabel text="pay.method" size="md" tone="text-muted" className="mb-1.5" />
        <BiSegmented<Method>
          value={method}
          onChange={setMethod}
          options={[
            { value: 'cash', text: 'pay.cash' },
            { value: 'easypaisa', text: 'pay.easypaisa' },
            { value: 'jazzcash', text: 'pay.jazzcash' },
            { value: 'bank', text: 'pay.bank' },
          ]}
        />
      </div>
      {accounts && accounts.length > 1 ? (
        <div>
          <BiLabel text={direction === 'in' ? 'sale.receivedIn' : 'purchase.cashAccount'} size="md" tone="text-muted" className="mb-1.5" />
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 font-semibold">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <BiInput label="pay.reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <BiInput label="common.notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <ErrorText error={m.error} />
      <BiButton type="submit" text={direction === 'in' ? 'party.receive' : 'party.pay'} full loading={m.isPending} variant={direction === 'in' ? 'primary' : 'secondary'} />
    </form>
  )
}
