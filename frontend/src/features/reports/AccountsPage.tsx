/** Accounts (owner 2026-11-18, ADR-104): the shop's money on one page — cash in hand, bank and
 *  wallets, what people owe and what the shop owes — and a way into every accounts screen and
 *  report that already exists. Nothing new is computed here: the money accounts and the dashboard's
 *  two khata totals. */

import { ArrowDownLeft, ArrowUpRight, Banknote, BarChart3, ChevronRight, FileText, HandCoins, Landmark, ListTree, Lock, Scale, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Loading, PageHeader } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useModules } from '@/lib/modules'
import { useCashAccounts, useGet } from '@/lib/queries'

interface Dash { receivable?: string; payable?: string }
const n = (v: number) => `${v < 0 ? '− ' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function AccountsPage() {
  const { pick, ur, cls } = useLang()
  const has = useModules()
  const { data: accounts, isLoading } = useCashAccounts()
  const { data: dash } = useGet<Dash>(['dashboard'], '/api/v1/reports/dashboard')
  // a cheque or a remittance on its way is not money in the drawer or the bank yet
  const live = (accounts ?? []).filter((a) => a.kind !== 'cheque' && a.kind !== 'remittance')
  const cash = live.filter((a) => a.kind === 'cash').reduce((s, a) => s + Number(a.balance ?? 0), 0)
  const bank = live.filter((a) => a.kind !== 'cash').reduce((s, a) => s + Number(a.balance ?? 0), 0)
  const fig = (id: string, to: string, label: string, value: number, tone: string, icon: ReactNode) => (
    <Link to={to} className={`tap flex min-w-0 flex-col gap-1 rounded-3xl p-4 ${tone}`} data-testid={`acct-${id}`}>
      <span className="flex items-center gap-1.5">{icon}<span className={`min-w-0 truncate ${ur ? cls('sm') : 'text-xs font-bold'}`}>{pick(label)}</span></span>
      <span className="num text-2xl font-extrabold leading-tight" dir="ltr">{withCur(n(value))}</span>
    </Link>
  )
  const tiles: { key: string; to: string; icon: ReactNode; module?: 'expenses' | 'reports' }[] = [
    { key: 'cash', to: '/more/cash', icon: <Landmark size={20} /> },
    { key: 'payments', to: '/payments', icon: <HandCoins size={20} /> },
    { key: 'customers', to: '/khata?f=get', icon: <ArrowDownLeft size={20} /> },
    { key: 'suppliers', to: '/khata?f=give', icon: <ArrowUpRight size={20} /> },
    { key: 'expenses', to: '/expenses', icon: <Wallet size={20} />, module: 'expenses' },
    { key: 'close', to: '/expenses', icon: <Lock size={20} />, module: 'expenses' },
    { key: 'chart', to: '/reports/ledger', icon: <ListTree size={20} />, module: 'reports' },
    { key: 'books', to: '/reports?tab=books', icon: <Scale size={20} />, module: 'reports' },
    { key: 'pnl', to: '/reports?tab=profit', icon: <FileText size={20} />, module: 'reports' },
    { key: 'audit', to: '/audit', icon: <BarChart3 size={20} />, module: 'reports' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="acct.title" help={<Help term="acct.page" />} />
      <BiLabel text="acct.hint" size="sm" tone="text-muted" />
      {isLoading ? <Loading /> : (
        <div className="grid grid-cols-2 gap-2.5" data-testid="acct-figures">
          {fig('cash', '/more/cash', 'acct.cash', cash, 'bg-emerald-tint text-emerald-deep', <Banknote size={16} />)}
          {fig('bank', '/more/cash', 'acct.bank', bank, 'bg-khata text-khata-fg', <Landmark size={16} />)}
          {fig('get', '/khata?f=get', 'counter.toGet', Number(dash?.receivable ?? 0), 'bg-receivable-tint text-receivable', <ArrowDownLeft size={16} />)}
          {fig('give', '/khata?f=give', 'counter.toGive', Number(dash?.payable ?? 0), 'bg-payable-tint text-payable', <ArrowUpRight size={16} />)}
        </div>
      )}
      <div className="card flex flex-col divide-y divide-line p-0" data-testid="acct-links">
        {tiles.filter((t) => !t.module || has(t.module)).map((t) => (
          <Link key={t.key} to={t.to} className="tap flex min-h-14 items-center gap-3 px-4 py-2.5" data-testid={`acct-link-${t.key}`}>
            <span className="well h-10 w-10 shrink-0 bg-ground text-ink">{t.icon}</span>
            <span className={`min-w-0 flex-1 ${ur ? cls('md') : 'text-[15px] font-bold'}`}>{pick(`acct.t.${t.key}`)}</span>
            <ChevronRight size={18} className="shrink-0 text-muted rtl:rotate-180" />
          </Link>
        ))}
      </div>
    </div>
  )
}
