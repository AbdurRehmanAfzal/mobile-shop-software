import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, post } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { isValidPkMobile, normalisePhone } from '@/lib/format'
import { BiAlert, BiButton, BiInput, BiLabel } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import AuthLayout from './AuthLayout'
import { rememberLogin } from './LoginPage'

interface AuthResponse {
  tokens: { access_token: string; refresh_token: string }
  me: MeOut
}

export default function SignupPage() {
  const setSession = useAuth((s) => s.setSession)
  const [form, setForm] = useState({ shop_name: '', owner_name: '', city: '', phone: '', password: '' })
  const [error, setError] = useState<{ en: string; ur: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidPkMobile(form.phone)) {
      setError({ en: 'Enter a valid mobile number (03XXXXXXXXX)', ur: 'درست موبائل نمبر درج کریں (03XXXXXXXXX)' })
      return
    }
    if (form.password.length < 6) {
      setError({ en: 'Password must be at least 6 characters', ur: 'پاس ورڈ کم از کم 6 حروف کا ہو' })
      return
    }
    setBusy(true)
    try {
      const res = await post<AuthResponse>(
        '/api/v1/auth/signup',
        {
          shop_name: form.shop_name,
          owner_name: form.owner_name,
          city: form.city || null,
          phone: normalisePhone(form.phone),
          password: form.password,
          locale: document.documentElement.lang === 'en' ? 'en' : 'ur',
        },
        { auth: false },
      )
      rememberLogin(res.me)
      setSession(res.tokens, res.me)
    } catch (err) {
      if (err instanceof ApiError) setError({ en: err.messageEn, ur: err.messageUr })
      else setError({ en: 'Cannot reach server', ur: 'سرور سے رابطہ نہیں ہو سکا' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="auth.signup">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <BiInput label="auth.shopName" value={form.shop_name} onChange={set('shop_name')} required minLength={2} />
        <BiInput label="auth.ownerName" value={form.owner_name} onChange={set('owner_name')} required minLength={2} />
        <BiInput label="auth.city" value={form.city} onChange={set('city')} />
        <PhoneInput label="auth.phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} required />
        <BiInput
          label="auth.password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          required
          minLength={6}
        />
        {error ? <BiAlert text={error} /> : null}
        <BiButton type="submit" text="auth.signup" full loading={busy} />
        <Link to="/login" className="tap block rounded-xl py-2 text-center">
          <BiLabel text="auth.haveAccount" size="sm" align="center" tone="text-brand-700" />
        </Link>
      </form>
    </AuthLayout>
  )
}
