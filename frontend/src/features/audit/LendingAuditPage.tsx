/** Shop Audit → Len-den (docs/32): money lent to / borrowed from people with no bill — what is
 *  still open (they owe us / we owe them), what moved in the period against the period before,
 *  what was later adjusted against bills, a series, per person and the entries. */

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import Help from '@/components/Help'
import { Empty, fmtDate, Pending } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import SectionDownload from './SectionDownload'
import { useAuditPeriod } from './period'

type M = string
interface Open { amount: M; people: number }
interface Person { party_id: string; name: string | null; phone: string | null; lent: M; borrowed: M; entries: number; open: M; khata: M; last_date: string | null }
interface Entry { id: string; no: string; party_id: string; party_name: string | null; direction: 'in' | 'out'; amount: M; method: string; date: string; notes: string | null; by: string | null }
interface DueRow { party_id: string; name: string | null; phone: string | null; side: 'owes_us' | 'we_owe'; amount: M; due_date: string; days_late: number; status: 'late' | 'today' | 'soon' | 'later'; reminded_at: string | null }
interface Lending {
  due: DueRow[]
  granularity: string
  totals: { lent: M; borrowed: M; net: M; lent_count: number; borrowed_count: number; previous_lent: M; previous_borrowed: M; voided: number; adjusted_on_bills: M }
  owed_to_shop: Open
  shop_owes: Open
  as_of: { owed_to_shop: Open; shop_owes: Open }
  by_method: { method: string; lent: M; borrowed: M }[]
  series: { bucket: string; lent: M; borrowed: M }[]
  people: Person[]
  people_total: number
  entries: Entry[]
}

/** help per totals figure (docs/33) */
const TOTAL_HELP: { key: string; helpKey: string }[] = [
  { key: 'audit.lend.lent', helpKey: 'audit.lending.lent' },
  { key: 'audit.lend.borrowed', helpKey: 'audit.lending.borrowed' },
  { key: 'audit.lend.adjusted', helpKey: 'audit.lending.adjusted' },
  { key: 'audit.lend.voided', helpKey: 'audit.lending.voided' },
]
const totalHelp = (k: string) => TOTAL_HELP.find((x) => x.key === k)?.helpKey

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const label = (bucket: string, g: string) => (g === 'month' ? bucket.slice(0, 7) : bucket.slice(5))

