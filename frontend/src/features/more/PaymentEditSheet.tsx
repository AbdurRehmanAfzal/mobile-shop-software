/** Edit a payment or len-den (owner 2026-11-15, ADR-090): the amount, date and note. The old entry is
 *  cancelled and a corrected one is posted in one go (`PUT /payments/{id}`) — the khata and the
 *  bills it paid follow; the old one stays as Deleted, "Edited, replaced by …". */

import { useState } from 'react'
import { BiButton, BiInput, BiLabel } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'

export interface EditablePayment { id: string; no: string; amount: string; date: string; notes?: string | null; purpose?: string | null; due_date?: string | null }

export default function PaymentEditSheet({ p, onClose, onDone }: { p: EditablePayment | null; onClose: () => void; onDone?: () => void }) {
  const inv = useInvalidate()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [due, setDue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [forId, setForId] = useState<string | null>(null)
  if (p && forId !== p.id) {
    // a new entry was opened: start from its values
    setForId(p.id)
    setAmount(String(Number(p.amount)))
    setDate(p.date)
    setNotes(p.notes ?? '')
    setDue(p.due_date ?? '')
    setReason('')
    setErr(null)
  }
  const lending = p?.purpose === 'lending'

  async function save() {
    if (!p) return
    setBusy(true)
    setErr(null)
    try {
      await api('PUT', `/api/v1/payments/${p.id}`, { amount: Number(amount), date: date || undefined, notes, due_date: lending && due ? due : undefined, reason: reason.trim() })
      await inv('payments', 'parties', 'party', 'sales', 'sale', 'purchases', 'purchase', 'lending', 'dashboard', 'day', 'accounts')
      setForId(null)
      onClose()
      onDone?.()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={p !== null} onClose={() => { setForId(null); onClose() }} title={{ en: `${p?.no ?? ''}`, ur: `${p?.no ?? ''}` }}>
      <div className="flex flex-col gap-3" data-testid="payment-edit">
        <BiLabel text="pedit.hint" size="sm" tone="text-muted" />
        <BiInput label="common.amount" help={<Help term="common.amount" size="sm" />} type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="pedit-amount" />
        <BiInput label="common.date" type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
        {lending ? <BiInput label="lending.dueDate" type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" /> : null}
        <BiInput label="common.notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <BiInput label="common.reason" help={<Help term="void" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} data-testid="pedit-reason" />
        <ErrorText error={err} />
        <BiButton text="common.save" full loading={busy} disabled={!(Number(amount) > 0) || reason.trim().length < 3} onClick={() => void save()} data-testid="pedit-save" />
      </div>
    </Sheet>
  )
}
