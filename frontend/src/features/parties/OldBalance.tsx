/** Old balance — dealings from before the software (owner 2026-11-19, ADR-110). A shop that
 *  starts today already gave phones to other shops and customers: part paid, the IMEIs long
 *  forgotten. Here the owner writes either the amount still open, or what went (model, pieces,
 *  rate) and what was settled — one question at a time (`OldDealingWizard`, ADR-116); the server
 *  adds it up and puts what is left on the person's khata.
 *  Stock and profit are not touched. A wrong entry is deleted with a reason (kept, struck through). */

import { History, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, ErrorText, MoneyText, Sheet, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useGet, useInvalidate } from '@/lib/queries'
import Say from '@/components/Say'
import type { Party } from '@/lib/types'
import OldDealingWizard from './OldDealingWizard'

interface Old { group_id: string; at: string; amount: string; party_owes: boolean; memo: string | null; deleted: boolean }

export default function OldBalance({ party }: { party: Party }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const can = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const { data: rows, refetch } = useGet<Old[]>(['old-balances', party.id], can ? `/api/v1/ledger/parties/${party.id}/opening-balances` : null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const [undo, setUndo] = useState<Old | null>(null)
  const [why, setWhy] = useState('')
  if (!can) return null

  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const refresh = async () => { await refetch(); await inv('party', 'parties', 'statement', 'dashboard', 'balances', 'party-units') }

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

      <OldDealingWizard party={party} open={open} onClose={() => setOpen(false)} onSaved={async () => { setDone(true); await refresh() }} />

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
