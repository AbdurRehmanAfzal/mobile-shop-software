/** A locked phone's panel on its page (owner 2026-11-15, ADR-085): says it is iCloud / Google (FRP)
 *  locked, and (owner / manager) takes it apart for parts — its cost becomes a cost and it leaves
 *  the stock — or marks it opened, when the lock was removed (then it is a normal phone; correct its
 *  IMEI with "Correct IMEI" if it had none). */

import { Lock, Unlock, Wrench } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { api, post } from '@/lib/api'
import type { Device } from '@/lib/types'

export const PARTS = ['camera', 'screen', 'battery', 'backGlass', 'board', 'speaker', 'chargingPort', 'housing', 'faceId', 'other'] as const

export default function LockedPanel({ d, canManage, onChanged }: { d: Device; canManage: boolean; onChanged: () => void }) {
  const { pick, ur, cls } = useLang()
  const [open, setOpen] = useState<null | 'parts' | 'opened'>(null)
  const [parts, setParts] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const inShop = d.status === 'in_stock' || d.status === 'faulty'
  if (!d.lock_type && d.status !== 'used_for_parts') return null

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try { await fn(); setOpen(null); onChanged() } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  const chip = (on: boolean) => `tap min-h-11 rounded-2xl border-2 px-3 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`

  return (
    <section className="card flex flex-col gap-2 border-2 border-payable/30" data-testid="locked-panel">
      <span className="flex items-center gap-2">
        <span className="well h-10 w-10 shrink-0 bg-payable-tint text-payable"><Lock size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1"><BiLabel text={d.status === 'used_for_parts' ? 'locked.usedForParts' : `locked.type.${d.lock_type}`} size="md" bold /><Help term="locked.lock" size="sm" /></span>
          <BiLabel text={d.status === 'used_for_parts' ? 'locked.usedHint' : 'locked.pageHint'} size="sm" tone="text-muted" />
        </span>
      </span>
      {canManage && inShop ? (
        <div className="flex flex-wrap gap-2">
          <BiButton text="locked.parts" icon={<Wrench size={18} />} size="md" variant="secondary" onClick={() => { setParts([]); setNote(''); setOpen('parts') }} data-testid="use-for-parts" />
          {d.lock_type ? <BiButton text="locked.opened" icon={<Unlock size={18} />} size="md" variant="ghost" onClick={() => setOpen('opened')} data-testid="lock-opened" /> : null}
        </div>
      ) : null}

      <Sheet open={open === 'parts'} onClose={() => setOpen(null)} title="locked.parts">
        <div className="flex flex-col gap-3">
          <BiLabel text="locked.partsHint" size="sm" tone="text-muted" />
          <div className="flex flex-wrap gap-2">
            {PARTS.map((p) => (
              <button key={p} type="button" aria-pressed={parts.includes(p)} onClick={() => setParts((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} className={chip(parts.includes(p))}>
                {pick(`locked.part.${p}`)}
              </button>
            ))}
          </div>
          <BiInput label="locked.partsNote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          <ErrorText error={err} />
          <BiButton text="locked.partsConfirm" variant="danger" full loading={busy} onClick={() => void run(() => post(`/api/v1/devices/${d.id}/use-for-parts`, { parts: parts.map((p) => pick(`locked.part.${p}`)), note: note.trim() || null }))} data-testid="parts-confirm" />
        </div>
      </Sheet>
      <Sheet open={open === 'opened'} onClose={() => setOpen(null)} title="locked.opened">
        <div className="flex flex-col gap-3">
          <BiLabel text="locked.openedHint" size="sm" tone="text-muted" />
          <ErrorText error={err} />
          <BiButton text="common.confirm" full loading={busy} onClick={() => void run(() => api('PATCH', `/api/v1/devices/${d.id}`, { lock_type: null }))} data-testid="opened-confirm" />
        </div>
      </Sheet>
    </section>
  )
}
