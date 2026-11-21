/** The built-in list of accessories and an item's variants (accessories shops 2026-11-20, ADR-118).
 *  - `LibraryHits`: while a new item's name is typed, lines of the built-in list that match — a
 *    tap fills the item's card (kind, brand, watts, connector, fits) and offers its usual variants.
 *  - `VariantPicker`: the colours / lengths / sizes the shop keeps of this product; each ticked one
 *    becomes its own item with its own stock and barcode when saved.
 *  - `KindsCard`: on an item's page, the other kinds of the same product and "Add another kind".
 *  The list itself lives on the server (`/accessories/library`); nothing here is a second copy. */

import { Check, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { kindLabel } from '@/components/ItemKinds'
import { ErrorText, MoneyText, Sheet } from '@/components/ui'
import { get, post } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Item } from './types'

export type VariantBy = 'color' | 'size' | 'other'
export interface LibEntry { name: string; brand: string | null; kind: string; made_for: string; details: Record<string, string>; variant_by: VariantBy; variants: string[]; have: number; model_id?: string }
export interface Variant { label: string; qty: string }
const USUAL: Record<VariantBy, string[]> = {
  color: ['Black', 'White', 'Blue', 'Red', 'Green', 'Pink', 'Grey', 'Gold', 'Silver', 'Clear'],
  size: ['Small', 'Medium', 'Large', '1m', '2m', '3m'],
  other: [],
}

