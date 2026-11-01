/** The magic link a shopkeeper opens to see a renewal key (docs/28): no login, valid 7 days. */

import { Copy, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiAlert, BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { Loading, fmtDate } from '@/components/ui'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { api } from '@/lib/api'

interface Shown { shop: string; months: number; code: string; status: string; issued_at: string; expires_at: string | null }
const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }

export default function KeyPage() {
  const { token } = useParams()
  const { pick, ur, roman } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const [data, setData] = useState<Shown | null>(null)
  const [gone, setGone] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    api<Shown>('GET', `/api/v1/public/key/${token}`, undefined, { auth: false }).then(setData).catch(() => setGone(true))
  }, [token])
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-ground px-5 py-8" data-testid="key-page">
      <div className="flex justify-end gap-1.5">
        {LOCALES.map((l) => <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={`tap rounded-full border px-3 py-1 text-xs font-bold ${locale === l ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{LANG[l]}</button>)}
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="well h-14 w-14 bg-emerald-tint text-emerald-deep"><KeyRound size={26} /></span>
        <BiLabel text="keypage.title" size="lg" bold align="center" />
      </div>
      {gone ? <BiAlert text="keypage.expired" /> : !data ? <Loading /> : (
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-extrabold">{data.shop}</span>
            <span className="num rounded-full bg-emerald-tint px-2.5 py-1 text-xs font-bold text-emerald-deep" dir="ltr">{pick('prov.key.months').replace('{{n}}', String(data.months))}</span>
          </div>
          {data.status === 'redeemed' ? <BiAlert text="keypage.used" kind="info" /> : null}
          <span className="num select-all break-all rounded-xl bg-ground px-3 py-3 text-sm leading-relaxed" dir="ltr" data-testid="shown-key">{data.code}</span>
          <BiButton text={copied ? 'prov.key.copied' : 'prov.key.copy'} icon={<Copy size={18} />} full onClick={async () => { try { await navigator.clipboard.writeText(data.code) } catch { /* select-all text above */ } setCopied(true) }} />
          <BiLabel text="keypage.steps" size="sm" tone="text-muted" />
          {data.expires_at ? <span className="text-xs text-muted">{pick('keypage.validTill')} <span className="num" dir="ltr">{fmtDate(data.expires_at)}</span></span> : null}
        </div>
      )}
    </div>
  )
}
