/** Super admin, one shop (owner 2026-11-17, ADR-098):
 *  1. a special price — a package at an agreed monthly fee for a number of months (or no end);
 *     the shop sees the list price crossed out and its own beside it;
 *  2. "payment received" together with the package, extra modules and months it is for — for a
 *     customer who sent the money and asked to be activated. The total is the server's quote. */

import { BadgePercent, CheckCircle2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { api } from '@/lib/api'
import { isoDay, withCur } from '@/lib/format'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

const PLANS = ['basic', 'pro', 'chain'] as const
type PlanKey = (typeof PLANS)[number]
interface Deal { plan: string; price: string; months: number | null; months_left: number | null; note: string | null }
interface ShopLite { id: string; plan: string; fee_deal?: Deal | null }
interface Quote { total: string; per_month: string; months: number; discount_pct: number; deal_months: number; extras: string[] }
interface Catalogue { modules: Record<string, { en: string; ur: string }>; plans: Record<string, string[]> }
interface Paid { receipt_no?: string | null }

const rs = (v: string | number) => withCur(Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const paid = (p: string): PlanKey => ((PLANS as readonly string[]).includes(p) ? (p as PlanKey) : 'basic')

export default function AdminDealCard<S extends ShopLite>({ shop, onSaved }: { shop: S; onSaved: (s: S) => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const deal = shop.fee_deal ?? null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap h-10 rounded-full border-2 px-3.5 ${ur ? cls('sm') : 'text-sm font-bold'} ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`

  // ---- 1. the special price ----
  const [d, setD] = useState({ plan: paid(deal?.plan ?? shop.plan), price: deal ? String(Number(deal.price)) : '', months: deal?.months ? String(deal.months) : '', note: deal?.note ?? '' })
  const save = useDocMutation<Record<string, unknown>, S>('PUT', () => `/api/v1/admin/shops/${shop.id}/deal`)
  const [removing, setRemoving] = useState(false)
  const [err, setErr] = useState<unknown>(null)

  // ---- 2. payment received, with the package ----
  const { data: cat } = useGet<Catalogue>(['admin-modules'], '/api/v1/admin/modules')
  const [o, setO] = useState({ plan: paid(deal?.plan ?? shop.plan), modules: [] as string[], months: '1', amount: '', method: 'cash', reference: '', paid_on: isoDay(0) })
  const [quote, setQuote] = useState<Quote | null>(null)
  const pay = useDocMutation<Record<string, unknown>, Paid>('POST', () => `/api/v1/admin/shops/${shop.id}/payments`)
  const months = Math.min(60, Math.max(1, Number(o.months) || 1))
  const order = { plan: o.plan, modules: o.modules, addons: [], months }
  const key = `${shop.id}|${o.plan}|${o.modules.join(',')}|${months}|${deal?.price ?? ''}|${deal?.months_left ?? ''}`
  useEffect(() => {
    let stale = false
    api<Quote>('POST', `/api/v1/admin/shops/${shop.id}/quote`, order).then((q) => { if (!stale) setQuote(q) }).catch(() => { if (!stale) setQuote(null) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const amount = o.amount !== '' ? o.amount : quote ? String(Number(quote.total)) : ''
  const extra = cat ? Object.keys(cat.modules).filter((k) => !(cat.plans[o.plan] ?? []).includes(k)) : []
  const refresh = () => inv('admin-shops', 'fee-stats', 'prov-overview', 'prov-shops', 'prov-pays')

  return (
    <div className="flex flex-col gap-3" data-testid="admin-deal">
      <span className="mt-2 flex items-center gap-1"><BiLabel text="admin.deal.title" size="md" bold /><Help term="admin.deal" size="sm" /></span>
      <BiLabel text="admin.deal.hint" size="sm" tone="text-muted" />
      {deal ? (
        <div className={`flex items-center gap-2 rounded-2xl bg-emerald-tint px-3 py-2 text-emerald-deep ${small}`} data-testid="deal-now">
          <BadgePercent size={16} className="shrink-0" />
          <span className="min-w-0 flex-1"><b className="capitalize">{pick(`fees.pick.pkg.${deal.plan}`)}</b> · <span className="num" dir="ltr">{rs(deal.price)}</span> {pick('fees.pick.perMonth')} · {deal.months_left == null ? pick('admin.deal.noEnd') : pick('admin.deal.left').replace('{{n}}', String(deal.months_left))}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PLANS.map((k) => <button key={k} type="button" aria-pressed={d.plan === k} onClick={() => setD({ ...d, plan: k })} className={chip(d.plan === k)} data-testid={`deal-plan-${k}`}>{pick(`fees.pick.pkg.${k}`)}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="admin.deal.price" type="number" inputMode="numeric" min={0} value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} className="num" data-testid="deal-price" />
        <BiInput label="admin.deal.months" type="number" inputMode="numeric" min={1} max={120} value={d.months} onChange={(e) => setD({ ...d, months: e.target.value })} className="num" data-testid="deal-months" />
      </div>
      <BiInput label="admin.deal.note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={200} data-testid="deal-note" />
      <ErrorText error={save.error ?? err} />
      <BiButton text="admin.deal.save" icon={<BadgePercent size={20} />} variant="secondary" full disabled={d.price === '' || Number(d.price) < 0} loading={save.isPending} data-testid="deal-save"
        onClick={async () => { const r = await save.mutateAsync({ plan: d.plan, price: Number(d.price), months: d.months === '' ? null : Number(d.months), note: d.note || null }); onSaved(r); refresh() }} />
      {save.isSuccess ? <BiAlert text="admin.deal.saved" kind="success" /> : null}
      {deal ? (
        <button type="button" disabled={removing} data-testid="deal-remove" className={`tap flex min-h-10 items-center justify-center gap-1 rounded-xl text-payable ${ur ? cls('sm') : 'text-sm font-bold'}`}
          onClick={async () => { setRemoving(true); setErr(null); try { const r = await api<S>('DELETE', `/api/v1/admin/shops/${shop.id}/deal`); save.reset(); onSaved(r); refresh() } catch (e) { setErr(e) } finally { setRemoving(false) } }}>
          <Trash2 size={15} />{pick('admin.deal.remove')}
        </button>
      ) : null}

      <span className="mt-2 flex items-center gap-1"><BiLabel text="admin.payOrder.title" size="md" bold /><Help term="admin.payOrder" size="sm" /></span>
      <BiLabel text="admin.payOrder.hint" size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">
        {PLANS.map((k) => <button key={k} type="button" aria-pressed={o.plan === k} onClick={() => setO({ ...o, plan: k, modules: [], amount: '' })} className={chip(o.plan === k)} data-testid={`order-plan-${k}`}>{pick(`fees.pick.pkg.${k}`)}</button>)}
      </div>
      {extra.length ? (
        <>
          <BiLabel text="admin.payOrder.modules" size="sm" tone="text-muted" bold />
          <div className="flex flex-wrap gap-1.5">
            {extra.map((k) => { const on = o.modules.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setO({ ...o, modules: on ? o.modules.filter((x) => x !== k) : [...o.modules, k], amount: '' })} className={chip(on)} data-testid={`order-mod-${k}`}>{pick(`modules.${k}`)}</button> })}
          </div>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="fees.months" type="number" inputMode="numeric" min={1} max={60} value={o.months} onChange={(e) => setO({ ...o, months: e.target.value, amount: '' })} className="num" data-testid="order-months" />
        <BiInput label="fees.amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setO({ ...o, amount: e.target.value })} className="num" data-testid="order-amount" />
        <BiInput label="fees.method" value={o.method} onChange={(e) => setO({ ...o, method: e.target.value })} />
        <BiInput label="admin.paidOn" type="date" value={o.paid_on} onChange={(e) => setO({ ...o, paid_on: e.target.value })} dir="ltr" />
      </div>
      <BiInput label="fees.reference" value={o.reference} onChange={(e) => setO({ ...o, reference: e.target.value })} dir="ltr" />
      {quote ? (
        <div className={`flex items-center justify-between gap-2 rounded-2xl bg-ground px-3 py-2 ${small}`} data-testid="order-quote">
          <span className="text-muted">{pick('admin.payOrder.total')}{quote.discount_pct ? ` · ${pick('fees.pick.off').replace('{{n}}', String(quote.discount_pct))}` : ''}{quote.deal_months ? ` · ${pick('fees.pick.sum.dealPart').replace('{{n}}', String(quote.deal_months)).split(',')[0]}` : ''}</span>
          <span className="num text-base font-extrabold text-ink" dir="ltr">{rs(quote.total)}</span>
        </div>
      ) : null}
      <ErrorText error={pay.error} />
      <BiButton text="admin.payOrder.apply" icon={<CheckCircle2 size={20} />} full disabled={!Number(amount)} loading={pay.isPending} data-testid="order-apply"
        onClick={async () => {
          await pay.mutateAsync({ amount: Number(amount), method: o.method || 'cash', reference: o.reference || null, paid_on: o.paid_on || null, order })
          refresh()
          const rows = await api<S[]>('GET', '/api/v1/admin/shops')
          const r = rows.find((x) => x.id === shop.id)
          if (r) onSaved(r)
          setO({ ...o, amount: '', reference: '' })
        }} />
      {pay.data ? <BiAlert text={{ en: `${pick('admin.payOrder.done')} ${pay.data.receipt_no ?? ''}`, ur: `${pick('admin.payOrder.done')} ${pay.data.receipt_no ?? ''}`, roman: `${pick('admin.payOrder.done')} ${pay.data.receipt_no ?? ''}` }} kind="success" /> : null}
    </div>
  )
}
