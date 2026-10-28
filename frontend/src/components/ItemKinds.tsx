/** Kinds of counted items: the known ones (charger, watch, speaker, ...) plus any the shop adds
 *  itself, e.g. "Ring light" (owner, 2026-10-28). Known kinds are translated; the shop's own are
 *  shown as written. */

import i18next from 'i18next'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { BiInput, useLang } from './Bilingual'
import { useGet } from '@/lib/queries'

/** the most used kinds come first */
const FIRST = ['watch', 'charger', 'cable', 'cover', 'glass', 'earphones', 'speaker', 'power_bank']
const HIDDEN = new Set(['sim_tray', 'part']) // repair parts, not sold over the counter

export function useItemKinds(): string[] {
  const { data } = useGet<string[]>(['item-kinds'], '/api/v1/accessories/categories')
  const all = data ?? FIRST
  return [...FIRST.filter((k) => all.includes(k)), ...all.filter((k) => !FIRST.includes(k) && !HIDDEN.has(k))]
}

export function kindLabel(pick: (k: string) => string, kind: string): string {
  return i18next.exists(`acc.cat.${kind}`) ? pick(`acc.cat.${kind}`) : kind
}

/** chips to choose a kind, and "+ New kind" to write one */
export function KindChooser({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  const { pick, ur, cls } = useLang()
  const kinds = useItemKinds()
  const [writing, setWriting] = useState(false)
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const custom = !!value && !kinds.includes(value)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={value === k && !writing} onClick={() => { setWriting(false); onChange(k) }} className={chip(value === k && !writing)}>{kindLabel(pick, k)}</button>
        ))}
        <button type="button" aria-pressed={writing || custom} onClick={() => { setWriting(true); onChange('') }} className={`${chip(writing || custom)} inline-flex items-center gap-1`}>
          <Plus size={16} /> {pick('items.newKind')}
        </button>
      </div>
      {writing || custom ? (
        <BiInput label="items.newKindName" value={value} onChange={(e) => onChange(e.target.value)} placeholder={pick('items.newKindPh')} maxLength={20} autoFocus />
      ) : null}
    </div>
  )
}