export default function LendingAuditPage() {
  const { pick, ur, cls } = useLang()
  const { period, query } = useAuditPeriod()
  const { data: d, error, refetch } = useGet<Lending>(['audit-lending', query], `/api/v1/shop-audit/lending?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const asOf = !!period.asOf
  return (
    <AuditLayout right={<SectionDownload sections={['lending']} name="len-den" />}>
      {!d ? <Pending error={error} retry={refetch} /> : (
        <>
          <span className="flex items-center gap-1"><BiLabel text="audit.lend.hint" size="sm" tone="text-muted" /><Help term="audit.lending.what" size="sm" /></span>
          <section className="grid gap-2 sm:grid-cols-2">
            {([['owed_to_shop', 'audit.lend.owedToShop', 'bg-receivable-tint text-receivable', ArrowDownLeft], ['shop_owes', 'audit.lend.shopOwes', 'bg-payable-tint text-payable', ArrowUpRight]] as const).map(([k, t, tone, Icon]) => {
              const v = asOf ? d.as_of[k] : d[k]
              return (
                <div key={k} className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${tone}`} data-testid={`lend-${k}`}>
                  <div className="flex items-center gap-2"><Icon size={18} /><BiLabel text={t} size="md" bold tone="text-current" />{k === 'owed_to_shop' ? <Help term="audit.lending.owedToShop" size="sm" /> : <Help term="audit.lending.shopOwes" size="sm" />}</div>
                  <span className="num text-[30px] leading-tight" dir="ltr">{withCur(n(v.amount))}</span>
                  <span className={`opacity-80 ${small}`}><span className="num">{v.people}</span> {pick('audit.people')}</span>
                </div>
              )
            })}
          </section>

          <div className="card grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" data-testid="lend-totals">
            {([['audit.lend.lent', d.totals.lent, `${d.totals.lent_count} · ${pick('audit.lend.prev')} ${n(d.totals.previous_lent)}`], ['audit.lend.borrowed', d.totals.borrowed, `${d.totals.borrowed_count} · ${pick('audit.lend.prev')} ${n(d.totals.previous_borrowed)}`], ['audit.lend.adjusted', d.totals.adjusted_on_bills, null], ['audit.lend.voided', d.totals.voided, null]] as const).map(([k, v, hint]) => (
              <span key={k} className="flex flex-col">
                <span className={`flex items-center gap-1 text-muted ${small}`}>{pick(k)}{totalHelp(k) ? <Help term={totalHelp(k) as string} size="sm" /> : null}</span>
                <span className="num text-lg font-bold" dir="ltr">{typeof v === 'number' ? v : n(v)}</span>
                {hint ? <span className={`text-muted ${small}`} dir="ltr">{hint}</span> : null}
              </span>
            ))}
          </div>

          <span className="flex items-center gap-1"><BiLabel text="audit.lend.series" size="md" bold /><Help term="audit.lending.series" size="sm" /></span>
          <section className="card"><Bars data={d.series.map((x) => ({ label: label(x.bucket, d.granularity), value: Number(x.lent) + Number(x.borrowed), hint: `${pick('lending.lent')} ${n(x.lent)} · ${pick('lending.borrowed')} ${n(x.borrowed)}`, key: x.bucket }))} testid="lend-series" empty="audit.noData" /></section>

          {d.by_method.length ? (
            <>
              <span className="flex items-center gap-1"><BiLabel text="audit.lend.byMethod" size="md" bold /><Help term="audit.lending.byMethod" size="sm" /></span>
              <div className="card flex flex-col gap-1">
                {d.by_method.map((m) => (
                  <div key={m.method} className={`flex items-center justify-between gap-2 ${small}`}>
                    <span>{pick(`pay.${m.method}`)}</span>
                    <span className="num" dir="ltr">{pick('lending.lent')} {n(m.lent)} · {pick('lending.borrowed')} {n(m.borrowed)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {d.due.length ? (
            <>
              <span className="flex items-center gap-1"><BiLabel text="audit.lend.due" size="md" bold /><Help term="audit.lending.due" size="sm" /></span>
              <BiLabel text="audit.lend.dueHint" size="sm" tone="text-muted" />
              <div className="card divide-y divide-line p-0" data-testid="lend-due">
                {d.due.map((r) => (
                  <Link key={r.party_id} to={`/parties/${r.party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                    <span className={`shrink-0 rounded-full px-2.5 py-1 ${small} ${r.status === 'late' ? 'bg-payable-tint text-payable' : r.status === 'later' ? 'bg-ground text-muted' : 'bg-receivable-tint text-receivable'}`}>{pick(`audit.lend.st.${r.status}`)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{r.name ?? '—'}</span>
                      <span className={`text-muted ${small}`}>{pick(r.side === 'we_owe' ? 'lending.weOwe' : 'lending.theyOwe')} · <span dir="ltr">{fmtDate(r.due_date)}</span>{r.days_late ? <> · {pick('lending.lateBy').replace('{{n}}', String(r.days_late))}</> : null}</span>
                    </span>
                    <span className={`num font-bold ${r.side === 'we_owe' ? 'text-payable' : 'text-receivable'}`} dir="ltr">{n(r.amount)}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <span className="flex items-center gap-1"><BiLabel text="audit.lend.people" size="md" bold /><Help term="audit.lending.people" size="sm" /></span>
          {!d.people.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="lend-people">
              {d.people.map((r) => {
                const o = Number(r.open)
                return (
                  <Link key={r.party_id} to={`/parties/${r.party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold">{r.name ?? '—'}</span>
                      <span className={`text-muted ${small}`}>{pick('lending.lent')} <span className="num" dir="ltr">{n(r.lent)}</span> · {pick('lending.borrowed')} <span className="num" dir="ltr">{n(r.borrowed)}</span> · {pick('audit.lend.khata')} <span className="num" dir="ltr">{n(r.khata)}</span>{r.last_date ? <> · <span dir="ltr">{fmtDate(r.last_date)}</span></> : null}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className={`num font-bold ${o > 0 ? 'text-receivable' : o < 0 ? 'text-payable' : 'text-muted'}`} dir="ltr">{n(Math.abs(o))}</span>
                      <span className={`text-muted ${small}`}>{pick(o > 0 ? 'lending.theyOwe' : o < 0 ? 'lending.weOwe' : 'lending.clear')}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          <span className="flex items-center gap-1"><BiLabel text="audit.lend.entries" size="md" bold /><Help term="audit.lending.entries" size="sm" /></span>
          {!d.entries.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="lend-entries">
              {d.entries.map((e) => (
                <Link key={e.id} to={`/parties/${e.party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{e.party_name ?? '—'} · {pick(e.direction === 'out' ? 'lending.lent' : 'lending.borrowed')}</span>
                    <span className={`text-muted ${small}`}><span dir="ltr">{e.no} · {fmtDate(e.date)}</span>{e.by ? ` · ${e.by}` : ''}{e.notes ? ` · ${e.notes}` : ''}</span>
                  </span>
                  <span className={`num font-bold ${e.direction === 'out' ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{e.direction === 'out' ? '-' : '+'}{n(e.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AuditLayout>
  )
}
