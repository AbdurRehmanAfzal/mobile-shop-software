/** Price sticker / barcode label options (owner 2026-10-30): size (roll presets, A4 sheet or custom
 *  mm), what goes on it, copies, the secret cost code; print, PDF or share. The shop's last choice is
 *  saved on the shop (owner) or on this device (everyone else). */

import { Check, Printer, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useGet, useInvalidate } from '@/lib/queries'

export type LabelKind = 'devices' | 'items'
const SIZES = ['38x25', '40x30', '50x25', '50x30', '58x40', '60x40', '70x40', 'a4', 'custom'] as const
type Size = (typeof SIZES)[number]
const FIELDS = ['shop', 'name', 'specs', 'price', 'barcode', 'imei', 'last4', 'condition', 'pta', 'date', 'code'] as const
type Field = (typeof FIELDS)[number]
const DEFAULT: Prefs = { size: '50x30', w: '40', h: '20', fields: ['shop', 'name', 'specs', 'price', 'barcode', 'imei', 'condition'], copies: 1 }
interface Prefs { size: Size; w: string; h: string; fields: Field[]; copies: number }
const LS = 'mobileshop.labelPrefs'

function load(shopPrefs: Partial<Prefs> | null | undefined): Prefs {
  let local: Partial<Prefs> | null = null
  try { local = JSON.parse(localStorage.getItem(LS) ?? 'null') } catch { local = null }
  const p = { ...DEFAULT, ...(shopPrefs ?? {}), ...(local ?? {}) }
  return { ...p, fields: (p.fields ?? DEFAULT.fields).filter((f): f is Field => (FIELDS as readonly string[]).includes(f)) }
}

export function labelPath(kind: LabelKind, ids: string[], p: Prefs): string {
  const q = new URLSearchParams({ ids: ids.join(','), copies: String(p.copies), fields: p.fields.join(',') })
  if (p.size === 'custom') { q.set('w', p.w); q.set('h', p.h) } else q.set('size', p.size)
  return `/api/v1/labels/${kind}?${q}`
}

export default function LabelSheet({ kind, ids, open, onClose }: { kind: LabelKind; ids: string[]; open: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const inv = useInvalidate()
  const { data: shop } = useGet<{ label_prefs: Partial<Prefs> | null; label_code_word: string | null }>(['shop-full'], '/api/v1/shops/current')
  const [p, setP] = useState<Prefs>(() => load(null))
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { if (open) setP(load(shop?.label_prefs)) }, [open, shop?.label_prefs])
  const canCost = role === 'owner' || role === 'manager'
  const fields = FIELDS.filter((f) => (canCost || f !== 'code') && (kind === 'devices' || !['specs', 'last4', 'condition', 'pta'].includes(f)))
  const toggle = (f: Field) => setP({ ...p, fields: p.fields.includes(f) ? p.fields.filter((x) => x !== f) : [...p.fields, f] })
  const chip = (on: boolean) => `tap h-11 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const path = labelPath(kind, ids, p)
  const customOk = p.size !== 'custom' || (Number(p.w) >= 20 && Number(p.w) <= 110 && Number(p.h) >= 10 && Number(p.h) <= 110)
  const remember = async () => {
    try { localStorage.setItem(LS, JSON.stringify(p)) } catch { /* private window */ }
    if (role === 'owner') await api('PATCH', '/api/v1/shops/current', { label_prefs: p }).then(() => { void inv('shop-full') }).catch(() => undefined)
    setSaved(true)
  }
  return (
    <Sheet open={open} onClose={onClose} title="label.title">
      <div className="flex flex-col gap-3">
        <BiLabel text={{ en: pick('label.count').replace('{{n}}', String(ids.length)), ur: pick('label.count').replace('{{n}}', String(ids.length)), roman: pick('label.count').replace('{{n}}', String(ids.length)) }} size="sm" tone="text-muted" />
        <div>
          <BiLabel text="label.size" size="md" bold className="mb-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((s) => (
              <button key={s} type="button" aria-pressed={p.size === s} onClick={() => { setP({ ...p, size: s }); setSaved(false) }} className={chip(p.size === s)}>
                {s === 'a4' ? pick('label.a4') : s === 'custom' ? pick('label.custom') : <span dir="ltr">{s.replace('x', ' × ')} mm</span>}
              </button>
            ))}
          </div>
          {p.size === 'custom' ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <BiInput label="label.width" type="number" inputMode="numeric" min={20} max={110} value={p.w} onChange={(e) => setP({ ...p, w: e.target.value })} className="num" dir="ltr" />
              <BiInput label="label.height" type="number" inputMode="numeric" min={10} max={110} value={p.h} onChange={(e) => setP({ ...p, h: e.target.value })} className="num" dir="ltr" />
            </div>
          ) : null}
        </div>
        <div>
          <BiLabel text="label.fields" size="md" bold className="mb-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => {
              const on = p.fields.includes(f)
              return (
                <button key={f} type="button" aria-pressed={on} onClick={() => { toggle(f); setSaved(false) }} className={`${chip(on)} inline-flex items-center gap-1`}>
                  {on ? <Check size={14} /> : null}{pick(`label.f.${f}`)}
                </button>
              )
            })}
          </div>
          {p.fields.includes('code') ? <BiLabel text={{ en: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}`, ur: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}`, roman: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}` }} size="sm" tone="text-muted" className="mt-1.5" /> : null}
        </div>
        <div>
          <BiLabel text="label.copies" size="md" bold className="mb-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 5, 10].map((c) => (
              <button key={c} type="button" aria-pressed={p.copies === c} onClick={() => { setP({ ...p, copies: c }); setSaved(false) }} className={`${chip(p.copies === c)} num`}>{c}</button>
            ))}
          </div>
        </div>
        <ErrorText error={err} />
        <BiButton text="label.print" icon={<Printer size={22} />} full disabled={!customOk || !p.fields.length} onClick={() => { setErr(null); void remember(); openPrintable(path).catch(setErr) }} />
        <DocActions path={path} name={`stickers-${ids.length}`} title={pick('label.title')} picker={false} />
        <button type="button" onClick={remember} className={`tap inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-bold ${ur ? cls('sm') : 'text-sm'}`}>
          <Tag size={16} />{pick(saved ? 'label.saved' : 'label.remember')}
        </button>
      </div>
    </Sheet>
  )
}
