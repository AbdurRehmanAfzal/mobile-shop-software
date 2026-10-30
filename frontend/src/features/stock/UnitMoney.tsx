/** One phone's money story (owner 2026-10-30): where it came from and what is still owed for it,
 *  who bought it and what is still to come in, every payment on it, the margin, and one timeline
 *  from the first day — with "pay / receive for this phone" that allocates to its bill. */

import { ArrowDown, ArrowUp, Printer, Receipt, RotateCcw, Tag, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Loading, Section, Sheet, fmtDate } from '@/components/ui'
import PaymentForm, { type Allocation } from '@/features/payments/PaymentForm'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

export interface PayRow { kind: 'payment_in' | 'payment_out'; at: string; date: string; payment_id: string; no: string; amount: string | null; payment_amount?: string; method: string; reference: string | null; notes: string | null; doc_no?: string; party_name?: string | null; party_id?: string | null; payable_after?: string; receivable_after?: string }
export interface Side { doc_type: 'purchase' | 'invoice'; doc_id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_phone: string | null; line_total: string | null; doc_total: string | null; doc_paid: string | null; shared_bill: boolean; upfront: string | null; payments: PayRow[]; paid: string | null; remaining: string | null; returned_at: string | null }
export interface UnitMoneyData {
  purchase: Side | null; sale: Side | null; purchases: Side[]; sales: Side[]
  returns: { kind: string; date: string; no: string; doc_no: string; amount: string; refund: string; kept: string; party_name: string | null; reason: string | null }[]
  summary: { status: string; source: 'purchase' | 'opening_stock' | null; cost: string | null; paid_out: string | null; payable: string | null; asking_price: string | null; sold_for: string | null; received: string; receivable: string; margin: string | null; refunded: string }
  timeline: Record<string, unknown>[]
}
const n = (v: string | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function UnitMoney({ deviceId }: { deviceId: string }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const { data } = useGet<UnitMoneyData>(['unit-money', deviceId], `/api/v1/devices/${deviceId}/money`)
  const [paying, setPaying] = useState<{ side: Side; direction: 'in' | 'out' } | null>(null)
  if (!data) return <Loading />
  const s = data.summary
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const party = (side: Side): Party => ({ id: side.party_id!, name: side.party_name ?? '', phone: side.party_phone ?? '', balance: '0' } as unknown as Party)
  const alloc = (side: Side): Allocation => ({ document_type: side.doc_type, document_id: side.doc_id, document_no: side.no, remaining: Number(side.remaining ?? 0) })

  const SideCard = ({ side, role }: { side: Side; role: 'bought' | 'sold' }) => {
    const bought = role === 'bought'
    const hidden = bought && !canCost
    const rem = Number(side.remaining ?? 0)
    return (
      <div className={`flex flex-col gap-2 rounded-3xl p-4 ${bought ? 'bg-buy text-buy-fg' : 'bg-sell text-sell-fg'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <BiLabel text={bought ? 'unit.boughtFrom' : 'unit.soldTo'} size="sm" tone="text-current" className="opacity-80" />
            <button type="button" onClick={() => side.party_id && nav(`/parties/${side.party_id}`)} className="truncate text-start text-lg font-extrabold underline-offset-2 hover:underline">{side.party_name ?? pick('sale.cashCustomer')}</button>
            <span className={`opacity-80 ${small}`} dir="ltr">{side.no} · {fmtDate(side.date)}{side.shared_bill ? ` · ${pick('unit.sharedBill').replace('{{t}}', n(side.doc_total))}` : ''}</span>
          </span>
          {side.returned_at ? <Chip text="unit.returned" tone="bad" /> : rem > 0 ? <Chip text={bought ? 'unit.weOwe' : 'unit.theyOwe'} tone="warn" /> : <Chip text="unit.settled" tone="ok" />}
        </div>
        {!hidden ? (
          <div className="grid grid-cols-3 gap-2">
            {([['unit.agreed', side.line_total], [bought ? 'unit.paidOut' : 'unit.receivedIn', side.paid], [bought ? 'unit.stillToPay' : 'unit.stillToGet', side.remaining]] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="flex flex-col rounded-2xl bg-white/10 px-3 py-2">
                <span className={`opacity-80 ${small}`}>{pick(k)}</span>
                <span className="num text-lg" dir="ltr">{n(v)}</span>
              </div>
            ))}
          </div>
        ) : <BiLabel text="unit.costHidden" size="sm" tone="text-current" className="opacity-80" />}
        {!hidden ? (
          <div className="flex flex-col gap-1 rounded-2xl bg-white/10 px-3 py-2">
            <div className="flex items-center justify-between"><span className={small}>{pick(bought ? 'unit.upfrontPaid' : 'unit.upfrontReceived')} · <span dir="ltr">{fmtDate(side.date)}</span></span><span className="num" dir="ltr">{n(side.upfront)}</span></div>
            {side.payments.map((p) => (
              <div key={p.payment_id} className="flex items-center justify-between gap-2">
                <span className={`flex min-w-0 items-center gap-1 ${small}`}><span dir="ltr">{p.no}</span> · <span dir="ltr">{fmtDate(p.date)}</span>{p.method !== 'cash' ? <span>· {pick(`pay.m.${p.method}`)}</span> : null}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="num" dir="ltr">{n(p.amount)}</span><button type="button" aria-label={pick('unit.printReceipt')} onClick={() => openPrintable(`/api/v1/payments/${p.payment_id}/receipt?format=thermal`)} className="tap rounded-full bg-white/15 p-1.5"><Printer size={14} /></button></span>
              </div>
            ))}
          </div>
        ) : null}
        {!side.returned_at && rem > 0 && side.party_id ? (
          <button type="button" onClick={() => setPaying({ side, direction: bought ? 'out' : 'in' })} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white font-bold text-ink ${ur ? cls('md') : ''}`}>
            {bought ? <ArrowUp size={18} className="text-payable" /> : <ArrowDown size={18} className="text-emerald-deep" />}
            {pick(bought ? 'unit.payForThis' : 'unit.receiveForThis')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <Section title="unit.title">
        <div className="card grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="unit-tiles">
          {([
            canCost ? ['unit.cost', s.cost, 'text-ink'] : null,
            canCost ? ['unit.stillToPay', s.payable, Number(s.payable) > 0 ? 'text-payable' : 'text-ink'] : null,
            ['unit.soldFor', s.sold_for, 'text-ink'],
            ['unit.stillToGet', s.sold_for != null ? s.receivable : null, Number(s.receivable) > 0 ? 'text-receivable' : 'text-ink'],
            canCost && s.margin != null ? ['unit.margin', s.margin, Number(s.margin) >= 0 ? 'text-emerald-deep' : 'text-payable'] : null,
          ].filter(Boolean) as [string, string | null, string][]).map(([k, v, tone]) => (
            <div key={k} className="flex flex-col rounded-2xl bg-ground px-3 py-2">
              <span className={`text-muted ${small}`}>{pick(k)}</span>
              <span className={`num text-xl ${tone}`} dir="ltr">{v == null ? '—' : n(v)}</span>
            </div>
          ))}
        </div>
        {data.purchase ? <SideCard side={data.purchase} role="bought" /> : s.source === 'opening_stock' ? <BiLabel text="unit.openingStock" size="sm" tone="text-muted" /> : null}
        {data.sale ? <SideCard side={data.sale} role="sold" /> : null}
      </Section>

      <Section title="stock.history">
        <div className="card p-0">
          {[...data.timeline].reverse().map((t, i) => <TimelineRow key={i} t={t} first={i === 0} canCost={canCost} />)}
        </div>
      </Section>

      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying?.direction === 'out' ? 'unit.payForThis' : 'unit.receiveForThis'}>
        {paying ? <PaymentForm party={party(paying.side)} direction={paying.direction} allocation={alloc(paying.side)} onDone={() => { setPaying(null); inv('unit-money', 'parties', 'party-units', 'statement', 'dashboard') }} /> : null}
      </Sheet>
    </>
  )
}

function TimelineRow({ t, first, canCost }: { t: Record<string, unknown>; first: boolean; canCost: boolean }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const kind = t.kind as string
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const icon = kind === 'purchase' ? <Tag size={16} /> : kind === 'sale' ? <Receipt size={16} /> : kind === 'payment_out' ? <ArrowUp size={16} /> : kind === 'payment_in' ? <ArrowDown size={16} /> : kind.startsWith('return') ? <RotateCcw size={16} /> : <Wallet size={16} />
  const tone = kind === 'purchase' ? 'bg-buy text-buy-fg' : kind === 'sale' ? 'bg-sell text-sell-fg' : kind === 'payment_out' ? 'bg-payable-tint text-payable' : kind === 'payment_in' ? 'bg-emerald-tint text-emerald-deep' : kind.startsWith('return') ? 'bg-receivable-tint text-receivable' : 'bg-ground text-muted'
  const title = kind === 'event' ? pick(`stock.events.${t.event as string}`) : pick(`unit.k.${kind}`)
  const amount = t.amount as string | null | undefined
  const after = kind === 'payment_out' || kind === 'purchase' ? (t.payable_after as string | undefined) : kind === 'payment_in' || kind === 'sale' ? (t.receivable_after as string | undefined) : undefined
  return (
    <div className={`flex gap-3 px-4 py-3 ${first ? '' : 'border-t border-line'}`}>
      <span className={`well mt-0.5 h-9 w-9 shrink-0 rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-ink">{title}{t.no ? <span className="font-medium text-muted" dir="ltr"> · {String(t.no)}</span> : null}</span>
          <span className="shrink-0 text-xs text-muted" dir="ltr">{fmtDate(String(t.date ?? t.at))}</span>
        </div>
        {t.party_name ? <button type="button" onClick={() => t.party_id && nav(`/parties/${String(t.party_id)}`)} className={`text-start text-muted ${small}`}>{String(t.party_name)}</button> : null}
        {amount != null && (kind !== 'event' || t.event !== 'purchased' || canCost) ? (
          <div className={`flex flex-wrap items-center gap-x-3 ${small}`} dir="auto">
            <span className="num text-ink" dir="ltr">Rs. {Number(amount).toLocaleString('en-US')}</span>
            {kind === 'purchase' || kind === 'sale' ? <span className="text-muted">{pick(kind === 'purchase' ? 'unit.upfrontPaid' : 'unit.upfrontReceived')} <span className="num" dir="ltr">{Number(t.upfront ?? 0).toLocaleString('en-US')}</span></span> : null}
            {after != null ? <span className="text-muted">{pick(kind === 'payment_out' || kind === 'purchase' ? 'unit.leftToPay' : 'unit.leftToGet')} <span className="num" dir="ltr">{Number(after).toLocaleString('en-US')}</span></span> : null}
            {kind === 'payment_in' || kind === 'payment_out' ? <button type="button" onClick={() => openPrintable(`/api/v1/payments/${String(t.payment_id)}/receipt?format=thermal`)} className="tap inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-ink"><Printer size={12} />{pick('unit.printReceipt')}</button> : null}
          </div>
        ) : null}
        {kind.startsWith('return') ? <div className={`text-muted ${small}`}>{pick('unit.refund')} <span className="num" dir="ltr">{Number(t.refund ?? 0).toLocaleString('en-US')}</span>{t.reason ? ` · ${String(t.reason)}` : ''}</div> : null}
        {t.data && typeof (t.data as Record<string, unknown>).note === 'string' ? <div className="text-sm text-muted">{String((t.data as Record<string, unknown>).note)}</div> : null}
        {t.data && typeof (t.data as Record<string, unknown>).reason === 'string' ? <div className="text-sm text-muted">{String((t.data as Record<string, unknown>).reason)}</div> : null}
        {t.user_name ? <div className={`text-muted ${small}`}>{String(t.user_name)}</div> : null}
      </div>
    </div>
  )
}
