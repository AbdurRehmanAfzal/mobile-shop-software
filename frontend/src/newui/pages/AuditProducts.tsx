/** Shop audit → Products & velocity in the new product (ADR-134), drawn from mock-up 22's seventh tab
 *  ("Product velocity & stock-out alerts"): a row per model / brand / type with units sold, profit,
 *  the server's margin, days to sell, returns and what is left in stock — "out of stock" when none is
 *  left — the performance class with its thresholds, sold vs bought by bucket; and the people
 *  (`?tab=people`): top customers and suppliers by the metric picked, with the counts of people.
 *
 *  Every figure is the live audit's: `/shop-audit/products` and `/shop-audit/rankings` (reports:
 *  `products`, `customers`, `suppliers`). Differences: the drawing's "Reorder" sends nothing — a model
 *  with none left opens "add stock"; a share is the server's. */

import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Package, Users } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame, periodSearch } from './Audit'
import { Pill, Secret, SectionReport, Segs, Tile, Wait, card, n, useTab, type M } from '../auditKit'

type Group = 'model' | 'brand' | 'category'
interface Row { key: string; kind: 'device' | 'misc'; label: string; units: number; share: number; revenue: M; cost: M | null; profit: M | null; margin_pct: number | null; avg_price: M | null; avg_holding_days: number | null; returns: number; returns_amount: M; in_stock: number; performance: 'top' | 'average' | 'low' }
interface Products { group: Group; granularity: string; total_units: number; total_revenue: M; total_profit: M | null; rows: Row[]; classes: { top: number; average: number; low: number }; thresholds: { top_share: number; low_units: number }; series: { bucket: string; units: number; bought_units: number }[] }
const METRICS = ['customers_sales', 'customers_bills', 'customers_profit', 'suppliers_purchases', 'suppliers_devices', 'suppliers_profit', 'receivable', 'payable'] as const
type Metric = (typeof METRICS)[number]
interface Rankings { counts?: Record<'customer' | 'supplier' | 'shop', { total: number; new: number; active: number }>; rows: { rank: number; party_id: string; name: string | null; phone: string | null; value: string; count: number; share: number }[] }
const TABS = ['products', 'people'] as const
const label = (b: string, g: string) => (g === 'month' ? b.slice(0, 7) : g === 'day' ? b.slice(8, 10) : b.slice(5))

export default function NewAuditProducts() {
  const { pick } = useLang()
  const [tab, setTab] = useTab(TABS)
  return (
    <AuditFrame section="products" testid="npro">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segs tabs={TABS} value={tab} onChange={setTab} label={(t) => <span className="flex items-center gap-1.5">{t === 'products' ? <Package className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}{pick(`audit.nav.${t}`)}</span>} testid="npro-tab" />
        <SectionReport sections={tab === 'products' ? ['products'] : ['customers', 'suppliers']} name={tab === 'products' ? 'products' : 'people'} testid="npro-report" />
      </div>
      {tab === 'products' ? <ProductsTab /> : <PeopleTab />}
    </AuditFrame>
  )
}

