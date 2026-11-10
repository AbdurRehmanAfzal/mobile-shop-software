import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, ErrorText, KV, List, Loading, MoneyText, PageHeader, Row, Sheet, fmtDate, fmtDateTime } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useDocMutation, usePayments, usePurchase, usePurchases, useReturns } from '@/lib/queries'
import type { Party, Purchase, ReturnDoc } from '@/lib/types'
import PartyPicker from '@/components/PartyPicker'

export function PurchasesPage() {
  const nav = useNavigate()
  const { data, isLoading } = usePurchases()
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="more.purchases" help={<Help term="more.tile.purchases" />} right={<DownloadButton path="/api/v1/exports/purchases" name="purchases" />} />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="common.nothingFound" /> : (
        <List>
          {data.map((p) => (
            <Row key={p.id} title={p.party_name} sub={<span className="flex items-center gap-1.5"><span dir="ltr">{p.no}</span> · <span dir="ltr">{fmtDate(p.date)}</span> <Chip text={`purchase.${p.kind === 'walk_in' ? 'walkIn' : p.kind === 'trade_in' ? 'tradeIn' : p.kind}`} />{p.status === 'voided' ? <Chip text="sale.status.void" tone="muted" /> : null}</span>} right={<div className="flex flex-col items-end"><MoneyText value={p.total} tone="ink" />{Number(p.balance_due) > 0 ? <MoneyText value={-Number(p.balance_due)} size="sm" /> : null}</div>} onClick={() => nav(`/purchases/${p.id}`)} />
          ))}
        </List>
      )}
    </div>
  )
}

export function PurchaseDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const role = useAuth((s) => s.me?.user.role)
  const { data: p, isLoading } = usePurchase(id)
  const [returning, setReturning] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [refund, setRefund] = useState('')
  const [reason, setReason] = useState('')
  const ret = useDocMutation<Record<string, unknown>, ReturnDoc>('POST', () => '/api/v1/returns/purchase')
  const voidM = useDocMutation<{ reason: string }, Purchase>('POST', () => `/api/v1/purchases/${id}/void`)
  // owner 2026-11-09 (ADR-056): the wrong dealer / customer was picked
  // opened from a phone's page with ?change=1: the change sheet opens by itself
  const [moving, setMoving] = useState(() => new URLSearchParams(window.location.search).get('change') === '1')
  const [to, setTo] = useState<Party | null>(null)
  const move = useDocMutation<{ party_id: string; reason: string }, Purchase>('POST', () => `/api/v1/purchases/${id}/party`)
  if (isLoading || !p) return <Loading />
  const canManage = role === 'owner' || role === 'manager'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={{ en: p.no, ur: p.no }} help={<Help term="more.purchaseDoc" />} right={p.status === 'voided' ? <Chip text="sale.status.void" tone="muted" /> : null} />
      <div className="card">
        <KV k="purchase.steps.from" v={<button type="button" className="text-emerald" onClick={() => nav(`/parties/${p.party_id}`)}>{p.party_name}</button>} help="more.purchaseFrom" />
        <KV k="common.date" v={<span dir="ltr">{p.purchased_at ? fmtDateTime(p.purchased_at) : fmtDate(p.date)}</span>} help="common.date" />
        {p.created_by_name ? <KV k="counter.addedBy" v={p.created_by_name} help="more.addedBy" /> : null}
      </div>
      <List>
        {p.lines.map((l) => (
          <Row key={l.id} title={<span className={l.returned_at ? 'line-through opacity-60' : ''}>{l.device_label ?? l.description}</span>} sub={l.imei1 ? <span dir="ltr">{l.imei1}</span> : <span dir="ltr">× {l.qty}</span>} right={<MoneyText value={l.net_cost} tone="ink" />} onClick={l.device_id ? () => nav(`/stock/${l.device_id}`) : undefined} />
        ))}
      </List>
      <div className="hero flex flex-col gap-1 p-4">
        <KV k="common.total" v={<MoneyText value={p.total} tone="ink" />} help="more.purchaseTotal" />
        <KV k="common.paid" v={<MoneyText value={p.paid} tone="ink" />} help="more.purchasePaid" />
        {Number(p.returned_total) > 0 ? <KV k="sale.return" v={<MoneyText value={-Number(p.returned_total)} tone="ink" />} help="more.purchaseReturned" /> : null}
        <div className="mt-1 flex items-center justify-between border-t border-white/15 pt-2">
          <span className="flex items-center gap-1 [&_button]:text-gold-text"><BiLabel text="common.due" size="md" tone="text-gold-text" bold /><Help term="more.purchaseDue" size="sm" /></span>
          <MoneyText value={p.balance_due} tone="ink" size="lg" />
        </div>
      </div>
      {p.status === 'posted' ? (
        <div className="grid grid-cols-2 gap-2">
          <BiButton text="sale.return" size="md" variant="secondary" onClick={() => { setSelected(p.lines.filter((l) => !l.returned_at).map((l) => l.id)); setReturning(true) }} />
          {canManage ? <BiButton text="common.void" size="md" variant="danger" onClick={() => setVoiding(true)} /> : null}
          {canManage ? <div className="col-span-2 flex items-center gap-1"><div className="flex-1"><BiButton text="purchase.fix.partyButton" size="md" variant="secondary" full onClick={() => { setTo(null); setReason(''); move.reset(); setMoving(true) }} data-testid="purchase-party-change" /></div><Help term="purchase.fixParty" size="sm" /></div> : null}
        </div>
      ) : null}
      <Sheet open={moving} onClose={() => setMoving(false)} title="purchase.fix.partyTitle">
        <div className="flex flex-col gap-3">
          <BiLabel text="purchase.fix.partyHint" size="sm" tone="text-muted" />
          <PartyPicker value={to} onChange={setTo} kind={p.kind === 'supplier' ? 'supplier' : p.kind === 'shop' ? 'shop' : 'customer'} label="purchase.fix.partyNew" />
          <BiInput label="common.reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} help={<Help term="purchase.fixReason" size="sm" />} />
          <ErrorText error={move.error} />
          <BiButton text="common.save" full loading={move.isPending} disabled={!to || to.id === p.party_id || reason.trim().length < 2} onClick={async () => { await move.mutateAsync({ party_id: to!.id, reason: reason.trim() }); setMoving(false) }} data-testid="purchase-party-save" />
        </div>
      </Sheet>
      <Sheet open={returning} onClose={() => setReturning(false)} title="sale.return">
        <div className="flex flex-col gap-3">
          {p.lines.filter((l) => !l.returned_at).map((l) => (
            <label key={l.id} className="card flex items-center gap-3">
              <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} className="h-6 w-6 accent-[#136F56]" />
              <span className="flex-1 text-sm font-semibold">{l.device_label ?? l.description}</span>
              <MoneyText value={l.net_cost} tone="ink" size="sm" />
            </label>
          ))}
          <BiInput label="sale.refundAmount" type="number" inputMode="decimal" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} help={<Help term="more.purchaseRefund" size="sm" />} />
          <BiInput label="common.reason" value={reason} onChange={(e) => setReason(e.target.value)} help={<Help term="more.returnReason" size="sm" />} />
          <ErrorText error={ret.error} />
          <BiButton text="common.confirm" full loading={ret.isPending} disabled={!selected.length} onClick={async () => { await ret.mutateAsync({ purchase_id: p.id, line_ids: selected, refund_amount: Number(refund || 0), reason: reason || undefined }); setReturning(false) }} />
        </div>
      </Sheet>
      <Sheet open={voiding} onClose={() => setVoiding(false)} title="common.void">
        <div className="flex flex-col gap-3">
          <BiInput label="common.reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} autoFocus help={<Help term="void" size="sm" />} />
          <ErrorText error={voidM.error} />
          <BiButton text="common.confirm" variant="danger" full loading={voidM.isPending} disabled={reason.trim().length < 3} onClick={async () => { await voidM.mutateAsync({ reason }); setVoiding(false) }} />
        </div>
      </Sheet>
    </div>
  )
}

