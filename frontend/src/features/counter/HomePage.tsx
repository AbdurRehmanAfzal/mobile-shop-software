/** Home, "Dukaan counter" (docs/11 v2). Search, the two main jobs, then (owner 2026-10-28, after 20
 *  testers called it "basic") a modern dashboard: a greeting, the other jobs with their own colours,
 *  the period's business in one hero card with a 7-day chart, the udhaar khata, stock worth and
 *  reports. Every card that opens something still says "See details ›" (owner: users did not know
 *  the cards could be tapped). */

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, HandCoins, Landmark, PiggyBank, Receipt, ScanLine, Search, ShieldAlert, Smartphone, Tag, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { ScanButton } from '@/components/ScanButton'
import { BtnText } from '@/components/ui'
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

interface Dash {
  cash_in_hand?: string
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; repairs_open: number; low_stock_items?: number; installments_due_today?: number; installments_overdue?: number
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
        <span className={ur ? cls('lg') + ' font-bold' : 'text-[22px] font-extrabold leading-tight tracking-[-0.02em]'}>
          {pick(`home.greet.${greeting()}`)}{firstName ? `${ur ? '، ' : ', '}${firstName}` : ''}
        </span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick('home.sub')}</span>
      </div>

      <form onSubmit={search} className="-mt-1 flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface pe-1.5 ps-4 shadow-[0_8px_24px_-18px_rgba(27,31,36,.35)]">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick('common.search')} placeholder={pick('counter.search')} className={`min-w-0 flex-1 bg-transparent font-medium text-ink placeholder:text-muted/70 focus:outline-none ${ur ? 'ur text-[15px]' : ''}`} />
        <ScanButton size="sm" onImei={(imei) => nav(`/stock?q=${imei}`)} />
        <button type="submit" aria-label={pick('common.search')} className="tap flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-ink px-1.5 py-1 text-ground">
          <ScanLine size={20} strokeWidth={1.75} />
          <BtnText k="common.search" />
        </button>
      </form>

      {/* fast actions first (owner's user test): sell, add stock, then the rest */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {big.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[92px] items-center gap-3 rounded-3xl p-3 max-[360px]:flex-col max-[360px]:items-start ${j.tone}`}>
            <span className={`well h-12 w-12 shrink-0 bg-surface ${j.ink}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-col">
              <BiLabel text={j.label} size="lg" bold tone="text-current" />
              {j.hint ? <BiLabel text={j.hint} size="sm" tone="text-current opacity-80" /> : null}
            </span>
            <Chevron className="ms-auto shrink-0 opacity-80" />
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 lg:hidden" data-testid="fast-actions">
        {small.map((j) => (
          <Link key={j.id} to={j.to} className="tap flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-2 pe-4 ps-2">
            <span className={`well h-8 w-8 rounded-full ${ACCENT[j.id] ?? j.tone}`}><j.Icon size={16} strokeWidth={2.2} /></span>
            <span className={`whitespace-nowrap font-bold text-ink ${ur ? cls('sm') : 'text-[13px]'}`}>{pick(j.label)}</span>
          </Link>
        ))}
      </div>

      {/* at a glance: the period's numbers and two charts (owner / manager) */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle text="home.glance" to={manager && has('reports') ? `/audit?${glanceQuery}` : hisaab} />
        <PeriodPicker value={period} onChange={setPeriod} size="sm" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="glance">
          <Glance to={hisaab} icon={<Tag size={16} />} tone="bg-sell text-sell-fg" label="home.sales" value={rep?.sales_total} sub={pick('home.phonesSold').replace('{{n}}', String(rep?.phones_sold ?? 0))} />
          {manager ? <Glance to={`/audit/finance?${glanceQuery}`} icon={<PiggyBank size={16} />} tone="bg-ink text-ground" label="home.profit" value={rep?.profit} neg={Number(rep?.profit ?? 0) < 0} sub={glance ? `${pick('audit.vsPrevious')} ${fmt(glance.previous.net_profit)}` : undefined} /> : null}
          <Glance to={hisaab} icon={<Wallet size={16} />} tone="bg-emerald-tint text-emerald-deep" label="counter.inHand" value={rep?.cash_net} neg={cashNeg} sub={glance ? `${pick('audit.moneyIn')} ${fmt(glance.money.inflows)} · ${pick('audit.moneyOut')} ${fmt(glance.money.outflows)}` : undefined} />
          <Glance to="/more/cash" icon={<Landmark size={16} />} tone="bg-khata text-khata-fg" label="audit.cashBank" value={dash?.cash_in_hand} neg={Number(dash?.cash_in_hand ?? 0) < 0} sub={pick('audit.now')} />
          <Glance to="/khata?f=get" icon={<ArrowDownLeft size={16} />} tone="bg-receivable-tint text-receivable" label="counter.toGet" value={dash?.receivable} sub={glance ? `${pick('audit.receivedInPeriod')} ${fmt(glance.debt.received_in_period)}` : undefined} />
          <Glance to="/khata?f=give" icon={<ArrowUpRight size={16} />} tone="bg-payable-tint text-payable" label="counter.toGive" value={dash?.payable} />
          <Glance to="/stock/summary" icon={<Smartphone size={16} />} tone="bg-stockt text-stockt-fg" label="home.inStock" value={dash?.stock_count} plain sub={worth ? `${pick('home.worth')} ${fmt(worth)}` : undefined} />
          <Glance to="/expenses" icon={<Receipt size={16} />} tone="bg-expense text-expense-fg" label="home.expenses" value={rep?.expenses} />
        </div>
        {dash?.sales_7d ? (
          <div className="grid gap-2.5 lg:grid-cols-2">
            <div className="card" data-testid="home-bars">
              <BiLabel text="home.week" size="sm" tone="text-muted" bold />
              <Bars data={dash.sales_7d.map((d) => ({ label: new Date(`${d.date}T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' }), value: Number(d.total), key: d.date }))} onTap={(b) => nav(`/hisaab?from=${String(b.key)}&to=${String(b.key)}`)} height={120} empty="audit.noData" />
            </div>
            <div className="card" data-testid="home-donut">
              <BiLabel text="home.moneySplit" size="sm" tone="text-muted" bold />
              <Donut size={104} data={[{ label: pick('audit.cashBank'), value: Math.max(0, Number(dash.cash_in_hand ?? 0)), key: 'cash' }, { label: pick('counter.toGet'), value: Number(dash.receivable ?? 0), key: 'get' }, { label: pick('counter.toGive'), value: Number(dash.payable ?? 0), key: 'give' }, { label: pick('home.worth'), value: Number(worth ?? 0), key: 'stock' }]} onTap={(s) => nav(s.key === 'cash' ? '/more/cash' : s.key === 'get' ? '/khata?f=get' : s.key === 'give' ? '/khata?f=give' : '/stock/summary')} empty="audit.noData" />
            </div>
          </div>
        ) : null}
      </section>

      <HazriCard />
      {ai?.configured ? (
        <Link to="/assistant" className="card tap flex items-center gap-3">
          <span className="well h-11 w-11 shrink-0 rounded-2xl bg-hero text-hero-text"><Bot size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <BiLabel text="ai.homeTitle" size="md" bold />
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('ai.homeHint')}</span>
          </span>
          <Chevron className="shrink-0" />
        </Link>
      ) : null}

      {manager && has('reports') ? (
        <Link to="/reports" className="tap relative isolate flex items-center gap-3 overflow-hidden rounded-3xl bg-sell p-4 text-sell-fg">
          <span aria-hidden className="pointer-events-none absolute -end-10 -top-12 -z-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
          <span className="well h-11 w-11 shrink-0 rounded-2xl bg-surface text-sell-icon"><TrendingUp size={22} strokeWidth={2} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <BiLabel text="counter.reportTitle" size="md" bold tone="text-current" />
            <span className={`opacity-85 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('counter.reportHint')}</span>
          </span>
          <Chevron className="shrink-0" />
        </Link>
      ) : null}

      {dash && (dash.pending_verification > 0 || dash.repairs_open > 0 || (dash.low_stock_items ?? 0) > 0 || (dash.installments_due_today ?? 0) > 0 || (dash.installments_overdue ?? 0) > 0) ? (
        <section className="flex flex-col gap-2">
          <SectionTitle text="counter.attention" />
          {dash.pending_verification > 0 ? <Attention to="/stock" icon={<ShieldAlert size={18} />} n={dash.pending_verification} text="counter.pendingCheck" /> : null}
          {dash.repairs_open > 0 && has('repairs') ? <Attention to="/repairs" icon={<Wrench size={18} />} n={dash.repairs_open} text="counter.openRepairs" /> : null}
          {(dash.installments_overdue ?? 0) > 0 && has('installments') ? <Attention to="/installments?view=overdue" icon={<HandCoins size={18} />} n={dash.installments_overdue!} text="counter.instOverdue" /> : null}
          {(dash.installments_due_today ?? 0) > 0 && has('installments') ? <Attention to="/installments?view=today" icon={<HandCoins size={18} />} n={dash.installments_due_today!} text="counter.instToday" /> : null}
          {(dash.low_stock_items ?? 0) > 0 && has('accessories') ? <Attention to="/accessories?tab=low" icon={<Boxes size={18} />} n={dash.low_stock_items!} text="counter.lowStock" /> : null}
        </section>
      ) : null}
    </div>
  )
}

interface Glance { previous: { net_profit: string | null }; money: { inflows: string; outflows: string }; debt: { received_in_period: string } }

/** one number people check every day: label, value, a line under it, opens its screen */
function Glance({ to, icon, tone, label, value, sub, neg = false, plain = false }: { to: string; icon: ReactNode; tone: string; label: string; value: string | number | null | undefined; sub?: string; neg?: boolean; plain?: boolean }) {
  const { ur, cls } = useLang()
  return (
    <Link to={to} className="card tap flex min-w-0 flex-col gap-1.5 !p-3">
      <span className="flex items-center gap-2"><span className={`well h-7 w-7 shrink-0 rounded-lg ${tone}`}>{icon}</span><BiLabel text={label} size="sm" tone="text-muted" bold className="min-w-0 truncate" /></span>
      <span className={`num truncate text-[22px] leading-none ${neg ? 'text-payable' : 'text-ink'}`} dir="ltr">{neg ? '−' : ''}{plain ? String(value ?? 0) : fmt(value)}</span>
      {sub ? <span className={`truncate text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{sub}</span> : null}
    </Link>
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
function SectionTitle({ text, to }: { text: string; to?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="flex items-center justify-between gap-3">
      <BiLabel text={text} size="lg" bold />
      {to ? (
        <Link to={to} className={`tap inline-flex shrink-0 items-center gap-0.5 font-bold text-emerald ${ur ? cls('sm') : 'text-[13px]'}`}>
          {pick('home.seeAll')}<Chevron />
        </Link>
      ) : null}
    </div>
  )
}





function Attention({ to, icon, n, text }: { to: string; icon: ReactNode; n: number; text: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <Link to={to} className="tap flex items-center gap-3 rounded-2xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3">
      <span className="well h-9 w-9 rounded-xl bg-[#F59E0B]/20 text-[#D97706]">{icon}</span>
      <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}><span className="num">{n}</span> {pick(text)}</span>
      <AlertTriangle size={16} className="shrink-0 text-[#D97706]" />
      <Chevron className="shrink-0 text-muted" />
    </Link>
  )
}
