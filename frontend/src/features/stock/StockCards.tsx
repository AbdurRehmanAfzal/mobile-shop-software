/** The stock screen's top (owner brief 2026-11-10, ADR-059): the kind of stock (phones / tablets /
 *  watches here, accessories / spare parts / other on the items screen) and status cards that also
 *  filter the list. Counts come from GET /devices/stock-status (nothing is posted by looking). */

import { AlertTriangle, Bookmark, CheckCircle2, Clock, Headphones, Lock, PackageX, Search, UserCheck, Wallet, Wrench } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import NotInPackage, { useMissingLines, type Line } from '@/components/NotInPackage'
import { Sheet } from '@/components/ui'
import { useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { useGet } from '@/lib/queries'
import { kindLabel } from '@/components/ItemKinds'
import { withCur } from '@/lib/format'
import { useTrade } from '@/lib/modules'

export type Kind = '' | 'phone' | 'tablet' | 'watch' | 'laptop'
export type Mode = '' | 'sellable' | 'reserved' | 'inspection' | 'in_repair' | 'faulty' | 'with_customer_for_approval' | 'locked'

interface StockStatus {
  units: { on_hand: number; available: number; reserved: number; inspection: number; in_repair: number; faulty: number; approval: number; on_loan: number; locked?: number }
  by_kind?: Record<string, number>
  items: { on_hand: number; low: number; out: number; reserved: number }
  value_cost: string | null
  units_value_cost: string | null
}

const KINDS: { k: Kind | 'items' | 'part' | 'other'; label: string }[] = [
  { k: '', label: 'stock.kind.all' },
  { k: 'phone', label: 'stock.kind.phone' },
  { k: 'tablet', label: 'stock.kind.tablet' },
  { k: 'watch', label: 'stock.kind.watch' },
  { k: 'laptop', label: 'stock.kind.laptop' }, // only with the laptops module (ADR-108)
  { k: 'items', label: 'stock.kind.items' },
  { k: 'part', label: 'stock.kind.part' },
  { k: 'other', label: 'stock.kind.other' },
]

/** ADR-121: the same row on the phones' screen and on the items' screen (`value="items"`), so every
 *  kind of stock — mobiles, tablets, watches, laptops, accessories — is one tap from any of them.
 *  The chips wrap (on a phone the last ones used to be out of sight) and carry what is on hand. */
export function KindTabs({ value, onChange }: { value: Kind | 'items'; onChange: (k: Kind) => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const trade = useTrade() // ADR-108 / ADR-109: only the kinds this shop trades
  const off = new Set<string>([...(trade.mobiles ? [] : ['phone', 'tablet', 'watch']), ...(trade.laptops ? [] : ['laptop']), ...(trade.accessories ? [] : ['items', 'part', 'other'])])
  const missing = useMissingLines() // ADR-122: shown locked, with how to ask for them
  const [asking, setAsking] = useState<Line | null>(null)
  const { data } = useGet<StockStatus>(['stock-status', ''], '/api/v1/devices/stock-status')
  const count = (k: string): number | null => (!data ? null : k === '' ? data.units.on_hand : k === 'items' ? data.items.on_hand : k === 'part' || k === 'other' ? null : (data.by_kind?.[k] ?? 0))
  return (
    <div className="flex items-start gap-1">
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 pb-1" data-testid="stock-kinds">
        {/* a shop with no phones or laptops has no "all": its items are its stock (ADR-123) */}
        {KINDS.filter(({ k }) => !off.has(k) && (trade.devices || k !== '')).map(({ k, label }) => {
          const on = value === k
          const c = count(k)
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
              {c != null ? <span className={`num ms-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${on ? 'bg-ground/20 text-ground' : 'bg-ground text-muted'}`} dir="ltr" data-testid={`kind-count-${k || 'all'}`}>{c}</span> : null}
            </button>
          )
        })}
        {missing.map((l) => (
          <button key={l} type="button" onClick={() => setAsking(l)} className={`tap inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border-2 border-dashed border-line bg-ground px-3.5 font-bold text-muted ${ur ? cls('sm') : 'text-[13px]'}`} data-testid={`kind-locked-${l}`}>
            <Lock size={14} />{pick(`pkg.short.${l}`)}
          </button>
        ))}
      </div>
      <Help term="stock.kinds" size="sm" />
      <Sheet open={asking !== null} onClose={() => setAsking(null)} title="pkg.title">
        {asking ? <NotInPackage only={[asking]} bare /> : null}
      </Sheet>
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
        {u.locked || mode === 'locked' ? card('locked', Lock, 'stock.card.locked', u.locked ?? 0, 'bg-payable-tint text-payable', mode === 'locked', () => toggle('locked')) : null}
        {!kind ? card('low', Clock, 'stock.card.low', data.items.low, 'bg-khata text-khata-fg', false, () => nav('/accessories?tab=low')) : null}
        {!kind ? card('out', PackageX, 'stock.card.out', data.items.out, 'bg-expense text-expense-fg', false, () => nav('/accessories?out=1')) : null}
        {canCost && data.value_cost != null ? card('value', Wallet, 'stock.card.value', Number(kind ? data.units_value_cost : data.value_cost).toLocaleString('en-US', { maximumFractionDigits: 0 }), 'bg-surface text-ink', false, () => undefined) : null}
      </div>
      <Help term="stock.cards" size="sm" />
    </div>
  )
}

/** ADR-123: a shop that trades no phones or laptops has one stock — its items. "Stock" opens
 *  them, wherever the link came from (the tab already did; the Home chip and old links did not). */
export function StockGate({ children }: { children: ReactNode }) {
  const trade = useTrade()
  if (!trade.devices && trade.accessories) return <Navigate to={`/accessories${window.location.search}`} replace />
  return <>{children}</>
}

interface ItemRow { id: string; name: string; name_ur: string | null; variant?: string | null; qty: number; price: string; sku?: string; category?: string; brand?: string | null; color?: string | null; compatible?: string | null; location?: string | null; low_stock?: boolean }
const FIRST_ITEMS = 10

/** ADR-121 / ADR-123 / ADR-130: on "All stock" the accessories are part of the list, with their
 *  details — kind, brand, code, what it fits, pieces, price, running low / finished — as on the
 *  items' own screen. The first ten (or what the search finds), and the rest opens in place.
 *  Above the phones, so they are seen without scrolling. Read-only: a row opens the item. */
export function ItemsInStock({ q = '' }: { q?: string }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const trade = useTrade()
  const on = trade.accessories
  const [all, setAll] = useState(false)
  const { data } = useGet<StockStatus>(['stock-status', ''], on ? '/api/v1/devices/stock-status' : null)
  const text = q.trim()
  const { data: items } = useGet<ItemRow[]>(['stock-items-peek', text], on ? `/api/v1/accessories${text ? `?q=${encodeURIComponent(text)}` : ''}` : null)
  if (!on || !data) return null
  const i = data.items
  const rows = all ? (items ?? []) : (items ?? []).slice(0, FIRST_ITEMS)
  if (text && !rows.length) return null // searching for a phone: no empty box about items
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const to = `/accessories${text ? `?q=${encodeURIComponent(text)}` : ''}`
  return (
    <section className="flex flex-col rounded-2xl border-2 border-line bg-surface" data-testid="stock-items">
      <button type="button" onClick={() => nav(to)} className="tap flex min-h-16 items-center gap-3 px-4 py-3 text-start" data-testid="stock-items-card">
        <span className="well h-11 w-11 shrink-0 rounded-2xl bg-khata text-khata-fg"><Headphones size={22} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick('stock.itemsCard.t')}</span>
          <span className={`text-muted ${small}`}>{pick('stock.itemsCard.sub').replace('{{n}}', String(i.on_hand)).replace('{{low}}', String(i.low)).replace('{{out}}', String(i.out))}</span>
        </span>
        <span className={`shrink-0 rounded-full bg-ink px-3 py-1.5 font-bold text-ground ${small}`}>{pick('stock.itemsCard.open')}</span>
      </button>
      {rows.map((r) => {
        const facts = [r.category ? kindLabel(pick, r.category) : null, r.brand, r.color && r.color !== r.variant ? r.color : null, r.compatible].filter(Boolean)
        return (
          <button key={r.id} type="button" onClick={() => nav(`/accessories/${r.id}`)} className="tap flex min-h-14 items-center gap-3 border-t border-line px-4 py-2 text-start" data-testid="stock-item-row">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className={`min-w-0 break-words ${ur ? cls('sm') : 'text-sm font-bold'}`} dir="auto">{ur && r.name_ur ? r.name_ur : r.name}</span>
                {r.variant ? <span className="rounded-md bg-emerald-tint px-1.5 py-0.5 text-[11px] font-bold text-emerald-deep">{r.variant}</span> : null}
                {r.low_stock || r.qty <= 0 ? <span className="rounded-md bg-payable-tint px-1.5 py-0.5 text-[11px] font-bold text-payable" data-testid="stock-item-flag">{pick(r.qty <= 0 ? 'acc.outOfStock' : 'acc.low')}</span> : null}
              </span>
              <span className={`flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted ${small}`} data-testid="stock-item-facts">
                {r.sku ? <span dir="ltr">{r.sku}</span> : null}
                {facts.map((f) => <span key={String(f)} className="min-w-0 break-words">· {f}</span>)}
                {r.location ? <span className="rounded-md border border-line px-1 text-[11px]">{r.location}</span> : null}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className={`num text-lg leading-tight ${r.qty <= 0 ? 'text-payable' : ''}`} dir="ltr" data-testid="stock-item-qty">{r.qty}</span>
              <span className={`num text-muted ${small}`} dir="ltr" data-testid="stock-item-price">{withCur(Number(r.price).toLocaleString('en-US', { maximumFractionDigits: 0 }))}</span>
            </span>
          </button>
        )
      })}
      {(items?.length ?? 0) > rows.length ? <button type="button" onClick={() => setAll(true)} className={`tap min-h-11 border-t border-line px-4 py-2 text-start font-bold text-emerald-deep ${small}`} data-testid="stock-items-all">{pick('stock.itemsCard.all').replace('{{n}}', String(items!.length))}</button> : null}
      {all && (items?.length ?? 0) > FIRST_ITEMS ? <button type="button" onClick={() => setAll(false)} className={`tap min-h-11 border-t border-line px-4 py-2 text-start font-bold text-emerald-deep ${small}`} data-testid="stock-items-less">{pick('stock.itemsCard.less')}</button> : null}
    </section>
  )
}
