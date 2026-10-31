/** A donut of shares on design tokens (docs/17 P9-1): up to eight slices, a legend with values,
 *  tap a slice or a legend row to drill down. Latin digits, RTL-safe, empty state. */

import { useState } from 'react'
import { useLang } from '@/components/Bilingual'

export interface Slice { label: string; value: number; key?: string; hint?: string }

const PALETTE = ['rgb(var(--emerald))', 'rgb(var(--receivable))', 'rgb(var(--payable))', 'rgb(var(--ink))', 'rgb(var(--emerald-deep))', '#7C6FF2', '#F59E0B', '#64748B']
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function Donut({ data, size = 120, onTap, testid, empty, unit = '' }: { data: Slice[]; size?: number; onTap?: (s: Slice, i: number) => void; testid?: string; empty?: string; unit?: string }) {
  const { pick, ur, cls } = useLang()
  const [active, setActive] = useState<number | null>(null)
  const slices = data.filter((d) => d.value > 0).slice(0, 8)
  const total = slices.reduce((s, d) => s + d.value, 0)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!total) return <div className={`flex h-24 items-center justify-center rounded-2xl bg-ground text-muted ${small}`} data-testid={testid}>{empty ? pick(empty) : '—'}</div>
  const r = 40, c = 50, stroke = 16, circ = 2 * Math.PI * r
  let offset = 0
  const act = active != null ? slices[active] : null
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0" role="img" style={{ direction: 'ltr' }}>
        <title>{slices.map((s) => `${s.label}: ${s.value}`).join(', ')}</title>
        {slices.map((s, i) => {
          const len = (s.value / total) * circ
          const el = (
            <circle key={s.key ?? i} cx={c} cy={c} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={active === i ? stroke + 3 : stroke} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`} opacity={active == null || active === i ? 1 : 0.4} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => onTap?.(s, i)} style={{ cursor: onTap ? 'pointer' : 'default', transition: 'stroke-width .15s' }} />
          )
          offset += len
          return el
        })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgb(var(--ink))" className="num">{act ? `${Math.round((act.value / total) * 100)}%` : n(total)}</text>
        <text x={c} y={c + 10} textAnchor="middle" fontSize="6" fill="rgb(var(--muted))">{act ? act.label.slice(0, 16) : unit}</text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {slices.map((s, i) => (
          <button key={s.key ?? i} type="button" onClick={() => onTap?.(s, i)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} className={`flex items-center gap-2 rounded-lg px-1 text-start ${onTap ? 'tap' : 'cursor-default'} ${active === i ? 'bg-ground' : ''}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className={`min-w-0 flex-1 truncate ${small}`}>{s.label}</span>
            <span className={`num ${small}`} dir="ltr">{n(s.value)} · {Math.round((s.value / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
