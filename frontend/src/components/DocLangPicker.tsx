/** "Document language: English | اردو", shown right above the print / download / share buttons
 *  (owner 2026-10-29). English by default; the choice holds until the app is closed. */

import { Languages } from 'lucide-react'
import { useLang } from './Bilingual'
import { useDocLang, type DocLang } from '@/lib/docLang'

export default function DocLangPicker({ compact = false }: { compact?: boolean }) {
  const { pick, ur, cls } = useLang()
  const lang = useDocLang((s) => s.lang)
  const set = useDocLang((s) => s.set)
  const opt = (v: DocLang, label: string) => (
    <button key={v} type="button" aria-pressed={lang === v} onClick={() => set(v)} className={`tap min-h-10 flex-1 rounded-xl px-3 font-bold ${lang === v ? 'bg-ink text-ground' : 'text-ink'} ${v === 'ur' ? 'ur text-[15px]' : 'text-[14px]'}`}>
      {label}
    </button>
  )
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'rounded-2xl border border-line bg-surface px-3 py-2'}`} role="group" aria-label={pick('docLang.title')}>
      <Languages size={18} className="shrink-0 text-muted" />
      <span className={`min-w-0 flex-1 text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick('docLang.title')}</span>
      <div className="flex gap-1 rounded-xl bg-ground p-0.5">
        {opt('en', 'English')}
        {opt('ur', 'اردو')}
      </div>
    </div>
  )
}
