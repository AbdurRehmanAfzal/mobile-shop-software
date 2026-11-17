/** The returns report (owner 2026-11-17, ADR-097): phones that came back from customers and went
 *  back to suppliers — how many, their value, what was handed back, the cut, the effect on profit,
 *  why, who took them back; and each return with everything about it in a sheet. One component for
 *  the Returns list (its own dates) and the Shop Audit (the audit's period). */

import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, Empty, ErrorText, KV, List, MoneyText, Pending, Row, Section, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { api } from '@/lib/api'
import { useGet } from '@/lib/queries'
import BillActions from './BillActions'

type M = string
interface Item { device_id: string | null; label: string; imei: string | null; status_now: string | null; price: M; cost?: M; profit_undone?: M; sold_again?: { invoice_id: string | null; date: string; price: M; profit?: M } }
export interface ReturnRow {
  id: string; no: string; kind: 'sale' | 'purchase'; date: string; created_at: string; bill_id: string; bill_no: string; bill_date: string | null; days_after: number | null
  party_id: string; party_name: string | null; party_phone: string | null; by: string | null
  amount: M; refund: M; refund_account: string | null; kept: M; to_khata: M; reason_code: string | null; reason: string | null
  items: Item[]; item_condition?: string | null; replaces_no?: string | null; in_warranty: boolean; another_bill: { id: string; no: string; date: string; total: M } | null; profit_undone?: M; net?: M
}
interface Totals { count: number; phones: number; items: number; amount: M; refund: M; kept: M; to_khata: M; in_warranty: number; took_another: number; sold_again: number; voided: number; profit_undone?: M; net?: M; phones_sold?: number; rate_pct?: number | null }
interface Group { key: string | null; name?: string | null; count: number; amount: M }
interface Side { totals: Totals; by_reason: Group[]; by_user: Group[]; rows: ReturnRow[] }
interface Report { date_from: string; date_to: string; show_cost: boolean; sale: Side; purchase: Side }

