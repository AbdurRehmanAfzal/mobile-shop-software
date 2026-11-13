/** Owner 2026-11-12 (ADR-066): what is wrong with a faulty phone. Common faults to tap, the shop's own
 *  words added once and offered again; the phone stays in stock and can be sold as it is. */

import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { useDeviceEvent, useGet, useInvalidate } from '@/lib/queries'

export const FAULT_KEYS = ['camera', 'lcd', 'display', 'dots', 'lines', 'touch', 'board', 'ram', 'storage', 'battery', 'charging', 'speaker', 'mic', 'earpiece', 'network', 'wifi', 'fingerprint', 'face_id', 'buttons', 'back_glass', 'body', 'water', 'software', 'dead']

/** a fault's name: the list's own words for its keys, the shop's word as written */
export const faultName = (f: string, pick: (k: string) => string) => (FAULT_KEYS.includes(f) ? pick(`fault.${f}`) : f)
export const faultText = (faults: string[] | null | undefined, pick: (k: string) => string) => (faults ?? []).map((f) => faultName(f, pick)).join(', ')

/** the red "Faulty: Camera, LCD" chip on cards and rows */
export function FaultChip({ faults }: { faults?: string[] | null }) {
  const { pick } = useLang()
  if (!faults?.length) return null
  return <span className="rounded-full bg-payable-tint px-2 py-0.5 text-xs font-bold text-payable" data-testid="fault-chip">{pick('faulty.chip')}: {faultText(faults, pick)}</span>
}

export function FaultSheet({ open, onClose, deviceId, current }: { open: boolean; onClose: () => void; deviceId: string; current?: string[] | null }) {
  const { pick } = useLang()
  const inv = useInvalidate()
  const { data: opts } = useGet<{ faults?: string[] }>(['device-options'], open ? '/api/v1/devices/options' : null)
  const ev = useDeviceEvent()
  const [sel, setSel] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { if (open) { setSel(current ?? []); setOwn(''); setNote(''); ev.reset() } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = [...new Set([...(opts?.faults ?? FAULT_KEYS), ...sel])]
  const toggle = (f: string) => setSel(sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f])
  const addOwn = () => { const w = own.trim().slice(0, 40); if (w && !sel.includes(w)) setSel([...sel, w]); setOwn('') }
  return (
    <Sheet open={open} onClose={onClose} title={current?.length ? 'faulty.edit' : 'faulty.title'}>
      <div className="flex flex-col gap-3" data-testid="fault-sheet">
        <span className="flex items-center gap-1"><BiLabel text="faulty.hint" size="sm" tone="text-muted" /><Help term="device.faults" size="sm" /></span>
        <div className="flex flex-wrap gap-1.5">
          {all.map((f) => (
            <button key={f} type="button" aria-pressed={sel.includes(f)} onClick={() => toggle(f)} className={`tap min-h-10 rounded-full border-2 px-3 text-[13px] font-bold ${sel.includes(f) ? 'border-payable bg-payable text-white' : 'border-line bg-surface text-ink'}`} data-testid={`fault-${f}`}>
              {faultName(f, pick)}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><BiInput label="faulty.addOwn" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn() } }} maxLength={40} placeholder={pick('faulty.addPlaceholder')} data-testid="fault-own" /></div>
          <button type="button" onClick={addOwn} disabled={!own.trim()} aria-label={pick('faulty.add')} className="tap mb-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-ground disabled:opacity-40" data-testid="fault-own-add"><Plus size={22} /></button>
        </div>
        <BiInput label="faulty.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} help={<Help term="common.notes" size="sm" />} />
        <ErrorText error={ev.error} />
        <BiButton
          text="common.save"
          full
          loading={ev.isPending}
          disabled={!sel.length}
          onClick={async () => {
            await ev.mutateAsync({ id: deviceId, type: 'marked_faulty', note: note.trim() || undefined, data: { faults: sel } })
            await inv('device-options', 'stock-status')
            onClose()
          }}
          data-testid="fault-save"
        />
      </div>
    </Sheet>
  )
}

/** the same choices in the add-stock form (owner 2026-11-13): an optional "it came in faulty" */
export function FaultPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { pick } = useLang()
  const { data: opts } = useGet<{ faults?: string[] }>(['device-options'], '/api/v1/devices/options')
  const [own, setOwn] = useState('')
  const all = [...new Set([...(opts?.faults ?? FAULT_KEYS), ...value])]
  const toggle = (f: string) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f])
  const addOwn = () => { const w = own.trim().slice(0, 40); if (w && !value.includes(w)) onChange([...value, w]); setOwn('') }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3" data-testid="add-faults">
      <span className="flex items-center gap-1"><BiLabel text="faulty.onAdd" size="md" bold /><Help term="device.faults" size="sm" /></span>
      <BiLabel text="faulty.onAddHint" size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">
        {all.map((f) => (
          <button key={f} type="button" aria-pressed={value.includes(f)} onClick={() => toggle(f)} className={`tap min-h-9 rounded-full border-2 px-3 text-[13px] font-bold ${value.includes(f) ? 'border-payable bg-payable text-white' : 'border-line bg-surface text-ink'}`} data-testid={`add-fault-${f}`}>
            {faultName(f, pick)}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><BiInput label="faulty.addOwn" value={own} onChange={(e) => setOwn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn() } }} maxLength={40} placeholder={pick('faulty.addPlaceholder')} /></div>
        <button type="button" onClick={addOwn} disabled={!own.trim()} aria-label={pick('faulty.add')} className="tap mb-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-ground disabled:opacity-40"><Plus size={22} /></button>
      </div>
    </div>
  )
}
