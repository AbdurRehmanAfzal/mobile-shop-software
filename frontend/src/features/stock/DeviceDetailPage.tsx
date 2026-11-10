import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { isoDay } from '@/lib/format'
import RemoveSheet from '@/components/RemoveSheet'
import { Chip, ErrorText, KV, Loading, MoneyText, PageHeader, Section, Sheet } from '@/components/ui'
import LabelSheet from '@/components/LabelSheet'
import { ApiError, api, patch, post } from '@/lib/api'
import { ImeiInput } from '@/components/FieldInputs'
import { useAuth } from '@/lib/auth'
import { useDevice, useDeviceEvent, useDeviceHistory, useDocMutation, useInvalidate, useParties } from '@/lib/queries'
import type { DeviceDetail, Loan } from '@/lib/types'
import DeviceLineSheet, { emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import { hasPta, specLine } from './StockPage'
import { LockChecksEditor, lockState, specRows, type LockChecks } from './DeviceSpecs'
import type { DeviceCategory } from '@/lib/types'
import PriceHint from '@/components/PriceHint'
import UnitMoney from './UnitMoney'
import { DeviceReserve } from './ReserveCard'
import { isApple } from '@/features/purchase/AppleVariant'


function toDraft(d: DeviceDetail): DeviceLineDraft {
  return {
    ...emptyDraft(d.imei1),
    category: d.category ?? 'phone',
    cellular: !!d.cellular,
    serial: d.serial ?? '',
    size_mm: d.size_mm ? String(d.size_mm) : '',
    battery_health: d.battery_health ? String(d.battery_health) : '',
    imei2: d.imei2 ?? '',
    brand_id: d.brand_id,
    brand_name: d.brand_name,
    model_id: d.model_id,
    model_name: d.model_name,
    storage_id: d.storage_id ?? '',
    colour_id: d.colour_id ?? '',
    condition: d.condition,
    pta_status: d.pta_status,
    sim_time_months: d.sim_time_months === null ? '' : String(d.sim_time_months),
    warranty_months: String(d.warranty_months),
    patch_details: d.patch_details ?? '',
    grade: d.grade ?? '',
    ram_gb: d.ram_gb ? String(d.ram_gb) : '',
    warranty_by: d.warranty_by ?? '',
    specs: d.specs ?? {},
    region_code: d.region_code ?? '',
    location: d.location ?? '',
    battery_cycles: d.battery_cycles != null ? String(d.battery_cycles) : '',
    sim_type: d.sim_type ?? '',
  }
}


export default function DeviceDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pick } = useLang()
  const { data: d, isLoading } = useDevice(id)
  const { data: history } = useDeviceHistory(id)
  const ev = useDeviceEvent()
  const loanM = useDocMutation<{ device_id: string; party_id: string; expected_back_at?: string; notes?: string }, Loan>('POST', () => '/api/v1/loans')
  const [sheet, setSheet] = useState<null | 'loan' | 'note' | 'price' | 'edit' | 'remove' | 'label' | 'lock' | 'retype' | 'imei'>(null)
  // owner 2026-11-09 (ADR-056): an IMEI typed wrong
  const [fix, setFix] = useState({ imei1: '', imei2: '', clear2: false, reason: '' })
  const [fixErr, setFixErr] = useState<unknown>(null)
  // owner addendum 6: lock check and type change
  const [locks, setLocks] = useState<LockChecks>({})
  const [lockNote, setLockNote] = useState('')
  const [toCat, setToCat] = useState<DeviceCategory>('tablet')
  const [preview, setPreview] = useState<{ problems: string[] }[] | null>(null)
  const [retypeErr, setRetypeErr] = useState<unknown>(null)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [priceErr, setPriceErr] = useState<ApiError | null>(null)
  const inv = useInvalidate()
  const [text, setText] = useState('')
  const [partyId, setPartyId] = useState('')
  const [expected, setExpected] = useState('')
  const { data: shops } = useParties({ kind: 'shop' })
  const canSeeCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  // the purchase this unit came in on (its latest), for "Change dealer / customer" (owner 2026-11-10)
  const boughtOn = [...(history ?? [])].reverse().find((e) => e.type === 'purchased' && e.document_type === 'purchase')?.document_id ?? null
  const multiShop = useAuth((s) => (s.me?.shops.length ?? 0) > 1)

  if (isLoading || !d) return <Loading />
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  const inStock = d.status === 'in_stock'
  // an old-stock entry typed by mistake can be removed while nothing but verification happened to it
  const opening = history?.find((e) => e.document_type === 'opening_stock')
  const canRemoveOpening = canSeeCost && inStock && !!opening && history!.every((e) => e.seq <= opening.seq || e.type === 'verified')
  const priceLow = sheet === 'price' && d.cost_price != null && text !== '' && Number(text) < Number(d.cost_price)

  async function simple(type: string) {
    await ev.mutateAsync({ id: d!.id, type })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={{ en: `${d.brand_name} ${d.model_name}`, ur: `${d.brand_name} ${d.model_name}` }} help={<Help term="stock.detail" />} />

      <section className="hero flex flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="num text-lg" dir="ltr">
              {d.imei1}
            </div>
            {d.barcode ? <div className="num flex items-center gap-1 text-xs text-hero-text/75" dir="ltr" data-testid="device-barcode">{pick('barcode.label')}: {d.barcode}{d.barcode_type && d.barcode_type !== 'code128' ? ` · ${d.barcode_type}` : ''}<Help term="label.barcode" size="sm" /></div> : null}
            <div className="text-sm text-hero-text/75">
              {specLine(d, pick)}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1"><Chip text={`stock.status.${d.status}`} tone="ink" /><Help term="device.status" size="sm" /></span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip text={`stock.condition.${d.condition}`} />
          {d.grade ? <Chip text={['a', 'b', 'refurbished', 'copy'].includes(d.grade) ? `devx.grades.${d.grade}` : { en: d.grade, ur: d.grade }} /> : null}
          {hasPta(d) ? <Chip text={`stock.pta.${d.pta_status}`} tone={d.pta_status === 'pta_approved' ? 'ok' : 'warn'} /> : null}
          {d.condition !== 'box_pack' ? <Chip text={lockState(d.lock_checks) === 'ok' ? 'devx.lock.ok' : lockState(d.lock_checks) === 'bad' ? 'devx.lock.bad' : 'devx.lock.none'} tone={lockState(d.lock_checks) === 'ok' ? 'ok' : lockState(d.lock_checks) === 'bad' ? 'bad' : 'warn'} /> : null}
          {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
          {d.cycle_no > 1 ? <Chip text={{ en: `Cycle ${d.cycle_no}`, ur: `${d.cycle_no} بار` }} /> : null}
          <Help term="device.badges" size="sm" />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="flex items-center gap-1"><BiLabel text="stock.asking" size="sm" tone="text-hero-text/75" /><Help term="asking" size="sm" /></span>
            <MoneyText value={d.asking_price} tone="ink" />
          </div>
          {canSeeCost ? (
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <span className="flex items-center gap-1"><BiLabel text="stock.cost" size="sm" tone="text-hero-text/75" /><Help term="cost" size="sm" /></span>
              <MoneyText value={d.cost_price} tone="ink" />
            </div>
          ) : null}
        </div>
        {d.current_party_name ? (
          <div className="flex items-center gap-1 text-sm text-hero-text/80">
            <span>{pick('stock.withParty')}: <b>{d.current_party_name}</b></span><Help term="stock.withParty" size="sm" />
          </div>
        ) : null}
      </section>
      <DeviceReserve deviceId={d.id} d={d} inStock={inStock} />

      {inStock ? (
        <div className="grid grid-cols-2 gap-2">
          <BiButton text="stock.sell" onClick={() => nav(`/sale/new?device=${d.id}`)} disabled={d.verification_status === 'flagged'} />
          {d.verification_status === 'pending' || d.verification_status === 'flagged' || d.condition !== 'box_pack' ? (
            <BiButton text="stock.verify" variant={d.verification_status === 'pending' ? 'gold' : 'secondary'} onClick={() => nav(`/stock/${d.id}/verify`)} />
          ) : (
            <BiButton text="stock.loanOut" variant="secondary" onClick={() => setSheet('loan')} />
          )}
        </div>
      ) : null}

      {d.status === 'sold' ? <BiButton text="counter.returnJob" variant="secondary" full onClick={() => nav(`/return/new?device=${d.id}`)} /> : null}

      <Section title="stock.actions" help="stock.actions">
        <div className="grid grid-cols-2 gap-2">
          {inStock ? <BiButton text="stock.loanOut" variant="secondary" size="md" onClick={() => setSheet('loan')} /> : null}
          {inStock ? <BiButton text="stock.markFaulty" variant="secondary" size="md" onClick={() => simple('marked_faulty')} /> : null}
          {d.status === 'faulty' ? <BiButton text="stock.faultyCleared" variant="secondary" size="md" onClick={() => simple('faulty_cleared')} /> : null}
          {inStock || d.status === 'faulty' ? <BiButton text="stock.sendRepair" variant="secondary" size="md" onClick={() => simple('sent_to_repair')} /> : null}
          {d.status === 'in_repair' ? <BiButton text="stock.repairReturned" variant="secondary" size="md" onClick={() => simple('repair_returned')} /> : null}
          {d.status === 'with_customer_for_approval' ? <BiButton text="stock.approvalReturned" variant="secondary" size="md" onClick={() => simple('approval_returned')} /> : null}
          <BiButton text="label.button" variant="secondary" size="md" onClick={() => setSheet('label')} />
          <BiButton text="stock.changePrice" variant="secondary" size="md" onClick={() => { setText(d.asking_price ?? ''); setSheet('price') }} />
          <BiButton text="stock.addNote" variant="secondary" size="md" onClick={() => { setText(''); setSheet('note') }} />
          <BiButton text="crud.editDetails" variant="secondary" size="md" onClick={() => setSheet('edit')} />
          {canSeeCost && boughtOn ? <BiButton text="purchase.fix.partyButton" variant="secondary" size="md" onClick={() => nav(`/purchases/${boughtOn}?change=1`)} data-testid="device-change-seller" /> : null}
          {canSeeCost ? <BiButton text="bal.short" variant="secondary" size="md" onClick={() => nav(`/balances?q=${encodeURIComponent(d.imei1)}`)} data-testid="device-balances" /> : null}
          {canSeeCost && ((d.category ?? 'phone') === 'phone' || d.cellular) ? <BiButton text="stock.fixImei.button" variant="secondary" size="md" onClick={() => { setFix({ imei1: d.imei1, imei2: d.imei2 ?? '', clear2: false, reason: '' }); setFixErr(null); setSheet('imei') }} data-testid="fix-imei" /> : null}
          {d.condition !== 'box_pack' ? <BiButton text="devx.lock.button" variant="secondary" size="md" onClick={() => { setLocks(d.lock_checks ?? {}); setLockNote(''); setSheet('lock') }} /> : null}
          {canSeeCost ? <BiButton text="devx.retype" variant="secondary" size="md" onClick={() => { setToCat((d.category ?? 'phone') === 'phone' ? 'tablet' : 'phone'); setPreview(null); setRetypeErr(null); setSheet('retype') }} /> : null}
          {inStock && canSeeCost && multiShop ? <BiButton text="transfer.sendBranch" variant="secondary" size="md" onClick={() => nav(`/transfers/new?device=${d.id}`)} /> : null}
          {canRemoveOpening ? <BiButton text="crud.removeOldStock" variant="secondary" size="md" onClick={() => setSheet('remove')} /> : null}
        </div>
        <ErrorText error={ev.error ?? loanM.error} />
      </Section>

      <Section title="stock.device" help="stock.deviceInfo">
        <div className="card">
          {d.imei2 ? <KV k="stock.imei2" help="device.imei2" v={<span dir="ltr">{d.imei2}</span>} /> : null}
          {d.serial ? <KV k="stock.serial" help="device.serial" v={<span dir="ltr">{d.serial}</span>} /> : null}
          {d.sim_time_months ? <KV k="stock.simTime" help="device.simTime" v={d.sim_time_months} /> : null}
          {d.warranty_months ? <KV k="stock.warranty" help="device.warrantyMonths" v={`${d.warranty_months} ${pick('stock.months')}${d.warranty_by ? ` · ${pick(`devx.by.${d.warranty_by}`)}` : ''}`} /> : null}
          {d.ram_gb ? <KV k="devx.ram" help="device.ram" v={<span dir="ltr">{d.ram_gb} GB</span>} /> : null}
          {specRows(d.category ?? 'phone', d.specs, pick).map(([k, v, h]) => <KV key={k} k={k} help={h} v={<span dir="ltr">{v}</span>} />)}
          {d.lock_checks ? <KV k="devx.lock.title" help="device.lock" v={<span className="flex flex-col items-end">{Object.entries(d.lock_checks).map(([k, v]) => <span key={k} className={v === 'not_cleared' ? 'text-payable' : ''}>{pick(`devx.lock.${k}`)}: {pick(`devx.lock.${v}`)}</span>)}</span>} /> : null}
          {d.patch_details ? <KV k="stock.patchDetails" help="device.patch" v={d.patch_details} /> : null}
          {d.notes ? <KV k="common.notes" help="common.notes" v={d.notes} /> : null}
        </div>
      </Section>

      {d.accessories.length ? (
        <Section title="stock.accessories" help="stock.accessories">
          <div className="flex flex-wrap gap-1.5">
            {d.accessories.map((a) => {
              const label = a.kind === 'other' && a.label ? a.label : pick(`stock.acc.${a.kind}`)
              const tone = a.given_at_sale ? 'ink' : a.pending_from === 'vendor' ? 'warn' : a.pending_from === 'shop' ? 'bad' : a.came_with ? 'ok' : 'muted'
              const hint = a.given_at_sale ? pick('stock.accGiven') : a.pending_from === 'vendor' ? pick('stock.accPendingVendor') : a.pending_from === 'shop' ? pick('stock.accPendingShop') : ''
              return <Chip key={a.id ?? a.kind} text={{ en: `${label}${hint ? ` · ${hint}` : ''}`, ur: `${label}${hint ? ` · ${hint}` : ''}` }} tone={tone} />
            })}
          </div>
        </Section>
      ) : null}

      <UnitMoney deviceId={d.id} />

      <LabelSheet kind="devices" ids={[d.id]} open={sheet === 'label'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'loan'} onClose={() => setSheet(null)} title="stock.loanOut">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="loan.toShop" size="md" tone="text-muted" /><Help term="loan.toShop" size="sm" /></span>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 font-semibold">
            <option value="">—</option>
            {shops?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <BiInput label="loan.expectedBack" help={<Help term="loan.expectedBack" size="sm" />} type="date" min={isoDay(0)} value={expected} onChange={(e) => setExpected(e.target.value)} />
          <BiInput label="common.notes" help={<Help term="common.notes" size="sm" />} value={text} onChange={(e) => setText(e.target.value)} />
          <ErrorText error={loanM.error} />
          <BiButton
            text="loan.new"
            full
            loading={loanM.isPending}
            disabled={!partyId}
            onClick={async () => {
              await loanM.mutateAsync({ device_id: d.id, party_id: partyId, expected_back_at: expected || undefined, notes: text || undefined })
              setSheet(null)
            }}
          />
        </div>
      </Sheet>

      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="crud.editDetails">
        {sheet === 'edit' ? (
          <DeviceLineSheet
            edit
            initial={toDraft(d)}
            onSave={async (x) => {
              await patch(`/api/v1/devices/${d.id}`, {
                brand_id: x.brand_id,
                model_id: x.model_id,
                imei2: x.imei2 || null,
                storage_id: x.storage_id || null,
                colour_id: x.colour_id || null,
                condition: x.condition,
                pta_status: x.pta_status,
                sim_time_months: x.sim_time_months ? Number(x.sim_time_months) : null,
                warranty_months: Number(x.warranty_months || 0),
                patch_details: x.patch_details || null,
                ...(x.category === 'watch' ? { size_mm: x.size_mm ? Number(x.size_mm) : null } : {}),
                battery_health: x.battery_health ? Number(x.battery_health) : null,
                grade: x.condition !== 'box_pack' && x.grade ? x.grade : null,
                ram_gb: x.category !== 'watch' && x.ram_gb ? Number(x.ram_gb) : null,
                warranty_by: x.warranty_by || null,
                region_code: isApple(x.brand_name, x.model_name) ? x.region_code || null : null,
                location: x.location || null,
                battery_cycles: isApple(x.brand_name, x.model_name) && x.battery_cycles !== '' && x.battery_cycles != null ? Number(x.battery_cycles) : null,
                sim_type: isApple(x.brand_name, x.model_name) && (x.category === 'phone' || x.cellular) ? x.sim_type || null : null,
                specs: x.specs && Object.keys(x.specs).length ? x.specs : null,
              })
              await inv('devices', 'device', 'history')
              setSheet(null)
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={sheet === 'lock'} onClose={() => setSheet(null)} title="devx.lock.title">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="devx.lock.hint" size="sm" tone="text-muted" /><Help term="device.lock" size="sm" /></span>
          <LockChecksEditor category={d.category ?? 'phone'} value={locks} onChange={setLocks} />
          <BiInput label="devx.lock.note" help={<Help term="common.notes" size="sm" />} value={lockNote} onChange={(e) => setLockNote(e.target.value)} maxLength={200} />
          <BiButton text="common.save" full disabled={!Object.keys(locks).length} onClick={async () => { await post(`/api/v1/devices/${d.id}/lock-check`, { checks: locks, note: lockNote || null }); await inv('devices', 'device', 'history'); setSheet(null) }} />
        </div>
      </Sheet>
      <Sheet open={sheet === 'imei'} onClose={() => setSheet(null)} title="stock.fixImei.title">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="stock.fixImei.hint" size="sm" tone="text-muted" /><Help term="stock.fixImei" size="sm" /></span>
          <ImeiInput label="stock.imei" help={<Help term="imei" size="sm" />} value={fix.imei1} onChange={(v) => setFix({ ...fix, imei1: v })} exclude={fix.imei2} />
          {!fix.clear2 ? <ImeiInput label="stock.imei2" help={<Help term="imei" size="sm" />} value={fix.imei2} onChange={(v) => setFix({ ...fix, imei2: v })} exclude={fix.imei1} /> : null}
          {d.imei2 ? <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={fix.clear2} onChange={(e) => setFix({ ...fix, clear2: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--emerald))]" /><BiLabel text="stock.fixImei.clear2" size="sm" /></label> : null}
          <BiInput label="common.reason" value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} maxLength={200} help={<Help term="stock.fixImeiReason" size="sm" />} />
          <ErrorText error={fixErr} />
          <BiButton
            text="common.save"
            full
            disabled={fix.reason.trim().length < 2 || fix.imei1.replace(/\D/g, '').length !== 15 || (!fix.clear2 && fix.imei2 !== '' && fix.imei2.replace(/\D/g, '').length !== 15)}
            onClick={async () => {
              try {
                await api('POST', `/api/v1/devices/${d.id}/correct-imei`, { imei1: fix.imei1 !== d.imei1 ? fix.imei1 : undefined, imei2: !fix.clear2 && fix.imei2 && fix.imei2 !== d.imei2 ? fix.imei2 : undefined, clear_imei2: fix.clear2, reason: fix.reason.trim() })
                await inv('devices', 'device', 'history', 'unit-money')
                setSheet(null)
              } catch (e) { setFixErr(e) }
            }}
            data-testid="fix-imei-save"
          />
        </div>
      </Sheet>
      <Sheet open={sheet === 'retype'} onClose={() => setSheet(null)} title="devx.retype">
        <div className="flex flex-col gap-3" data-testid="retype-sheet">
          <span className="flex items-center gap-1"><BiLabel text="devx.retypeHint" size="sm" tone="text-muted" /><Help term="device.retype" size="sm" /></span>
          <BiLabel text="devx.retypeTo" size="md" tone="text-muted" />
          <div className="grid grid-cols-3 gap-2">
            {(['phone', 'tablet', 'watch'] as DeviceCategory[]).filter((c) => c !== (d.category ?? 'phone')).map((c) => <button key={c} type="button" aria-pressed={toCat === c} onClick={() => { setToCat(c); setPreview(null) }} className={`tap min-h-12 rounded-2xl border-2 font-bold ${toCat === c ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{pick(`devcat.${c}`)}</button>)}
          </div>
          {preview ? (preview[0].problems.length ? <BiAlert text={{ en: preview[0].problems.map((p) => pick(`devx.problem.${p}`)).join(', '), ur: preview[0].problems.map((p) => pick(`devx.problem.${p}`)).join('، ') }} /> : <BiAlert text="devx.retypeHint" kind="success" />) : null}
          <ErrorText error={retypeErr} />
          {!preview ? <BiButton text="devx.retypePreview" full onClick={async () => { try { setPreview(await post(`/api/v1/devices/reclassify/preview`, { device_ids: [d.id], to_category: toCat })) } catch (e) { setRetypeErr(e) } }} /> : <BiButton text="devx.retypeApply" full disabled={!!preview[0].problems.length} onClick={async () => { try { await post(`/api/v1/devices/reclassify/apply`, { device_ids: [d.id], to_category: toCat }); await inv('devices', 'device', 'history'); setSheet(null) } catch (e) { setRetypeErr(e) } }} />}
        </div>
      </Sheet>

      <RemoveSheet
        open={sheet === 'remove'}
        onClose={() => setSheet(null)}
        title="crud.removeOldStock"
        hint="crud.removeOldStockHint"
        reason
        name={<span dir="ltr">{d.imei1}</span>}
        onConfirm={async (reason) => {
          await post(`/api/v1/devices/${d.id}/cancel-opening`, { reason })
          await inv()
        }}
      />

      {/* the buying price is only sent to the owner/manager; the server checks it for everyone */}
      <Sheet open={sheet === 'note' || sheet === 'price'} onClose={() => setSheet(null)} title={sheet === 'price' ? 'stock.changePrice' : 'stock.addNote'}>
        <div className="flex flex-col gap-3">
          <BiInput label={sheet === 'price' ? 'stock.asking' : 'common.notes'} help={sheet === 'price' ? <Help term="asking" size="sm" /> : <Help term="common.notes" size="sm" />} type={sheet === 'price' ? 'number' : 'text'} inputMode={sheet === 'price' ? 'decimal' : 'text'} value={text} onChange={(e) => setText(e.target.value)} autoFocus error={priceLow ? 'field.askingBelowCost' : null} />
          {sheet === 'price' ? <PriceHint modelId={d.model_id} storageId={d.storage_id} condition={d.condition} excludeDeviceId={d.id} onUse={(p) => setText(String(p))} /> : null}
          {sheet === 'price' ? <BiInput label="confirm.reason" help={<Help term="price.reason" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          {sheet === 'price' && priceErr && (priceErr.code === 'pin_required' || priceErr.code === 'pin_wrong') ? <BiInput label="confirm.ownerPin" help={<Help term="price.ownerPin" size="sm" />} type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={priceErr.code === 'pin_wrong' ? 'confirm.pinWrong' : 'confirm.pinNeeded'} className="num tracking-[.3em]" dir="ltr" /> : null}
          {sheet === 'price' && priceErr && priceErr.code === 'approval_required' ? <BiAlert text="confirm.blocked" /> : null}
          <BiButton
            text="common.save"
            full
            disabled={priceLow}
            loading={ev.isPending}
            onClick={async () => {
              if (sheet === 'price') {
                try { await patch(`/api/v1/devices/${d.id}`, { asking_price: Number(text), asking_reason: reason || undefined, approval_pin: pin || undefined }) } catch (e) { if (e instanceof ApiError) { setPriceErr(e); return } throw e }
                setPriceErr(null); setReason(''); setPin(''); inv('devices', 'unit-money')
              } else await ev.mutateAsync({ id: d.id, type: 'note', note: text })
              setSheet(null)
            }}
          />
        </div>
      </Sheet>
    </div>
  )
}
