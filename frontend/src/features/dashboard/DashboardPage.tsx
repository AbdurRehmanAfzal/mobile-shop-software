import { ArrowDown, ArrowLeftRight, ArrowUp, Download, HandCoins, Receipt, RotateCcw, ShieldAlert, Smartphone, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { BiLabel } from '@/components/Bilingual'
import { Row } from '@/components/ui'

interface Dash {
  sales_count: number; sales_total: string; received_today: string; profit_today: string | null; cash_in_hand: string
  receivable: string; payable: string; stock_count: number; stock_value_cost: string | null; stock_value_asking: string
  pending_verification: number; loans_out: number; repairs_open: number
}

function Tile({ labelKey, value, tone = 'text-ink', icon, to }: { labelKey: string; value: string; tone?: string; icon: ReactNode; to?: string }) {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => to && nav(to)} className="card tap flex flex-col gap-1.5 text-start">
      <div className="flex items-center justify-between gap-2">
        <BiLabel text={labelKey} size="sm" tone="text-muted" />
        {icon}
      </div>
      <div className={`num text-[22px] ${tone}`} dir="ltr">{value}</div>
    </button>
  )
}

function Action({ to, labelKey, icon, primary = false }: { to: string; labelKey: string; icon: ReactNode; primary?: boolean }) {
  const cls = primary ? 'bg-emerald text-white shadow-cta' : 'border border-line bg-surface text-ink'
  return (
    <Link to={to} className={`tap flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 ${cls}`}>
      {icon}
      <BiLabel text={labelKey} size="sm" align="center" tone={primary ? 'text-white' : 'text-ink'} />
    </Link>
  )
}

export default function DashboardPage() {
  const me = useAuth((s) => s.me)
  const nav = useNavigate()
  const { data: d } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const n = (v: string | null | undefined) => Number(v ?? 0).toLocaleString('en-US')

  return (
    <div className="flex flex-col gap-4">
      <section className="hero flex flex-col gap-3.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <BiLabel text="dashboard.todaySales" size="lg" tone="text-gold-text" bold />
          <span className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold-text" dir="auto">{me?.user.name}</span>
        </div>
        <div className="num text-[38px] leading-none" dir="ltr">{formatMoney(d?.sales_total ?? 0)}</div>
        <div className="grid grid-cols-3 gap-2.5">
          {([['dashboard.sales', String(d?.sales_count ?? 0), ''], ['dashboard.cashIn', n(d?.received_today), ''], ['dashboard.profit', d?.profit_today != null ? n(d.profit_today) : '—', 'text-gold-text']] as const).map(([k, v, cls]) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <BiLabel text={k} size="sm" tone="text-hero-text/75" />
              <span className={`num text-lg ${cls}`} dir="ltr">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Tile labelKey="dashboard.receivable" value={formatMoney(d?.receivable ?? 0)} tone="text-receivable" icon={<ArrowUp size={18} className="shrink-0 text-receivable" />} to="/parties" />
        <Tile labelKey="dashboard.payable" value={formatMoney(d?.payable ?? 0)} tone="text-payable" icon={<ArrowDown size={18} className="shrink-0 text-payable" />} to="/parties" />
        <Tile labelKey="dashboard.cashInHand" value={formatMoney(d?.cash_in_hand ?? 0)} icon={<HandCoins size={18} className="shrink-0 text-emerald" />} to="/expenses" />
        <Tile labelKey="dashboard.inStock" value={String(d?.stock_count ?? 0)} icon={<Smartphone size={18} className="shrink-0 text-emerald" />} to="/stock" />
      </section>

      <section className="flex flex-col gap-2.5">
        <BiLabel text="dashboard.quickActions" size="md" bold />
        <div className="grid grid-cols-4 gap-2.5">
          <Action to="/sale/new" labelKey="dashboard.newSale" icon={<Receipt size={24} strokeWidth={1.75} />} primary />
          <Action to="/purchase/new" labelKey="dashboard.newPurchase" icon={<Download size={24} strokeWidth={1.75} />} />
          <Action to="/repairs/new" labelKey="dashboard.repair" icon={<Wrench size={24} strokeWidth={1.75} />} />
          <Action to="/exchange/new" labelKey="more.exchange" icon={<ArrowLeftRight size={24} strokeWidth={1.75} />} />
        </div>
      </section>

      {d && (d.pending_verification || d.loans_out || d.repairs_open) ? (
        <section className="card p-0">
          {d.pending_verification ? <Row icon={<ShieldAlert size={18} />} title={<BiLabel text="stock.verification.pending" size="md" bold />} sub={<span dir="ltr">{d.pending_verification}</span>} onClick={() => nav('/stock')} /> : null}
          {d.repairs_open ? <Row icon={<Wrench size={18} />} title={<BiLabel text="dashboard.repairs" size="md" bold />} sub={<span dir="ltr">{d.repairs_open}</span>} onClick={() => nav('/repairs')} /> : null}
          {d.loans_out ? <Row icon={<RotateCcw size={18} />} title={<BiLabel text="loan.out" size="md" bold />} sub={<span dir="ltr">{d.loans_out}</span>} onClick={() => nav('/loans')} /> : null}
        </section>
      ) : null}
    </div>
  )
}
