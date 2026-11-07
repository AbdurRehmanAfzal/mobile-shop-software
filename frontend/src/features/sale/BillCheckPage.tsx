/** The page a bill's QR opens (owner 2026-11-07): /b/<token>, no login. The customer sees the bill —
 *  shop, number, date, items, total, paid and what is left — so they keep a copy and know it is
 *  genuine. Never their name or phone, the full IMEI, a cost or their khata balance. */

import { BadgeCheck, Phone, Receipt } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiAlert, BiLabel, useLang } from '@/components/Bilingual'
import { Loading, fmtDate } from '@/components/ui'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { api } from '@/lib/api'
import { withCur } from '@/lib/format'

interface Bill {
  shop: { name: string; name_ur: string | null; phone: string | null; city: string | null; locale: string }
  no: string; date: string; state: 'paid' | 'partial' | 'unpaid' | 'void' | 'returned'
  lines: { label: string; imei_last4: string | null; qty: number; unit_price: string; line_total: string; warranty_days: number }[]
  subtotal: string; discount: string; tax: string; total: string; returned: string; paid: string; due: string; fbr_invoice_no: string | null
}
const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const n = (v: string | number) => withCur(Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const TONE: Record<Bill['state'], string> = {
  paid: 'bg-emerald-tint text-emerald-deep',
  partial: 'bg-khata text-khata-fg',
  unpaid: 'bg-khata text-khata-fg',
  void: 'bg-payable-tint text-payable',
  returned: 'bg-ret text-ret-fg',
}

export default function BillCheckPage() {
  const { token } = useParams()
  const { pick, ur, roman, cls } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const [data, setData] = useState<Bill | null>(null)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    api<Bill>('GET', `/api/v1/public/bill/${token}`, undefined, { auth: false })
      .then((v) => {
        try { if (!localStorage.getItem('locale') && (LOCALES as readonly string[]).includes(v.shop.locale)) setLocale(v.shop.locale as Locale) } catch { /* private mode */ }
        setData(v)
      })
      .catch(() => setGone(true))
  }, [token])
  const small = ur ? cls('sm') : 'text-sm'
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between gap-3">
      <BiLabel text={label} size="sm" tone={strong ? 'text-ink' : 'text-muted'} bold={strong} />
      <span className={`num ${strong ? 'text-lg font-extrabold' : 'font-bold'}`} dir="ltr">{value}</span>
    </div>
  )
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-ground px-5 py-8" data-testid="bill-check-page">
      <div className="flex justify-end gap-1.5">
        {LOCALES.map((l) => <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={`tap rounded-full border px-3 py-1 text-xs font-bold ${locale === l ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{LANG[l]}</button>)}
      </div>
      {gone ? <BiAlert text="billcheck.gone" /> : !data ? <Loading /> : (
        <>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-lg font-extrabold">{ur && data.shop.name_ur ? data.shop.name_ur : data.shop.name}</span>
            {data.shop.city ? <span className={`text-muted ${small}`}>{data.shop.city}</span> : null}
          </div>
          <section className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${TONE[data.state]}`} data-testid="bill-state">
            <span className="flex items-center gap-2"><BadgeCheck size={22} /><BiLabel text="billcheck.genuine" size="md" bold tone="text-current" /></span>
            <span className="flex items-center gap-2"><Receipt size={18} /><span className="num text-base" dir="ltr">{data.no}</span><span className={`opacity-80 ${small}`} dir="ltr">· {fmtDate(data.date)}</span></span>
            <BiLabel text={`billcheck.state.${data.state}`} size="sm" bold tone="text-current" />
          </section>

          <div className="card flex flex-col gap-0 p-0">
            {data.lines.map((ln, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{ln.label}</span>
                  <span className="text-xs text-muted" dir="ltr">
                    {ln.qty} × {n(ln.unit_price)}{ln.imei_last4 ? ` · ••••${ln.imei_last4}` : ''}
                  </span>
                  {ln.warranty_days ? <BiLabel text={{ en: pick('billcheck.warranty').replace('{{n}}', String(ln.warranty_days)), ur: pick('billcheck.warranty').replace('{{n}}', String(ln.warranty_days)) }} size="sm" tone="text-muted" /> : null}
                </span>
                <span className="num shrink-0 font-bold" dir="ltr">{n(ln.line_total)}</span>
              </div>
            ))}
          </div>

          <div className="card flex flex-col gap-2">
            {row('billcheck.subtotal', n(data.subtotal))}
            {Number(data.discount) > 0 ? row('billcheck.discount', `−${n(data.discount)}`) : null}
            {Number(data.tax) > 0 ? row('billcheck.tax', n(data.tax)) : null}
            {row('billcheck.total', n(data.total), true)}
            {Number(data.returned) > 0 ? row('billcheck.returned', `−${n(data.returned)}`) : null}
            {row('billcheck.paid', n(data.paid))}
            {Number(data.due) > 0 ? row('billcheck.due', n(data.due), true) : null}
            {data.fbr_invoice_no ? <div className="flex items-center justify-between gap-3 border-t border-line pt-2"><BiLabel text="billcheck.fbr" size="sm" tone="text-muted" /><span className="num text-xs" dir="ltr">{data.fbr_invoice_no}</span></div> : null}
          </div>

          {data.shop.phone ? (
            <a href={`tel:${data.shop.phone}`} className="tap flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-ink px-5 font-semibold text-ground">
              <Phone size={20} /> <span>{pick('billcheck.call')}</span> <span className="num" dir="ltr">{data.shop.phone}</span>
            </a>
          ) : null}
          <BiLabel text="billcheck.footer" size="sm" tone="text-muted" align="center" />
        </>
      )}
    </div>
  )
}
