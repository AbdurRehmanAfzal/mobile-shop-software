/** Before anything is deleted (owner 2026-11-15, ADR-090): what will happen — stock, galla, khata,
 *  reports — and a worked example, in the shop's language. Every delete sheet shows it. */

import { AlertTriangle } from 'lucide-react'
import { BiLabel, useLang } from './Bilingual'

export type DelKind =
  | 'sale' | 'purchase' | 'repair' | 'payment' | 'lending' | 'expense' | 'exchange'
  | 'party' | 'accessory' | 'oldStock' | 'cashAccount' | 'expenseCategory' | 'catalogue' | 'held' | 'labTrip'

export default function DeleteWarning({ kind }: { kind: DelKind }) {
  const { pick, ur, cls } = useLang()
  const body = ur ? cls('sm') : 'text-sm'
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-payable/30 bg-payable-tint px-3 py-2.5" data-testid="delete-warning">
      <span className="flex items-center gap-2 text-payable">
        <AlertTriangle size={18} className="shrink-0" />
        <BiLabel text="del.whatHappens" size="md" bold tone="text-payable" />
      </span>
      <p className={`${body} font-semibold text-ink`}>{pick(`del.${kind}.effect`)}</p>
      <p className={`${body} text-muted`}><span className="font-bold">{pick('del.example')}: </span>{pick(`del.${kind}.example`)}</p>
    </div>
  )
}
