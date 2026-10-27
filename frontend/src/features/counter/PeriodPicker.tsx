/** Today / Yesterday / Week / This month / From–to. Dates are local YYYY-MM-DD; one day has from = to. */

import { useState } from 'react'
import { useLang } from '@/components/Bilingual'
import { clampRange, isoDay } from '@/lib/format'

export interface Period { from: string; to: string }
type Kind = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const monthStart = () => isoDay(1 - new Date().getDate())

export function periodOf(kind: Exclude<Kind, 'custom'>): Period {
  if (kind === 'today') return { from: isoDay(0), to: isoDay(0) }
  if (kind === 'yesterday') return { from: isoDay(-1), to: isoDay(-1) }
  if (kind === 'week') return { from: isoDay(-6), to: isoDay(0) }
  return { from: monthStart(), to: isoDay(0) }
}

function kindOf(p: Period): Kind {
  for (const k of ['today', 'yesterday', 'week', 'month'] as const) {
    const q = periodOf(k)
    if (q.from === p.from && q.to === p.to) return k
  }
  return 'custom'
}

/** query string for the report APIs */
export const periodQuery = (p: Period) => `date_from=${p.from}&date_to=${p.to}`

export default function PeriodPicker({ value, onChange, size = 'md' }: { value: Period; onChange: (p: Period) => void; size?: 'sm' | 'md' }) {
  const { pick, ur, cls } = useLang()
  const [custom, setCustom] = useState(kindOf(value) === 'custom')
  const current: Kind = custom ? 'custom' : kindOf(value)
  const chip = (on: boolean) =>
    `tap shrink-0 rounded-full border font-bold ${size === 'sm' ? 'h-9 px-3' : 'h-11 px-4'} ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const labels: Record<Kind, string> = { today: 'counter.today', yesterday: 'counter.yesterday', week: 'counter.week', month: 'counter.thisMonth', custom: 'counter.fromTo' }
  const date = 'h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm font-bold text-ink'
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(['today', 'yesterday', 'week', 'month', 'custom'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={current === k}
            onClick={() => {
              if (k === 'custom') setCustom(true)
              else {
                setCustom(false)
                onChange(periodOf(k))
              }
            }}
            className={chip(current === k)}
          >
            {pick(labels[k])}
          </button>
        ))}
      </div>
      {custom ? (
        <div className="flex items-center gap-2" dir="ltr">
          <input type="date" aria-label="from" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange(clampRange(e.target.value, value.to))} className={date} />
          <span className="text-muted">→</span>
          <input type="date" aria-label="to" value={value.to} min={value.from} max={isoDay(0)} onChange={(e) => e.target.value && onChange(clampRange(value.from, e.target.value, 'to'))} className={date} />
        </div>
      ) : null}
    </div>
  )
}
