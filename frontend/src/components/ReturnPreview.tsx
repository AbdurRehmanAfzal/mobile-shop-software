/** The impact preview before a return or an undo (owner 2026-11-18, ADR-102). Every figure here
 *  comes from the server, which runs the real posting and rolls it back — the app works nothing
 *  out itself, so what is shown is what will be posted. Plain sentences for everyone; cost, stock
 *  value, the profit effect and the accounting lines only when the server sent them (owner /
 *  manager). `usePreview` fetches it and keeps the token the confirm must send back. */

import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText, Loading, MoneyText, fmtDate } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { withCur } from '@/lib/format'

type M = string
interface Dev { device_id: string; label: string; imei: string | null; cost?: M; before: string; after: string }
interface Blocker { code: string; phone?: string | null; who?: string | null; ref?: string | null; to?: string | null }
export interface Preview {
  kind: 'sale' | 'purchase'; ok?: boolean; blockers?: Blocker[]; undo?: boolean; replaces?: boolean; token?: string
  original?: { bill_no?: string; bill_date?: string; party_name?: string | null; no?: string; status?: string; refund?: M; kept?: M; amount?: M; items?: { label: string | null; imei: string | null; sold_for?: M; cost?: M }[] }
  amount?: M; refund?: M; kept?: M; devices?: Dev[]; stock_count?: number
  cash?: { account: string; change: M }[]; cash_total?: M; khata?: { party_id: string; name: string; before: M; after: M }[]
  stock_value?: M; sales_change?: M; cogs_reversed?: M; retained_income?: M; profit?: M; journal?: { account: string; debit: M; credit: M }[]; balanced?: boolean
}

const rs = (v: M | number | null | undefined) => withCur(Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 }))

/** POST / GET the preview whenever `open` turns true or `key` changes; `again()` asks for a new one */
export function usePreview(open: boolean, method: 'POST' | 'GET', url: string | null, body: unknown, key: string) {
  const [data, setData] = useState<Preview | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const again = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!open || !url) { setData(null); setError(null); return }
    let stale = false
    setLoading(true)
    setError(null)
    api<Preview>(method, url, method === 'POST' ? body : undefined)
      .then((p) => { if (!stale) setData(p) })
      .catch((e) => { if (!stale) { setData(null); setError(e) } })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url, key, tick])
  return { data, error, loading, again }
}

/** did the confirm fail only because the preview is out of date? */
export const isStale = (e: unknown) => e instanceof ApiError && e.code === 'preview_stale'

