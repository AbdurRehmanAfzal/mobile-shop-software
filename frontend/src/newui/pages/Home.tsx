/** Home in the new product (ADR-134), the third screen of `11-frame-stock-summary-and-dashboard.html`,
 *  inside the new frame: a greeting with Today / Yesterday / Week / This month, the two big tiles
 *  (Business overview, Shop audit), "at a glance" as the file's eight coloured cards, what needs
 *  attention, Hazri, and the last 7 days' sales as bars with where the money sits.
 *
 *  Every figure is the live home's: `/reports/day` for the period (sales, profit, in hand, expenses),
 *  `/reports/dashboard` (cash & bank, to get, to give, stock, returns, the 7 days, what needs
 *  attention), `/shop-audit/overview` for the lines under the cards (owner / manager), attendance
 *  `/attendance/today` with check in / out. A salesman sees today only, no profit, today's cash
 *  instead of cash & bank — as on the live home.
 *
 *  Differences from the drawing: the 7-day total and the money split as percentages are not shown (the
 *  app never works out a total or a share — the three amounts are shown as the server sends them);
 *  "Live counter sync" and the two shops' sample data are sample decoration. */

import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Boxes, ChevronRight, ClipboardCheck, Clock, HandCoins, IdCard, LayoutGrid, ShieldAlert, TrendingUp, UserCheck, Wrench } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { useAuth } from '@/lib/auth'
import { isoDay, withCur } from '@/lib/format'
import { useModules, useTrade } from '@/lib/modules'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import type { DayReport } from '@/lib/types'
import { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { tm, type Att } from '@/features/counter/HazriCard'

interface Dash {
  returns_today?: number; returns_month?: number; cash_in_hand?: string | null; today_cash?: string; today_bank?: string
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; repairs_open: number; low_stock_items?: number; installments_due_today?: number; installments_overdue?: number; lending_late?: number; lending_we_owe_due?: number
  sales_7d?: { date: string; total: string }[]
}
interface Glance { previous: { net_profit: string | null }; money: { inflows: string; outflows: string }; debt: { received_in_period: string } }
type Kind = 'today' | 'yesterday' | 'week' | 'month'

const num = (v: string | number | null | undefined) => Number(v ?? 0)
const plain = (v: string | number | null | undefined) => Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })
const rs = (v: string | number | null | undefined) => `${num(v) < 0 ? '−' : ''}${withCur(plain(v))}`
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' }

