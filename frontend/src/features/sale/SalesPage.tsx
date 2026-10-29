import DownloadButton from '@/components/DownloadButton'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import DocLangPicker from '@/components/DocLangPicker'
import Help from '@/components/Help'
import { BtnText, Chip, Empty, ErrorText, fmtDate, KV, List, Loading, MoneyText, PageHeader, Row, Sheet } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useDocMutation, useSale, useSales } from '@/lib/queries'
import type { Invoice, PaymentDetail, ReturnDoc } from '@/lib/types'

const TONE: Record<Invoice['status'], 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { paid: 'ok', partially_paid: 'warn', open: 'bad', returned: 'muted', void: 'muted' }

export function SalesPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [status, setStatus] = useState<'all' | 'open' | 'partially_paid' | 'paid'>('all')
  const { data, isLoading } = useSales({ status: status === 'all' ? undefined : status })
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="more.sales"
        back={false}
        right={
          <div className="flex gap-2">
          <DownloadButton path="/api/v1/exports/sales" name="sales" />
          <button type="button" aria-label={pick('sale.title')} onClick={() => nav('/sale/new')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground">
            <Plus size={22} />
          <BtnText k={'sale.title'} /></button>
          </div>
        }
      />
      <BiSegmented value={status} onChange={setStatus} options={[{ value: 'all', text: 'common.all' }, { value: 'open', text: 'sale.status.open' }, { value: 'partially_paid', text: 'sale.status.partially_paid' }, { value: 'paid', text: 'sale.status.paid' }]} />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty text="common.nothingFound" />
      ) : (
        <List>
          {data.map((inv) => (
            <Row
              key={inv.id}
              title={inv.party_name ?? pick('sale.cashCustomer')}
              sub={
                <span className="flex items-center gap-1.5">
                  <span dir="ltr">{inv.no}</span> · <span dir="ltr">{fmtDate(inv.date)}</span> <Chip text={`sale.status.${inv.status}`} tone={TONE[inv.status]} />
                </span>
              }
              right={
                <div className="flex flex-col items-end">
                  <MoneyText value={inv.total} tone="ink" />
                  {Number(inv.balance_due) > 0 ? <MoneyText value={inv.balance_due} size="sm" /> : null}
                </div>
              }
              onClick={() => nav(`/sales/${inv.id}`)}
            />
          ))}
        </List>
      )}
    </div>
  )
}

