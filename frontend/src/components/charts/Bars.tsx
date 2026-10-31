/** A bar chart on design tokens (docs/17 P9-1): one series over time or categories, Latin digits,
 *  no library. Three light grid lines with their values, rounded bars, the hovered / tapped bar's
 *  value in the caption, tap to drill down. RTL-safe (time runs left → right). */

import { useId, useState } from 'react'
import { useLang } from '@/components/Bilingual'

export interface Bar { label: string; value: number; hint?: string; key?: string }

export const fmtShort = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 10_000_000 ? `${(a / 10_000_000).toFixed(a % 10_000_000 === 0 ? 0 : 1)}Cr` : a >= 100_000 ? `${(a / 100_000).toFixed(a % 100_000 === 0 ? 0 : 1)}L` : a >= 1000 ? `${Math.round(a / 1000)}k` : String(Math.round(a))
  return v < 0 ? `-${s}` : s
}

/** a "nice" top value for the axis so the grid lines land on round numbers */
function niceMax(max: number): number {
  if (max <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  const n = max / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

export default function Bars({ data, tone = 'rgb(var(--emerald))', negativeTone = 'rgb(var(--payable))', height = 150, onTap, testid, empty }: { data: Bar[]; tone?: string; negativeTone?: string; height?: number; onTap?: (b: Bar, i: number) => void; testid?: string; empty?: string }) {
  const { pick, ur, cls } = useLang()
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const n = data.length
  const small = ur ? cls('sm') : 'text-[11px] font-semibold'
  if (!n || data.every((d) => !d.value)) {
    return <div className={`flex h-24 items-center justify-center rounded-2xl bg-ground text-muted ${small}`} data-testid={testid}>{empty ? pick(empty) : '—'}</div>
  }
  const rawMax = Math.max(...data.map((d) => Math.abs(d.value)))
  const max = niceMax(rawMax)
  const hasNeg = data.some((d) => d.value < 0)
  // drawing area: 0..100 wide, `height` tall; the axis values sit outside the svg on the left
  const w = 100, top = 6, bottom = 4
  const plot = height - top - bottom
  const zero = hasNeg ? top + plot / 2 : top + plot
  const scale = (hasNeg ? plot / 2 : plot) / max
  const gap = n > 24 ? 0.25 : n > 12 ? 0.6 : 1.2
  const bw = Math.min((w - gap * (n + 1)) / n, 14)
  const left = (w - (bw * n + gap * (n - 1))) / 2
  const every = n > 24 ? Math.ceil(n / 6) : n > 12 ? 2 : 1
  const act = active != null ? data[active] : null
  const ticks = hasNeg ? [max, 0, -max] : [max, max / 2, 0]
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <div className={`flex h-5 items-center justify-between gap-2 text-muted ${small}`}>
        <span className="truncate">{act ? act.label : `${data[0].label}${n > 1 ? ` → ${data[n - 1].label}` : ''}`}</span>
        <span className="num shrink-0 text-ink" dir="ltr">{act ? `${act.value.toLocaleString('en-US')}${act.hint ? ` · ${act.hint}` : ''}` : ''}</span>
      </div>
      <div className="flex flex-row gap-1.5" dir="ltr" style={{ direction: 'ltr' }}>
        <div className={`relative w-8 shrink-0 text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} style={{ height }}>
          {ticks.map((t, i) => <span key={i} className="absolute right-0 -translate-y-1/2 num" style={{ top: `${((zero - t * scale) / height) * 100}%` }}>{fmtShort(t)}</span>)}
        </div>
        <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="min-w-0 flex-1" style={{ height }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setActive(null)}>
          <title id={`${id}-t`}>{data.map((d) => `${d.label}: ${d.value}`).join(', ')}</title>
          {ticks.map((t, i) => <line key={i} x1={0} x2={w} y1={zero - t * scale} y2={zero - t * scale} stroke="rgb(var(--line))" strokeWidth={t === 0 ? 0.8 : 0.4} strokeDasharray={t === 0 ? undefined : '1.5 1.5'} vectorEffect="non-scaling-stroke" />)}
          {data.map((d, i) => {
            const h = Math.abs(d.value) * scale
            const x = left + i * (bw + gap)
            const y = d.value >= 0 ? zero - h : zero
            return (
              <g key={d.key ?? i} onMouseEnter={() => setActive(i)} onClick={() => { setActive(i); onTap?.(d, i) }} style={{ cursor: onTap ? 'pointer' : 'default' }}>
                <rect x={x} y={0} width={bw} height={height} fill="transparent" />
                {active === i ? <rect x={x - gap / 2} y={top} width={bw + gap} height={plot} fill="rgb(var(--ink))" opacity={0.05} /> : null}
                <rect x={x} y={y} width={bw} height={Math.max(h, d.value ? 1 : 0)} rx={Math.min(bw / 3, 2.5)} fill={d.value < 0 ? negativeTone : tone} opacity={active == null || active === i ? 1 : 0.5} />
              </g>
            )
          })}
        </svg>
      </div>
      <div className={`ms-9 flex flex-row justify-between text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} dir="ltr" style={{ direction: 'ltr' }}>
        {data.map((d, i) => (i % every === 0 || i === n - 1 ? <span key={i} className="truncate">{d.label}</span> : null))}
      </div>
    </div>
  )
}
