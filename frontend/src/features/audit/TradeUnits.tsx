/** Shop Audit → Sales & purchases → "by brand & model" (owner 2026-11-26, from the new product's
 *  file 22, ADR-143): every phone sold or bought in the period, grouped by model, with its trail —
 *  a sold phone: its bill, who it was bought from and at what cost, who bought it, the price, what
 *  the bill has been paid and the profit; a bought phone: its bill, the supplier, the cost, whether
 *  the bill is paid, where the phone is now (and to whom it went) and the profit if sold since.
 *  Each model shows the server's own totals and picks (the highest-profit and the cheapest phone).
 *  Read-only: `GET /shop-audit/sales/units`, `/purchases/units`; the app adds up nothing. Cost and
 *  profit only for owner / manager (the purchases side is theirs alone). */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, fmtDate, Pending } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'

type M = string
type St = 'paid' | 'partial' | 'unpaid' | 'returned'
interface Unit { device_id: string; imei1: string; storage: string | null; colour: string | null; condition: string; pta_status: string; status_now: string; date: string; supplier: string | null; supplier_id: string | null; purchase_id: string | null; purchase_no: string | null; cost: M | null; profit: M | null; pay_status: St; bill_paid: M; invoice_id: string | null; invoice_no: string | null; buyer: string | null; buyer_id: string | null }
interface SoldUnit extends Unit { invoice_id: string; invoice_no: string; price: M; bill_due: M }
interface BoughtUnit extends Unit { purchase_id: string; purchase_no: string; cost: M; bill_owed: M; sold: boolean; sold_for: M | null }
interface SoldModel { key: string; brand: string; label: string; units: number; revenue: M; cost: M | null; profit: M | null; highest_profit: SoldUnit | null; lowest_cost: SoldUnit | null; rows: SoldUnit[] }
interface BoughtModel { key: string; brand: string; label: string; units: number; invested: M; sold: number; in_stock: number; profit: M; lowest_cost: BoughtUnit; highest_cost: BoughtUnit; rows: BoughtUnit[] }
interface Units<T> { models: T[]; units: number; truncated: boolean; notes: string[] }

const PREVIEW = 5
const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const signed = (v: M | null | undefined) => (v == null ? '—' : `${Number(v) < 0 ? '−' : '+'}${withCur(Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))}`)
const TONE: Record<St, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { paid: 'ok', partial: 'warn', unpaid: 'bad', returned: 'muted' }

export default function TradeUnits({ tab, query }: { tab: 'sales' | 'purchases'; query: string }) {
  const { pick, ur, cls } = useLang()
  const su = useGet<Units<SoldModel>>(['audit-sales-units', query], tab === 'sales' ? `/api/v1/shop-audit/sales/units?${query}` : null)
  const bu = useGet<Units<BoughtModel>>(['audit-purchases-units', query], tab === 'purchases' ? `/api/v1/shop-audit/purchases/units?${query}` : null)
  const [q, setQ] = useState('')
  const live = tab === 'sales' ? su : bu
  if (!live.data) return <Pending error={live.error} retry={live.refetch} />
  const query2 = q.trim().toLowerCase()
  const hit = (m: { brand: string; label: string; rows: Unit[] }) => !query2 || `${m.brand} ${m.label}`.toLowerCase().includes(query2) || m.rows.some((u) => `${u.imei1} ${u.supplier ?? ''} ${u.buyer ?? ''} ${u.invoice_no ?? ''} ${u.purchase_no ?? ''}`.toLowerCase().includes(query2))
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const models = (tab === 'sales' ? su.data?.models ?? [] : bu.data?.models ?? []) as (SoldModel | BoughtModel)[]
  const shown = models.filter(hit)
  return (
    <div className="flex flex-col gap-3" data-testid="trade-units">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick(tab === 'sales' ? 'autr.searchSales' : 'autr.searchPurchases')} aria-label={pick('common.search')} className={`h-11 rounded-2xl border border-line bg-surface px-3 text-ink ${ur ? 'ur' : 'text-sm'}`} data-testid="trade-units-q" />
      {live.data.truncated ? <span className={`font-bold text-receivable ${tiny}`}>{live.data.notes.join(' ')}</span> : null}
      {!shown.length ? <Empty text="common.nothingFound" /> : tab === 'sales'
        ? (shown as SoldModel[]).map((m) => <SoldCard key={m.key} m={m} />)
        : (shown as BoughtModel[]).map((m) => <BoughtCard key={m.key} m={m} />)}
    </div>
  )
}

