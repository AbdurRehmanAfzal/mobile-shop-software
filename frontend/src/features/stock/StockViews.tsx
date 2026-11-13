/** Ways to look at the stock (owner 2026-11-09): the cards, an Excel-style table (rows and columns,
 *  sort by any column), a grid of small tiles and a compact list. The shopkeeper picks which fields
 *  show (in every view) and the download / share carries the same fields. Both choices are kept on
 *  this device. */

import { ArrowDown, ArrowUp, Columns3, LayoutGrid, List as ListIcon, RotateCcw, Rows3, Table2 } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BtnText, Chip, MoneyText, Sheet } from '@/components/ui'
import type { Device } from '@/lib/types'
import { simTypeText } from '@/features/purchase/AppleVariant'

export type StockView = 'cards' | 'table' | 'grid' | 'list'
const VIEWS: { v: StockView; icon: typeof Rows3 }[] = [
  { v: 'cards', icon: Rows3 },
  { v: 'table', icon: Table2 },
  { v: 'grid', icon: LayoutGrid },
  { v: 'list', icon: ListIcon },
]

function load<T>(key: string, ok: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    const v = raw === null ? null : raw.startsWith('[') ? JSON.parse(raw) : raw
    return ok(v) ? v : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)) } catch { /* private mode */ }
}

export const loadView = () => load<StockView>('stock.view', (v): v is StockView => VIEWS.some((x) => x.v === v), 'cards')
export const saveView = (v: StockView) => save('stock.view', v)

/** every field a unit can show; `key` is shared with the server's stock export (`cols`) */
export type FieldKey = 'shelf' | 'reserved' | 'source' | 'storage' | 'colour' | 'condition' | 'pta' | 'sim_time' | 'battery' | 'cycles' | 'region' | 'sim' | 'simlock' | 'grade' | 'ram' | 'imei' | 'imei2' | 'serial' | 'barcode' | 'days' | 'cost' | 'asking' | 'status' | 'verification'
type Field = { key: FieldKey; label: string; get: (d: Device, pick: (k: string) => string) => string | number | null; num?: boolean; money?: boolean; ltr?: boolean; apple?: boolean }

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
const hasSim = (d: Device) => (d.category ?? 'phone') === 'phone' || !!d.cellular

