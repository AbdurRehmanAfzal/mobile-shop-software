/** Shop Audit → People (docs/16 §5, docs/17 P5-4): top customers and suppliers by one named
 *  metric, each row opening the person's page where the lifetime journey card lives. */

import { Crown } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Loading } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

const METRICS = ['customers_sales', 'customers_bills', 'customers_profit', 'suppliers_purchases', 'suppliers_devices', 'suppliers_profit', 'receivable', 'payable'] as const
type Metric = (typeof METRICS)[number]
interface Rankings { metric: Metric; total: string; parties: number; rows: { rank: number; party_id: string; name: string | null; phone: string | null; value: string; count: number; share: number }[] }

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const COUNT_METRICS: Metric[] = ['customers_bills', 'suppliers_devices']

export default function PartiesAuditPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const metric = (METRICS.find((m) => m === sp.get('metric')) ?? 'customers_sales') as Metric
  const setMetric = (m: Metric) => { const o = new URLSearchParams(sp); o.set('metric', m); setSp(o, { replace: true }) }
  const { data, isLoading } = useGet<Rankings>(['audit-rankings', query, metric], `/api/v1/shop-audit/rankings?${query}&metric=${metric}&limit=20`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap shrink-0 rounded-full border font-bold h-10 px-3.5 ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const isCount = COUNT_METRICS.includes(metric)
  const shown = METRICS.filter((m) => canCost || !m.endsWith('_profit'))
  return (
    <AuditLayout>
      <BiLabel text="audit.rank.hint" size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5" data-testid="metric-chips">
        {shown.map((m) => <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} className={chip(metric === m)}>{pick(`audit.metric.${m}`)}</button>)}
      </div>
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="flex items-center justify-between rounded-3xl bg-ink px-5 py-4 text-ground" data-testid="rank-total">
            <span className="flex flex-col"><BiLabel text={`audit.metric.${metric}`} size="md" bold tone="text-current" /><span className={`opacity-80 ${small}`}><span className="num">{data.parties}</span> {pick('audit.people')} · {pick('audit.rank.metricNote')}</span></span>
            <span className="num text-2xl font-bold" dir="ltr">{isCount ? n(data.total) : `Rs. ${n(data.total)}`}</span>
          </section>
          {!data.rows.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="rank-rows">
              {data.rows.map((r) => (
                <Link key={r.party_id} to={`/parties/${r.party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold ${r.rank === 1 ? 'bg-ink text-ground' : 'bg-ground text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{r.rank === 1 ? <Crown size={14} /> : r.rank}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{r.name ?? '—'}</span>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-ground"><span className="block h-full rounded-full bg-emerald" style={{ width: `${Math.max(2, r.share)}%` }} /></span>
                    <span className={`text-muted ${small}`}>{r.phone ? <span dir="ltr">{r.phone} · </span> : null}{isCount ? null : <><span className="num">{r.share}%</span>{r.count ? <> · <span className="num">{r.count}</span> {pick(metric.startsWith('suppliers') && metric !== 'suppliers_purchases' ? 'audit.phones' : 'audit.bills')}</> : null}</>}</span>
                  </span>
                  <span className="num font-bold" dir="ltr">{isCount ? n(r.value) : `Rs. ${n(r.value)}`}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AuditLayout>
  )
}
