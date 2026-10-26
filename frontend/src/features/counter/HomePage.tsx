/** Home, "Dukaan counter" (docs/11 v2): search, the two main jobs, the other jobs as an app grid,
 *  then the owner's everyday answers as cards — any day's hisaab, udhaar khata, stock worth, profit.
 *  Every card that opens something says so with a "See details ›" pill (owner: users did not know
 *  the cards could be tapped). */

import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, ScanLine, Search, ShieldAlert, Smartphone, TrendingUp, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { BtnText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { toLakh } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { DayReport } from '@/lib/types'
import PeriodPicker, { periodOf, periodQuery, type Period } from './PeriodPicker'
import { JOBS } from './jobs'

interface Dash {
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; repairs_open: number
}

export default function HomePage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const palette = useTheme((s) => s.palette)
  const manager = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<Period>(periodOf('today'))
  const { data: dash } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const { data: rep } = useGet<DayReport>(['day', period.from, period.to], `/api/v1/reports/day?${periodQuery(period)}`)
  const worth = dash ? dash.stock_value_cost ?? dash.stock_value_asking : null
  const [big, small] = [JOBS.slice(0, 2), JOBS.slice(2)]
  const small_ = ur ? cls('sm') : 'text-sm font-semibold'

  function search(e: FormEvent) {
    e.preventDefault()
    nav(`/stock?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface pe-1.5 ps-4 shadow-[0_8px_24px_-18px_rgba(27,31,36,.35)]">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick('common.search')} placeholder={pick('counter.search')} className={`min-w-0 flex-1 bg-transparent font-medium text-ink placeholder:text-muted/70 focus:outline-none ${ur ? 'ur text-[15px]' : ''}`} />
        <button type="submit" aria-label={pick('common.search')} className="tap flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-ink px-1.5 py-1 text-ground">
          <ScanLine size={20} strokeWidth={1.75} />
          <BtnText k="common.search" />
        </button>
      </form>

      {/* main jobs */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {big.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[92px] items-center gap-3 rounded-3xl p-3 ${j.tone}`}>
            <span className={`well h-12 w-12 shrink-0 bg-surface ${j.ink}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-col">
              <BiLabel text={j.label} size="lg" bold tone="text-current" />
              {j.hint ? <BiLabel text={j.hint} size="sm" tone="text-current opacity-80" /> : null}
            </span>
          </Link>
        ))}
      </div>

      {/* other jobs, app-grid style: colour only in the icon well */}
      <div className="card grid grid-cols-5 gap-1 p-2 lg:hidden">
        {small.map((j) => (
          <Link key={j.id} to={j.to} className="tap flex flex-col items-center gap-1.5 rounded-2xl px-0.5 py-2">
            <span className={`well h-12 w-12 ${j.tone}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className={`text-center font-bold leading-tight text-ink ${ur ? cls('sm') : 'text-[12px]'}`}>{pick(j.label)}</span>
          </Link>
        ))}
      </div>

      {/* hisaab for today, yesterday, a week, this month or from-to */}
      <section className="flex flex-col gap-2">
        <BiLabel text="counter.hisaab" size="lg" bold />
        <PeriodPicker value={period} onChange={setPeriod} size="sm" />
        <Link to={`/hisaab?from=${period.from}&to=${period.to}`} className="tap flex flex-col gap-3 rounded-3xl bg-hero p-5 text-hero-text shadow-hero">
          <div className="flex items-end justify-between gap-3">
            <span className="flex flex-col">
              <span className={`opacity-75 ${small_}`}>{pick('counter.sold')} · <span className="num">{rep?.phones_sold ?? 0}</span> {pick('counter.phones')}</span>
              <span className="num text-[34px] leading-tight" dir="ltr">Rs. {fmt(rep?.sales_total)}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-2xl bg-white/10 px-3 py-2">
              <span className={`opacity-75 ${small_}`}>{pick('counter.udhaarGiven')}</span>
              <span className="num text-xl text-[#F3C96B]" dir="ltr">{fmt(rep?.udhaar_given)}</span>
            </div>
            <div className="flex flex-col rounded-2xl bg-white/10 px-3 py-2">
              <span className={`opacity-75 ${small_}`}>{pick('counter.inHand')}</span>
              <span className={`num text-xl ${Number(rep?.cash_net ?? 0) < 0 ? 'text-[#F28B82]' : 'text-[#8FE3B4]'}`} dir="ltr">{Number(rep?.cash_net ?? 0) < 0 ? '−' : ''}{fmt(rep?.cash_net)}</span>
            </div>
          </div>
          <SeeMore light />
        </Link>
      </section>

      {/* udhaar khata */}
      <section className="flex flex-col gap-2">
        <BiLabel text="counter.khataTitle" size="lg" bold />
        <div className="grid grid-cols-2 gap-2.5">
          <Link to="/khata?f=get" className="tap flex flex-col gap-2 rounded-3xl bg-khata p-4 text-khata-fg">
            <span className="well h-10 w-10 bg-surface"><ArrowDownLeft size={20} strokeWidth={2} /></span>
            <BiLabel text="counter.toGet" size="sm" bold tone="text-current" />
            <span className="num text-2xl leading-none text-receivable" dir="ltr">{fmt(dash?.receivable)}</span>
            <SeeMore />
          </Link>
          <Link to="/khata?f=give" className="tap flex flex-col gap-2 rounded-3xl bg-expense p-4 text-expense-fg">
            <span className="well h-10 w-10 bg-surface"><ArrowUpRight size={20} strokeWidth={2} /></span>
            <BiLabel text="counter.toGive" size="sm" bold tone="text-current" />
            <span className="num text-2xl leading-none text-payable" dir="ltr">{fmt(dash?.payable)}</span>
            <SeeMore />
          </Link>
        </div>
      </section>

      {/* stock worth and profit */}
      <InfoCard
        to="/stock/summary"
        tone="bg-stockt text-stockt-fg"
        iconCls="text-stockt-icon"
        icon={<Smartphone size={22} strokeWidth={1.9} />}
        title={<>{pick('counter.stockWorth')} · <span className="num">{dash?.stock_count ?? 0}</span> {pick('counter.phones')}</>}
        sub={worth && Number(worth) >= 100_000 ? <><span className="num">{toLakh(worth)}</span> {pick('counter.lakh')}</> : pick('counter.stockHint')}
        value={<span className="num text-2xl" dir="ltr">{fmt(worth)}</span>}
      />
      {manager ? (
        <InfoCard
          to="/reports"
          tone="bg-sell text-sell-fg"
          iconCls="text-sell-icon"
          solid={palette !== 'colorful'}
          icon={<TrendingUp size={22} strokeWidth={1.9} />}
          title={pick('counter.reportTitle')}
          sub={pick('counter.reportHint')}
        />
      ) : null}

      {dash && (dash.pending_verification > 0 || dash.repairs_open > 0) ? (
        <section className="flex flex-col gap-2">
          <BiLabel text="counter.attention" size="lg" bold />
          {dash.pending_verification > 0 ? <Attention to="/stock" icon={<ShieldAlert size={18} />} n={dash.pending_verification} text="counter.pendingCheck" /> : null}
          {dash.repairs_open > 0 ? <Attention to="/repairs" icon={<Wrench size={18} />} n={dash.repairs_open} text="counter.openRepairs" /> : null}
        </section>
      ) : null}
    </div>
  )
}

