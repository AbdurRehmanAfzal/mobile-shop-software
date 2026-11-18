/** Price sticker / barcode label options (owner 2026-10-30): size (roll presets, A4 sheet or custom
 *  mm), what goes on it, copies, the secret cost code; print, PDF or share. The shop's last choice is
 *  saved on the shop (owner) or on this device (everyone else). */

import { Check, Printer, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import DocActions from '@/components/DocShare'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useGet, useInvalidate } from '@/lib/queries'

export type LabelKind = 'devices' | 'items'
const SIZES = ['38x25', '40x30', '50x25', '50x30', '58x40', '60x40', '70x40', 'a4', 'custom'] as const
type Size = (typeof SIZES)[number]
export const LABEL_FIELDS = ['shop', 'name', 'specs', 'ram', 'battery', 'cycles', 'price', 'barcode', 'imei', 'serial', 'last4', 'condition', 'pta', 'date', 'code'] as const
/** ticks that only a phone has */
const DEVICE_ONLY: readonly string[] = ['specs', 'ram', 'battery', 'cycles', 'serial', 'last4', 'condition', 'pta']
/** until ADR-106 the "Storage · colour" line carried these three; a choice saved before then keeps them */
const SPEC_EXTRAS = ['ram', 'battery', 'cycles'] as const
export type LabelBar = 'imei' | 'code'
const FIELDS = LABEL_FIELDS
export type LabelField = (typeof LABEL_FIELDS)[number]
type Field = LabelField
const DEFAULT: Prefs = { size: '50x30', w: '40', h: '20', fields: ['shop', 'name', 'specs', 'ram', 'battery', 'cycles', 'price', 'barcode', 'imei', 'condition'], copies: 1, bar: 'imei', v: 2 }
/** `bar`: what the bars carry — the IMEI (when the phone has one) or the shop's own code. `v`: 2 = saved by an app that knows the RAM / battery / cycles / serial ticks */
export interface Prefs { size: Size; w: string; h: string; fields: Field[]; copies: number; bar: LabelBar; v?: number }
export const LABEL_LS = 'mobileshop.labelPrefs'
const LS = LABEL_LS

export function loadLabelPrefs(shopPrefs: Partial<Prefs> | null | undefined): Prefs {
  let local: Partial<Prefs> | null = null
  try { local = JSON.parse(localStorage.getItem(LS) ?? 'null') } catch { local = null }
  const p = { ...DEFAULT, ...upgrade(shopPrefs), ...upgrade(local) }
  return { ...p, bar: p.bar === 'code' ? 'code' : 'imei', fields: (p.fields ?? DEFAULT.fields).filter((f): f is Field => (FIELDS as readonly string[]).includes(f)) }
}

/** A choice saved before ADR-106 printed RAM, battery health and cycles with "Storage · colour": it keeps them. */
function upgrade(p: Partial<Prefs> | null | undefined): Partial<Prefs> {
  if (!p) return {}
  if (p.v === 2 || !p.fields) return { ...p, v: 2 }
  return { ...p, v: 2, fields: p.fields.includes('specs') ? [...p.fields, ...SPEC_EXTRAS.filter((f) => !p.fields!.includes(f))] : p.fields }
}

export function labelPath(kind: LabelKind, ids: string[], p: Prefs): string {
  const q = new URLSearchParams({ ids: ids.join(','), copies: String(p.copies), fields: p.fields.join(',') })
  if (p.size === 'custom') { q.set('w', p.w); q.set('h', p.h) } else q.set('size', p.size)
  if (kind === 'devices') { q.set('fv', '2'); q.set('bar', p.bar) }
  return `/api/v1/labels/${kind}?${q}`
}

/** IMEI or the shop's own code in the bars (owner 2026-11-18, ADR-106). */
export function BarChoice({ value, onChange }: { value: LabelBar; onChange: (v: LabelBar) => void }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="label-bar">
      <span className="flex items-center gap-1"><BiLabel text="label.bar" size="sm" bold tone="text-muted" /><Help term="label.bar" size="sm" /></span>
      {(['imei', 'code'] as const).map((b) => (
        <button key={b} type="button" role="radio" aria-checked={value === b} onClick={() => onChange(b)} className={`tap h-9 rounded-full border-2 px-3 font-bold ${value === b ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`} data-testid={`label-bar-${b}`}>
          {pick(b === 'imei' ? 'label.barImei' : 'label.barCode')}
        </button>
      ))}
    </div>
  )
}