function specs(u: Unit, pick: (k: string) => string) {
  return [u.storage, u.colour, pick(`stock.condition.${u.condition}`)].filter(Boolean).join(' · ')
}

function Who({ name, id, fallback }: { name: string | null; id: string | null; fallback: string }) {
  return id ? <Link to={`/parties/${id}`} className="font-bold text-ink underline-offset-2 hover:underline" dir="auto">{name ?? '—'}</Link> : <span className="font-bold text-ink" dir="auto">{name ?? fallback}</span>
}

/** one of the server's picks for a model: the phone, its figure and a line about it */
function PickBox({ title, unit, badge, tone, children, testid }: { title: string; unit: Unit; badge: string; tone: string; children: React.ReactNode; testid: string }) {
  const { pick, ur, cls } = useLang()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-ground px-3 py-2" data-testid={testid}>
      <span className="flex items-center justify-between gap-2"><span className={`text-muted ${tiny}`}>{pick(title)}</span><span className={`num text-base ${tone}`} dir="ltr">{badge}</span></span>
      <Link to={`/stock/${unit.device_id}`} className="num text-sm text-ink underline-offset-2 hover:underline" dir="ltr">{unit.imei1}</Link>
      <span className={`text-muted ${tiny}`}>{children}</span>
    </div>
  )
}

function Head({ brand, label, chips, line, right }: { brand: string; label: string; chips: React.ReactNode; line: React.ReactNode; right: React.ReactNode }) {
  const { ur, cls } = useLang()
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2"><span className="text-base font-extrabold text-ink" dir="auto">{label.toLowerCase().startsWith(brand.toLowerCase()) ? label : `${brand} ${label}`}</span>{chips}</span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{line}</span>
      </span>
      {right}
    </div>
  )
}

function More({ all, count, onClick }: { all: boolean; count: number; onClick: () => void }) {
  const { pick, ur, cls } = useLang()
  return <button type="button" onClick={onClick} className={`tap inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line bg-surface px-3 font-bold text-ink ${ur ? cls('sm') : 'text-xs'}`} data-testid="trade-units-all">{all ? pick('common.close') : <>{pick('autr.inspectAll')} <span className="num ms-1" dir="ltr">{count}</span></>}</button>
}