function fmt(v: string | number | null | undefined): string {
  return Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** "See details ›": tells a non-technical user the card opens something. */
function SeeMore({ light = false }: { light?: boolean }) {
  const { pick, ur, cls } = useLang()
  const Chev = ur ? ChevronLeft : ChevronRight
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-3 py-1.5 font-bold ${light ? 'bg-white/15 text-white' : 'bg-surface/80 text-current'} ${ur ? cls('sm') : 'text-[13px]'}`}>
      {pick('counter.seeMore')}
      <Chev size={16} strokeWidth={2.4} />
    </span>
  )
}

/** `iconCls` colours the icon in its white well; `solid` cards (strong colour behind white text) get
 *  the light "See details" pill, so nothing turns white-on-white in any look. */
function InfoCard({ to, tone, icon, title, sub, value, iconCls = 'text-current', solid = false }: { to: string; tone: string; icon: ReactNode; title: ReactNode; sub: ReactNode; value?: ReactNode; iconCls?: string; solid?: boolean }) {
  const { ur, cls } = useLang()
  return (
    <Link to={to} className={`tap flex flex-col gap-3 rounded-3xl p-4 ${tone}`}>
      <div className="flex items-center gap-3">
        <span className={`well h-11 w-11 shrink-0 bg-surface ${iconCls}`}>{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{title}</span>
          <span className={`opacity-80 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span>
        </span>
        {value}
      </div>
      <SeeMore light={solid} />
    </Link>
  )
}

function Attention({ to, icon, n, text }: { to: string; icon: ReactNode; n: number; text: string }) {
  const { pick, ur, cls } = useLang()
  const Chev = ur ? ChevronLeft : ChevronRight
  return (
    <Link to={to} className="tap flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="well h-9 w-9 bg-khata text-khata-fg">{icon}</span>
      <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}><span className="num">{n}</span> {pick(text)}</span>
      <span className={`inline-flex items-center gap-0.5 font-bold text-emerald ${ur ? cls('sm') : 'text-[13px]'}`}>{pick('counter.seeMore')}<Chev size={16} /></span>
    </Link>
  )
}