export const FIELDS: Field[] = [
  { key: 'storage', label: 'stock.storageShort', get: (d) => (d.category === 'watch' ? (d.size_mm ? `${d.size_mm}mm` : null) : d.storage_name) },
  { key: 'colour', label: 'stock.col.colour', get: (d) => d.colour_name },
  { key: 'condition', label: 'stock.conditionShort', get: (d, p) => p(`stock.condition.${d.condition}`) },
  { key: 'pta', label: 'stock.ptaShort', get: (d, p) => (hasSim(d) ? p(`stock.pta.${d.pta_status}`) : null) },
  { key: 'sim_time', label: 'stock.col.simTime', get: (d) => d.sim_time_months ?? null, num: true },
  { key: 'battery', label: 'stock.col.battery', get: (d) => (d.battery_health ? `${d.battery_health}%` : null), ltr: true },
  { key: 'cycles', label: 'stock.col.cycles', get: (d) => d.battery_cycles ?? null, num: true, apple: true },
  { key: 'region', label: 'devx.region', get: (d) => d.region_code ?? null, ltr: true, apple: true },
  { key: 'sim', label: 'devx.simTypeLabel', get: (d, p) => simTypeText(d.sim_type, p), apple: true },
  { key: 'simlock', label: 'simlock.label', get: (d, p) => (d.sim_lock ? [p(`simlock.${d.sim_lock}`), d.sim_lock_carrier].filter(Boolean).join(' · ') : null) },
  { key: 'grade', label: 'devx.grade', get: (d, p) => (d.grade ? p(`devx.grades.${d.grade}`) : null) },
  { key: 'ram', label: 'devx.ram', get: (d) => (d.ram_gb ? `${d.ram_gb} GB` : null), ltr: true },
  { key: 'imei', label: 'stock.col.imei', get: (d) => d.imei1, ltr: true },
  { key: 'imei2', label: 'stock.col.imei2', get: (d) => d.imei2 ?? null, ltr: true },
  { key: 'serial', label: 'stock.col.serial', get: (d) => d.serial ?? null, ltr: true },
  { key: 'barcode', label: 'stock.col.barcode', get: (d) => d.barcode ?? null, ltr: true },
  { key: 'days', label: 'stock.daysIn', get: (d) => daysSince(d.last_event_at), num: true },
  { key: 'source', label: 'stock.col.source', get: (d) => d.source_party_name ?? null },
  { key: 'shelf', label: 'stock.shelf', get: (d) => d.location ?? null },
  { key: 'reserved', label: 'stock.card.reserved', get: (d) => d.reserved_party_name ?? null },
  { key: 'cost', label: 'stock.col.cost', get: (d) => (d.cost_price != null ? Number(d.cost_price) : null), num: true, money: true },
  { key: 'asking', label: 'stock.col.asking', get: (d) => (d.asking_price != null ? Number(d.asking_price) : null), num: true, money: true },
  { key: 'status', label: 'stock.col.status', get: (d, p) => p(`stock.status.${d.status}`) },
  { key: 'verification', label: 'stock.col.verification', get: (d, p) => (d.verification_status !== 'not_required' ? p(`stock.verification.${d.verification_status}`) : null) },
]
export const DEFAULT_FIELDS: FieldKey[] = ['storage', 'colour', 'condition', 'pta', 'battery', 'cycles', 'region', 'sim', 'imei', 'days', 'cost', 'asking', 'status']
const isFields = (v: unknown): v is FieldKey[] => Array.isArray(v) && v.every((k) => FIELDS.some((f) => f.key === k))
export const loadFields = () => load<FieldKey[]>('stock.fields', isFields, DEFAULT_FIELDS)
export const saveFields = (v: FieldKey[]) => save('stock.fields', v)

/** the fields to show for these rows: the picked ones, in the list's order; an Apple-only field and
 *  cost (hidden from staff by the server) are left out when no unit has a value */
export function shownFields(keys: FieldKey[], rows: Device[]): Field[] {
  return FIELDS.filter((f) => keys.includes(f.key)).filter((f) => {
    if (f.key === 'cost') return rows.some((d) => d.cost_price != null)
    if (f.apple) return rows.some((d) => f.get(d, (k) => k) != null)
    return true
  })
}

export function ViewSwitch({ value, onChange }: { value: StockView; onChange: (v: StockView) => void }) {
  const { pick } = useLang()
  return (
    <div className="flex items-center gap-1" data-testid="stock-views">
      <div role="radiogroup" aria-label={pick('stock.view.title')} className="flex flex-1 rounded-2xl border border-line bg-surface p-1">
        {VIEWS.map(({ v, icon: Icon }) => {
          const on = value === v
          return (
            <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)} className={`tap flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${on ? 'bg-ink text-ground' : 'text-muted'}`} data-testid={`view-${v}`}>
              <Icon size={17} />
              {pick(`stock.view.${v}`)}
            </button>
          )
        })}
      </div>
      <Help term="stock.view" size="sm" />
    </div>
  )
}

/** "Fields": tick which details show, in every view and in the download */
export function FieldsButton({ value, onChange }: { value: FieldKey[]; onChange: (v: FieldKey[]) => void }) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const toggle = (k: FieldKey) => onChange(value.includes(k) ? value.filter((x) => x !== k) : FIELDS.map((f) => f.key).filter((x) => x === k || value.includes(x)))
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1" data-testid="stock-fields">
        <Columns3 size={20} />
        <BtnText k="stock.fields.button" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="stock.fields.title">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="stock.fields.hint" size="sm" tone="text-muted" /><Help term="stock.fields" size="sm" /></span>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => {
              const on = value.includes(f.key)
              return (
                <button key={f.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f.key)} className={`tap flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 text-start text-sm font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid={`field-${f.key}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-ground bg-ground text-ink' : 'border-line'}`}>{on ? '✓' : ''}</span>
                  {pick(f.label)}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BiButton text="stock.fields.reset" icon={<RotateCcw size={18} />} variant="secondary" full onClick={() => onChange(DEFAULT_FIELDS)} />
            <BiButton text="common.done" full onClick={() => setOpen(false)} />
          </div>
        </div>
      </Sheet>
    </>
  )
}