/** lines of the built-in list for what is being typed; none while the name is the one just picked */
export function LibraryHits({ q, skip, kind = '', onPick }: { q: string; skip: string; kind?: string; onPick: (e: LibEntry) => void }) {
  const { pick, ur, cls } = useLang()
  const [hits, setHits] = useState<LibEntry[]>([])
  const text = q.trim()
  useEffect(() => {
    // a kind card was tapped (ADR-124): that kind's lines, typed words or not
    if ((text.length < 2 && !kind) || (text === skip && !!text)) { setHits([]); return }
    let live = true
    const t = setTimeout(() => {
      get<LibEntry[]>(`/api/v1/accessories/library?q=${encodeURIComponent(text)}&limit=${kind ? 30 : 12}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`).then((r) => { if (live) setHits(r) }).catch(() => { if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [text, skip, kind])
  if (!hits.length) return null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="rounded-2xl border border-emerald/40 bg-emerald-tint/30 p-2" data-testid="lib-hits">
      <span className="flex items-center gap-1 px-1 pb-1"><Sparkles size={14} className="text-emerald-deep" /><BiLabel text="lib.title" size="sm" bold /><Help term="items.library" size="sm" /></span>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {hits.map((e) => (
          <button key={e.name} type="button" onClick={() => onPick(e)} className="tap flex min-h-12 items-center gap-2 rounded-xl bg-surface px-3 py-1.5 text-start" data-testid="lib-hit">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate ${ur ? cls('sm') : 'text-sm font-bold'}`} dir="auto">{e.name}</span>
              <span className={`truncate text-muted ${small}`}>{kindLabel(pick, e.kind)}{e.variants.length ? ` · ${e.variants.slice(0, 4).join(', ')}${e.variants.length > 4 ? ' …' : ''}` : ''}</span>
            </span>
            {e.have ? <span className={`shrink-0 rounded-full bg-gold-tint px-2 py-0.5 text-ink ${small}`}>{pick('lib.have')}</span> : <Plus size={18} className="shrink-0 text-emerald-deep" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/** which colours / lengths / sizes of the product the shop keeps, and how many of each are on the shelf */
export function VariantPicker({ by, onBy, value, onChange, suggest, withQty, qtyLabel = 'var.qty', title = 'var.title' }: { by: VariantBy; onBy: (b: VariantBy) => void; value: Variant[]; onChange: (v: Variant[]) => void; suggest: string[]; withQty: boolean; qtyLabel?: string; title?: string }) {
  const { pick, ur, cls } = useLang()
  const [own, setOwn] = useState('')
  const has = (l: string) => value.some((v) => v.label.toLowerCase() === l.toLowerCase())
  const toggle = (l: string) => onChange(has(l) ? value.filter((v) => v.label.toLowerCase() !== l.toLowerCase()) : [...value, { label: l, qty: '' }])
  const options = [...new Set([...(suggest.length ? suggest : USUAL[by]), ...value.map((v) => v.label)])]
  const chip = (on: boolean) => `tap inline-flex h-10 shrink-0 items-center gap-1 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const add = () => { const l = own.trim().replace(/\s+/g, ' '); if (l && !has(l)) onChange([...value, { label: l.slice(0, 60), qty: '' }]); setOwn('') }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-line p-3" data-testid="variants">
      <span className="flex items-center gap-1"><BiLabel text={title} size="md" bold /><Help term="items.variants" size="sm" /></span>
      <BiLabel text="var.hint" size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick('var.by')}>
        {(['color', 'size', 'other'] as const).map((b) => <button key={b} type="button" aria-pressed={by === b} onClick={() => onBy(b)} className={chip(by === b)} data-testid={`var-by-${b}`}>{pick(`var.byKind.${b}`)}</button>)}
      </div>
      {options.length ? (
        <div className="flex flex-wrap gap-1.5" data-testid="var-options">
          {options.map((l) => <button key={l} type="button" role="checkbox" aria-checked={has(l)} onClick={() => toggle(l)} className={chip(has(l))}>{has(l) ? <Check size={14} /> : null}{l}</button>)}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><BiInput label="var.own" help={null} value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} maxLength={60} placeholder={pick(`var.ownPh.${by}`)} data-testid="var-own" /></div>
        <button type="button" onClick={add} disabled={!own.trim()} aria-label={pick('var.add')} className="tap mb-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-ground disabled:opacity-40" data-testid="var-add"><Plus size={20} /></button>
      </div>
      {withQty && value.length ? (
        <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="var-rows">
          {value.map((v) => (
            <div key={v.label} className="flex items-center gap-2 px-3 py-1.5">
              <span className={`min-w-0 flex-1 truncate ${ur ? cls('sm') : 'text-sm font-bold'}`} dir="auto">{v.label}</span>
              <input aria-label={`${pick(qtyLabel)} · ${v.label}`} type="number" inputMode="numeric" min={0} value={v.qty} onChange={(e) => onChange(value.map((x) => (x.label === v.label ? { ...x, qty: e.target.value } : x)))} placeholder="0" className="num h-11 w-28 rounded-xl border border-line bg-ground px-3 text-end" />
              <button type="button" aria-label={pick('crud.delete')} onClick={() => toggle(v.label)} className="tap flex h-10 w-10 items-center justify-center rounded-xl text-payable"><X size={16} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {value.length ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} data-testid="var-count">{pick('var.count').replace('{{n}}', String(value.length))}</span> : null}
    </div>
  )
}

/** on an item's page: the other kinds of the same product, and a way to add one */
export function KindsCard({ item, canAdd }: { item: Item; canAdd: boolean }) {
  const { ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const { data: kinds, refetch } = useGet<Item[]>(['item-variants', item.id], `/api/v1/accessories/${item.id}/variants`)
  const [open, setOpen] = useState(false)
  const [by, setBy] = useState<VariantBy>('color')
  const [vars, setVars] = useState<Variant[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const others = (kinds ?? []).filter((k) => k.id !== item.id)
  if (!others.length && !canAdd) return null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  async function save() {
    setBusy(true); setErr(null)
    try {
      await post(`/api/v1/accessories/${item.id}/variants`, { variant_by: by, variants: vars.map((v) => ({ label: v.label, opening_qty: Number(v.qty || 0) })) })
      setVars([]); setOpen(false)
      await refetch(); await inv('accessories', 'accessory', 'stock-items')
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  return (
    <section className="card flex flex-col gap-2" data-testid="item-kinds">
      <span className="flex items-center gap-1"><span className="flex-1"><BiLabel text="var.kinds" size="md" bold /></span><Help term="items.variants" size="sm" /></span>
      {(kinds ?? []).length > 1 ? (
        <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {(kinds ?? []).map((k) => (
            <button key={k.id} type="button" disabled={k.id === item.id} onClick={() => nav(`/accessories/${k.id}`)} className={`tap flex min-h-12 items-center gap-3 px-3 py-1.5 text-start ${k.id === item.id ? 'bg-emerald-tint/40' : ''}`} data-testid="item-kind">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate ${ur ? cls('sm') : 'text-sm font-bold'}`} dir="auto">{k.variant || '—'}</span>
                <span className={`num text-muted ${small}`} dir="ltr">{k.sku}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end"><span className={`num text-base ${k.qty <= 0 ? 'text-payable' : ''}`} dir="ltr">{k.qty}</span><MoneyText value={k.price} tone="muted" size="sm" /></span>
            </button>
          ))}
        </div>
      ) : <BiLabel text="var.none" size="sm" tone="text-muted" />}
      {canAdd ? <BiButton text="var.addKind" icon={<Plus size={18} />} variant="secondary" full onClick={() => { setErr(null); setOpen(true) }} data-testid="item-kind-add" /> : null}
      <Sheet open={open} onClose={() => setOpen(false)} title="var.addKind">
        <div className="flex flex-col gap-3">
          <span className={`truncate ${ur ? cls('md') : 'text-base font-extrabold'}`} dir="auto">{item.name}</span>
          <VariantPicker by={by} onBy={setBy} value={vars} onChange={setVars} suggest={[]} withQty />
          <ErrorText error={err} />
          <BiButton text="common.save" icon={<Check size={20} />} full loading={busy} disabled={!vars.length} onClick={save} data-testid="item-kind-save" />
        </div>
      </Sheet>
    </section>
  )
}
