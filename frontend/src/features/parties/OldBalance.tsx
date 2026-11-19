/** Old balance — dealings from before the software (owner 2026-11-19, ADR-110). A shop that
 *  starts today already gave phones to other shops and customers: part paid, the IMEIs long
 *  forgotten. Here the owner writes either the amount still open, or what went (model, pieces,
 *  rate) and what was settled; the server adds it up and puts what is left on the person's khata.
 *  Stock and profit are not touched. A wrong entry is deleted with a reason (kept, struck through). */

import { Check, History, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, ErrorText, MoneyText, Sheet, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { useGet, useInvalidate } from '@/lib/queries'
import Say from '@/components/Say'
import type { Party } from '@/lib/types'

interface Old { group_id: string; at: string; amount: string; party_owes: boolean; memo: string | null; deleted: boolean }
interface Line { key: string; description: string; qty: string; rate: string }
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })
const blank = (): Line => ({ key: uid(), description: '', qty: '', rate: '' })

export default function OldBalance({ party }: { party: Party }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const can = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const { data: rows, refetch } = useGet<Old[]>(['old-balances', party.id], can ? `/api/v1/ledger/parties/${party.id}/opening-balances` : null)
  const [open, setOpen] = useState(false)
  const [owes, setOwes] = useState(true)
  const [mode, setMode] = useState<'amount' | 'goods'>('goods')
  const [amount, setAmount] = useState('')
  const [lines, setLines] = useState<Line[]>([blank()])
  const [settled, setSettled] = useState('')
  const [asOf, setAsOf] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const [undo, setUndo] = useState<Old | null>(null)
  const [why, setWhy] = useState('')
  if (!can) return null

  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap min-h-12 flex-1 rounded-2xl border-2 px-3 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`
  const filled = lines.filter((l) => l.description.trim() && Number(l.qty) >= 1 && l.rate !== '' && Number(l.rate) >= 0)
  // shown while typing; the figure that is saved is the server's own sum
  const total = filled.reduce((s, l) => s + Math.floor(Number(l.qty)) * Number(l.rate), 0)
  const left = total - Number(settled || 0)
  const ok = mode === 'amount' ? Number(amount) > 0 : filled.length > 0 && filled.length === lines.filter((l) => l.description.trim() || l.qty || l.rate).length && left > 0
  const set = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const reset = () => { setAmount(''); setLines([blank()]); setSettled(''); setAsOf(''); setMemo(''); setErr(null) }
  const refresh = async () => { await refetch(); await inv('party', 'parties', 'statement', 'dashboard', 'balances', 'party-units') }

  async function save() {
    setBusy(true); setErr(null)
    try {
      await api('POST', `/api/v1/ledger/parties/${party.id}/opening-balance`, mode === 'amount'
        ? { party_owes: owes, amount: Number(amount), memo: memo.trim() || undefined, as_of: asOf || undefined }
        : { party_owes: owes, items: filled.map((l) => ({ description: l.description.trim(), qty: Math.floor(Number(l.qty)), rate: Number(l.rate) })), settled: Number(settled || 0), as_of: asOf || undefined, memo: memo.trim() || undefined })
      reset(); setOpen(false); setDone(true)
      await refresh()
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <section className="card flex flex-col gap-3" data-testid="old-balance">
      <span className="flex items-center gap-2">
        <span className="well h-9 w-9 shrink-0 rounded-xl bg-khata text-khata-fg"><History size={18} /></span>
        <span className="flex-1"><BiLabel text="old.title" size="md" bold /></span>
        <Help term="old.page" size="sm" />
      </span>
      <BiLabel text="old.hint" size="sm" tone="text-muted" />
      <Say k="say.old" englishOnly className="text-muted" />
      {done ? <BiAlert text="old.saved" kind="success" /> : null}
      {rows?.length ? (
        <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {rows.map((r) => (
            <div key={r.group_id} className={`flex items-start gap-3 px-3 py-2.5 ${r.deleted ? 'opacity-60' : ''}`} data-testid="old-row">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={ur ? cls('md') : 'text-[15px] font-bold'}>{pick(r.party_owes ? 'party.partyOwes' : 'party.iOwe')}</span>
                  {r.deleted ? <Chip text="del.deleted" tone="muted" /> : null}
                </span>
                {r.memo ? <span className={`break-words text-muted ${small} ${r.deleted ? 'line-through' : ''}`} dir="auto">{r.memo}</span> : null}
                <span className={`num text-muted ${small}`} dir="ltr">{fmtDate(r.at)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <MoneyText value={r.party_owes ? r.amount : -Number(r.amount)} tone={r.party_owes ? 'ink' : undefined} size="sm" />
                {!r.deleted ? <button type="button" aria-label={pick('old.undo')} onClick={() => { setWhy(''); setErr(null); setUndo(r) }} className={`tap inline-flex h-9 items-center gap-1 rounded-xl px-2 text-payable ${small}`} data-testid="old-undo"><Trash2 size={15} />{pick('crud.delete')}</button> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <BiButton text="old.add" icon={<Plus size={20} />} variant="secondary" full onClick={() => { setDone(false); setErr(null); setOpen(true) }} data-testid="old-add" />

      <Sheet open={open} onClose={() => setOpen(false)} title="old.add">
        <div className="flex flex-col gap-3" data-testid="old-sheet">
          <span className={`truncate ${ur ? cls('lg') : 'text-lg font-extrabold'}`}>{ur ? party.name_ur || party.name : party.name}</span>
          <div className="flex gap-2">
            <button type="button" aria-pressed={owes} onClick={() => setOwes(true)} className={chip(owes)} data-testid="old-they-owe">{pick('party.partyOwes')}</button>
            <button type="button" aria-pressed={!owes} onClick={() => setOwes(false)} className={chip(!owes)} data-testid="old-i-owe">{pick('party.iOwe')}</button>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-pressed={mode === 'goods'} onClick={() => setMode('goods')} className={chip(mode === 'goods')} data-testid="old-mode-goods">{pick('old.withGoods')}</button>
            <button type="button" aria-pressed={mode === 'amount'} onClick={() => setMode('amount')} className={chip(mode === 'amount')} data-testid="old-mode-amount">{pick('old.onlyAmount')}</button>
          </div>
          {mode === 'amount' ? (
            <BiInput label="old.amount" help={<Help term="old.page" size="sm" />} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-2xl" data-testid="old-amount" />
          ) : (
            <>
              <span className="flex items-center gap-1"><BiLabel text="old.goodsTitle" size="md" bold /><Help term="old.goods" size="sm" /></span>
              {lines.map((l, i) => (
                <div key={l.key} className="flex flex-col gap-2 rounded-2xl border border-line p-3" data-testid="old-line">
                  <BiInput label="old.item" help={null} value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} maxLength={120} placeholder="Apple iPhone 17" data-testid={`old-item-${i}`} />
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <BiInput label="old.qty" help={null} type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} className="num" data-testid={`old-qty-${i}`} />
                    <BiInput label="old.rate" help={null} type="number" inputMode="numeric" min={0} value={l.rate} onChange={(e) => set(l.key, { rate: e.target.value })} className="num" data-testid={`old-rate-${i}`} />
                    {lines.length > 1 ? <button type="button" aria-label={pick('crud.delete')} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="tap mb-1 flex h-12 w-11 items-center justify-center rounded-xl text-payable"><Trash2 size={18} /></button> : <span />}
                  </div>
                  {Number(l.qty) >= 1 && l.rate !== '' ? <span className={`num text-muted ${small}`} dir="ltr">= {withCur(n(Math.floor(Number(l.qty)) * Number(l.rate)))}</span> : null}
                </div>
              ))}
              <BiButton text="old.addLine" icon={<Plus size={18} />} variant="ghost" size="md" onClick={() => setLines([...lines, blank()])} data-testid="old-add-line" />
              <BiInput label="old.settled" help={<Help term="old.settled" size="sm" />} type="number" inputMode="numeric" min={0} value={settled} onChange={(e) => setSettled(e.target.value)} className="num" data-testid="old-settled" />
              <div className="flex flex-col gap-1 rounded-2xl bg-ground px-4 py-3" data-testid="old-sum">
                <span className="flex items-center justify-between"><BiLabel text="old.total" size="sm" tone="text-muted" /><span className="num" dir="ltr">{withCur(n(total))}</span></span>
                <span className="flex items-center justify-between"><BiLabel text="old.left" size="md" bold /><span className={`num text-2xl ${left > 0 ? '' : 'text-payable'}`} dir="ltr" data-testid="old-left">{withCur(n(Math.max(0, left)))}</span></span>
              </div>
              {total > 0 && left <= 0 ? <BiLabel text="old.nothingLeft" size="sm" tone="text-payable" bold /> : null}
            </>
          )}
          <BiInput label="old.asOf" help={null} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <BiInput label="common.notes" help={null} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
          <ErrorText error={err} />
          <BiButton text="common.save" icon={<Check size={22} />} full loading={busy} disabled={!ok} onClick={save} data-testid="old-save" />
        </div>
      </Sheet>

      <Sheet open={undo !== null} onClose={() => setUndo(null)} title="old.undo">
        {undo ? (
          <div className="flex flex-col gap-3">
            <BiLabel text="old.undoHint" size="md" />
            <BiInput label="common.reason" help={null} value={why} onChange={(e) => setWhy(e.target.value)} minLength={3} maxLength={200} autoFocus data-testid="old-undo-why" />
            <ErrorText error={err} />
            <BiButton text="old.undo" variant="danger" full loading={busy} disabled={why.trim().length < 3} onClick={async () => {
              setBusy(true); setErr(null)
              try { await api('POST', `/api/v1/ledger/opening-balances/${undo.group_id}/undo`, { reason: why.trim() }); setUndo(null); await refresh() } catch (e) { setErr(e) } finally { setBusy(false) }
            }} data-testid="old-undo-yes" />
          </div>
        ) : null}
      </Sheet>
    </section>
  )
}
