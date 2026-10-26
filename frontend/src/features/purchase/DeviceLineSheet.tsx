/** "Add device" form inside the purchase wizard: identity + cost + accessories.
 *  With `edit`, it edits an existing phone's details: IMEI 1 is fixed, no cost or accessories. */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { Chip } from '@/components/ui'
import { uid } from '@/lib/id'
import { toLatinDigits } from '@/lib/format'
import { parseStorage, useBrands, useCatalogueEdit, useColours, useImeiLookup, useModels, useStorages } from '@/lib/queries'
import type { AccessoryItem, Brand, Colour, DeviceCondition, Model, PtaStatus, Storage } from '@/lib/types'
import QuickAdd from '@/features/catalogue/QuickAdd'

export interface DeviceLineDraft {
  key: string
  imei1: string
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

const ACC_KINDS: AccessoryItem['kind'][] = ['box', 'charger', 'cable', 'earphones', 'airpods']

export function emptyDraft(imei = '', kind: 'supplier' | 'walk_in' | 'shop' | 'trade_in' = 'supplier'): DeviceLineDraft {
  return {
    key: uid(),
    imei1: imei,
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
  return {
    device: {
      imei1: d.imei1,
      imei2: d.imei2 || null,
      brand_id: d.brand_id,
      model_id: d.model_id,
      storage_id: d.storage_id || null,
      colour_id: d.colour_id || null,
      condition: d.condition,
      pta_status: d.pta_status,
      sim_time_months: d.sim_time_months ? Number(d.sim_time_months) : null,
      warranty_months: Number(d.warranty_months || 0),
      patch_details: d.patch_details || null,
    },
    cost: Number(d.cost || 0),
    asking_price: d.asking_price ? Number(d.asking_price) : null,
    accessories: d.accessories,
  }
}

export default function DeviceLineSheet({ initial, onSave, edit = false }: { initial: DeviceLineDraft; onSave: (d: DeviceLineDraft) => void; edit?: boolean }) {
  const { t } = useTranslation()
  const { pick, ur } = useLang()
  const [d, setD] = useState<DeviceLineDraft>(initial)
  const [modelQ, setModelQ] = useState('')
  const set = <K extends keyof DeviceLineDraft>(k: K, v: DeviceLineDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const imeiDigits = toLatinDigits(d.imei1).replace(/\D/g, '')
  const { data: lookup } = useImeiLookup(edit ? '' : imeiDigits)
  const { data: brands } = useBrands()
  const { data: models } = useModels(d.brand_id || undefined, modelQ || undefined)
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const cat = useCatalogueEdit()
  useEffect(() => {
    if (imeiDigits !== d.imei1) set('imei1', imeiDigits)
  }, [imeiDigits]) // eslint-disable-line react-hooks/exhaustive-deps

  const inStockBlock = lookup?.found && lookup.device && !['sold', 'returned_to_supplier'].includes(lookup.device.status)
  const needsSim = d.pta_status === 'non_pta' || d.pta_status === 'jv'
  const valid = imeiDigits.length === 15 && d.brand_id && d.model_id && (edit || d.cost !== '') && (!needsSim || d.sim_time_months !== '') && (d.condition !== 'patched' || d.patch_details) && !inStockBlock

  const toggleAcc = (kind: AccessoryItem['kind'], field: 'came_with' | 'pending_vendor') => {
    const existing = d.accessories.find((a) => a.kind === kind)
    let next: AccessoryItem[]
    if (field === 'came_with') {
      next = existing ? d.accessories.filter((a) => a.kind !== kind) : [...d.accessories, { kind, came_with: true, pending_from: 'none' }]
    } else {
      next = existing
        ? d.accessories.map((a) => (a.kind === kind ? { ...a, came_with: false, pending_from: a.pending_from === 'vendor' ? 'none' : 'vendor' } : a))
        : [...d.accessories, { kind, came_with: false, pending_from: 'vendor' }]
    }
    set('accessories', next)
  }

  return (
    <div className="flex flex-col gap-3">
      <BiInput label="stock.imei" disabled={edit} inputMode="numeric" placeholder={t('stock.imeiPlaceholder')} value={d.imei1} onChange={(e) => set('imei1', e.target.value)} maxLength={20} autoFocus={!initial.imei1} />
      {imeiDigits.length === 15 && lookup ? (
        <div className="flex flex-wrap gap-1.5">
          {!lookup.luhn_ok ? <Chip text="stock.luhnBad" tone="warn" /> : null}
          {lookup.found ? <Chip text={{ en: `${t('stock.seenBefore')} · ${t('stock.timesBought', { n: lookup.times_bought })}`, ur: `${t('stock.seenBefore')} · ${t('stock.timesBought', { n: lookup.times_bought })}` }} tone={inStockBlock ? 'bad' : 'warn'} /> : <Chip text="stock.notSeen" tone="ok" />}
          {inStockBlock ? <Chip text={`stock.status.${lookup.device!.status}`} tone="bad" /> : null}
        </div>
      ) : null}
      <BiInput label="stock.imei2" inputMode="numeric" value={d.imei2} onChange={(e) => set('imei2', e.target.value)} maxLength={20} />

      <div>
        <BiLabel text="stock.brand" size="md" tone="text-muted" className="mb-1.5" />
        <div className="flex flex-wrap gap-1.5">
          {brands?.map((b) => (
            <button key={b.id} type="button" onClick={() => { set('brand_id', b.id); set('brand_name', b.name); set('model_id', ''); set('model_name', '') }} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${d.brand_id === b.id ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>
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
                    const m = await cat.add<Model>('models', { brand_id: d.brand_id, name })
                    setD((x) => ({ ...x, model_id: m.id, model_name: m.name }))
                    setModelQ('')
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
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
                const c = await cat.add<Colour>('colours', { name })
                set('colour_id', c.id)
              }}
            />
          </div>
        </div>
      </div>

      <BiLabel text="stock.conditionShort" size="md" tone="text-muted" />
      <BiSegmented<DeviceCondition> value={d.condition} onChange={(v) => set('condition', v)} options={[{ value: 'box_pack', text: 'stock.condition.box_pack' }, { value: 'open_box', text: 'stock.condition.open_box' }, { value: 'used', text: 'stock.condition.used' }, { value: 'patched', text: 'stock.condition.patched' }]} />
      {d.condition === 'patched' ? <BiInput label="stock.patchDetails" value={d.patch_details} onChange={(e) => set('patch_details', e.target.value)} required /> : null}

      <BiLabel text="stock.ptaLabel" size="md" tone="text-muted" />
      <BiSegmented<PtaStatus> value={d.pta_status} onChange={(v) => set('pta_status', v)} options={[{ value: 'pta_approved', text: 'stock.pta.pta_approved' }, { value: 'non_pta', text: 'stock.pta.non_pta' }, { value: 'jv', text: 'stock.pta.jv' }]} />
      {needsSim ? <BiInput label="stock.simTime" type="number" inputMode="numeric" min={0} max={60} value={d.sim_time_months} onChange={(e) => set('sim_time_months', e.target.value)} required /> : null}

      {edit ? null : (
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="purchase.cost" type="number" inputMode="decimal" min={0} value={d.cost} onChange={(e) => set('cost', e.target.value)} required />
        <BiInput label="stock.asking" type="number" inputMode="decimal" min={0} value={d.asking_price} onChange={(e) => set('asking_price', e.target.value)} />
      </div>
      )}
      <BiInput label={{ en: 'Warranty (months)', ur: 'وارنٹی (مہینے)' }} type="number" inputMode="numeric" min={0} max={60} value={d.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} />

      {edit ? null : (
      <div>
        <BiLabel text="stock.accessories" size="md" tone="text-muted" className="mb-1.5" />
        <div className="card flex flex-col divide-y divide-line p-0">
          {ACC_KINDS.map((k) => {
            const a = d.accessories.find((x) => x.kind === k)
            return (
              <div key={k} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm font-semibold">{pick(`stock.acc.${k}`)}</span>
                <button type="button" aria-pressed={!!a?.came_with} onClick={() => toggleAcc(k, 'came_with')} className={`tap rounded-full px-3 py-1 text-xs font-bold ${a?.came_with ? 'bg-emerald-tint text-emerald-deep' : 'border border-line text-muted'}`}>
                  {pick('stock.accCameWith')}
                </button>
                <button type="button" aria-pressed={a?.pending_from === 'vendor'} onClick={() => toggleAcc(k, 'pending_vendor')} className={`tap rounded-full px-3 py-1 text-xs font-bold ${a?.pending_from === 'vendor' ? 'bg-receivable-tint text-receivable' : 'border border-line text-muted'}`}>
                  {pick('stock.accPendingVendor')}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      )}

      <BiButton text={edit ? 'common.save' : 'common.add'} full disabled={!valid} onClick={() => onSave({ ...d, imei1: imeiDigits })} />
    </div>
  )
}
