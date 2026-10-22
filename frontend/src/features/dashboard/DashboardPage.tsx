import { ArrowDown, ArrowUp, Download, Receipt, RotateCcw, Search, ShieldAlert, Smartphone, HandCoins } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useCashAccounts, useDevices, useLoans, useParties, useSales } from '@/lib/queries'
import { BiLabel } from '@/components/Bilingual'
import { Row } from '@/components/ui'

function Tile({ labelKey, value, tone = 'text-ink', icon, to }: { labelKey: string; value: string; tone?: string; icon: ReactNode; to?: string }) {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => to && nav(to)} className="card tap flex flex-col gap-1.5 text-start">
      <div className="flex items-center justify-between gap-2">
        <BiLabel text={labelKey} size="sm" tone="text-muted" />
        {icon}
      </div>
      <div className={`num text-[22px] ${tone}`} dir="ltr">
        {value}
      </div>
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

const today = () => new Date().toISOString().slice(0, 10)

export default function DashboardPage() {
  const me = useAuth((s) => s.me)
  const nav = useNavigate()
  const canSeeCost = me?.user.role === 'owner' || me?.user.role === 'manager'
  const { data: sales } = useSales({ date_from: today() })
  const { data: cash } = useCashAccounts()
  const { data: withBalance } = useParties({ with_balance: true })
  const { data: stock } = useDevices({ status: 'in_stock' })
  const { data: loans } = useLoans({ status: 'out' })

  const todayActive = (sales ?? []).filter((s) => s.status !== 'void')
  const todayTotal = todayActive.reduce((a, s) => a + Number(s.total), 0)
  const todayPaid = todayActive.reduce((a, s) => a + Number(s.paid), 0)
  const todayProfit = todayActive.reduce((a, s) => a + Number(s.profit ?? 0), 0)
  const cashTotal = (cash ?? []).reduce((a, c) => a + Number(c.balance), 0)
  const receivable = (withBalance ?? []).filter((p) => Number(p.balance) > 0).reduce((a, p) => a + Number(p.balance), 0)
  const payable = (withBalance ?? []).filter((p) => Number(p.balance) < 0).reduce((a, p) => a - Number(p.balance), 0)
  const stockValue = (stock ?? []).reduce((a, d) => a + Number(d.asking_price ?? 0), 0)
  const pendingVerification = (stock ?? []).filter((d) => d.verification_status === 'pending' || d.verification_status === 'flagged')

  return (
    <div className="flex flex-col gap-4">
      <section className="hero flex flex-col gap-3.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <BiLabel text="dashboard.todaySales" size="lg" tone="text-gold-text" bold />
          <span className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold-text" dir="auto">
            {me?.user.name}
          </span>
        </div>
        <div className="num text-[38px] leading-none" dir="ltr">
          {formatMoney(todayTotal)}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            ['dashboard.sales', String(todayActive.length), ''],
            ['dashboard.cashIn', Number(todayPaid).toLocaleString('en-US'), ''],
            ['dashboard.profit', canSeeCost ? Number(todayProfit).toLocaleString('en-US') : '—', 'text-gold-text'],
          ].map(([k, v, cls]) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <BiLabel text={k} size="sm" tone="text-hero-text/75" />
              <span className={`num text-lg ${cls}`} dir="ltr">
                {v}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Tile labelKey="dashboard.receivable" value={formatMoney(receivable)} tone="text-receivable" icon={<ArrowUp size={18} className="shrink-0 text-receivable" />} to="/parties" />
        <Tile labelKey="dashboard.payable" value={formatMoney(payable)} tone="text-payable" icon={<ArrowDown size={18} className="shrink-0 text-payable" />} to="/parties" />
        <Tile labelKey="dashboard.cashInHand" value={formatMoney(cashTotal)} icon={<HandCoins size={18} className="shrink-0 text-emerald" />} />
        <Tile labelKey="dashboard.inStock" value={`${stock?.length ?? 0}${canSeeCost && stockValue ? ` · ${Number(stockValue).toLocaleString('en-US')}` : ''}`} icon={<Smartphone size={18} className="shrink-0 text-emerald" />} to="/stock" />
      </section>

      <section className="flex flex-col gap-2.5">
        <BiLabel text="dashboard.quickActions" size="md" bold />
        <div className="grid grid-cols-4 gap-2.5">
          <Action to="/sale/new" labelKey="dashboard.newSale" icon={<Receipt size={24} strokeWidth={1.75} />} primary />
          <Action to="/purchase/new" labelKey="dashboard.newPurchase" icon={<Download size={24} strokeWidth={1.75} />} />
          <Action to="/stock" labelKey="dashboard.imeiSearch" icon={<Search size={24} strokeWidth={1.75} />} />
          <Action to="/parties" labelKey="dashboard.payment" icon={<HandCoins size={24} strokeWidth={1.75} />} />
        </div>
      </section>

      {pendingVerification.length || loans?.length ? (
        <section className="card p-0">
          {pendingVerification.length ? (
            <Row icon={<ShieldAlert size={18} />} title={<BiLabel text="stock.verification.pending" size="md" bold />} sub={<span dir="ltr">{pendingVerification.length}</span>} onClick={() => nav('/stock')} />
          ) : null}
          {loans?.length ? (
            <Row icon={<RotateCcw size={18} />} title={<BiLabel text="loan.out" size="md" bold />} sub={<span dir="ltr">{loans.length}{loans.some((l) => l.overdue) ? ' · ' + loans.filter((l) => l.overdue).length + ' overdue' : ''}</span>} onClick={() => nav('/loans')} />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
