/** The global period of the Shop Audit (docs/16 §2): a preset or from–to, plus an optional
 *  as-of day for balances. It lives in the URL so every audit screen, a reload and a shared link
 *  show the same period. */

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isoDay } from '@/lib/format'

export const PRESETS = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'all_time', 'custom'] as const
export type Preset = (typeof PRESETS)[number]

export interface AuditPeriod {
  preset: Preset
  from: string
  to: string
  asOf: string | null
}

const monthStart = () => isoDay(1 - new Date().getDate())

export function useAuditPeriod() {
  const [sp, setSp] = useSearchParams()
  const period = useMemo<AuditPeriod>(() => {
    const raw = sp.get('preset')
    const preset: Preset = (PRESETS as readonly string[]).includes(raw ?? '') ? (raw as Preset) : sp.get('from') || sp.get('to') ? 'custom' : 'this_month'
    return {
      preset,
      from: sp.get('from') || monthStart(),
      to: sp.get('to') || isoDay(0),
      asOf: sp.get('as_of'),
    }
  }, [sp])
  const set = useCallback(
    (next: Partial<AuditPeriod>) => {
      const p = { ...period, ...next }
      const out = new URLSearchParams(sp)
      out.set('preset', p.preset)
      if (p.preset === 'custom') {
        out.set('from', p.from)
        out.set('to', p.to)
      } else {
        out.delete('from')
        out.delete('to')
      }
      if (p.asOf) out.set('as_of', p.asOf)
      else out.delete('as_of')
      setSp(out, { replace: true })
    },
    [period, sp, setSp],
  )
  /** query string for the shop-audit APIs */
  const query = useMemo(() => {
    const q = new URLSearchParams()
    q.set('preset', period.preset)
    if (period.preset === 'custom') {
      q.set('date_from', period.from)
      q.set('date_to', period.to)
    }
    if (period.asOf) q.set('as_of', period.asOf)
    return q.toString()
  }, [period])
  return { period, set, query }
}