export function SaleDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data: inv, isLoading } = useSale(id)
  const [returning, setReturning] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [settlement, setSettlement] = useState<'refund' | 'credit' | 'income'>('refund')
  const ret = useDocMutation<Record<string, unknown>, ReturnDoc>('POST', () => '/api/v1/returns/sale')
  const voidM = useDocMutation<{ reason: string }, Invoice>('POST', () => `/api/v1/sales/${id}/void`)
  if (isLoading || !inv) return <Loading />
  const active = inv.status !== 'void' && inv.status !== 'returned'
  const canManage = role === 'owner' || role === 'manager'

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={{ en: inv.no, ur: inv.no }} right={<Chip text={`sale.status.${inv.status}`} tone={TONE[inv.status]} />} />
      <div className="card">
        <KV k="sale.steps.customer" v={inv.party_name ? <button type="button" className="text-emerald" onClick={() => nav(`/parties/${inv.party_id}`)}>{inv.party_name}</button> : pick('sale.cashCustomer')} />
        <KV k="common.date" v={<span dir="ltr">{fmtDate(inv.date)}</span>} />
        {inv.created_by_name ? <KV k="counter.soldBy" v={inv.created_by_name} /> : null}
        {inv.payment ? <KV k="counter.howPaid" v={<span dir="ltr">{paidBy(inv.payment, pick)}</span>} /> : null}
      </div>
      <List>
        {inv.lines.map((l) => (
          <Row
            key={l.id}
            title={<span className={l.returned_at ? 'line-through opacity-60' : ''}>{l.device_label ?? l.description}</span>}
            sub={
              <span className="flex flex-wrap items-center gap-1.5">
                {l.imei1 ? <span dir="ltr">{l.imei1}</span> : null}
                {l.qty > 1 ? <span dir="ltr">× {l.qty}</span> : null}
                {l.accessories_given.length ? <Chip text={{ en: l.accessories_given.join(', '), ur: l.accessories_given.map((g) => pick(`stock.acc.${g}`)).join('، ') }} tone="ok" /> : null}
                {l.accessories_pending.length ? <Chip text={{ en: `pending: ${l.accessories_pending.map((p) => p.kind).join(', ')}`, ur: `باقی: ${l.accessories_pending.map((p) => pick(`stock.acc.${p.kind}`)).join('، ')}` }} tone="warn" /> : null}
                {l.warranty_days ? <Chip text={{ en: `${l.warranty_days}d warranty`, ur: `${l.warranty_days} دن وارنٹی` }} /> : null}
              </span>
            }
            right={
              <div className="flex flex-col items-end">
                <MoneyText value={l.line_total} tone="ink" />
                {l.profit != null ? <span className="text-[11px] font-bold text-emerald-deep" dir="ltr">+{Number(l.profit).toLocaleString('en-US')}</span> : null}
              </div>
            }
            onClick={l.device_id ? () => nav(`/stock/${l.device_id}`) : undefined}
          />
        ))}
      </List>
      <div className="hero flex flex-col gap-1 p-4">
        <KV k="common.total" v={<MoneyText value={inv.subtotal} tone="ink" />} />
        {Number(inv.discount) > 0 ? <KV k="common.discount" v={<MoneyText value={-Number(inv.discount)} tone="ink" />} /> : null}
        {Number(inv.tax_amount) > 0 ? <KV k="settings.tax" v={<MoneyText value={inv.tax_amount} tone="ink" />} /> : null}
        <KV k="common.total" v={<MoneyText value={inv.total} tone="ink" />} />
        <KV k="common.paid" v={<MoneyText value={inv.paid} tone="ink" />} />
        {Number(inv.returned_total) > 0 ? <KV k="sale.return" v={<MoneyText value={-Number(inv.returned_total)} tone="ink" />} /> : null}
        <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-2">
          <BiLabel text="common.due" size="md" tone="text-gold-text" bold />
          <MoneyText value={inv.balance_due} tone="ink" size="lg" />
        </div>
        {inv.profit != null ? <KV k="dashboard.profit" v={<MoneyText value={inv.profit} tone="ink" />} /> : null}
      </div>
      <DocLangPicker />
      <div className="grid grid-cols-2 gap-2">
        <BiButton text="sale.printThermal" size="md" onClick={() => openPrintable(`/api/v1/sales/${inv.id}/receipt?format=thermal`)} />
        <BiButton text="sale.printA4" size="md" variant="secondary" onClick={() => openPrintable(`/api/v1/sales/${inv.id}/receipt?format=a4`)} />
        {active && inv.party_id ? <BiButton text="sale.return" size="md" variant="secondary" onClick={() => { setSelected(inv.lines.filter((l) => !l.returned_at).map((l) => l.id)); setReturning(true) }} /> : null}
        {active && canManage ? <span className="flex items-center gap-1"><BiButton text="common.void" size="md" variant="danger" onClick={() => setVoiding(true)} /><Help term="void" /></span> : null}
      </div>
      <DocActions path={`/api/v1/sales/${inv.id}/receipt?format=a4`} name={`invoice-${inv.no}`} title={inv.no} picker={false} />

      <Sheet open={returning} onClose={() => setReturning(false)} title="sale.return">
        <div className="flex flex-col gap-3">
          <BiLabel text="sale.selectLines" size="sm" tone="text-muted" />
          {inv.lines.filter((l) => !l.returned_at).map((l) => (
            <label key={l.id} className="card flex items-center gap-3">
              <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} className="h-6 w-6 accent-[#136F56]" />
              <span className="flex-1 text-sm font-semibold">{l.device_label ?? l.description}</span>
              <MoneyText value={l.line_total} tone="ink" size="sm" />
            </label>
          ))}
          <BiLabel text="sale.settlement" size="md" tone="text-muted" />
          <BiSegmented value={settlement} onChange={setSettlement} options={[{ value: 'refund', text: 'sale.refund' }, { value: 'credit', text: 'sale.credit' }, { value: 'income', text: 'sale.income' }]} />
          <BiInput label="common.reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorText error={ret.error} />
          <BiButton text="common.confirm" full loading={ret.isPending} disabled={!selected.length} onClick={async () => { await ret.mutateAsync({ invoice_id: inv.id, line_ids: selected, settlement, reason: reason || undefined }); setReturning(false) }} />
        </div>
      </Sheet>
      <Sheet open={voiding} onClose={() => setVoiding(false)} title="common.void">
        <div className="flex flex-col gap-3">
          <BiInput label="common.reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} autoFocus />
          <ErrorText error={voidM.error} />
          <BiButton text="common.confirm" variant="danger" full loading={voidM.isPending} disabled={reason.trim().length < 3} onClick={async () => { await voidM.mutateAsync({ reason }); setVoiding(false) }} />
        </div>
      </Sheet>
    </div>
  )
}

/** "Online · Meezan Bank · TID 123", "From abroad · 500 SAR × 74.20 · Ahmed Raza" */
function paidBy(p: PaymentDetail, pick: (k: string) => string): string {
  const bits: (string | null)[] =
    p.method === 'remittance'
      ? [pick('paym.remittance'), `${Number(p.foreign_amount).toLocaleString('en-US')} ${p.currency} × ${Number(p.rate)}`, p.service, p.sender_name]
      : [pick(`paym.${p.method}`), p.bank, p.cheque_date]
  if (p.reference) bits.push(p.reference)
  return bits.filter(Boolean).join(' · ')
}
