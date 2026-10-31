/** Up to three smooth lines over the same buckets (docs/17 P9-1): revenue vs profit, receivable vs
 *  payable. Soft area under the first line, dots on the hovered bucket, three grid lines with
 *  values, Latin digits, empty state, RTL-safe (time runs left → right). */

import { useId, useState } from 'react'
import { useLang } from '@/components/Bilingual'
import { fmtShort } from './Bars'

export interface Series { label: string; color: string; values: number[] }

function smooth(points: [number, number][]): string {
  if (points.length < 2) return points.map(([x, y]) => `M${x},${y}`).join(' ')
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1]
    const cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
}

export default function Lines({ labels, series, height = 150, testid, empty }: { labels: string[]; series: Series[]; height?: number; testid?: string; empty?: string }) {
  const { pick, ur, cls } = useLang()
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const small = ur ? cls('sm') : 'text-[11px] font-semibold'
  const all = series.flatMap((s) => s.values)
  if (!labels.length || !all.some((v) => v)) return <div className={`flex h-24 items-center justify-center rounded-2xl bg-ground text-muted ${small}`} data-testid={testid}>{empty ? pick(empty) : '—'}</div>
  const rawMax = Math.max(...all), rawMin = Math.min(0, ...all)
  const p10 = Math.pow(10, Math.floor(Math.log10(Math.max(rawMax, 1))))
  const max = Math.ceil(Math.max(rawMax, 1) / p10) * p10
  const min = rawMin < 0 ? -Math.ceil(-rawMin / p10) * p10 : 0
  const w = 100, top = 6, bottom = 4
  const plot = height - top - bottom
  const x = (i: number) => (labels.length === 1 ? w / 2 : 2 + (i * (w - 4)) / (labels.length - 1))
  const y = (v: number) => top + plot - ((v - min) / (max - min || 1)) * plot
  const every = labels.length > 24 ? Math.ceil(labels.length / 6) : labels.length > 12 ? 2 : 1
  const ticks = [max, (max + min) / 2, min]
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted ${small}`}>
        <span className="flex flex-wrap gap-x-3 gap-y-1">{series.map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: s.color }} />{s.label}{active != null ? <span className="num text-ink" dir="ltr"> {s.values[active].toLocaleString('en-US')}</span> : null}</span>)}</span>
        <span dir="ltr">{active != null ? labels[active] : ''}</span>
      </div>
      <div className="flex flex-row gap-1.5" dir="ltr" style={{ direction: 'ltr' }}>
        <div className={`relative w-8 shrink-0 text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} style={{ height }}>
          {ticks.map((t, i) => <span key={i} className="absolute right-0 -translate-y-1/2 num" style={{ top: `${(y(t) / height) * 100}%` }}>{fmtShort(t)}</span>)}
        </div>
        <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="min-w-0 flex-1" style={{ height }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setActive(null)}>
          <title id={`${id}-t`}>{series.map((s) => `${s.label}: ${s.values.join(', ')}`).join(' | ')}</title>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={series[0].color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={series[0].color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => <line key={i} x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={t === 0 ? 0.8 : 0.4} strokeDasharray={t === 0 ? undefined : '1.5 1.5'} vectorEffect="non-scaling-stroke" />)}
          {series[0] ? <path d={`${smooth(series[0].values.map((v, i) => [x(i), y(v)] as [number, number]))} L${x(labels.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-g)`} /> : null}
          {series.map((s) => <path key={s.label} d={smooth(s.values.map((v, i) => [x(i), y(v)] as [number, number]))} fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
          {labels.map((_l, i) => <rect key={i} x={x(i) - (w / labels.length) / 2} y={0} width={w / labels.length} height={height} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />)}
          {active != null ? (
            <g>
              <line x1={x(active)} x2={x(active)} y1={top} y2={top + plot} stroke="rgb(var(--muted))" strokeWidth={0.5} strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
              {series.map((s) => <circle key={s.label} cx={x(active)} cy={y(s.values[active])} r={1.6} fill="rgb(var(--surface))" stroke={s.color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />)}
            </g>
          ) : null}
        </svg>
      </div>
      <div className={`ms-9 flex flex-row justify-between text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} dir="ltr" style={{ direction: 'ltr' }}>
        {labels.map((l, i) => (i % every === 0 || i === labels.length - 1 ? <span key={i} className="truncate">{l}</span> : null))}
      </div>
    </div>
  )
}
