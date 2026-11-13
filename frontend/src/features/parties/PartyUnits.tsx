/** A person's phones (owner 2026-10-30): every phone bought from or sold to them, what was agreed,
 *  what was paid and what is still owed — payables and receivables kept apart, never netted
 *  silently. Each row opens the phone (its own money ledger and history); a pending row can take a
 *  payment for that phone.
 *  Owner 2026-11-13: grouped by brand and model with counts, what is left to give / to get per
 *  model, per brand and in all, each level opening the next, with pay / receive for a whole model or
 *  brand. The plain list stays one tap away. */

import { ArrowDown, ArrowUp, ChevronDown, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, Empty, Loading, Section, Sheet, fmtDate } from '@/components/ui'
import PaymentForm, { type Allocation } from '@/features/payments/PaymentForm'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

export interface UnitRow { role: 'bought_from' | 'sold_to'; date: string; device_id: string; label: string; brand_id?: string; brand_name?: string; model_id?: string; model_name?: string; imei1: string; storage_name: string | null; colour_name: string | null; status: string; doc_type: 'purchase' | 'invoice'; doc_id: string; no: string; agreed: string | null; upfront: string | null; paid: string | null; remaining: string | null; payments: number; settled: boolean; returned_at: string | null; shared_bill: boolean }
export interface PartyUnitsData { party_id: string; name: string; balance: string; receivable: string; payable: string | null; other: string | null; bought_count: number; sold_count: number; pending_count: number; rows: UnitRow[] }
const n = (v: string | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export function usePartyUnits(partyId: string | undefined) {
  return useGet<PartyUnitsData>(['party-units', partyId ?? ''], partyId ? `/api/v1/parties/${partyId}/units` : null)
}

/** what a set of phones adds up to: count, agreed, still to give (bought) and still to get (sold) */
interface Sum { count: number; bought: number; sold: number; agreedBought: number; agreedSold: number; give: number; get: number }
function sum(rows: UnitRow[]): Sum {
  const s: Sum = { count: rows.length, bought: 0, sold: 0, agreedBought: 0, agreedSold: 0, give: 0, get: 0 }
  for (const r of rows) {
    const rem = r.returned_at ? 0 : Math.max(0, Number(r.remaining ?? 0))
    if (r.role === 'bought_from') { s.bought += 1; s.agreedBought += Number(r.agreed ?? 0); s.give += rem } else { s.sold += 1; s.agreedSold += Number(r.agreed ?? 0); s.get += rem }
  }
  return s
}
const open = (rows: UnitRow[], role: UnitRow['role']) => rows.filter((r) => r.role === role && !r.returned_at && Number(r.remaining ?? 0) > 0).sort((a, b) => a.date.localeCompare(b.date))
const alloc = (r: UnitRow): Allocation => ({ document_type: r.doc_type, document_id: r.doc_id, document_no: r.no, remaining: Number(r.remaining ?? 0) })

type Paying = { rows: UnitRow[]; dir: 'in' | 'out'; title: string }

export default function PartyUnits({ party }: { party: Party }) {
  const { pick } = useLang()
  const inv = useInvalidate()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const { data } = usePartyUnits(party.id)
  const [paying, setPaying] = useState<Paying | null>(null)
  const [view, setView] = useState<'brand' | 'list'>(() => { try { return (localStorage.getItem('party.unitsView') as 'brand' | 'list') || 'brand' } catch { return 'brand' } })
  const pickView = (v: 'brand' | 'list') => { setView(v); try { localStorage.setItem('party.unitsView', v) } catch { /* private window */ } }
  if (!data) return <Loading />
  const pay = (rows: UnitRow[], dir: 'in' | 'out', title: string) => setPaying({ rows, dir, title })
  const all = sum(data.rows)
  return (
    <Section title={{ en: `${pick('unit.phones')} (${data.rows.length})`, ur: `${pick('unit.phones')} (${data.rows.length})`, roman: `${pick('unit.phones')} (${data.rows.length})` }} help="party.units">
      {!data.rows.length ? <Empty text="unit.noPhones" /> : (
        <div className="flex flex-col gap-3">
          <Totals s={all} canCost={canCost} />
          <div className="flex items-center gap-1">
            <div className="flex-1"><BiSegmented<'brand' | 'list'> value={view} onChange={pickView} options={[{ value: 'brand', text: 'unit.byBrand' }, { value: 'list', text: 'unit.asList' }]} /></div>
            <Help term="party.unitsByBrand" size="sm" />
          </div>
          {view === 'list' ? (
            <div className="card divide-y divide-line p-0">
              {data.rows.map((r) => <UnitCard key={`${r.doc_id}-${r.device_id}`} r={r} canCost={canCost} onPay={(x) => pay([x], x.role === 'bought_from' ? 'out' : 'in', x.no)} />)}
            </div>
          ) : (
            <Brands rows={data.rows} canCost={canCost} onPay={pay} />
          )}
        </div>
      )}
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying?.dir === 'out' ? 'unit.payForThis' : 'unit.receiveForThis'}>
        {paying ? (
          <PaymentForm
            party={party}
            direction={paying.dir}
            {...(paying.rows.length === 1 ? { allocation: alloc(paying.rows[0]) } : { allocations: paying.rows.map(alloc) })}
            onDone={() => { setPaying(null); inv('party-units', 'parties', 'statement', 'unit-money', 'dashboard', 'balances') }}
          />
        ) : null}
      </Sheet>
    </Section>
  )
}

