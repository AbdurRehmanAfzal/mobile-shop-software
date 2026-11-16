/** The stock screen's filters, made plain (owner 2026-11-16, ADR-091): one "Filters" button opens a
 *  sheet of tick boxes (status, brand, condition, PTA — tick as many as you like) and the less used
 *  ones below; every filter that is on shows as a chip with × under the search, and "Clear all"
 *  takes them all off. Nothing is hidden: what is on is always in sight. */

import { Check, SlidersHorizontal, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Sheet } from '@/components/ui'
import type { Party } from '@/lib/types'

export interface Sel { status: string[]; brand: string[]; condition: string[]; pta: string[] }
export const NO_SEL: Sel = { status: [], brand: [], condition: [], pta: [] }
export const DEFAULT_SEL: Sel = { ...NO_SEL, status: ['in_stock'] }
export interface Fx { grade: string; ram: string; min: string; max: string; lock: boolean; condition?: string; pta?: string; age: string; costMin: string; costMax: string; supplier: string; shelf: string }
export const NO_FX: Fx = { grade: '', ram: '', min: '', max: '', lock: false, age: '', costMin: '', costMax: '', supplier: '', shelf: '' }

export const STATUSES = ['in_stock', 'on_loan', 'in_repair', 'faulty', 'sold'] as const
const CONDITIONS = ['box_pack', 'open_box', 'used', 'patched'] as const
const PTAS = ['pta_approved', 'non_pta', 'jv', 'cpid'] as const

export const fxCount = (fx: Fx) => [fx.grade, fx.ram, fx.min, fx.max, fx.age, fx.costMin, fx.costMax, fx.supplier, fx.shelf].filter(Boolean).length + (fx.lock ? 1 : 0)
export const selCount = (s: Sel) => s.status.length + s.brand.length + s.condition.length + s.pta.length

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Tick({ on, label, count, onClick, testid }: { on: boolean; label: ReactNode; count?: number; onClick: () => void; testid?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className={`tap flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-start ${on ? 'border-emerald bg-emerald-tint' : 'border-line bg-surface'}`} data-testid={testid}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-emerald bg-emerald text-white' : 'border-line bg-surface'}`}>{on ? <Check size={16} strokeWidth={3} /> : null}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{label}</span>
      {count != null ? <span className="num shrink-0 rounded-full bg-ground px-2 py-0.5 text-xs font-bold text-muted">{count}</span> : null}
    </button>
  )
}

