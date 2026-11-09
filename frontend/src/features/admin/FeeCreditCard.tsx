/** Super admin, one shop (owner 2026-11-09, ADR-053): give the package now and take the fee later
 *  (agreed by word with the customer). Only the provider sees this card and its notes; the shop
 *  sees the fee as unpaid / part paid / paid on its fees page and on the fee invoice. */

import { CalendarClock, Lock, MessageCircle, Printer } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, ErrorText, MoneyText, fmtDate } from '@/components/ui'
import { openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

export interface Due { id: string; invoice_no: string; months: number; amount: string; paid: string; left: string; status: 'unpaid' | 'partial' | 'paid'; period_from: string | null; period_to: string | null; due_on: string | null; overdue: boolean; note?: string | null }
export interface Dues { rows: Due[]; total: string; paid: string; left: string }

const rs = (v: string | number) => withCur(Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
export const dueTone = (s: Due['status']) => (s === 'paid' ? 'ok' : s === 'partial' ? 'warn' : 'bad')

interface ShopLite { id: string; name: string; owner_phone: string | null; monthly_fee: string }

export default function FeeCreditCard<S extends ShopLite>({ shop, onSaved }: { shop: S; onSaved: (s: S) => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const fee = Number(shop.monthly_fee) || 0
  const [f, setF] = useState({ months: '1', amount: '', due_on: '', note: '' })
  const amount = f.amount === '' && fee ? String(fee * Math.max(1, Number(f.months) || 1)) : f.amount
  const { data: dues, refetch } = useGet<Dues>(['fee-dues', shop.id], `/api/v1/admin/shops/${shop.id}/fee-dues`)
  const give = useDocMutation<Record<string, unknown>, S>('POST', () => `/api/v1/admin/shops/${shop.id}/credit`)
  const small = ur ? cls('sm') : 'text-xs'
  const left = Number(dues?.left ?? 0)

  const waText = pick('admin.credit.waText')
    .replace('{{shop}}', shop.name)
    .replace('{{total}}', rs(dues?.total ?? 0))
    .replace('{{paid}}', rs(dues?.paid ?? 0))
    .replace('{{left}}', rs(left))
  const wa = `https://wa.me/92${(shop.owner_phone ?? '').replace(/^0/, '')}?text=${encodeURIComponent(waText)}`

  return (
    <div className="flex flex-col gap-3" data-testid="fee-credit">
      <span className="mt-2 flex items-center gap-1"><BiLabel text="admin.credit.title" size="md" bold /><Help term="admin.credit" size="sm" /></span>
      <span className="flex items-start gap-1.5"><Lock size={14} className="mt-0.5 shrink-0 text-muted" /><BiLabel text="admin.credit.hint" size="sm" tone="text-muted" /></span>
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="fees.months" help={<Help term="admin.credit.months" size="sm" />} type="number" inputMode="numeric" min={1} max={36} value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} className="num" data-testid="credit-months" />
        <BiInput label="fees.amount" help={<Help term="admin.credit.amount" size="sm" />} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="num" data-testid="credit-amount" />
      </div>
      <BiInput label="admin.credit.dueOn" help={<Help term="admin.credit.dueOn" size="sm" />} type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} dir="ltr" />
      <BiInput label="admin.credit.note" help={<Help term="admin.credit.note" size="sm" />} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} data-testid="credit-note" />
      <ErrorText error={give.error} />
      <BiButton
        text="admin.credit.give"
        icon={<CalendarClock size={20} />}
        variant="secondary"
        full
        disabled={!(Number(f.months) >= 1) || !Number(amount)}
        loading={give.isPending}
        onClick={async () => {
          const r = await give.mutateAsync({ months: Number(f.months), amount: Number(amount), due_on: f.due_on || null, note: f.note || null })
          onSaved(r)
          setF({ months: '1', amount: '', due_on: '', note: '' })
          void refetch()
          inv('admin-shops', 'prov-overview', 'prov-shops')
        }}
        data-testid="credit-give"
      />
      {give.isSuccess ? <BiAlert text="admin.credit.given" kind="success" /> : null}

      {dues?.rows.length ? (
        <div className="flex flex-col gap-2" data-testid="fee-dues">
          <span className="flex items-center gap-1"><BiLabel text="admin.credit.list" size="md" bold /><Help term="admin.credit.list" size="sm" /></span>
          <div className="card divide-y divide-line p-0">
            {dues.rows.map((d) => (
              <div key={d.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="num text-sm font-bold" dir="ltr">{d.invoice_no}</span><span className="num whitespace-nowrap text-xs text-muted" dir="ltr">{d.period_from ? fmtDate(d.period_from) : '—'} – {d.period_to ? fmtDate(d.period_to) : '—'}</span></span>
                  <Chip text={`fees.due.${d.status}`} tone={dueTone(d.status)} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted">{d.months} {pick(d.months === 1 ? 'admin.month' : 'admin.months')}</span>
                  <span className="flex-1" />
                  <MoneyText value={d.amount} tone="ink" size="sm" />
                  {Number(d.paid) ? <span className="text-muted"><span className={small}>{pick('fees.due.paidPart')} </span><MoneyText value={d.paid} tone="muted" size="sm" /></span> : null}
                </div>
                {d.due_on && d.status !== 'paid' ? <span className={`${d.overdue ? 'font-bold text-payable' : 'text-muted'} ${small}`}>{pick(d.overdue ? 'fees.due.overdue' : 'fees.due.promised')} <span className="num" dir="ltr">{fmtDate(d.due_on)}</span></span> : null}
                {d.note ? <span className={`flex items-center gap-1 text-muted ${small}`}><Lock size={12} className="shrink-0" />{d.note}</span> : null}
              </div>
            ))}
          </div>
          <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${left > 0 ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`}>
            <BiLabel text={left > 0 ? 'fees.due.left' : 'fees.due.allPaid'} size="sm" bold tone="text-current" />
            {left > 0 ? <span className="num text-lg font-extrabold" dir="ltr" data-testid="credit-left">{rs(left)}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void openPrintable(`/api/v1/admin/shops/${shop.id}/fee-invoice`)} className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line font-bold"><Printer size={18} /> {pick('fees.due.invoice')}</button>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald font-bold text-white" data-testid="credit-wa"><MessageCircle size={18} /> {pick('admin.credit.send')}</a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