export type ColSort = { key: FieldKey | 'name'; up: boolean } | null

/** Excel-style: one row per unit, a column per picked field; tap a heading to sort, a row to open */
export function StockTable({ rows, fields, by, onSort, onOpen, picked, onPick }: { rows: Device[]; fields: FieldKey[]; by: ColSort; onSort: (s: ColSort) => void; onOpen: (d: Device) => void; picked?: string[]; onPick?: (d: Device) => void }) {
  const { pick } = useLang()
  const cols: (Field | { key: 'name'; label: string; get: (d: Device) => string; num?: false; money?: false; ltr?: false })[] = [
    { key: 'name', label: 'stock.col.device', get: (d) => `${d.brand_name} ${d.model_name}` },
    ...shownFields(fields, rows),
  ]
  const col = by ? cols.find((c) => c.key === by.key) : null
  const shown = col ? sortRows(rows, (d) => col.get(d, pick), by!.up) : rows
  const total = (k: 'cost_price' | 'asking_price') => rows.reduce((s, d) => s + Number(d[k] ?? 0), 0)

  return (
    <div className="card overflow-hidden p-0">
      <div className="max-h-[70vh] overflow-auto" data-testid="stock-table">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-ground">
            <tr>
              {onPick ? <th className="border-b border-line px-2 py-2" /> : null}
              {cols.map((c) => {
                const on = by?.key === c.key
                return (
                  <th key={c.key} className={`border-b border-s border-line p-0 ${c.key === 'name' ? 'sticky start-0 z-10 bg-ground' : ''}`}>
                    <button type="button" onClick={() => onSort(on ? (by!.up ? { key: c.key, up: false } : null) : { key: c.key, up: true })} className={`tap flex w-full items-center gap-1 whitespace-nowrap px-3 py-2 text-[12px] font-bold ${c.num ? 'justify-end' : 'justify-start'} ${on ? 'text-emerald-deep' : 'text-muted'}`}>
                      {pick(c.label)}
                      {on ? by!.up ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((d, i) => {
              const sel = picked?.includes(d.id)
              return (
                <tr key={d.id} onClick={() => onOpen(d)} className={`tap cursor-pointer ${sel ? 'bg-emerald-tint' : i % 2 ? 'bg-ground/50' : 'bg-surface'} hover:bg-emerald-tint/60`}>
                  {onPick ? (
                    <td className="border-b border-line px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={pick('label.pick')} checked={!!sel} onChange={() => onPick(d)} className="h-5 w-5 accent-[rgb(var(--emerald))]" />
                    </td>
                  ) : null}
                  {cols.map((c) => {
                    const v = c.get(d, pick)
                    return (
                      <td key={c.key} className={`border-b border-s border-line px-3 py-2 whitespace-nowrap ${c.num ? 'num text-end' : ''} ${c.key === 'name' ? `sticky start-0 font-bold text-ink ${sel ? 'bg-emerald-tint' : i % 2 ? 'bg-ground' : 'bg-surface'}` : ''}`} dir={c.ltr || c.num ? 'ltr' : undefined}>
                        {c.key === 'name' ? <span className="num me-2 text-[11px] font-semibold text-muted">{i + 1}</span> : null}
                        {v == null || v === '' ? <span className="text-muted">—</span> : c.money ? <MoneyText value={v} tone="ink" size="sm" /> : v}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-ground">
            <tr>
              {onPick ? <td className="border-t border-line" /> : null}
              {cols.map((c, i) => (
                <td key={c.key} className={`border-t border-s border-line px-3 py-2 whitespace-nowrap font-extrabold ${c.num ? 'text-end' : ''} ${c.key === 'name' ? 'sticky start-0 bg-ground' : ''}`} dir={c.num ? 'ltr' : undefined}>
                  {i === 0 ? pick('stock.col.total').replace('{{n}}', String(rows.length)) : c.key === 'cost' ? <MoneyText value={total('cost_price')} tone="ink" size="sm" /> : c.key === 'asking' ? <MoneyText value={total('asking_price')} tone="ink" size="sm" /> : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function sortRows(rows: Device[], get: (d: Device) => string | number | null, up: boolean): Device[] {
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
    return up ? r : -r
  })
}

/** the picked fields as short text, for the grid, the list and the cards */
export function fieldBits(d: Device, fields: FieldKey[], pick: (k: string) => string, skip: FieldKey[] = []) {
  return FIELDS.filter((f) => fields.includes(f.key) && !skip.includes(f.key))
    .map((f) => ({ f, v: f.get(d, pick) }))
    .filter((x) => x.v != null && x.v !== '')
}

/** small tiles, two to five across: name, the picked details and the price */
export function StockGrid({ rows, fields, onOpen, picked, onPick }: { rows: Device[]; fields: FieldKey[]; onOpen: (d: Device) => void; picked?: string[]; onPick?: (d: Device) => void }) {
  const { pick } = useLang()
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="stock-grid">
      {rows.map((d) => {
        const sel = picked?.includes(d.id)
        const bits = fieldBits(d, fields, pick, ['asking', 'cost', 'status'])
        return (
          <button key={d.id} type="button" onClick={() => (onPick ? onPick(d) : onOpen(d))} className={`tap card flex min-h-[132px] flex-col gap-1.5 p-3 text-start ${sel ? 'ring-2 ring-emerald' : ''}`}>
            <span className="well h-9 w-9 rounded-full bg-emerald-tint text-xs font-extrabold text-emerald-deep">{d.brand_name.slice(0, 2).toUpperCase()}</span>
            <span className="line-clamp-2 text-[14px] font-extrabold leading-tight text-ink">{d.brand_name} {d.model_name}</span>
            {bits.length ? <span className="line-clamp-3 text-xs font-semibold text-muted">{bits.map((x) => x.v).join(' · ')}</span> : null}
            <span className="mt-auto flex flex-wrap items-center justify-between gap-1">
              {fields.includes('asking') && d.asking_price ? <MoneyText value={d.asking_price} tone="ink" size="sm" /> : <span />}
              {fields.includes('cost') && d.cost_price != null ? <span className="text-[11px] text-muted">{pick('stock.col.cost')} <MoneyText value={d.cost_price} tone="muted" size="sm" /></span> : null}
              {fields.includes('status') && d.status !== 'in_stock' ? <Chip text={`stock.status.${d.status}`} tone="ink" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** one short line per unit */
export function StockList({ rows, fields, onOpen, picked, onPick }: { rows: Device[]; fields: FieldKey[]; onOpen: (d: Device) => void; picked?: string[]; onPick?: (d: Device) => void }) {
  const { pick } = useLang()
  return (
    <div className="card divide-y divide-line p-0" data-testid="stock-list">
      {rows.map((d) => {
        const sel = picked?.includes(d.id)
        const bits = fieldBits(d, fields, pick, ['asking', 'cost'])
        return (
          <button key={d.id} type="button" onClick={() => (onPick ? onPick(d) : onOpen(d))} className={`tap flex w-full items-center gap-3 px-3 py-2.5 text-start ${sel ? 'bg-emerald-tint' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{d.brand_name} {d.model_name}</span>
              {bits.length ? <span className="block truncate text-sm text-muted">{bits.map((x) => x.v).join(' · ')}</span> : null}
            </span>
            <span className="flex shrink-0 flex-col items-end">
              {fields.includes('asking') && d.asking_price ? <MoneyText value={d.asking_price} tone="ink" /> : null}
              {fields.includes('cost') && d.cost_price != null ? <MoneyText value={d.cost_price} tone="muted" size="sm" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
