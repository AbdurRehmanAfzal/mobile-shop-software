/** Return a bought phone to its seller (owner 2026-11-15, ADR-081): it turned out faulty, or the shop
 *  changed its mind. The purchase stays in the record and the phone's history shows "returned to the
 *  seller". The money is worked out on screen: what the shop still owed on the bill is cancelled,
 *  what it had paid comes back (now, or later in the seller's khata), less any cut the seller keeps.
 *  Example: 50,000 phone, 25,000 paid, 25,000 still owed → returned: the 25,000 owed is gone and the
 *  seller gives the 25,000 back — balance zero. */

import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, MoneyText, Sheet } from '@/components/ui'
import { useCashAccounts, useDocMutation } from '@/lib/queries'
import type { Purchase } from '@/lib/types'

interface ReturnDoc { id: string; no: string; party_balance_after: string | null }
const REASONS = ['faulty', 'notWanted', 'other'] as const

export default function PurchaseReturnSheet({ p, open, onClose, preselect }: { p: Purchase; open: boolean; onClose: () => void; preselect?: string[] }) {
  const { pick, ur, cls } = useLang()
  const open_ = p.lines.filter((l) => !l.returned_at)
  const [selected, setSelected] = useState<string[]>([])
  const [cut, setCut] = useState('')
  const [refund, setRefund] = useState<string | null>(null)
  const [why, setWhy] = useState<(typeof REASONS)[number]>('faulty')
  const [note, setNote] = useState('')
  const [account, setAccount] = useState<string | null>(null)
  const { data: accounts } = useCashAccounts()
  const ret = useDocMutation<Record<string, unknown>, ReturnDoc>('POST', () => '/api/v1/returns/purchase')
  const small = ur ? cls('sm') : 'text-sm'

  useEffect(() => {
    if (open) {
      setSelected(preselect?.length ? preselect : open_.map((l) => l.id))
      setCut(''); setRefund(null); setWhy('faulty'); setNote(''); ret.reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = open_.filter((l) => selected.includes(l.id)).reduce((s, l) => s + Number(l.net_cost), 0)
  const cutN = Math.min(Math.max(0, Number(cut || 0)), value)
  const net = value - cutN // what the seller takes it back for
  const owed = Math.max(0, Number(p.balance_due)) // what the shop still owed on this bill
  const cancelled = Math.min(owed, net)
  const stillOwed = Math.max(0, owed - net)
  const back = Math.max(0, net - owed) // the seller gives this back to the shop
  const give = Math.min(back, refund === null ? back : Math.max(0, Number(refund || 0)))
  const later = back - give
  const accId = account ?? accounts?.find((a) => a.is_default)?.id ?? accounts?.[0]?.id ?? null

  async function save() {
    const reason = [pick(`pret.why.${why}`), note.trim()].filter(Boolean).join(' — ')
    await ret.mutateAsync({ purchase_id: p.id, line_ids: selected, refund_amount: give, cut_amount: cutN, cash_account_id: give > 0 ? accId ?? undefined : undefined, reason, reason_code: why === 'faulty' ? 'fault' : why === 'notWanted' ? 'not_selling' : 'other' })
    onClose()
  }

  const line = (k: string, v: number, tone: 'ink' | 'muted' = 'ink', testid?: string, help?: string) => (
    <div className="flex items-center justify-between gap-2 py-1.5" data-testid={testid}>
      <span className="flex items-center gap-1"><BiLabel text={k} size="sm" tone={tone === 'muted' ? 'text-muted' : ''} />{help ? <Help term={help} size="sm" /> : null}</span>
      <MoneyText value={v} tone={tone} />
    </div>
  )
  const chip = (on: boolean) => `tap min-h-11 rounded-2xl border-2 px-3 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${small}`

  return (
    <Sheet open={open} onClose={onClose} title="pret.title">
      <div className="flex flex-col gap-3" data-testid="pret-sheet">
        <BiLabel text="pret.hint" size="sm" tone="text-muted" />
        {open_.map((l) => (
          <label key={l.id} className="card flex items-center gap-3">
            <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} className="h-6 w-6 accent-[#136F56]" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{l.device_label ?? l.description}</span>{l.imei1 ? <span className="text-xs text-muted" dir="ltr">{l.imei1}</span> : null}</span>
            <MoneyText value={l.net_cost} tone="ink" size="sm" />
          </label>
        ))}

        <div className="flex flex-col gap-1">
          <BiLabel text="pret.why.title" size="sm" bold />
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => <button key={r} type="button" aria-pressed={why === r} onClick={() => setWhy(r)} className={chip(why === r)}>{pick(`pret.why.${r}`)}</button>)}
          </div>
          <BiInput label="pret.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>

        <BiInput label="pret.cut" help={<Help term="pret.cut" size="sm" />} type="number" inputMode="numeric" min={0} value={cut} onChange={(e) => { setCut(e.target.value); setRefund(null) }} className="num" data-testid="pret-cut" />

        <div className="card divide-y divide-line" data-testid="pret-sum">
          {line('pret.value', value)}
          {cutN > 0 ? line('pret.cutLine', -cutN, 'muted') : null}
          {line('pret.owedBefore', owed, 'muted', undefined, 'pret.owed')}
          {cancelled > 0 ? line('pret.cancelled', cancelled, 'ink', 'pret-cancelled') : null}
          {stillOwed > 0 ? line('pret.stillOwed', stillOwed, 'ink', 'pret-still') : null}
          {line('pret.back', back, 'ink', 'pret-back')}
        </div>

        {back > 0 ? (
          <>
            <BiInput label="pret.gotNow" help={<Help term="pret.gotNow" size="sm" />} type="number" inputMode="numeric" min={0} max={back} value={refund ?? String(back)} onChange={(e) => setRefund(e.target.value)} className="num text-2xl" data-testid="pret-got" />
            {give > 0 && accounts && accounts.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => <button key={a.id} type="button" aria-pressed={accId === a.id} onClick={() => setAccount(a.id)} className={chip(accId === a.id)}>{ur && a.name_ur ? a.name_ur : a.name}</button>)}
              </div>
            ) : null}
            {later > 0 ? <div className={`rounded-2xl bg-receivable-tint px-3 py-2 font-bold text-receivable ${small}`} data-testid="pret-later">{pick('pret.later').replace('{{n}}', Math.round(later).toLocaleString('en-US'))}</div> : null}
          </>
        ) : null}
        {later === 0 && stillOwed === 0 && selected.length ? <div className={`rounded-2xl bg-emerald-tint px-3 py-2 font-bold text-emerald-deep ${small}`} data-testid="pret-zero">{pick('pret.zero')}</div> : null}

        <ErrorText error={ret.error} />
        <BiButton text="pret.confirm" full loading={ret.isPending} disabled={!selected.length} onClick={() => void save()} data-testid="pret-confirm" />
      </div>
    </Sheet>
  )
}
