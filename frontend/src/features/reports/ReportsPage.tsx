/** Profit & reports (owner/manager), docs/11 v2. Four tabs in shop words:
 *  Profit (sale − buying price − expenses = real profit, tax), Best sellers, Estimate (next 7 days,
 *  which phone runs out), Old stock. One date-range row drives Profit and Best sellers. */

import DownloadButton from '@/components/DownloadButton'
import { useState, type ReactNode } from 'react'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Empty, Loading, PageHeader } from '@/components/ui'
import { clampRange, isoDay } from '@/lib/format'
import { useGet } from '@/lib/queries'

interface Pnl { sales: string; cogs: string; gross_profit: string; repair_income: string; other_income: string; expenses: Record<string, string>; total_expenses: string; net_profit: string; owner_drawing: string; tax_collected: string }
interface Top { name: string; kind: 'device' | 'misc'; qty: number; amount: string; profit: string | null }
interface Forecast {
  next_7_days: { date: string; expected: string }[]; next_7_total: string; last_7_days: string; previous_7_days: string
  models: { model_id: string; name: string; sold_30_days: number; in_stock: number; days_left: number | null; advice: 'buy_more' | 'ok' | 'slow' }[]
}
interface Age { bucket: string; count: number; value: string | null }
interface Cat { key: string; name: string; name_ur: string | null }
type Tab = 'profit' | 'top' | 'estimate' | 'old'
type Range = 'today' | 'yesterday' | 'last7' | 'month' | 'custom'

const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
/** "− 800" for money taken off; plain "0" when nothing was */
const minus = (v: string | number) => (Number(v) ? `− ${n(v)}` : '0')
const monthStart = () => { const d = new Date(); return isoDay(1 - d.getDate()) }

