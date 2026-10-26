/** Today / Yesterday / pick a date. Value is a local YYYY-MM-DD. */

import { useState } from 'react'
import { useLang } from '@/components/Bilingual'
import { isoDay } from '@/lib/format'

export default function DayPicker({ value, onChange, size = 'md' }: { value: string; onChange: (day: string) => void; size?: 'sm' | 'md' }) {
  const { pick, ur, cls } = useLang()
  const today = isoDay(0)
  const yesterday = isoDay(-1)
  const [picking, setPicking] = useState(value !== today && value !== yesterday)
  const chip = (on: boolean) =>
    `tap rounded-full border font-bold ${size === 'sm' ? 'h-9 px-3' : 'h-12 px-4'} ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-pressed={!picking && value === today} onClick={() => { setPicking(false); onChange(today) }} className={chip(!picking && value === today)}>
        {pick('counter.today')}
      </button>
      <button type="button" aria-pressed={!picking && value === yesterday} onClick={() => { setPicking(false); onChange(yesterday) }} className={chip(!picking && value === yesterday)}>
        {pick('counter.yesterday')}
      </button>
      {picking ? (
        <input
          type="date"
          aria-label={pick('counter.pickDate')}
          value={value}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={`rounded-full border border-ink bg-surface px-3 font-bold text-ink ${size === 'sm' ? 'h-9 text-sm' : 'h-12'}`}
          dir="ltr"
        />
      ) : (
        <button type="button" onClick={() => setPicking(true)} className={chip(false)}>
          {pick('counter.pickDate')}
        </button>
      )}
    </div>
  )
}