function ProductsTab() {
  const { pick } = useLang()
  const { t } = useTranslation()
  const { query } = useAuditPeriod()
  const search = periodSearch(useLocation().search)
  const [group, setGroup] = useState<Group>('model')
  const [cls, setCls] = useState<'all' | 'top' | 'average' | 'low'>('all')
  const { data } = useGet<Products>(['audit-products', query, group], `/api/v1/shop-audit/products?${query}&group=${group}`)
  if (!data) return <Wait />
  const top = Math.max(1, ...data.series.flatMap((x) => [x.units, x.bought_units]))
  const rows = data.rows.filter((r) => cls === 'all' || r.performance === cls)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile tone="lime" label={pick('audit.prod.unitsSold')} value={data.total_units} testid="npro-units" sub={<>{pick('nau.sa.totalSales')} <span dir="ltr">{withCur(n(data.total_revenue))}</span></>} />
        {data.total_profit != null ? <Tile tone="dark" label={pick('counter.grossProfit')} value={<Secret>{withCur(n(data.total_profit))}</Secret>} testid="npro-profit" /> : null}
        <Tile label={pick('audit.prod.classes')} value={<span dir="ltr">{data.classes.top} · {data.classes.average} · {data.classes.low}</span>} sub={t('audit.prod.thresholds', { top: data.thresholds.top_share, low: data.thresholds.low_units })} testid="npro-classes" />
      </div>
      {data.series.some((x) => x.units || x.bought_units) ? (
        <section className={`p-4 ${card}`} data-testid="npro-series">
          <div className="text-xs font-bold text-slate-500 mb-2">{pick('audit.prod.soldVsBought')}</div>
          <div className="flex items-end gap-1 h-24" dir="ltr">{data.series.map((x) => <div key={x.bucket} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${x.bucket} · ${x.units} / ${x.bought_units}`}><div className="w-full flex items-end gap-0.5 h-full"><span className="flex-1 rounded-t bg-emerald-500" style={{ height: `${x.units ? Math.max(4, Math.round((x.units / top) * 100)) : 0}%` }} /><span className="flex-1 rounded-t bg-amber-400" style={{ height: `${x.bought_units ? Math.max(4, Math.round((x.bought_units / top) * 100)) : 0}%` }} /></div><span className="text-[9px] text-slate-400">{label(x.bucket, data.granularity)}</span></div>)}</div>
        </section>
      ) : null}
      <section className={`p-5 space-y-4 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-extrabold text-base">{pick('nau.pro.title')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Segs<Group> tabs={['model', 'brand', 'category']} value={group} onChange={setGroup} label={(g) => pick(g === 'model' ? 'audit.prod.byModel' : g === 'brand' ? 'audit.prod.byBrand' : 'audit.prod.byType')} testid="npro-group" />
            <Link to={`/new/audit/sales${search}`} className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#A3E635] text-obsidian-950">{pick('nau.pro.toSales')}</Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">{(['all', 'top', 'average', 'low'] as const).map((c) => <button key={c} type="button" onClick={() => setCls(c)} aria-pressed={cls === c} className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${cls === c ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-800'}`}>{pick(c === 'all' ? 'common.all' : `audit.prod.${c}`)}{c !== 'all' ? <span dir="ltr"> · {data.classes[c]}</span> : null}</button>)}</div>
        {!rows.length ? <p className="py-8 text-center text-sm text-slate-400">{pick('audit.noData')}</p> : (
          <div className="space-y-2.5" data-testid="npro-rows">{rows.map((p) => {
            const out = group === 'model' && p.kind === 'device' && p.in_stock === 0
            return (
              <div key={p.key} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs" data-testid="npro-row">
                <div className="min-w-0">
                  <div className="font-bold text-sm flex flex-wrap items-center gap-1.5"><span dir="auto">{group === 'category' ? pick(`devcat.${p.label}`) : p.label}</span><Pill tone={p.performance === 'top' ? 'emerald' : p.performance === 'low' ? 'rose' : 'sky'}>{pick(`audit.prod.${p.performance}`)}</Pill>{group === 'model' && p.kind === 'device' ? <Pill tone={out ? 'rose' : 'emerald'}>{out ? pick('nau.pro.outOfStock') : <><span dir="ltr">{p.in_stock}</span> {pick('audit.prod.inStock')}</>}</Pill> : null}</div>
                  <div className="text-slate-500 mt-0.5">{pick('nau.pro.sold')}: <b dir="ltr">{p.units}</b> <span dir="ltr">({p.share}% {pick('audit.prod.ofUnits')})</span>{p.profit != null ? <> · {pick('counter.grossProfit')}: <b dir="ltr"><Secret>{n(p.profit)}{p.margin_pct != null ? ` (${p.margin_pct}%)` : ''}</Secret></b></> : null}{p.avg_holding_days != null ? <> · {pick('audit.prod.avgDays')}: <b dir="ltr">{p.avg_holding_days}</b></> : null}{p.avg_price != null ? <> · {pick('audit.prod.avgPrice')} <b dir="ltr">{n(p.avg_price)}</b></> : null}{p.returns ? <span className="text-rose-600"> · <span dir="ltr">{p.returns}</span> {pick('audit.prod.returns')} (<span dir="ltr">{n(p.returns_amount)}</span>)</span> : null}</div>
                </div>
                <div className="flex items-center gap-2"><span className="font-mono font-extrabold text-sm" dir="ltr">{withCur(n(p.revenue))}</span>{out ? <Link to="/new/purchase/new" className="px-2.5 py-1 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-bold text-[10px]">{pick('nau.pro.reorder')}</Link> : null}</div>
              </div>
            )
          })}</div>
        )}
      </section>
    </div>
  )
}

function PeopleTab() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const canCost = ['owner', 'manager'].includes(useAuth((s) => s.me?.user.role) ?? '')
  const [sp, setSp] = useSearchParams()
  const metric = (METRICS.find((m) => m === sp.get('metric')) ?? 'customers_sales') as Metric
  const setMetric = (m: Metric) => { const o = new URLSearchParams(sp); o.set('metric', m); setSp(o, { replace: true }) }
  const { data } = useGet<Rankings>(['audit-rankings', query, metric], `/api/v1/shop-audit/rankings?${query}&metric=${metric}&limit=20`)
  const allowed = METRICS.filter((m) => canCost || !m.endsWith('_profit'))
  const isCount = metric === 'customers_bills' || metric === 'suppliers_devices'
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">{pick('audit.rank.hint')}</p>
      <div className="flex flex-wrap gap-1.5 text-xs" data-testid="npro-metrics">{allowed.map((m) => <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${metric === m ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`}>{pick(`audit.metric.${m}`)}</button>)}</div>
      {!data ? <Wait /> : (
        <>
          {data.counts ? <div className="grid grid-cols-3 gap-4" data-testid="npro-counts">{(['customer', 'supplier', 'shop'] as const).map((k) => <Tile key={k} label={pick(`audit.cnt.${k}`)} value={data.counts![k].total} sub={<>{pick('audit.cnt.new')} <span dir="ltr">{data.counts![k].new}</span>{k !== 'shop' ? <> · {pick('audit.cnt.active')} <span dir="ltr">{data.counts![k].active}</span></> : null}</>} />)}</div> : null}
          <section className={`p-4 sm:p-5 ${card}`} data-testid="npro-ranks">
            {!data.rows.length ? <p className="py-6 text-center text-sm text-slate-400">{pick('audit.noData')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.rows.map((r) => (
              <Link key={r.party_id} to={`/new/parties/${r.party_id}`} className="py-2.5 flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-obsidian-800 flex items-center justify-center font-mono font-bold shrink-0" dir="ltr">{r.rank}</span>
                <div className="min-w-0 flex-1"><div className="font-bold truncate" dir="auto">{r.name ?? '—'}</div><div className="h-1.5 mt-1 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className="h-full rounded-full bg-[#65A30D] dark:bg-[#A3E635]" style={{ width: `${Math.max(2, r.share)}%` }} /></div><div className="text-[11px] text-slate-500 mt-0.5">{r.phone ? <span dir="ltr">{r.phone} · </span> : null}{isCount ? null : <><span dir="ltr">{r.share}%</span>{r.count ? <> · <span dir="ltr">{r.count}</span> {pick(metric.startsWith('suppliers') && metric !== 'suppliers_purchases' ? 'audit.phones' : 'audit.bills')}</> : null}</>}</div></div>
                <span className="font-mono font-extrabold shrink-0" dir="ltr">{isCount ? n(r.value) : metric.endsWith('profit') ? <Secret>{withCur(n(r.value))}</Secret> : withCur(n(r.value))}</span>
              </Link>
            ))}</div>}
          </section>
        </>
      )}
    </div>
  )
}
