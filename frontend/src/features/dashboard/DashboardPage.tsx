import { ArrowDown, ArrowUp, ChevronRight, Download, Receipt, Search, ShieldCheck, Smartphone, Wrench } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { BiLabel } from '@/components/Bilingual'

function Tile({
  labelKey,
  value,
  sub,
  tone = 'text-ink',
  icon,
}: {
  labelKey: string
  value: string
  sub?: string
  tone?: string
  icon: ReactNode
}) {
  return (
    <div className="card flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-muted" dir="ltr">
          {labelKey.split('.').pop()}
        </span>
        {icon}
      </div>
      <div className={`num text-[22px] ${tone}`} dir="ltr">
        {value}
      </div>
      <BiLabel text={labelKey} size="sm" tone="text-muted" className="-mt-1" eyebrowTone="hidden" />
      {sub ? (
        <div className="ur -mt-1 text-sm text-muted" dir="rtl">
          {sub}
        </div>
      ) : null}
    </div>
  )
}

function Action({ to, labelKey, icon, primary = false }: { to: string; labelKey: string; icon: ReactNode; primary?: boolean }) {
  const cls = primary ? 'bg-emerald text-white shadow-cta' : 'border border-line bg-surface text-ink'
  return (
    <Link to={to} className={`tap flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-3 ${cls}`}>
      {icon}
      <BiLabel text={labelKey} size="sm" align="center" tone={primary ? 'text-white' : 'text-ink'} eyebrowTone="hidden" />
    </Link>
  )
}

export default function DashboardPage() {
  const me = useAuth((s) => s.me)
  // Real figures arrive with the ledger/devices modules (Phase 1). Zeros are honest placeholders.
  return (
    <div className="flex flex-col gap-4">
      <section className="hero flex flex-col gap-3.5 p-5">
        <div className="flex items-start justify-between">
          <BiLabel text="dashboard.todaySales" size="lg" tone="text-hero-text" eyebrowTone="text-gold-text" />
          <span className="eyebrow rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1.5 text-gold-text" dir="ltr">
            {me?.user.name}
          </span>
        </div>
        <div className="num text-[38px] leading-none" dir="ltr">
          {formatMoney(0)}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {(['dashboard.sales', 'dashboard.cashIn', 'dashboard.profit'] as const).map((k, i) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <BiLabel text={k} size="sm" tone="text-hero-text/80" eyebrowTone="text-hero-text/60" />
              <span className={`num text-lg ${i === 2 ? 'text-gold-text' : ''}`} dir="ltr">
                0
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Tile labelKey="dashboard.receivable" value={formatMoney(0)} tone="text-receivable" icon={<ArrowUp size={18} className="text-receivable" />} />
        <Tile labelKey="dashboard.payable" value={formatMoney(0)} tone="text-payable" icon={<ArrowDown size={18} className="text-payable" />} />
        <Tile labelKey="dashboard.inStock" value="0" icon={<Smartphone size={18} className="text-emerald" />} />
        <Tile labelKey="dashboard.repairs" value="0" icon={<Wrench size={18} className="text-emerald" />} />
      </section>

      <section className="flex flex-col gap-2.5">
        <BiLabel text="dashboard.quickActions" size="md" bold />
        <div className="grid grid-cols-4 gap-2.5">
          <Action to="/sale" labelKey="dashboard.newSale" icon={<Receipt size={24} strokeWidth={1.75} />} primary />
          <Action to="/stock" labelKey="dashboard.newPurchase" icon={<Download size={24} strokeWidth={1.75} />} />
          <Action to="/stock" labelKey="dashboard.imeiSearch" icon={<Search size={24} strokeWidth={1.75} />} />
          <Action to="/parties" labelKey="dashboard.payment" icon={<ShieldCheck size={24} strokeWidth={1.75} />} />
        </div>
      </section>

      <section className="card flex items-center gap-3 p-3">
        <span className="well h-9 w-9 bg-emerald-tint text-emerald-deep">
          <ShieldCheck size={18} />
        </span>
        <BiLabel text="dashboard.comingSoon" size="md" className="flex-1" />
        <ChevronRight size={18} className="text-muted" />
      </section>
    </div>
  )
}
