/** Home, "Dukaan counter" (docs/11 v2). Search, the two main jobs, then (owner 2026-10-28, after 20
 *  testers called it "basic") a modern dashboard: a greeting, the other jobs with their own colours,
 *  the period's business in one hero card with a 7-day chart, the udhaar khata, stock worth and
 *  reports. Every card that opens something still says "See details ›" (owner: users did not know
 *  the cards could be tapped). */

import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, HandCoins, PiggyBank, Receipt, ScanLine, Search, ShieldAlert, Smartphone, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { ScanButton } from '@/components/ScanButton'
import { BtnText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { toLakh } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { DayReport } from '@/lib/types'
import HazriCard from './HazriCard'
import PeriodPicker, { periodOf, periodQuery, type Period } from './PeriodPicker'
import { JOBS, type Job } from './jobs'
import { useModules } from '@/lib/modules'

interface Dash {
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
  const stats = [
    { icon: <Wallet size={16} />, label: 'counter.inHand', value: rep?.cash_net, tone: cashNeg ? 'text-[#FCA5A5]' : 'text-[#86EFAC]', neg: cashNeg },
    { icon: <HandCoins size={16} />, label: 'counter.udhaarGiven', value: rep?.udhaar_given, tone: 'text-[#FCD34D]' },
    ...(manager && rep?.profit != null ? [{ icon: <PiggyBank size={16} />, label: 'home.profit', value: rep.profit, tone: 'text-white', neg: Number(rep.profit) < 0 }] : []),
    { icon: <Receipt size={16} />, label: 'home.expenses', value: rep?.expenses, tone: 'text-white' },
  ]

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

      <HazriCard />

      {/* main jobs */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {big.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[92px] items-center gap-3 rounded-3xl p-3 max-[360px]:flex-col max-[360px]:items-start ${j.tone}`}>
            <span className={`well h-12 w-12 shrink-0 bg-surface ${j.ink}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-col">
              <BiLabel text={j.label} size="lg" bold tone="text-current" />
              {j.hint ? <BiLabel text={j.hint} size="sm" tone="text-current opacity-80" /> : null}
            </span>
          </Link>
        ))}
      </div>

      {/* the other jobs: one colour each */}
      <section className="flex flex-col gap-2.5 lg:hidden">
        <SectionTitle text="home.otherJobs" />
        <div className="grid grid-cols-3 gap-2.5">
          {small.map((j) => (
            <Link key={j.id} to={j.to} className="card tap flex flex-col items-center gap-2 px-1 py-3.5">
              <span className={`well h-12 w-12 rounded-2xl ${ACCENT[j.id] ?? j.tone}`}><j.Icon size={23} strokeWidth={2} /></span>
              <span className={`text-center font-bold leading-tight text-ink ${ur ? cls('sm') : 'text-[13px]'}`}>{pick(j.label)}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      {/* the business of today, yesterday, a week, this month or from-to */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle text="counter.hisaab" to={hisaab} />
        <PeriodPicker value={period} onChange={setPeriod} size="sm" />
        {/* a tap anywhere opens the hisaab; the chart's bars only show their day */}
        <div role="link" tabIndex={0} onClick={() => nav(hisaab)} onKeyDown={(e) => { if (e.key === 'Enter') nav(hisaab) }} className="tap relative isolate cursor-pointer flex flex-col gap-4 overflow-hidden rounded-3xl bg-hero p-5 text-hero-text shadow-hero">
          {/* soft light in the corner: depth without noise */}
          <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 -z-10 h-56 w-56 rounded-full bg-emerald/45 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -start-10 -z-10 h-48 w-48 rounded-full bg-white/[0.06] blur-2xl" />
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 flex-col">
              <span className={`opacity-75 ${ur ? cls('sm') : 'text-[13px] font-semibold'}`}>{pick('home.sales')}</span>
              <span className="num whitespace-nowrap text-[34px] leading-tight max-[379px]:text-[26px]" dir="ltr">Rs. {fmt(rep?.sales_total)}</span>
            </span>
            <span className={`mt-1 shrink-0 rounded-full bg-white/[0.12] px-3 py-1 ${ur ? cls('sm') : 'text-xs font-bold'}`}>
              {pick('home.phonesSold').replace('{{n}}', String(rep?.phones_sold ?? 0))}
            </span>
          </div>

          {dash?.sales_7d ? <WeekBars days={dash.sales_7d} /> : null}

          <div className="grid grid-cols-2 gap-2">
            {stats.map((st, i) => <Stat key={st.label} {...st} wide={stats.length % 2 === 1 && i === stats.length - 1} />)}
          </div>
          <SeeMore light />
        </div>
      </section>

      <div className="flex flex-col gap-5">
      {/* udhaar khata */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle text="counter.khataTitle" to="/khata" />
        <div className="grid grid-cols-2 gap-2.5">
          <KhataCard to="/khata?f=get" icon={<ArrowDownLeft size={20} strokeWidth={2.2} />} well="bg-receivable-tint text-receivable" label="counter.toGet" value={dash?.receivable} tone="text-receivable" />
          <KhataCard to="/khata?f=give" icon={<ArrowUpRight size={20} strokeWidth={2.2} />} well="bg-payable-tint text-payable" label="counter.toGive" value={dash?.payable} tone="text-payable" />
        </div>
      </section>

      {/* stock worth */}
      <Link to="/stock/summary" className="card tap flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="well h-11 w-11 shrink-0 rounded-2xl bg-[#3B82F6]/15 text-[#3B82F6]"><Smartphone size={22} strokeWidth={1.9} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <BiLabel text="counter.stockWorth" size="md" bold />
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('counter.stockHint')}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col rounded-2xl bg-ground px-3 py-2.5">
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('home.inStock')}</span>
            <span className="num text-2xl max-[379px]:text-xl" dir="ltr">{dash?.stock_count ?? 0}</span>
          </div>
          <div className="flex min-w-0 flex-col rounded-2xl bg-ground px-3 py-2.5">
            <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
              {pick('home.worth')}{worth && Number(worth) >= 100_000 ? <> · <span className="num">{toLakh(worth)}</span> {pick('counter.lakh')}</> : null}
            </span>
            <span className="num text-2xl max-[379px]:text-lg" dir="ltr">{fmt(worth)}</span>
          </div>
        </div>
        <SeeMore />
      </Link>

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
      </div>
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

/** "See details ›": tells a non-technical user the card opens something. */
function SeeMore({ light = false }: { light?: boolean }) {
  const { pick, ur, cls } = useLang()
  return (
    <span className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 font-bold ${light ? 'bg-white/15 text-white' : 'bg-emerald-tint text-emerald-deep'} ${ur ? cls('sm') : 'text-[13px]'}`}>
      {pick('counter.seeMore')}
      <Chevron />
    </span>
  )
}

/** one figure on the dark card: label, then the amount in its meaning's colour */
function Stat({ icon, label, value, tone, neg = false, wide = false }: { icon: ReactNode; label: string; value: string | null | undefined; tone: string; neg?: boolean; wide?: boolean }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className={`${wide ? 'col-span-2' : ''} flex min-w-0 flex-col gap-0.5 rounded-2xl bg-white/[0.08] px-3 py-2.5 ring-1 ring-inset ring-white/10`}>
      <span className={`flex items-center gap-1.5 opacity-75 ${ur ? cls('sm') : 'text-xs font-semibold'}`}><span className="shrink-0">{icon}</span><span className="leading-tight">{pick(label)}</span></span>
      <span className={`num truncate text-lg ${tone}`} dir="ltr">{neg ? '−' : ''}{fmt(value)}</span>
    </div>
  )
}

/** Last 7 days' sales as thin bars, today brightest; tap a bar to see its day and amount. One series,
 *  so no legend: the caption names it. */
function WeekBars({ days }: { days: { date: string; total: string }[] }) {
  const { pick, ur, cls } = useLang()
  const [picked, setPicked] = useState<number | null>(null)
  const max = Math.max(...days.map((d) => Number(d.total)), 0)
  const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' })
  const shown = picked ?? days.length - 1
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-baseline justify-between gap-2 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
        <span className="opacity-75">{pick('home.week')}</span>
        <span className="opacity-90">
          {dayName(days[shown].date)} · <span className="num" dir="ltr">Rs. {fmt(days[shown].total)}</span>
        </span>
      </div>
      <div className="flex h-16 items-end gap-2" dir="ltr" role="img" aria-label={`${pick('home.week')}: ${days.map((d) => `${dayName(d.date)} ${fmt(d.total)}`).join(', ')}`}>
        {days.map((d, i) => {
          const h = max > 0 ? Math.max(4, Math.round((Number(d.total) / max) * 64)) : 4
          const on = i === shown
          return (
            <button key={d.date} type="button" aria-label={`${dayName(d.date)} Rs. ${fmt(d.total)}`} onClick={(e) => { e.stopPropagation(); setPicked(i) }} className="flex h-full flex-1 items-end justify-center">
              <span className={`w-full max-w-7 rounded-t-[4px] transition-colors ${on ? 'bg-white' : 'bg-white/30'}`} style={{ height: h }} />
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 text-[10px] font-semibold opacity-60" dir="ltr">
        {days.map((d) => <span key={d.date} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-center text-[clamp(8px,2.6vw,10px)]">{dayName(d.date)}</span>)}
      </div>
    </div>
  )
}

function KhataCard({ to, icon, well, label, value, tone }: { to: string; icon: ReactNode; well: string; label: string; value: string | undefined; tone: string }) {
  return (
    <Link to={to} className="card tap flex min-w-0 flex-col gap-2.5 max-[379px]:p-3">
      <span className={`well h-10 w-10 rounded-2xl ${well}`}>{icon}</span>
      <BiLabel text={label} size="sm" bold tone="text-muted" />
      <span className={`num text-2xl leading-none max-[379px]:text-xl ${tone}`} dir="ltr">{fmt(value)}</span>
      <SeeMore />
    </Link>
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
