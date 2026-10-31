/** Spec sheet and lock checks of a unit (owner addendum 6, docs/26 §A): the fields each kind of
 *  device has, an editor for them (folded under "More details" in the add-device form), the lock
 *  checks a used unit must pass before it is bought or sold, and a compact summary for the
 *  device page. The keys match `devices/types.py` SPEC_KEYS. */

import { BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import type { DeviceCategory } from '@/lib/types'

export type Specs = Record<string, string | number | boolean | string[]>
export type LockChecks = Record<string, 'cleared' | 'not_cleared' | 'na'>
type Kind = 'text' | 'number' | 'bool' | 'select' | 'multi'
interface Field { key: string; kind: Kind; cats: DeviceCategory[]; options?: string[]; optionKey?: string }

const ALL: DeviceCategory[] = ['phone', 'tablet', 'watch']
export const SPEC_FIELDS: Field[] = [
  { key: 'os', kind: 'text', cats: ALL },
  { key: 'chipset', kind: 'text', cats: ALL },
  { key: 'display_in', kind: 'number', cats: ALL },
  { key: 'display_type', kind: 'select', cats: ALL, options: ['LCD', 'IPS', 'AMOLED', 'Super AMOLED', 'OLED'] },
  { key: 'resolution', kind: 'text', cats: ALL },
  { key: 'refresh_hz', kind: 'number', cats: ['phone', 'tablet'] },
  { key: 'battery_mah', kind: 'number', cats: ALL },
  { key: 'expandable', kind: 'bool', cats: ['phone', 'tablet'] },
  { key: 'sim_type', kind: 'select', cats: ['phone', 'tablet', 'watch'], options: ['nano', 'eSIM', 'nano + eSIM'] },
  { key: 'camera_front_mp', kind: 'number', cats: ['phone', 'tablet'] },
  { key: 'camera_rear_mp', kind: 'number', cats: ['phone', 'tablet'] },
  { key: 'stylus_support', kind: 'bool', cats: ['tablet'] },
  { key: 'unlock', kind: 'select', cats: ['phone', 'tablet'], options: ['fingerprint', 'face', 'both', 'none'] },
  { key: 'port', kind: 'select', cats: ['phone', 'tablet'], options: ['Type-C', 'Lightning', 'Micro-USB'] },
  { key: 'fast_charge_w', kind: 'number', cats: ['phone', 'tablet'] },
  { key: 'case_material', kind: 'select', cats: ['watch'], options: ['aluminium', 'steel', 'titanium', 'plastic'] },
  { key: 'band_material', kind: 'text', cats: ['watch'] },
  { key: 'band_color', kind: 'text', cats: ['watch'] },
  { key: 'band_size', kind: 'select', cats: ['watch'], options: ['S', 'M', 'L', 'one size'] },
  { key: 'compatible_with', kind: 'select', cats: ['watch'], options: ['Android', 'iOS', 'both'] },
  { key: 'sensors', kind: 'multi', cats: ['watch'], options: ['hr', 'spo2', 'sleep', 'ecg'], optionKey: 'devx.sensor' },
  { key: 'water', kind: 'select', cats: ['watch', 'phone', 'tablet'], options: ['IP67', 'IP68', '5ATM', 'WR50', 'none'] },
  { key: 'aod', kind: 'bool', cats: ['watch'] },
  { key: 'calling', kind: 'bool', cats: ['watch'] },
  { key: 'battery_days', kind: 'number', cats: ['watch'] },
  { key: 'bluetooth', kind: 'text', cats: ALL },
  { key: 'wifi', kind: 'text', cats: ALL },
  { key: 'nfc', kind: 'bool', cats: ALL },
  { key: 'gps', kind: 'bool', cats: ['tablet', 'watch'] },
  { key: 'weight_g', kind: 'number', cats: ALL },
  { key: 'year', kind: 'number', cats: ALL },
]

export function fieldsFor(category: DeviceCategory): Field[] {
  return SPEC_FIELDS.filter((f) => f.cats.includes(category))
}

/** which locks a used unit of this kind is checked for */
export function lockKeysFor(category: DeviceCategory): string[] {
  return category === 'watch' ? ['activation', 'paired', 'account'] : ['activation', 'frp', 'account', 'carrier']
}

export function lockState(locks: LockChecks | null | undefined): 'ok' | 'bad' | 'none' {
  if (!locks || !Object.keys(locks).length) return 'none'
  return Object.values(locks).some((v) => v === 'not_cleared') ? 'bad' : 'ok'
}

export function SpecsEditor({ category, value, onChange }: { category: DeviceCategory; value: Specs; onChange: (v: Specs) => void }) {
  const { pick } = useLang()
  const set = (k: string, v: Specs[string] | undefined) => {
    const next = { ...value }
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[k]
    else next[k] = v
    onChange(next)
  }
  const chip = (on: boolean) => `tap h-9 rounded-full border-2 px-3 text-[12px] font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="specs-editor">
      {fieldsFor(category).map((f) => {
        const v = value[f.key]
        if (f.kind === 'text' || f.kind === 'number') {
          return <BiInput key={f.key} label={`devx.spec.${f.key}`} type={f.kind === 'number' ? 'number' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined} value={v == null ? '' : String(v)} onChange={(e) => set(f.key, f.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} dir="ltr" className={f.kind === 'number' ? 'num' : ''} maxLength={80} />
        }
        if (f.kind === 'bool') {
          return (
            <div key={f.key}>
              <BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" />
              <div className="mt-1 flex gap-1.5">
                <button type="button" aria-pressed={v === true} onClick={() => set(f.key, v === true ? undefined : true)} className={chip(v === true)}>{pick('devx.yes')}</button>
                <button type="button" aria-pressed={v === false} onClick={() => set(f.key, v === false ? undefined : false)} className={chip(v === false)}>{pick('devx.no')}</button>
              </div>
            </div>
          )
        }
        if (f.kind === 'select') {
          return (
            <div key={f.key} className="col-span-2">
              <BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" />
              <div className="mt-1 flex flex-wrap gap-1.5">
                {f.options!.map((o) => <button key={o} type="button" aria-pressed={v === o} onClick={() => set(f.key, v === o ? undefined : o)} className={chip(v === o)} dir="ltr">{o}</button>)}
              </div>
            </div>
          )
        }
        const arr = Array.isArray(v) ? v : []
        return (
          <div key={f.key} className="col-span-2">
            <BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {f.options!.map((o) => <button key={o} type="button" aria-pressed={arr.includes(o)} onClick={() => set(f.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} className={chip(arr.includes(o))}>{f.optionKey ? pick(`${f.optionKey}.${o}`) : o}</button>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function LockChecksEditor({ category, value, onChange }: { category: DeviceCategory; value: LockChecks; onChange: (v: LockChecks) => void }) {
  return (
    <div className="flex flex-col gap-2" data-testid="lock-checks">
      {lockKeysFor(category).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <BiLabel text={`devx.lock.${k}`} size="sm" tone="text-muted" bold />
          <BiSegmented<'cleared' | 'not_cleared' | 'na'> value={value[k] ?? 'na'} onChange={(v) => onChange({ ...value, [k]: v })} options={[{ value: 'cleared', text: 'devx.lock.cleared' }, { value: 'not_cleared', text: 'devx.lock.not_cleared' }, { value: 'na', text: 'devx.lock.na' }]} />
        </div>
      ))}
    </div>
  )
}

/** [label key, value text] pairs for the device page */
export function specRows(category: DeviceCategory, specs: Specs | null | undefined, pick: (k: string) => string): [string, string][] {
  if (!specs) return []
  return fieldsFor(category)
    .filter((f) => specs[f.key] !== undefined && specs[f.key] !== '')
    .map((f) => {
      const v = specs[f.key]
      const text = typeof v === 'boolean' ? pick(v ? 'devx.yes' : 'devx.no') : Array.isArray(v) ? v.map((x) => (f.optionKey ? pick(`${f.optionKey}.${x}`) : x)).join(', ') : String(v)
      return [`devx.spec.${f.key}`, text]
    })
}
