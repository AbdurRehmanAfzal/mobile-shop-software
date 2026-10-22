/** Home, modelled on the owner's UI guide (Easypaisa): green header band, a white hero card whose
 *  amounts are hidden until tapped (customers stand at the counter), three big primary actions,
 *  and a "more services" icon grid in one card. */

import {
  ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, Download, Eye, EyeOff, Headphones, HandCoins, Receipt,
  RotateCcw, ScanLine, ShieldAlert, Smartphone, Users, Wallet, Wrench,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Row } from '@/components/ui'

interface Dash {
  sales_count: number; sales_total: string; received_today: string; profit_today: string | null; cash_in_hand: string
  receivable: string; payable: string; stock_count: number; pending_verification: number; loans_out: number; repairs_open: number
}

function readShow(): boolean {
  try { return localStorage.getItem('home.show') === '1' } catch { return false }
}

function BigAction({ to, labelKey, icon }: { to: string; labelKey: string; icon: ReactNode }) {
  return (
    <Link to={to} className="tap flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-surface px-2 py-4 shadow-[0_6px_16px_-10px_rgba(14,22,19,.35)]">
      <span className="text-emerald">{icon}</span>
      <BiLabel text={labelKey} size="sm" align="center" bold />
    </Link>
  )
}

function GridItem({ to, labelKey, icon, roles }: { to: string; labelKey: string; icon: ReactNode; roles?: string[] }) {
  const role = useAuth((s) => s.me?.user.role)
  if (roles && (!role || !roles.includes(role))) return null
  return (
    <Link to={to} className="tap flex flex-col items-center gap-2 rounded-2xl px-1 py-3">
      <span className="text-emerald">{icon}</span>
      <BiLabel text={labelKey} size="sm" align="center" />
    </Link>
  )
}

export default function DashboardPage() {
  const me = useAuth((s) => s.me)
  const nav = useNavigate()
  const { pick } = useLang()
  const [show, setShow] = useState(readShow)
  const { data: d } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  const toggle = () => {
    setShow((v) => {
      try { localStorage.setItem('home.show', v ? '0' : '1') } catch { /* private mode */ }
      return !v
    })
  }
  const mask = (v: string) => (show ? v : '••••••')
  const ic = { size: 28, strokeWidth: 1.6 }
  const sm = { size: 26, strokeWidth: 1.6 }

  return (
    <div className="-mx-5 -mt-1 flex flex-col">
      {/* green band + hero card */}
      <div className="bg-emerald px-5 pb-16 pt-2">
        <div className="text-sm font-semibold text-white/85">{pick('home.hello')}، {me?.user.name}</div>
      </div>
      <div className="-mt-14 px-5">
        <button type="button" onClick={toggle} className="tap w-full rounded-3xl bg-surface p-5 text-start shadow-[0_18px_40px_-24px_rgba(14,22,19,.55)]">
          <div className="flex items-start justify-between">
            <BiLabel text="home.todaySales" size="sm" tone="text-muted" bold />
            <span className="text-muted">{show ? <EyeOff size={22} /> : <Eye size={22} />}</span>
          </div>
          <div className="num mt-1 text-[34px] leading-none text-ink" dir="ltr">{mask(formatMoney(d?.sales_total ?? 0))}</div>
          {show ? (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
              <div><BiLabel text="home.received" size="sm" tone="text-muted" /><div className="num text-base" dir="ltr">{Number(d?.received_today ?? 0).toLocaleString('en-US')}</div></div>
              <div><BiLabel text="dashboard.cashInHand" size="sm" tone="text-muted" /><div className="num text-base" dir="ltr">{Number(d?.cash_in_hand ?? 0).toLocaleString('en-US')}</div></div>
              <div><BiLabel text="home.profit" size="sm" tone="text-muted" /><div className="num text-base text-emerald" dir="ltr">{d?.profit_today != null ? Number(d.profit_today).toLocaleString('en-US') : '—'}</div></div>
            </div>
          ) : (
            <BiLabel text="home.tapToShow" size="sm" tone="text-muted" className="mt-2" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-5">
        <section className="grid grid-cols-3 gap-3">
          <BigAction to="/sale/new" labelKey="dashboard.newSale" icon={<Receipt {...ic} />} />
          <BigAction to="/purchase/new" labelKey="dashboard.newPurchase" icon={<Download {...ic} />} />
          <BigAction to="/parties" labelKey="dashboard.payment" icon={<HandCoins {...ic} />} />
        </section>

        <section className="flex flex-col gap-2">
          <BiLabel text="home.more" size="md" bold />
          <div className="card grid grid-cols-4 gap-1 p-2">
            <GridItem to="/stock" labelKey="dashboard.imeiSearch" icon={<ScanLine {...sm} />} />
            <GridItem to="/repairs" labelKey="dashboard.repair" icon={<Wrench {...sm} />} />
            <GridItem to="/exchange/new" labelKey="more.exchange" icon={<ArrowLeftRight {...sm} />} />
            <GridItem to="/accessories" labelKey="more.accessories" icon={<Headphones {...sm} />} />
            <GridItem to="/loans" labelKey="more.loans" icon={<RotateCcw {...sm} />} />
            <GridItem to="/expenses" labelKey="more.expenses" icon={<Wallet {...sm} />} roles={['owner', 'manager']} />
            <GridItem to="/reports" labelKey="more.reports" icon={<BarChart3 {...sm} />} roles={['owner', 'manager']} />
            <GridItem to="/more" labelKey="home.seeAll" icon={<Users {...sm} />} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => nav('/parties')} className="card tap text-start">
            <div className="flex items-center justify-between"><BiLabel text="dashboard.receivable" size="sm" tone="text-muted" /><ArrowUp size={18} className="text-receivable" /></div>
            <div className="num text-xl text-receivable" dir="ltr">{mask(formatMoney(d?.receivable ?? 0))}</div>
          </button>
          <button type="button" onClick={() => nav('/parties')} className="card tap text-start">
            <div className="flex items-center justify-between"><BiLabel text="dashboard.payable" size="sm" tone="text-muted" /><ArrowDown size={18} className="text-payable" /></div>
            <div className="num text-xl text-payable" dir="ltr">{mask(formatMoney(d?.payable ?? 0))}</div>
          </button>
        </section>

        {d && (d.pending_verification || d.loans_out || d.repairs_open) ? (
          <section className="flex flex-col gap-2">
            <BiLabel text="home.attention" size="md" bold />
            <div className="card p-0">
              {d.pending_verification ? <Row icon={<ShieldAlert size={18} />} title={<BiLabel text="stock.verification.pending" size="md" bold />} right={<span className="num" dir="ltr">{d.pending_verification}</span>} onClick={() => nav('/stock')} /> : null}
              {d.repairs_open ? <Row icon={<Wrench size={18} />} title={<BiLabel text="dashboard.repairs" size="md" bold />} right={<span className="num" dir="ltr">{d.repairs_open}</span>} onClick={() => nav('/repairs')} /> : null}
              {d.loans_out ? <Row icon={<RotateCcw size={18} />} title={<BiLabel text="loan.out" size="md" bold />} right={<span className="num" dir="ltr">{d.loans_out}</span>} onClick={() => nav('/loans')} /> : null}
            </div>
          </section>
        ) : null}

        <div className="flex items-center justify-center gap-2 pb-2 text-xs text-muted">
          <Smartphone size={14} /> <span dir="ltr">{d?.stock_count ?? 0}</span> <BiLabel text="dashboard.inStock" size="sm" tone="text-muted" />
        </div>
      </div>
    </div>
  )
}
