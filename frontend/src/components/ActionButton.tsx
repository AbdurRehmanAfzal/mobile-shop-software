/** A big action that reads as a button at first sight (shopkeepers 2026-11-19, ADR-113): a filled
 *  colour, an icon in its own well, the name in bold with one line under it saying what it is for
 *  (`Say`, ADR-112), an arrow at the end, a shadow that lifts it off the page and a press-down
 *  when tapped. The "?" sits in the top corner, outside the button (a button inside a button is
 *  not allowed, and a tap on "?" must not start the action). */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import Say from './Say'

/** fill, icon well, arrow circle */
const TONES = {
  get: ['bg-emerald text-white shadow-cta', 'bg-white/20 text-white', 'bg-white text-emerald-deep'],
  give: ['bg-ink text-ground shadow-hero', 'bg-white/15 text-ground', 'bg-ground text-ink'],
  out: ['border-2 border-payable/40 bg-payable-tint text-ink shadow-[0_6px_18px_-10px_rgba(27,31,36,.45)]', 'bg-payable text-white', 'bg-payable text-white'],
  in: ['border-2 border-receivable/40 bg-receivable-tint text-ink shadow-[0_6px_18px_-10px_rgba(27,31,36,.45)]', 'bg-receivable text-white', 'bg-receivable text-white'],
} as const

export default function ActionButton({ tone, icon, title, say, onClick, help, testid }: { tone: keyof typeof TONES; icon: ReactNode; title: string; say: string; onClick: () => void; help?: ReactNode; testid?: string }) {
  const { dir } = useLang()
  const Arrow = dir === 'rtl' ? ChevronLeft : ChevronRight
  const [fill, well, arrow] = TONES[tone]
  const dark = tone === 'get' || tone === 'give'
  return (
    <div className="relative">
      <button type="button" onClick={onClick} data-testid={testid} className={`tap flex min-h-[88px] w-full items-stretch gap-3 rounded-3xl p-3 text-start transition-transform duration-100 hover:brightness-[1.04] active:translate-y-0.5 active:scale-[.99] ${fill}`}>
        <span className={`well h-12 w-12 shrink-0 self-center rounded-2xl ${well}`}>{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <BiLabel text={title} size="md" bold tone="text-current" />
          <Say k={say} className={dark ? 'opacity-90' : 'text-ink/75'} />
        </span>
        {/* the arrow sits low so the "?" has the top corner */}
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full ${arrow}`} aria-hidden><Arrow size={20} strokeWidth={2.4} /></span>
      </button>
      {help ? <span className={`absolute end-2 top-1.5 ${dark ? '[&_button]:text-current' : ''} ${tone === 'get' ? 'text-white' : tone === 'give' ? 'text-ground' : ''}`}>{help}</span> : null}
    </div>
  )
}
