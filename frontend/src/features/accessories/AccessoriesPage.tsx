import { Plus } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { Chip, Empty, ErrorText, KV, List, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useDocMutation, useGet } from '@/lib/queries'

interface Accessory { id: string; sku: string; name: string; name_ur: string | null; category: string; qty: number; avg_cost: string | null; price: string; reorder_level: number; low_stock: boolean }
interface Pending { item_id: string; device_label: string; imei1: string; kind: string; pending_from: 'vendor' | 'shop'; expected_at: string | null; promised_to_customer_at: string | null; party_name: string | null; party_phone: string | null; overdue: boolean }
const CATS = ['charger', 'cable', 'cover', 'glass', 'earphones', 'battery', 'memory', 'sim_tray', 'part', 'other']

export default function AccessoriesPage() {
  const { pick, ur } = useLang()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [tab, setTab] = useState<'stock' | 'low' | 'pending'>('stock')
  const [q, setQ] = useState('')
  const { data, isLoading } = useGet<Accessory[]>(['accessories', tab, q], tab === 'pending' ? null : `/api/v1/accessories?low_only=${tab === 'low'}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
  const { data: pending } = useGet<Pending[]>(['acc-pending'], tab === 'pending' ? '/api/v1/accessories/pending' : null)
  const [adding, setAdding] = useState(false)
  const [adjusting, setAdjusting] = useState<Accessory | null>(null)
  const [f, setF] = useState({ name: '', name_ur: '', category: 'charger', price: '', reorder_level: '3', opening_qty: '', opening_cost: '' })
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const create = useDocMutation<Record<string, unknown>, Accessory>('POST', () => '/api/v1/accessories')
  const adjust = useDocMutation<{ id: string; qty_delta: number; note?: string }, Accessory>('POST', (i) => `/api/v1/accessories/${i.id}/adjust`, (i) => ({ qty_delta: i.qty_delta, note: i.note }))
  const deliver = useDocMutation<{ id: string }, unknown>('POST', (i) => `/api/v1/accessories/pending/${i.id}/deliver`, () => ({}))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="acc.title" right={<button type="button" aria-label={pick('acc.new')} onClick={() => setAdding(true)} className="well tap h-11 w-11 bg-emerald text-white shadow-cta"><Plus size={22} /></button>} />
      <BiSegmented value={tab} onChange={setTab} options={[{ value: 'stock', text: 'acc.qty' }, { value: 'low', text: 'acc.low' }, { value: 'pending', text: 'acc.pending' }]} />
      {tab !== 'pending' ? <SearchBox value={q} onChange={setQ} placeholder="common.search" /> : null}
      {tab === 'pending' ? (
        !pending?.length ? <Empty text="acc.none" /> : (
          <List>
            {pending.map((p) => (
              <div key={p.item_id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{pick(`stock.acc.${p.kind}`)} · {p.device_label}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Chip text={p.pending_from === 'vendor' ? 'acc.fromVendor' : 'acc.toCustomer'} tone={p.pending_from === 'vendor' ? 'warn' : 'bad'} />
                    {p.party_name ? <span>{p.party_name} <span dir="ltr">{p.party_phone}</span></span> : null}
                    <span dir="ltr">{fmtDate(p.promised_to_customer_at ?? p.expected_at)}</span>
                    {p.overdue ? <Chip text="repair.overdue" tone="bad" /> : null}
                  </div>
                </div>
                <BiButton text="acc.markDelivered" size="sm" variant="secondary" onClick={() => deliver.mutate({ id: p.item_id })} />
              </div>
            ))}
          </List>
        )
      ) : isLoading ? <Loading /> : !data?.length ? <Empty text="acc.none" /> : (
        <List>
          {data.map((a) => (
            <Row
              key={a.id}
              title={ur && a.name_ur ? a.name_ur : a.name}
              sub={<span className="flex items-center gap-1.5"><span dir="ltr">{a.sku}</span> · {pick(`acc.cat.${a.category}`)} {a.low_stock ? <Chip text="acc.low" tone="bad" /> : null}</span>}
              right={<div className="flex flex-col items-end"><span className="num text-lg" dir="ltr">{a.qty}</span><MoneyText value={a.price} tone="muted" size="sm" /></div>}
              onClick={canCost ? () => { setAdjusting(a); setDelta(''); setNote('') } : undefined}
            />
          ))}
        </List>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="acc.new">
        <div className="flex flex-col gap-3">
          <BiInput label="acc.name" value={f.name} onChange={set('name')} />
          <BiInput label="acc.nameUr" value={f.name_ur} onChange={set('name_ur')} dir="rtl" className="ur" />
          <BiLabel text="acc.category" size="md" tone="text-muted" />
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, category: c })} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${f.category === c ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>{pick(`acc.cat.${c}`)}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.price" type="number" inputMode="decimal" min={0} value={f.price} onChange={set('price')} />
            <BiInput label="acc.reorder" type="number" inputMode="numeric" min={0} value={f.reorder_level} onChange={set('reorder_level')} />
            <BiInput label="acc.openingQty" type="number" inputMode="numeric" min={0} value={f.opening_qty} onChange={set('opening_qty')} />
            <BiInput label="acc.openingCost" type="number" inputMode="decimal" min={0} value={f.opening_cost} onChange={set('opening_cost')} />
          </div>
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!f.name} onClick={async () => { await create.mutateAsync({ name: f.name, name_ur: f.name_ur || null, category: f.category, price: Number(f.price || 0), reorder_level: Number(f.reorder_level || 0), opening_qty: Number(f.opening_qty || 0), opening_cost: Number(f.opening_cost || 0) }); setAdding(false) }} />
        </div>
      </Sheet>

      <Sheet open={adjusting !== null} onClose={() => setAdjusting(null)} title="acc.adjust">
        {adjusting ? (
          <div className="flex flex-col gap-3">
            <div className="card">
              <KV k="acc.name" v={adjusting.name} />
              <KV k="acc.qty" v={<span dir="ltr">{adjusting.qty}</span>} />
              <KV k="acc.avgCost" v={<MoneyText value={adjusting.avg_cost} tone="ink" />} />
            </div>
            <BiInput label="acc.delta" type="number" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" />
            <BiInput label="common.notes" value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorText error={adjust.error} />
            <BiButton text="common.save" full loading={adjust.isPending} disabled={!delta || Number(delta) === 0} onClick={async () => { await adjust.mutateAsync({ id: adjusting.id, qty_delta: Number(delta), note: note || undefined }); setAdjusting(null) }} />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
