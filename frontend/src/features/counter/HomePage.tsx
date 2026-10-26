/** Home, "Dukaan counter" (docs/11 v2): search, one coloured tile per job, and the owner's everyday
 *  questions answered in place — any day's sale / udhaar / cash, who owes whom, and stock worth. */

import { ScanLine, Search, ShieldAlert, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { MoneyText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { isoDay, toLakh } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { DayReport } from '@/lib/types'
import DayPicker from './DayPicker'
import { JOBS } from './jobs'

interface Dash {
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; repairs_open: number
}

export default function HomePage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const manager = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [q, setQ] = useState('')
  const [day, setDay] = useState(isoDay(0))
  const { data: dash } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const { data: rep } = useGet<DayReport>(['day', day], `/api/v1/reports/day?date=${day}`)
  const worth = dash ? dash.stock_value_cost ?? dash.stock_value_asking : null
  const cash = rep ? Object.values(rep.received).reduce((s, v) => s + Number(v), 0) : 0
  const [big, small] = [JOBS.slice(0, 2), JOBS.slice(2)]

  function search(e: FormEvent) {
    e.preventDefault()
    nav(`/stock?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface pe-1.5 ps-4">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick('common.search')} placeholder={pick('counter.search')} className={`min-w-0 flex-1 bg-transparent font-medium text-ink placeholder:text-muted/70 focus:outline-none ${ur ? 'ur text-[15px]' : ''}`} />
        <button type="submit" aria-label={pick('common.search')} className="well tap h-11 w-11 bg-ink text-ground">
          <ScanLine size={20} strokeWidth={1.75} />
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {big.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[88px] items-center gap-3 rounded-3xl p-3 ${j.tone}`}>
            <span className={`well h-12 w-12 shrink-0 bg-surface ${j.ink}`}><j.Icon size={24} strokeWidth={1.9} /></span>
            <span className="flex min-w-0 flex-col">
              <BiLabel text={j.label} size="lg" bold tone="text-current" />
              {j.hint ? <BiLabel text={j.hint} size="sm" tone="text-current opacity-80" /> : null}
            </span>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5 lg:hidden">
        {small.map((j) => (
          <Link key={j.id} to={j.to} className={`tap flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 ${j.tone}`}>
            <j.Icon size={24} strokeWidth={1.9} />
            <span className={`font-bold leading-tight ${ur ? cls('sm') : 'text-[12px]'}`}>{pick(j.label)}</span>
          </Link>
        ))}
      </div>

      <section className="card flex flex-col gap-1">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <BiLabel text="counter.hisaab" size="md" bold />
          <DayPicker value={day} onChange={setDay} size="sm" />
        </div>
        <Line label={<span>{pick('counter.sold')} <span className="text-muted">(<span className="num">{rep?.phones_sold ?? 0}</span> {pick('counter.phones')})</span></span>} value={<MoneyText value={rep?.sales_total} tone="ink" size="lg" />} />
        <Line label={pick('counter.udhaarGiven')} value={<span className="num text-xl text-receivable" dir="ltr">{fmt(rep?.udhaar_given)}</span>} />
        <Line label={pick('counter.cashIn')} value={<span className="num text-xl text-emerald" dir="ltr">{fmt(cash)}</span>} />
        <div className={`flex flex-wrap justify-between gap-2 pt-1 font-bold text-emerald ${ur ? cls('sm') : 'text-sm'}`}>
          <Link to={`/hisaab?date=${day}`}>{pick('counter.seeFull')}</Link>
          {manager ? <Link to="/reports">{pick('counter.reportTitle')}</Link> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/khata?f=get" className="tap flex flex-col rounded-3xl bg-khata px-4 py-3 text-khata-fg">
          <BiLabel text="counter.toGet" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr">{fmt(dash?.receivable)}</span>
        </Link>
        <Link to="/khata?f=give" className="tap flex flex-col rounded-3xl bg-expense px-4 py-3 text-expense-fg">
          <BiLabel text="counter.toGive" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr">{fmt(dash?.payable)}</span>
        </Link>
      </div>

      <Link to="/stock/summary" className="tap flex items-center gap-3 rounded-3xl bg-stockt px-4 py-3 text-stockt-fg">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`font-bold ${ur ? cls('sm') : 'text-sm'}`}>{pick('counter.stockWorth')} · <span className="num">{dash?.stock_count ?? 0}</span> {pick('counter.phones')}</span>
          {worth && Number(worth) >= 100_000 ? <span className={`opacity-80 ${ur ? cls('sm') : 'text-xs font-semibold'}`}><span className="num">{toLakh(worth)}</span> {pick('counter.lakh')}</span> : null}
        </span>
        <span className="num text-2xl" dir="ltr">{fmt(worth)}</span>
      </Link>

      {dash && (dash.pending_verification > 0 || dash.repairs_open > 0) ? (
        <section className="flex flex-col gap-2">
          <BiLabel text="counter.attention" size="sm" bold tone="text-muted" />
          {dash.pending_verification > 0 ? (
            <Attention to="/stock" icon={<ShieldAlert size={18} />} n={dash.pending_verification} text="counter.pendingCheck" />
          ) : null}
          {dash.repairs_open > 0 ? <Attention to="/repairs" icon={<Wrench size={18} />} n={dash.repairs_open} text="counter.openRepairs" /> : null}
        </section>
      ) : null}
    </div>
  )
}

function fmt(v: string | number | null | undefined): string {
  return Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function Line({ label, value }: { label: ReactNode; value: ReactNode }) {
  const { ur, cls } = useLang()
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/70 py-1.5 first-of-type:border-0">
      <span className={ur ? cls('md') : 'text-[15px] font-semibold'}>{label}</span>
      {value}
    </div>
  )
}

function Attention({ to, icon, n, text }: { to: string; icon: ReactNode; n: number; text: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <Link to={to} className="tap flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="text-receivable">{icon}</span>
      <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}><span className="num">{n}</span> {pick(text)}</span>
    </Link>
  )
}
