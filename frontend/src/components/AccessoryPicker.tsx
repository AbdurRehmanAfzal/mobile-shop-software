/** Box, charger, cable… one row each with three plain choices (owner, 2026-10-27: "came with device"
 *  and "pending from vendor" confused shopkeepers): No · Yes, now · Yes, later (+ when).
 *  Buying: "later" = the seller still has to give it. Selling: "later" = the shop gives it later. */

import { CalendarClock, Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { isoDay } from '@/lib/format'

export const ACC_KINDS = ['box', 'charger', 'cable', 'earphones', 'airpods'] as const
export type AccKind = (typeof ACC_KINDS)[number]
export type AccState = { state: 'no' | 'now' | 'later'; date: string }
export type AccValue = Partial<Record<AccKind, AccState>>

export function AccessoryPicker({ mode, value, onChange }: { mode: 'buy' | 'sell'; value: AccValue; onChange: (v: AccValue) => void }) {
  const { pick, ur, cls } = useLang()
  const set = (k: AccKind, s: AccState) => onChange({ ...value, [k]: s })
  const opt = (on: boolean, tone: string) =>
    `tap flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-1.5 font-bold ${on ? tone : 'border-line bg-surface text-muted'} ${ur ? cls('sm') : 'text-[13px]'}`
  const choice = (k: AccKind, state: AccState['state'], text: string, icon: ReactNode, tone: string) => {
    const cur = value[k]?.state ?? 'no'
    return (
      <button type="button" aria-pressed={cur === state} aria-label={`${pick(`stock.acc.${k}`)}: ${pick(text)}`} onClick={() => set(k, { state, date: value[k]?.date ?? '' })} className={opt(cur === state, tone)}>
        {icon}
        <span>{pick(text)}</span>
      </button>
    )
  }
  return (
    <div>
      <BiLabel text={mode === 'buy' ? 'accx.titleBuy' : 'accx.titleSell'} size="md" bold />
      <BiLabel text={mode === 'buy' ? 'accx.hintBuy' : 'accx.hintSell'} size="sm" tone="text-muted" className="mb-2" />
      <div className="card flex flex-col divide-y divide-line p-0">
        {ACC_KINDS.map((k) => {
          const v = value[k]
          return (
            <div key={k} className="flex flex-col gap-2 px-3 py-3">
              <BiLabel text={`stock.acc.${k}`} size="md" bold />
              <div className="flex gap-1.5">
                {choice(k, 'no', 'accx.no', <X size={16} />, 'border-ink bg-ink text-ground')}
                {choice(k, 'now', mode === 'buy' ? 'accx.nowBuy' : 'accx.nowSell', <Check size={16} />, 'border-emerald bg-emerald-tint text-emerald-deep')}
                {choice(k, 'later', mode === 'buy' ? 'accx.laterBuy' : 'accx.laterSell', <CalendarClock size={16} />, 'border-receivable bg-receivable-tint text-receivable')}
              </div>
              {v?.state === 'later' ? (
                <label className="flex items-center gap-2">
                  <BiLabel text={mode === 'buy' ? 'accx.whenBuy' : 'accx.whenSell'} size="sm" tone="text-muted" className="shrink-0" />
                  <input type="date" min={isoDay(0)} value={v.date} onChange={(e) => set(k, { state: 'later', date: e.target.value })} className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
                </label>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
