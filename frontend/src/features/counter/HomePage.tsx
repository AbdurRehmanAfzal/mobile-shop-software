/** Home, "Dukaan counter" (docs/11 v2). Search, the two main jobs, then (owner 2026-10-28, after 20
 *  testers called it "basic") a modern dashboard: a greeting, the other jobs with their own colours,
 *  the period's business in one hero card with a 7-day chart, the udhaar khata, stock worth and
 *  reports. Every card that opens something still says "See details ›" (owner: users did not know
 *  the cards could be tapped). */

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, HandCoins, Landmark, Palette, PiggyBank, Receipt, ScanLine, Search, ShieldAlert, Smartphone, Tag, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { ScanButton } from '@/components/ScanButton'
import { BtnText } from '@/components/ui'
import Help from '@/components/Help'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import Bars from '@/components/charts/Bars'
import Donut from '@/components/charts/Donut'
import { isoDay } from '@/lib/format'
import type { DayReport } from '@/lib/types'
import HazriCard from './HazriCard'
import { useAiStatus } from '@/lib/ai'
import { Bot } from 'lucide-react'
import PeriodPicker, { periodOf, periodQuery, type Period } from './PeriodPicker'
import { JOBS, type Job } from './jobs'
import { useModules } from '@/lib/modules'
import { useLayout, type Layout } from '@/lib/theme'

interface Dash {
  cash_in_hand?: string | null
  today_cash?: string
  today_bank?: string
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; repairs_open: number; low_stock_items?: number; installments_due_today?: number; installments_overdue?: number; lending_late?: number; lending_we_owe_due?: number
  sales_7d?: { date: string; total: string }[]
}

/** each smaller job gets its own colour, so the grid reads at a glance (same in light and dark) */
const ACCENT: Partial<Record<Job['id'], string>> = {
  khata: 'bg-[#F59E0B]/15 text-[#D97706]',
  stock: 'bg-[#3B82F6]/15 text-[#3B82F6]',
  repair: 'bg-[#14B8A6]/15 text-[#0D9488]',
  return: 'bg-[#F43F5E]/15 text-[#E11D48]',
  invoices: 'bg-[#6366F1]/15 text-[#6366F1]',
  expense: 'bg-[#F97316]/15 text-[#EA580C]',
}

/** the "?" for the two big jobs (docs/33) */
const JOB_HELP: Partial<Record<Job['id'], { helpKey: string }>> = {
  sell: { helpKey: 'counter.job.sell' },
  addStock: { helpKey: 'counter.job.addStock' },
}

