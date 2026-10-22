import { BarChart3, Bell, ChevronLeft, ChevronRight, Download, HandCoins, Landmark, LogOut, Receipt, RotateCcw, Settings, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { BiButton, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'

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

  const items: { key: string; Icon: typeof Settings; to?: string; roles?: string[] }[] = [
    { key: 'more.sales', Icon: Receipt, to: '/sales' },
    { key: 'more.purchases', Icon: Download, to: '/purchases' },
    { key: 'more.payments', Icon: HandCoins, to: '/payments' },
    { key: 'more.loans', Icon: RotateCcw, to: '/loans' },
    { key: 'more.returns', Icon: RotateCcw, to: '/returns' },
    { key: 'more.notifications', Icon: Bell, to: '/more/notifications', roles: ['owner'] },
    { key: 'more.settings', Icon: Settings, to: '/more/settings', roles: ['owner'] },
    { key: 'more.cashAccounts', Icon: Landmark },
    { key: 'more.staff', Icon: Users, roles: ['owner'] },
    { key: 'more.reports', Icon: BarChart3 },
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

      <div className="card flex flex-col gap-3">
        <div className="text-sm font-semibold text-muted" dir="ltr">
          {me?.user.name} · {me?.user.phone} · {me?.user.role}
        </div>
        <BiButton text="auth.logout" variant="danger" full onClick={logout} icon={<LogOut size={20} />} />
      </div>

      <div className="text-center text-xs font-semibold text-muted/70" dir="ltr">
        v2.0.0
      </div>
    </div>
  )
}