export default function ReportsPage() {
  const { pick, ur, cls } = useLang()
  const [tab, setTab] = useState<Tab>('profit')
  const [range, setRange] = useState<Range>('month')
  const [custom, setCustom] = useState({ from: monthStart(), to: isoDay(0) })
  const [from, to] =
    range === 'today' ? [isoDay(0), isoDay(0)]
    : range === 'yesterday' ? [isoDay(-1), isoDay(-1)]
    : range === 'last7' ? [isoDay(-6), isoDay(0)]
    : range === 'month' ? [monthStart(), isoDay(0)]
    : [custom.from, custom.to]
  const qs = `?date_from=${from}&date_to=${to}`
  const { data: pnl } = useGet<Pnl>(['r-pnl', from, to], tab === 'profit' ? `/api/v1/reports/profit-loss${qs}` : null)
  const { data: top } = useGet<Top[]>(['r-top', from, to], tab === 'top' ? `/api/v1/reports/top-sellers${qs}` : null)
  const { data: fc } = useGet<Forecast>(['r-forecast'], tab === 'estimate' ? '/api/v1/reports/forecast' : null)
  const { data: age } = useGet<Age[]>(['r-age'], tab === 'old' ? '/api/v1/reports/stock-ageing' : null)
  const { data: cats } = useGet<Cat[]>(['exp-cats'], '/api/v1/expenses/categories')
  const catName = (k: string) => { const c = cats?.find((x) => x.key === k); return c ? (ur && c.name_ur ? c.name_ur : c.name) : k }
  const small = ur ? cls('sm') : 'text-sm font-semibold'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const net = Number(pnl?.net_profit ?? 0)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="counter.reportTitle"
        right={
          <DownloadButton
            path={tab === 'profit' ? `/api/v1/exports/profit-loss${qs}` : tab === 'top' ? `/api/v1/exports/top-sellers${qs}` : tab === 'estimate' ? '/api/v1/exports/forecast' : '/api/v1/exports/stock-ageing'}
            name={{ profit: 'profit-loss', top: 'best-sellers', estimate: 'estimate', old: 'old-stock' }[tab]}
          />
        }
      />
      <div className="print:hidden">
        <BiSegmented<Tab> value={tab} onChange={setTab} options={[{ value: 'profit', text: 'counter.tabProfit' }, { value: 'top', text: 'counter.tabTop' }, { value: 'estimate', text: 'counter.tabEstimate' }, { value: 'old', text: 'counter.tabOld' }]} />
      </div>

      {tab === 'profit' || tab === 'top' ? (
        <div className="print:hidden flex flex-col gap-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {(['today', 'yesterday', 'last7', 'month', 'custom'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={chip(range === r)}>
                {pick({ today: 'counter.today', yesterday: 'counter.yesterday', last7: 'counter.last7', month: 'counter.thisMonth', custom: 'counter.fromTo' }[r])}
              </button>
            ))}
          </div>
          {range === 'custom' ? (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" aria-label="from" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom(clampRange(e.target.value, custom.to, 'from'))} className="h-12 rounded-2xl border border-line bg-surface px-3 font-bold" dir="ltr" />
              <input type="date" aria-label="to" value={custom.to} min={custom.from} max={isoDay(0)} onChange={(e) => e.target.value && setCustom(clampRange(custom.from, e.target.value, 'to'))} className="h-12 rounded-2xl border border-line bg-surface px-3 font-bold" dir="ltr" />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'profit' ? (
        !pnl ? <Loading /> : (
          <>
            <section className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${net >= 0 ? 'bg-sell text-sell-fg' : 'bg-expense text-expense-fg'}`}>
              <div className="flex items-center gap-1"><BiLabel text={net >= 0 ? 'counter.netProfit' : 'counter.netLoss'} size="md" bold tone="text-current" /><span className="[&_button]:text-current"><Help term="profit" /></span></div>
              <span className="num text-[34px] leading-tight" dir="ltr">Rs. {n(net)}</span>
            </section>
            <div className="card flex flex-col p-0">
              <Line label="counter.sold" value={n(pnl.sales)} />
              <Line label="counter.cogs" value={minus(pnl.cogs)} muted />
              <Line label="counter.grossProfit" value={n(pnl.gross_profit)} strong />
              {Number(pnl.repair_income) + Number(pnl.other_income) ? <Line label="counter.otherIncome" value={`+ ${n(Number(pnl.repair_income) + Number(pnl.other_income))}`} /> : null}
              {Object.entries(pnl.expenses).map(([k, v]) => <Line key={k} label={{ en: catName(k), ur: catName(k) }} value={minus(v)} muted />)}
              <Line label={net >= 0 ? 'counter.netProfit' : 'counter.netLoss'} value={n(net)} strong />
            </div>
            <div className="card flex flex-col p-0">
              <Line label="counter.taxCollected" value={n(pnl.tax_collected)} />
              {Number(pnl.owner_drawing) ? <Line label="counter.ownerTook" value={n(pnl.owner_drawing)} muted /> : null}
            </div>
            <BiLabel text="counter.lists" size="md" bold className="mt-2" />
            <div className="card divide-y divide-line p-0">
              {(['sales', 'purchases', 'expenses'] as const).map((k) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className={ur ? cls('md') : 'text-[15px] font-semibold'}>{pick(`export.${k}`)}</span>
                  <DownloadButton path={`/api/v1/exports/${k}${qs}`} name={k} />
                </div>
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === 'top' ? (
        !top ? <Loading /> : !top.length ? <Empty text="counter.noData" /> : (
          <div className="card divide-y divide-line p-0">
            {top.map((t, i) => (
              <div key={t.name + i} className="flex items-center gap-3 px-4 py-3">
                <span className={`well h-10 w-10 shrink-0 text-sm font-extrabold ${t.kind === 'device' ? 'bg-stockt text-stockt-fg' : 'bg-sell text-sell-fg'}`}>{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-extrabold">{t.name}</span>
                  <span className={`text-muted ${small}`}><span className="num">{t.qty}</span> {pick('counter.soldQty')} · <span className="num" dir="ltr">{n(t.amount)}</span></span>
                </span>
                {t.profit !== null ? <span className="num text-base text-emerald" dir="ltr">+{n(t.profit)}</span> : null}
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === 'estimate' ? (
        !fc ? <Loading /> : (
          <>
            <section className="flex flex-col gap-1 rounded-3xl bg-buy px-5 py-4 text-buy-fg">
              <BiLabel text="counter.next7" size="md" bold tone="text-current" />
              <span className="num text-[30px] leading-tight" dir="ltr">Rs. {n(fc.next_7_total)}</span>
              <span className={small}>{pick('counter.lastWeek')}: <span className="num" dir="ltr">{n(fc.last_7_days)}</span> · {pick('counter.prevWeek')}: <span className="num" dir="ltr">{n(fc.previous_7_days)}</span></span>
            </section>
            <div className="card divide-y divide-line p-0">
              {fc.next_7_days.map((d) => (
                <div key={d.date} className="flex items-center justify-between px-4 py-2">
                  <span className={small}>{new Date(`${d.date}T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'long' })}</span>
                  <span className="num" dir="ltr">{n(d.expected)}</span>
                </div>
              ))}
            </div>
            <BiLabel text="counter.estimateNote" size="sm" tone="text-muted" />
            <BiLabel text="counter.runOut" size="md" bold className="mt-2" />
            {!fc.models.length ? <Empty text="counter.noData" /> : (
              <div className="card divide-y divide-line p-0">
                {fc.models.map((m) => (
                  <div key={m.model_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-extrabold">{m.name}</span>
                      <span className={`text-muted ${small}`}>
                        <span className="num">{m.sold_30_days}</span> {pick('counter.sold30')} · <span className="num">{m.in_stock}</span> {pick('counter.inStockN')}
                        {m.days_left !== null ? <> · <span className="num">{m.days_left}</span> {pick('counter.daysLeft')}</> : null}
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 font-bold ${m.advice === 'buy_more' ? 'bg-buy text-buy-fg' : m.advice === 'slow' ? 'bg-expense text-expense-fg' : 'bg-ground text-muted'} ${ur ? cls('sm') : 'text-xs'}`}>
                      {pick(`counter.advice.${m.advice}`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}

      {tab === 'old' ? (
        !age ? <Loading /> : (
          <div className="grid grid-cols-2 gap-2">
            {age.map((a) => (
              <div key={a.bucket} className={`flex flex-col rounded-3xl p-4 ${a.bucket === '60+' ? 'bg-expense text-expense-fg' : a.bucket === '31-60' ? 'bg-khata text-khata-fg' : 'bg-surface border border-line'}`}>
                <span className={small}><span className="num" dir="ltr">{a.bucket}</span> {pick('counter.days')}</span>
                <span className="num text-3xl">{a.count}</span>
                {a.value !== null ? <span className="num text-sm opacity-80" dir="ltr">Rs. {n(a.value)}</span> : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

function Line({ label, value, strong, muted }: { label: string | { en: string; ur: string }; value: ReactNode; strong?: boolean; muted?: boolean }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 ${strong ? 'bg-ground/60' : ''}`}>
      <span className={`${ur ? cls('md') : 'text-[15px]'} ${strong ? 'font-bold' : muted ? 'text-muted' : ''}`}>{pick(label)}</span>
      <span className={`num ${strong ? 'text-xl' : 'text-base'} ${muted ? 'text-muted' : ''}`} dir="ltr">{value}</span>
    </div>
  )
}