function SoldCard({ m }: { m: SoldModel }) {
  const { pick, ur, cls } = useLang()
  const [all, setAll] = useState(false)
  const rows = all ? m.rows : m.rows.slice(0, PREVIEW)
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const walkIn = pick('sale.cashCustomer')
  return (
    <section className="card flex flex-col gap-3" data-testid="trade-model">
      <Head brand={m.brand} label={m.label}
        chips={<Chip text={{ en: `${m.units} ${pick('autr.unitsSold')}`, ur: `${m.units} ${pick('autr.unitsSold')}` }} tone="ok" />}
        line={<>{pick('autr.totalSales')}: <span className="num text-ink" dir="ltr">{withCur(n(m.revenue))}</span>{m.cost != null ? <> · {pick('autr.totalCost')}: <span className="num text-ink" dir="ltr">{withCur(n(m.cost))}</span></> : null}</>}
        right={<span className="flex items-center gap-3">{m.profit != null ? <span className="flex flex-col items-end"><span className={`text-muted ${tiny}`}>{pick('autr.modelProfit')}</span><span className={`num text-lg ${Number(m.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr" data-testid="trade-model-profit">{signed(m.profit)}</span></span> : null}{m.rows.length > PREVIEW ? <More all={all} count={m.units} onClick={() => setAll(!all)} /> : null}</span>}
      />
      {m.highest_profit && m.lowest_cost ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <PickBox title="autr.highestProfit" unit={m.highest_profit} badge={signed(m.highest_profit.profit)} tone="text-emerald-deep" testid="trade-best">{pick('autr.from')}: <Who name={m.highest_profit.supplier} id={m.highest_profit.supplier_id} fallback="—" /> → {pick('autr.to')}: <Who name={m.highest_profit.buyer} id={m.highest_profit.buyer_id} fallback={walkIn} /></PickBox>
          <PickBox title="autr.lowestCost" unit={m.lowest_cost} badge={withCur(n(m.lowest_cost.cost))} tone="text-ink" testid="trade-cheapest">{pick('autr.from')}: <Who name={m.lowest_cost.supplier} id={m.lowest_cost.supplier_id} fallback="—" /> → {pick('autr.to')}: <Who name={m.lowest_cost.buyer} id={m.lowest_cost.buyer_id} fallback={walkIn} /></PickBox>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-sm" data-testid="trade-unit-rows">
          <thead><tr className={`border-b border-line text-muted ${tiny}`}>
            <th className="px-3 py-2 text-start">{pick('autr.dateBill')}</th><th className="px-3 py-2 text-start">{pick('autr.imeiSpecs')}</th><th className="px-3 py-2 text-start">{pick('autr.supplier')}</th><th className="px-3 py-2 text-start">{pick('autr.buyer')}</th>
            <th className="px-3 py-2 text-end">{pick('autr.debit')}</th><th className="px-3 py-2 text-end">{pick('autr.credit')}</th>{m.profit != null ? <th className="px-3 py-2 text-end">{pick('counter.grossProfit')}</th> : null}<th className="px-3 py-2 text-end">{pick('autr.khataStatus')}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={`${u.invoice_id}${u.device_id}`} data-testid="trade-unit">
                <td className="px-3 py-2.5"><Link to={`/sales/${u.invoice_id}`} className="num text-ink underline-offset-2 hover:underline" dir="ltr">{u.invoice_no}</Link><div className={`text-muted ${tiny}`} dir="ltr">{fmtDate(u.date)}</div></td>
                <td className="px-3 py-2.5"><Link to={`/stock/${u.device_id}`} className="num text-ink underline-offset-2 hover:underline" dir="ltr">{u.imei1}</Link><div className={`text-muted ${tiny}`} dir="auto">{specs(u, pick)}</div></td>
                <td className="px-3 py-2.5"><Who name={u.supplier} id={u.supplier_id} fallback="—" /><div className={`text-muted ${tiny}`}><span dir="ltr">{u.purchase_no ?? ''}</span>{u.cost != null ? <> · {pick('autr.cost')} <span className="num" dir="ltr">{n(u.cost)}</span></> : null}</div></td>
                <td className="px-3 py-2.5"><Who name={u.buyer} id={u.buyer_id} fallback={walkIn} /></td>
                <td className="num px-3 py-2.5 text-end" dir="ltr">{n(u.price)}</td>
                <td className="num px-3 py-2.5 text-end text-emerald-deep" dir="ltr">{n(u.bill_paid)}</td>
                {m.profit != null ? <td className={`num px-3 py-2.5 text-end ${Number(u.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{signed(u.profit)}</td> : null}
                <td className="px-3 py-2.5 text-end"><Chip text={`audit.trade.st.${u.pay_status}`} tone={TONE[u.pay_status]} />{Number(u.bill_due) > 0 ? <div className={`num text-receivable ${tiny}`} dir="ltr">{n(u.bill_due)}</div> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BoughtCard({ m }: { m: BoughtModel }) {
  const { pick, ur, cls } = useLang()
  const [all, setAll] = useState(false)
  const rows = all ? m.rows : m.rows.slice(0, PREVIEW)
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const now = (u: BoughtUnit) => pick(`autr.now.${u.sold ? 'sold' : u.status_now === 'in_stock' ? 'in_stock' : 'other'}`)
  return (
    <section className="card flex flex-col gap-3" data-testid="trade-model">
      <Head brand={m.brand} label={m.label}
        chips={<><Chip text={{ en: `${m.units} ${pick('autr.unitsBought')}`, ur: `${m.units} ${pick('autr.unitsBought')}` }} tone="ink" /><Chip text={{ en: `${m.sold} ${pick('autr.soldN')}`, ur: `${m.sold} ${pick('autr.soldN')}` }} tone="ok" /><Chip text={{ en: `${m.in_stock} ${pick('autr.inShop')}`, ur: `${m.in_stock} ${pick('autr.inShop')}` }} tone="warn" /></>}
        line={<>{pick('autr.invested')}: <span className="num text-ink" dir="ltr">{withCur(n(m.invested))}</span> · {pick('autr.profitSoFar')}: <span className={`num ${Number(m.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{signed(m.profit)}</span></>}
        right={m.rows.length > PREVIEW ? <More all={all} count={m.units} onClick={() => setAll(!all)} /> : null}
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <PickBox title="autr.cheapestDeal" unit={m.lowest_cost} badge={withCur(n(m.lowest_cost.cost))} tone="text-emerald-deep" testid="trade-cheapest">{pick('autr.supplier')}: <Who name={m.lowest_cost.supplier} id={m.lowest_cost.supplier_id} fallback="—" /> · <span dir="ltr">{fmtDate(m.lowest_cost.date)}</span> · {now(m.lowest_cost)}</PickBox>
        <PickBox title="autr.dearestDeal" unit={m.highest_cost} badge={withCur(n(m.highest_cost.cost))} tone="text-receivable" testid="trade-dearest">{pick('autr.supplier')}: <Who name={m.highest_cost.supplier} id={m.highest_cost.supplier_id} fallback="—" /> · <span dir="ltr">{fmtDate(m.highest_cost.date)}</span> · {now(m.highest_cost)}</PickBox>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-sm" data-testid="trade-unit-rows">
          <thead><tr className={`border-b border-line text-muted ${tiny}`}>
            <th className="px-3 py-2 text-start">{pick('autr.dateBill')}</th><th className="px-3 py-2 text-start">{pick('autr.imeiSpecs')}</th><th className="px-3 py-2 text-start">{pick('autr.supplier')}</th>
            <th className="px-3 py-2 text-end">{pick('autr.cost')}</th><th className="px-3 py-2 text-end">{pick('autr.billState')}</th><th className="px-3 py-2 text-start">{pick('autr.nowBuyer')}</th><th className="px-3 py-2 text-end">{pick('counter.grossProfit')}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => (
              <tr key={`${u.purchase_id}${u.device_id}`} data-testid="trade-unit">
                <td className="px-3 py-2.5"><Link to={`/purchases/${u.purchase_id}`} className="num text-ink underline-offset-2 hover:underline" dir="ltr">{u.purchase_no}</Link><div className={`text-muted ${tiny}`} dir="ltr">{fmtDate(u.date)}</div></td>
                <td className="px-3 py-2.5"><Link to={`/stock/${u.device_id}`} className="num text-ink underline-offset-2 hover:underline" dir="ltr">{u.imei1}</Link><div className={`text-muted ${tiny}`} dir="auto">{specs(u, pick)}</div></td>
                <td className="px-3 py-2.5"><Who name={u.supplier} id={u.supplier_id} fallback="—" /></td>
                <td className="num px-3 py-2.5 text-end" dir="ltr">{n(u.cost)}</td>
                <td className="px-3 py-2.5 text-end"><Chip text={`audit.trade.st.${u.pay_status}`} tone={TONE[u.pay_status]} />{Number(u.bill_owed) > 0 ? <div className={`num text-payable ${tiny}`} dir="ltr">{n(u.bill_owed)}</div> : null}</td>
                <td className="px-3 py-2.5"><span className="font-bold text-ink">{now(u)}</span>{u.sold ? <div className={`text-muted ${tiny}`}><Who name={u.buyer} id={u.buyer_id} fallback={pick('sale.cashCustomer')} />{u.sold_for != null ? <> · <span className="num" dir="ltr">{n(u.sold_for)}</span></> : null}</div> : null}</td>
                <td className={`num px-3 py-2.5 text-end ${Number(u.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{u.sold ? signed(u.profit) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ViewHint({ tab }: { tab: 'sales' | 'purchases' }) {
  return <BiLabel text={tab === 'sales' ? 'autr.salesHint' : 'autr.purchasesHint'} size="sm" tone="text-muted" />
}
