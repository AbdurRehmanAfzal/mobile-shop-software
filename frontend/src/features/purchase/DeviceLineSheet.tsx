/** "Add device" form inside the purchase wizard: identity + cost + accessories.
 *  With `edit`, it edits an existing phone's details: IMEI 1 is fixed, no cost or accessories.
 *  Each kind asks its own things (owner 2026-10-28): a phone IMEI, storage, PTA/JV, patched; a tablet
 *  Wi-Fi only or Wi-Fi + SIM (IMEI and PTA only with a SIM), storage, battery health, pen/keyboard;
 *  a watch GPS or cellular, case size, battery health, strap: no storage, IMEI 2 or JV. */

import { useEffect, useState } from 'react'
import { clearDrafts, useDraft } from '@/lib/draft'
import { useTranslation } from 'react-i18next'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { AccessoryPicker, type AccKind } from '@/components/AccessoryPicker'
import { ImeiInput } from '@/components/FieldInputs'
import { Chip } from '@/components/ui'
import PriceHint from '@/components/PriceHint'
import { uid } from '@/lib/id'
import { toLatinDigits } from '@/lib/format'
import { parseStorage, useBrands, useCatalogueEdit, useColours, useImeiLookup, useModels, useStorages } from '@/lib/queries'
import type { AccessoryItem, Brand, Colour, DeviceCategory, DeviceCondition, Model, PtaStatus, Storage } from '@/lib/types'
import { Smartphone, Tablet, Watch } from 'lucide-react'
import QuickAdd from '@/features/catalogue/QuickAdd'

export interface DeviceLineDraft {
  key: string
  /** phone | tablet | watch (owner 2026-10-28) */
  category: DeviceCategory
  /** tablet / watch: takes a SIM */
  cellular: boolean
  size_mm: string
  battery_health: string
  imei1: string
  /** tablets and smart watches without a SIM have only a serial number */
  serial: string
  imei2: string
  brand_id: string
  brand_name: string
  model_id: string
  model_name: string
  storage_id: string
  colour_id: string
  condition: DeviceCondition
  pta_status: PtaStatus
  sim_time_months: string
  warranty_months: string
  patch_details: string
  cost: string
  asking_price: string
  accessories: AccessoryItem[]
}


/** common smart-watch case sizes */
const WATCH_SIZES = [38, 40, 41, 42, 44, 45, 46, 49] as const

export function emptyDraft(imei = '', kind: 'supplier' | 'walk_in' | 'shop' | 'trade_in' = 'supplier'): DeviceLineDraft {
  return {
    key: uid(),
    category: 'phone',
    cellular: false,
    size_mm: '',
    battery_health: '',
    imei1: imei,
    serial: '',
    imei2: '',
    brand_id: '',
    brand_name: '',
    model_id: '',
    model_name: '',
    storage_id: '',
    colour_id: '',
    condition: kind === 'supplier' ? 'box_pack' : 'used',
    pta_status: 'pta_approved',
    sim_time_months: '',
    warranty_months: kind === 'supplier' ? '12' : '0',
    patch_details: '',
    cost: '',
    asking_price: '',
    accessories: [],
  }
}

export function draftToApi(d: DeviceLineDraft) {
  const phone = (d.category ?? 'phone') === 'phone'
  const sim = phone || !!d.cellular
  return {
    device: {
      category: d.category ?? 'phone',
      cellular: phone ? null : !!d.cellular,
      size_mm: d.category === 'watch' && d.size_mm ? Number(d.size_mm) : null,
      battery_health: !phone && d.battery_health ? Number(d.battery_health) : null,
      imei1: sim ? d.imei1 || null : null,
      imei2: phone ? d.imei2 || null : null,
      serial: d.serial || null,
      brand_id: d.brand_id,
      model_id: d.model_id,
      storage_id: d.category === 'watch' ? null : d.storage_id || null,
      colour_id: d.colour_id || null,
      condition: d.condition,
      // PTA only for a phone, or a tablet / watch that takes a SIM
      pta_status: sim ? d.pta_status : 'unknown',
      sim_time_months: d.sim_time_months ? Number(d.sim_time_months) : null,
      warranty_months: Number(d.warranty_months || 0),
      patch_details: d.patch_details || null,
    },
    cost: Number(d.cost || 0),
    asking_price: d.asking_price ? Number(d.asking_price) : null,
    accessories: d.accessories,
  }
}

