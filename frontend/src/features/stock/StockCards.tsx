/** The stock screen's top (owner brief 2026-11-10, ADR-059): the kind of stock (phones / tablets /
 *  watches here, accessories / spare parts / other on the items screen) and status cards that also
 *  filter the list. Counts come from GET /devices/stock-status (nothing is posted by looking). */

import { AlertTriangle, Bookmark, CheckCircle2, Clock, PackageX, Search, UserCheck, Wallet, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { useGet } from '@/lib/queries'

export type Kind = '' | 'phone' | 'tablet' | 'watch'
export type Mode = '' | 'sellable' | 'reserved' | 'inspection' | 'in_repair' | 'faulty' | 'with_customer_for_approval'

interface StockStatus {
  units: { on_hand: number; available: number; reserved: number; inspection: number; in_repair: number; faulty: number; approval: number; on_loan: number }
  items: { on_hand: number; low: number; out: number; reserved: number }
  value_cost: string | null
  units_value_cost: string | null
}

const KINDS: { k: Kind | 'items' | 'part' | 'other'; label: string }[] = [
  { k: '', label: 'stock.kind.all' },
  { k: 'phone', label: 'stock.kind.phone' },
  { k: 'tablet', label: 'stock.kind.tablet' },
  { k: 'watch', label: 'stock.kind.watch' },
  { k: 'items', label: 'stock.kind.items' },
  { k: 'part', label: 'stock.kind.part' },
  { k: 'other', label: 'stock.kind.other' },
]

export function KindTabs({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-1">
      <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1" data-testid="stock-kinds">
        {KINDS.map(({ k, label }) => {
          const on = value === k
          return (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => (k === 'items' ? nav('/accessories') : k === 'part' || k === 'other' ? nav(`/accessories?category=${k}`) : onChange(k))}
              className={`tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}
              data-testid={`kind-${k || 'all'}`}
            >
              {pick(label)}
            </button>
          )
        })}
      </div>
      <Help term="stock.kinds" size="sm" />
    </div>
  )
}

export function StatusCards({ kind, mode, onMode, canCost }: { kind: Kind; mode: Mode; onMode: (m: Mode) => void; canCost: boolean }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const { data } = useGet<StockStatus>(['stock-status', kind], `/api/v1/devices/stock-status${kind ? `?category=${kind}` : ''}`)
  if (!data) return null
  const u = data.units
  const small = ur ? cls('sm') : 'text-[11px] font-semibold'
  const card = (key: string, Icon: typeof Search, label: string, value: string | number, tone: string, on: boolean, onClick: () => void, sub?: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className={`tap flex min-w-[118px] shrink-0 flex-col items-start gap-0.5 rounded-2xl border-2 px-3 py-2 text-start ${on ? 'border-ink' : 'border-line'} ${tone}`} data-testid={`card-${key}`}>
      <span className="flex items-center gap-1"><Icon size={14} /><span className={small}>{pick(label)}</span></span>
      <span className="num text-xl font-extrabold" dir="ltr">{value}</span>
      {sub ? <span className={`opacity-80 ${small}`}>{sub}</span> : null}
    </button>
  )
  const toggle = (m: Mode) => onMode(mode === m ? '' : m)
  return (
    <div className="flex items-center gap-1">
      <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1" data-testid="stock-cards">
        {card('available', CheckCircle2, 'stock.card.available', u.available, 'bg-emerald-tint text-emerald-deep', mode === 'sellable', () => toggle('sellable'), `${pick('stock.card.onHand')} ${u.on_hand}`)}
        {card('reserved', Bookmark, 'stock.card.reserved', u.reserved, 'bg-gold-tint text-ink', mode === 'reserved', () => toggle('reserved'), !kind && data.items.reserved ? pick('stock.card.itemsHeld').replace('{{n}}', String(data.items.reserved)) : undefined)}
        {card('approval', UserCheck, 'stock.card.approval', u.approval, 'bg-surface text-ink', mode === 'with_customer_for_approval', () => toggle('with_customer_for_approval'))}
        {card('inspection', Search, 'stock.card.inspection', u.inspection, 'bg-gold-tint text-ink', mode === 'inspection', () => toggle('inspection'))}
        {card('repair', Wrench, 'stock.card.repair', u.in_repair, 'bg-surface text-ink', mode === 'in_repair', () => toggle('in_repair'))}
        {card('faulty', AlertTriangle, 'stock.card.faulty', u.faulty, 'bg-payable-tint text-payable', mode === 'faulty', () => toggle('faulty'))}
        {!kind ? card('low', Clock, 'stock.card.low', data.items.low, 'bg-khata text-khata-fg', false, () => nav('/accessories?tab=low')) : null}
        {!kind ? card('out', PackageX, 'stock.card.out', data.items.out, 'bg-expense text-expense-fg', false, () => nav('/accessories?out=1')) : null}
        {canCost && data.value_cost != null ? card('value', Wallet, 'stock.card.value', Number(kind ? data.units_value_cost : data.value_cost).toLocaleString('en-US', { maximumFractionDigits: 0 }), 'bg-surface text-ink', false, () => undefined) : null}
      </div>
      <Help term="stock.cards" size="sm" />
    </div>
  )
}
