/** A small "?" next to a word, a field, a tab or a card that a shopkeeper may not know (owner,
 *  2026-10-28: "credit, PTA ... non technical user ko nahi pata"; 2026-11-02: an info icon with an
 *  example on every field, tab and card, in the audit and every module — docs/33).
 *  Tapping it opens a short, plain explanation with an example.
 *  Texts: i18n `help.<term>.title / body / example` in en, ur and roman; `term` may be nested
 *  (`audit.netSales`). `Help.test.ts` checks every term used in the code has all three.
 *  Owner 2026-11-03: the sheet has its own English / اردو / Roman switch — only the explanation
 *  changes language, never the whole app; the last choice is remembered on this device. */

import i18next from 'i18next'
import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { useLang } from './Bilingual'
import { Sheet } from './ui'

/** any key under `help.` (kept as a name for the older call sites) */
export type HelpTerm = string

type HelpLang = 'en' | 'ur' | 'roman'
const LANGS: { key: HelpLang; label: string }[] = [
  { key: 'ur', label: 'اردو' },
  { key: 'roman', label: 'Roman' },
  { key: 'en', label: 'English' },
]
const LS = 'mobileshop.helpLang'

function savedLang(): HelpLang | null {
  try {
    const v = localStorage.getItem(LS)
    return v === 'en' || v === 'ur' || v === 'roman' ? v : null
  } catch {
    return null
  }
}

export default function Help({ term, size = 'md' }: { term: HelpTerm; size?: 'sm' | 'md' }) {
  const { pick, ur: appUr, roman: appRoman } = useLang()
  const [open, setOpen] = useState(false)
  // the explanation's own language: last picked in a "?" on this device, else the app's
  const [lang, setLang] = useState<HelpLang>(() => savedLang() ?? (appUr ? 'ur' : appRoman ? 'roman' : 'en'))
  const t = i18next.getFixedT(lang)
  const ur = lang === 'ur'
  const text = (part: string) => t(`help.${term}.${part}`)
  const choose = (l: HelpLang) => {
    setLang(l)
    try { localStorage.setItem(LS, l) } catch { /* private window */ }
  }
  const sm = size === 'sm'
  return (
    <>
      {/* the name is only "What is this?": repeating the field's own words would make the "?" a
          second element named like the field (the field's label, a card title, a button) */}
      <button
        type="button"
        aria-label={pick('help.what')}
        data-help={term}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLang(savedLang() ?? lang); setOpen(true) }}
        className={`tap inline-flex shrink-0 items-center justify-center rounded-full align-middle ${sm ? 'h-6 w-6 text-emerald/80' : 'h-7 w-7 text-emerald'}`}
      >
        <CircleHelp size={sm ? 15 : 20} aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="help.what">
        <div className="flex flex-col gap-3" data-testid="help-sheet">
          <div className="flex gap-1 self-start rounded-full bg-surface p-1" role="group" aria-label={pick('help.language')} dir="ltr">
            {LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={lang === l.key}
                onClick={() => choose(l.key)}
                className={`tap h-9 rounded-full px-3.5 font-bold ${lang === l.key ? 'bg-ink text-ground' : 'text-ink'} ${l.key === 'ur' ? 'ur text-[15px]' : 'text-[13px]'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3" dir={ur ? 'rtl' : 'ltr'} lang={ur ? 'ur' : 'en'}>
            <div className={`text-ink ${ur ? 'ur text-xl font-bold leading-[1.8]' : 'text-lg font-extrabold leading-tight'}`}>{text('title')}</div>
            <div className={`text-ink ${ur ? 'ur text-[15px] leading-[1.9]' : 'text-[15px] leading-snug'}`}>{text('body')}</div>
            <div className="rounded-2xl bg-emerald-tint px-4 py-3">
              <div className={`font-bold text-emerald-deep ${ur ? 'ur text-sm leading-[1.8]' : 'text-xs'}`}>{t('help.example')}</div>
              <div className={`text-ink ${ur ? 'ur text-[15px] leading-[1.9]' : 'text-[15px] leading-snug'}`}>{text('example')}</div>
            </div>
          </div>
        </div>
      </Sheet>
    </>
  )
}
