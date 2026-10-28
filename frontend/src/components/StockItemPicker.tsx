/** Counted goods (owner, 2026-10-28): accessories and ordinary watches, picked from the shop's
 *  stock for a sale or a purchase. Selling one lowers its count and gives its profit; buying
 *  raises the count. When buying, a new item can be made right here. */

import { Plus, Watch } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from './Bilingual'
import { Empty, ErrorText, List, Loading, MoneyText, Row, SearchBox } from './ui'
import { useDocMutation, useGet } from '@/lib/queries'

export interface StockItem { id: string; sku: string; name: string; name_ur: string | null; category: string; qty: number; price: string; avg_cost: string | null }

/** shown first; the rest of the categories follow */
const CATS = ['watch', 'charger', 'cable', 'cover', 'glass', 'earphones', 'power_bank', 'battery', 'memory', 'other']

export default function StockItemPicker({ mode, onPick }: { mode: 'sell' | 'buy'; onPick: (item: StockItem) => void }) {
  const { pick, ur, cls } = useLang()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', category: 'watch', price: '' })
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  if (cat) params.set('category', cat)
  const { data, isLoading } = useGet<StockItem[]>(['stock-items', params.toString()], `/api/v1/accessories?${params}`)
  const create = useDocMutation<Record<string, unknown>, StockItem>('POST', () => '/api/v1/accessories')
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const name = (i: StockItem) => (ur && i.name_ur ? i.name_ur : i.name)

  if (adding) {
    return (
      <div className="flex flex-col gap-3">
        <BiInput label="items.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={pick('items.namePh')} autoFocus maxLength={150} />
        <BiLabel text="items.kind" size="md" tone="text-muted" />
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button key={c} type="button" aria-pressed={f.category === c} onClick={() => setF({ ...f, category: c })} className={chip(f.category === c)}>{pick(`acc.cat.${c}`)}</button>
          ))}
        </div>
        <BiInput label="items.sellPrice" type="number" inputMode="numeric" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="num" />
        <ErrorText error={create.error} />
        <BiButton
          text="items.saveNew"
          icon={<Plus size={20} />}
          full
          loading={create.isPending}
          disabled={f.name.trim().length < 2}
          onClick={async () => {
            const item = await create.mutateAsync({ name: f.name.trim(), category: f.category, price: Number(f.price || 0), reorder_level: 2 })
            onPick(item)
          }}
        />
        <BiButton text="common.back" variant="ghost" full onClick={() => setAdding(false)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={q} onChange={setQ} placeholder="items.search" />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!cat} onClick={() => setCat('')} className={chip(!cat)}>{pick('common.all')}</button>
        {CATS.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)}>{pick(`acc.cat.${c}`)}</button>
        ))}
      </div>
      {mode === 'buy' ? <BiButton text="items.new" icon={<Plus size={20} />} variant="secondary" full onClick={() => { setF({ ...f, name: q.trim() }); setAdding(true) }} /> : null}
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
                  <span className="flex items-center gap-1.5">
                    <span>{pick(`acc.cat.${i.category}`)}</span>·
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