/** the person's grand totals */
function Totals({ s, canCost }: { s: Sum; canCost: boolean }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-[11px] font-semibold'
  const cell = (k: string, v: string, tone = '') => (
    <span className="flex flex-col rounded-xl bg-ground px-2 py-1.5">
      <span className={`text-muted ${small}`}>{pick(k)}</span>
      <span className={`num text-base leading-tight ${tone}`} dir="ltr">{v}</span>
    </span>
  )
  return (
    <div className="card grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="units-total">
      {cell('unit.totBought', `${s.bought}${canCost && s.bought ? ` · ${n(s.agreedBought)}` : ''}`)}
      {cell('unit.totSold', `${s.sold}${s.sold ? ` · ${n(s.agreedSold)}` : ''}`)}
      {cell('unit.stillToPay', canCost ? withCur(n(s.give)) : '—', s.give > 0 ? 'text-payable' : '')}
      {cell('unit.stillToGet', withCur(n(s.get)), s.get > 0 ? 'text-receivable' : '')}
    </div>
  )
}

/** brand → model → phones; each level shows its own sum and opens the next */
function Brands({ rows, canCost, onPay }: { rows: UnitRow[]; canCost: boolean; onPay: (rows: UnitRow[], dir: 'in' | 'out', title: string) => void }) {
  const [openBrand, setOpenBrand] = useState<string | null>(null)
  const [openModel, setOpenModel] = useState<string | null>(null)
  const brands = new Map<string, { name: string; models: Map<string, { name: string; rows: UnitRow[] }> }>()
  for (const r of rows) {
    const bk = r.brand_id ?? r.label.split(' ')[0]
    const mk = r.model_id ?? r.label
    if (!brands.has(bk)) brands.set(bk, { name: r.brand_name ?? r.label.split(' ')[0], models: new Map() })
    const b = brands.get(bk)!
    if (!b.models.has(mk)) b.models.set(mk, { name: r.model_name ?? r.label, rows: [] })
    b.models.get(mk)!.rows.push(r)
  }
  const list = [...brands.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  const one = list.length === 1
  return (
    <div className="flex flex-col gap-2" data-testid="units-brands">
      {list.map(([bk, b]) => {
        const brandRows = [...b.models.values()].flatMap((m) => m.rows)
        const s = sum(brandRows)
        const isOpen = one || openBrand === bk
        return (
          <div key={bk} className="card overflow-hidden p-0" data-testid={`units-brand-${b.name}`}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpenBrand(isOpen && !one ? null : bk)} className={`tap flex w-full items-center gap-3 px-4 py-3 text-start ${isOpen ? 'bg-ground' : ''}`}>
              <span className="well h-11 w-11 shrink-0 bg-stockt text-sm font-extrabold text-stockt-fg">{b.name.slice(0, 2).toUpperCase()}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-extrabold">{b.name}</span>
                <Line s={s} canCost={canCost} />
              </span>
              <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen ? (
              <div className="flex flex-col gap-2 px-3 pb-3">
                <PayRow rows={brandRows} canCost={canCost} onPay={onPay} title={b.name} />
                {[...b.models.entries()].sort((x, y) => x[1].name.localeCompare(y[1].name)).map(([mk, m]) => {
                  const ms = sum(m.rows)
                  // a single brand with a single model opens all the way
                  const mOpen = openModel === mk || (one && b.models.size === 1)
                  return (
                    <div key={mk} className="rounded-2xl border border-line bg-surface" data-testid={`units-model-${m.name}`}>
                      <button type="button" aria-expanded={mOpen} onClick={() => setOpenModel(mOpen ? null : mk)} className="tap flex w-full items-center gap-3 px-3 py-2.5 text-start">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-bold">{m.name} <span className="num text-muted" dir="ltr">× {ms.count}</span></span>
                          <Line s={ms} canCost={canCost} />
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${mOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {mOpen ? (
                        <div className="flex flex-col gap-2 border-t border-line px-1 pb-2">
                          <div className="px-2 pt-2"><PayRow rows={m.rows} canCost={canCost} onPay={onPay} title={m.name} /></div>
                          <div className="divide-y divide-line">
                            {m.rows.map((r) => <UnitCard key={`${r.doc_id}-${r.device_id}`} r={r} canCost={canCost} onPay={(x) => onPay([x], x.role === 'bought_from' ? 'out' : 'in', x.no)} />)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** "3 bought · 2 sold · to give 40,000 · to get 12,000" */
function Line({ s, canCost }: { s: Sum; canCost: boolean }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const bits: { t: string; tone?: string }[] = []
  if (s.bought) bits.push({ t: `${s.bought} ${pick('unit.boughtWord')}` })
  if (s.sold) bits.push({ t: `${s.sold} ${pick('unit.soldWord')}` })
  if (canCost && s.give > 0) bits.push({ t: `${pick('unit.toGiveShort')} ${n(s.give)}`, tone: 'text-payable' })
  if (s.get > 0) bits.push({ t: `${pick('unit.toGetShort')} ${n(s.get)}`, tone: 'text-receivable' })
  if (!(canCost && s.give > 0) && !(s.get > 0)) bits.push({ t: pick('unit.settled'), tone: 'text-emerald-deep' })
  return (
    <span className={`flex flex-wrap gap-x-2 text-muted ${small}`}>
      {bits.map((b, i) => <span key={i} className={b.tone ?? ''}>{b.t}</span>)}
    </span>
  )
}

/** pay / receive for every open phone in a group, oldest bill first */
function PayRow({ rows, canCost, onPay, title }: { rows: UnitRow[]; canCost: boolean; onPay: (rows: UnitRow[], dir: 'in' | 'out', title: string) => void; title: string }) {
  const { pick, ur } = useLang()
  const give = canCost ? open(rows, 'bought_from') : []
  const get = open(rows, 'sold_to')
  if (!give.length && !get.length) return null
  const tot = (rs: UnitRow[]) => n(rs.reduce((t, r) => t + Number(r.remaining ?? 0), 0))
  return (
    <div className="flex flex-wrap gap-2">
      {give.length ? (
        <button type="button" onClick={() => onPay(give, 'out', title)} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-payable" data-testid="units-pay-group">
          <ArrowUp size={16} /><span className={ur ? 'ur' : 'text-sm'}>{pick('party.pay')} {tot(give)}</span>
        </button>
      ) : null}
      {get.length ? (
        <button type="button" onClick={() => onPay(get, 'in', title)} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald px-3 font-bold text-white" data-testid="units-receive-group">
          <ArrowDown size={16} /><span className={ur ? 'ur' : 'text-sm'}>{pick('party.receive')} {tot(get)}</span>
        </button>
      ) : null}
    </div>
  )
}

/** one phone: opens its page (its money ledger and history); pay / receive for this phone */
function UnitCard({ r, canCost, onPay }: { r: UnitRow; canCost: boolean; onPay: (r: UnitRow) => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const bought = r.role === 'bought_from'
  const hidden = bought && !canCost
  const rem = Number(r.remaining ?? 0)
  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid="unit-row">
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
            <button type="button" onClick={() => onPay(r)} aria-label={pick(bought ? 'unit.payForThis' : 'unit.receiveForThis')} className={`tap flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${bought ? 'border border-line bg-surface text-payable' : 'bg-emerald text-white'}`}>
              {bought ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
              <span className={ur ? 'ur text-[11px]' : 'text-[10px] font-bold'}>{pick(bought ? 'party.pay' : 'party.receive')}</span>
            </button>
          ) : null}
        </div>
      ) : <BiLabel text="unit.costHidden" size="sm" tone="text-muted" />}
    </div>
  )
}
