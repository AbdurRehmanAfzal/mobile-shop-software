/** Super admin: the Android app's link, to download it or send it to a shop on WhatsApp or any other
 *  app (owner, 2026-10-28). The link always gives the latest app (built by each release). */

import { Capacitor } from '@capacitor/core'
import { Check, Download, MessageCircle, Share2, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'

/** the site's address, also inside the Android app (whose own origin is https://localhost) */
export const SITE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
export const APP_LINK = `${SITE}/app.apk`

export default function AppLinkCard() {
  const { pick } = useLang()
  const [copied, setCopied] = useState(false)
  const text = `${pick('appLink.message')}\n${APP_LINK}`

  async function share() {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share')
        await Share.share({ title: 'Mobile Shop', text, url: APP_LINK })
      } else if (navigator.share) {
        await navigator.share({ title: 'Mobile Shop', text })
      } else {
        await navigator.clipboard.writeText(APP_LINK)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      /* the share sheet was closed */
    }
  }

  const btn = 'tap flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl font-bold text-[13px]'
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><Smartphone size={22} /></span>
        <div className="flex min-w-0 flex-col">
          <BiLabel text="appLink.title" size="lg" bold />
          <span className="truncate text-sm text-muted" dir="ltr">{APP_LINK}</span>
        </div>
      </div>
      <BiLabel text="appLink.hint" size="sm" tone="text-muted" />
      <div className="grid grid-cols-3 gap-2">
        <a href={APP_LINK} download className={`${btn} border border-line bg-surface text-ink`}>
          <Download size={22} /> {pick('appLink.download')}
        </a>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald text-white`}>
          <MessageCircle size={22} /> WhatsApp
        </a>
        <button type="button" onClick={share} className={`${btn} border border-line bg-surface text-ink`}>
          {copied ? <Check size={22} /> : <Share2 size={22} />} {pick(copied ? 'appLink.copied' : 'appLink.share')}
        </button>
      </div>
    </section>
  )
}