export default function NewHome() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const manager = role === 'owner' || role === 'manager'
  const has = useModules()
  const trade = useTrade()
  const [kind, setKind] = useState<Kind>('today')
  const period: Period = manager ? periodOf(kind) : periodOf('today')
  const { data: dash } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const { data: rep } = useGet<DayReport>(['day', period.from, period.to], `/api/v1/reports/day?${periodQuery(period)}`)
  const preset = period.from === period.to && period.from === isoDay(0) ? 'today' : period.from === period.to && period.from === isoDay(-1) ? 'yesterday' : 'custom'
  const glanceQuery = preset === 'custom' ? `preset=custom&date_from=${period.from}&date_to=${period.to}` : `preset=${preset}`
  const { data: glance } = useGet<Glance>(['home-glance', glanceQuery], manager && has('reports') ? `/api/v1/shop-audit/overview?${glanceQuery}` : null)
  const { data: tally } = useGet<{ requests?: { status: string }[] }>(['tally-access'], role === 'owner' ? '/api/v1/staff-access/stock_tally' : null)
  const { data: sec } = useGet<{ pending?: number }>(['security'], role === 'owner' ? '/api/v1/security' : null)
  const tallyAsks = (tally?.requests ?? []).filter((r) => r.status === 'pending').length
  const firstName = (me?.user.name ?? '').trim().split(/\s+/)[0]
  const worth = dash ? dash.stock_value_cost ?? dash.stock_value_asking : null
  const bank = manager ? dash?.cash_in_hand : dash?.today_cash
  const bankNeg = num(bank) < 0
  const profitNeg = num(rep?.profit) < 0
  const hisaab = '/new/hisaab'
  const label = (k: Kind) => pick(`nhome.p.${k}`)

  const att: { to: string; tone: 'amber' | 'rose'; icon: ReactNode; n: number; text: string; sub: string; act: string; show: boolean }[] = dash ? [
    { to: '/new/stock/id-pending', tone: 'amber' as const, icon: <IdCard className="w-5 h-5" />, n: dash.pending_verification, text: 'nhome.a.idPending', sub: 'nhome.a.idPendingSub', act: 'nhome.review', show: dash.pending_verification > 0 },
    { to: '/new/repairs', tone: 'amber' as const, icon: <Wrench className="w-5 h-5" />, n: dash.repairs_open, text: 'nhome.a.repairs', sub: 'nhome.a.repairsSub', act: 'nhome.open', show: dash.repairs_open > 0 && has('repairs') },
    { to: '/new/installments?view=overdue', tone: 'rose' as const, icon: <HandCoins className="w-5 h-5" />, n: dash.installments_overdue ?? 0, text: 'nhome.a.instOverdue', sub: 'nhome.a.instOverdueSub', act: 'nhome.open', show: (dash.installments_overdue ?? 0) > 0 && has('installments') },
    { to: '/new/installments?view=today', tone: 'amber' as const, icon: <HandCoins className="w-5 h-5" />, n: dash.installments_due_today ?? 0, text: 'nhome.a.instToday', sub: 'nhome.a.instTodaySub', act: 'nhome.open', show: (dash.installments_due_today ?? 0) > 0 && has('installments') },
    { to: manager && has('reports') ? '/new/audit/lending' : '/new/khata', tone: 'rose' as const, icon: <Clock className="w-5 h-5" />, n: dash.lending_late ?? 0, text: 'nhome.a.lendLate', sub: 'nhome.a.lendLateSub', act: 'nhome.remind', show: (dash.lending_late ?? 0) > 0 },
    { to: manager && has('reports') ? '/new/audit/lending' : '/new/khata', tone: 'amber' as const, icon: <HandCoins className="w-5 h-5" />, n: dash.lending_we_owe_due ?? 0, text: 'nhome.a.weOwe', sub: 'nhome.a.weOweSub', act: 'nhome.open', show: (dash.lending_we_owe_due ?? 0) > 0 },
    { to: '/new/accessories?tab=low', tone: 'amber' as const, icon: <Boxes className="w-5 h-5" />, n: dash.low_stock_items ?? 0, text: 'nhome.a.lowStock', sub: 'nhome.a.lowStockSub', act: 'nhome.open', show: (dash.low_stock_items ?? 0) > 0 && has('accessories') },
    { to: '/new/more/security', tone: 'amber' as const, icon: <ShieldAlert className="w-5 h-5" />, n: sec?.pending ?? 0, text: 'nhome.a.devices', sub: 'nhome.a.devicesSub', act: 'nhome.review', show: (sec?.pending ?? 0) > 0 },
    { to: '/new/stock/summary', tone: 'amber' as const, icon: <UserCheck className="w-5 h-5" />, n: tallyAsks, text: 'nhome.a.tally', sub: 'nhome.a.tallySub', act: 'nhome.review', show: tallyAsks > 0 },
  ].filter((a) => a.show) : []

  const days = dash?.sales_7d ?? []
  const peak = days.reduce<{ date: string; total: string } | null>((m, d) => (!m || num(d.total) > num(m.total) ? d : m), null)
  const top = Math.max(1, ...days.map((d) => num(d.total)))
  const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' })
  const cardBase = 'smart-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between text-start'
  const capsLabel = ur ? `font-bold ${cls('sm')}` : 'text-xs font-bold uppercase tracking-wider'

  return (
    <section className="space-y-6" data-testid="nhome">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={ur ? `ur font-extrabold ${cls('lg')}` : 'font-display font-extrabold text-2xl sm:text-3xl tracking-tight'} data-testid="nhome-greet">{pick(`home.greet.${greeting()}`)}{firstName ? `${ur ? '، ' : ', '}${firstName}` : ''}</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">{pick('nhome.sub')}</p>
        </div>
        {manager ? (
          <div className="inline-flex p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 self-start" role="group">
            {(['today', 'yesterday', 'week', 'month'] as Kind[]).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`nhome-p-${k}`} className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${kind === k ? 'font-bold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{label(k)}</button>)}
          </div>
        ) : null}
      </div>

      {manager ? (
        <div className={`grid grid-cols-1 gap-4 ${has('reports') ? 'md:grid-cols-2' : ''}`}>
          <Link to="/new/overview" className="smart-card rounded-2xl bg-obsidian-900 border border-slate-800 p-5 text-white flex items-center justify-between cursor-pointer group" data-testid="nhome-overview">
            <div className="flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-white/10 text-[#B4F000] flex items-center justify-center"><LayoutGrid className="w-5 h-5" /></div><div><h2 className="font-display font-bold text-base text-[#B4F000]">{pick('ov.title')}</h2><p className="text-xs text-slate-300 mt-0.5">{pick('nhome.ovHint')}</p></div></div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform rtl:rotate-180" />
          </Link>
          {has('reports') ? (
            <Link to={`/new/audit?${glanceQuery}`} className="smart-card rounded-2xl bg-[#548C00] dark:bg-[#4A7C00] border border-[#65A30D] p-5 text-white flex items-center justify-between cursor-pointer group" data-testid="nhome-audit">
              <div className="flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-white/15 text-white flex items-center justify-center"><ClipboardCheck className="w-5 h-5" /></div><div><h2 className="font-display font-bold text-base text-white">{pick('audit.title')}</h2><p className="text-xs text-lime-100 mt-0.5">{pick('nhome.auditHint')}</p></div></div>
              <ChevronRight className="w-5 h-5 text-lime-100 group-hover:translate-x-1 transition-transform rtl:rotate-180" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-3"><h2 className={`text-slate-500 dark:text-slate-400 ${capsLabel}`}>{pick('nhome.glance')} ({label(manager ? kind : 'today')})</h2></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="nhome-cards">
          <button type="button" onClick={() => nav(hisaab)} className={`${cardBase} bg-[#B4F000] text-slate-950 shadow-xs cursor-pointer`} data-testid="nhome-sales">
            <div className="flex items-center justify-between w-full"><span className={`opacity-80 ${capsLabel}`}>{pick('home.sales')}</span><span className="w-7 h-7 rounded-lg bg-black/10 flex items-center justify-center"><TrendingUp className="w-4 h-4" /></span></div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight my-2" dir="ltr">{rs(rep?.sales_total)}</div>
            {trade.devices ? <div className="text-xs font-semibold opacity-80">{pick('home.phonesSold').replace('{{n}}', String(rep?.phones_sold ?? 0))}</div> : <div />}
          </button>
          {manager ? (
            <button type="button" onClick={() => nav('/new/overview')} className={`${cardBase} cursor-pointer ${profitNeg ? 'bg-rose-50/90 dark:bg-rose-950/25 border border-rose-200/90 dark:border-rose-800/60' : 'bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60'}`} data-testid="nhome-profit">
              <div className="flex items-center justify-between w-full"><span className={`${profitNeg ? 'text-rose-800 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300'} ${capsLabel}`}>{pick('home.profit')}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{pick('nhome.margin')}</span></div>
              <div className={`font-display font-extrabold text-2xl sm:text-3xl tracking-tight my-2 ${profitNeg ? 'text-rose-600' : 'text-emerald-900 dark:text-emerald-200'}`} dir="ltr">{rs(rep?.profit)}</div>
              <div className="text-xs text-emerald-700/80 dark:text-emerald-400">{glance ? `${pick('audit.vsPrevious')} ${plain(glance.previous.net_profit)}` : ''}</div>
            </button>
          ) : null}
          <button type="button" onClick={() => nav(hisaab)} className={`${cardBase} bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 cursor-pointer`} data-testid="nhome-inhand">
            <div className="flex items-center justify-between w-full"><span className={`text-slate-500 dark:text-slate-400 ${capsLabel}`}>{pick('counter.inHand')}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick('nhome.drawer')}</span></div>
            <div className={`font-display font-extrabold text-2xl sm:text-3xl tracking-tight my-2 ${num(rep?.cash_net) < 0 ? 'text-rose-600' : ''}`} dir="ltr">{rs(rep?.cash_net)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{glance ? `${pick('audit.moneyIn')} ${plain(glance.money.inflows)} · ${pick('audit.moneyOut')} ${plain(glance.money.outflows)}` : ''}</div>
          </button>
          <button type="button" onClick={() => nav(manager ? '/new/more/cash' : hisaab)} className={`${cardBase} bg-white dark:bg-obsidian-900 cursor-pointer ${bankNeg ? 'border-2 border-rose-300/80 dark:border-rose-800/80' : 'border border-slate-200/90 dark:border-slate-800'}`} data-testid="nhome-bank">
            <div className="flex items-center justify-between w-full"><span className={`text-slate-600 dark:text-slate-300 ${capsLabel}`}>{pick(manager ? 'audit.cashBank' : 'home.todayCash')}</span>{bankNeg ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />{pick('nhome.overdrawn')}</span> : null}</div>
            <div className={`font-display font-extrabold text-2xl sm:text-3xl tracking-tight my-2 ${bankNeg ? 'text-rose-600 dark:text-rose-400' : ''}`} dir="ltr">{rs(bank)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{manager ? pick('nhome.bankSub') : `${pick('home.todayBank')} ${plain(dash?.today_bank)}`}</div>
          </button>
          <button type="button" onClick={() => nav('/new/khata')} className={`${cardBase} bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200/90 dark:border-amber-800/60 cursor-pointer`} data-testid="nhome-get">
            <div className="flex items-center justify-between w-full gap-2"><span className={`text-amber-800 dark:text-amber-300 ${capsLabel}`}>{pick('counter.toGet')}</span><span className="text-amber-600 dark:text-amber-400 font-bold text-xs whitespace-nowrap">↓ {pick('nhome.receivable')}</span></div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl text-amber-700 dark:text-amber-300 tracking-tight my-2" dir="ltr">{plain(dash?.receivable)}</div>
            <div className="text-xs text-amber-800/75 dark:text-amber-400/80">{glance ? `${pick('audit.receivedInPeriod')} ${withCur(plain(glance.debt.received_in_period))}` : ''}</div>
          </button>
          <button type="button" onClick={() => nav('/new/khata')} className={`${cardBase} bg-rose-50/90 dark:bg-rose-950/25 border border-rose-200/90 dark:border-rose-800/60 cursor-pointer`} data-testid="nhome-give">
            <div className="flex items-center justify-between w-full gap-2"><span className={`text-rose-800 dark:text-rose-300 ${capsLabel}`}>{pick('counter.toGive')}</span><span className="text-rose-600 dark:text-rose-400 font-bold text-xs whitespace-nowrap">↑ {pick('nhome.payable')}</span></div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl text-rose-600 dark:text-rose-400 tracking-tight my-2" dir="ltr">{plain(dash?.payable)}</div>
            <div className="text-xs text-rose-800/75 dark:text-rose-400/80">{pick('nhome.payableSub')}</div>
          </button>
          <button type="button" onClick={() => nav('/new/stock/summary')} className={`${cardBase} bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 hover:border-obsidian-900 dark:hover:border-[#B4F000] cursor-pointer`} data-testid="nhome-stock">
            <div className="flex items-center justify-between w-full"><span className={`text-slate-500 dark:text-slate-400 ${capsLabel}`}>{pick(trade.devices ? 'home.inStock' : 'goods.inStock')}</span><span className="text-xs font-bold text-blue-600 dark:text-[#B4F000] flex items-center gap-0.5">{pick('nhome.view')}<ArrowRight className="w-3 h-3 rtl:rotate-180" /></span></div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight my-2" dir="ltr">{dash?.stock_count ?? 0}</div>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{worth ? `${pick('home.worth')} ${plain(worth)}` : ''}</div>
          </button>
          <button type="button" onClick={() => nav('/new/expenses')} className={`${cardBase} bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 cursor-pointer`} data-testid="nhome-retexp">
            <div className="flex items-center justify-between w-full"><span className={`text-slate-500 dark:text-slate-400 ${capsLabel}`}>{pick('nhome.retExp')}</span></div>
            <div className="flex items-baseline gap-3 my-2 whitespace-nowrap" dir="ltr"><div><span className="font-display font-extrabold text-2xl">{dash?.returns_month ?? 0}</span><span className="text-xs text-slate-500 ms-1">{pick('nhome.returns')}</span></div><span className="text-slate-300 dark:text-slate-700">|</span><div><span className="font-display font-extrabold text-2xl">{rs(rep?.expenses)}</span><span className="text-xs text-slate-500 ms-1">{pick('nhome.exp')}</span></div></div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{pick('ret.homeToday').replace('{{n}}', String(dash?.returns_today ?? 0))}</div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-3" data-testid="nhome-attention">
          <h3 className={`text-slate-500 dark:text-slate-400 ${capsLabel}`}>{pick('nhome.attention')} ({att.length})</h3>
          {!att.length ? <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 flex items-center gap-3 text-sm text-slate-500"><AlertTriangle className="w-5 h-5 text-emerald-500" />{pick('nhome.allClear')}</div> : att.map((a) => (
            <Link key={a.text} to={a.to} className={`smart-card rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer border ${a.tone === 'amber' ? 'bg-amber-50/90 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60' : 'bg-rose-50/90 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/60'}`} data-testid="nhome-att">
              <div className="flex items-center gap-3 min-w-0"><span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${a.tone === 'amber' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>{a.icon}</span><div className="min-w-0"><div className="font-bold text-sm text-slate-900 dark:text-slate-100">{pick(a.text).replace('{{n}}', String(a.n))}</div><div className="text-xs text-slate-600 dark:text-slate-400">{pick(a.sub)}</div></div></div>
              <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${a.tone === 'amber' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-rose-500/15 text-rose-800 dark:text-rose-300'}`}>{pick(a.act)} →</span>
            </Link>
          ))}
          <Hazri />
        </div>
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-5 flex flex-col justify-between" data-testid="nhome-week">
          <div>
            <div className="flex items-center justify-between mb-1"><h3 className="font-bold text-sm">{pick('nhome.week')}</h3></div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{peak && num(peak.total) > 0 ? pick('nhome.peak').replace('{{d}}', dayName(peak.date)) : pick('audit.noData')}</p>
            <div className="grid grid-cols-7 gap-2 items-end h-32 pt-4 px-1 border-b border-slate-100 dark:border-slate-800" dir="ltr">
              {days.map((d) => {
                const isPeak = peak?.date === d.date && num(d.total) > 0
                const h = Math.max(6, Math.round((num(d.total) / top) * 92))
                return <button key={d.date} type="button" onClick={() => nav(`/new/hisaab?from=${d.date}&to=${d.date}`)} className="flex flex-col items-center h-full justify-end cursor-pointer" title={`${dayName(d.date)}: ${withCur(plain(d.total))}`} data-testid="nhome-bar"><span className={`w-full rounded-t-lg ${num(d.total) <= 0 ? 'bg-slate-200 dark:bg-slate-800' : isPeak ? 'bg-obsidian-900 dark:bg-[#B4F000]' : 'bg-[#548C00] dark:bg-[#B4F000]/80'}`} style={{ height: `${h}%` }} /></button>
              })}
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-semibold text-slate-400 mt-1.5" dir="ltr">{days.map((d) => <span key={d.date} className={peak?.date === d.date && num(d.total) > 0 ? 'text-slate-900 dark:text-[#B4F000] font-bold' : ''}>{dayName(d.date)}</span>)}</div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="nhome-sits">
            <span className="text-slate-500">{pick('nhome.inStockShort')}: <strong className="text-slate-800 dark:text-slate-200" dir="ltr">{plain(worth)}</strong></span>
            <span className="text-slate-500">{pick('nhome.lena')}: <strong className="text-amber-600" dir="ltr">{plain(dash?.receivable)}</strong></span>
            <span className="text-slate-500">{pick('nhome.dena')}: <strong className="text-rose-600" dir="ltr">{plain(dash?.payable)}</strong></span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Hazri as the file draws it: check in, then check out, then the day's hours (the live attendance) */
function Hazri() {
  const has = useModules()
  const { pick } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<{ day: string; record: Att | null }>(['hazri-today'], has('attendance') ? '/api/v1/attendance/today' : null)
  const checkIn = useDocMutation<Record<string, never>, Att>('POST', () => '/api/v1/attendance/check-in')
  const checkOut = useDocMutation<Record<string, never>, Att>('POST', () => '/api/v1/attendance/check-out')
  if (!has('attendance') || !data) return null
  const r = data.record
  const line = !r?.in_at ? pick('hazri.notIn') : r.out_at ? `${pick('hazri.inOut').replace('{{a}}', tm(r.in_at)).replace('{{b}}', tm(r.out_at))}${r.hours != null ? ` · ${pick('hazri.hours').replace('{{h}}', String(r.hours))}` : ''}` : pick('hazri.inAt').replace('{{t}}', tm(r.in_at))
  const busy = checkIn.isPending || checkOut.isPending
  return (
    <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 flex items-center justify-between gap-3" data-testid="nhome-hazri">
      <div className="flex items-center gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${r?.in_at && !r.out_at ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300'}`}><Clock className="w-5 h-5" /></div><div><div className="font-bold text-sm">{pick('hazri.title')}</div><div className="text-xs text-slate-500 dark:text-slate-400" data-testid="nhome-hazri-line">{line}</div></div></div>
      {!r?.in_at ? <button type="button" disabled={busy} onClick={async () => { await checkIn.mutateAsync({}); await inv('hazri-today') }} className="px-4 py-2 rounded-xl bg-[#548C00] hover:bg-[#467500] text-white font-bold text-xs cursor-pointer disabled:opacity-50" data-testid="nhome-checkin">→ {pick('hazri.checkIn')}</button>
        : !r.out_at ? <button type="button" disabled={busy} onClick={async () => { await checkOut.mutateAsync({}); await inv('hazri-today') }} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs cursor-pointer disabled:opacity-50" data-testid="nhome-checkout">{pick('hazri.checkOut')}</button>
          : <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">{pick('hazri.done')}</span>}
    </div>
  )
}
