/** Counted goods (owner, 2026-10-28): accessories and ordinary watches, picked from the shop's
 *  stock for a sale or a purchase. Selling one lowers its count and gives its profit; buying
 *  raises the count. When buying, a new item can be made right here. */

import { Plus, Watch } from 'lucide-react'
import { useState } from 'react'
import { BiButton, useLang } from './Bilingual'
import { Empty, List, Loading, MoneyText, Row, SearchBox } from './ui'
import { kindLabel, useItemKinds } from './ItemKinds'
import ItemForm from '@/features/accessories/ItemForm'
import { useGet } from '@/lib/queries'
import { useScan } from '@/lib/scanner'

export interface StockItem { id: string; sku: string; name: string; name_ur: string | null; category: string; qty: number; price: string; avg_cost: string | null; brand?: string | null; color?: string | null; compatible?: string | null; grade?: string; units?: Record<string, number>; pack_units?: Record<string, number> | null; wholesale_price?: string | null; min_price?: string | null; warranty_days?: number; unit?: string }


export default function StockItemPicker({ mode, onPick }: { mode: 'sell' | 'buy'; onPick: (item: StockItem) => void }) {
  const { pick, ur, cls } = useLang()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [adding, setAdding] = useState(false)
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
        <ItemForm compact initialName={q.trim()} onDone={(it) => onPick(it as unknown as StockItem)} />
        <BiButton text="common.back" variant="ghost" full onClick={() => setAdding(false)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} placeholder="items.search" />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!cat} onClick={() => setCat('')} className={chip(!cat)}>{pick('common.all')}</button>
        {kinds.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>{kindLabel(pick, c)}</button>
        ))}
      </div>
      {mode === 'buy' ? <BiButton text="items.new" icon={<Plus size={20} />} variant="secondary" full onClick={() => setAdding(true)} /> : null}
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
                title={name(i)}
                sub={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{kindLabel(pick, i.category)}{i.brand ? ` · ${i.brand}` : ''}{i.color ? ` · ${i.color}` : ''}{i.compatible ? ` · ${i.compatible}` : ''}</span>·
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
