/** "More" as category-wise icon grids (owner's UI guide: Easypaisa "More with easypaisa"). */

import {
  ArrowLeftRight, Archive, BarChart3, Bell, Download, FileText, HandCoins, Headphones, KeyRound, Landmark, Lock,
  LogOut, Receipt, RotateCcw, ScanLine, Settings, Smartphone, Undo2, Users, Wallet, Wrench,
} from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setLocale, type Locale } from '@/i18n'
import { useAuth, type Role } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { api } from '@/lib/api'
import { BiButton, BiInput, BiLabel, BiSegmented } from '@/components/Bilingual'
import { ErrorText, Sheet } from '@/components/ui'
import { rememberLogin } from '@/features/auth/LoginPage'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
interface Item { key: string; Icon: Icon; to?: string; action?: 'pin'; roles?: Role[] }
interface Group { title: string; items: Item[] }

const MANAGERS: Role[] = ['owner', 'manager']

const GROUPS: Group[] = [
  {
    title: 'more.daily',
    items: [
      { key: 'dashboard.newSale', Icon: Receipt, to: '/sale/new' },
      { key: 'dashboard.newPurchase', Icon: Download, to: '/purchase/new' },
      { key: 'dashboard.payment', Icon: HandCoins, to: '/parties' },
      { key: 'dashboard.repair', Icon: Wrench, to: '/repairs' },
      { key: 'more.exchange', Icon: ArrowLeftRight, to: '/exchange/new' },
      { key: 'dashboard.imeiSearch', Icon: ScanLine, to: '/stock' },
      { key: 'more.loans', Icon: RotateCcw, to: '/loans' },
      { key: 'party.title', Icon: Users, to: '/parties' },
    ],
  },
  {
    title: 'more.stockGroup',
    items: [
      { key: 'more.stock', Icon: Smartphone, to: '/stock' },
      { key: 'more.accessories', Icon: Headphones, to: '/accessories' },
      { key: 'more.openingStock', Icon: Archive, to: '/stock/opening', roles: MANAGERS },
    ],
  },
  {
    title: 'more.records',
    items: [
      { key: 'more.sales', Icon: Receipt, to: '/sales' },
      { key: 'more.purchases', Icon: Download, to: '/purchases' },
      { key: 'more.payments', Icon: HandCoins, to: '/payments' },
      { key: 'more.returns', Icon: Undo2, to: '/returns' },
    ],
  },
  {
    title: 'more.accounts',
    items: [
      { key: 'more.expenses', Icon: Wallet, to: '/expenses', roles: MANAGERS },
      { key: 'more.dayClose', Icon: Lock, to: '/expenses', roles: MANAGERS },
      { key: 'more.cashAccounts', Icon: Landmark, to: '/more/cash', roles: MANAGERS },
      { key: 'more.reports', Icon: BarChart3, to: '/reports', roles: MANAGERS },
    ],
  },
  {
    title: 'more.admin',
    items: [
      { key: 'more.settings', Icon: Settings, to: '/more/settings', roles: ['owner'] },
      { key: 'more.staff', Icon: Users, to: '/more/staff', roles: ['owner'] },
      { key: 'more.notifications', Icon: Bell, to: '/more/notifications', roles: ['owner'] },
      { key: 'pin.set', Icon: KeyRound, action: 'pin' },
    ],
  },
]

export default function MorePage() {
  const { i18n } = useTranslation()
  const nav = useNavigate()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const locale = i18n.language as Locale
  const role = me?.user.role
  const [pinOpen, setPinOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState<unknown>(null)
  const [pinBusy, setPinBusy] = useState(false)

  const visible = (it: Item) => !it.roles || (role !== undefined && it.roles.includes(role))

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((g) => {
        const items = g.items.filter(visible)
        if (!items.length) return null
        return (
          <section key={g.title} className="flex flex-col gap-2">
            <BiLabel text={g.title} size="md" bold />
            <div className="card grid grid-cols-4 gap-1 p-2">
              {items.map(({ key, Icon, to, action }) => (
                <button
                  key={key + (to ?? '')}
                  type="button"
                  onClick={() => (action === 'pin' ? setPinOpen(true) : to && nav(to))}
                  className="tap flex min-h-[92px] flex-col items-center justify-start gap-2 rounded-2xl px-1 py-3"
                >
                  <Icon size={26} strokeWidth={1.6} className="text-emerald" />
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
          <BiSegmented<Locale> value={locale} onChange={setLocale} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی' } }]} />
          <BiLabel text="more.theme" size="sm" tone="text-muted" />
          <BiSegmented<Theme> value={theme} onChange={setTheme} options={[{ value: 'light', text: 'more.themeLight' }, { value: 'dark', text: 'more.themeDark' }, { value: 'system', text: 'more.themeSystem' }]} />
        </div>
      </section>

      <div className="card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <FileText size={18} className="text-muted" />
          <div className="text-sm font-semibold text-muted" dir="ltr">{me?.user.name} · {me?.user.phone} · {me?.user.role}</div>
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
    </div>
  )
}