export default function LabelSheet({ kind, ids, open, onClose }: { kind: LabelKind; ids: string[]; open: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const inv = useInvalidate()
  const { data: shop } = useGet<{ label_prefs: Partial<Prefs> | null; label_code_word: string | null }>(['shop-full'], '/api/v1/shops/current')
  const [p, setP] = useState<Prefs>(() => loadLabelPrefs(null))
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { if (open) setP(loadLabelPrefs(shop?.label_prefs)) }, [open, shop?.label_prefs])
  const canCost = role === 'owner' || role === 'manager'
  const fields = FIELDS.filter((f) => (canCost || f !== 'code') && (kind === 'devices' || !DEVICE_ONLY.includes(f)))
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
        <span className="flex items-center gap-1"><BiLabel text={{ en: pick('label.count').replace('{{n}}', String(ids.length)), ur: pick('label.count').replace('{{n}}', String(ids.length)), roman: pick('label.count').replace('{{n}}', String(ids.length)) }} size="sm" tone="text-muted" /><Help term="label.sheet" size="sm" /></span>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.size" size="md" bold /><Help term="label.size" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((s) => (
              <button key={s} type="button" aria-pressed={p.size === s} onClick={() => { setP({ ...p, size: s }); setSaved(false) }} className={chip(p.size === s)}>
                {s === 'a4' ? pick('label.a4') : s === 'custom' ? pick('label.custom') : <span dir="ltr">{s.replace('x', ' × ')} mm</span>}
              </button>
            ))}
          </div>
          {p.size === 'custom' ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <BiInput label="label.width" help={<Help term="label.customSize" size="sm" />} type="number" inputMode="numeric" min={20} max={110} value={p.w} onChange={(e) => setP({ ...p, w: e.target.value })} className="num" dir="ltr" />
              <BiInput label="label.height" help={<Help term="label.customSize" size="sm" />} type="number" inputMode="numeric" min={10} max={110} value={p.h} onChange={(e) => setP({ ...p, h: e.target.value })} className="num" dir="ltr" />
            </div>
          ) : null}
          {p.size === 'custom' && Number(p.h) > 0 && Number(p.h) < 22 ? <p className="mt-2 rounded-2xl bg-gold-tint px-3 py-2 text-sm font-semibold text-ink" data-testid="label-short-note">{pick('label.shortNote')}</p> : null}
        </div>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.fields" size="md" bold /><Help term="label.fields" size="sm" /></span>
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
          {kind === 'devices' && p.fields.includes('barcode') ? <BarChoice value={p.bar} onChange={(bar) => { setP({ ...p, bar }); setSaved(false) }} /> : null}
          {p.fields.includes('code') ? <span className="mt-1.5 flex items-center gap-1"><BiLabel text={{ en: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}`, ur: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}`, roman: `${pick('label.codeHint')} ${shop?.label_code_word ?? 'BLACKHORSE'}` }} size="sm" tone="text-muted" /><Help term="label.costCode" size="sm" /></span> : null}
        </div>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.copies" size="md" bold /><Help term="label.copies" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 5, 10].map((c) => (
              <button key={c} type="button" aria-pressed={p.copies === c} onClick={() => { setP({ ...p, copies: c }); setSaved(false) }} className={`${chip(p.copies === c)} num`}>{c}</button>
            ))}
          </div>
        </div>
        <ErrorText error={err} />
        <BiButton text="label.print" icon={<Printer size={22} />} full disabled={!customOk || !p.fields.length} onClick={() => { setErr(null); openPrintable(path, remember).catch(setErr) }} />
        <DocActions path={path} name={`stickers-${ids.length}`} title={pick('label.title')} picker={false} />
        <div className="flex items-center gap-1">
        <button type="button" onClick={remember} className={`tap inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-bold ${ur ? cls('sm') : 'text-sm'}`}>
          <Tag size={16} />{pick(saved ? 'label.saved' : 'label.remember')}
        </button>
        <Help term="label.remember" size="sm" />
        </div>
      </div>
    </Sheet>
  )
}