const rs = (v: M | number | null | undefined) => withCur(Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function ReturnsReport({ url, qk }: { url: string; qk: unknown[] }) {
  const { pick, ur, cls } = useLang()
  const { data: d, error, refetch } = useGet<Report>(qk, url)
  const [tab, setTab] = useState<'sale' | 'purchase'>('sale')
  const [open, setOpen] = useState<ReturnRow | null>(null)
  const nav = useNavigate()
  // ADR-101: after an undo, the right return can be entered at once (it points back at this one)
  const [undone, setUndone] = useState<string | null>(null)
  const role = useAuth((s) => s.me?.user.role)
  const manage = role === 'owner' || role === 'manager'
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!d) return <Pending error={error} retry={refetch} />
  const side = d[tab]
  const t = side.totals
  const sale = tab === 'sale'
  const reason = (k: string | null) => pick(`ret.reason.${k ?? 'none'}`)
  const tile = (k: string, v: ReactNode, sub?: string, tone = '') => (
    <div className="flex min-w-0 flex-col rounded-2xl bg-surface px-3 py-2.5 shadow-sm ring-1 ring-line">
      <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
      <span className={`num truncate text-lg font-extrabold leading-tight ${tone}`} dir="ltr">{v}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-[11px]'}`}>{sub}</span> : null}
    </div>
  )
  const groups = (rows: Group[], name: (g: Group) => string) => (
    <div className="card flex flex-col divide-y divide-line p-0">
      {rows.map((g) => (
        <div key={String(g.key)} className="flex items-center gap-3 px-4 py-2.5">
          <span className={`min-w-0 flex-1 truncate ${ur ? cls('md') : 'text-[15px] font-semibold'}`}>{name(g)}</span>
          <span className="num text-sm font-bold" dir="ltr">{g.count}</span>
          <span className="num w-24 text-end text-sm text-muted" dir="ltr">{rs(g.amount)}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-3" data-testid="returns-report">
      {undone ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-emerald/40 bg-emerald-tint p-3" data-testid="ret-after-undo">
          <BiLabel text="ret.after.undone" size="sm" bold tone="text-emerald-deep" />
          <div className="grid grid-cols-2 gap-2">
            <BiButton text="ret.after.sale" size="md" variant="secondary" full onClick={() => nav(`/return/new?corrects=${undone}`)} data-testid="after-sale" />
            <BiButton text="ret.after.purchase" size="md" variant="secondary" full onClick={() => nav('/purchases')} data-testid="after-purchase" />
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(['sale', 'purchase'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`ret-tab-${k}`} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 px-2 ${ur ? cls('md') : 'text-[15px] font-bold'} ${tab === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
            {pick(k === 'sale' ? 'ret.fromCustomers' : 'ret.toSuppliers')}<span className="num rounded-full bg-black/10 px-2 text-sm" dir="ltr">{d[k].totals.count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="ret-tiles">
        {tile('ret.t.count', t.count, `${t.phones} ${pick('ret.t.phones')}`)}
        {tile('ret.t.amount', rs(t.amount))}
        {tile(sale ? 'ret.t.refund' : 'ret.t.refundGot', rs(t.refund))}
        {tile(sale ? 'ret.t.kept' : 'ret.t.cutLost', rs(t.kept), undefined, Number(t.kept) ? (sale ? 'text-emerald-deep' : 'text-payable') : '')}
        {tile('ret.t.toKhata', rs(t.to_khata))}
        {d.show_cost && sale ? tile('ret.t.undone', rs(t.profit_undone)) : null}
        {d.show_cost ? <div className="flex min-w-0 flex-col rounded-2xl bg-surface px-3 py-2.5 shadow-sm ring-1 ring-line" data-testid="ret-net"><span className="flex items-center gap-1"><span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick('ret.t.net')}</span><Help term="ret.net" size="sm" /></span><MoneyText value={t.net} tone="auto" size="md" signed /></div> : null}
        {sale ? tile('ret.t.another', t.took_another) : null}
        {sale ? tile('ret.t.again', t.sold_again) : null}
        {sale ? tile('ret.t.warranty', t.in_warranty) : null}
        {t.voided ? tile('ret.t.voided', t.voided) : null}
      </div>
      {sale && t.phones_sold ? <span className={`rounded-2xl bg-ground px-3 py-2 text-muted ${small}`} data-testid="ret-rate">{pick('ret.t.rate').replace('{{sold}}', String(t.phones_sold)).replace('{{n}}', String(t.phones)).replace('{{pct}}', String(t.rate_pct ?? 0))}</span> : null}

      {!side.rows.length ? <Empty text="ret.none" /> : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Section title="ret.why">{groups(side.by_reason, (g) => reason(g.key))}</Section>
            <Section title="ret.who">{groups(side.by_user, (g) => g.name ?? '—')}</Section>
          </div>
          <Section title="ret.list" help="ret.page">
            <List>
              {side.rows.map((r) => (
                <div key={r.id} className="flex items-center" data-testid="ret-row">
                  <div className="min-w-0 flex-1">
                    <Row
                      title={<span>{r.items.map((i) => i.label).join(', ')}</span>}
                      sub={<span className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><span>{r.party_name}</span> · <span dir="ltr">{r.no}</span> · <span dir="ltr">{fmtDate(r.date)}</span><Chip text={`ret.reason.${r.reason_code ?? 'none'}`} tone={r.reason_code === 'fault' ? 'warn' : 'muted'} />{r.another_bill ? <Chip text="ret.t.another" tone="ok" /> : null}</span>}
                      right={<span className="flex flex-col items-end"><MoneyText value={r.amount} tone="ink" />{Number(r.kept) ? <span className={`text-muted ${small}`}>{pick('counter.cut')} <span className="num" dir="ltr">{rs(r.kept)}</span></span> : null}</span>}
                      onClick={() => setOpen(r)}
                    />
                  </div>
                  {manage ? <BillActions kind={r.kind === 'sale' ? 'saleReturn' : 'purchaseReturn'} id={r.id} no={r.no} canDelete editTo={null} onDone={() => { setUndone(r.id); void refetch() }} previewUrl={`/api/v1/returns/${r.id}/void-preview`} /> : null}
                </div>
              ))}
            </List>
          </Section>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.no ?? ''}>
        {open ? <Detail r={open} showCost={d.show_cost} manage={manage} onSaved={() => { setOpen(null); void refetch() }} /> : null}
      </Sheet>
    </div>
  )
}

function Detail({ r, showCost, manage, onSaved }: { r: ReturnRow; showCost: boolean; manage: boolean; onSaved: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState<string | null>(r.reason_code)
  const [note, setNote] = useState(r.reason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const codes = r.kind === 'sale' ? ['changed_mind', 'fault', 'not_as_told', 'price', 'another_phone', 'other'] : ['fault', 'not_as_told', 'not_selling', 'other']
  const sale = r.kind === 'sale'
  const link = (to: string, text: ReactNode) => <Link to={to} className="inline-flex items-center gap-0.5 font-bold text-emerald-deep underline-offset-2 hover:underline">{text}<ChevronRight size={14} className="rtl:rotate-180" /></Link>
  const days = r.days_after == null ? null : r.days_after === 0 ? pick('ret.d.sameDay') : pick('ret.d.days').replace('{{n}}', String(r.days_after))
  return (
    <div className="flex flex-col gap-3" data-testid="ret-detail">
      <div className="card flex flex-col divide-y divide-line py-1">
        <KV k="ret.d.when" v={<span dir="ltr">{fmtDate(r.date)}{days ? ` · ${days}` : ''}</span>} />
        <KV k="ret.d.bill" v={link(sale ? `/sales/${r.bill_id}` : `/purchases/${r.bill_id}`, <span dir="ltr">{r.bill_no}{r.bill_date ? ` · ${fmtDate(r.bill_date)}` : ''}</span>)} />
        <KV k={sale ? 'ret.d.customer' : 'ret.d.supplier'} v={link(`/parties/${r.party_id}`, <span>{r.party_name}{r.party_phone ? <span className="num text-muted" dir="ltr"> · {r.party_phone}</span> : null}</span>)} />
        <KV k="ret.d.by" v={r.by ?? '—'} />
        <KV k="ret.d.reason" v={pick(`ret.reason.${r.reason_code ?? 'none'}`)} />
        {r.reason ? <KV k="ret.d.note" v={r.reason} /> : null}
        {sale ? <KV k="ret.t.warranty" v={pick(r.in_warranty ? 'ret.d.yes' : 'ret.d.no')} /> : null}
        {r.item_condition ? <KV k="ret.x.condition" v={<Chip text={`ret.cond.${r.item_condition}`} tone={r.item_condition === 'damaged' ? 'warn' : 'ok'} />} /> : null}
        {r.replaces_no ? <KV k="ret.x.replaces" v={<span dir="ltr">{r.replaces_no}</span>} /> : null}
      </div>

      {r.items.map((i, n) => (
        <div key={n} className="card flex flex-col divide-y divide-line py-1" data-testid="ret-item">
          <div className="flex items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 flex-col"><span className={`truncate ${ur ? cls('md') : 'text-[15px] font-extrabold'}`}>{i.label}</span>{i.imei ? <span className="num text-xs text-muted" dir="ltr">{i.imei}</span> : null}</span>
            {i.device_id ? link(`/stock/${i.device_id}`, pick('ret.d.open')) : null}
          </div>
          <KV k={sale ? 'ret.d.soldFor' : 'ret.d.boughtFor'} v={<span className="num" dir="ltr">{rs(i.price)}</span>} />
          {showCost && i.cost != null ? <KV k="ret.d.cost" v={<span className="num" dir="ltr">{rs(i.cost)}</span>} /> : null}
          {i.status_now ? <KV k="ret.d.now" v={<Chip text={`stock.status.${i.status_now}`} tone={i.status_now === 'in_stock' ? 'ok' : i.status_now === 'sold' ? 'ink' : 'warn'} />} /> : null}
          {i.sold_again ? <KV k="ret.d.again" v={<span dir="ltr"><span className="num">{rs(i.sold_again.price)}</span> · {fmtDate(i.sold_again.date)}</span>} /> : null}
          {i.sold_again?.profit != null ? <KV k="ret.d.againProfit" v={<MoneyText value={i.sold_again.profit} tone="auto" size="sm" signed />} /> : null}
        </div>
      ))}

      <div className="card flex flex-col divide-y divide-line py-1">
        <KV k="ret.t.amount" v={<span className="num" dir="ltr">{rs(r.amount)}</span>} />
        <KV k={sale ? 'ret.t.refund' : 'ret.t.refundGot'} v={<span dir="ltr"><span className="num">{rs(r.refund)}</span>{r.refund_account && Number(r.refund) ? ` · ${r.refund_account}` : ''}</span>} />
        <KV k={sale ? 'ret.t.kept' : 'ret.t.cutLost'} v={<span className="num" dir="ltr">{rs(r.kept)}</span>} help="cut" />
        <KV k="ret.t.toKhata" v={<span className="num" dir="ltr">{rs(r.to_khata)}</span>} />
        {showCost && sale ? <KV k="ret.t.undone" v={<span className="num" dir="ltr">{rs(r.profit_undone)}</span>} /> : null}
        {showCost ? <KV k="ret.t.net" v={<MoneyText value={r.net} tone="auto" size="sm" signed />} help="ret.net" /> : null}
      </div>

      {manage ? (
        <div className="flex flex-col gap-2" data-testid="ret-fix-actions">
          {sale ? <BiButton text="ret.x.edit" size="md" variant="secondary" full onClick={() => nav(`/return/new?replace=${r.id}`)} data-testid="ret-edit" /> : <BiLabel text="ret.x.undoHint" size="sm" tone="text-muted" />}
          {!editing ? <BiButton text="ret.x.editReason" size="md" variant="ghost" full onClick={() => setEditing(true)} data-testid="ret-edit-reason" /> : (
            <div className="card flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {codes.map((k) => <button key={k} type="button" aria-pressed={code === k} onClick={() => setCode(code === k ? null : k)} data-testid={`fix-why-${k}`} className={`tap min-h-10 rounded-full border-2 px-3.5 ${ur ? cls('sm') : 'text-sm font-bold'} ${code === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{pick(`ret.reason.${k}`)}</button>)}
              </div>
              <BiInput label="ret.d.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              <ErrorText error={err} />
              <BiButton text="ret.x.saveReason" size="md" full loading={busy} data-testid="ret-save-reason" onClick={async () => { setBusy(true); setErr(null); try { await api('PATCH', `/api/v1/returns/${r.id}`, { reason: note || null, reason_code: code }); onSaved() } catch (e) { setErr(e) } finally { setBusy(false) } }} />
            </div>
          )}
        </div>
      ) : null}

      {r.another_bill ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-tint px-4 py-3 text-emerald-deep" data-testid="ret-another">
          <BiLabel text="ret.t.another" size="sm" bold tone="text-current" />
          {link(`/sales/${r.another_bill.id}`, <span dir="ltr">{r.another_bill.no} · {rs(r.another_bill.total)}</span>)}
        </div>
      ) : null}
    </div>
  )
}