export default function HomePage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const me = useAuth((s) => s.me)
  const manager = me?.user.role === 'owner' || me?.user.role === 'manager'
  const { data: ai } = useAiStatus()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<Period>(periodOf('today'))
  const { data: dash } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const { data: rep } = useGet<DayReport>(['day', period.from, period.to], `/api/v1/reports/day?${periodQuery(period)}`)
  const worth = dash ? dash.stock_value_cost ?? dash.stock_value_asking : null
  const has = useModules()
  const layout = useLayout()
  const [big, small] = [JOBS.slice(0, 2), JOBS.slice(2).filter((j) => !j.module || has(j.module))]
  const firstName = (me?.user.name ?? '').trim().split(/\s+/)[0]
  const hisaab = `/hisaab?from=${period.from}&to=${period.to}`
  const cashNeg = Number(rep?.cash_net ?? 0) < 0
  // owner's user test 2026-10-31: the numbers people check every day, like the Shop Audit, on the first screen
  const preset = period.from === period.to && period.from === isoDay(0) ? 'today' : period.from === period.to && period.from === isoDay(-1) ? 'yesterday' : period.from === isoDay(-6) && period.to === isoDay(0) ? 'custom' : 'custom'
  const glanceQuery = preset === 'custom' ? `preset=custom&date_from=${period.from}&date_to=${period.to}` : `preset=${preset}`
  const { data: glance } = useGet<Glance>(['home-glance', glanceQuery], manager && has('reports') ? `/api/v1/shop-audit/overview?${glanceQuery}` : null)

  function search(e: FormEvent) {
    e.preventDefault()
    nav(`/stock?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <span className={ur ? cls('lg') + ' font-bold' : 'text-[22px] font-extrabold leading-tight tracking-[-0.02em]'}>
            {pick(`home.greet.${greeting()}`)}{firstName ? `${ur ? '، ' : ', '}${firstName}` : ''}
          </span>
          <Help term="counter.home" />
          <Link to="/more/appearance" aria-label={pick('look.title')} className={`tap ms-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 font-bold text-ink ${ur ? cls('sm') : 'text-[13px]'}`} data-testid="home-appearance">
            <Palette size={16} className="text-emerald" /> <span className="max-[379px]:hidden">{pick('look.title')}</span>
          </Link>
        </span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick('home.sub')}</span>
      </div>

      <form onSubmit={search} className="-mt-1 flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface pe-1.5 ps-4 shadow-[0_8px_24px_-18px_rgba(27,31,36,.35)]">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick('common.search')} placeholder={pick('counter.search')} className={`min-w-0 flex-1 bg-transparent font-medium text-ink placeholder:text-muted/70 focus:outline-none ${ur ? 'ur text-[15px]' : ''}`} />
        <Help term="counter.search" size="sm" />
        <ScanButton size="sm" onImei={(imei) => nav(`/stock?q=${imei}`)} />
        <button type="submit" aria-label={pick('common.search')} className="tap flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-ink px-1.5 py-1 text-ground">
          <ScanLine size={20} strokeWidth={1.75} />
          <BtnText k="common.search" />
        </button>
      </form>

      {/* fast actions first (owner's user test): sell, add stock, then the rest */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {big.map((j, i) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[92px] items-center gap-3 rounded-3xl p-3 max-[360px]:flex-col max-[360px]:items-start ${layout === 'bold' ? (i === 0 ? 'bg-emerald text-white shadow-cta' : 'bg-hero text-hero-text shadow-hero') : j.tone}`}>
            <span className={`well h-12 w-12 shrink-0 bg-surface ${j.ink}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1"><BiLabel text={j.label} size="lg" bold tone="text-current" />{JOB_HELP[j.id] ? <span className="[&_button]:text-current"><Help term={JOB_HELP[j.id]!.helpKey} size="sm" /></span> : null}</span>
              {j.hint ? <BiLabel text={j.hint} size="sm" tone="text-current opacity-80" /> : null}
            </span>
            <Chevron className="ms-auto shrink-0 opacity-80" />
          </Link>
        ))}
      </div>
      <OtherJobs jobs={small} layout={layout} />

      {/* at a glance: the period's numbers and two charts (owner / manager) */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle text="home.glance" help="counter.glanceAll" to={manager && has('reports') ? `/audit?${glanceQuery}` : hisaab} />
        {/* owner 2026-11-13 (ADR-072): a salesman sees today only */}
        {manager ? <PeriodPicker value={period} onChange={setPeriod} size="sm" /> : null}
        <GlanceSet layout={layout} items={[
          { id: 'sales', to: hisaab, help: 'counter.glance.sales', icon: <Tag size={16} />, tone: 'bg-sell text-sell-fg', label: 'home.sales', value: rep?.sales_total, sub: pick('home.phonesSold').replace('{{n}}', String(rep?.phones_sold ?? 0)) },
          ...(manager ? [{ id: 'profit', to: `/audit/finance?${glanceQuery}`, help: 'counter.glance.profit', icon: <PiggyBank size={16} />, tone: 'bg-ink text-ground', label: 'home.profit', value: rep?.profit, neg: Number(rep?.profit ?? 0) < 0, sub: glance ? `${pick('audit.vsPrevious')} ${fmt(glance.previous.net_profit)}` : undefined }] : []),
          { id: 'inHand', to: hisaab, help: 'inHand', icon: <Wallet size={16} />, tone: 'bg-emerald-tint text-emerald-deep', label: 'counter.inHand', value: rep?.cash_net, neg: cashNeg, sub: glance ? `${pick('audit.moneyIn')} ${fmt(glance.money.inflows)} · ${pick('audit.moneyOut')} ${fmt(glance.money.outflows)}` : undefined },
          manager
            ? { id: 'cashBank', to: '/more/cash', help: 'counter.glance.cashBank', icon: <Landmark size={16} />, tone: 'bg-khata text-khata-fg', label: 'audit.cashBank', value: dash?.cash_in_hand ?? undefined, neg: Number(dash?.cash_in_hand ?? 0) < 0, sub: pick('audit.now') }
            : { id: 'cashBank', to: hisaab, help: 'counter.glance.todayCashBank', icon: <Landmark size={16} />, tone: 'bg-khata text-khata-fg', label: 'home.todayCash', value: dash?.today_cash, neg: Number(dash?.today_cash ?? 0) < 0, sub: `${pick('home.todayBank')} ${fmt(dash?.today_bank ?? 0)}` },
          { id: 'toGet', to: '/khata?f=get', help: 'counter.glance.toGet', icon: <ArrowDownLeft size={16} />, tone: 'bg-receivable-tint text-receivable', label: 'counter.toGet', value: dash?.receivable, sub: glance ? `${pick('audit.receivedInPeriod')} ${fmt(glance.debt.received_in_period)}` : undefined },
          { id: 'toGive', to: '/khata?f=give', help: 'counter.glance.toGive', icon: <ArrowUpRight size={16} />, tone: 'bg-payable-tint text-payable', label: 'counter.toGive', value: dash?.payable },
          { id: 'inStock', to: '/stock/summary', help: 'counter.glance.inStock', icon: <Smartphone size={16} />, tone: 'bg-stockt text-stockt-fg', label: 'home.inStock', value: dash?.stock_count, plain: true, sub: worth ? `${pick('home.worth')} ${fmt(worth)}` : undefined },
          { id: 'expenses', to: '/expenses', help: 'counter.glance.expenses', icon: <Receipt size={16} />, tone: 'bg-expense text-expense-fg', label: 'home.expenses', value: rep?.expenses },
        ]} />
        {dash?.sales_7d ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <div className="card min-w-0" data-testid="home-bars">
              <span className="flex items-center gap-1"><BiLabel text="home.week" size="sm" tone="text-muted" bold /><Help term="counter.chart.week" size="sm" /></span>
              <Bars data={dash.sales_7d.map((d) => ({ label: new Date(`${d.date}T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' }), value: Number(d.total), key: d.date }))} onTap={(b) => nav(`/hisaab?from=${String(b.key)}&to=${String(b.key)}`)} height={120} empty="audit.noData" />
            </div>
            <div className="card min-w-0" data-testid="home-donut">
              <span className="flex items-center gap-1"><BiLabel text="home.moneySplit" size="sm" tone="text-muted" bold /><Help term="counter.chart.moneySplit" size="sm" /></span>
              <Donut size={104} data={[{ label: pick(manager ? 'audit.cashBank' : 'home.todayCash'), value: Math.max(0, Number((manager ? dash.cash_in_hand : dash.today_cash) ?? 0)), key: 'cash' }, { label: pick('counter.toGet'), value: Number(dash.receivable ?? 0), key: 'get' }, { label: pick('counter.toGive'), value: Number(dash.payable ?? 0), key: 'give' }, { label: pick('home.worth'), value: Number(worth ?? 0), key: 'stock' }]} onTap={(s) => nav(s.key === 'cash' ? (manager ? '/more/cash' : hisaab) : s.key === 'get' ? '/khata?f=get' : s.key === 'give' ? '/khata?f=give' : '/stock/summary')} empty="audit.noData" />
            </div>
          </div>
        ) : null}
      </section>

      <HazriCard />
      {ai?.configured ? (
        <Link to="/assistant" className="card tap flex items-center gap-3">
          <span className="well h-11 w-11 shrink-0 rounded-2xl bg-hero text-hero-text"><Bot size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1"><BiLabel text="ai.homeTitle" size="md" bold /><Help term="counter.ai" size="sm" /></span>
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('ai.homeHint')}</span>
          </span>
          <Chevron className="shrink-0" />
        </Link>
      ) : null}

      {manager && has('reports') ? (
        // the "?" sits on the card's corner, outside the link: a tap on the card always opens reports
        <div className="relative">
          <Link to="/reports" className="tap relative isolate flex items-center gap-3 overflow-hidden rounded-3xl bg-sell p-4 pe-10 text-sell-fg">
            <span aria-hidden className="pointer-events-none absolute -end-10 -top-12 -z-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
            <span className="well h-11 w-11 shrink-0 rounded-2xl bg-surface text-sell-icon"><TrendingUp size={22} strokeWidth={2} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <BiLabel text="counter.reportTitle" size="md" bold tone="text-current" />
              <span className={`opacity-85 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('counter.reportHint')}</span>
            </span>
            <Chevron className="shrink-0" />
          </Link>
          <span className="absolute end-2 top-2 text-sell-fg [&_button]:text-current"><Help term="counter.reports" size="sm" /></span>
        </div>
      ) : null}

      {dash && (dash.pending_verification > 0 || dash.repairs_open > 0 || (dash.low_stock_items ?? 0) > 0 || (dash.installments_due_today ?? 0) > 0 || (dash.installments_overdue ?? 0) > 0 || (dash.lending_late ?? 0) > 0 || (dash.lending_we_owe_due ?? 0) > 0) ? (
        <section className="flex flex-col gap-2">
          <SectionTitle text="counter.attention" help="counter.attention" />
          {dash.pending_verification > 0 ? <Attention to="/stock" help="counter.att.pendingCheck" icon={<ShieldAlert size={18} />} n={dash.pending_verification} text="counter.pendingCheck" /> : null}
          {dash.repairs_open > 0 && has('repairs') ? <Attention to="/repairs" help="counter.att.openRepairs" icon={<Wrench size={18} />} n={dash.repairs_open} text="counter.openRepairs" /> : null}
          {(dash.installments_overdue ?? 0) > 0 && has('installments') ? <Attention to="/installments?view=overdue" help="counter.att.instOverdue" icon={<HandCoins size={18} />} n={dash.installments_overdue!} text="counter.instOverdue" /> : null}
          {(dash.installments_due_today ?? 0) > 0 && has('installments') ? <Attention to="/installments?view=today" help="counter.att.instToday" icon={<HandCoins size={18} />} n={dash.installments_due_today!} text="counter.instToday" /> : null}
          {(dash.lending_late ?? 0) > 0 ? <Attention to={manager && has('reports') ? '/audit/lending' : '/khata?f=get'} help="counter.att.lendLate" icon={<HandCoins size={18} />} n={dash.lending_late!} text="counter.lendLate" /> : null}
          {(dash.lending_we_owe_due ?? 0) > 0 ? <Attention to={manager && has('reports') ? '/audit/lending' : '/khata?f=give'} help="counter.att.lendWeOwe" icon={<HandCoins size={18} />} n={dash.lending_we_owe_due!} text="counter.lendWeOwe" /> : null}
          {(dash.low_stock_items ?? 0) > 0 && has('accessories') ? <Attention to="/accessories?tab=low" help="counter.att.lowStock" icon={<Boxes size={18} />} n={dash.low_stock_items!} text="counter.lowStock" /> : null}
        </section>
      ) : null}
    </div>
  )
}

interface Glance { previous: { net_profit: string | null }; money: { inflows: string; outflows: string }; debt: { received_in_period: string } }

/** one number people check every day: label, value, a line under it, opens its screen */
function Glance({ to, icon, tone, label, value, sub, neg = false, plain = false, help }: { to: string; icon: ReactNode; tone: string; label: string; value: string | number | null | undefined; sub?: string; neg?: boolean; plain?: boolean; help?: string }) {
  const { ur, cls } = useLang()
  return (
    <Link to={to} className="card tap flex min-w-0 flex-col gap-1.5 !p-3">
      <span className="flex items-center gap-2"><span className={`well h-7 w-7 shrink-0 rounded-lg ${tone}`}>{icon}</span><BiLabel text={label} size="sm" tone="text-muted" bold className="min-w-0 truncate" />{help ? <Help term={help} size="sm" /> : null}</span>
      <span className={`num truncate text-[22px] leading-none ${neg ? 'text-payable' : 'text-ink'}`} dir="ltr">{neg ? '−' : ''}{plain ? String(value ?? 0) : fmt(value)}</span>
      {sub ? <span className={`truncate text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{sub}</span> : null}
    </Link>
  )
}

