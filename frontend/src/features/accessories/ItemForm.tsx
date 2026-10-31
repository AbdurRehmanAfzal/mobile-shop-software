/** New / edit item (owner addendum 5, docs/24 §A, §D): name, kind and price up front; everything
 *  else — brand, fit, quality, variant, warranty, packaging, price tiers, tax, shelf, supplier codes
 *  — folded under "More details", because shopkeepers buy in a hurry. A duplicate warning shows
 *  items with a similar name while the name is typed. */

import i18next from 'i18next'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { KindChooser } from '@/components/ItemKinds'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText } from '@/components/ui'
import { get } from '@/lib/api'
import { useDocMutation, useGet } from '@/lib/queries'
import type { Party } from '@/lib/types'
import { gradeLabel, type Item, type ItemOptions } from './types'

interface Form {
  name: string; category: string; price: string; reorder_level: string; opening_qty: string; opening_cost: string
  brand: string; compatible: string; grade: string; color: string; size: string; capacity: string; connector: string; wattage: string
  warranty_days: string; warranty_by: 'shop' | 'supplier'; warranty_terms: string
  box: string; carton: string
  wholesale_price: string; min_price: string; promo_price: string; promo_from: string; promo_to: string
  pricing_mode: 'fixed' | 'markup'; markup_pct: string; tax_rate: string; tax_inclusive: boolean
  max_stock: string; location: string; show_in_sale: boolean; description: string
  supplier_skus: { party: Party | null; party_id: string | null; party_name: string | null; sku: string }[]
}

const s = (v: string | number | null | undefined) => (v == null ? '' : String(Number(v) === Number(v) && typeof v !== 'string' ? v : v))
const n = (v: string | null | undefined) => (v == null || v === '' ? '' : String(Number(v)))

