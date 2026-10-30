/** Forgot password (owner 2026-10-30): a code on WhatsApp, then a new password, straight in. When
 *  the shop's server cannot send codes, the old request-to-owner path stays. */

import { KeyRound, MessageCircle, Send } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang, type BiText } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { Sheet } from '@/components/ui'
import { ApiError, post } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { isValidPkMobile, normalisePhone } from '@/lib/format'

type Step = 'phone' | 'code' | 'password'
interface AuthResponse { tokens: { access_token: string; refresh_token: string }; me: MeOut }

export default function ForgotSheet({ open, onClose, phone, setPhone }: { open: boolean; onClose: () => void; phone: string; setPhone: (v: string) => void }) {
  const { pick, ur } = useLang()
  const setSession = useAuth((s) => s.setSession)
  const [step, setStep] = useState<Step>('phone')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<BiText | null>(null)
  const [requested, setRequested] = useState<'admin' | 'owner' | 'none' | null>(null)
  const [noSender, setNoSender] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const fail = (e: unknown) => setErr(e instanceof ApiError ? { en: e.messageEn, ur: e.messageUr, roman: e.messageEn } : { en: 'Request failed', ur: 'درخواست ناکام', roman: 'Request fail hui' })
  const reset = () => { setStep('phone'); setCode(''); setToken(''); setPw(''); setErr(null); setRequested(null); setNoSender(false); setDevCode(null) }

  const sendCode = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await post<{ delivery: 'echo' | 'whatsapp' | 'none' | 'unknown' | 'registered'; dev_code?: string }>('/api/v1/auth/otp/send', { phone: normalisePhone(phone), purpose: 'reset', lang: ur ? 'ur' : 'en' }, { auth: false })
      if (r.delivery === 'unknown') setRequested('none')
      else if (r.delivery === 'none') setNoSender(true)
      else { setDevCode(r.dev_code ?? null); setStep('code') }
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const verify = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await post<{ otp_token: string }>('/api/v1/auth/otp/verify', { phone: normalisePhone(phone), purpose: 'reset', code: code.trim() }, { auth: false })
      setToken(r.otp_token); setStep('password')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await post<AuthResponse>('/api/v1/auth/reset-password', { phone: normalisePhone(phone), otp_token: token, password: pw }, { auth: false })
      setSession(r.tokens, r.me)
      onClose()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const request = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await post<{ to: 'admin' | 'owner' | 'none' }>('/api/v1/auth/forgot', { phone: normalisePhone(phone) }, { auth: false })
      setRequested(r.to)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="auth.forgotTitle">
      <div className="flex flex-col gap-3">
        {step === 'phone' ? (
          <>
            <BiLabel text="otp.hint" size="sm" tone="text-muted" />
            <PhoneInput label="auth.phone" value={phone} onChange={setPhone} />
            {requested ? <BiAlert text={`auth.forgotSent_${requested}`} kind={requested === 'none' ? 'info' : 'success'} /> : null}
            {noSender ? <BiAlert text="otp.noSender" kind="info" /> : null}
            {err ? <BiAlert text={err} /> : null}
            {!noSender ? <BiButton type="button" text="otp.send" icon={<MessageCircle size={20} />} full loading={busy} disabled={!isValidPkMobile(phone)} onClick={sendCode} /> : null}
            {noSender || requested ? <BiButton type="button" text="auth.forgotSend" icon={<Send size={20} />} variant={noSender ? 'primary' : 'ghost'} full loading={busy} disabled={!isValidPkMobile(phone) || !!requested} onClick={request} /> : (
              <button type="button" onClick={request} disabled={!isValidPkMobile(phone) || busy} className="tap py-1 disabled:opacity-50"><BiLabel text="otp.orRequest" size="sm" tone="text-muted" align="center" /></button>
            )}
          </>
        ) : step === 'code' ? (
          <>
            <BiLabel text={{ en: `${pick('otp.sentTo')} ${normalisePhone(phone)}`, ur: `${pick('otp.sentTo')} ${normalisePhone(phone)}`, roman: `${pick('otp.sentTo')} ${normalisePhone(phone)}` }} size="sm" tone="text-muted" />
            {devCode ? <BiAlert text={{ en: `Test code: ${devCode}`, ur: `ٹیسٹ کوڈ: ${devCode}`, roman: `Test code: ${devCode}` }} kind="info" /> : null}
            <BiInput label="otp.code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num text-2xl tracking-[.3em]" dir="ltr" autoFocus />
            {err ? <BiAlert text={err} /> : null}
            <BiButton type="button" text="otp.verify" icon={<KeyRound size={20} />} full loading={busy} disabled={code.length < 4} onClick={verify} />
            <button type="button" onClick={sendCode} disabled={busy} className="tap py-1"><BiLabel text="otp.resend" size="sm" tone="text-emerald" align="center" /></button>
          </>
        ) : (
          <>
            <BiLabel text="otp.newPasswordHint" size="sm" tone="text-muted" />
            <BiInput label="staff.resetPassword" type="password" autoComplete="new-password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            {err ? <BiAlert text={err} /> : null}
            <BiButton type="button" text="otp.setPassword" full loading={busy} disabled={pw.length < 6} onClick={save} />
          </>
        )}
      </div>
    </Sheet>
  )
}