export default function ReturnPreview({ pv, loading, error, changed }: { pv: Preview | null; loading: boolean; error: unknown; changed?: boolean }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-sm font-semibold'
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  if (loading && !pv) return <div className="flex flex-col items-center gap-2 py-6" data-testid="pv-loading"><Loading /><BiLabel text="ret.pv.loading" size="sm" tone="text-muted" /></div>
  if (error && !pv) return <ErrorText error={error} />
  if (!pv) return null

  if (pv.ok === false) {
    const line = (b: Blocker) => {
      const raw = pick(`delchk.c.${b.code}`)
      return (raw === `delchk.c.${b.code}` ? pick('delchk.c.not_in_shop') : raw).replace('{{phone}}', b.phone ?? '—').replace('{{who}}', b.who ?? '—').replace('{{ref}}', b.ref ?? '—')
    }
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-gold/50 bg-gold/15 p-3" data-testid="pv-blocked" role="alert">
        <span className="flex items-center gap-2 text-gold-text"><AlertTriangle size={18} /><BiLabel text="ret.pv.wrongKind" size="md" bold tone="text-current" /></span>
        {(pv.blockers ?? []).map((b, i) => <span key={i} className={`rounded-xl bg-surface px-3 py-2 ${small}`} data-testid={`pv-blocker-${b.code}`}>{line(b)}</span>)}
      </div>
    )
  }

  const o = pv.original ?? {}
  const devices = pv.devices ?? []
  const n = Math.abs(pv.stock_count ?? 0)
  const faulty = devices.filter((d) => d.after === 'faulty' && d.before !== 'faulty').length
  const toSold = devices.filter((d) => d.after === 'sold' && d.before !== 'sold').length
  const stockLine = toSold ? pick('ret.pv.stockSold').replace('{{n}}', String(toSold))
    : faulty ? pick('ret.pv.stockFaulty').replace('{{n}}', String(faulty))
      : (pv.stock_count ?? 0) > 0 ? pick('ret.pv.stockIn').replace('{{n}}', String(n))
        : (pv.stock_count ?? 0) < 0 ? pick('ret.pv.stockOut').replace('{{n}}', String(n)) : null
  const owed = (v: M) => (Number(v) > 0 ? pick('ret.pv.owes').replace('{{n}}', rs(v)) : Number(v) < 0 ? pick('ret.pv.weOwe').replace('{{n}}', rs(v)) : pick('ret.pv.clear'))
  const row = (k: string, v: string, testid?: string) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-muted">{k}</span><span className="num font-bold" dir="ltr" data-testid={testid}>{v}</span></div>
  )
  const say = (text: string, testid: string, tone = '') => <span className={`rounded-xl bg-ground px-3 py-2 ${small} ${tone}`} data-testid={testid}>{text}</span>

  return (
    <div className="flex flex-col gap-3" data-testid="return-preview">
      {changed ? <div className={`rounded-2xl border border-gold/50 bg-gold/15 px-3 py-2 text-gold-text ${small}`} data-testid="pv-changed">{pick('ret.pv.changed')}</div> : null}
      {pv.undo ? say(pick('ret.pv.undoNote').replace('{{no}}', o.no ?? ''), 'pv-undo-note') : null}
      {pv.replaces ? say(pick('ret.pv.replaceNote').replace('{{no}}', o.no ?? ''), 'pv-replace-note') : null}

      <div className="card flex flex-col divide-y divide-line py-1" data-testid="pv-original">
        <div className="flex items-center justify-between gap-2 py-2">
          <span className={`text-muted ${tiny}`}>{pick('ret.pv.original')}</span>
          <span className={small}><span dir="ltr">{o.bill_no}</span>{o.bill_date ? <span className="text-muted" dir="ltr"> · {fmtDate(o.bill_date)}</span> : null}{o.party_name ? ` · ${o.party_name}` : ''}</span>
        </div>
        {(o.items ?? []).map((it, i) => (
          <div key={i} className="flex flex-col gap-0.5 py-2">
            <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[15px] font-extrabold">{it.label}</span>{it.sold_for != null ? <span className="num" dir="ltr">{rs(it.sold_for)}</span> : null}</span>
            <span className={`flex items-center justify-between gap-2 text-muted ${tiny}`}><span className="num" dir="ltr">{it.imei ?? ''}</span>{it.cost != null ? <span>{pick('ret.cf.cost')} <span className="num" dir="ltr" data-testid="pv-cost">{rs(it.cost)}</span></span> : null}</span>
          </div>
        ))}
        {pv.undo ? devices.map((d) => <div key={d.device_id} className="flex flex-col py-2"><span className="truncate text-[15px] font-extrabold">{d.label}</span><span className={`num text-muted ${tiny}`} dir="ltr">{d.imei ?? ''}</span></div>) : null}
      </div>

      <BiLabel text="ret.pv.will" size="md" bold />
      <div className="flex flex-col gap-1.5" data-testid="pv-impact">
        {stockLine ? say(stockLine, 'pv-stock') : null}
        {(pv.cash ?? []).length ? (pv.cash ?? []).map((c, i) => say(pick(Number(c.change) < 0 ? 'ret.pv.cashOut' : 'ret.pv.cashIn').replace('{{n}}', rs(c.change)).replace('{{acc}}', c.account), i ? `pv-cash-${i}` : 'pv-cash'))
          : say(pick('ret.pv.cashNone'), 'pv-cash')}
        {!pv.undo && Number(pv.kept ?? 0) ? say(pick(pv.kind === 'sale' ? 'ret.pv.kept' : 'ret.pv.keptSupplier').replace('{{n}}', rs(pv.kept)), 'pv-kept') : null}
        {(pv.khata ?? []).filter((k) => k.before !== k.after || Number(k.after)).map((k) => (
          <span key={k.party_id} className={`flex flex-wrap items-center justify-between gap-x-2 rounded-xl bg-ground px-3 py-2 ${small}`} data-testid="pv-khata">
            <span>{pick('ret.pv.khata').replace('{{name}}', k.name)}</span>
            <span>{owed(k.before)} → <b>{owed(k.after)}</b></span>
          </span>
        ))}
      </div>

      {pv.profit != null ? (
        <div className="card flex flex-col divide-y divide-line py-1" data-testid="pv-books">
          <span className={`py-1.5 text-muted ${tiny}`}>{pick('ret.pv.books')}</span>
          {pv.stock_value != null && Number(pv.stock_value) ? row(pick('ret.pv.stockValue'), `${Number(pv.stock_value) < 0 ? '− ' : '+ '}${rs(pv.stock_value)}`, 'pv-stock-value') : null}
          {Number(pv.sales_change ?? 0) ? row(pick('ret.pv.salesReturn'), `${Number(pv.sales_change) < 0 ? '− ' : '+ '}${rs(pv.sales_change)}`, 'pv-sales') : null}
          {Number(pv.cogs_reversed ?? 0) ? row(pick('ret.pv.cogs'), `${Number(pv.cogs_reversed) < 0 ? '− ' : '+ '}${rs(pv.cogs_reversed)}`, 'pv-cogs') : null}
          {Number(pv.retained_income ?? 0) ? row(pick('ret.pv.income'), `${Number(pv.retained_income) < 0 ? '− ' : '+ '}${rs(pv.retained_income)}`, 'pv-income') : null}
          <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-muted">{pick('ret.pv.profit')}</span><span data-testid="pv-profit"><MoneyText value={pv.profit} tone="auto" size="sm" signed /></span></div>
          {pv.journal?.length ? (
            <details className="py-1.5">
              <summary className={`cursor-pointer text-muted ${tiny}`}>{pick('ret.pv.journal')}{pv.balanced ? ` · ${pick('ret.pv.balanced')}` : ''}</summary>
              <div className="mt-1 flex flex-col" dir="ltr" data-testid="pv-journal">
                {pv.journal.map((j, i) => <div key={i} className="grid grid-cols-[1fr_5rem_5rem] gap-2 py-0.5 text-xs"><span className="truncate">{j.account.replace(/:[0-9a-f-]{36}$/, '')}</span><span className="num text-end">{Number(j.debit) ? Number(j.debit).toLocaleString('en-US') : ''}</span><span className="num text-end">{Number(j.credit) ? Number(j.credit).toLocaleString('en-US') : ''}</span></div>)}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
