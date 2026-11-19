/** Reports — every report and sheet of the software from one screen (owner 2026-11-19, ADR-111).
 *  The reports a shop looks at every day come first as big tiles (hisaab, stock tally, udhaar,
 *  sales, purchases, len-den, cash, expenses, returns); the rest follow by subject. A search box
 *  finds a report by its name; the dates picked go into the downloads and into the screens that
 *  take dates. Nothing is computed here: each row opens the screen where the report lives. */

import {
  ArrowLeftRight, BarChart3, BookOpen, Boxes, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, CreditCard, FileBarChart, FileText, HandCoins, History,
  Landmark, LayoutDashboard, LineChart, ListChecks, Package, PiggyBank, Receipt, Scale, Search, ShieldAlert, ShieldCheck, Smartphone, Tag, Tags, TrendingUp, Undo2, UserCog, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { PageHeader } from '@/components/ui'
import PeriodPicker, { periodOf, type Period } from '@/features/counter/PeriodPicker'
import { useAuth } from '@/lib/auth'
import { useModules, useTrade } from '@/lib/modules'
import { GROUPS, reportsFor, type Group, type Report } from './catalog'

const ICON: Record<string, LucideIcon> = {
  day: CalendarDays, tally: ClipboardCheck, khata: BookOpen, sales: Receipt, purchases: Package, lending: HandCoins, cash: Landmark, expenses: Wallet, returns: Undo2,
  profit: TrendingUp, top: Tag, salesAudit: LineChart, bills: ListChecks, returnsReport: Undo2, products: Tags, prices: CreditCard, estimate: BarChart3, invoices: FileText, installments: PiggyBank,
  stock: Smartphone, worth: Scale, itemSheet: FileBarChart, oldStock: History, byType: Boxes, stockAudit: ShieldCheck, count: ClipboardList, items: Boxes, transfers: ArrowLeftRight,
  balances: Scale, ageing: History, people: Users, personLedger: BookOpen, payments: HandCoins, reminders: CalendarDays,
  accounts: Landmark, finance: Wallet, books: FileBarChart, ledger: BookOpen, overview: LayoutDashboard, audit: ShieldCheck, full: FileText,
  staff: UserCog, security: ShieldAlert, repairs: Wrench, logins: ShieldCheck,
}
/** tile colours of the daily row: the job colours the rest of the app uses */
const TONE: Record<string, string> = {
  day: 'bg-hero text-hero-text', tally: 'bg-stockt text-stockt-fg', khata: 'bg-khata text-khata-fg', sales: 'bg-sell text-sell-fg', purchases: 'bg-buy text-buy-fg',
  lending: 'bg-khata text-khata-fg', cash: 'bg-emerald-tint text-emerald-deep', expenses: 'bg-expense text-expense-fg', returns: 'bg-ret text-ret-fg',
}
const GROUP_TONE: Record<Group, string> = { daily: '', sales: 'bg-sell text-sell-fg', stock: 'bg-stockt text-stockt-fg', people: 'bg-khata text-khata-fg', money: 'bg-emerald-tint text-emerald-deep', staff: 'bg-ground text-ink' }

export default function ReportsHub() {
  const { pick, ur, cls, dir } = useLang()
  const me = useAuth((s) => s.me)
  const has = useModules()
  const trade = useTrade()
  const [period, setPeriod] = useState<Period>(() => periodOf('today'))
  const [q, setQ] = useState('')
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight
  const mine = useMemo(() => reportsFor({ role: me?.user.role, has, shops: me?.shops.length ?? 1, devices: trade.devices }), [me, has, trade.devices])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const name = (r: Report) => pick(`hub.r.${r.id}.t`)
  const line = (r: Report) => pick(`hub.r.${r.id}.d`)
  const shown = words.length ? mine.filter((r) => words.every((w) => `${name(r)} ${line(r)}`.toLowerCase().includes(w))) : mine
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  return (
    <div className="flex flex-col gap-4" data-testid="reports-hub">
      <PageHeader title="hub.title" help={<Help term="hub.page" />} />
      <BiLabel text="hub.hint" size="sm" tone="text-muted" />
      <label className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-4 shadow-[0_8px_24px_-18px_rgba(27,31,36,.35)]">
        <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={pick('hub.search')} placeholder={pick('hub.search')} className={`min-w-0 flex-1 bg-transparent font-medium text-ink placeholder:text-muted/70 focus:outline-none ${ur ? 'ur text-base' : 'text-base'}`} data-testid="hub-search" />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1"><BiLabel text="hub.dates" size="sm" bold tone="text-muted" /><Help term="hub.dates" size="sm" /></span>
        <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      </div>

      {!shown.length ? <BiLabel text="hub.none" size="md" tone="text-muted" align="center" className="py-8" /> : null}

      {GROUPS.map((g) => {
        const rows = shown.filter((r) => r.group === g)
        if (!rows.length) return null
        return (
          <section key={g} className="flex flex-col gap-2" data-testid={`hub-${g}`}>
            <span className="flex items-center gap-2">
              <BiLabel text={`hub.g.${g}`} size="lg" bold />
              <span className={`num rounded-full bg-ground px-2 py-0.5 text-muted ${small}`} dir="ltr">{rows.length}</span>
            </span>
            {g === 'daily' ? (
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {rows.map((r) => {
                  const Icon = ICON[r.id] ?? FileText
                  return (
                    <div key={r.id} className={`relative flex min-h-[112px] flex-col rounded-3xl ${TONE[r.id] ?? 'bg-surface text-ink'}`} data-testid={`hub-r-${r.id}`}>
                      <Link to={r.to(period)} className="tap flex flex-1 flex-col justify-between gap-2 p-3.5">
                        <span className="well h-10 w-10 shrink-0 rounded-xl bg-white/20 text-current"><Icon size={20} strokeWidth={1.9} /></span>
                        <span className="flex flex-col gap-0.5 pe-10">
                          <span className={`leading-tight ${ur ? cls('md') : 'text-[15px] font-extrabold'}`}>{name(r)}</span>
                          <span className={`leading-snug opacity-80 ${small}`}>{line(r)}</span>
                        </span>
                      </Link>
                      {r.download && has('exports') ? <span className="absolute end-2 top-2 [&_button]:border-white/30 [&_button]:bg-white/15 [&_button]:text-current"><DownloadButton path={r.download.path(period)} name={r.download.name} compact /></span> : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="card flex flex-col divide-y divide-line p-0">
                {rows.map((r) => {
                  const Icon = ICON[r.id] ?? FileText
                  return (
                    <div key={r.id} className="flex items-center gap-2 pe-2" data-testid={`hub-r-${r.id}`}>
                      <Link to={r.to(period)} className="tap flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
                        <span className={`well h-10 w-10 shrink-0 rounded-xl ${GROUP_TONE[g]}`}><Icon size={19} strokeWidth={1.9} /></span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={`leading-tight ${ur ? cls('md') : 'text-[15px] font-bold'}`}>{name(r)}</span>
                          <span className={`leading-snug text-muted ${small}`}>{line(r)}</span>
                        </span>
                        <Chevron size={18} className="shrink-0 text-muted" />
                      </Link>
                      {r.download && has('exports') ? <DownloadButton path={r.download.path(period)} name={r.download.name} compact /> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
