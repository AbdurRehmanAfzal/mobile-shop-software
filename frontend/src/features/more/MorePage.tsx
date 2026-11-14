/** "More": everything else, grouped, each icon in its job colour (docs/11 v2). */

import { ChevronLeft, ChevronRight, Bot,
  ArrowLeftRight, Archive, BarChart3, Bell, BookOpen, CalendarDays, Check, ClipboardList, CreditCard, FileSpreadsheet, FileText, HandCoins, Headphones, KeyRound,
  Landmark, LayoutDashboard, Lock, LogOut, Package, PackagePlus, Palette, ShieldCheck, Receipt, RotateCcw, ScanLine, Settings, Smartphone, Store, Tag, Tags, Undo2, Users,
  Scale, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setLocale, type Locale } from '@/i18n'
import { useAuth, type Role } from '@/lib/auth'
import { moduleFor, useModules } from '@/lib/modules'
import { api } from '@/lib/api'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import FingerprintCard from './FingerprintCard'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { rememberLogin } from '@/features/auth/LoginPage'

type Icon = LucideIcon
/** `tone` = the job colour (docs/11 v2) of the icon well */
/** `help`: a key under `help.` for the "?" beside the tile (docs/33) */
/** `branches`: shown only to someone who works in more than one branch of the owner */
interface Item { key: string; Icon: Icon; to?: string; action?: 'pin'; roles?: Role[]; tone?: string; help: string; branches?: boolean }
interface Group { title: string; help: string; items: Item[] }

const MANAGERS: Role[] = ['owner', 'manager']
const T = {
  sell: 'bg-sell text-sell-fg',
  buy: 'bg-buy text-buy-fg',
  khata: 'bg-khata text-khata-fg',
  stock: 'bg-stockt text-stockt-fg',
  repair: 'bg-repair text-repair-fg',
  expense: 'bg-expense text-expense-fg',
  ret: 'bg-ret text-ret-fg',
  plain: 'bg-ground text-ink border border-line',
}

