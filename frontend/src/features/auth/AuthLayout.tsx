/** Login / PIN frame (docs/11 v2.2 Modern): soft accent gradient on top, brand mark, one white card,
 *  language switch, and the maker's footer. Shops are opened by the product owner, so instead of a
 *  "create shop" button there is a "contact us" line (owner, 2026-10-26). */

import { Globe, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiLabel, useLang, type BiText } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'

const MAKER = { company: 'OOP Solutions', site: 'oopsolutions.com', person: 'Abdur Rehman Afzal', phone: '+92 316 4001668', tel: '+923164001668' }
const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }

export default function AuthLayout({ title, children }: { title: string | BiText; children: ReactNode }) {
  const { ur, roman } = useLang()
  const current: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  return (
    <div className="relative flex min-h-dvh flex-col bg-ground">
      {/* accent wash behind the top, like Stripe's hero gradients */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,rgb(var(--emerald))_0%,rgb(var(--hero))_100%)] opacity-95 [clip-path:polygon(0_0,100%_0,100%_78%,0_100%)]" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="flex justify-end gap-1.5" dir="ltr">
          {LOCALES.map((l) => (
            <button key={l} type="button" aria-pressed={l === current} onClick={() => setLocale(l)} className={`tap h-9 rounded-full px-3 text-[13px] font-bold ${l === current ? 'bg-white text-ink' : 'bg-white/15 text-white'} ${l === 'ur' ? 'ur' : ''}`}>
              {LANG[l]}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-white">
          <span className="well h-16 w-16 rounded-2xl bg-white text-emerald shadow-[0_10px_30px_-12px_rgba(0,0,0,.45)]">
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="7" y="2" width="10" height="20" rx="2.5" />
              <path d="M11 18h2" />
            </svg>
          </span>
          <BiLabel text="app.name" size="xl" bold align="center" tone="text-white" />
          <BiLabel text="app.tagline" size="sm" align="center" tone="text-white/80" />
        </div>

        <div className="card mt-6 p-6 shadow-[0_24px_48px_-24px_rgba(10,37,64,.35)]">
          <BiLabel text={title} size="lg" bold className="mb-5" />
          {children}
        </div>


        <a href={`tel:${MAKER.tel}`} className="tap mt-4 flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center">
          <Phone size={16} className="shrink-0 text-emerald" />
          <BiLabel text="auth.wantApp" size="sm" align="center" tone="text-muted" />
        </a>

        <footer className="mt-auto flex flex-col items-center gap-1 border-t border-line py-5 text-center text-[13px] text-muted" dir="ltr">
          <span>
            <BiLabel text="auth.madeBy" size="sm" align="center" tone="text-muted" className="inline" />{' '}
            <a href={`https://${MAKER.site}`} target="_blank" rel="noopener noreferrer" className="font-bold text-ink">{MAKER.company}</a>
          </span>
          <a href={`https://${MAKER.site}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald">
            <Globe size={14} /> {MAKER.site}
          </a>
          <a href={`tel:${MAKER.tel}`} className="inline-flex items-center gap-1 font-semibold">
            {MAKER.person} · <span className="num font-bold">{MAKER.phone}</span>
          </a>
        </footer>
      </div>
    </div>
  )
}
