import { ArrowLeftRight, KeyRound, BarChart3, Bell, ChevronLeft, ChevronRight, Download, HandCoins, Headphones, Landmark, LogOut, Receipt, RotateCcw, Settings, Users, Wallet, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { rememberLogin } from '@/features/auth/LoginPage'


export default function MorePage() {
  const { i18n } = useTranslation()
  const nav = useNavigate()
  const { ur } = useLang()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const locale = i18n.language as Locale
  const role = me?.user.role
  const Chev = ur ? ChevronLeft : ChevronRight
  const [pinOpen, setPinOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState<unknown>(null)
  const [pinBusy, setPinBusy] = useState(false)

  const items: { key: string; Icon: typeof Settings; to?: string; roles?: string[] }[] = [
    { key: 'more.repairs', Icon: Wrench, to: '/repairs' },
    { key: 'more.exchange', Icon: ArrowLeftRight, to: '/exchange/new' },
    { key: 'more.accessories', Icon: Headphones, to: '/accessories' },
    { key: 'more.expenses', Icon: Wallet, to: '/expenses', roles: ['owner', 'manager'] },
    { key: 'more.sales', Icon: Receipt, to: '/sales' },
    { key: 'more.purchases', Icon: Download, to: '/purchases' },
    { key: 'more.payments', Icon: HandCoins, to: '/payments' },
    { key: 'more.loans', Icon: RotateCcw, to: '/loans' },
    { key: 'more.returns', Icon: RotateCcw, to: '/returns' },
    { key: 'more.notifications', Icon: Bell, to: '/more/notifications', roles: ['owner'] },
    { key: 'more.settings', Icon: Settings, to: '/more/settings', roles: ['owner'] },
    { key: 'more.cashAccounts', Icon: Landmark, to: '/more/cash', roles: ['owner', 'manager'] },
    { key: 'more.staff', Icon: Users, to: '/more/staff', roles: ['owner'] },
    { key: 'more.reports', Icon: BarChart3, to: '/reports', roles: ['owner', 'manager'] },
  ]

  return (
    <div className="flex flex-col gap-4">
      <BiLabel text="more.title" size="lg" bold />

      <div className="card flex flex-col gap-3">
        <BiLabel text="more.language" size="sm" tone="text-muted" />
        <BiSegmented<Locale> value={locale} onChange={setLocale} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی' } }]} />
        <BiLabel text="more.theme" size="sm" tone="text-muted" />
        <BiSegmented<Theme> value={theme} onChange={setTheme} options={[{ value: 'light', text: 'more.themeLight' }, { value: 'dark', text: 'more.themeDark' }, { value: 'system', text: 'more.themeSystem' }]} />
      </div>

      <div className="card flex flex-col p-1.5">
        {items.filter((it) => !it.roles || (role && it.roles.includes(role))).map(({ key, Icon, to }, i) => (
          <button key={key} type="button" disabled={!to} onClick={() => to && nav(to)} className={`tap flex items-center gap-3 px-3 py-2.5 text-start ${i ? 'border-t border-line' : ''} ${to ? '' : 'opacity-50'}`}>
            <span className="well h-9 w-9 bg-emerald-tint text-emerald-deep">
              <Icon size={18} />
            </span>
            <BiLabel text={key} size="md" className="flex-1" />
            {to ? <Chev size={18} className="text-muted/60" /> : <BiLabel text="dashboard.comingSoon" size="sm" tone="text-muted" />}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setPinOpen(true)} className="card tap flex items-center gap-3 text-start">
        <span className="well h-9 w-9 bg-emerald-tint text-emerald-deep"><KeyRound size={18} /></span>
        <BiLabel text="pin.set" size="md" className="flex-1" />
        <Chev size={18} className="text-muted/60" />
      </button>

      <div className="card flex flex-col gap-3">
        <div className="text-sm font-semibold text-muted" dir="ltr">
          {me?.user.name} · {me?.user.phone} · {me?.user.role}
        </div>
        <BiButton text="auth.logout" variant="danger" full onClick={logout} icon={<LogOut size={20} />} />
      </div>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="pin.set">
        <div className="flex flex-col gap-3">
          <BiLabel text="pin.setHint" size="sm" tone="text-muted" />
          <BiInput label="pin.current" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <BiInput label="pin.title" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          <ErrorText error={pinErr} />
          <BiButton text="common.save" full loading={pinBusy} disabled={pin.length < 4 || !pw} onClick={async () => {
            setPinBusy(true); setPinErr(null)
            try { await api('PUT', '/api/v1/me/pin', { password: pw, pin }); if (me) rememberLogin({ ...me, user: { ...me.user, has_pin: true } }); setPinOpen(false); setPw(''); setPin('') } catch (e) { setPinErr(e) } finally { setPinBusy(false) }
          }} />
        </div>
      </Sheet>

      <div className="text-center text-xs font-semibold text-muted/70" dir="ltr">
        v2.0.0
      </div>
    </div>
  )
}