const GROUPS: Group[] = [
  {
    title: 'more.daily',
    help: 'more.group.daily',
    items: [
      { key: 'counter.sell', Icon: Tag, to: '/sale/new', tone: T.sell, help: 'more.tile.sell' },
      { key: 'counter.addStock', Icon: PackagePlus, to: '/purchase/new', tone: T.buy, help: 'more.tile.addStock' },
      { key: 'counter.returnJob', Icon: Undo2, to: '/return/new', tone: T.ret, help: 'more.tile.returnJob' },
      { key: 'counter.khata', Icon: BookOpen, to: '/khata', tone: T.khata, help: 'khata' },
      { key: 'ov.title', Icon: LayoutDashboard, to: '/overview', tone: T.plain, help: 'more.tile.overview', roles: MANAGERS },
      { key: 'bal.title', Icon: Scale, to: '/balances', tone: T.khata, help: 'more.tile.balances', roles: MANAGERS },
      { key: 'inst.title', Icon: HandCoins, to: '/installments', tone: T.khata, help: 'more.tile.installments' },
      { key: 'ai.title', Icon: Bot, to: '/assistant', tone: T.plain, help: 'more.tile.assistant' },
      { key: 'counter.repair', Icon: Wrench, to: '/repairs', tone: T.repair, help: 'more.tile.repairs' },
      { key: 'more.exchange', Icon: ArrowLeftRight, to: '/exchange/new', tone: T.sell, help: 'more.tile.exchange' },
      { key: 'more.loans', Icon: RotateCcw, to: '/loans', tone: T.stock, help: 'more.tile.loans' },
      { key: 'counter.dayTitle', Icon: CalendarDays, to: '/hisaab', tone: T.plain, help: 'more.tile.hisaab' },
    ],
  },
  {
    title: 'more.stockGroup',
    help: 'more.group.stock',
    items: [
      { key: 'more.stock', Icon: Smartphone, to: '/stock', tone: T.stock, help: 'more.tile.stock' },
      { key: 'counter.stockWorth', Icon: BarChart3, to: '/stock/summary', tone: T.stock, help: 'more.tile.stockWorth' },
      { key: 'more.accessories', Icon: Headphones, to: '/accessories', tone: T.stock, help: 'more.tile.accessories' },
      { key: 'dashboard.imeiSearch', Icon: ScanLine, to: '/stock', tone: T.stock, help: 'more.tile.imeiSearch' },
      { key: 'more.openingStock', Icon: Archive, to: '/stock/opening', roles: MANAGERS, tone: T.buy, help: 'more.tile.openingStock' },
      { key: 'bulk.title', Icon: FileSpreadsheet, to: '/more/bulk', roles: MANAGERS, tone: T.buy, help: 'bulk' },
      { key: 'count.title', Icon: ClipboardList, to: '/stock/count', roles: MANAGERS, tone: T.stock, help: 'more.tile.count' },
      { key: 'transfer.title', Icon: Store, to: '/transfers', roles: MANAGERS, tone: T.stock, help: 'more.tile.transfers', branches: true },
      { key: 'more.catalogue', Icon: Tags, to: '/more/catalogue', roles: MANAGERS, tone: T.plain, help: 'more.tile.catalogue' },
    ],
  },
  {
    title: 'more.records',
    help: 'more.group.records',
    items: [
      { key: 'inv.title', Icon: FileText, to: '/invoices', tone: T.khata, help: 'more.tile.invoices' },
      { key: 'more.sales', Icon: Receipt, to: '/sales', tone: T.sell, help: 'more.tile.sales' },
      { key: 'more.purchases', Icon: Package, to: '/purchases', tone: T.buy, help: 'more.tile.purchases' },
      { key: 'more.payments', Icon: HandCoins, to: '/payments', tone: T.khata, help: 'more.tile.payments' },
      { key: 'more.returns', Icon: Undo2, to: '/returns', tone: T.ret, help: 'more.tile.returns' },
      { key: 'party.title', Icon: Users, to: '/parties', tone: T.khata, help: 'more.tile.parties' },
    ],
  },
  {
    title: 'more.accounts',
    help: 'more.group.accounts',
    items: [
      { key: 'more.expenses', Icon: Wallet, to: '/expenses', roles: MANAGERS, tone: T.expense, help: 'more.tile.expenses' },
      { key: 'more.dayClose', Icon: Lock, to: '/expenses', roles: MANAGERS, tone: T.expense, help: 'more.tile.dayClose' },
      { key: 'more.cashAccounts', Icon: Landmark, to: '/more/cash', roles: MANAGERS, tone: T.sell, help: 'more.tile.cash' },
      { key: 'more.reports', Icon: FileText, to: '/reports', roles: MANAGERS, tone: T.plain, help: 'more.tile.reports' },
      { key: 'audit.title', Icon: BarChart3, to: '/audit', roles: MANAGERS, tone: T.plain, help: 'audit' },
    ],
  },
  {
    title: 'more.admin',
    help: 'more.group.admin',
    items: [
      { key: 'more.settings', Icon: Settings, to: '/more/settings', roles: ['owner'], tone: T.plain, help: 'more.tile.settings' },
      { key: 'more.staff', Icon: Users, to: '/more/staff', roles: ['owner'], tone: T.plain, help: 'more.tile.staff' },
      // owner 2026-11-14 (ADR-074): only when the super admin has switched on Login activity
      { key: 'logins.title', Icon: ShieldCheck, to: '/more/logins', roles: ['owner'], tone: T.plain, help: 'logins.page' },
      { key: 'more.notifications', Icon: Bell, to: '/more/notifications?tab=settings', roles: ['owner'], tone: T.plain, help: 'more.tile.notifications' },
      { key: 'fees.title', Icon: CreditCard, to: '/more/fees', roles: ['owner'], tone: T.plain, help: 'more.tile.fees' },
      { key: 'pin.set', Icon: KeyRound, action: 'pin', tone: T.plain, help: 'more.tile.pin' },
    ],
  },
]

