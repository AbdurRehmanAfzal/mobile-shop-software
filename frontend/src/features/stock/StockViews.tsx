/** Ways to look at the stock (owner 2026-11-09): the cards, an Excel-style table (rows and columns,
 *  sort by any column), a grid of small tiles, and a compact list. The choice is kept on this device. */

import { ArrowDown, ArrowUp, LayoutGrid, List as ListIcon, Rows3, Table2 } from 'lucide-react'
import { useState } from 'react'
import { useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, MoneyText } from '@/components/ui'
import type { Device } from '@/lib/types'
import { simTypeText } from '@/features/purchase/AppleVariant'

export type StockView = 'cards' | 'table' | 'grid' | 'list'
const VIEWS: { v: StockView; icon: typeof Rows3 }[] = [
  { v: 'cards', icon: Rows3 },
  { v: 'table', icon: Table2 },
  { v: 'grid', icon: LayoutGrid },
  { v: 'list', icon: ListIcon },
]
const KEY = 'stock.view'

export function loadView(): StockView {
  try {
    const v = localStorage.getItem(KEY)
    return VIEWS.some((x) => x.v === v) ? (v as StockView) : 'cards'
  } catch {
    return 'cards'
  }
}

export function saveView(v: StockView) {
  try { localStorage.setItem(KEY, v) } catch { /* private mode */ }
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

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

type Col = { key: string; label: string; get: (d: Device) => string | number | null; num?: boolean; money?: boolean; ltr?: boolean }

/** Excel-style: one row per unit, a column per detail; tap a heading to sort, tap a row to open it. */
export function StockTable({ rows, onOpen, picked, onPick }: { rows: Device[]; onOpen: (d: Device) => void; picked?: string[]; onPick?: (d: Device) => void }) {
  const { pick } = useLang()
  const [by, setBy] = useState<{ key: string; up: boolean } | null>(null)
  const anyCost = rows.some((d) => d.cost_price != null)
  const anyApple = rows.some((d) => d.region_code || d.sim_type || d.battery_cycles != null)
  const cols: Col[] = [
    { key: 'name', label: pick('stock.col.device'), get: (d) => `${d.brand_name} ${d.model_name}` },
    { key: 'storage', label: pick('stock.storageShort'), get: (d) => (d.category === 'watch' ? (d.size_mm ? `${d.size_mm}mm` : null) : d.storage_name) },
    { key: 'colour', label: pick('stock.col.colour'), get: (d) => d.colour_name },
    { key: 'condition', label: pick('stock.conditionShort'), get: (d) => pick(`stock.condition.${d.condition}`) },
    { key: 'pta', label: pick('stock.ptaShort'), get: (d) => ((d.category ?? 'phone') === 'phone' || d.cellular ? pick(`stock.pta.${d.pta_status}`) : '—') },
    { key: 'battery', label: pick('stock.col.battery'), get: (d) => d.battery_health ?? null, num: true },
    ...(anyApple
      ? [
          { key: 'cycles', label: pick('stock.col.cycles'), get: (d: Device) => d.battery_cycles ?? null, num: true },
          { key: 'region', label: pick('devx.region'), get: (d: Device) => d.region_code ?? null, ltr: true },
          { key: 'sim', label: pick('devx.simTypeLabel'), get: (d: Device) => simTypeText(d.sim_type, pick) },
        ]
      : []),
    { key: 'imei', label: 'IMEI', get: (d) => d.imei1, ltr: true },
    { key: 'days', label: pick('stock.daysIn'), get: (d) => daysSince(d.last_event_at), num: true },
    ...(anyCost ? [{ key: 'cost', label: pick('stock.col.cost'), get: (d: Device) => (d.cost_price != null ? Number(d.cost_price) : null), num: true, money: true }] : []),
    { key: 'asking', label: pick('stock.col.asking'), get: (d) => (d.asking_price != null ? Number(d.asking_price) : null), num: true, money: true },
    { key: 'status', label: pick('stock.col.status'), get: (d) => pick(`stock.status.${d.status}`) },
  ]
  const col = by ? cols.find((c) => c.key === by.key) : null
  const shown = col
    ? [...rows].sort((a, b) => {
        const x = col.get(a)
        const y = col.get(b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return by!.up ? r : -r
      })
    : rows
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
                    <button type="button" onClick={() => setBy(on ? (by!.up ? { key: c.key, up: false } : null) : { key: c.key, up: true })} className={`tap flex w-full items-center gap-1 whitespace-nowrap px-3 py-2 text-[12px] font-bold ${c.num ? 'justify-end' : 'justify-start'} ${on ? 'text-emerald-deep' : 'text-muted'}`}>
                      {c.label}
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
                    const v = c.get(d)
                    return (
                      <td key={c.key} className={`border-b border-s border-line px-3 py-2 whitespace-nowrap ${c.num ? 'num text-end' : ''} ${c.key === 'name' ? `sticky start-0 font-bold text-ink ${sel ? 'bg-emerald-tint' : i % 2 ? 'bg-ground' : 'bg-surface'}` : ''}`} dir={c.ltr || c.num ? 'ltr' : undefined}>
                        {c.key === 'name' ? <span className="num me-2 text-[11px] font-semibold text-muted">{i + 1}</span> : null}
                        {v == null || v === '' ? <span className="text-muted">—</span> : c.money ? <MoneyText value={v} tone="ink" size="sm" /> : c.key === 'battery' ? `${v}%` : v}
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

/** small tiles, two to five across: name, the key detail and the price */
export function StockGrid({ rows, onOpen, picked, onPick }: { rows: Device[]; onOpen: (d: Device) => void; picked?: string[]; onPick?: (d: Device) => void }) {
  const { pick } = useLang()
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="stock-grid">
      {rows.map((d) => {
        const sel = picked?.includes(d.id)
        return (
          <button key={d.id} type="button" onClick={() => (onPick ? onPick(d) : onOpen(d))} className={`tap card flex min-h-[132px] flex-col gap-1.5 p-3 text-start ${sel ? 'ring-2 ring-emerald' : ''}`}>
            <span className="well h-9 w-9 rounded-full bg-emerald-tint text-xs font-extrabold text-emerald-deep">{d.brand_name.slice(0, 2).toUpperCase()}</span>
            <span className="line-clamp-2 text-[14px] font-extrabold leading-tight text-ink">{d.brand_name} {d.model_name}</span>
            <span className="truncate text-xs font-semibold text-muted">{[d.storage_name, d.colour_name, d.region_code].filter(Boolean).join(' · ') || pick(`stock.condition.${d.condition}`)}</span>
            <span className="mt-auto flex items-center justify-between gap-1">
              {d.asking_price ? <MoneyText value={d.asking_price} tone="ink" size="sm" /> : <span className="text-xs text-muted">—</span>}
              {d.status !== 'in_stock' ? <Chip text={`stock.status.${d.status}`} tone="ink" /> : d.battery_health ? <span className="num text-[11px] font-bold text-emerald-deep" dir="ltr">{d.battery_health}%</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
