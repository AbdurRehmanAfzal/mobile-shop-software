/** Spec sheet and lock checks of a unit (owner addendum 6, docs/26 §A): the fields each kind of
 *  device has, an editor for them (folded under "More details" in the add-device form), the lock
 *  checks a used unit must pass before it is bought or sold, and a compact summary for the
 *  device page. The keys match `devices/types.py` SPEC_KEYS. */

import { BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import type { DeviceCategory } from '@/lib/types'

export type Specs = Record<string, string | number | boolean | string[]>
export type LockChecks = Record<string, 'cleared' | 'not_cleared' | 'na'>
type Kind = 'text' | 'number' | 'bool' | 'select' | 'multi'
/** `help`: the "?" beside the field (docs/33) */
interface Field { key: string; kind: Kind; cats: DeviceCategory[]; options?: string[]; optionKey?: string; help: string }

const ALL: DeviceCategory[] = ['phone', 'tablet', 'watch']
export const SPEC_FIELDS: Field[] = [
  { key: 'os', kind: 'text', cats: ALL, help: 'device.spec.os' },
  { key: 'chipset', kind: 'text', cats: ALL, help: 'device.spec.chipset' },
  { key: 'display_in', kind: 'number', cats: ALL, help: 'device.spec.display_in' },
  { key: 'display_type', kind: 'select', cats: ALL, options: ['LCD', 'IPS', 'AMOLED', 'Super AMOLED', 'OLED'], help: 'device.spec.display_type' },
  { key: 'resolution', kind: 'text', cats: ALL, help: 'device.spec.resolution' },
  { key: 'refresh_hz', kind: 'number', cats: ['phone', 'tablet'], help: 'device.spec.refresh_hz' },
  { key: 'battery_mah', kind: 'number', cats: ALL, help: 'device.spec.battery_mah' },
  { key: 'expandable', kind: 'bool', cats: ['phone', 'tablet'], help: 'device.spec.expandable' },
  { key: 'sim_type', kind: 'select', cats: ['phone', 'tablet', 'watch'], options: ['nano', 'eSIM', 'nano + eSIM'], help: 'device.spec.sim_type' },
  { key: 'camera_front_mp', kind: 'number', cats: ['phone', 'tablet'], help: 'device.spec.camera_front_mp' },
  { key: 'camera_rear_mp', kind: 'number', cats: ['phone', 'tablet'], help: 'device.spec.camera_rear_mp' },
  { key: 'stylus_support', kind: 'bool', cats: ['tablet'], help: 'device.spec.stylus_support' },
  { key: 'unlock', kind: 'select', cats: ['phone', 'tablet'], options: ['fingerprint', 'face', 'both', 'none'], help: 'device.spec.unlock' },
  { key: 'port', kind: 'select', cats: ['phone', 'tablet'], options: ['Type-C', 'Lightning', 'Micro-USB'], help: 'device.spec.port' },
  { key: 'fast_charge_w', kind: 'number', cats: ['phone', 'tablet'], help: 'device.spec.fast_charge_w' },
  { key: 'case_material', kind: 'select', cats: ['watch'], options: ['aluminium', 'steel', 'titanium', 'plastic'], help: 'device.spec.case_material' },
  { key: 'band_material', kind: 'text', cats: ['watch'], help: 'device.spec.band_material' },
  { key: 'band_color', kind: 'text', cats: ['watch'], help: 'device.spec.band_color' },
  { key: 'band_size', kind: 'select', cats: ['watch'], options: ['S', 'M', 'L', 'one size'], help: 'device.spec.band_size' },
  { key: 'compatible_with', kind: 'select', cats: ['watch'], options: ['Android', 'iOS', 'both'], help: 'device.spec.compatible_with' },
  { key: 'sensors', kind: 'multi', cats: ['watch'], options: ['hr', 'spo2', 'sleep', 'ecg'], optionKey: 'devx.sensor', help: 'device.spec.sensors' },
  { key: 'water', kind: 'select', cats: ['watch', 'phone', 'tablet'], options: ['IP67', 'IP68', '5ATM', 'WR50', 'none'], help: 'device.spec.water' },
  { key: 'aod', kind: 'bool', cats: ['watch'], help: 'device.spec.aod' },
  { key: 'calling', kind: 'bool', cats: ['watch'], help: 'device.spec.calling' },
  { key: 'battery_days', kind: 'number', cats: ['watch'], help: 'device.spec.battery_days' },
  { key: 'bluetooth', kind: 'text', cats: ALL, help: 'device.spec.bluetooth' },
  { key: 'wifi', kind: 'text', cats: ALL, help: 'device.spec.wifi' },
  { key: 'nfc', kind: 'bool', cats: ALL, help: 'device.spec.nfc' },
  { key: 'gps', kind: 'bool', cats: ['tablet', 'watch'], help: 'device.spec.gps' },
  { key: 'weight_g', kind: 'number', cats: ALL, help: 'device.spec.weight_g' },
  { key: 'year', kind: 'number', cats: ALL, help: 'device.spec.year' },
]

export function fieldsFor(category: DeviceCategory): Field[] {
  return SPEC_FIELDS.filter((f) => f.cats.includes(category))
}

/** the "?" beside each lock (docs/33) */
const LOCK_HELP: { key: string; helpKey: string }[] = [
  { key: 'activation', helpKey: 'device.lockItem.activation' },
  { key: 'frp', helpKey: 'device.lockItem.frp' },
  { key: 'account', helpKey: 'device.lockItem.account' },
  { key: 'paired', helpKey: 'device.lockItem.paired' },
  { key: 'carrier', helpKey: 'device.lockItem.carrier' },
]
const lockHelp = (k: string) => LOCK_HELP.find((x) => x.key === k)?.helpKey

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
          return <BiInput key={f.key} label={`devx.spec.${f.key}`} help={<Help term={f.help} size="sm" />} type={f.kind === 'number' ? 'number' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined} value={v == null ? '' : String(v)} onChange={(e) => set(f.key, f.kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} dir="ltr" className={f.kind === 'number' ? 'num' : ''} maxLength={80} />
        }
        if (f.kind === 'bool') {
          return (
            <div key={f.key}>
              <span className="flex items-center gap-1"><BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" /><Help term={f.help} size="sm" /></span>
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
              <span className="flex items-center gap-1"><BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" /><Help term={f.help} size="sm" /></span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {f.options!.map((o) => <button key={o} type="button" aria-pressed={v === o} onClick={() => set(f.key, v === o ? undefined : o)} className={chip(v === o)} dir="ltr">{o}</button>)}
              </div>
            </div>
          )
        }
        const arr = Array.isArray(v) ? v : []
        return (
          <div key={f.key} className="col-span-2">
            <span className="flex items-center gap-1"><BiLabel text={`devx.spec.${f.key}`} size="md" tone="text-muted" /><Help term={f.help} size="sm" /></span>
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
          <span className="flex items-center gap-1"><BiLabel text={`devx.lock.${k}`} size="sm" tone="text-muted" bold />{lockHelp(k) ? <Help term={lockHelp(k)!} size="sm" /> : null}</span>
          <BiSegmented<'cleared' | 'not_cleared' | 'na'> value={value[k] ?? 'na'} onChange={(v) => onChange({ ...value, [k]: v })} options={[{ value: 'cleared', text: 'devx.lock.cleared' }, { value: 'not_cleared', text: 'devx.lock.not_cleared' }, { value: 'na', text: 'devx.lock.na' }]} />
        </div>
      ))}
    </div>
  )
}

/** [label key, value text, help term] for the device page */
export function specRows(category: DeviceCategory, specs: Specs | null | undefined, pick: (k: string) => string): [string, string, string][] {
  if (!specs) return []
  return fieldsFor(category)
    .filter((f) => specs[f.key] !== undefined && specs[f.key] !== '')
    .map((f) => {
      const v = specs[f.key]
      const text = typeof v === 'boolean' ? pick(v ? 'devx.yes' : 'devx.no') : Array.isArray(v) ? v.map((x) => (f.optionKey ? pick(`${f.optionKey}.${x}`) : x)).join(', ') : String(v)
      return [`devx.spec.${f.key}`, text, f.help]
    })
}
