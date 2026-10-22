import { BarChart3, ChevronRight, LogOut, Settings, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { BiButton, BiLabel, BiSegmented } from '@/components/Bilingual'

export default function MorePage() {
  const { i18n } = useTranslation()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const locale = i18n.language as Locale

  return (
    <div className="flex flex-col gap-4">
      <BiLabel text="more.title" size="lg" bold />

      <div className="card flex flex-col gap-3">
        <BiLabel text="more.language" size="sm" tone="text-muted" />
        <BiSegmented<Locale>
          value={locale}
          onChange={setLocale}
          options={[
            { value: 'ur', text: { en: 'Urdu', ur: 'اردو' } },
            { value: 'en', text: { en: 'English', ur: 'انگریزی' } },
          ]}
        />
        <BiLabel text="more.theme" size="sm" tone="text-muted" />
        <BiSegmented<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', text: 'more.themeLight' },
            { value: 'dark', text: 'more.themeDark' },
            { value: 'system', text: 'more.themeSystem' },
          ]}
        />
      </div>

      <div className="card flex flex-col p-1.5">
        {[
          { key: 'more.settings', Icon: Settings },
          { key: 'more.staff', Icon: Users },
          { key: 'more.reports', Icon: BarChart3 },
        ].map(({ key, Icon }, i) => (
          <div key={key} className={`flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
            <span className="well h-9 w-9 bg-emerald-tint text-emerald-deep">
              <Icon size={18} />
            </span>
            <BiLabel text={key} size="md" className="flex-1" tone="text-muted" />
            <ChevronRight size={18} className="text-muted/60" />
          </div>
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
