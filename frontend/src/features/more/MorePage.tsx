/** "More": everything else, grouped, each icon in its job colour (docs/11 v2). */

import {
  ArrowLeftRight, Archive, BarChart3, Bell, BookOpen, CalendarDays, Check, FileText, HandCoins, Headphones, KeyRound,
  Landmark, Lock, LogOut, Package, PackagePlus, ShieldCheck, Receipt, RotateCcw, ScanLine, Settings, Smartphone, Store, Tag, Tags, Undo2, Users,
  Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setLocale, type Locale } from '@/i18n'
import { useAuth, type Role } from '@/lib/auth'
import { moduleFor, useModules } from '@/lib/modules'
import { useTheme, type Palette, type Theme } from '@/lib/theme'
import { api } from '@/lib/api'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import FingerprintCard from './FingerprintCard'
import { ErrorText, Sheet } from '@/components/ui'
import { rememberLogin } from '@/features/auth/LoginPage'

type Icon = LucideIcon
/** `tone` = the job colour (docs/11 v2) of the icon well */
interface Item { key: string; Icon: Icon; to?: string; action?: 'pin'; roles?: Role[]; tone?: string }
interface Group { title: string; items: Item[] }

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
    items: [
      { key: 'counter.sell', Icon: Tag, to: '/sale/new', tone: T.sell },
      { key: 'counter.addStock', Icon: PackagePlus, to: '/purchase/new', tone: T.buy },
      { key: 'counter.returnJob', Icon: Undo2, to: '/return/new', tone: T.ret },
      { key: 'counter.khata', Icon: BookOpen, to: '/khata', tone: T.khata },
      { key: 'counter.repair', Icon: Wrench, to: '/repairs', tone: T.repair },
      { key: 'more.exchange', Icon: ArrowLeftRight, to: '/exchange/new', tone: T.sell },
      { key: 'more.loans', Icon: RotateCcw, to: '/loans', tone: T.stock },
      { key: 'counter.dayTitle', Icon: CalendarDays, to: '/hisaab', tone: T.plain },
    ],
  },
  {
    title: 'more.stockGroup',
    items: [
      { key: 'more.stock', Icon: Smartphone, to: '/stock', tone: T.stock },
      { key: 'counter.stockWorth', Icon: BarChart3, to: '/stock/summary', tone: T.stock },
      { key: 'more.accessories', Icon: Headphones, to: '/accessories', tone: T.stock },
      { key: 'dashboard.imeiSearch', Icon: ScanLine, to: '/stock', tone: T.stock },
      { key: 'more.openingStock', Icon: Archive, to: '/stock/opening', roles: MANAGERS, tone: T.buy },
      { key: 'more.catalogue', Icon: Tags, to: '/more/catalogue', roles: MANAGERS, tone: T.plain },
    ],
  },
  {
    title: 'more.records',
    items: [
      { key: 'inv.title', Icon: FileText, to: '/invoices', tone: T.khata },
      { key: 'more.sales', Icon: Receipt, to: '/sales', tone: T.sell },
      { key: 'more.purchases', Icon: Package, to: '/purchases', tone: T.buy },
      { key: 'more.payments', Icon: HandCoins, to: '/payments', tone: T.khata },
      { key: 'more.returns', Icon: Undo2, to: '/returns', tone: T.ret },
      { key: 'party.title', Icon: Users, to: '/parties', tone: T.khata },
    ],
  },
  {
    title: 'more.accounts',
    items: [
      { key: 'more.expenses', Icon: Wallet, to: '/expenses', roles: MANAGERS, tone: T.expense },
      { key: 'more.dayClose', Icon: Lock, to: '/expenses', roles: MANAGERS, tone: T.expense },
      { key: 'more.cashAccounts', Icon: Landmark, to: '/more/cash', roles: MANAGERS, tone: T.sell },
      { key: 'more.reports', Icon: FileText, to: '/reports', roles: MANAGERS, tone: T.plain },
    ],
  },
  {
    title: 'more.admin',
    items: [
      { key: 'more.settings', Icon: Settings, to: '/more/settings', roles: ['owner'], tone: T.plain },
      { key: 'more.staff', Icon: Users, to: '/more/staff', roles: ['owner'], tone: T.plain },
      { key: 'more.notifications', Icon: Bell, to: '/more/notifications', roles: ['owner'], tone: T.plain },
      { key: 'pin.set', Icon: KeyRound, action: 'pin', tone: T.plain },
    ],
  },
]

export default function MorePage() {
  const { i18n } = useTranslation()
  const { pick } = useLang()
  const nav = useNavigate()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const palette = useTheme((s) => s.palette)
  const setPalette = useTheme((s) => s.setPalette)
  const locale = i18n.language as Locale
  const role = me?.user.role
  const [pinOpen, setPinOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState<unknown>(null)
  const [pinBusy, setPinBusy] = useState(false)

  const has = useModules()
  const visible = (it: Item) => (!it.roles || (role !== undefined && it.roles.includes(role))) && (!it.to || !moduleFor(it.to) || has(moduleFor(it.to)!))
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
          <BiLabel text="more.shops" size="md" bold />
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
            <BiLabel text={g.title} size="md" bold />
            <div className="card grid grid-cols-4 gap-1 p-2">
              {items.map(({ key, Icon, to, action, tone }) => (
                <button
                  key={key + (to ?? '')}
                  type="button"
                  onClick={() => (action === 'pin' ? setPinOpen(true) : to && nav(to))}
                  className="tap flex min-h-[96px] flex-col items-center justify-start gap-1.5 rounded-2xl px-1 py-2.5"
                >
                  <span className={`well h-12 w-12 ${tone ?? T.plain}`}><Icon size={24} strokeWidth={1.9} /></span>
                  <BiLabel text={key} size="sm" align="center" />
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <section className="flex flex-col gap-2">
        <BiLabel text="more.app" size="md" bold />
        <div className="card flex flex-col gap-3">
          <BiLabel text="more.language" size="sm" tone="text-muted" />
          <BiSegmented<Locale> value={locale} onChange={setLocale} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو', roman: 'Urdu' } }, { value: 'roman', text: { en: 'Roman Urdu', ur: 'رومن اردو', roman: 'Roman Urdu' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی', roman: 'English' } }]} />
          <BiLabel text="more.look" size="sm" tone="text-muted" />
          <BiSegmented<Palette> value={palette} onChange={setPalette} options={[{ value: 'modern', text: 'more.lookModern' }, { value: 'pro', text: 'more.lookPro' }, { value: 'navy', text: 'more.lookNavy' }, { value: 'colorful', text: 'more.lookColorful' }]} />
          <BiLabel text="more.theme" size="sm" tone="text-muted" />
          <BiSegmented<Theme> value={theme} onChange={setTheme} options={[{ value: 'light', text: 'more.themeLight' }, { value: 'dark', text: 'more.themeDark' }, { value: 'system', text: 'more.themeSystem' }]} />
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
          <BiInput label="pin.current" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <BiInput label="pin.title" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
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
