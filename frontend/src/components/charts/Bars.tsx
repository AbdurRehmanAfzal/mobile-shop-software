/** A plain bar chart on design tokens (docs/17 P9-1, started in P4): one series over time or
 *  categories, Latin digits, no library. Tap a bar to drill down. Works in RTL (bars keep the
 *  natural time order left → right because `dir="ltr"` is set on the drawing). */

import { useId, useState } from 'react'
import { useLang } from '@/components/Bilingual'

export interface Bar { label: string; value: number; hint?: string; key?: string }

const fmt = (v: number) => Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))

export default function Bars({ data, tone = 'rgb(var(--emerald))', negativeTone = 'rgb(var(--payable))', height = 140, onTap, testid, empty }: { data: Bar[]; tone?: string; negativeTone?: string; height?: number; onTap?: (b: Bar, i: number) => void; testid?: string; empty?: string }) {
  const { pick, ur, cls } = useLang()
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const n = data.length
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)))
  const hasNeg = data.some((d) => d.value < 0)
  const w = 100
  const gap = n > 20 ? 0.3 : 1
  const bw = (w - gap * (n + 1)) / Math.max(n, 1)
  const zero = hasNeg ? 50 : 100
  const every = n > 24 ? Math.ceil(n / 6) : n > 12 ? 2 : 1
  if (!n || data.every((d) => !d.value)) {
    return <div className={`flex h-24 items-center justify-center rounded-2xl bg-ground text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} data-testid={testid}>{empty ? pick(empty) : '—'}</div>
  }
  const act = active != null ? data[active] : null
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <div className={`flex h-5 items-center justify-between text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
        <span>{act ? act.label : data[0].label}{!act && n > 1 ? ` → ${data[n - 1].label}` : ''}</span>
        <span className="num" dir="ltr">{act ? act.value.toLocaleString('en-US') : `max ${fmt(max)}`}{act?.hint ? ` · ${act.hint}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height, direction: 'ltr' }} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{data.map((d) => `${d.label}: ${d.value}`).join(', ')}</title>
        <line x1={0} x2={w} y1={zero} y2={zero} stroke="rgb(var(--line))" strokeWidth={0.4} />
        {data.map((d, i) => {
          const h = (Math.abs(d.value) / max) * (hasNeg ? 48 : 96)
          const x = gap + i * (bw + gap)
          const y = d.value >= 0 ? zero - h : zero
          return (
            <g key={d.key ?? i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => { setActive(i); onTap?.(d, i) }} style={{ cursor: onTap ? 'pointer' : 'default' }}>
              <rect x={x} y={y} width={bw} height={Math.max(h, d.value ? 0.6 : 0)} rx={bw > 3 ? 0.8 : 0.3} fill={d.value < 0 ? negativeTone : tone} opacity={active == null || active === i ? 1 : 0.45} />
              <rect x={x} y={0} width={bw} height={height} fill="transparent" />
            </g>
          )
        })}
      </svg>
      <div className={`flex justify-between text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} dir="ltr">
        {data.map((d, i) => (i % every === 0 || i === n - 1 ? <span key={i} className="truncate">{d.label}</span> : null))}
      </div>
    </div>
  )
}
