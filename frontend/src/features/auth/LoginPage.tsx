import { Fingerprint, Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, post } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { isValidPkMobile, normalisePhone, toLatinDigits } from '@/lib/format'
import { BiAlert, BiButton, BiInput, BiLabel, type BiText } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { fingerprintLogin, isOnHere } from '@/lib/fingerprint'
import AuthLayout from './AuthLayout'
import ForgotSheet from './ForgotSheet'

interface AuthResponse {
  tokens: { access_token: string; refresh_token: string }
  me: MeOut
}
interface Last { phone: string; name: string; hasPin: boolean }

const LAST_KEY = 'mobileshop.lastLogin'
function readLast(): Last | null {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') } catch { return null }
}
export function rememberLogin(me: MeOut) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ phone: me.user.phone, name: me.user.name, hasPin: !!(me.user as { has_pin?: boolean }).has_pin })) } catch { /* ignore */ }
}

export function forgetLogin() {
  try { localStorage.removeItem(LAST_KEY) } catch { /* ignore */ }
}

export default function LoginPage() {
  const setSession = useAuth((s) => s.setSession)
  const last = readLast()
  const [mode, setMode] = useState<'pin' | 'password'>(last?.hasPin ? 'pin' : 'password')
  const [phone, setPhone] = useState(last?.phone ?? '')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<BiText | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  async function go(path: string, body: unknown) {
    setError(null)
    setBusy(true)
    try {
      const res = await post<AuthResponse>(path, body, { auth: false })
      rememberLogin(res.me)
      setSession(res.tokens, res.me)
    } catch (err) {
      setPin('')
      if (err instanceof ApiError) setError({ en: err.messageEn, ur: err.messageUr })
      else setError({ en: 'Cannot reach server', ur: 'سرور سے رابطہ نہیں ہو سکا' })
    } finally {
      setBusy(false)
    }
  }

  // owner 2026-10-28: on a phone / browser set up for it, one touch instead of the password
  async function fingerprint() {
    setError(null)
    setBusy(true)
    try {
      const res = await fingerprintLogin()
      rememberLogin(res.me)
      setSession(res.tokens, res.me)
    } catch (err) {
      if (err instanceof ApiError) setError({ en: err.messageEn, ur: err.messageUr })
      else setError({ en: 'Fingerprint was not accepted. Log in with your password.', ur: 'فنگر پرنٹ قبول نہیں ہوا۔ پاس ورڈ سے لاگ اِن کریں۔' })
    } finally {
      setBusy(false)
    }
  }
  const fpButton = isOnHere() ? (
    <BiButton type="button" text="fp.loginWith" icon={<Fingerprint size={24} />} full loading={busy} onClick={fingerprint} />
  ) : null

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    if (!isValidPkMobile(phone)) {
      setError({ en: 'Enter a valid mobile number (03XXXXXXXXX)', ur: 'درست موبائل نمبر درج کریں (03XXXXXXXXX)' })
      return
    }
    go('/api/v1/auth/login', { phone: normalisePhone(phone), password })
  }

  function submitPin(e: FormEvent) {
    e.preventDefault()
    go('/api/v1/auth/pin-login', { phone: normalisePhone(phone), pin })
  }

  if (mode === 'pin' && last) {
    return (
      <AuthLayout title="pin.title">
        <form onSubmit={submitPin} className="flex flex-col items-center gap-4">
          <span className="well h-16 w-16 rounded-full bg-emerald-tint text-emerald-deep"><Lock size={28} /></span>
          <div className="text-center">
            <div className="text-lg font-bold">{last.name}</div>
            <div className="text-sm text-muted" dir="ltr">{last.phone}</div>
          </div>
          <div className="flex gap-2" dir="ltr">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={`h-12 w-10 rounded-xl border-2 ${i < pin.length ? 'border-emerald bg-emerald-tint' : 'border-line bg-surface'} flex items-center justify-center text-2xl`}>{i < pin.length ? '•' : ''}</span>
            ))}
          </div>
          <input
            aria-label="PIN"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
            className="absolute h-px w-px opacity-0"
          />
          <div className="grid w-full grid-cols-3 gap-2" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) => (
              k === '' ? <span key="blank" /> : (
                <button key={k} type="button" onClick={() => setPin((p) => (k === '⌫' ? p.slice(0, -1) : (p + k).slice(0, 6)))} className="tap min-h-14 rounded-2xl border border-line bg-surface text-2xl font-bold">
                  {k}
                </button>
              )
            ))}
          </div>
          {error ? <BiAlert text={error} /> : null}
          <BiButton type="submit" text="common.next" full loading={busy} disabled={pin.length < 4} />
          {fpButton}
          <button type="button" onClick={() => setMode('password')} className="tap py-2">
            <BiLabel text="pin.forgot" size="sm" tone="text-emerald" align="center" />
          </button>
          <div className="w-full border-t border-line pt-4">
            <BiButton type="button" text="pin.otherAccount" variant="secondary" size="sm" full onClick={() => { forgetLogin(); setPhone(''); setMode('password') }} />
          </div>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="auth.login">
      <form onSubmit={submitPassword} className="flex flex-col gap-4">
        {fpButton ? (
          <>
            {fpButton}
            <BiLabel text="fp.orPassword" size="sm" tone="text-muted" align="center" />
          </>
        ) : null}
        <PhoneInput label="auth.phone" value={phone} onChange={setPhone} required />
        <BiInput label="auth.password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <BiAlert text={error} /> : null}
        <BiButton type="submit" text="auth.login" full loading={busy} />
        <Link to="/welcome" className="tap block py-1 text-center">
          <BiLabel text="landing.about" size="sm" tone="text-muted" align="center" />
        </Link>
        <button type="button" onClick={() => setForgotOpen(true)} className="tap py-2">
          <BiLabel text="auth.forgot" size="sm" tone="text-emerald" align="center" />
        </button>
        <ForgotSheet open={forgotOpen} onClose={() => setForgotOpen(false)} phone={phone} setPhone={setPhone} />
        {last?.hasPin ? (
          <button type="button" onClick={() => setMode('pin')} className="tap py-1">
            <BiLabel text="pin.usePin" size="sm" tone="text-emerald" align="center" />
          </button>
        ) : null}
      </form>
    </AuthLayout>
  )
}
