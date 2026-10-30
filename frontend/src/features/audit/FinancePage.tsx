/** Shop Audit → Finance (docs/16 §3, §4, §10, §11 — docs/17 P4-5): profit & loss with its
 *  series and the period before, cash & bank by reason and channel, remittances, expenses, tax.
 *  Every number is a server figure; tiles and rows open the record behind them. */

import { ArrowDownLeft, ArrowUpRight, Globe, Landmark, Receipt, Wallet } from 'lucide-react'
import i18next from 'i18next'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import { Empty, Loading, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
type Tab = 'pnl' | 'cash' | 'expenses' | 'tax'
interface PnlDict { gross_sales: M; discounts: M; sales_returns: M; net_sales: M; cogs: M; gross_profit: M; operating_expenses: M; operating_profit: M; repair_income: M; other_income: M; net_profit: M; owner_drawing: M; tax_collected: M; expenses: Record<string, M>; total_expenses: M }
interface Pnl { granularity: 'day' | 'week' | 'month'; current: PnlDict; previous: PnlDict; series: { bucket: string; net_sales: M; cogs: M; gross_profit: M; expenses: M; other_income: M; net_profit: M }[]; notes: string[] }
interface Account { cash_account_id: string; name: string; name_ur: string | null; kind: string; opening: M; in: Record<string, M>; out: Record<string, M>; cash_in: M; cash_out: M; transfers_in: M; transfers_out: M; closing: M; as_of: M; current: M }
interface Cash { opening: M; closing: M; as_of: M; current: M; in: Record<string, M>; out: Record<string, M>; in_total: M; out_total: M; in_keys: string[]; out_keys: string[]; accounts: Account[]; by_kind: { kind: string; in: M; out: M; closing: M; accounts: number }[]; payments_by_method: { method: string; in: M; out: M; count: number }[]; notes: string[] }
interface Intl { rows: { date: string; document_type: string; document_id: string; document_no: string; direction: 'in' | 'out'; party_name: string | null; sender_name: string | null; country: string | null; service: string | null; currency: string | null; foreign_amount: M | null; rate: M | null; pkr_amount: M; reference: string | null }[]; total_pkr_in: M; total_pkr_out: M; by_currency: { currency: string; foreign_amount: M; pkr_amount: M; count: number }[]; notes: string[] }
interface Expenses { granularity: string; total: M; owner_drawing: M; count: number; previous_total: M; by_category: { key: string; name: string; name_ur: string | null; amount: M; count: number }[]; previous_by_category: { key: string; amount: M }[]; by_account: { name: string | null; kind: string | null; amount: M; count: number }[]; by_user: { user_name: string | null; amount: M; count: number }[]; series: { bucket: string; amount: M }[]; largest: { id: string; no: string; date: string; amount: M; category_name: string; description: string | null; account: string | null; user_name: string | null; has_receipt: boolean }[]; notes: string[] }
interface Tax { invoices: number; taxed_invoices: number; taxable_sales: M; tax_on_invoices: M; tax_net_of_returns: M; rows: { invoice_id: string; no: string; date: string; party_name: string | null; taxable: M; tax_rate: M; tax_inclusive: boolean; tax_amount: M; total: M; status: string; returned_total: M; fbr_invoice_no: string | null }[]; notes: string[] }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const label = (bucket: string, g: string) => (g === 'month' ? bucket.slice(0, 7) : bucket.slice(5))

export default function FinancePage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const tab = ((['pnl', 'cash', 'expenses', 'tax'] as const).find((t) => t === sp.get('tab')) ?? 'pnl') as Tab
  const setTab = (t: Tab) => { const o = new URLSearchParams(sp); o.set('tab', t); setSp(o, { replace: true }) }
  const { data: pnl } = useGet<Pnl>(['audit-pnl', query], tab === 'pnl' ? `/api/v1/shop-audit/pnl?${query}` : null)
  const { data: cash } = useGet<Cash>(['audit-cash', query], tab === 'cash' ? `/api/v1/shop-audit/cash?${query}` : null)
  const { data: intl } = useGet<Intl>(['audit-intl', query], tab === 'cash' ? `/api/v1/shop-audit/international?${query}` : null)
  const { data: exp } = useGet<Expenses>(['audit-expenses', query], tab === 'expenses' ? `/api/v1/shop-audit/expenses?${query}` : null)
  const { data: tax } = useGet<Tax>(['audit-tax', query], tab === 'tax' ? `/api/v1/shop-audit/tax?${query}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const range = period.preset === 'custom' ? `from=${period.from}&to=${period.to}` : ''
  const pct = (now: M, before: M) => { const a = Number(now), b = Number(before); if (!b) return null; const p = Math.round(((a - b) / Math.abs(b)) * 100); return <span className={`num ${p >= 0 ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{p >= 0 ? '+' : ''}{p}%</span> }
  const payLabel = (k: string) => (i18next.exists(`pay.${k}`) ? pick(`pay.${k}`) : k)
  const reason = (k: string) => (k.startsWith('reversal_of_') ? `${pick('audit.reason.reversal')}: ${pick(`audit.reason.${k.slice(12)}`)}` : pick(`audit.reason.${k}`))
  const pnlBars = useMemo(() => (pnl ? pnl.series.map((s) => ({ label: label(s.bucket, pnl.granularity), value: Number(canCost ? s.net_profit : s.net_sales), hint: canCost ? `${pick('audit.netSales')} ${n(s.net_sales)}` : undefined, key: s.bucket })) : []), [pnl, canCost, pick])

  return (
    <AuditLayout>
      <BiSegmented<Tab> value={tab} onChange={setTab} options={[{ value: 'pnl', text: 'audit.fin.pnl' }, { value: 'cash', text: 'audit.fin.cash' }, { value: 'expenses', text: 'audit.fin.expenses' }, { value: 'tax', text: 'audit.fin.tax' }]} />

      {tab === 'pnl' ? (!pnl ? <Loading /> : (
        <>
          <section className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${Number(canCost ? pnl.current.net_profit : pnl.current.net_sales) >= 0 ? 'bg-sell text-sell-fg' : 'bg-expense text-expense-fg'}`} data-testid="fin-hero">
            <div className="flex items-center justify-between"><BiLabel text={canCost ? 'counter.netProfit' : 'audit.netSales'} size="md" bold tone="text-current" />{pct(canCost ? pnl.current.net_profit : pnl.current.net_sales, canCost ? pnl.previous.net_profit : pnl.previous.net_sales)}</div>
            <span className="num text-[32px] leading-tight" dir="ltr">Rs. {n(canCost ? pnl.current.net_profit : pnl.current.net_sales)}</span>
            <span className={`opacity-80 ${small}`}>{pick('audit.vsPrevious')} <span className="num" dir="ltr">Rs. {n(canCost ? pnl.previous.net_profit : pnl.previous.net_sales)}</span> · {pick(`audit.gran.${pnl.granularity}`)}</span>
          </section>
          <section className="card"><Bars data={pnlBars} testid="fin-series" empty="audit.noData" /></section>
          <div className="card flex flex-col p-0" data-testid="fin-lines">
            <Line k="counter.grossSales" v={n(pnl.current.gross_sales)} prev={n(pnl.previous.gross_sales)} />
            {Number(pnl.current.discounts) || Number(pnl.previous.discounts) ? <Line k="counter.discounts" v={`− ${n(pnl.current.discounts)}`} prev={n(pnl.previous.discounts)} muted /> : null}
            {Number(pnl.current.sales_returns) || Number(pnl.previous.sales_returns) ? <Line k="counter.salesReturns" v={`− ${n(pnl.current.sales_returns)}`} prev={n(pnl.previous.sales_returns)} muted /> : null}
            <Line k="counter.netSales" v={n(pnl.current.net_sales)} prev={n(pnl.previous.net_sales)} strong />
            {canCost ? (
              <>
                <Line k="counter.cogs" v={`− ${n(pnl.current.cogs)}`} prev={n(pnl.previous.cogs)} muted />
                <Line k="counter.grossProfit" v={n(pnl.current.gross_profit)} prev={n(pnl.previous.gross_profit)} strong />
                <Line k="audit.expenses" v={`− ${n(pnl.current.operating_expenses)}`} prev={n(pnl.previous.operating_expenses)} muted />
                <Line k="counter.operatingProfit" v={n(pnl.current.operating_profit)} prev={n(pnl.previous.operating_profit)} />
                {Number(pnl.current.repair_income) + Number(pnl.current.other_income) + Number(pnl.previous.repair_income) + Number(pnl.previous.other_income) ? <Line k="counter.otherIncome" v={`+ ${n(Number(pnl.current.repair_income) + Number(pnl.current.other_income))}`} prev={n(Number(pnl.previous.repair_income) + Number(pnl.previous.other_income))} /> : null}
                <Line k="counter.netProfit" v={n(pnl.current.net_profit)} prev={n(pnl.previous.net_profit)} strong />
              </>
            ) : null}
            <Line k="counter.taxCollected" v={n(pnl.current.tax_collected)} prev={n(pnl.previous.tax_collected)} muted />
            {canCost && Number(pnl.current.owner_drawing) ? <Line k="counter.ownerTook" v={n(pnl.current.owner_drawing)} prev={n(pnl.previous.owner_drawing)} muted /> : null}
          </div>
          <Notes notes={pnl.notes} />
        </>
      )) : null}

      {tab === 'cash' ? (!cash ? <Loading /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="cash-totals">
            <Kpi icon={<Landmark size={18} />} tone="bg-sell text-sell-fg" k="audit.opening" v={n(cash.opening)} />
            <Kpi icon={<ArrowDownLeft size={18} />} tone="bg-emerald-tint text-emerald-deep" k="audit.moneyIn" v={n(cash.in_total)} />
            <Kpi icon={<ArrowUpRight size={18} />} tone="bg-payable-tint text-payable" k="audit.moneyOut" v={n(cash.out_total)} />
            <Kpi icon={<Landmark size={18} />} tone="bg-ink text-ground" k={period.asOf ? 'audit.asOf' : 'audit.closing'} v={n(period.asOf ? cash.as_of : cash.closing)} sub={<>{pick('audit.now')} <span className="num" dir="ltr">{n(cash.current)}</span></>} />
          </section>
          <section className="grid gap-2 sm:grid-cols-2">
            <ReasonCard title="audit.fin.cameIn" keys={cash.in_keys} values={cash.in} total={cash.in_total} tone="text-emerald-deep" reason={reason} />
            <ReasonCard title="audit.fin.wentOut" keys={cash.out_keys} values={cash.out} total={cash.out_total} tone="text-payable" reason={reason} />
          </section>
          <BiLabel text="audit.fin.perAccount" size="md" bold />
          <div className="grid gap-2 sm:grid-cols-2" data-testid="cash-accounts">
            {cash.accounts.map((a) => (
              <Link key={a.cash_account_id} to="/more/cash" className="card tap flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2"><span className="font-bold">{ur && a.name_ur ? a.name_ur : a.name}</span><span className={`rounded-full bg-ground px-2 py-0.5 ${small}`}>{payLabel(a.kind)}</span></div>
                <div className={`flex flex-wrap gap-x-3 ${small}`} dir="ltr"><span>{pick('audit.opening')} {n(a.opening)}</span><span className="text-emerald-deep">+ {n(a.cash_in)}</span><span className="text-payable">− {n(a.cash_out)}</span><span className="font-bold">= {n(a.closing)}</span></div>
                {Number(a.transfers_in) || Number(a.transfers_out) ? <div className={`text-muted ${small}`}>{pick('audit.fin.ofWhichTransfers')} <span className="num" dir="ltr">+{n(a.transfers_in)} / −{n(a.transfers_out)}</span></div> : null}
                <div className={`flex flex-wrap gap-1 ${small}`}>
                  {Object.entries(a.in).filter(([, v]) => Number(v)).map(([k, v]) => <span key={`i${k}`} className="rounded-full bg-emerald-tint px-2 py-0.5 text-emerald-deep">{reason(k)} <span className="num" dir="ltr">{n(v)}</span></span>)}
                  {Object.entries(a.out).filter(([, v]) => Number(v)).map(([k, v]) => <span key={`o${k}`} className="rounded-full bg-payable-tint px-2 py-0.5 text-payable">{reason(k)} <span className="num" dir="ltr">{n(v)}</span></span>)}
                </div>
              </Link>
            ))}
          </div>
          <BiLabel text="audit.fin.channels" size="md" bold />
          <div className="card divide-y divide-line p-0" data-testid="cash-channels">
            {cash.by_kind.map((k) => (
              <div key={k.kind} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 font-bold">{payLabel(k.kind)}</span>
                <span className={small} dir="ltr"><span className="text-emerald-deep">+ {n(k.in)}</span> · <span className="text-payable">− {n(k.out)}</span> · = {n(k.closing)}</span>
              </div>
            ))}
            {cash.payments_by_method.length ? (
              <div className={`px-4 py-2.5 text-muted ${small}`}>{pick('audit.fin.paymentsByMethod')}: {cash.payments_by_method.map((m) => `${payLabel(m.method)} +${n(m.in)} / −${n(m.out)} (${m.count})`).join(' · ')}</div>
            ) : null}
          </div>
          {intl && intl.rows.length ? (
            <>
              <div className="flex items-center gap-2"><Globe size={18} /><BiLabel text="audit.fin.international" size="md" bold /></div>
              <div className={`text-muted ${small}`}>{intl.by_currency.map((c) => `${c.currency} ${n(c.foreign_amount)} → Rs. ${n(c.pkr_amount)} (${c.count})`).join(' · ')}</div>
              <div className="card divide-y divide-line p-0" data-testid="cash-intl">
                {intl.rows.map((r, i) => (
                  <Link key={i} to={r.document_type === 'sale' ? `/sales/${r.document_id}` : r.document_type === 'purchase' ? `/purchases/${r.document_id}` : '/payments'} className="tap flex flex-col gap-0.5 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2"><span className="font-bold">{r.party_name ?? r.sender_name ?? '—'} <span className="font-medium text-muted" dir="ltr">· {r.document_no}</span></span><span className={`num font-bold ${r.direction === 'in' ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{r.direction === 'in' ? '+' : '−'} Rs. {n(r.pkr_amount)}</span></div>
                    <div className={`text-muted ${small}`} dir="auto"><span dir="ltr">{fmtDate(r.date)}</span>{r.currency ? ` · ${r.currency} ${n(r.foreign_amount)} @ ${r.rate}` : ''}{r.service ? ` · ${r.service}` : ''}{r.country ? ` · ${r.country}` : ''}{r.sender_name && r.party_name ? ` · ${r.sender_name}` : ''}{r.reference ? ` · ${r.reference}` : ''}</div>
                  </Link>
                ))}
              </div>
              <Notes notes={intl.notes} />
            </>
          ) : null}
          <Notes notes={cash.notes} />
        </>
      )) : null}

      {tab === 'expenses' ? (!exp ? <Loading /> : (
        <>
          <section className="flex flex-col gap-1 rounded-3xl bg-expense px-5 py-4 text-expense-fg" data-testid="exp-hero">
            <div className="flex items-center justify-between"><BiLabel text="audit.expenses" size="md" bold tone="text-current" />{pct(exp.total, exp.previous_total)}</div>
            <span className="num text-[32px] leading-tight" dir="ltr">Rs. {n(exp.total)}</span>
            <span className={`opacity-80 ${small}`}><span className="num">{exp.count}</span> {pick('audit.fin.entries')} · {pick('audit.vsPrevious')} <span className="num" dir="ltr">{n(exp.previous_total)}</span>{Number(exp.owner_drawing) ? <> · {pick('counter.ownerTook')} <span className="num" dir="ltr">{n(exp.owner_drawing)}</span></> : null}</span>
          </section>
          <section className="card"><Bars data={exp.series.map((s) => ({ label: label(s.bucket, exp.granularity), value: Number(s.amount), key: s.bucket }))} tone="rgb(var(--payable))" testid="exp-series" empty="audit.noData" /></section>
          {exp.by_category.length ? (
            <div className="card divide-y divide-line p-0" data-testid="exp-cats">
              {exp.by_category.map((c) => {
                const prev = exp.previous_by_category.find((x) => x.key === c.key)
                const share = Number(exp.total) ? Math.round((Number(c.amount) / (Number(exp.total) + Number(exp.owner_drawing))) * 100) : 0
                return (
                  <Link key={c.key} to="/expenses" className="tap flex flex-col gap-1 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2"><span className="font-bold">{ur && c.name_ur ? c.name_ur : c.name} <span className="font-medium text-muted">({c.count})</span></span><span className="num font-bold" dir="ltr">{n(c.amount)}</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground"><div className="h-full rounded-full bg-payable" style={{ width: `${share}%` }} /></div>
                    {prev ? <span className={`text-muted ${small}`}>{pick('audit.vsPrevious')} <span className="num" dir="ltr">{n(prev.amount)}</span> {pct(c.amount, prev.amount)}</span> : null}
                  </Link>
                )
              })}
            </div>
          ) : <Empty text="audit.noData" />}
          {exp.largest.length ? (
            <>
              <BiLabel text="audit.fin.largest" size="md" bold />
              <div className="card divide-y divide-line p-0" data-testid="exp-largest">
                {exp.largest.map((e) => (
                  <Link key={e.id} to="/expenses" className="tap flex items-center gap-3 px-4 py-2.5">
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{e.category_name}{e.description ? ` · ${e.description}` : ''}</span><span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(e.date)} · {e.no}</span>{e.user_name ? ` · ${e.user_name}` : ''}{e.account ? ` · ${e.account}` : ''}</span></span>
                    <span className="num font-bold" dir="ltr">{n(e.amount)}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          <div className={`flex flex-wrap gap-x-4 text-muted ${small}`}>
            {exp.by_user.map((u, i) => <span key={i}>{u.user_name ?? '—'}: <span className="num" dir="ltr">{n(u.amount)}</span> ({u.count})</span>)}
            {exp.by_account.map((a, i) => <span key={`a${i}`}>{a.name ?? a.kind}: <span className="num" dir="ltr">{n(a.amount)}</span></span>)}
          </div>
          <Notes notes={exp.notes} />
        </>
      )) : null}

      {tab === 'tax' ? (!tax ? <Loading /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="tax-totals">
            <Kpi icon={<Receipt size={18} />} tone="bg-khata text-khata-fg" k="audit.fin.taxedBills" v={`${tax.taxed_invoices} / ${tax.invoices}`} />
            <Kpi icon={<Receipt size={18} />} tone="bg-ground text-ink" k="audit.fin.taxable" v={n(tax.taxable_sales)} />
            <Kpi icon={<Wallet size={18} />} tone="bg-sell text-sell-fg" k="counter.taxCollected" v={n(tax.tax_on_invoices)} />
            <Kpi icon={<Wallet size={18} />} tone="bg-ink text-ground" k="audit.fin.taxNet" v={n(tax.tax_net_of_returns)} />
          </section>
          {tax.rows.length ? (
            <div className="card divide-y divide-line p-0" data-testid="tax-rows">
              {tax.rows.map((r) => (
                <Link key={r.invoice_id} to={`/sales/${r.invoice_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{r.party_name ?? pick('audit.fin.walkIn')} <span className="font-medium text-muted" dir="ltr">· {r.no}</span></span><span className={`text-muted ${small}`} dir="ltr">{fmtDate(r.date)} · {n(r.taxable)} @ {Number(r.tax_rate)}% {r.tax_inclusive ? pick('audit.fin.inclusive') : pick('audit.fin.exclusive')}{Number(r.returned_total) ? ` · ${pick('counter.salesReturns')} ${n(r.returned_total)}` : ''}</span></span>
                  <span className="num font-bold" dir="ltr">{n(r.tax_amount)}</span>
                </Link>
              ))}
            </div>
          ) : <Empty text="audit.fin.noTax" />}
          <Notes notes={tax.notes} />
        </>
      )) : null}

      {range ? null : <span className="hidden" onClick={() => nav('/audit')} />}
    </AuditLayout>
  )
}

function Line({ k, v, prev, strong, muted }: { k: string; v: string; prev?: string; strong?: boolean; muted?: boolean }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 ${strong ? 'bg-ground/60' : ''}`}>
      <span className={`${ur ? cls('md') : 'text-[15px]'} ${strong ? 'font-bold' : muted ? 'text-muted' : ''}`}>{pick(k)}</span>
      <span className="flex items-baseline gap-2"><span className={`num ${strong ? 'text-xl' : 'text-base'} ${muted ? 'text-muted' : ''}`} dir="ltr">{v}</span>{prev != null ? <span className={`num text-muted ${ur ? cls('sm') : 'text-[11px]'}`} dir="ltr">({prev})</span> : null}</span>
    </div>
  )
}

function Kpi({ icon, tone, k, v, sub }: { icon: React.ReactNode; tone: string; k: string; v: string; sub?: React.ReactNode }) {
  const { ur, cls } = useLang()
  return (
    <div className="card flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span><BiLabel text={k} size="sm" tone="text-muted" bold /></div>
      <span className="num text-xl font-bold" dir="ltr">{v}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span> : null}
    </div>
  )
}

function ReasonCard({ title, keys, values, total, tone, reason }: { title: string; keys: string[]; values: Record<string, string>; total: string; tone: string; reason: (k: string) => string }) {
  const { ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const entries = [...keys.filter((k) => Number(values[k])).map((k) => [k, values[k]] as const), ...Object.entries(values).filter(([k, v]) => !keys.includes(k) && Number(v))]
  return (
    <div className="card flex flex-col gap-1.5" data-testid={`reasons-${title.split('.').pop()}`}>
      <div className="flex items-center justify-between"><BiLabel text={title} size="md" bold /><span className={`num text-lg font-bold ${tone}`} dir="ltr">{n(total)}</span></div>
      {entries.length ? entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2">
          <span className={small}>{reason(k)}</span>
          <span className="flex flex-1 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground"><span className={`block h-full rounded-full ${tone === 'text-payable' ? 'bg-payable' : 'bg-emerald'}`} style={{ width: `${Number(total) ? Math.round((Number(v) / Number(total)) * 100) : 0}%` }} /></span><span className={`num ${small}`} dir="ltr">{n(v)}</span></span>
        </div>
      )) : <span className={`text-muted ${small}`}>—</span>}
    </div>
  )
}

function Notes({ notes }: { notes: string[] }) {
  const { ur, cls } = useLang()
  if (ur) return null // the Urdu notes live in audit.limitations; server notes are English
  return <ul className={`list-disc ps-5 text-muted ${cls('sm')} text-xs`}>{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
}
