import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import RemoveSheet from '@/components/RemoveSheet'
import { Chip, ErrorText, KV, Loading, MoneyText, PageHeader, Section, Sheet, fmtDate } from '@/components/ui'
import { patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDevice, useDeviceEvent, useDeviceHistory, useDocMutation, useInvalidate, useParties } from '@/lib/queries'
import type { DeviceDetail, DeviceEvent, Loan } from '@/lib/types'
import DeviceLineSheet, { emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'

const EVENT_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = {
  purchased: 'ok', verified: 'ok', sold: 'ink', sale_returned: 'warn', loaned_out: 'warn', loan_returned: 'ok',
  marked_faulty: 'bad', faulty_cleared: 'ok', sent_to_repair: 'warn', repair_returned: 'ok', returned_to_supplier: 'bad',
}

function toDraft(d: DeviceDetail): DeviceLineDraft {
  return {
    ...emptyDraft(d.imei1),
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

function Timeline({ events }: { events: DeviceEvent[] }) {
  const { pick } = useLang()
  const canSeeCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  return (
    <div className="card p-0">
      {[...events].reverse().map((e, i) => (
        <div key={e.id} className={`flex gap-3 px-4 py-3 ${i ? 'border-t border-line' : ''}`}>
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-3 w-3 rounded-full ${EVENT_TONE[e.type] === 'bad' ? 'bg-payable' : EVENT_TONE[e.type] === 'warn' ? 'bg-receivable' : EVENT_TONE[e.type] === 'ink' ? 'bg-ink' : 'bg-emerald'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-ink">{pick(`stock.events.${e.type}`)}</span>
              <span className="text-xs text-muted" dir="ltr">
                {fmtDate(e.at)}
              </span>
            </div>
            {e.party_name ? <div className="text-sm text-muted">{e.party_name}</div> : null}
            {e.amount && (e.type !== 'purchased' || canSeeCost) ? <MoneyText value={e.amount} tone="ink" size="sm" /> : null}
            {e.data && typeof e.data.note === 'string' ? <div className="text-sm text-muted">{e.data.note}</div> : null}
            {e.data && typeof e.data.reason === 'string' ? <div className="text-sm text-muted">{e.data.reason}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DeviceDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pick } = useLang()
  const { data: d, isLoading } = useDevice(id)
  const { data: history } = useDeviceHistory(id)
  const ev = useDeviceEvent()
  const loanM = useDocMutation<{ device_id: string; party_id: string; expected_back_at?: string; notes?: string }, Loan>('POST', () => '/api/v1/loans')
  const [sheet, setSheet] = useState<null | 'loan' | 'note' | 'price' | 'edit' | 'remove'>(null)
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
              {[d.storage_name, d.colour_name].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Chip text={`stock.status.${d.status}`} tone="ink" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip text={`stock.condition.${d.condition}`} />
          <Chip text={`stock.pta.${d.pta_status}`} tone={d.pta_status === 'pta_approved' ? 'ok' : 'warn'} />
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

      <Section title="stock.history">{history ? <Timeline events={history} /> : <Loading />}</Section>

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
          <BiInput label="loan.expectedBack" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
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

      <Sheet open={sheet === 'note' || sheet === 'price'} onClose={() => setSheet(null)} title={sheet === 'price' ? 'stock.changePrice' : 'stock.addNote'}>
        <div className="flex flex-col gap-3">
          <BiInput label={sheet === 'price' ? 'stock.asking' : 'common.notes'} type={sheet === 'price' ? 'number' : 'text'} inputMode={sheet === 'price' ? 'decimal' : 'text'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <BiButton
            text="common.save"
            full
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
