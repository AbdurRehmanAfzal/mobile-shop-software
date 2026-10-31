/** Shop Audit → Bills (docs/16 §12, docs/17 P7-3): every document of the period by kind, status
 *  and employee, and everything that was voided — each row opens the document. */

import { FileText, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Loading, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
interface Audit { by_kind: { kind: string; count: number; amount: M | null; voided: number }[]; by_status: { status: string; count: number; amount: M; due: M }[]; by_user: { user_name: string | null; sales: number; sales_amount: M; purchases: number; payments: number; voids: number }[]; voided: { kind: string; id: string; no: string; date: string; amount: M | null; by: string | null; reason: string | null }[]; totals: { documents: number; voided: number } }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const KIND_LINK: Record<string, string> = { sale: 'kind=sale', purchase: 'kind=purchase', sale_return: 'kind=return', purchase_return: 'kind=return', payment_in: '', payment_out: '' }

export default function InvoiceAuditPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const { data, isLoading } = useGet<Audit>(['audit-invoices', query], `/api/v1/shop-audit/invoices?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const range = period.preset === 'custom' ? `&from=${period.from}&to=${period.to}` : ''
  const open = (kind: string, id: string) => (kind === 'sale' ? `/sales/${id}` : kind === 'purchase' ? `/purchases/${id}` : '/payments')
  return (
    <AuditLayout>
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="flex items-center justify-between rounded-3xl bg-khata px-5 py-4 text-khata-fg" data-testid="bills-total">
            <span className="flex items-center gap-2"><FileText size={20} /><BiLabel text="audit.doc.documents" size="md" bold tone="text-current" /></span>
            <span className="num text-2xl font-bold" dir="ltr">{data.totals.documents}</span>
          </section>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" data-testid="bills-kinds">
            {data.by_kind.filter((k) => canCost || !['purchase', 'purchase_return', 'payment_out'].includes(k.kind)).map((k) => (
              <Link key={k.kind} to={k.kind.startsWith('payment') ? '/payments' : `/invoices?${KIND_LINK[k.kind]}${range}`} className="card tap flex min-w-0 flex-col gap-1">
                <BiLabel text={`audit.doc.k.${k.kind}`} size="sm" tone="text-muted" bold />
                <span className="num text-xl font-bold" dir="ltr">{k.count}</span>
                <span className={`text-muted ${small}`}>{k.amount != null ? <>Rs. <span className="num" dir="ltr">{n(k.amount)}</span></> : null}{k.voided ? <span className="text-payable"> · {k.voided} {pick('audit.doc.voided')}</span> : null}</span>
              </Link>
            ))}
          </div>
          <BiLabel text="audit.doc.byStatus" size="md" bold />
          <div className="card divide-y divide-line p-0" data-testid="bills-status">
            {data.by_status.map((s) => (
              <div key={s.status} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 font-bold">{pick(`inv.state.${s.status}`)}</span>
                <span className={`text-muted ${small}`} dir="ltr">{s.count} · Rs. {n(s.amount)}{Number(s.due) ? ` · ${pick('audit.doc.due')} ${n(s.due)}` : ''}</span>
              </div>
            ))}
          </div>
          <BiLabel text="audit.doc.byUser" size="md" bold />
          <div className="card divide-y divide-line p-0" data-testid="bills-users">
            {data.by_user.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 font-bold">{u.user_name ?? '—'}</span>
                <span className={`text-muted ${small}`}><span className="num">{u.sales}</span> {pick('audit.doc.sales')} · Rs. <span className="num" dir="ltr">{n(u.sales_amount)}</span>{canCost ? <> · <span className="num">{u.purchases}</span> {pick('audit.doc.purchases')}</> : null} · <span className="num">{u.payments}</span> {pick('audit.doc.payments')}{u.voids ? <span className="text-payable"> · <span className="num">{u.voids}</span> {pick('audit.doc.voided')}</span> : null}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2"><Trash2 size={16} className="text-payable" /><BiLabel text="audit.doc.voidedList" size="md" bold /><span className={`text-muted ${small}`}>({data.totals.voided})</span></div>
          {!data.voided.length ? <Empty text="audit.doc.noVoid" /> : (
            <div className="card divide-y divide-line p-0" data-testid="bills-voided">
              {data.voided.map((v, i) => (
                <Link key={i} to={open(v.kind, v.id)} className="tap flex items-center gap-3 px-4 py-2">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{pick(`audit.doc.k.${v.kind}`)} <span className="font-medium text-muted" dir="ltr">· {v.no}</span></span><span className={`text-muted ${small}`}><span dir="ltr">{fmtDate(v.date)}</span>{v.by ? ` · ${v.by}` : ''}{v.reason ? ` · ${v.reason}` : ''}</span></span>
                  <span className="num font-bold line-through opacity-60" dir="ltr">{n(v.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </AuditLayout>
  )
}
