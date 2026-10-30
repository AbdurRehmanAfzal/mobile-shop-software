/** Frame of every Shop Audit screen: title, the section chips and the global period bar.
 *  Sections are added here as they land (docs/17 phases). */

import { CalendarRange } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { PageHeader, fmtDate } from '@/components/ui'
import { isoDay } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { PRESETS, useAuditPeriod, type Preset } from './period'

export const AUDIT_SECTIONS: { to: string; key: string }[] = [
  { to: '/audit', key: 'audit.nav.overview' },
  { to: '/audit/finance', key: 'audit.nav.finance' },
  { to: '/audit/people', key: 'audit.nav.people' },
  { to: '/audit/udhaar', key: 'audit.nav.udhaar' },
]

interface ResolvedPeriod { preset: string; date_from: string; date_to: string; as_of: string; prev_from: string; prev_to: string; days: number }

export default function AuditLayout({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { pick, ur, cls } = useLang()
  const { pathname } = useLocation()
  const { period, set, query } = useAuditPeriod()
  const { data: resolved } = useGet<ResolvedPeriod>(['audit-period', query], `/api/v1/shop-audit/period?${query}`)
  const [asOfOpen, setAsOfOpen] = useState(!!period.asOf)
  const chip = (on: boolean) => `tap shrink-0 rounded-full border font-bold h-10 px-3.5 ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const date = 'h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm font-bold text-ink'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="audit.title" right={right} help={<Help term="audit" />} />
      {AUDIT_SECTIONS.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {AUDIT_SECTIONS.map((s) => (
            <Link key={s.to} to={`${s.to}?${new URLSearchParams(window.location.search).toString()}`} aria-current={pathname === s.to ? 'page' : undefined} className={chip(pathname === s.to)}>
              {pick(s.key)}
            </Link>
          ))}
        </div>
      ) : null}
      <section className="card flex flex-col gap-2" data-testid="audit-period">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((k: Preset) => (
            <button key={k} type="button" aria-pressed={period.preset === k} onClick={() => set({ preset: k })} className={chip(period.preset === k)}>
              {pick(`audit.preset.${k}`)}
            </button>
          ))}
        </div>
        {period.preset === 'custom' ? (
          <div className="flex items-center gap-2" dir="ltr">
            <input type="date" aria-label="from" value={period.from} max={period.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className={date} />
            <span className="text-muted">→</span>
            <input type="date" aria-label="to" value={period.to} min={period.from} max={isoDay(0)} onChange={(e) => e.target.value && set({ to: e.target.value })} className={date} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {resolved ? (
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} dir="ltr">
              {fmtDate(resolved.date_from)} → {fmtDate(resolved.date_to)} · {resolved.days} {pick('audit.days')}
            </span>
          ) : <span />}
          <button type="button" onClick={() => { if (asOfOpen) set({ asOf: null }); setAsOfOpen(!asOfOpen) }} className={`tap inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-bold ${asOfOpen ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>
            <CalendarRange size={14} />{pick('audit.asOf')}{resolved && period.asOf ? <span dir="ltr"> · {fmtDate(resolved.as_of)}</span> : null}
          </button>
        </div>
        {asOfOpen ? (
          <div className="flex items-center gap-2">
            <BiLabel text="audit.asOfHint" size="sm" tone="text-muted" />
            <input type="date" aria-label="as of" value={period.asOf ?? period.to} max={isoDay(0)} onChange={(e) => e.target.value && set({ asOf: e.target.value })} className={`${date} max-w-[180px]`} dir="ltr" />
          </div>
        ) : null}
      </section>
      {children}
    </div>
  )
}
