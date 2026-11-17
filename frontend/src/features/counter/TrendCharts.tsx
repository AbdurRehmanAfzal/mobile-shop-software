/** Graphs for the home screen and the business overview (owner 2026-11-18, ADR-096): sales and
 *  purchases, profit / loss by day, and to get / to give — for the last 7 or 30 days. One read of
 *  `/reports/trends`; in-house SVG (`Lines`, `Bars`). The second line of a pair is dashed, so the
 *  two are told apart by more than colour. Purchases and profit only for those who may see cost. */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import Lines from '@/components/charts/Lines'
import Help from '@/components/Help'
import { MoneyText } from '@/components/ui'
import { useGet } from '@/lib/queries'

interface Row { date: string; sales: string; purchases?: string; profit?: string; to_get: string; to_give: string }
interface Trends { days: number; show_cost: boolean; rows: Row[]; totals: { sales: string; purchases?: string; profit?: string; to_get: string; to_give: string } }

export default function TrendCharts() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [days, setDays] = useState<7 | 30>(7)
  const { data } = useGet<Trends>(['trends', days], `/api/v1/reports/trends?days=${days}`)
  const small = ur ? cls('sm') : 'text-xs font-bold'
  if (!data) return null
  const at = (d: string) => new Date(`${d}T12:00:00`)
  const labels = data.rows.map((r) => (days === 7 ? at(r.date).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' }) : at(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })))
  const num = (k: keyof Row) => data.rows.map((r) => Number(r[k] ?? 0))
  const fig = (k: string, v: string | undefined, signed = false) => (
    <span className="flex min-w-0 flex-col">
      <span className={`truncate text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
      <MoneyText value={v} tone={signed && Number(v) < 0 ? 'auto' : 'ink'} size="md" signed={signed} />
    </span>
  )
  const head = (title: string, help: string) => <span className="flex items-center gap-1"><BiLabel text={title} size="sm" tone="text-muted" bold /><Help term={help} size="sm" /></span>

  return (
    <div className="flex flex-col gap-2.5" data-testid="trend-charts">
      <div className="flex items-center justify-between gap-2">
        <BiLabel text="trend.title" size="md" bold />
        <div className="flex gap-1.5" role="group">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} data-testid={`trend-${d}`} className={`tap h-9 rounded-full border-2 px-3 ${small} ${days === d ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{pick(`trend.d${d}`)}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="card flex min-w-0 flex-col gap-2" data-testid="trend-trade">
          {head(data.show_cost ? 'trend.salesPurchases' : 'ov.sales', 'trend.salesPurchases')}
          <div className="grid grid-cols-2 gap-3">
            {fig('ov.sales', data.totals.sales)}
            {data.show_cost ? fig('ov.purchases', data.totals.purchases) : null}
          </div>
          <Lines labels={labels} height={130} empty="audit.noData" series={[
            { label: pick('ov.sales'), color: 'rgb(var(--emerald))', values: num('sales') },
            ...(data.show_cost ? [{ label: pick('ov.purchases'), color: 'rgb(var(--ink))', values: num('purchases'), dash: true }] : []),
          ]} />
        </div>
        {data.show_cost ? (
          <div className="card flex min-w-0 flex-col gap-2" data-testid="trend-profit">
            {head('trend.profit', 'trend.profit')}
            {fig('trend.profitSum', data.totals.profit, true)}
            <Bars height={130} empty="audit.noData" data={data.rows.map((r, i) => ({ label: labels[i], value: Number(r.profit ?? 0), key: r.date }))} onTap={(b) => nav(`/hisaab?from=${String(b.key)}&to=${String(b.key)}`)} />
          </div>
        ) : null}
        <div className={`card flex min-w-0 flex-col gap-2 ${data.show_cost ? 'lg:col-span-2' : ''}`} data-testid="trend-debt">
          {head('trend.debt', 'trend.debt')}
          <div className="grid grid-cols-2 gap-3">
            {fig('counter.toGet', data.totals.to_get)}
            {fig('counter.toGive', data.totals.to_give)}
          </div>
          <Lines labels={labels} height={130} empty="audit.noData" series={[
            { label: pick('counter.toGet'), color: 'rgb(var(--receivable))', values: num('to_get') },
            { label: pick('counter.toGive'), color: 'rgb(var(--payable))', values: num('to_give'), dash: true },
          ]} />
        </div>
      </div>
    </div>
  )
}
