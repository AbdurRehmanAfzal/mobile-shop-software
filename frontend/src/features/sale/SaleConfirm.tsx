import { Check, KeyRound, ShieldAlert, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText, Sheet } from '@/components/ui'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/** One phone on the bill, as the confirmation shows it (owner 2026-10-30: check before you sell). */
export interface ConfirmLine {
  label: string
  imei: string | null
  asking: number | null
  newAsking: number | null
  sold: number
  cost: number | null
  reason?: string
}

const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * The last screen before a sale becomes a bill: every phone with its cost (owner/manager only), the
 * asking price, a revised asking price when the seller changed it, the sold price and the profit.
 * Selling under the asking price or changing it is flagged here, and when the shop's rule asks for the
 * owner's PIN (409 pin_required / 403 pin_wrong) the PIN box appears in place.
 */
export default function SaleConfirm({
  open,
  onClose,
  lines,
  misc,
  total,
  paid,
  partyName,
  onConfirm,
  error,
}: {
  open: boolean
  onClose: () => void
  lines: ConfirmLine[]
  misc: number
  total: number
  paid: number
  partyName: string | null
  onConfirm: (pin: string | null) => Promise<void> | void
  error: unknown
}) {
  const { pick, ur, cls } = useLang()
  const me = useAuth((s) => s.me?.user)
  const canCost = me?.role === 'owner' || me?.role === 'manager'
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) { setPin(''); setBusy(false) }
  }, [open])

  const code = error instanceof ApiError ? error.code : null
  const needPin = code === 'pin_required' || code === 'pin_wrong'
  const blocked = code === 'approval_required'
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const flagged = lines.some((l) => l.newAsking != null || (l.asking != null && l.sold < (l.newAsking ?? l.asking)))

  async function go() {
    setBusy(true)
    try {
      await onConfirm(needPin ? pin : null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="confirm.title">
      <div className="flex flex-col gap-3" data-testid="sale-confirm">
        <BiLabel text="confirm.hint" size="sm" tone="text-muted" />
        {lines.map((l, i) => {
          const askingNow = l.newAsking ?? l.asking
          const under = askingNow != null && l.sold < askingNow
          const profit = l.cost != null ? l.sold - l.cost : null
          return (
            <div key={i} className="card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{l.label}</span>
                  {l.imei ? <span className={`text-muted ${small}`} dir="ltr">{l.imei}</span> : null}
                </span>
                <span className="num text-xl font-bold" dir="ltr">Rs. {n(l.sold)}</span>
              </div>
              <div className={`grid grid-cols-3 gap-2 ${small}`}>
                {canCost ? (
                  <div className="rounded-xl bg-ground px-3 py-2"><BiLabel text="confirm.cost" size="sm" tone="text-muted" /><div className="num" dir="ltr">{l.cost != null ? n(l.cost) : '—'}</div></div>
                ) : null}
                <div className="rounded-xl bg-ground px-3 py-2"><BiLabel text="confirm.asking" size="sm" tone="text-muted" /><div className="num" dir="ltr">{l.asking != null ? n(l.asking) : '—'}</div></div>
                {l.newAsking != null ? (
                  <div className="rounded-xl bg-receivable-tint px-3 py-2 text-receivable"><BiLabel text="confirm.newAsking" size="sm" /><div className="num" dir="ltr">{n(l.newAsking)}</div></div>
                ) : canCost && profit != null ? (
                  <div className={`rounded-xl px-3 py-2 ${profit < 0 ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'}`}><BiLabel text="confirm.profit" size="sm" /><div className="num" dir="ltr">{n(profit)}</div></div>
                ) : null}
              </div>
              {l.newAsking != null ? (
                <div className={`flex items-center gap-1.5 text-receivable ${small}`}>
                  <Tag size={14} />
                  <span dir="auto">{pick('confirm.askingChanged').replace('{{a}}', n(l.asking ?? 0)).replace('{{b}}', n(l.newAsking))}{l.reason ? ` · ${l.reason}` : ''}</span>
                </div>
              ) : null}
              {under ? (
                <div className={`flex items-center gap-1.5 text-payable ${small}`}>
                  <ShieldAlert size={14} />
                  <span dir="auto">{pick('confirm.underAsking').replace('{{n}}', n(askingNow - l.sold))}</span>
                </div>
              ) : null}
              {canCost && l.newAsking != null && profit != null ? (
                <div className={`text-muted ${small}`}>{pick('confirm.profit')} <span className="num" dir="ltr">{n(profit)}</span></div>
              ) : null}
            </div>
          )
        })}
        <div className="card flex flex-col gap-1.5">
          {misc > 0 ? <div className={`flex justify-between ${small}`}><span>{pick('confirm.items')}</span><span className="num" dir="ltr">{n(misc)}</span></div> : null}
          {partyName ? <div className={`flex justify-between ${small}`}><span>{pick('party.one')}</span><span>{partyName}</span></div> : null}
          <div className="flex items-center justify-between"><BiLabel text="common.total" size="md" bold /><span className="num text-2xl font-bold" dir="ltr">Rs. {n(total)}</span></div>
          <div className={`flex justify-between ${small}`}><span>{pick('confirm.paidNow')}</span><span className="num" dir="ltr">{n(paid)}</span></div>
          {me ? <div className={`flex justify-between text-muted ${small}`}><span>{pick('confirm.soldBy')}</span><span>{me.name}</span></div> : null}
        </div>
        {flagged ? <BiLabel text="confirm.flagsNote" size="sm" tone="text-muted" /> : null}
        {blocked ? <BiAlert text="confirm.blocked" /> : null}
        {needPin ? (
          <BiInput
            label="confirm.ownerPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            error={code === 'pin_wrong' ? 'confirm.pinWrong' : 'confirm.pinNeeded'}
            className="num tracking-[.3em]"
          />
        ) : error && !blocked ? <ErrorText error={error} /> : null}
        {!blocked ? (
          <BiButton
            text={needPin ? 'confirm.withPin' : 'confirm.go'}
            icon={needPin ? <KeyRound size={22} /> : <Check size={22} />}
            full
            loading={busy}
            disabled={needPin && pin.length < 4}
            onClick={() => void go()}
          />
        ) : null}
      </div>
    </Sheet>
  )
}
