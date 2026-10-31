/** Shop Audit → Products (docs/16 §8, docs/17 P7-3): what sold, per model / brand / type, with
 *  the performance class and the thresholds behind it; sales vs purchases over the period. */

import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import { Empty, Loading } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
type Group = 'model' | 'brand' | 'category'
interface Row { key: string; kind: 'device' | 'misc'; label: string; brand: string | null; model: string | null; category: string; model_id: string | null; brand_id: string | null; units: number; share: number; revenue: M; cost: M | null; profit: M | null; margin_pct: number | null; avg_price: M | null; avg_holding_days: number | null; returns: number; returns_amount: M; in_stock: number; performance: 'top' | 'average' | 'low' }
interface Products { group: Group; granularity: 'day' | 'week' | 'month'; total_units: number; total_revenue: M; total_profit: M | null; rows: Row[]; classes: { top: number; average: number; low: number }; thresholds: { top_share: number; low_units: number }; series: { bucket: string; units: number; revenue: M; profit: M | null; bought_units: number; bought_cost: M | null }[] }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const label = (bucket: string, g: string) => (g === 'month' ? bucket.slice(0, 7) : bucket.slice(5))

export default function ProductsPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const group = ((['model', 'brand', 'category'] as const).find((g) => g === sp.get('group')) ?? 'model') as Group
  const cls_ = ((['all', 'top', 'average', 'low'] as const).find((c) => c === sp.get('class')) ?? 'all')
  const setParam = (k: string, v: string) => { const o = new URLSearchParams(sp); o.set(k, v); setSp(o, { replace: true }) }
  const { data, isLoading } = useGet<Products>(['audit-products', query, group], `/api/v1/shop-audit/products?${query}&group=${group}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const tone = (p: Row['performance']) => (p === 'top' ? 'bg-emerald-tint text-emerald-deep' : p === 'low' ? 'bg-payable-tint text-payable' : 'bg-ground text-muted')
  const rows = data ? data.rows.filter((r) => cls_ === 'all' || r.performance === cls_) : []
  return (
    <AuditLayout>
      <BiSegmented<Group> value={group} onChange={(g) => setParam('group', g)} options={[{ value: 'model', text: 'audit.prod.byModel' }, { value: 'brand', text: 'audit.prod.byBrand' }, { value: 'category', text: 'audit.prod.byType' }]} />
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="prod-kpis">
            <Kpi k="audit.prod.unitsSold" v={`${data.total_units}`} />
            <Kpi k="audit.netSales" v={`Rs. ${n(data.total_revenue)}`} />
            {canCost ? <Kpi k="counter.grossProfit" v={`Rs. ${n(data.total_profit)}`} /> : null}
            <Kpi k="audit.prod.classes" v={`${data.classes.top} · ${data.classes.average} · ${data.classes.low}`} sub={`${pick('audit.prod.top')} · ${pick('audit.prod.average')} · ${pick('audit.prod.low')}`} />
          </section>
          <section className="card" data-testid="prod-series">
            <BiLabel text="audit.prod.soldVsBought" size="sm" tone="text-muted" bold />
            <Bars data={data.series.map((s) => ({ label: label(s.bucket, data.granularity), value: s.units, hint: `${pick('audit.prod.bought')} ${s.bought_units} · Rs. ${n(s.revenue)}`, key: s.bucket }))} tone="rgb(var(--emerald))" height={110} empty="audit.noData" />
            <Bars data={data.series.map((s) => ({ label: label(s.bucket, data.granularity), value: s.bought_units, key: `b${s.bucket}` }))} tone="rgb(var(--receivable))" height={60} empty="audit.noData" />
          </section>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'top', 'average', 'low'] as const).map((c) => <button key={c} type="button" aria-pressed={cls_ === c} onClick={() => setParam('class', c)} className={`tap min-h-9 whitespace-nowrap rounded-full border px-3 py-1.5 font-bold leading-tight ${cls_ === c ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{pick(c === 'all' ? 'common.all' : `audit.prod.${c}`)}</button>)}
            <span className={`text-muted ${small}`}>{pick('audit.prod.thresholds').replace('{{top}}', String(data.thresholds.top_share)).replace('{{low}}', String(data.thresholds.low_units))} · <Link to="/more/settings" className="underline">{pick('audit.inv.thresholds')}</Link></span>
          </div>
          {!rows.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="prod-rows">
              {rows.map((r) => (
                <Link key={r.key} to={r.model_id ? `/stock?q=${encodeURIComponent(r.label)}` : '/accessories'} className="tap flex flex-col gap-1 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><span className="truncate font-bold">{r.label}</span><span className={`shrink-0 rounded-full px-2 py-0.5 ${tone(r.performance)} ${ur ? cls('sm') : 'text-[11px] font-bold'}`}>{pick(`audit.prod.${r.performance}`)}</span></span>
                    <span className="num font-bold" dir="ltr">{r.units} <span className="text-muted">·</span> Rs. {n(r.revenue)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground"><div className="h-full rounded-full bg-emerald" style={{ width: `${Math.max(2, r.share)}%` }} /></div>
                  <div className={`flex flex-wrap gap-x-3 text-muted ${small}`} dir="auto">
                    <span><span className="num">{r.share}%</span> {pick('audit.prod.ofUnits')}</span>
                    {canCost && r.profit != null ? <span>{pick('confirm.profit')} <span className="num" dir="ltr">{n(r.profit)}</span>{r.margin_pct != null ? <> (<span className="num">{r.margin_pct}%</span>)</> : null}</span> : null}
                    {r.avg_price ? <span>{pick('audit.prod.avgPrice')} <span className="num" dir="ltr">{n(r.avg_price)}</span></span> : null}
                    {r.avg_holding_days != null ? <span>{pick('audit.prod.avgDays')} <span className="num">{r.avg_holding_days}</span></span> : null}
                    {r.returns ? <span className="text-payable">{pick('audit.prod.returns')} <span className="num">{r.returns}</span></span> : null}
                    {r.kind === 'device' && group === 'model' ? <span>{pick('audit.prod.inStock')} <span className="num">{r.in_stock}</span></span> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AuditLayout>
  )
}

function Kpi({ k, v, sub }: { k: string; v: string; sub?: string }) {
  const { ur, cls } = useLang()
  return (
    <div className="card flex min-w-0 flex-col gap-1">
      <BiLabel text={k} size="sm" tone="text-muted" bold />
      <span className="num text-xl font-bold" dir="ltr">{v}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span> : null}
    </div>
  )
}
