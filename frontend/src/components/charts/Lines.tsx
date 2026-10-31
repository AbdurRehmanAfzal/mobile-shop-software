/** Up to three lines over the same buckets (docs/17 P9-1): revenue vs profit, receivable vs
 *  payable. Tokens, Latin digits, hover value, empty state, RTL-safe (time runs left → right). */

import { useState } from 'react'
import { useLang } from '@/components/Bilingual'

export interface Series { label: string; color: string; values: number[] }

const fmt = (v: number) => Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))

export default function Lines({ labels, series, height = 140, testid, empty }: { labels: string[]; series: Series[]; height?: number; testid?: string; empty?: string }) {
  const { pick, ur, cls } = useLang()
  const [active, setActive] = useState<number | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const all = series.flatMap((s) => s.values)
  if (!labels.length || !all.some((v) => v)) return <div className={`flex h-24 items-center justify-center rounded-2xl bg-ground text-muted ${small}`} data-testid={testid}>{empty ? pick(empty) : '—'}</div>
  const max = Math.max(1, ...all), min = Math.min(0, ...all)
  const w = 100, h = 100, pad = 2
  const x = (i: number) => (labels.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (labels.length - 1))
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad)
  const every = labels.length > 24 ? Math.ceil(labels.length / 6) : labels.length > 12 ? 2 : 1
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <div className={`flex flex-wrap items-center justify-between gap-2 text-muted ${small}`}>
        <span className="flex flex-wrap gap-3">{series.map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full" style={{ background: s.color }} />{s.label}{active != null ? <span className="num" dir="ltr"> {s.values[active].toLocaleString('en-US')}</span> : null}</span>)}</span>
        <span dir="ltr">{active != null ? labels[active] : `max ${fmt(max)}`}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height, direction: 'ltr' }} role="img" onMouseLeave={() => setActive(null)}>
        <title>{series.map((s) => `${s.label}: ${s.values.join(', ')}`).join(' | ')}</title>
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="rgb(var(--line))" strokeWidth={0.4} />
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        ))}
        {labels.map((_l, i) => <rect key={i} x={x(i) - (w / labels.length) / 2} y={0} width={w / labels.length} height={h} fill="transparent" onMouseEnter={() => setActive(i)} />)}
        {active != null ? <line x1={x(active)} x2={x(active)} y1={0} y2={h} stroke="rgb(var(--muted))" strokeWidth={0.3} strokeDasharray="1 1" /> : null}
      </svg>
      <div className={`flex justify-between text-muted ${ur ? cls('sm') : 'text-[10px] font-semibold'}`} dir="ltr">
        {labels.map((l, i) => (i % every === 0 || i === labels.length - 1 ? <span key={i} className="truncate">{l}</span> : null))}
      </div>
    </div>
  )
}
