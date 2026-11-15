/** Edit / Delete beside every sale and purchase row (owner 2026-11-15, ADR-086). A sale or purchase
 *  entered by mistake is deleted from its row: the app cancels it (the phone goes back to / out of
 *  stock, the khata and the galla are reversed) and keeps it in the record as Deleted, with who, when
 *  and why — so the books always add up. Edit opens the bill, where its fixes are (customer / dealer,
 *  paid, price). Delete is for the owner / manager; a bill whose phone has moved on (sold again,
 *  returned) cannot be deleted — the app says so. */

import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { post } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'

export type BillKind = 'sale' | 'purchase' | 'repair' | 'payment'
const PATHS: Record<BillKind, { del: (id: string) => string; edit: (id: string) => string; hint: string }> = {
  sale: { del: (id) => `/api/v1/sales/${id}/void`, edit: (id) => `/sales/${id}`, hint: 'bill.deleteSaleHint' },
  purchase: { del: (id) => `/api/v1/purchases/${id}/void`, edit: (id) => `/purchases/${id}`, hint: 'bill.deletePurchaseHint' },
  repair: { del: (id) => `/api/v1/repairs/${id}/cancel`, edit: (id) => `/repairs/${id}`, hint: 'bill.deleteRepairHint' },
  payment: { del: (id) => `/api/v1/payments/${id}/void`, edit: () => '', hint: 'bill.deletePaymentHint' },
}

/** `editTo`: where Edit goes (default the bill's page; null hides Edit) */
export default function BillActions({ kind, id, no, canDelete, editTo, onDone }: { kind: BillKind; id: string; no: string; canDelete: boolean; editTo?: string | null; onDone?: () => void }) {
  const { pick, ur, cls } = useLang()
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
      await inv('sales', 'sale', 'purchases', 'purchase', 'devices', 'device', 'parties', 'party', 'invoices', 'dashboard', 'day', 'repairs', 'repair', 'payments', 'stock-status')
      setOpen(false)
      onDone?.()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-1 pe-2" data-testid={`bill-actions-${no}`}>
      {editPath ? (
        <button type="button" aria-label={pick('bill.edit')} title={pick('bill.edit')} onClick={() => nav(editPath)} className={`${btn} text-emerald-deep`} data-testid="bill-edit">
          <Pencil size={16} />
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" aria-label={pick('bill.delete')} title={pick('bill.delete')} onClick={() => { setReason(''); setErr(null); setOpen(true) }} className={`${btn} text-payable`} data-testid="bill-delete">
          <Trash2 size={16} />
        </button>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={{ en: `${pick('bill.delete')} · ${no}`, ur: `${pick('bill.delete')} · ${no}` }}>
        <div className="flex flex-col gap-3">
          <div className={`rounded-2xl bg-payable-tint px-3 py-2 text-payable ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(P.hint)}</div>
          <BiInput label="common.reason" help={<Help term="void" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} autoFocus placeholder={pick('bill.reasonPh')} />
          <BiLabel text="bill.kept" size="sm" tone="text-muted" />
          <ErrorText error={err} />
          <BiButton text="bill.deleteConfirm" variant="danger" full loading={busy} disabled={reason.trim().length < 3} onClick={() => void del()} data-testid="bill-delete-confirm" />
        </div>
      </Sheet>
    </span>
  )
}