function Group({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="flex items-center gap-1"><BiLabel text={title} size="md" bold /><Help term={help} size="sm" /></span>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

/** the button that opens the sheet, with how many filters are on */
export function FiltersButton({ n, onClick }: { n: number; onClick: () => void }) {
  const { pick } = useLang()
  return (
    <button type="button" onClick={onClick} className={`tap flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 font-bold ${n ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid="stock-filters">
      <SlidersHorizontal size={18} />
      <span className="text-sm">{pick('sfx.filters')}</span>
      {n ? <span className="num rounded-full bg-ground px-2 text-xs font-extrabold text-ink">{n}</span> : null}
    </button>
  )
}

export function FilterSheet({ open, onClose, sel, onSel, fx, onFx, brands, canCost, suppliers, shown }: {
  open: boolean
  onClose: () => void
  sel: Sel
  onSel: (s: Sel) => void
  fx: Fx
  onFx: (f: Fx) => void
  brands: { id: string; name: string; count?: number }[]
  canCost: boolean
  suppliers: Party[] | undefined
  shown: number
}) {
  const { pick } = useLang()
  const sel1 = (k: keyof Sel, v: string) => onSel({ ...sel, [k]: toggle(sel[k], v) })
  const select = 'min-h-12 w-full rounded-2xl border border-line bg-surface px-3 text-sm font-bold'
  return (
    <Sheet open={open} onClose={onClose} title="sfx.filters">
      <div className="flex flex-col gap-5" data-testid="filter-sheet">
        <BiLabel text="sfx.hint" size="sm" tone="text-muted" />
        <Group title="sfx.status" help="stock.statusFilter">
          {STATUSES.map((s) => <Tick key={s} on={sel.status.includes(s)} label={pick(`stock.status.${s}`)} onClick={() => sel1('status', s)} testid={`fx-status-${s}`} />)}
        </Group>
        {brands.length ? (
          <Group title="sfx.brand" help="stock.brands">
            {brands.map((b) => <Tick key={b.id} on={sel.brand.includes(b.id)} label={b.name} count={b.count} onClick={() => sel1('brand', b.id)} testid={`fx-brand-${b.name}`} />)}
          </Group>
        ) : null}
        <Group title="stock.conditionShort" help="device.condition">
          {CONDITIONS.map((c) => <Tick key={c} on={sel.condition.includes(c)} label={pick(`stock.condition.${c}`)} onClick={() => sel1('condition', c)} testid={`fx-cond-${c}`} />)}
        </Group>
        <Group title="stock.ptaShort" help="device.pta">
          {PTAS.map((c) => <Tick key={c} on={sel.pta.includes(c)} label={pick(`stock.pta.${c}`)} onClick={() => sel1('pta', c)} testid={`fx-pta-${c}`} />)}
        </Group>

        <section className="flex flex-col gap-2">
          <span className="flex items-center gap-1"><BiLabel text="sfx.more" size="md" bold /><Help term="stock.filters" size="sm" /></span>
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="devx.priceMin" type="number" inputMode="numeric" min={0} value={fx.min} onChange={(e) => onFx({ ...fx, min: e.target.value })} className="num" />
            <BiInput label="devx.priceMax" type="number" inputMode="numeric" min={0} value={fx.max} onChange={(e) => onFx({ ...fx, max: e.target.value })} className="num" />
            <label className="flex flex-col gap-1"><BiLabel text="devx.grade" size="sm" tone="text-muted" /><select aria-label={pick('devx.grade')} value={fx.grade} onChange={(e) => onFx({ ...fx, grade: e.target.value })} className={select}><option value="">{pick('devx.anyGrade')}</option>{['a', 'b', 'refurbished', 'copy'].map((g) => <option key={g} value={g}>{pick(`devx.grades.${g}`)}</option>)}</select></label>
            <label className="flex flex-col gap-1"><BiLabel text="devx.ram" size="sm" tone="text-muted" /><select aria-label={pick('devx.ram')} value={fx.ram} onChange={(e) => onFx({ ...fx, ram: e.target.value })} className={select}><option value="">{pick('devx.anyRam')}</option>{[2, 3, 4, 6, 8, 12, 16].map((g) => <option key={g} value={g}>{g} GB</option>)}</select></label>
            <label className="flex flex-col gap-1"><BiLabel text="stock.fx.age" size="sm" tone="text-muted" /><select aria-label={pick('stock.fx.age')} value={fx.age} onChange={(e) => onFx({ ...fx, age: e.target.value })} className={select} data-testid="fx-age"><option value="">{pick('common.all')}</option>{['30', '60', '90'].map((d) => <option key={d} value={d}>{pick('stock.fx.olderThan').replace('{{n}}', d)}</option>)}</select></label>
            <label className="flex flex-col gap-1"><BiLabel text="stock.fx.supplier" size="sm" tone="text-muted" /><select aria-label={pick('stock.fx.supplier')} value={fx.supplier} onChange={(e) => onFx({ ...fx, supplier: e.target.value })} className={select}><option value="">{pick('common.all')}</option>{(suppliers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <BiInput label="stock.shelf" value={fx.shelf} onChange={(e) => onFx({ ...fx, shelf: e.target.value })} maxLength={60} />
            {canCost ? <BiInput label="stock.fx.costMin" type="number" inputMode="numeric" min={0} value={fx.costMin} onChange={(e) => onFx({ ...fx, costMin: e.target.value })} className="num" /> : null}
            {canCost ? <BiInput label="stock.fx.costMax" type="number" inputMode="numeric" min={0} value={fx.costMax} onChange={(e) => onFx({ ...fx, costMax: e.target.value })} className="num" /> : null}
            <div className="col-span-2"><Tick on={fx.lock} label={pick('devx.lockUnchecked')} onClick={() => onFx({ ...fx, lock: !fx.lock })} /></div>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-1 grid grid-cols-[auto_1fr] gap-2 bg-ground/95 px-1 pb-1 pt-2 backdrop-blur">
          <BiButton text="sfx.clearAll" variant="secondary" onClick={() => { onSel(NO_SEL); onFx(NO_FX) }} data-testid="fx-clear" />
          <BiButton text={{ en: pick('sfx.showN').replace('{{n}}', String(shown)), ur: pick('sfx.showN').replace('{{n}}', String(shown)), roman: pick('sfx.showN').replace('{{n}}', String(shown)) }} onClick={onClose} data-testid="fx-apply" />
        </div>
      </div>
    </Sheet>
  )
}

/** every filter that is on, as a chip with × (the search has its own ×) */
export function ActiveChips({ sel, onSel, fx, onFx, brandName, supplierName, extra, onClearAll }: {
  sel: Sel
  onSel: (s: Sel) => void
  fx: Fx
  onFx: (f: Fx) => void
  brandName: (id: string) => string
  supplierName: (id: string) => string
  extra?: { key: string; label: string; onRemove: () => void }[]
  onClearAll: () => void
}) {
  const { pick } = useLang()
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...(extra ?? []),
    ...sel.status.map((s) => ({ key: `s-${s}`, label: pick(`stock.status.${s}`), onRemove: () => onSel({ ...sel, status: sel.status.filter((x) => x !== s) }) })),
    ...sel.brand.map((b) => ({ key: `b-${b}`, label: brandName(b), onRemove: () => onSel({ ...sel, brand: sel.brand.filter((x) => x !== b) }) })),
    ...sel.condition.map((c) => ({ key: `c-${c}`, label: pick(`stock.condition.${c}`), onRemove: () => onSel({ ...sel, condition: sel.condition.filter((x) => x !== c) }) })),
    ...sel.pta.map((c) => ({ key: `p-${c}`, label: pick(`stock.pta.${c}`), onRemove: () => onSel({ ...sel, pta: sel.pta.filter((x) => x !== c) }) })),
    ...(fx.min ? [{ key: 'min', label: `${pick('devx.priceMin')} ${fx.min}`, onRemove: () => onFx({ ...fx, min: '' }) }] : []),
    ...(fx.max ? [{ key: 'max', label: `${pick('devx.priceMax')} ${fx.max}`, onRemove: () => onFx({ ...fx, max: '' }) }] : []),
    ...(fx.grade ? [{ key: 'grade', label: pick(`devx.grades.${fx.grade}`), onRemove: () => onFx({ ...fx, grade: '' }) }] : []),
    ...(fx.ram ? [{ key: 'ram', label: `RAM ${fx.ram} GB`, onRemove: () => onFx({ ...fx, ram: '' }) }] : []),
    ...(fx.age ? [{ key: 'age', label: pick('stock.fx.olderThan').replace('{{n}}', fx.age), onRemove: () => onFx({ ...fx, age: '' }) }] : []),
    ...(fx.supplier ? [{ key: 'sup', label: supplierName(fx.supplier), onRemove: () => onFx({ ...fx, supplier: '' }) }] : []),
    ...(fx.shelf ? [{ key: 'shelf', label: `${pick('stock.shelf')}: ${fx.shelf}`, onRemove: () => onFx({ ...fx, shelf: '' }) }] : []),
    ...(fx.costMin ? [{ key: 'cmin', label: `${pick('stock.fx.costMin')} ${fx.costMin}`, onRemove: () => onFx({ ...fx, costMin: '' }) }] : []),
    ...(fx.costMax ? [{ key: 'cmax', label: `${pick('stock.fx.costMax')} ${fx.costMax}`, onRemove: () => onFx({ ...fx, costMax: '' }) }] : []),
    ...(fx.lock ? [{ key: 'lock', label: pick('devx.lockUnchecked'), onRemove: () => onFx({ ...fx, lock: false }) }] : []),
  ]
  if (!chips.length) return <span className="text-xs font-semibold text-muted" data-testid="active-filters">{pick('sfx.none')}</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filters">
      {chips.map((c) => (
        <span key={c.key} className="flex h-9 items-center gap-1 rounded-full bg-ink ps-3 pe-1 text-sm font-bold text-ground" data-testid="filter-chip">
          {c.label}
          <button type="button" aria-label={`${pick('sfx.remove')} ${c.label}`} onClick={c.onRemove} className="tap flex h-7 w-7 items-center justify-center rounded-full bg-ground/15 hover:bg-ground/25"><X size={14} /></button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="tap h-9 rounded-full px-2 text-sm font-bold text-payable underline" data-testid="filters-clear-all">{pick('sfx.clearAll')}</button>
    </div>
  )
}
