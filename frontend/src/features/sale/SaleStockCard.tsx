/** A phone, tablet, watch or laptop in the sale's stock list, as a card (ADR-132, docs/43 mock-ups
 *  14 and 15): what it is, its marks (condition, PTA, the ID check, faults, a lock), its IMEI, the
 *  asking price and — only when the server sent it, that is with `VIEW_COST` — what it cost.
 *  One tap puts it on the bill; a pending or flagged ID check is on the card before the tap (ADR-128). */

import { Check, Plus } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { Chip, MoneyText } from '@/components/ui'
import { FaultChip } from '@/features/stock/Faults'
import { hasPta, specLine } from '@/features/stock/StockPage'
import { withCur } from '@/lib/format'
import type { Device } from '@/lib/types'

export type StockFilter = 'boxPack' | 'pta' | 'idPending' | 'noFaulty'
export const STOCK_FILTERS: StockFilter[] = ['boxPack', 'pta', 'idPending', 'noFaulty']

/** the quick filters over the list the server sent: they only hide rows, they never count or add */
export function passes(d: Device, on: StockFilter[]): boolean {
  if (on.includes('boxPack') && d.condition !== 'box_pack') return false
  if (on.includes('pta') && d.pta_status !== 'pta_approved') return false
  if (on.includes('idPending') && d.verification_status !== 'pending') return false
  if (on.includes('noFaulty') && (d.status === 'faulty' || !!d.faults?.length)) return false
  return true
}

export default function SaleStockCard({ d, onClick, picked = false }: { d: Device; onClick: () => void; picked?: boolean }) {
  const { pick, ur, cls } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  const spec = specLine(d, pick)
  const faulty = d.status === 'faulty' || !!d.faults?.length
  return (
    <button type="button" onClick={onClick} aria-pressed={picked} className={`tap card flex w-full min-w-0 flex-col gap-2 p-3.5 text-start transition-colors hover:border-ink ${picked ? 'border-emerald bg-emerald-tint/40' : faulty ? 'border-payable/30' : ''}`} data-testid="sale-card">
      <span className="flex items-start gap-2">
        {/* one text, as the stock list writes it ("Model · memory · colour"): the name stands out by its first line */}
        <span className="min-w-0 flex-1 break-words font-display text-[15px] font-extrabold leading-snug" dir="auto">{[`${d.brand_name} ${d.model_name}`, spec].filter(Boolean).join(' · ')}</span>
        <span className={`well h-8 w-8 shrink-0 rounded-full ${picked ? 'bg-emerald text-white' : 'bg-ground text-ink'}`}>{picked ? <Check size={16} strokeWidth={3} /> : <Plus size={16} />}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Chip text={`stock.condition.${d.condition}`} />
        {hasPta(d) && d.pta_status !== 'pta_approved' && !(d.lock_type && d.pta_status === 'unknown') ? <Chip text={`stock.pta.${d.pta_status}`} tone="warn" /> : null}
        {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
        <FaultChip faults={d.faults} />
        {d.lock_type ? <Chip text={`locked.type.${d.lock_type}`} tone="bad" /> : null}
      </span>
      <span className="flex items-end justify-between gap-2 border-t border-dashed border-line pt-2">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-xs text-muted" dir="ltr">{d.imei1 || d.serial}</span>
          <span className="text-[11px] font-bold text-muted">{pick(`stock.status.${d.status}`)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {d.asking_price ? <MoneyText value={d.asking_price} tone="ink" /> : null}
          {d.cost_price != null ? <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`} data-testid="sale-card-cost">{pick('sale.costLine').replace('{{v}}', withCur(Number(d.cost_price).toLocaleString('en-US', { maximumFractionDigits: 0 })))}</span> : null}
        </span>
      </span>
    </button>
  )
}
