/** One item's page (owner addendum 5, docs/24 §B): what it is, what it costs and sells for (with
 *  the margin), how many are here and what they are worth, every purchase batch and how many of
 *  it are left, and the whole timeline — purchases (from whom, paid / remaining), sales (to whom,
 *  invoice), returns, adjustments and price changes. Cost figures only for owner / manager. */

import i18next from 'i18next'
import { ArrowDownLeft, ArrowUpRight, Pencil, RefreshCw, Tag, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import LabelSheet from '@/components/LabelSheet'
import RemoveSheet from '@/components/RemoveSheet'
import { BtnText, Chip, Empty, ErrorText, fmtDate, fmtDateTime, KV, Loading, MoneyText, PageHeader, Section, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import ItemForm from './ItemForm'
import DeviceLineSheet, { draftToApi, emptyDraft } from '@/features/purchase/DeviceLineSheet'
import { post } from '@/lib/api'
import { gradeLabel, unitLabel, type Batch, type Item, type TimelineRow } from './types'
import {withCur } from '@/lib/format'

export default function AccessoryDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const exists = (k: string) => i18next.exists(k)
  const { data: it, isLoading } = useGet<Item>(['item', id], id ? `/api/v1/accessories/${id}` : null)
  const { data: batches } = useGet<Batch[]>(['item-batches', id], id && canCost ? `/api/v1/accessories/${id}/batches` : null)
  const { data: tl } = useGet<TimelineRow[]>(['item-timeline', id], id ? `/api/v1/accessories/${id}/timeline` : null)
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [labels, setLabels] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [making, setMaking] = useState(false)
  const [delta, setDelta] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const adjust = useDocMutation<{ qty_delta: number; unit_cost?: number; note: string }, Item>('POST', () => `/api/v1/accessories/${id}/adjust`)
  const inv = useInvalidate()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (isLoading || !it) return <Loading />
  const refresh = () => inv('item', 'item-batches', 'item-timeline', 'accessories')
  const variant = [it.color, it.size, it.capacity, it.connector, it.wattage].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={{ en: it.name, ur: it.name_ur || it.name }}
        right={
          <div className="flex gap-2">
            {canCost ? <button type="button" aria-label={pick('crud.delete')} onClick={() => setRemoving(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-payable"><Trash2 size={18} /><BtnText k={'crud.delete'} /></button> : null}
            {canCost ? <button type="button" aria-label={pick('common.edit')} onClick={() => setEditing(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1"><Pencil size={18} /><BtnText k={'common.edit'} /></button> : null}
          </div>
        }
      />

      <section className={`flex flex-col gap-2 rounded-3xl p-5 ${it.qty <= 0 ? 'bg-expense text-expense-fg' : it.low_stock ? 'bg-khata text-khata-fg' : 'bg-stockt text-stockt-fg'}`} data-testid="item-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <BiLabel text="acc.qty" size="md" bold tone="text-current" />
            <div className="num text-[34px] leading-none" dir="ltr">{it.qty} <span className="text-base">{unitLabel(pick, 'piece', exists)}</span></div>
          </div>
          <div className="flex flex-col items-end">
            <BiLabel text="acc.price" size="sm" tone="text-current" />
            <span className="num text-2xl" dir="ltr">{withCur(Number(it.price).toLocaleString('en-US'))}</span>
          </div>
        </div>
        <div className={`flex flex-wrap gap-x-3 gap-y-1 opacity-90 ${small}`}>
          <span dir="ltr">{it.sku}</span>
          {it.barcode && it.barcode !== it.sku ? <span dir="ltr">{it.barcode}</span> : null}
          <span>{kindLabel(pick, it.category)}</span>
          {it.brand ? <span>{it.brand}</span> : null}
          {it.grade && it.grade !== 'unspecified' ? <span>{gradeLabel(pick, it.grade, exists)}</span> : null}
          {it.low_stock ? <Chip text={it.qty <= 0 ? 'acc.outOfStock' : 'acc.low'} tone="bad" /> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {canCost ? <BiButton text="acc.adjust" icon={<RefreshCw size={18} />} variant="secondary" onClick={() => { setDelta(''); setCost(''); setNote(''); setAdjusting(true) }} /> : null}
        <BiButton text="label.button" icon={<Tag size={18} />} variant="secondary" onClick={() => setLabels(true)} />
      </div>
      {/* owner addendum 6: a counted watch / tablet can be tracked one by one from here on */}
      {canCost && it.qty > 0 && (it.category === 'watch' || it.category === 'tablet') ? <BiButton text="devx.makeUnit" variant="ghost" full onClick={() => setMaking(true)} /> : null}

      <div className="card">
        {it.compatible ? <KV k="acc.compatible" v={it.compatible} /> : null}
        {variant ? <KV k="acc.size" v={<span dir="ltr">{variant}</span>} /> : null}
        {it.warranty_days ? <KV k="acc.warranty" v={<span dir="ltr">{it.warranty_days} · {pick(it.warranty_by === 'supplier' ? 'acc.bySupplier' : 'acc.byShop')}</span>} /> : null}
        {it.location ? <KV k="acc.location" v={it.location} /> : null}
        {it.wholesale_price ? <KV k="acc.wholesale" v={<MoneyText value={it.wholesale_price} tone="ink" />} /> : null}
        {canCost && it.min_price ? <KV k="acc.minPrice" v={<MoneyText value={it.min_price} tone="ink" />} /> : null}
        {it.promo_price ? <KV k="acc.promo" v={<span className="flex items-center gap-2"><MoneyText value={it.promo_price} tone="ink" />{it.promo_to ? <span className={`text-muted ${small}`} dir="ltr">→ {fmtDate(it.promo_to)}</span> : null}</span>} /> : null}
        {canCost ? <KV k="acc.avgCost" v={<MoneyText value={it.avg_cost} tone="ink" />} /> : null}
        {canCost && it.profit != null ? <KV k="acc.profitEach" v={<span className="flex items-center gap-2"><MoneyText value={it.profit} />{it.margin_pct != null ? <span className={`text-muted ${small}`} dir="ltr">{Number(it.margin_pct).toFixed(0)}%</span> : null}</span>} /> : null}
        {canCost ? <KV k="acc.stockValue" v={<MoneyText value={it.stock_value} tone="ink" />} /> : null}
        <KV k="acc.reorder" v={<span dir="ltr">{it.reorder_level}{it.max_stock ? ` – ${it.max_stock}` : ''}</span>} />
        {it.supplier_skus?.length ? <KV k="acc.supplierSkus" v={<span className="flex flex-col items-end">{it.supplier_skus.map((x, i) => <span key={i} dir="ltr">{x.sku}{x.party_name ? ` · ${x.party_name}` : ''}</span>)}</span>} /> : null}
        {it.description ? <KV k="acc.description" v={it.description} /> : null}
      </div>

      {canCost ? (
        <Section title="acc.batches">
          {!batches?.length ? <Empty text="acc.none" /> : (
            <div className="card flex flex-col divide-y divide-line" data-testid="item-batches">
              {batches.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{b.party_name ?? b.batch_ref ?? pick(`acc.${b.source === 'opening' ? 'openingQty' : b.source === 'purchase' ? 'cost' : 'adjust'}`)}</div>
                    <div className={`text-muted ${small}`} dir="ltr">{fmtDate(b.date)}{b.pack_unit ? ` · ${b.pack_qty} ${unitLabel(pick, b.pack_unit, exists)}` : ''}{b.batch_ref && b.party_name ? ` · ${b.batch_ref}` : ''}</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="num text-sm" dir="ltr">{b.qty_left} / {b.qty_in} <span className="text-muted">{pick('acc.left')}</span></span>
                    <MoneyText value={b.unit_cost} tone="muted" size="sm" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      <Section title="acc.timeline">
        {!tl?.length ? <Empty text="acc.none" /> : (
          <div className="card flex flex-col divide-y divide-line" data-testid="item-timeline">
            {tl.map((r, i) => (
              r.kind === 'price' ? (
                <div key={i} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="well h-9 w-9 shrink-0 bg-ground text-muted"><Tag size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{pick('acc.priceChange')} · {pick(r.field === 'avg_cost' ? 'acc.avgCost' : r.field === 'wholesale_price' ? 'acc.wholesale' : r.field === 'min_price' ? 'acc.minPrice' : r.field === 'promo_price' ? 'acc.promo' : 'acc.price')}</div>
                    <div className={`text-muted ${small}`} dir="ltr">{fmtDateTime(r.at)}</div>
                  </div>
                  <span className="num text-sm" dir="ltr">{r.old != null ? Number(r.old).toLocaleString('en-US') : '—'} → {r.new != null ? Number(r.new).toLocaleString('en-US') : '—'}</span>
                </div>
              ) : (
                <button key={i} type="button" disabled={!r.document_id || !(r.document_type === 'purchase' || r.document_type === 'invoice')} onClick={() => nav(r.document_type === 'purchase' ? `/purchases/${r.document_id}` : `/sales/${r.document_id}`)} className="flex w-full items-center gap-3 py-2 text-start first:pt-0 last:pb-0 disabled:cursor-default">
                  <span className={`well h-9 w-9 shrink-0 ${r.qty_delta > 0 ? 'bg-emerald-tint text-emerald-deep' : 'bg-payable-tint text-payable'}`}>{r.reason === 'adjust' ? <Wrench size={16} /> : r.qty_delta > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{pick(`acc.move.${r.reason}`)}{r.party_name ? ` · ${r.party_name}` : ''}{r.doc_no && r.doc_no !== 'Opening stock' ? <span className="num text-muted" dir="ltr"> · {r.doc_no}</span> : null}</div>
                    <div className={`text-muted ${small}`} dir="ltr">{fmtDateTime(r.at)}{r.amount != null ? ` · ${withCur(Number(r.amount).toLocaleString('en-US'))}` : ''}{r.remaining != null && Number(r.remaining) > 0 ? ` · ${pick('common.due')} ${Number(r.remaining).toLocaleString('en-US')}` : ''}</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`num text-sm ${r.qty_delta > 0 ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{r.qty_delta > 0 ? '+' : ''}{r.qty_delta}</span>
                    <span className={`num text-muted ${small}`} dir="ltr">= {r.qty_after}{canCost && r.unit_cost ? ` · ${Number(r.unit_cost).toLocaleString('en-US')}` : ''}</span>
                  </div>
                </button>
              )
            ))}
          </div>
        )}
      </Section>

      <Sheet open={editing} onClose={() => setEditing(false)} title="crud.editItem">
        {editing ? <ItemForm item={it} onDone={async () => { setEditing(false); await refresh() }} /> : null}
      </Sheet>
      <Sheet open={adjusting} onClose={() => setAdjusting(false)} title="acc.adjust">
        <div className="flex flex-col gap-3">
          <BiInput label="acc.delta" type="number" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" className="num" autoFocus />
          {Number(delta) > 0 ? <BiInput label="acc.cost" type="number" inputMode="decimal" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className="num" /> : null}
          <BiInput label="acc.reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick('acc.reasonPh')} maxLength={200} />
          <ErrorText error={adjust.error} />
          <BiButton text="common.save" full loading={adjust.isPending} disabled={!delta || Number(delta) === 0 || note.trim().length < 2} onClick={async () => { await adjust.mutateAsync({ qty_delta: Number(delta), unit_cost: cost ? Number(cost) : undefined, note: note.trim() }); setAdjusting(false); await refresh() }} />
        </div>
      </Sheet>
      <LabelSheet kind="items" ids={[it.id]} open={labels} onClose={() => setLabels(false)} />
      <Sheet open={making} onClose={() => setMaking(false)} title="devx.makeUnit">
        {making ? (
          <div className="flex flex-col gap-3">
            <BiLabel text="devx.makeUnitHint" size="sm" tone="text-muted" />
            <DeviceLineSheet
              initial={{ ...emptyDraft(), category: it.category as 'watch' | 'tablet', condition: 'box_pack', cost: it.avg_cost ? String(Number(it.avg_cost)) : '', asking_price: String(Number(it.price) || '') }}
              onSave={async (x) => {
                const api = draftToApi(x)
                const unit = await post<{ id: string }>(`/api/v1/devices/from-item/${it.id}`, { identity: { ...api.device, cost_price: api.cost, asking_price: api.asking_price, accessories: api.accessories }, cost: api.cost || null })
                setMaking(false)
                await inv('accessories', 'item', 'item-timeline', 'devices')
                nav(`/stock/${unit.id}`)
              }}
            />
          </div>
        ) : null}
      </Sheet>
      <RemoveSheet open={removing} onClose={() => setRemoving(false)} name={it.name} onConfirm={async () => { await api('DELETE', `/api/v1/accessories/${it.id}`); await inv('accessories'); nav('/accessories') }} />
    </div>
  )
}
