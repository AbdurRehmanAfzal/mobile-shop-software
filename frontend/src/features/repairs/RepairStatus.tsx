/** The customer's repair status link (docs/35 §5 item 5): the shop sends it on WhatsApp from the job,
 *  the customer opens it without logging in and sees the progress, the promised day and what is
 *  left to pay. Never the phone number, the full IMEI, the lock, the lab or any cost. */

import { CheckCircle2, Copy, MessageCircle, Phone, Share2, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiAlert, BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Loading, Sheet, fmtDate } from '@/components/ui'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { api } from '@/lib/api'
import { withCur } from '@/lib/format'

interface View {
  shop: { name: string; name_ur: string | null; phone: string | null; city: string | null; locale: string }
  no: string; device: string; imei_last4: string | null; faults: { code: string; en: string; ur: string }[]; fault_text: string | null
  status: string; at_workshop: boolean; steps: { status: string; at: string | null }[]; received_at: string; promised_at: string | null
  delivered_at: string | null; closed: boolean; bill: string; paid: string; left: string; final: boolean; warranty_days: number
}
const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

export function statusUrl(token: string) {
  return `${window.location.origin}/r/${token}`
}

/** on the job page: the link, sent on WhatsApp to the customer's number, or copied */
export function StatusLinkSheet({ open, onClose, token, phone, name, device, no }: { open: boolean; onClose: () => void; token: string; phone: string | null; name: string | null; device: string; no: string }) {
  const { pick } = useLang()
  const [copied, setCopied] = useState(false)
  const url = statusUrl(token)
  const text = pick('rstatus.message').replace('{{name}}', name ?? '').replace('{{device}}', device).replace('{{no}}', no).replace('{{link}}', url).trim()
  const wa = phone ? `https://wa.me/92${phone.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
  return (
    <Sheet open={open} onClose={onClose} title="rstatus.send">
      <div className="flex flex-col gap-3" data-testid="status-link-sheet">
        <span className="flex items-start gap-1"><BiLabel text="rstatus.sendHint" size="sm" tone="text-muted" /><Help term="rstatus.link" size="sm" /></span>
        <span className="num select-all break-all rounded-xl bg-ground px-3 py-3 text-sm" dir="ltr" data-testid="status-link">{url}</span>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="tap flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-emerald px-5 font-semibold text-white">
          <MessageCircle size={20} /> <span>{pick('rstatus.whatsapp')}</span>
        </a>
        <BiButton text={copied ? 'rstatus.copied' : 'rstatus.copy'} icon={<Copy size={18} />} variant="secondary" full onClick={async () => { try { await navigator.clipboard.writeText(url) } catch { /* the link above can be selected */ } setCopied(true) }} />
      </div>
    </Sheet>
  )
}

export function StatusLinkButton(props: { token?: string | null; phone: string | null; name: string | null; device: string; no: string }) {
  const [open, setOpen] = useState(false)
  if (!props.token) return null
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiButton text="rstatus.send" icon={<Share2 size={20} />} size="md" variant="secondary" full onClick={() => setOpen(true)} /></div>
        <Help term="rstatus.link" size="sm" />
      </div>
      <StatusLinkSheet {...props} token={props.token} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** the page the customer opens: /r/<token> */
export default function RepairStatusPage() {
  const { token } = useParams()
  const { pick, ur, roman, cls } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const [data, setData] = useState<View | null>(null)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    api<View>('GET', `/api/v1/public/repair/${token}`, undefined, { auth: false })
      .then((v) => {
        // the customer sees the shop's language unless they picked one on this phone before
        try { if (!localStorage.getItem('locale') && (LOCALES as readonly string[]).includes(v.shop.locale)) setLocale(v.shop.locale as Locale) } catch { /* private mode */ }
        setData(v)
      })
      .catch(() => setGone(true))
  }, [token])
  const small = ur ? cls('sm') : 'text-sm'
  const reached = (s: string) => data?.steps.find((x) => x.status === s)?.at
  const ready = data && (data.status === 'repaired' || data.status === 'delivered')
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-ground px-5 py-8" data-testid="repair-status-page">
      <div className="flex justify-end gap-1.5">
        {LOCALES.map((l) => <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={`tap rounded-full border px-3 py-1 text-xs font-bold ${locale === l ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{LANG[l]}</button>)}
      </div>
      {gone ? <BiAlert text="rstatus.gone" /> : !data ? <Loading /> : (
        <>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-lg font-extrabold">{ur && data.shop.name_ur ? data.shop.name_ur : data.shop.name}</span>
            {data.shop.city ? <span className={`text-muted ${small}`}>{data.shop.city}</span> : null}
          </div>
          <section className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${ready ? 'bg-emerald-tint text-emerald-deep' : 'bg-repair text-repair-fg'}`}>
            <span className="flex items-center gap-2">{ready ? <CheckCircle2 size={22} /> : <Wrench size={22} />}<BiLabel text={`repair.status.${data.status}`} size="lg" bold tone="text-current" /></span>
            <span className="text-base font-bold"><bdi>{data.device}</bdi>{data.imei_last4 ? <span className="font-medium opacity-75"> · <bdi dir="ltr">••••{data.imei_last4}</bdi></span> : null}</span>
            <span className={`opacity-80 ${small}`} dir="ltr">{data.no}</span>
            {data.at_workshop && !data.closed ? <BiLabel text="rstatus.atWorkshop" size="sm" tone="text-current" /> : null}
          </section>

          <div className="card flex flex-col gap-0 p-0" data-testid="status-steps">
            {data.steps.map((s, i) => {
              const at = reached(s.status)
              return (
                <div key={s.status} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${at ? 'bg-emerald text-white' : 'border-2 border-line text-muted'}`}>{at ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold">{i + 1}</span>}</span>
                  <span className={`flex-1 ${at ? 'font-bold' : 'text-muted'} ${ur ? cls('md') : 'text-[15px]'}`}>{pick(`repair.status.${s.status}`)}</span>
                  {at ? <span className="text-xs text-muted" dir="ltr">{fmtDate(at)}</span> : null}
                </div>
              )
            })}
          </div>

          <div className="card flex flex-col gap-2">
            {data.faults.length || data.fault_text ? (
              <div className="flex flex-wrap gap-1.5">
                {data.faults.map((f) => <span key={f.code} className={`rounded-full bg-ground px-2.5 py-0.5 font-bold ${ur ? cls('sm') : 'text-xs'}`}>{ur ? f.ur : f.en}</span>)}
                {data.fault_text ? <span className={`rounded-full bg-ground px-2.5 py-0.5 font-bold ${ur ? cls('sm') : 'text-xs'}`}>{data.fault_text}</span> : null}
              </div>
            ) : null}
            {data.promised_at && !data.closed ? <div className="flex items-center justify-between"><BiLabel text="rstatus.promised" size="sm" tone="text-muted" /><span className="num font-bold" dir="ltr">{fmtDate(data.promised_at)}</span></div> : null}
            <div className="flex items-center justify-between"><BiLabel text={data.final ? 'rstatus.bill' : 'rstatus.estimate'} size="sm" tone="text-muted" /><span className="num font-bold" dir="ltr">{withCur(n(data.bill))}</span></div>
            <div className="flex items-center justify-between"><BiLabel text="rstatus.paid" size="sm" tone="text-muted" /><span className="num font-bold" dir="ltr">{withCur(n(data.paid))}</span></div>
            {Number(data.left) > 0 ? <div className="flex items-center justify-between"><BiLabel text="rstatus.left" size="sm" bold /><span className="num text-lg font-extrabold" dir="ltr">{withCur(n(data.left))}</span></div> : null}
            {data.status === 'delivered' && data.warranty_days ? <BiLabel text={{ en: pick('rstatus.warranty').replace('{{n}}', String(data.warranty_days)), ur: pick('rstatus.warranty').replace('{{n}}', String(data.warranty_days)) }} size="sm" tone="text-muted" /> : null}
          </div>

          {data.shop.phone ? (
            <a href={`tel:${data.shop.phone}`} className="tap flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-ink px-5 font-semibold text-ground">
              <Phone size={20} /> <span>{pick('rstatus.call')}</span> <span className="num" dir="ltr">{data.shop.phone}</span>
            </a>
          ) : null}
          <BiLabel text="rstatus.footer" size="sm" tone="text-muted" align="center" />
        </>
      )}
    </div>
  )
}
