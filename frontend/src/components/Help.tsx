/** A small "?" next to a word, a field, a tab or a card that a shopkeeper may not know (owner,
 *  2026-10-28: "credit, PTA ... non technical user ko nahi pata"; 2026-11-02: an info icon with an
 *  example on every field, tab and card, in the audit and every module — docs/33).
 *  Tapping it opens a short, plain explanation with an example.
 *  Texts: i18n `help.<term>.title / body / example` in en, ur and roman; `term` may be nested
 *  (`audit.netSales`). `Help.test.ts` checks every term used in the code has all three. */

import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { Sheet } from './ui'

/** any key under `help.` (kept as a name for the older call sites) */
export type HelpTerm = string

export default function Help({ term, size = 'md' }: { term: HelpTerm; size?: 'sm' | 'md' }) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const title = pick(`help.${term}.title`)
  const sm = size === 'sm'
  return (
    <>
      {/* the name is only "What is this?": repeating the field's own words would make the "?" a
          second element named like the field (the field's label, a card title, a button) */}
      <button
        type="button"
        aria-label={pick('help.what')}
        data-help={term}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={`tap inline-flex shrink-0 items-center justify-center rounded-full align-middle ${sm ? 'h-6 w-6 text-emerald/80' : 'h-7 w-7 text-emerald'}`}
      >
        <CircleHelp size={sm ? 15 : 20} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col gap-3">
          <BiLabel text={`help.${term}.body`} size="md" />
          <div className="rounded-2xl bg-emerald-tint px-4 py-3">
            <BiLabel text="help.example" size="sm" bold tone="text-emerald-deep" />
            <BiLabel text={`help.${term}.example`} size="md" tone="text-ink" />
          </div>
        </div>
      </Sheet>
    </>
  )
}