export default function MorePage() {
  const { i18n } = useTranslation()
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const locale = i18n.language as Locale
  const role = me?.user.role
  const [pinOpen, setPinOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState<unknown>(null)
  const [pinBusy, setPinBusy] = useState(false)

  const has = useModules()
  const visible = (it: Item) => (!it.roles || (role !== undefined && it.roles.includes(role))) && (!it.to || !moduleFor(it.to) || has(moduleFor(it.to)!)) && (!it.branches || (me?.shops.length ?? 0) > 1)
  const activeShopId = useAuth((s) => s.activeShopId)
  const setActiveShop = useAuth((s) => s.setActiveShop)

  return (
    <div className="flex flex-col gap-5">
      {me?.user.is_superuser ? (
        <button type="button" onClick={() => nav('/admin')} className="tap flex min-h-[72px] items-center gap-3 rounded-3xl bg-hero px-4 text-start text-hero-text">
          <span className="well h-12 w-12 shrink-0 bg-white/15"><ShieldCheck size={24} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <BiLabel text="admin.title" size="lg" bold tone="text-current" />
            <BiLabel text="admin.newShop" size="sm" tone="text-current opacity-80" />
          </span>
        </button>
      ) : null}
      {me && me.shops.length > 1 ? (
        <section className="flex flex-col gap-2">
          <span className="flex items-center gap-1"><BiLabel text="more.shops" size="md" bold /><Help term="more.shops" size="sm" /></span>
          <div className="card divide-y divide-line p-0">
            {me.shops.map((s) => {
              const on = s.id === activeShopId
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => { setActiveShop(s.id); nav('/') }} className="tap flex w-full items-center gap-3 px-4 py-3 text-start">
                  <span className={`well h-10 w-10 shrink-0 ${on ? 'bg-ink text-ground' : 'bg-ground text-ink'}`}><Store size={20} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{s.name}</span>
                    {s.city ? <span className="text-xs text-muted">{s.city}</span> : null}
                  </span>
                  {on ? <Check size={20} className="text-emerald" /> : null}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
      {GROUPS.map((g) => {
        const items = g.items.filter(visible)
        if (!items.length) return null
        return (
          <section key={g.title} className="flex flex-col gap-2">
            <span className="flex items-center gap-1"><BiLabel text={g.title} size="md" bold /><Help term={g.help} size="sm" /></span>
            <div className={`grid gap-2 ${ur ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
              {items.map(({ key, Icon, to, action, tone, help }) => (
                // the "?" sits beside the tile's button (not inside it), at the far end
                <div key={key + (to ?? '')} className="relative">
                  <button
                    type="button"
                    onClick={() => (action === 'pin' ? setPinOpen(true) : to && nav(to))}
                    className="tap flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-line bg-surface py-2.5 pe-8 ps-3 text-start shadow-[0_1px_0_rgb(var(--line))] active:translate-y-px active:shadow-none"
                  >
                    <span className={`well h-11 w-11 shrink-0 rounded-xl ${tone ?? T.plain}`}><Icon size={22} strokeWidth={1.9} /></span>
                    <span className="min-w-0 flex-1"><BiLabel text={key} size="md" bold className="leading-tight" /></span>
                    <span className="shrink-0 text-muted">{ur ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</span>
                  </button>
                  <span className="absolute end-1 top-1/2 -translate-y-1/2"><Help term={help} size="sm" /></span>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      <section className="flex flex-col gap-2">
        <span className="flex items-center gap-1"><BiLabel text="more.app" size="md" bold /><Help term="more.app" size="sm" /></span>
        <div className="card flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="more.language" size="sm" tone="text-muted" /><Help term="more.language" size="sm" /></span>
          <BiSegmented<Locale> value={locale} onChange={setLocale} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو', roman: 'Urdu' } }, { value: 'roman', text: { en: 'Roman Urdu', ur: 'رومن اردو', roman: 'Roman Urdu' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی', roman: 'English' } }]} />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => nav('/more/appearance')} className="tap flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-3 text-start" data-testid="more-appearance">
              <span className="well h-10 w-10 shrink-0 rounded-xl bg-emerald-tint text-emerald-deep"><Palette size={20} /></span>
              <span className="flex min-w-0 flex-1 flex-col"><BiLabel text="look.title" size="md" bold /><BiLabel text="look.short" size="sm" tone="text-muted" /></span>
              <span className="shrink-0 text-muted">{ur ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</span>
            </button>
            <Help term="look.page" size="sm" />
          </div>
        </div>
      </section>

      <div className="card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <FileText size={18} className="text-muted" />
          <div className="text-sm font-semibold text-muted" dir="ltr">{me?.user.name} · {me?.user.phone} · {me?.user.role ? pick(`staff.roles.${me.user.role}`) : ''}</div>
        </div>
        <BiButton text="auth.logout" variant="danger" full onClick={logout} icon={<LogOut size={20} />} />
      </div>

      <div className="text-center text-xs font-semibold text-muted/70" dir="ltr">v2.0.0</div>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="pin.set">
        <div className="flex flex-col gap-3">
          <BiLabel text="pin.setHint" size="sm" tone="text-muted" />
          <BiInput label="pin.current" type="password" value={pw} onChange={(e) => setPw(e.target.value)} help={<Help term="more.pinPassword" size="sm" />} />
          <BiInput label="pin.title" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} help={<Help term="more.pinNew" size="sm" />} />
          <ErrorText error={pinErr} />
          <BiButton
            text="common.save"
            full
            loading={pinBusy}
            disabled={pin.length < 4 || !pw}
            onClick={async () => {
              setPinBusy(true)
              setPinErr(null)
              try {
                await api('PUT', '/api/v1/me/pin', { password: pw, pin })
                if (me) rememberLogin({ ...me, user: { ...me.user, has_pin: true } })
                setPinOpen(false)
                setPw('')
                setPin('')
              } catch (e) {
                setPinErr(e)
              } finally {
                setPinBusy(false)
              }
            }}
          />
        </div>
      </Sheet>
      <FingerprintCard />
    </div>
  )
}
