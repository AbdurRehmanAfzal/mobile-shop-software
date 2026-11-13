/** Owner 2026-11-13 (ADR-067): what was paid AT a purchase was entered wrong (e.g. "paid in full in
 *  cash" for a bill that came on udhaar). The difference moves between the money account and the
 *  seller's khata; the phones are not touched, so it works after they are sold too. */

import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PayPicker, { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { ErrorText, MoneyText, Sheet } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useDocMutation, useGet } from '@/lib/queries'
import type { Purchase } from '@/lib/types'

interface Info { paid_at_purchase: string; paid_later: string; max_at_purchase: string }

export default function PaidFixSheet({ p, open, onClose }: { p: Purchase; open: boolean; onClose: () => void }) {
  const { pick } = useLang()
  const { data: info } = useGet<Info>(['purchase-paid', p.id, p.paid], open ? `/api/v1/purchases/${p.id}/paid` : null)
  const [amount, setAmount] = useState('')
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [due, setDue] = useState('')
  const [why, setWhy] = useState('')
  const m = useDocMutation<Record<string, unknown>, Purchase>('POST', () => `/api/v1/purchases/${p.id}/paid`)
  useEffect(() => { if (open) { setAmount(''); setPay(newPay()); setDue(''); setWhy(''); m.reset() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = info ? Number(info.paid_at_purchase) : 0
  const max = info ? Number(info.max_at_purchase) : 0
  const later = info ? Number(info.paid_later) : 0
  const val = amount === '' ? null : Number(amount)
  const diff = val == null ? 0 : val - now
  const ok = info && val != null && val >= 0 && val <= max && diff !== 0 && why.trim().length >= 2 && (diff < 0 || payReady(pay))
  const n = (x: number) => withCur(Math.abs(x).toLocaleString('en-US'))
  const who = p.party_name ?? ''
  const chip = (on: boolean) => `tap min-h-11 rounded-2xl border-2 px-3 text-sm font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`
  return (
    <Sheet open={open} onClose={onClose} title="purchase.paidFix.title">
      <div className="flex flex-col gap-3" data-testid="paid-fix-sheet">
        <span className="flex items-center gap-1"><BiLabel text="purchase.paidFix.hint" size="sm" tone="text-muted" /><Help term="purchase.paidFix" size="sm" /></span>
        <div className="card flex flex-col gap-1.5">
          <div className="flex justify-between text-sm"><BiLabel text="common.total" size="sm" tone="text-muted" /><MoneyText value={p.total} tone="ink" size="sm" /></div>
          <div className="flex justify-between text-sm"><BiLabel text="purchase.paidFix.atPurchase" size="sm" tone="text-muted" /><MoneyText value={now} tone="ink" size="sm" /></div>
          {later > 0 ? <div className="flex justify-between text-sm"><BiLabel text="purchase.paidFix.later" size="sm" tone="text-muted" /><MoneyText value={later} tone="ink" size="sm" /></div> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={val === 0} onClick={() => setAmount('0')} className={chip(val === 0)} data-testid="paid-fix-none">{pick('purchase.paidFix.allUdhaar')}</button>
          <button type="button" aria-pressed={val === max} onClick={() => setAmount(String(max))} className={chip(val === max)} data-testid="paid-fix-full">{pick('purchase.paidFix.full')}</button>
        </div>
        <BiInput label="purchase.paidFix.new" help={<Help term="purchase.paidFix" size="sm" />} type="number" inputMode="numeric" min={0} max={max} value={amount} onChange={(e) => setAmount(e.target.value)} className="num" data-testid="paid-fix-amount" />
        {diff !== 0 ? (
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${diff < 0 ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`} data-testid="paid-fix-effect">
            {pick(diff < 0 ? 'purchase.paidFix.effectLess' : 'purchase.paidFix.effectMore').replace(/\{\{n\}\}/g, n(diff)).replace('{{who}}', who)}
          </div>
        ) : null}
        {diff > 0 ? (
          <div className="flex flex-col gap-2">
            <BiLabel text="purchase.paidFix.how" size="md" bold />
            <PayPicker value={pay.method === 'udhaar' ? newPay() : pay} onChange={setPay} udhaar={false} />
          </div>
        ) : null}
        {val != null && val < max ? <BiInput label="counter.promiseDateBuy" help={<Help term="purchase.dueDate" size="sm" />} type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" /> : null}
        <BiInput label="common.reason" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} help={<Help term="purchase.fixReason" size="sm" />} />
        <ErrorText error={m.error} />
        <BiButton
          text="common.save"
          full
          loading={m.isPending}
          disabled={!ok}
          onClick={async () => {
            await m.mutateAsync({ paid_now: val, payment: diff > 0 ? payInfo(pay) : undefined, due_date: due || undefined, reason: why.trim() })
            onClose()
          }}
          data-testid="paid-fix-save"
        />
      </div>
    </Sheet>
  )
}
