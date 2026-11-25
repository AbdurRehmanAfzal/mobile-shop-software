/** Shop audit → Bills & vouchers in the new product (ADR-134), drawn from mock-up 22's fourth tab:
 *  "Bills & vouchers audit (N documents)" with the voided count, a tile per kind of document (sale
 *  bills, purchase bills, payments in, payments out, customer returns, supplier returns) with its
 *  count, amount and voids; then the sale bills by pay state, by employee and every voided document
 *  with who and why. Every figure is the live audit's `/shop-audit/invoices` (report: `invoices`).
 *  A tile opens that kind's bills (sales & purchases tab) or the master ledger. */

import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame, periodSearch } from './Audit'
import { SectionReport, Table, Wait, card, n, type M } from '../auditKit'

interface Audit { by_kind: { kind: string; count: number; amount: M | null; voided: number }[]; by_status: { status: string; count: number; amount: M; due: M }[]; by_user: { user_name: string | null; sales: number; sales_amount: M; purchases: number; payments: number; voids: number }[]; voided: { kind: string; id: string; no: string; date: string; amount: M | null; by: string | null; reason: string | null }[]; totals: { documents: number; voided: number } }
const SALE_STATE: Record<string, string> = { open: 'audit.trade.st.unpaid', partially_paid: 'audit.trade.st.partial', paid: 'audit.trade.st.paid', returned: 'audit.trade.st.returned' }
const TONE: Record<string, string> = { sale: 'text-emerald-600', payment_in: 'text-emerald-600', payment_out: 'text-rose-600', purchase: '', sale_return: 'text-slate-500', purchase_return: 'text-slate-500' }

export default function NewAuditBills() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const search = periodSearch(useLocation().search)
  const canCost = ['owner', 'manager'].includes(useAuth((s) => s.me?.user.role) ?? '')
  const { data } = useGet<Audit>(['audit-invoices', query], `/api/v1/shop-audit/invoices?${query}`)
  const go = (k: string) => (k === 'sale' ? `/new/audit/sales${search}${search ? '&' : '?'}view=bills` : k === 'purchase' ? `/new/audit/sales${search}${search ? '&' : '?'}side=purchases&view=bills` : k === 'sale_return' || k === 'purchase_return' ? `/new/audit/returns${search}` : `/new/audit/ledger${search}`)
  return (
    <AuditFrame section="bills" testid="nbil">
      {!data ? <Wait /> : (
        <>
          <section className={`p-5 space-y-4 ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-display font-extrabold text-base">{pick('nau.bil.title')} (<span dir="ltr">{data.totals.documents}</span>)</h3><p className="text-xs text-slate-500">{pick('nau.bil.hint')}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${data.totals.voided ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'}`} data-testid="nbil-voided">{data.totals.voided ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}<span dir="ltr">{data.totals.voided}</span> {pick('nau.bil.voidedDocs')}</span>
                <SectionReport sections={['invoices']} name="invoice-audit" testid="nbil-report" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs" data-testid="nbil-kinds">
              {data.by_kind.map((k) => (
                <Link key={k.kind} to={go(k.kind)} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 hover:border-[#A3E635]" data-testid={`nbil-k-${k.kind}`}>
                  <div className="text-slate-400 font-bold">{pick(`audit.doc.k.${k.kind}`)}</div>
                  <div className="font-display font-extrabold text-xl mt-1" dir="ltr">{k.count}</div>
                  <div className={`font-semibold mt-0.5 ${TONE[k.kind] ?? ''}`} dir="ltr">{k.amount != null ? withCur(n(k.amount)) : '—'}</div>
                  {k.voided ? <div className="text-[10px] text-rose-600 mt-0.5"><span dir="ltr">{k.voided}</span> {pick('audit.doc.voided')}</div> : null}
                </Link>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nbil-status">
              <h3 className="font-display font-extrabold text-sm">{pick('audit.doc.byStatus')}</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.by_status.map((s) => <div key={s.status} className="py-2 flex items-center justify-between gap-2"><span className="font-bold">{pick(SALE_STATE[s.status] ?? `inv.state.${s.status}`)}</span><span className="text-slate-500" dir="ltr">{s.count} · {withCur(n(s.amount))}{Number(s.due) ? <span className="text-rose-600"> · {pick('audit.doc.due')} {n(s.due)}</span> : null}</span></div>)}</div>
            </section>
            <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nbil-users">
              <h3 className="font-display font-extrabold text-sm">{pick('audit.doc.byUser')}</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.by_user.map((u, i) => <div key={i} className="py-2 flex flex-wrap items-center justify-between gap-2"><span className="font-bold" dir="auto">{u.user_name ?? '—'}</span><span className="text-slate-500"><span dir="ltr">{u.sales}</span> {pick('audit.doc.sales')} · <span dir="ltr">{withCur(n(u.sales_amount))}</span>{canCost ? <> · <span dir="ltr">{u.purchases}</span> {pick('audit.doc.purchases')}</> : null} · <span dir="ltr">{u.payments}</span> {pick('audit.doc.payments')}{u.voids ? <span className="text-rose-600"> · <span dir="ltr">{u.voids}</span> {pick('audit.doc.voided')}</span> : null}</span></div>)}</div>
            </section>
          </div>

          <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nbil-voided-list">
            <h3 className="font-display font-extrabold text-sm">{pick('audit.doc.voidedList')}</h3>
            {!data.voided.length ? <p className="text-xs text-emerald-600 font-bold">{pick('audit.doc.noVoid')}</p> : (
              <Table head={[pick('nau.bil.doc'), pick('common.date'), pick('nau.sa.byWhom'), pick('common.reason'), pick('nau.sa.amount')]}>
                {data.voided.map((v) => <tr key={v.id}><td className="py-2 px-3 font-bold">{pick(`audit.doc.k.${v.kind}`)} <span className="font-mono text-slate-500" dir="ltr">{v.no}</span></td><td className="py-2 px-3" dir="ltr">{fmtDate(v.date)}</td><td className="py-2 px-3" dir="auto">{v.by ?? '—'}</td><td className="py-2 px-3" dir="auto">{v.reason ?? '—'}</td><td className="py-2 px-3 text-end font-mono font-bold" dir="ltr">{v.amount != null ? n(v.amount) : '—'}</td></tr>)}
              </Table>
            )}
          </section>
        </>
      )}
    </AuditFrame>
  )
}
