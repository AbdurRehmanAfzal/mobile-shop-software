/** A locked phone, bought for its parts or to sell as it is (owner 2026-11-15, ADR-085). iCloud /
 *  Google (FRP) locked phones often do not show their IMEI, so the form is short: the lock, brand,
 *  model, storage, colour, cost and (optional) asking price; IMEI, serial, RAM and shelf under More
 *  details. No lock check, no PTA. The app gives it its own barcode label; without an IMEI it is known
 *  by its serial or by a code the shop makes (LCK…). Payment is the purchase's usual payment. */

import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { useBrands, useColours, useModels, useStorages } from '@/lib/queries'
import { toLatinDigits } from '@/lib/format'
import type { DeviceLineDraft } from './DeviceLineSheet'

export type LockType = 'icloud' | 'google' | 'other'
const LOCKS: LockType[] = ['icloud', 'google', 'other']

export default function LockedLineSheet({ initial, onSave, again = false }: { initial: DeviceLineDraft; onSave: (d: DeviceLineDraft) => void; again?: boolean }) {
  const { pick, ur, cls } = useLang()
  const [d, setD] = useState<DeviceLineDraft>(() => ({ ...initial, lock_type: initial.lock_type || 'icloud', condition: 'used', pta_status: 'unknown' }))
  const [modelQ, setModelQ] = useState('')
  const [more, setMore] = useState(!!(initial.imei1 || initial.serial))
  const set = <K extends keyof DeviceLineDraft>(k: K, v: DeviceLineDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const { data: brands } = useBrands('phone')
  const { data: models } = useModels(d.brand_id || undefined, modelQ || undefined, 'phone')
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const imei = toLatinDigits(d.imei1).replace(/\D/g, '')
  const imeiOk = imei === '' || imei.length === 15
  const serialOk = !d.serial.trim() || /^[A-Za-z0-9-]{4,24}$/.test(d.serial.trim())
  const askingLow = d.asking_price !== '' && d.cost !== '' && Number(d.asking_price) < Number(d.cost)
  const valid = !!d.lock_type && !!d.brand_id && !!d.model_id && d.cost !== '' && imeiOk && serialOk && !askingLow
  const chip = (on: boolean) => `tap rounded-full border px-3 py-1.5 text-sm font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`
  // Apple first: most locked phones are iPhones
  const sortedBrands = [...(brands ?? [])].sort((a, b) => Number(/apple/i.test(b.name)) - Number(/apple/i.test(a.name)))

  return (
    <div className="flex flex-col gap-3" data-testid="locked-sheet">
      <div className="flex items-start gap-3 rounded-2xl bg-payable-tint/50 px-3 py-2">
        <Lock size={20} className="mt-0.5 shrink-0 text-payable" />
        <BiLabel text="locked.hint" size="sm" tone="text-ink" />
      </div>

      <span className="flex items-center gap-1"><BiLabel text="locked.which" size="md" tone="text-muted" /><Help term="locked.lock" size="sm" /></span>
      <div className="grid grid-cols-3 gap-2">
        {LOCKS.map((l) => (
          <button key={l} type="button" aria-pressed={d.lock_type === l} onClick={() => set('lock_type', l)} className={`tap min-h-12 rounded-2xl border-2 px-2 font-bold ${d.lock_type === l ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`} data-testid={`lock-${l}`}>
            {pick(`locked.type.${l}`)}
          </button>
        ))}
      </div>

      <span className="flex items-center gap-1"><BiLabel text="stock.brand" size="md" tone="text-muted" /><Help term="device.brand" size="sm" /></span>
      <div className="flex flex-wrap gap-1.5">
        {sortedBrands.map((b) => (
          <button key={b.id} type="button" onClick={() => setD((x) => ({ ...x, brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' }))} className={chip(d.brand_id === b.id)}>
            {ur && b.name_ur ? b.name_ur : b.name}
          </button>
        ))}
      </div>

      {d.brand_id ? (
        <>
          <span className="flex items-center gap-1"><BiLabel text="stock.model" size="md" tone="text-muted" /><Help term="device.model" size="sm" /></span>
          <BiInput label="locked.findModel" value={modelQ} onChange={(e) => setModelQ(e.target.value)} />
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {(models ?? []).map((m) => (
              <button key={m.id} type="button" onClick={() => setD((x) => ({ ...x, model_id: m.id, model_name: m.name }))} className={chip(d.model_id === m.id)}>
                {ur && m.name_ur ? m.name_ur : m.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <BiLabel text="stock.storage" size="md" tone="text-muted" />
          <select value={d.storage_id} onChange={(e) => set('storage_id', e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3 font-semibold">
            <option value="">—</option>
            {storages?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <BiLabel text="stock.colour" size="md" tone="text-muted" />
          <select value={d.colour_id} onChange={(e) => set('colour_id', e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3 font-semibold">
            <option value="">—</option>
            {colours?.map((c) => <option key={c.id} value={c.id}>{ur && c.name_ur ? c.name_ur : c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 items-start gap-2">
        <BiInput label="purchase.cost" help={<Help term="cost" size="sm" />} type="number" inputMode="decimal" min={0} value={d.cost} onChange={(e) => set('cost', e.target.value)} className="num" data-testid="locked-cost" />
        <BiInput label="devx.askingOpt" help={<Help term="asking" size="sm" />} type="number" inputMode="decimal" min={0} value={d.asking_price} onChange={(e) => set('asking_price', e.target.value)} className="num" error={askingLow ? 'field.askingBelowCost' : null} />
      </div>

      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="tap flex min-h-12 items-center justify-between rounded-2xl border border-dashed border-line px-4" data-testid="locked-more">
        <BiLabel text={more ? 'devx.less' : 'devx.more'} size="md" bold />
        {more ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {more ? (
        <div className="flex flex-col gap-3">
          <BiInput label="locked.imei" value={d.imei1} onChange={(e) => set('imei1', e.target.value)} inputMode="numeric" dir="ltr" className="num" hint="locked.imeiHint" error={imeiOk ? null : 'locked.imeiBad'} />
          <BiInput label="devx.serialOpt" value={d.serial} onChange={(e) => set('serial', e.target.value.toUpperCase())} maxLength={24} dir="ltr" className="num" error={serialOk ? null : 'devx.serialBad'} />
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="devx.ram" type="number" inputMode="numeric" min={1} max={64} value={d.ram_gb ?? ''} onChange={(e) => set('ram_gb', e.target.value)} className="num" />
            <BiInput label="stock.shelf" value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} maxLength={60} />
          </div>
        </div>
      ) : null}

      <BiButton text={again ? 'common.save' : 'common.add'} full disabled={!valid} onClick={() => onSave({ ...d, imei1: imei, imei2: '', condition: 'used', pta_status: 'unknown', warranty_months: '0', lock_checks: undefined, lock_checked: false })} data-testid="locked-save" />
    </div>
  )
}