/** `draftKey`: keep what is typed if the page reloads (camera on Android), see lib/draft */
export default function DeviceLineSheet({ initial, onSave, edit = false, draftKey }: { initial: DeviceLineDraft; onSave: (d: DeviceLineDraft) => void; edit?: boolean; draftKey?: string }) {
  const { t } = useTranslation()
  const { pick, ur } = useLang()
  const [d, setD] = useDraft<DeviceLineDraft>(draftKey ? `${draftKey}.${initial.key}` : null, initial)
  const [modelQ, setModelQ] = useState('')
  const set = <K extends keyof DeviceLineDraft>(k: K, v: DeviceLineDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const imeiDigits = toLatinDigits(d.imei1).replace(/\D/g, '')
  const { data: lookup } = useImeiLookup(edit ? '' : imeiDigits)
  const category: DeviceCategory = d.category ?? 'phone'
  const { data: brands } = useBrands(category)
  const { data: models } = useModels(d.brand_id || undefined, modelQ || undefined, category)
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const cat = useCatalogueEdit()
  useEffect(() => {
    if (imeiDigits !== d.imei1) set('imei1', imeiDigits)
  }, [imeiDigits]) // eslint-disable-line react-hooks/exhaustive-deps

  const inStockBlock = lookup?.found && lookup.device && !['sold', 'returned_to_supplier'].includes(lookup.device.status)
  const serialOk = /^[A-Za-z0-9-]{4,24}$/.test(d.serial.trim())
  const phone = category === 'phone'
  const sim = phone || !!d.cellular
  // a phone, or anything with a SIM, needs its IMEI; a Wi-Fi tablet or a GPS watch its serial number
  const identityOk = sim ? imeiDigits.length === 15 : serialOk
  const showPta = sim
  const batteryOk = d.battery_health === '' || (Number(d.battery_health) >= 1 && Number(d.battery_health) <= 100)
  const needsSim = showPta && (d.pta_status === 'non_pta' || d.pta_status === 'jv')
  // owner: the price you will sell at may not be lower than what you paid
  const askingLow = !edit && d.asking_price !== '' && d.cost !== '' && Number(d.asking_price) < Number(d.cost)
  const valid = !askingLow && identityOk && d.brand_id && d.model_id && (edit || d.cost !== '') && (!needsSim || d.sim_time_months !== '') && (d.condition !== 'patched' || d.patch_details) && batteryOk && !inStockBlock


  return (
    <div className="flex flex-col gap-3">
      {edit ? null : (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={pick('devcat.what')}>
          {(['phone', 'tablet', 'watch'] as const).map((c) => {
            const Icon = c === 'phone' ? Smartphone : c === 'tablet' ? Tablet : Watch
            const on = category === c
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => setD((x) => ({ ...x, category: c, brand_id: '', brand_name: '', model_id: '', model_name: '', cellular: false, size_mm: '', battery_health: '', imei2: '', storage_id: c === 'watch' ? '' : x.storage_id, condition: x.condition === 'patched' && c !== 'phone' ? 'used' : x.condition, pta_status: c === 'phone' ? x.pta_status : 'pta_approved', accessories: [] }))} className={`tap flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
                <Icon size={22} />
                <span className="text-[13px] leading-tight">{pick(`devcat.${c}`)}</span>
              </button>
            )
          })}
        </div>
      )}
      {phone || edit ? null : (
        <>
          <BiLabel text="devx.connection" size="md" tone="text-muted" />
          <BiSegmented<'no' | 'yes'>
            value={d.cellular ? 'yes' : 'no'}
            onChange={(v) => setD((x) => ({ ...x, cellular: v === 'yes', imei1: v === 'yes' ? x.imei1 : '' }))}
            options={category === 'tablet' ? [{ value: 'no', text: 'devx.wifi' }, { value: 'yes', text: 'devx.wifiSim' }] : [{ value: 'no', text: 'devx.gps' }, { value: 'yes', text: 'devx.cellular' }]}
          />
        </>
      )}
      {sim ? <ImeiInput label="stock.imei" help={<Help term="imei" />} disabled={edit} placeholder={t('stock.imeiPlaceholder')} value={d.imei1} onChange={(v) => set('imei1', v)} exclude={d.imei2} autoFocus={!initial.imei1} /> : null}
      {sim && imeiDigits.length === 15 && lookup ? (
        <div className="flex flex-wrap gap-1.5">
          {!lookup.luhn_ok ? <Chip text="stock.luhnBad" tone="warn" /> : null}
          {lookup.found ? <Chip text={{ en: `${t('stock.seenBefore')} · ${t('stock.timesBought', { n: lookup.times_bought })}`, ur: `${t('stock.seenBefore')} · ${t('stock.timesBought', { n: lookup.times_bought })}` }} tone={inStockBlock ? 'bad' : 'warn'} /> : <Chip text="stock.notSeen" tone="ok" />}
          {inStockBlock ? <Chip text={`stock.status.${lookup.device!.status}`} tone="bad" /> : null}
        </div>
      ) : null}
      {phone ? null : (
        <BiInput label={sim ? 'devx.serialOpt' : 'devcat.serial'} value={d.serial} onChange={(e) => set('serial', e.target.value.toUpperCase())} disabled={edit} maxLength={24} dir="ltr" className="num" hint={sim ? undefined : 'devcat.serialHint'} />
      )}
      {phone ? <ImeiInput label="stock.imei2" value={d.imei2} onChange={(v) => set('imei2', v)} exclude={toLatinDigits(d.imei1).replace(/\D/g, '')} /> : null}

      <div>
        <BiLabel text="stock.brand" size="md" tone="text-muted" className="mb-1.5" />
        <div className="flex flex-wrap gap-1.5">
          {brands?.map((b) => (
            <button key={b.id} type="button" onClick={() => { set('brand_id', b.id); set('brand_name', b.name); set('model_id', ''); set('model_name', '') }} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${d.brand_id === b.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-muted'}`}>
              {ur && b.name_ur ? b.name_ur : b.name}
            </button>
          ))}
          <QuickAdd
            label="catalogue.newBrand"
            placeholder="catalogue.namePh"
            onAdd={async (name) => {
              const b = await cat.add<Brand>('brands', { name })
              setD((x) => ({ ...x, brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' }))
            }}
          />
        </div>
      </div>
      {d.brand_id ? (
        <div>
          <BiLabel text="stock.model" size="md" tone="text-muted" className="mb-1.5" />
          {d.model_id ? (
            <button type="button" onClick={() => set('model_id', '')} className="tap w-full rounded-2xl border border-emerald bg-emerald-tint px-4 py-3 text-start font-bold text-emerald-deep">
              {d.model_name}
            </button>
          ) : (
            <>
              <input value={modelQ} onChange={(e) => setModelQ(e.target.value)} placeholder={pick('common.search')} className="mb-2 min-h-11 w-full rounded-2xl border border-line bg-surface px-4 font-medium" />
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {models?.filter((m) => m.brand_id === d.brand_id).map((m) => (
                  <button key={m.id} type="button" onClick={() => { set('model_id', m.id); set('model_name', m.name) }} className="tap rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink">
                    {m.name}
                  </button>
                ))}
                <QuickAdd
                  key={modelQ}
                  label="catalogue.newModel"
                  placeholder="catalogue.namePh"
                  initial={modelQ}
                  onAdd={async (name) => {
                    const m = await cat.add<Model>('models', { brand_id: d.brand_id, name, category })
                    setD((x) => ({ ...x, model_id: m.id, model_name: m.name }))
                    setModelQ('')
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
      {category === 'watch' ? (
        <div>
          <BiLabel text="devx.size" size="md" tone="text-muted" className="mb-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {WATCH_SIZES.map((mm) => (
              <button key={mm} type="button" aria-pressed={d.size_mm === String(mm)} onClick={() => set('size_mm', d.size_mm === String(mm) ? '' : String(mm))} className={`tap num min-h-11 rounded-full border-2 px-3.5 text-sm ${d.size_mm === String(mm) ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
                {mm}mm
              </button>
            ))}
            <input type="number" inputMode="numeric" min={20} max={60} aria-label={pick('devx.sizeOther')} placeholder={pick('devx.sizeOther')} value={(WATCH_SIZES as readonly number[]).includes(Number(d.size_mm)) ? '' : d.size_mm} onChange={(e) => set('size_mm', e.target.value)} className="min-h-11 w-28 rounded-full border-2 border-line bg-surface px-3 text-sm font-semibold" />
          </div>
        </div>
      ) : null}
      <div className={`grid gap-2 ${category === 'watch' ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {category === 'watch' ? null : (
        <div>
          <BiLabel text="stock.storage" size="md" tone="text-muted" className="mb-1.5" />
          <select value={d.storage_id} onChange={(e) => set('storage_id', e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3 font-semibold">
            <option value="">—</option>
            {storages?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="mt-1.5">
            <QuickAdd
              label="catalogue.newStorage"
              placeholder="catalogue.storagePh"
              valid={(v) => parseStorage(v) !== null}
              onAdd={async (v) => {
                const s = await cat.add<Storage>('storages', parseStorage(v)!)
                set('storage_id', s.id)
              }}
            />
          </div>
        </div>
        )}
        <div>
          <BiLabel text="stock.colour" size="md" tone="text-muted" className="mb-1.5" />
          <select value={d.colour_id} onChange={(e) => set('colour_id', e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3 font-semibold">
            <option value="">—</option>
            {colours?.map((c) => (
              <option key={c.id} value={c.id}>
                {ur && c.name_ur ? c.name_ur : c.name}
              </option>
            ))}
          </select>
          <div className="mt-1.5">
            <QuickAdd
              label="catalogue.newColour"
              placeholder="catalogue.namePh"
              onAdd={async (name) => {
                // now that the list is long, a colour typed again is simply picked
                const have = colours?.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
                const c = have ?? (await cat.add<Colour>('colours', { name }))
                set('colour_id', c.id)
              }}
            />
          </div>
        </div>
      </div>

      <BiLabel text="stock.conditionShort" size="md" tone="text-muted" />
      <BiSegmented<DeviceCondition> value={d.condition} onChange={(v) => set('condition', v)} options={[{ value: 'box_pack', text: 'stock.condition.box_pack' }, { value: 'open_box', text: 'stock.condition.open_box' }, { value: 'used', text: 'stock.condition.used' }, ...(phone ? [{ value: 'patched' as const, text: 'stock.condition.patched' }] : [])]} />
      {d.condition === 'patched' ? <BiInput label="stock.patchDetails" value={d.patch_details} onChange={(e) => set('patch_details', e.target.value)} required /> : null}
      {!phone && d.condition !== 'box_pack' ? (
        <BiInput label="devx.battery" type="number" inputMode="numeric" min={1} max={100} value={d.battery_health} onChange={(e) => set('battery_health', e.target.value)} hint="devx.batteryHint" error={batteryOk ? null : 'devx.batteryBad'} className="num" />
      ) : null}

      {showPta ? <div className="flex items-center gap-1"><BiLabel text="stock.ptaLabel" size="md" tone="text-muted" /><Help term="pta" /></div> : null}
      {showPta ? <BiSegmented<PtaStatus> value={d.pta_status} onChange={(v) => set('pta_status', v)} options={[{ value: 'pta_approved', text: 'stock.pta.pta_approved' }, { value: 'non_pta', text: 'stock.pta.non_pta' }, ...(phone ? [{ value: 'jv' as const, text: 'stock.pta.jv' }] : [])]} /> : null}
      {needsSim ? <BiInput label="stock.simTime" type="number" inputMode="numeric" min={0} max={60} value={d.sim_time_months} onChange={(e) => set('sim_time_months', e.target.value)} required /> : null}

      {edit ? null : (
      <div className="grid grid-cols-2 items-start gap-2">
        <BiInput label="purchase.cost" help={<Help term="cost" />} type="number" inputMode="decimal" min={0} value={d.cost} onChange={(e) => set('cost', e.target.value)} required />
        <BiInput label="stock.asking" help={<Help term="asking" />} type="number" inputMode="decimal" min={0} value={d.asking_price} onChange={(e) => set('asking_price', e.target.value)} error={askingLow ? 'field.askingBelowCost' : null} />
      </div>
      )}
      {!edit && d.model_id ? <PriceHint modelId={d.model_id} storageId={d.storage_id || null} condition={d.condition} onUse={(p) => set('asking_price', String(p))} /> : null}
      <BiInput label={{ en: 'Warranty (months)', ur: 'وارنٹی (مہینے)' }} type="number" inputMode="numeric" min={0} max={60} value={d.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} />

      {edit ? null : (
      <div>
        <AccessoryPicker
          mode="buy"
          category={category}
          value={Object.fromEntries(d.accessories.map((a) => [a.kind, { state: a.came_with ? 'now' : 'later', date: a.expected_at ?? '' }]))}
          onChange={(v) =>
            set(
              'accessories',
              Object.entries(v).flatMap(([kind, x]): AccessoryItem[] =>
                x.state === 'now' ? [{ kind: kind as AccKind, came_with: true, pending_from: 'none' }]
                : x.state === 'later' ? [{ kind: kind as AccKind, came_with: false, pending_from: 'vendor', expected_at: x.date || null }]
                : [],
              ),
            )
          }
        />
      </div>

      )}

      <BiButton text={edit ? 'common.save' : 'common.add'} full disabled={!valid} onClick={() => { if (draftKey) clearDrafts(draftKey); onSave({ ...d, imei1: sim ? imeiDigits : '' }) }} />
    </div>
  )
}
