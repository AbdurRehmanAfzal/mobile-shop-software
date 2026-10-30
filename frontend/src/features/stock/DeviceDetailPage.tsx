import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { isoDay } from '@/lib/format'
import RemoveSheet from '@/components/RemoveSheet'
import { Chip, ErrorText, KV, Loading, MoneyText, PageHeader, Section, Sheet } from '@/components/ui'
import LabelSheet from '@/components/LabelSheet'
import { patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDevice, useDeviceEvent, useDeviceHistory, useDocMutation, useInvalidate, useParties } from '@/lib/queries'
import type { DeviceDetail, Loan } from '@/lib/types'
import DeviceLineSheet, { emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import { hasPta, specLine } from './StockPage'
import PriceHint from '@/components/PriceHint'
import UnitMoney from './UnitMoney'


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
  const [sheet, setSheet] = useState<null | 'loan' | 'note' | 'price' | 'edit' | 'remove' | 'label'>(null)
  const inv = useInvalidate()
  const [text, setText] = useState('')
  const [partyId, setPartyId] = useState('')
  const [expected, setExpected] = useState('')
  const { data: shops } = useParties({ kind: 'shop' })
  const canSeeCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')

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
      <PageHeader title={{ en: `${d.brand_name} ${d.model_name}`, ur: `${d.brand_name} ${d.model_name}` }} />

      <section className="hero flex flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="num text-lg" dir="ltr">
              {d.imei1}
            </div>
            <div className="text-sm text-hero-text/75">
              {specLine(d, pick)}
            </div>
          </div>
          <Chip text={`stock.status.${d.status}`} tone="ink" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip text={`stock.condition.${d.condition}`} />
          {hasPta(d) ? <Chip text={`stock.pta.${d.pta_status}`} tone={d.pta_status === 'pta_approved' ? 'ok' : 'warn'} /> : null}
          {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
          {d.cycle_no > 1 ? <Chip text={{ en: `Cycle ${d.cycle_no}`, ur: `${d.cycle_no} بار` }} /> : null}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <BiLabel text="stock.asking" size="sm" tone="text-hero-text/75" />
            <MoneyText value={d.asking_price} tone="ink" />
          </div>
          {canSeeCost ? (
            <div className="rounded-xl bg-white/10 px-3 py-2">
              <BiLabel text="stock.cost" size="sm" tone="text-hero-text/75" />
              <MoneyText value={d.cost_price} tone="ink" />
            </div>
          ) : null}
        </div>
        {d.current_party_name ? (
          <div className="text-sm text-hero-text/80">
            {pick('stock.withParty')}: <b>{d.current_party_name}</b>
          </div>
        ) : null}
      </section>

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

      <Section title="stock.actions">
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
          {canRemoveOpening ? <BiButton text="crud.removeOldStock" variant="secondary" size="md" onClick={() => setSheet('remove')} /> : null}
        </div>
        <ErrorText error={ev.error ?? loanM.error} />
      </Section>

      <Section title="stock.device">
        <div className="card">
          {d.imei2 ? <KV k="stock.imei2" v={<span dir="ltr">{d.imei2}</span>} /> : null}
          {d.serial ? <KV k="stock.serial" v={<span dir="ltr">{d.serial}</span>} /> : null}
          {d.sim_time_months ? <KV k="stock.simTime" v={d.sim_time_months} /> : null}
          {d.warranty_months ? <KV k="stock.warranty" v={`${d.warranty_months} ${pick('stock.months')}`} /> : null}
          {d.patch_details ? <KV k="stock.patchDetails" v={d.patch_details} /> : null}
          {d.notes ? <KV k="common.notes" v={d.notes} /> : null}
        </div>
      </Section>

      {d.accessories.length ? (
        <Section title="stock.accessories">
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
          <BiLabel text="loan.toShop" size="md" tone="text-muted" />
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 font-semibold">
            <option value="">—</option>
            {shops?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <BiInput label="loan.expectedBack" type="date" min={isoDay(0)} value={expected} onChange={(e) => setExpected(e.target.value)} />
          <BiInput label="common.notes" value={text} onChange={(e) => setText(e.target.value)} />
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
                ...(x.category !== 'phone' ? { battery_health: x.battery_health ? Number(x.battery_health) : null } : {}),
              })
              await inv('devices', 'device', 'history')
              setSheet(null)
            }}
          />
        ) : null}
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
          <BiInput label={sheet === 'price' ? 'stock.asking' : 'common.notes'} type={sheet === 'price' ? 'number' : 'text'} inputMode={sheet === 'price' ? 'decimal' : 'text'} value={text} onChange={(e) => setText(e.target.value)} autoFocus error={priceLow ? 'field.askingBelowCost' : null} />
          {sheet === 'price' ? <PriceHint modelId={d.model_id} storageId={d.storage_id} condition={d.condition} excludeDeviceId={d.id} onUse={(p) => setText(String(p))} /> : null}
          <BiButton
            text="common.save"
            full
            disabled={priceLow}
            loading={ev.isPending}
            onClick={async () => {
              if (sheet === 'price') await patch(`/api/v1/devices/${d.id}`, { asking_price: Number(text) })
              else await ev.mutateAsync({ id: d.id, type: 'note', note: text })
              setSheet(null)
            }}
          />
        </div>
      </Sheet>
    </div>
  )
}
