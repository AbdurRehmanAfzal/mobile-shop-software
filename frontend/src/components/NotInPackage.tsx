/** What a shop's package does not include (owner 2026-11-21, ADR-122). A shop trades mobiles,
 *  laptops, accessories or any mix — the provider ticks them. Whatever is not ticked is hidden, and
 *  this says so in plain words with a WhatsApp message to the provider already written: which shop,
 *  what it wants added. Nothing is switched on from here — only the provider does that. */

import { Lock, MessageCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { MAKER } from '@/features/auth/AuthLayout'
import { activeShop, useAuth } from '@/lib/auth'
import { useTrade } from '@/lib/modules'
import { waNumber } from '@/lib/phone'
import { useGet } from '@/lib/queries'

export type Line = 'mobiles' | 'laptops' | 'accessories'
export const LINES: Line[] = ['mobiles', 'laptops', 'accessories']

/** the lines this shop was not given */
export function useMissingLines(): Line[] {
  const trade = useTrade()
  return LINES.filter((l) => !trade[l])
}

/** `only`: say it about these lines (a locked chip that was tapped); otherwise about all the missing ones */
export default function NotInPackage({ only, bare = false }: { only?: Line[]; bare?: boolean }) {
  const { pick, ur, cls } = useLang()
  const missing = useMissingLines()
  const shop = useAuth(activeShop)
  const phone = useAuth((s) => s.me?.user.phone)
  const { data: info } = useGet<{ whatsapp: string | null }>(['public-info'], '/api/v1/public/info')
  const lines = (only ?? missing).filter((l) => missing.includes(l))
  if (!lines.length) return null
  const names = lines.map((l) => pick(`pkg.line.${l}`)).join(ur ? '، ' : ', ')
  const to = info?.whatsapp ? waNumber(info.whatsapp) : MAKER.tel.replace('+', '')
  const text = pick('pkg.msg').replace('{{shop}}', shop?.name ?? '').replace('{{phone}}', phone ?? '').replace('{{lines}}', names)
  const small = ur ? cls('sm') : 'text-sm font-medium'
  return (
    <div className={`flex flex-col gap-2 ${bare ? '' : 'rounded-2xl border border-dashed border-line bg-ground p-3'}`} data-testid="not-in-package">
      <span className="flex items-start gap-2">
        <span className="well mt-0.5 h-8 w-8 shrink-0 rounded-xl bg-surface text-muted"><Lock size={16} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={ur ? cls('md') : 'text-[15px] font-extrabold'} data-testid="not-in-package-lines">{pick('pkg.title')}: {names}</span>
          <span className={`text-muted ${small}`}>{pick('pkg.text')}</span>
        </span>
      </span>
      <a href={`https://wa.me/${to}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 font-bold text-white ${ur ? cls('md') : 'text-[15px]'}`} data-testid="not-in-package-ask">
        <MessageCircle size={20} />{pick('pkg.ask')}
      </a>
    </div>
  )
}