function fromItem(it?: Item): Form {
  return {
    name: it?.name ?? '', category: it?.category ?? 'charger', price: n(it?.price), reorder_level: String(it?.reorder_level ?? 3), opening_qty: '', opening_cost: '',
    brand: it?.brand ?? '', compatible: it?.compatible ?? '', grade: it?.grade ?? 'unspecified', color: it?.color ?? '', size: it?.size ?? '', capacity: it?.capacity ?? '', connector: it?.connector ?? '', wattage: it?.wattage ?? '',
    warranty_days: String(it?.warranty_days ?? 0), warranty_by: it?.warranty_by ?? 'shop', warranty_terms: it?.warranty_terms ?? '',
    box: s(it?.pack_units?.box), carton: s(it?.pack_units?.carton),
    wholesale_price: n(it?.wholesale_price), min_price: n(it?.min_price), promo_price: n(it?.promo_price), promo_from: it?.promo_from ?? '', promo_to: it?.promo_to ?? '',
    pricing_mode: it?.pricing_mode ?? 'fixed', markup_pct: n(it?.markup_pct), tax_rate: n(it?.tax_rate), tax_inclusive: it?.tax_inclusive ?? false,
    max_stock: it?.max_stock != null ? String(it.max_stock) : '', location: it?.location ?? '', show_in_sale: it?.show_in_sale ?? true, description: it?.description ?? '',
    supplier_skus: (it?.supplier_skus ?? []).map((x) => ({ party: null, party_id: x.party_id, party_name: x.party_name, sku: x.sku })),
  }
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

function toBody(f: Form, creating: boolean): Record<string, unknown> {
  const pack: Record<string, number> = {}
  if (Number(f.box) >= 1) pack.box = Number(f.box)
  if (Number(f.carton) >= 1) pack.carton = Number(f.carton)
  return {
    name: f.name.trim(), category: f.category, price: Number(f.price || 0), reorder_level: Number(f.reorder_level || 0),
    ...(creating ? { name_ur: null, opening_qty: Number(f.opening_qty || 0), opening_cost: Number(f.opening_cost || 0) } : {}),
    brand: f.brand.trim() || null, compatible: f.compatible.trim() || null, grade: f.grade || 'unspecified', color: f.color.trim() || null, size: f.size.trim() || null,
    capacity: f.capacity.trim() || null, connector: f.connector.trim() || null, wattage: f.wattage.trim() || null,
    warranty_days: Number(f.warranty_days || 0), warranty_by: f.warranty_by, warranty_terms: f.warranty_terms.trim() || null,
    pack_units: Object.keys(pack).length ? pack : null,
    wholesale_price: num(f.wholesale_price), min_price: num(f.min_price), promo_price: num(f.promo_price), promo_from: f.promo_from || null, promo_to: f.promo_to || null,
    pricing_mode: f.pricing_mode, markup_pct: f.pricing_mode === 'markup' ? num(f.markup_pct) : null, tax_rate: num(f.tax_rate), tax_inclusive: f.tax_rate.trim() ? f.tax_inclusive : null,
    max_stock: num(f.max_stock), location: f.location.trim() || null, show_in_sale: f.show_in_sale, description: f.description.trim() || null,
    supplier_skus: f.supplier_skus.filter((x) => x.sku.trim()).map((x) => ({ party_id: x.party?.id ?? x.party_id, sku: x.sku.trim() })),
  }
}

export default function ItemForm({ item, compact = false, initialName = '', onDone }: { item?: Item; compact?: boolean; initialName?: string; onDone: (it: Item) => void }) {
  const { pick } = useLang()
  const exists = (k: string) => i18next.exists(k)
  const creating = !item
  const [f, setF] = useState<Form>(() => ({ ...fromItem(item), name: item?.name ?? initialName }))
  const [more, setMore] = useState(false)
  const { data: opts } = useGet<ItemOptions>(['item-options'], '/api/v1/accessories/options')
  const create = useDocMutation<Record<string, unknown>, Item>('POST', () => '/api/v1/accessories')
  const update = useDocMutation<{ id: string; body: Record<string, unknown> }, Item>('PATCH', (i) => `/api/v1/accessories/${i.id}`, (i) => i.body)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const busy = create.isPending || update.isPending
  // the duplicate warning: similar names already in stock (only while making a new item)
  const [similar, setSimilar] = useState<Item[]>([])
  useEffect(() => {
    if (!creating || f.name.trim().length < 3) { setSimilar([]); return }
    const t = setTimeout(() => {
      const q = new URLSearchParams({ name: f.name.trim() })
      if (f.brand.trim()) q.set('brand', f.brand.trim())
      if (f.color.trim()) q.set('color', f.color.trim())
      get<Item[]>(`/api/v1/accessories/similar?${q}`).then(setSimilar).catch(() => setSimilar([]))
    }, 350)
    return () => clearTimeout(t)
  }, [creating, f.name, f.brand, f.color])
  const grades = opts?.grades ?? ['unspecified', 'original', 'oem', 'a_grade', 'copy', 'used']
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 text-[13px] font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`
  const Toggle = ({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="tap flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-ground px-4 text-start">
      <span className="flex-1"><BiLabel text={text} size="md" bold /></span>
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${on ? 'bg-emerald' : 'bg-line'}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5 rtl:-translate-x-5' : ''}`} /></span>
    </button>
  )

  async function save() {
    const body = toBody(f, creating)
    const res = creating ? await create.mutateAsync(body) : await update.mutateAsync({ id: item!.id, body })
    onDone(res)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="item-form">
      <BiInput label="acc.name" value={f.name} onChange={set('name')} autoFocus={creating} maxLength={150} placeholder={pick('items.namePh')} />
      {similar.length ? (
        <div className="rounded-2xl border border-payable/40 bg-payable-tint/40 px-3 py-2" data-testid="similar-items">
          <BiLabel text="acc.similar" size="sm" bold />
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {similar.map((x) => <li key={x.id} className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{x.name}{x.brand ? ` · ${x.brand}` : ''}{x.color ? ` · ${x.color}` : ''}</span><span className="num shrink-0 text-xs text-muted" dir="ltr">{x.sku} · {x.qty}</span></li>)}
          </ul>
        </div>
      ) : null}
      <BiLabel text="acc.category" size="md" tone="text-muted" />
      <KindChooser value={f.category} onChange={(category) => setF({ ...f, category })} />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label={compact ? 'items.sellPrice' : 'acc.price'} type="number" inputMode="decimal" min={0} value={f.price} onChange={set('price')} className="num" />
        <BiInput label="acc.reorder" type="number" inputMode="numeric" min={0} value={f.reorder_level} onChange={set('reorder_level')} className="num" />
        {creating && !compact ? <BiInput label="acc.openingQty" type="number" inputMode="numeric" min={0} value={f.opening_qty} onChange={set('opening_qty')} className="num" /> : null}
        {creating && !compact ? <BiInput label="acc.openingCost" type="number" inputMode="decimal" min={0} value={f.opening_cost} onChange={set('opening_cost')} className="num" /> : null}
      </div>

      {compact ? (
        <div className="flex flex-col gap-2" data-testid="item-quick-card">
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.brand" value={f.brand} onChange={set('brand')} list="item-brands" maxLength={80} />
            <datalist id="item-brands">{(opts?.brands ?? []).map((b) => <option key={b} value={b} />)}</datalist>
            <BiInput label="acc.color" value={f.color} onChange={set('color')} maxLength={40} />
          </div>
          <BiInput label="acc.compatible" value={f.compatible} onChange={set('compatible')} placeholder={pick('acc.compatiblePh')} maxLength={200} />
          <BiLabel text="acc.grade" size="md" tone="text-muted" />
          <div className="flex flex-wrap gap-1.5">
            {grades.map((g) => <button key={g} type="button" aria-pressed={f.grade === g} onClick={() => setF({ ...f, grade: g })} className={chip(f.grade === g)}>{gradeLabel(pick, g, exists)}</button>)}
          </div>
        </div>
      ) : null}
      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className={`tap flex min-h-12 items-center justify-between rounded-2xl border-2 px-4 text-sm font-bold ${more ? 'border-ink' : 'border-dashed border-line bg-ground'}`} data-testid="item-more">
        <BiLabel text={more ? 'acc.less' : 'acc.more'} size="md" bold />
        {more ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {more ? (
        <div className="flex flex-col gap-3">
          {!compact ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <BiInput label="acc.brand" value={f.brand} onChange={set('brand')} list="item-brands" maxLength={80} />
                <datalist id="item-brands">{(opts?.brands ?? []).map((b) => <option key={b} value={b} />)}</datalist>
                <BiInput label="acc.color" value={f.color} onChange={set('color')} maxLength={40} />
              </div>
              <BiInput label="acc.compatible" value={f.compatible} onChange={set('compatible')} placeholder={pick('acc.compatiblePh')} maxLength={200} />
              <BiLabel text="acc.grade" size="md" tone="text-muted" />
              <div className="flex flex-wrap gap-1.5">
                {grades.map((g) => <button key={g} type="button" aria-pressed={f.grade === g} onClick={() => setF({ ...f, grade: g })} className={chip(f.grade === g)}>{gradeLabel(pick, g, exists)}</button>)}
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.size" value={f.size} onChange={set('size')} maxLength={40} />
            <BiInput label="acc.capacity" value={f.capacity} onChange={set('capacity')} maxLength={40} dir="ltr" />
            <BiInput label="acc.connector" value={f.connector} onChange={set('connector')} maxLength={40} dir="ltr" placeholder="Type-C" />
            <BiInput label="acc.wattage" value={f.wattage} onChange={set('wattage')} maxLength={20} dir="ltr" placeholder="25W" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.warranty" type="number" inputMode="numeric" min={0} value={f.warranty_days} onChange={set('warranty_days')} className="num" />
            <div>
              <BiLabel text="acc.warrantyBy" size="md" tone="text-muted" />
              <div className="mt-1"><BiSegmented<'shop' | 'supplier'> value={f.warranty_by} onChange={(v) => setF({ ...f, warranty_by: v })} options={[{ value: 'shop', text: 'acc.byShop' }, { value: 'supplier', text: 'acc.bySupplier' }]} /></div>
            </div>
          </div>
          {Number(f.warranty_days) > 0 ? <BiInput label="acc.warrantyTerms" value={f.warranty_terms} onChange={set('warranty_terms')} maxLength={300} /> : null}

          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.piecesInBox" type="number" inputMode="numeric" min={1} value={f.box} onChange={set('box')} className="num" placeholder={String(opts?.units.box ?? 10)} />
            <BiInput label="acc.piecesInCarton" type="number" inputMode="numeric" min={1} value={f.carton} onChange={set('carton')} className="num" placeholder={String(opts?.units.carton ?? 120)} />
          </div>

          <BiLabel text="acc.pricing" size="md" tone="text-muted" />
          <BiSegmented<'fixed' | 'markup'> value={f.pricing_mode} onChange={(v) => setF({ ...f, pricing_mode: v })} options={[{ value: 'fixed', text: 'acc.fixed' }, { value: 'markup', text: 'acc.markup' }]} />
          {f.pricing_mode === 'markup' ? <BiInput label="acc.markupPct" type="number" inputMode="decimal" min={0} value={f.markup_pct} onChange={set('markup_pct')} className="num" hint="acc.markupHint" /> : null}
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.wholesale" type="number" inputMode="decimal" min={0} value={f.wholesale_price} onChange={set('wholesale_price')} className="num" />
            <BiInput label="acc.minPrice" type="number" inputMode="decimal" min={0} value={f.min_price} onChange={set('min_price')} className="num" />
            <BiInput label="acc.promo" type="number" inputMode="decimal" min={0} value={f.promo_price} onChange={set('promo_price')} className="num" />
            <BiInput label="acc.taxRate" type="number" inputMode="decimal" min={0} max={100} value={f.tax_rate} onChange={set('tax_rate')} className="num" />
            {f.promo_price ? <BiInput label="acc.promoFrom" type="date" value={f.promo_from} onChange={set('promo_from')} dir="ltr" /> : null}
            {f.promo_price ? <BiInput label="acc.promoTo" type="date" value={f.promo_to} onChange={set('promo_to')} dir="ltr" /> : null}
          </div>
          {f.tax_rate.trim() ? <Toggle on={f.tax_inclusive} onChange={(v) => setF({ ...f, tax_inclusive: v })} text="acc.taxIncl" /> : null}

          <div className="grid grid-cols-2 gap-2">
            <BiInput label="acc.maxStock" type="number" inputMode="numeric" min={0} value={f.max_stock} onChange={set('max_stock')} className="num" />
            <BiInput label="acc.location" value={f.location} onChange={set('location')} list="item-locations" maxLength={60} />
            <datalist id="item-locations">{(opts?.locations ?? []).map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <Toggle on={f.show_in_sale} onChange={(v) => setF({ ...f, show_in_sale: v })} text="acc.showInSale" />
          <BiInput label="acc.description" value={f.description} onChange={set('description')} maxLength={2000} />

          <BiLabel text="acc.supplierSkus" size="md" tone="text-muted" />
          {f.supplier_skus.map((x, i) => (
            <div key={i} className="card flex flex-col gap-2">
              <PartyPicker value={x.party ?? (x.party_id ? ({ id: x.party_id, name: x.party_name ?? '' } as Party) : null)} onChange={(p) => setF({ ...f, supplier_skus: f.supplier_skus.map((y, j) => (j === i ? { ...y, party: p, party_id: p?.id ?? null, party_name: p?.name ?? null } : y)) })} kind="supplier" label="acc.supplierName" allowNone />
              <div className="flex items-end gap-2">
                <div className="flex-1"><BiInput label="acc.supplierSku" value={x.sku} onChange={(e) => setF({ ...f, supplier_skus: f.supplier_skus.map((y, j) => (j === i ? { ...y, sku: e.target.value } : y)) })} dir="ltr" maxLength={60} /></div>
                <button type="button" aria-label={pick('crud.delete')} onClick={() => setF({ ...f, supplier_skus: f.supplier_skus.filter((_, j) => j !== i) })} className="tap mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-line text-payable"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          <BiButton text="acc.addSupplierSku" icon={<Plus size={18} />} variant="ghost" full onClick={() => setF({ ...f, supplier_skus: [...f.supplier_skus, { party: null, party_id: null, party_name: null, sku: '' }] })} />
        </div>
      ) : null}
      {f.min_price && f.price && Number(f.min_price) > Number(f.price) ? <BiAlert text="acc.belowMin" kind="info" /> : null}
      <ErrorText error={create.error ?? update.error} />
      <BiButton text={creating && compact ? 'items.saveNew' : 'common.save'} full loading={busy} disabled={f.name.trim().length < 1 || !f.category.trim()} onClick={save} />
    </div>
  )
}
