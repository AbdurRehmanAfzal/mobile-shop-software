/** A small "?" next to a word shopkeepers may not know (owner, 2026-10-28: "credit, PTA ... non
 *  technical user ko nahi pata"). Tapping it opens a short, plain explanation with an example.
 *  Texts: i18n `help.<term>.title / body / example` in en, ur and roman. */

import i18next from 'i18next'
import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { Sheet } from './ui'

export type HelpTerm =
  | 'udhaar' | 'khata' | 'cost' | 'asking' | 'profit' | 'pta' | 'imei' | 'idcheck'
  | 'opening' | 'cut' | 'inHand' | 'warranty' | 'tid' | 'cheque' | 'remittance' | 'void' | 'audit'

export default function Help({ term }: { term: HelpTerm }) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const title = pick(`help.${term}.title`)
  const example = i18next.exists(`help.${term}.example`) ? pick(`help.${term}.example`) : ''
  return (
    <>
      <button
        type="button"
        aria-label={`${pick('help.what')}: ${title}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="tap inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald align-middle"
      >
        <CircleHelp size={20} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col gap-3">
          <BiLabel text={`help.${term}.body`} size="md" />
          {example ? (
            <div className="rounded-2xl bg-emerald-tint px-4 py-3">
              <BiLabel text="help.example" size="sm" bold tone="text-emerald-deep" />
              <BiLabel text={`help.${term}.example`} size="md" tone="text-ink" />
            </div>
          ) : null}
        </div>
      </Sheet>
    </>
  )
}
