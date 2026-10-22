import { useTranslation } from 'react-i18next'
import { setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { BiButton, BiLabel } from '@/components/Bilingual'

export default function MorePage() {
  const { i18n } = useTranslation()
  const logout = useAuth((s) => s.logout)
  const me = useAuth((s) => s.me)
  const current = i18n.language as Locale

  return (
    <div className="flex flex-col gap-4">
      <BiLabel text="more.title" size="lg" bold />

      <div className="card">
        <BiLabel text="more.language" size="sm" tone="text-slate-500" className="mb-2" />
        <div className="grid grid-cols-2 gap-2">
          <BiButton
            text={{ en: 'Urdu', ur: 'اردو' }}
            variant={current === 'ur' ? 'primary' : 'secondary'}
            size="md"
            onClick={() => setLocale('ur')}
          />
          <BiButton
            text={{ en: 'English', ur: 'انگریزی' }}
            variant={current === 'en' ? 'primary' : 'secondary'}
            size="md"
            onClick={() => setLocale('en')}
          />
        </div>
      </div>

      <div className="card flex flex-col gap-2">
        <BiLabel text="more.settings" size="md" tone="text-slate-400" />
        <BiLabel text="more.staff" size="md" tone="text-slate-400" />
        <BiLabel text="more.reports" size="md" tone="text-slate-400" />
        <BiLabel text="dashboard.comingSoon" size="sm" tone="text-slate-400" />
      </div>

      <div className="card">
        <div className="mb-3 text-sm text-slate-500" dir="ltr">
          {me?.user.name} · {me?.user.phone} · {me?.user.role}
        </div>
        <BiButton text="auth.logout" variant="danger" full onClick={logout} />
      </div>

      <div className="text-center text-xs text-slate-400" dir="ltr">
        v2.0.0
      </div>
    </div>
  )
}