export function PaymentsPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const { data, isLoading } = usePayments()
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="more.payments" help={<Help term="more.tile.payments" />} />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="common.nothingFound" /> : (
        <List>
          {data.map((p) => (
            <Row key={p.id} title={p.party_name} sub={<span className="flex items-center gap-1.5"><span dir="ltr">{p.no}</span> · <span dir="ltr">{fmtDate(p.date)}</span> · {pick(`pay.${p.method}`)}{p.status === 'voided' ? <Chip text="sale.status.void" tone="muted" /> : null}</span>} right={<MoneyText value={p.direction === 'in' ? p.amount : -Number(p.amount)} />} onClick={() => nav(`/parties/${p.party_id}`)} />
          ))}
        </List>
      )}
    </div>
  )
}

export function ReturnsPage() {
  const { pick } = useLang()
  const { data, isLoading } = useReturns()
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="more.returns" help={<Help term="more.tile.returns" />} />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="common.nothingFound" /> : (
        <List>
          {data.map((r) => (
            <Row key={r.id} title={r.party_name} sub={<span className="flex items-center gap-1.5"><span dir="ltr">{r.no}</span> · <span dir="ltr">{r.document_no}</span> · <span dir="ltr">{fmtDate(r.date)}</span> <Chip text={r.kind === 'sale' ? 'nav.sale' : 'dashboard.newPurchase'} /> <Chip text={`sale.${r.settlement}`} tone="muted" /></span>} right={<MoneyText value={r.amount} tone="ink" />} />
          ))}
        </List>
      )}
      <div className="hidden">{pick('common.none')}</div>
    </div>
  )
}
