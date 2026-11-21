/** Counted goods (owner, 2026-10-28): accessories and ordinary watches, picked from the shop's
 *  stock for a sale or a purchase. Selling one lowers its count and gives its profit; buying
 *  raises the count. When buying, a new item can be made right here. */

import { Plus, Watch } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, useLang } from './Bilingual'
import Help from './Help'
import { Empty, List, Loading, MoneyText, Row, SearchBox } from './ui'
import { kindLabel, useItemKinds } from './ItemKinds'
import ItemForm, { type Bought } from '@/features/accessories/ItemForm'
import KindCards from './KindCards'
import { LibraryHits, type LibEntry } from '@/features/accessories/ItemVariants'
import { useGet } from '@/lib/queries'
import { useScan } from '@/lib/scanner'

export interface StockItem { id: string; sku: string; name: string; name_ur: string | null; category: string; qty: number; price: string; avg_cost: string | null; brand?: string | null; color?: string | null; compatible?: string | null; grade?: string; variant?: string | null; units?: Record<string, number>; pack_units?: Record<string, number> | null; wholesale_price?: string | null; min_price?: string | null; warranty_days?: number; unit?: string }


export default function StockItemPicker({ mode, onPick }: { mode: 'sell' | 'buy'; onPick: (item: StockItem, bought?: { qty?: string; cost?: string }) => void }) {
  const { pick, ur, cls } = useLang()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [adding, setAdding] = useState(false)
  // ADR-121: a line of the built-in list tapped in the search opens the short form already filled
  const [from, setFrom] = useState<LibEntry | undefined>(undefined)
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (cat) params.set('category', cat)
  if (mode === 'sell') params.set('sale_only', 'true')
  // the search also matches a barcode, the maker's code and a supplier's SKU (docs/24 §A)
  const { data, isLoading } = useGet<StockItem[]>(['stock-items', params.toString()], `/api/v1/accessories?${params}`)
  useScan((code) => setQ(code))
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const name = (i: StockItem) => (ur && i.name_ur ? i.name_ur : i.name)
  const kinds = useItemKinds()

  if (adding) {
    // a new item right inside the purchase: the same form, with its duplicate warning and "More details"
    return (
      <div className="flex flex-col gap-3">
        {/* ADR-118: a product made with several variants comes back as a list to choose from */}
        <ItemForm compact initialName={from ? from.name : q.trim()} from={from} onDone={(it, all, bought?: Bought) => {
          const rows = all && all.length > 1 ? all : [it]
          // pieces written in the form: each such item goes on the bill with them; none written and
          // several variants made → back to the list to choose
          const withQty = rows.filter((r) => Number(bought?.qty[r.id] || 0) > 0)
          if (rows.length > 1 && !withQty.length) { setQ(it.name); setCat(''); setFrom(undefined); setAdding(false); return }
          for (const r of (withQty.length ? withQty : rows)) onPick(r as unknown as StockItem, { qty: bought?.qty[r.id] || undefined, cost: bought?.cost || undefined })
        }} />
        <BiButton text="common.back" variant="ghost" full onClick={() => { setFrom(undefined); setAdding(false) }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder={mode === 'buy' ? 'items.searchBuy' : 'items.search'} /></div><Help term="stock.itemSearch" size="sm" /></div>
      {mode === 'buy' && !q.trim() && !data?.length ? <BiLabel text="buy.howto" size="sm" tone="text-muted" /> : null}
      {/* ADR-124, buying: the kinds are cards under the search (a second way in); a tapped kind is one chip that can be taken off */}
      {mode === 'buy' && cat ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="buy-kind-on">
          <span className={chip(true)}>{kindLabel(pick, cat)}</span>
          <button type="button" onClick={() => setCat('')} className={`tap rounded-xl px-2 py-1 font-bold text-emerald-deep underline-offset-4 hover:underline ${ur ? cls('sm') : 'text-sm'}`} data-testid="buy-kind-clear">{pick('buy.allKinds')}</button>
        </div>
      ) : null}
      {mode === 'buy' && !cat && !q.trim() ? <KindCards onPick={(k) => setCat(k)} /> : null}
      <div className={`flex flex-wrap items-center gap-1.5 ${mode === 'buy' ? 'hidden' : ''}`}>
        <Help term="stock.itemKinds" size="sm" />
        <button type="button" aria-pressed={!cat} onClick={() => setCat('')} className={chip(!cat)}>{pick('common.all')}</button>
        {kinds.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>{kindLabel(pick, c)}</button>
        ))}
      </div>
      {mode === 'buy' ? <LibraryHits q={q} skip="" kind={cat} onPick={(e) => { setFrom(e); setAdding(true) }} /> : null}
      {mode === 'buy' ? <BiButton text="items.new" icon={<Plus size={20} />} variant="secondary" full onClick={() => { setFrom(undefined); setAdding(true) }} /> : null}
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty text={mode === 'buy' ? 'items.noneBuy' : 'items.noneSell'} />
      ) : (
        <List>
          {data.map((i) => {
            const out = mode === 'sell' && i.qty <= 0
            return (
              <Row
                key={i.id}
                icon={i.category === 'watch' ? <Watch size={20} /> : undefined}
                title={<span className="flex flex-wrap items-center gap-1.5">{name(i)}{i.variant ? <span className="rounded-md bg-ground px-1.5 py-0.5 text-[11px] font-bold text-ink" data-testid="item-variant">{i.variant}</span> : null}</span>}
                sub={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{kindLabel(pick, i.category)}{i.brand ? ` · ${i.brand}` : ''}{i.color && i.color !== i.variant ? ` · ${i.color}` : ''}{i.compatible ? ` · ${i.compatible}` : ''}</span>·
                    <span className={out ? 'font-bold text-payable' : ''}>{out ? pick('items.out') : `${pick('items.inStock')} ${i.qty}`}</span>
                  </span>
                }
                right={<MoneyText value={i.price} tone="ink" />}
                onClick={out ? undefined : () => onPick(i)}
              />
            )
          })}
        </List>
      )}
    </div>
  )
}
