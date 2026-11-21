import LockedPanel from './LockedPanel'
import { PtaCheckSheet } from './PtaCheck'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { isoDay, withCur } from '@/lib/format'
import RemoveSheet from '@/components/RemoveSheet'
import { ErrorText, KV, Loading, MoneyText, PageHeader, Section, Sheet } from '@/components/ui'
import LabelSheet from '@/components/LabelSheet'
import { ApiError, api, patch, post } from '@/lib/api'
import { ImeiInput } from '@/components/FieldInputs'
import { useAuth } from '@/lib/auth'
import { useDevice, useDeviceEvent, useDeviceHistory, useDocMutation, useInvalidate } from '@/lib/queries'
import PartyPicker from '@/components/PartyPicker'
import type { DeviceDetail, Loan, Party } from '@/lib/types'
import DeviceLineSheet, { emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import { hasPta } from './StockPage'
import { LockChecksEditor, specRows, type LockChecks } from './DeviceSpecs'
import type { DeviceCategory } from '@/lib/types'
import PriceHint from '@/components/PriceHint'
import UnitMoney from './UnitMoney'
import DeviceEasyView from './DeviceEasyView'
import StickerPreview from './StickerPreview'
import { DeviceReserve } from './ReserveCard'
import { StyleSwitch, loadStyle, saveStyle, type Act, type DeviceStyle } from './DeviceLayouts'
import DeviceSheetPreview from './DeviceSheetPreview'
import { isApple } from '@/features/purchase/AppleVariant'
import { FaultSheet } from './Faults'


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
    sim_lock: d.sim_lock ?? '',
    sim_lock_carrier: d.sim_lock_carrier ?? '',
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
  // ADR-090: ?edit=1 (a row's Edit) opens the details form straight away
  const [sheet, setSheet] = useState<null | 'loan' | 'note' | 'price' | 'edit' | 'remove' | 'label' | 'lock' | 'retype' | 'imei' | 'cost'>(() => (new URLSearchParams(window.location.search).get('edit') === '1' ? 'edit' : null))
  // owner 2026-11-09 (ADR-056): an IMEI typed wrong
  const [fix, setFix] = useState({ imei1: '', imei2: '', clear2: false, reason: '' })
  const [fixErr, setFixErr] = useState<unknown>(null)
  // owner 2026-11-12 (ADR-066): what is wrong with it
  const [faultOpen, setFaultOpen] = useState(false)
  // owner 2026-11-10 (ADR-063): a purchase price typed wrong
  const [newCost, setNewCost] = useState<{ cost: string; reason: string; mode: '' | 'paid' | 'khata' }>({ cost: '', reason: '', mode: '' })
  const [costErr, setCostErr] = useState<unknown>(null)
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
  const [ptaOpen, setPtaOpen] = useState(false)
  const [text, setText] = useState('')
  const [partyId, setPartyId] = useState('')
  const [expected, setExpected] = useState('')
  // ADR-106: amanat goes to anyone of the shop's people, not only to another shop
  const [taker, setTaker] = useState<Party | null>(null)
  const canSeeCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  // the purchase this unit came in on (its latest), for "Change dealer / customer" (owner 2026-11-10)
  const boughtOn = [...(history ?? [])].reverse().find((e) => e.type === 'purchased' && e.document_type === 'purchase')?.document_id ?? null
  const multiShop = useAuth((s) => (s.me?.shops.length ?? 0) > 1)
  // the sale it went out on (its latest), for "Change customer" (owner 2026-11-12)
  const soldOn = [...(history ?? [])].reverse().find((e) => e.type === 'sold' && e.document_type === 'invoice')?.document_id ?? null
  // the price on that purchase now: what it was bought for, or the last correction of it
  const buyEv = [...(history ?? [])].reverse().find((e) => e.type === 'purchased' && e.document_type === 'purchase')
  const lastFix = (history ?? []).filter((e) => buyEv && e.seq > buyEv.seq && e.type === 'corrected' && (e.data as { field?: string } | null)?.field === 'cost').pop()
  const boughtFor = lastFix ? Number((lastFix.data as { to?: string }).to ?? 0) : buyEv?.amount != null ? Number(buyEv.amount) : null
  const soldSince = !!buyEv && (history ?? []).some((e) => e.seq > buyEv.seq && e.type === 'sold')
  const [style, setStyle] = useState<DeviceStyle>(loadStyle)
  // ADR-090: the stock list's 🗑 opens this page with ?delete=1 — offer the delete that fits the phone
  const delAsked = useRef(new URLSearchParams(window.location.search).get('delete') === '1')
  const [noDelete, setNoDelete] = useState(false)
  useEffect(() => {
    if (!delAsked.current || !d || !history) return
    delAsked.current = false
    const open = history.find((e) => e.document_type === 'opening_stock')
    const here = d.status === 'in_stock'
    if (canSeeCost && here && open && history.every((e) => e.seq <= open.seq || e.type === 'verified')) setSheet('remove')
    else if (canSeeCost && boughtOn && here && !soldSince) nav(`/purchases/${boughtOn}?delete=1`, { replace: true })
    else if (canSeeCost && soldOn && d.status === 'sold') nav(`/sales/${soldOn}?delete=1`, { replace: true })
    else setNoDelete(true)
  }, [d, history, canSeeCost, boughtOn, soldOn, soldSince, nav])

  if (isLoading || !d) return <Loading />
  const inStock = d.status === 'in_stock'
  // an old-stock entry typed by mistake can be removed while nothing but verification happened to it
  const opening = history?.find((e) => e.document_type === 'opening_stock')
  const canRemoveOpening = canSeeCost && inStock && !!opening && history!.every((e) => e.seq <= opening.seq || e.type === 'verified')
  const priceLow = sheet === 'price' && d.cost_price != null && text !== '' && Number(text) < Number(d.cost_price)

  async function simple(type: string) {
    await ev.mutateAsync({ id: d!.id, type })
  }

  // every action of this page, for the styles that put each one beside its value (owner 2026-11-10)
  const phoneLike = (d.category ?? 'phone') === 'phone' || !!d.cellular
  const canCost = canSeeCost && !!boughtOn && boughtFor != null && !soldSince && ['in_stock', 'faulty', 'in_repair', 'with_customer_for_approval', 'on_loan'].includes(d.status)
  const openCost = () => { setNewCost({ cost: String(boughtFor ?? ''), reason: '', mode: '' }); setCostErr(null); setSheet('cost') }
  const costDiff = newCost.cost !== '' && boughtFor != null ? Number(newCost.cost) - boughtFor : 0
  const acts = ([
    (inStock || d.status === 'faulty') && d.verification_status !== 'flagged' ? { key: 'sell', label: 'stock.sell', run: () => nav(`/sale/new?device=${d.id}`), tone: 'primary' } : null,
    d.verification_status === 'pending' || d.verification_status === 'flagged' || d.condition !== 'box_pack' ? { key: 'verify', label: 'stock.verify', run: () => nav(`/stock/${d.id}/verify`), tone: d.verification_status === 'pending' ? 'gold' : undefined } : null,
    d.verification_status === 'pending' ? { key: 'skipId', label: 'purchase.skipKnown', testid: 'device-skip-id', run: () => void api('POST', `/api/v1/devices/${d.id}/verification/override`, { reason: pick('purchase.skipReason') }).then(() => { void inv('devices', 'device', 'history', 'dashboard') }) } : null,
    d.status === 'sold' ? { key: 'return', label: 'counter.returnJob', run: () => nav(`/return/new?device=${d.id}`), tone: 'primary' } : null,
    inStock ? { key: 'loan', label: 'stock.loanOut', run: () => setSheet('loan') } : null,
    inStock ? { key: 'faulty', label: 'stock.markFaulty', testid: 'mark-faulty', run: () => setFaultOpen(true) } : null,
    d.status === 'faulty' ? { key: 'faultEdit', label: 'faulty.edit', testid: 'edit-faults', run: () => setFaultOpen(true) } : null,
    d.status === 'faulty' ? { key: 'faultyCleared', label: 'stock.faultyCleared', run: () => void simple('faulty_cleared') } : null,
    inStock || d.status === 'faulty' ? { key: 'repair', label: 'stock.sendRepair', testid: 'device-send-repair', run: () => nav(`/repairs/new?device=${d.id}`) } : null,
    d.status === 'in_repair' ? { key: 'repairBack', label: 'stock.repairReturned', run: () => void simple('repair_returned') } : null,
    d.status === 'with_customer_for_approval' ? { key: 'approvalBack', label: 'stock.approvalReturned', run: () => void simple('approval_returned') } : null,
    { key: 'sticker', label: 'label.button', run: () => setSheet('label') },
    { key: 'price', label: 'stock.changePrice', run: () => { setText(d.asking_price ?? ''); setSheet('price') } },
    { key: 'note', label: 'stock.addNote', run: () => { setText(''); setSheet('note') } },
    { key: 'edit', label: 'crud.editDetails', run: () => setSheet('edit') },
    canSeeCost && boughtOn ? { key: 'changeSeller', label: 'purchase.fix.partyButton', testid: 'device-change-seller', run: () => nav(`/purchases/${boughtOn}?change=1`) } : null,
    canSeeCost && boughtOn ? { key: 'changePaid', label: 'purchase.paidFix.button', testid: 'device-change-paid', run: () => nav(`/purchases/${boughtOn}?paid=1`) } : null,
    canSeeCost && boughtOn && (inStock || d.status === 'faulty') ? { key: 'returnSeller', label: 'pret.button', testid: 'device-return-seller', run: () => nav(`/purchases/${boughtOn}?return=${d.id}`) } : null,
    canCost ? { key: 'fixCost', label: 'purchase.costFix.button', testid: 'fix-cost', run: openCost } : null,
    canSeeCost && soldOn && d.status === 'sold' ? { key: 'changeBuyer', label: 'sale.fix.button', testid: 'device-change-buyer', run: () => nav(`/sales/${soldOn}?change=1`) } : null,
    canSeeCost ? { key: 'balances', label: 'bal.short', testid: 'device-balances', run: () => nav(`/balances?q=${encodeURIComponent(d.imei1)}`) } : null,
    canSeeCost && phoneLike ? { key: 'fixImei', label: 'stock.fixImei.button', testid: 'fix-imei', run: () => { setFix({ imei1: d.imei1, imei2: d.imei2 ?? '', clear2: false, reason: '' }); setFixErr(null); setSheet('imei') } } : null,
    d.condition !== 'box_pack' ? { key: 'lock', label: 'devx.lock.button', run: () => { setLocks(d.lock_checks ?? {}); setLockNote(''); setSheet('lock') } } : null,
    canSeeCost && d.category !== 'laptop' ? { key: 'retype', label: 'devx.retype', run: () => { setToCat((d.category ?? 'phone') === 'phone' ? 'tablet' : 'phone'); setPreview(null); setRetypeErr(null); setSheet('retype') } } : null,
    inStock && canSeeCost && multiShop ? { key: 'transfer', label: 'transfer.sendBranch', run: () => nav(`/transfers/new?device=${d.id}`) } : null,
    canRemoveOpening ? { key: 'removeOld', label: 'crud.removeOldStock', run: () => setSheet('remove') } : null,
    // ADR-090: a phone entered by mistake is deleted with its bill (the bill's delete says what happens)
    canSeeCost && boughtOn && inStock && !soldSince ? { key: 'deletePurchase', label: 'del.deletePurchase', testid: 'device-delete-purchase', run: () => nav(`/purchases/${boughtOn}?delete=1`) } : null,
    canSeeCost && soldOn && d.status === 'sold' ? { key: 'deleteSale', label: 'del.deleteSale', testid: 'device-delete-sale', run: () => nav(`/sales/${soldOn}?delete=1`) } : null,
  ] as (Act | null)[]).filter((x): x is Act => !!x)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={{ en: `${d.brand_name} ${d.model_name}`, ur: `${d.brand_name} ${d.model_name}` }} help={<Help term="stock.detail" />} />
      {noDelete ? <BiAlert text="del.phoneNoDelete" kind="error" /> : null}

      <StyleSwitch value={style} onChange={(v) => { setStyle(v); saveStyle(v) }} />
      {style === 'classic' ? (
        <>
      {/* owner 2026-11-16 (ADR-091): everything about the phone in one place, each line with its job;
          the main jobs as big buttons, the rest under "More"; the sticker preview beside */}
      <DeviceEasyView
        d={d}
        acts={acts}
        canSeeCost={canSeeCost}
        onPta={hasPta(d) ? () => setPtaOpen(true) : undefined}
        aside={<StickerPreview deviceId={d.id} onMore={() => setSheet('label')} />}
        extra={
          <>
            <DeviceReserve deviceId={d.id} d={d} inStock={inStock} />
            <LockedPanel d={d} canManage={canSeeCost} onChanged={() => void inv('devices', 'device', 'history', 'stock-status')} />
            <ErrorText error={ev.error ?? loanM.error} />
          </>
        }
      />

      {specRows(d.category ?? 'phone', d.specs, pick).length || d.lock_checks || d.patch_details || d.notes ? (
      <Section title="stock.device" help="stock.deviceInfo">
        <div className="card">
          {specRows(d.category ?? 'phone', d.specs, pick).map(([k, v, h]) => <KV key={k} k={k} help={h} v={<span dir="ltr">{v}</span>} />)}
          {d.lock_checks ? <KV k="devx.lock.title" help="device.lock" v={<span className="flex flex-col items-end">{Object.entries(d.lock_checks).map(([k, v]) => <span key={k} className={v === 'not_cleared' ? 'text-payable' : ''}>{pick(`devx.lock.${k}`)}: {pick(`devx.lock.${v}`)}</span>)}</span>} /> : null}
          {d.patch_details ? <KV k="stock.patchDetails" help="device.patch" v={d.patch_details} /> : null}
          {d.notes ? <KV k="common.notes" help="common.notes" v={d.notes} /> : null}
        </div>
      </Section>
      ) : null}

      {/* ADR-114: what came with it and the money on it are lines of the table above */}
      <UnitMoney deviceId={d.id} noTiles />
        </>
      ) : (
        <>
          {/* ADR-114: the phone's details as they print — 80 mm slip or A4 — with the same jobs below */}
          <DeviceSheetPreview deviceId={d.id} format={style} name={`${d.brand_name}-${d.model_name}-${d.imei1.slice(-4)}`.replace(/\s+/g, '-')} />
          <div className="grid grid-cols-2 gap-2" data-testid="device-sheet-actions">
            {acts.filter((a) => ['sell', 'return', 'edit', 'price', 'sticker', 'loan', 'repair'].includes(a.key)).map((a, i) => (
              <button key={a.key} type="button" onClick={a.run} className={`tap flex min-h-12 items-center justify-center rounded-2xl px-3 text-sm font-extrabold active:translate-y-0.5 ${i === 0 ? 'col-span-2 bg-emerald text-white shadow-cta' : 'border-2 border-ink/15 bg-surface text-ink'}`} data-testid={`sheet-act-${a.key}`}>{pick(a.label)}</button>
            ))}
          </div>
          <ErrorText error={ev.error ?? loanM.error} />
        </>
      )}

      <LabelSheet kind="devices" ids={[d.id]} open={sheet === 'label'} onClose={() => setSheet(null)} />
      <PtaCheckSheet imei={d.imei1} open={ptaOpen} onClose={() => setPtaOpen(false)} deviceId={d.id} onSaved={() => void inv('devices', 'device', 'history')} />
      <Sheet open={sheet === 'loan'} onClose={() => setSheet(null)} title="stock.loanOut">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-1" data-testid="loan-taker"><div className="min-w-0 flex-1"><PartyPicker value={taker} onChange={(p) => { setTaker(p); setPartyId(p?.id ?? '') }} label="loan.toShop" /></div><Help term="loan.toShop" size="sm" /></div>
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
                ...((x.category ?? 'phone') === 'phone' || x.cellular ? { serial: x.serial?.trim() || null } : {}),
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
                sim_lock: (x.category === 'phone' || x.cellular) && x.sim_lock ? x.sim_lock : null,
                sim_lock_carrier: x.sim_lock === 'locked' ? x.sim_lock_carrier?.trim() || null : null,
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
      <FaultSheet open={faultOpen} onClose={() => setFaultOpen(false)} deviceId={d.id} current={d.faults} />
      <Sheet open={sheet === 'cost'} onClose={() => setSheet(null)} title="purchase.costFix.title">
        <div className="flex flex-col gap-3" data-testid="cost-sheet">
          <span className="flex items-center gap-1"><BiLabel text="purchase.costFix.hint" size="sm" tone="text-muted" /><Help term="purchase.costFix" size="sm" /></span>
          <div className="flex items-center justify-between rounded-2xl bg-ground px-4 py-3">
            <BiLabel text="purchase.costFix.now" size="sm" tone="text-muted" />
            <MoneyText value={boughtFor ?? 0} tone="ink" />
          </div>
          <BiInput label="purchase.costFix.new" help={<Help term="purchase.costFix" size="sm" />} type="number" inputMode="decimal" min={0} value={newCost.cost} onChange={(e) => setNewCost({ ...newCost, cost: e.target.value })} className="num" autoFocus data-testid="cost-new" />
          {costDiff !== 0 ? (
            <div className="flex flex-col gap-2" data-testid="cost-mode">
              {/* owner 2026-11-14 (ADR-073): a typing mistake (the money paid was this price) moves cash;
                  a price that really changed goes to the seller's khata */}
              <span className="flex items-center gap-1"><BiLabel text="purchase.costFix.why" size="md" bold /><Help term="purchase.costFixWhy" size="sm" /></span>
              {(['paid', 'khata'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={newCost.mode === m} onClick={() => setNewCost({ ...newCost, mode: m })} className={`tap flex min-h-14 flex-col items-start justify-center rounded-2xl border-2 px-4 py-2 text-start ${newCost.mode === m ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid={`cost-mode-${m}`}>
                  <span className="font-bold">{pick(`purchase.costFix.mode.${m}`)}</span>
                  <span className="text-xs opacity-80">{pick(`purchase.costFix.mode.${m}Hint`)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {costDiff !== 0 && newCost.mode ? (
            <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${(newCost.mode === 'khata' ? costDiff > 0 : costDiff > 0) ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`} data-testid="cost-effect">
              {pick(newCost.mode === 'khata' ? (costDiff > 0 ? 'purchase.costFix.more' : 'purchase.costFix.less') : (costDiff > 0 ? 'purchase.costFix.cashOut' : 'purchase.costFix.cashBack')).replace('{{n}}', withCur(Math.abs(costDiff).toLocaleString('en-US'))).replace('{{who}}', d.source_party_name ?? '')}
            </div>
          ) : null}
          <BiInput label="common.reason" value={newCost.reason} onChange={(e) => setNewCost({ ...newCost, reason: e.target.value })} maxLength={200} help={<Help term="stock.fixImeiReason" size="sm" />} />
          <ErrorText error={costErr} />
          <BiButton
            text="common.save"
            full
            disabled={newCost.reason.trim().length < 2 || newCost.cost === '' || Number(newCost.cost) < 0 || costDiff === 0 || !newCost.mode}
            onClick={async () => {
              try {
                await api('POST', '/api/v1/purchases/cost', { device_id: d.id, cost: Number(newCost.cost), reason: newCost.reason.trim(), mode: newCost.mode })
                await inv('devices', 'device', 'history', 'unit-money', 'purchases', 'parties', 'balances')
                setSheet(null)
              } catch (e) { setCostErr(e) }
            }}
            data-testid="cost-save"
          />
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
        warn="oldStock"
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
