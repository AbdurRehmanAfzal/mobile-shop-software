import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { BiButton, BiLabel } from '@/components/Bilingual'

function Tile({ labelKey, value, tone = 'text-slate-900' }: { labelKey: string; value: string; tone?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <BiLabel text={labelKey} size="sm" tone="text-slate-500" />
      <div className={`text-2xl font-semibold tabular-nums ${tone}`} dir="ltr">
        {value}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const me = useAuth((s) => s.me)
  // Real figures arrive with the ledger/devices modules (Phase 1). Zeros are honest placeholders.
  return (
    <div className="flex flex-col gap-4">
      <div>
        <BiLabel text="auth.welcome" size="sm" tone="text-slate-500" />
        <div className="text-xl font-semibold">{me?.user.name}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile labelKey="dashboard.todaySales" value={formatMoney(0)} tone="text-brand-700" />
        <Tile labelKey="dashboard.cashInHand" value={formatMoney(0)} />
        <Tile labelKey="dashboard.receivable" value={formatMoney(0)} tone="text-amber-700" />
        <Tile labelKey="dashboard.payable" value={formatMoney(0)} tone="text-red-700" />
        <Tile labelKey="dashboard.inStock" value="0" />
        <Tile labelKey="dashboard.repairs" value="0" />
      </div>

      <BiLabel text="dashboard.quickActions" size="md" bold className="mt-2" />
      <div className="grid grid-cols-2 gap-3">
        <BiButton text="dashboard.newSale" icon="🧾" disabled />
        <BiButton text="dashboard.newPurchase" icon="📥" variant="secondary" disabled />
        <BiButton text="dashboard.payment" icon="💵" variant="secondary" disabled />
        <BiButton text="dashboard.repair" icon="🛠️" variant="secondary" disabled />
      </div>
      <BiLabel text="dashboard.comingSoon" size="sm" align="center" tone="text-slate-400" />
    </div>
  )
}
