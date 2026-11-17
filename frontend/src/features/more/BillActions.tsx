/** Edit / Delete beside every entry's row (owner 2026-11-15, ADR-086 / ADR-090): sales, purchases,
 *  repairs, payments, len-den, expenses and exchanges. Delete never removes anything: the entry is
 *  cancelled (stock, galla and khata reversed) and kept in the record as Deleted, with who, when and
 *  why — so the books always add up. Before it, the sheet says what will happen, with an example.
 *  Edit opens the entry (or its edit form). Delete is for the owner / manager; when something
 *  depends on the entry (a phone sold on, a later payment), the app says what to undo first. */

import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import DeleteBlockers from '@/components/DeleteBlockers'
import DeleteWarning, { type DelKind } from '@/components/DeleteWarning'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { post } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'

export type BillKind = 'sale' | 'purchase' | 'repair' | 'payment' | 'lending' | 'expense' | 'exchange' | 'saleReturn' | 'purchaseReturn'
const PATHS: Record<BillKind, { del: (id: string) => string; edit: (id: string) => string }> = {
  sale: { del: (id) => `/api/v1/sales/${id}/void`, edit: (id) => `/sales/${id}` },
  purchase: { del: (id) => `/api/v1/purchases/${id}/void`, edit: (id) => `/purchases/${id}` },
  repair: { del: (id) => `/api/v1/repairs/${id}/cancel`, edit: (id) => `/repairs/${id}` },
  payment: { del: (id) => `/api/v1/payments/${id}/void`, edit: () => '' },
  lending: { del: (id) => `/api/v1/payments/${id}/void`, edit: () => '' },
  expense: { del: (id) => `/api/v1/expenses/${id}/void`, edit: () => '' },
  exchange: { del: (id) => `/api/v1/exchanges/${id}/void`, edit: () => '' },
  saleReturn: { del: (id) => `/api/v1/returns/${id}/void`, edit: () => '' },
  purchaseReturn: { del: (id) => `/api/v1/returns/${id}/void`, edit: () => '' },
}

/** `editTo`: where Edit goes (default the bill's page; null hides Edit); `onEdit` opens an edit form
 *  in place instead */
export default function BillActions({ kind, id, no, canDelete, editTo, onEdit, onDone, label }: { kind: BillKind; id: string; no: string; canDelete: boolean; editTo?: string | null; onEdit?: () => void; onDone?: () => void; /** a full-width delete button with this text (detail screens) instead of the row icons */ label?: string }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const P = PATHS[kind]
  const editPath = editTo === undefined ? P.edit(id) : editTo
  const btn = 'tap inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface'

  async function del() {
    setBusy(true)
    setErr(null)
    try {
      await post(P.del(id), { reason: reason.trim() })
      await inv('sales', 'sale', 'purchases', 'purchase', 'devices', 'device', 'parties', 'party', 'invoices', 'dashboard', 'day', 'repairs', 'repair', 'payments', 'stock-status', 'expenses', 'exchanges', 'lending', 'accounts', 'returns')
      setOpen(false)
      onDone?.()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={label ? 'flex w-full' : 'flex shrink-0 items-center gap-1 pe-2'} data-testid={`bill-actions-${no}`}>
      {label ? <BiButton text={label} size="md" variant="danger" full onClick={() => { setReason(''); setErr(null); setOpen(true) }} data-testid="bill-delete" /> : null}
      {!label && (onEdit || editPath) ? (
        <button type="button" aria-label={pick('bill.edit')} title={pick('bill.edit')} onClick={() => (onEdit ? onEdit() : nav(editPath!))} className={`${btn} text-emerald-deep`} data-testid="bill-edit">
          <Pencil size={16} />
        </button>
      ) : null}
      {!label && canDelete ? (
        <button type="button" aria-label={pick('bill.delete')} title={pick('bill.delete')} onClick={() => { setReason(''); setErr(null); setOpen(true) }} className={`${btn} text-payable`} data-testid="bill-delete">
          <Trash2 size={16} />
        </button>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={{ en: `${pick('bill.delete')} · ${no}`, ur: `${pick('bill.delete')} · ${no}` }}>
        <div className="flex flex-col gap-3">
          <DeleteBlockers kind={kind} id={id} open={open} onGo={() => setOpen(false)} />
          <DeleteWarning kind={kind as DelKind} />
          <BiInput label="common.reason" help={<Help term="void" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} autoFocus placeholder={pick('bill.reasonPh')} />
          <BiLabel text="bill.kept" size="sm" tone="text-muted" />
          <ErrorText error={err} />
          <BiButton text="bill.deleteConfirm" variant="danger" full loading={busy} disabled={reason.trim().length < 3} onClick={() => void del()} data-testid="bill-delete-confirm" />
        </div>
      </Sheet>
    </span>
  )
}