interface GlanceItem { id: string; to: string; icon: ReactNode; tone: string; label: string; value: string | number | null | undefined; sub?: string; neg?: boolean; plain?: boolean; help?: string }

const show = (it: GlanceItem) => `${it.neg ? '−' : ''}${it.plain ? String(it.value ?? 0) : fmt(it.value)}`

/** owner 2026-11-07: the day's numbers in the chosen design — Classic cards, Tiles (filled with
 *  each number's colour), Simple (one list) or Bold (a dark hero with sales, profit and cash) */
function GlanceSet({ items, layout }: { items: GlanceItem[]; layout: Layout }) {
  const { pick, ur, cls } = useLang()
  if (layout === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="glance" data-layout="tiles">
        {items.map((it) => (
          <Link key={it.id} to={it.to} className={`tap flex min-h-[112px] min-w-0 flex-col justify-between gap-2 rounded-3xl p-3.5 ${it.tone}`}>
            <span className="flex items-center gap-2"><span className="well h-8 w-8 shrink-0 rounded-xl bg-surface/80">{it.icon}</span><BiLabel text={it.label} size="sm" tone="text-current" bold className="min-w-0 truncate" />{it.help ? <span className="ms-auto [&_button]:text-current"><Help term={it.help} size="sm" /></span> : null}</span>
            <span className="num truncate text-[26px] leading-none" dir="ltr">{show(it)}</span>
            {it.sub ? <span className={`truncate opacity-80 ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{it.sub}</span> : <span />}
          </Link>
        ))}
      </div>
    )
  }
  if (layout === 'simple') {
    return (
      <div className="card grid grid-cols-1 gap-x-6 !py-1 lg:grid-cols-2" data-testid="glance" data-layout="simple">
        {items.map((it) => (
          <Link key={it.id} to={it.to} className="tap flex min-h-[58px] min-w-0 items-center gap-3 border-b border-line py-2 last:border-b-0 lg:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <span className={`well h-9 w-9 shrink-0 rounded-xl ${it.tone}`}>{it.icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1"><BiLabel text={it.label} size="sm" bold className="min-w-0 truncate" />{it.help ? <Help term={it.help} size="sm" /> : null}</span>
              {it.sub ? <span className={`truncate text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{it.sub}</span> : null}
            </span>
            <span className={`num shrink-0 text-lg ${it.neg ? 'text-payable' : 'text-ink'}`} dir="ltr">{show(it)}</span>
            <Chevron className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    )
  }
  if (layout === 'bold') {
    const heroIds = ['sales', 'profit', 'inHand']
    const [lead, ...pair] = items.filter((it) => heroIds.includes(it.id))
    const rest = items.filter((it) => !heroIds.includes(it.id))
    return (
      <div className="flex flex-col gap-2" data-testid="glance" data-layout="bold">
        {lead ? (
          <div className="hero relative isolate flex flex-col gap-4 overflow-hidden p-5">
            <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 -z-10 h-56 w-56 rounded-full bg-emerald/40 blur-3xl" />
            <Link to={lead.to} className="tap flex flex-col gap-1">
              <span className="flex items-center gap-2"><span className="well h-8 w-8 rounded-xl bg-white/15">{lead.icon}</span><BiLabel text={lead.label} size="sm" bold tone="text-current opacity-85" /><span className="[&_button]:text-current">{lead.help ? <Help term={lead.help} size="sm" /> : null}</span></span>
              <span className="num text-[38px] leading-none" dir="ltr">{show(lead)}</span>
              {lead.sub ? <span className={`opacity-75 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{lead.sub}</span> : null}
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {pair.map((it) => (
                <Link key={it.id} to={it.to} className="tap flex min-w-0 flex-col gap-1 rounded-2xl bg-white/10 p-3">
                  <BiLabel text={it.label} size="sm" bold tone="text-current opacity-80" className="truncate" />
                  <span className={`num truncate text-[22px] leading-none ${it.neg ? 'text-[#FCA5A5]' : ''}`} dir="ltr">{show(it)}</span>
                </Link>
              ))}
            </div>
            <Link to={lead.to} className={`tap inline-flex w-fit items-center gap-1 font-bold opacity-90 ${ur ? cls('sm') : 'text-[13px]'}`}>{pick('home.seeAll')}<Chevron /></Link>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {rest.map((it) => <Glance key={it.id} {...it} />)}
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="glance" data-layout="classic">
      {items.map((it) => <Glance key={it.id} {...it} />)}
    </div>
  )
}

/** phone: the jobs after "Sell" and "Add stock", in the chosen design */
function OtherJobs({ jobs, layout }: { jobs: Job[]; layout: Layout }) {
  const { pick, ur, cls } = useLang()
  const help = <span className="flex items-center"><Help term="counter.otherJobs" size="sm" /></span>
  if (layout === 'tiles') {
    return (
      <div className="grid grid-cols-3 gap-2 lg:hidden" data-testid="fast-actions">
        {jobs.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-3xl p-2 text-center ${j.tone}`}>
            <span className={`well h-10 w-10 rounded-2xl bg-surface ${j.ink}`}><j.Icon size={20} strokeWidth={2} /></span>
            <span className={`line-clamp-2 font-bold leading-tight ${ur ? cls('sm') : 'text-[12px]'}`}>{pick(j.label)}</span>
          </Link>
        ))}
      </div>
    )
  }
  if (layout === 'bold') {
    return (
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 lg:hidden" data-testid="fast-actions">
        {jobs.map((j) => (
          <Link key={j.id} to={j.to} className="tap flex w-[68px] shrink-0 flex-col items-center gap-1 text-center">
            <span className={`well h-14 w-14 rounded-full ${j.tone}`}><j.Icon size={22} strokeWidth={2} /></span>
            <span className={`line-clamp-2 font-bold leading-tight text-ink ${ur ? cls('sm') : 'text-[11px]'}`}>{pick(j.label)}</span>
          </Link>
        ))}
        {help}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2 lg:hidden" data-testid="fast-actions">
      {jobs.map((j) => (
        <Link key={j.id} to={j.to} className="tap flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-2 pe-4 ps-2">
          <span className={`well h-8 w-8 rounded-full ${layout === 'simple' ? `bg-ground ${j.ink}` : ACCENT[j.id] ?? j.tone}`}><j.Icon size={16} strokeWidth={2.2} /></span>
          <span className={`whitespace-nowrap font-bold text-ink ${ur ? cls('sm') : 'text-[13px]'}`}>{pick(j.label)}</span>
        </Link>
      ))}
      {help}
    </div>
  )
}

function greeting(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function fmt(v: string | number | null | undefined): string {
  return Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Chevron({ className = '' }: { className?: string }) {
  const { ur } = useLang()
  const C = ur ? ChevronLeft : ChevronRight
  return <C size={18} strokeWidth={2.4} className={className} />
}

/** a section's title, with "See all ›" when the section has its own screen */
function SectionTitle({ text, to, help }: { text: string; to?: string; help?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1"><BiLabel text={text} size="lg" bold />{help ? <Help term={help} size="sm" /> : null}</span>
      {to ? (
        <Link to={to} className={`tap inline-flex shrink-0 items-center gap-0.5 font-bold text-emerald ${ur ? cls('sm') : 'text-[13px]'}`}>
          {pick('home.seeAll')}<Chevron />
        </Link>
      ) : null}
    </div>
  )
}





function Attention({ to, icon, n, text, help }: { to: string; icon: ReactNode; n: number; text: string; help?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <Link to={to} className="tap flex items-center gap-3 rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3">
      <span className="well h-9 w-9 rounded-xl bg-[#F59E0B]/20 text-[#D97706]">{icon}</span>
      <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}><span className="num">{n}</span> {pick(text)}</span>
      {help ? <Help term={help} size="sm" /> : null}
      <AlertTriangle size={16} className="shrink-0 text-[#D97706]" />
      <Chevron className="shrink-0 text-muted" />
    </Link>
  )
}
