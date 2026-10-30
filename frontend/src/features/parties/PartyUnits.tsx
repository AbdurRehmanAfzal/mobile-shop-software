/** A person's phones (owner 2026-10-30): every phone bought from or sold to them, what was agreed,
 *  what was paid and what is still owed — payables and receivables kept apart, never netted
 *  silently. Each row opens the phone; a pending row can take a payment for that phone. */

import { ArrowDown, ArrowUp, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, Loading, Section, Sheet, fmtDate } from '@/components/ui'
import PaymentForm, { type Allocation } from '@/features/payments/PaymentForm'
import { useAuth } from '@/lib/auth'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

export interface UnitRow { role: 'bought_from' | 'sold_to'; date: string; device_id: string; label: string; imei1: string; storage_name: string | null; colour_name: string | null; status: string; doc_type: 'purchase' | 'invoice'; doc_id: string; no: string; agreed: string | null; upfront: string | null; paid: string | null; remaining: string | null; payments: number; settled: boolean; returned_at: string | null; shared_bill: boolean }
export interface PartyUnitsData { party_id: string; name: string; balance: string; receivable: string; payable: string | null; other: string | null; bought_count: number; sold_count: number; pending_count: number; rows: UnitRow[] }
const n = (v: string | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export function usePartyUnits(partyId: string | undefined) {
  return useGet<PartyUnitsData>(['party-units', partyId ?? ''], partyId ? `/api/v1/parties/${partyId}/units` : null)
}

export default function PartyUnits({ party }: { party: Party }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const { data } = usePartyUnits(party.id)
  const [paying, setPaying] = useState<UnitRow | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!data) return <Loading />
  const alloc = (r: UnitRow): Allocation => ({ document_type: r.doc_type, document_id: r.doc_id, document_no: r.no, remaining: Number(r.remaining ?? 0) })
  return (
    <Section title={{ en: `${pick('unit.phones')} (${data.rows.length})`, ur: `${pick('unit.phones')} (${data.rows.length})`, roman: `${pick('unit.phones')} (${data.rows.length})` }}>
      {!data.rows.length ? <Empty text="unit.noPhones" /> : (
        <div className="card divide-y divide-line p-0">
          {data.rows.map((r) => {
            const bought = r.role === 'bought_from'
            const hidden = bought && !canCost
            const rem = Number(r.remaining ?? 0)
            return (
              <div key={`${r.doc_id}-${r.device_id}`} className="flex flex-col gap-2 px-4 py-3">
                <button type="button" onClick={() => nav(`/stock/${r.device_id}`)} className="tap flex items-center gap-3 text-start">
                  <span className={`well h-10 w-10 shrink-0 rounded-xl ${bought ? 'bg-buy text-buy-fg' : 'bg-sell text-sell-fg'}`}><Smartphone size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{r.label}{r.storage_name ? <span className="font-medium text-muted"> · {r.storage_name}</span> : null}</span>
                    <span className={`text-muted ${small}`} dir="ltr">{r.imei1} · {r.no} · {fmtDate(r.date)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Chip text={bought ? 'unit.boughtFromShort' : 'unit.soldToShort'} tone={bought ? 'ink' : 'ok'} />
                    {r.returned_at ? <Chip text="unit.returned" tone="bad" /> : rem > 0 ? <Chip text={bought ? 'unit.weOwe' : 'unit.theyOwe'} tone="warn" /> : <Chip text="unit.settled" tone="ok" />}
                  </span>
                </button>
                {!hidden ? (
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-3 gap-1.5">
                      {([['unit.agreed', r.agreed], [bought ? 'unit.paidOut' : 'unit.receivedIn', r.paid], [bought ? 'unit.stillToPay' : 'unit.stillToGet', r.remaining]] as [string, string | null][]).map(([k, v], i) => (
                        <span key={k} className="flex flex-col rounded-xl bg-ground px-2 py-1.5">
                          <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
                          <span className={`num text-base leading-tight ${i === 2 && rem > 0 ? (bought ? 'text-payable' : 'text-receivable') : ''}`} dir="ltr">{n(v)}</span>
                        </span>
                      ))}
                    </div>
                    {!r.returned_at && rem > 0 ? (
                      <button type="button" onClick={() => setPaying(r)} aria-label={pick(bought ? 'unit.payForThis' : 'unit.receiveForThis')} className={`tap flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${bought ? 'border border-line bg-surface text-payable' : 'bg-emerald text-white'}`}>
                        {bought ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                        <span className={ur ? 'ur text-[11px]' : 'text-[10px] font-bold'}>{pick(bought ? 'party.pay' : 'party.receive')}</span>
                      </button>
                    ) : null}
                  </div>
                ) : <BiLabel text="unit.costHidden" size="sm" tone="text-muted" />}
              </div>
            )
          })}
        </div>
      )}
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying?.role === 'bought_from' ? 'unit.payForThis' : 'unit.receiveForThis'}>
        {paying ? <PaymentForm party={party} direction={paying.role === 'bought_from' ? 'out' : 'in'} allocation={alloc(paying)} onDone={() => { setPaying(null); inv('party-units', 'parties', 'statement', 'unit-money', 'dashboard') }} /> : null}
      </Sheet>
    </Section>
  )
}
