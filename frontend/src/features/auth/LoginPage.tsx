import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, post } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { isValidPkMobile, normalisePhone } from '@/lib/format'
import { BiAlert, BiButton, BiInput, BiLabel } from '@/components/Bilingual'
import AuthLayout from './AuthLayout'

interface AuthResponse {
  tokens: { access_token: string; refresh_token: string }
  me: MeOut
}

export default function LoginPage() {
  const setSession = useAuth((s) => s.setSession)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ en: string; ur: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidPkMobile(phone)) {
      setError({ en: 'Enter a valid mobile number (03XXXXXXXXX)', ur: 'درست موبائل نمبر درج کریں (03XXXXXXXXX)' })
      return
    }
    setBusy(true)
    try {
      const res = await post<AuthResponse>('/api/v1/auth/login', { phone: normalisePhone(phone), password }, { auth: false })
      setSession(res.tokens, res.me)
    } catch (err) {
      if (err instanceof ApiError) setError({ en: err.messageEn, ur: err.messageUr })
      else setError({ en: 'Cannot reach server', ur: 'سرور سے رابطہ نہیں ہو سکا' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="auth.login">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <BiInput
          label="auth.phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="03001234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <BiInput
          label="auth.password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <BiAlert text={error} /> : null}
        <BiButton type="submit" text="auth.login" full loading={busy} />
        <Link to="/signup" className="tap block rounded-xl py-2 text-center">
          <BiLabel text="auth.noAccount" size="sm" align="center" tone="text-brand-700" />
        </Link>
      </form>
    </AuthLayout>
  )
}
