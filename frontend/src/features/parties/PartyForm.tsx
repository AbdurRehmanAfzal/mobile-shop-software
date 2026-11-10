import { useState, type FormEvent } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import CnicScanButton from '@/components/CnicScanButton'
import { cnicNote } from '@/lib/cnicOcr'
import { CnicInput, PhoneInput } from '@/components/FieldInputs'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { useCreateParty, useUpdateParty } from '@/lib/queries'
import type { Party, PartyKind } from '@/lib/types'

const KINDS: PartyKind[] = ['customer', 'supplier', 'shop', 'technician']

export default function PartyForm({ party, defaultKinds = ['customer'], onDone }: { party?: Party; defaultKinds?: PartyKind[]; onDone: (p: Party) => void }) {
  const { pick } = useLang()
  const create = useCreateParty()
  const update = useUpdateParty()
  const [f, setF] = useState({
    name: party?.name ?? '',
    phone: party?.phone ?? '',
    cnic: party?.cnic ?? '',
    city: party?.city ?? '',
    address: party?.address ?? '',
    notes: party?.notes ?? '',
    kinds: (party?.kinds ?? defaultKinds) as PartyKind[],
    wholesale: party?.wholesale ?? false,
  })
  // owner 2026-11-06: name, phone and type first; the rest only when "more details" is ticked
  // (open by itself when an existing person already has any of it)
  const [extra, setExtra] = useState(!!(party?.cnic || party?.city || party?.address || party?.notes || party?.wholesale))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const toggle = (k: PartyKind) => setF({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] })
  const busy = create.isPending || update.isPending
  const error = create.error ?? update.error

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body = {
      ...f,
      // one name and one phone: WhatsApp messages go to the phone number
      name_ur: null,
      whatsapp: null,
      // owner 2026-11-10: the number is optional
      phone: f.phone || null,
      cnic: f.cnic || null,
      city: f.city || null,
      address: f.address || null,
      notes: f.notes || null,
    }
    const res = party ? await update.mutateAsync({ id: party.id, ...body }) : await create.mutateAsync(body)
    onDone(res)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <BiInput label="party.name" help={<Help term="common.name" size="sm" />} value={f.name} onChange={set('name')} required minLength={2} />
      <PhoneInput label="party.phoneOpt" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
      <div>
        <span className="flex items-center gap-1"><BiLabel text="party.kinds" size="md" tone="text-muted" /><Help term="party.kinds" size="sm" /></span>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {KINDS.map((k) => {
            const on = f.kinds.includes(k)
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} className={`tap min-h-12 rounded-2xl border text-sm font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-muted'}`}>
                {pick(`party.${k}`)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <label className="tap flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4" data-testid="party-more">
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="h-6 w-6 shrink-0 accent-[rgb(var(--emerald))]" />
          <span className="flex min-w-0 flex-1 flex-col"><BiLabel text="party.moreDetails" size="md" bold /><BiLabel text="party.moreDetailsHint" size="sm" tone="text-muted" /></span>
        </label>
        <Help term="party.moreDetails" size="sm" />
      </div>
      {extra ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-line bg-ground p-3">
          {/* owner 2026-10-28: a photo of the CNIC fills the name and number; the rest goes to notes */}
          {/* CnicScanButton, PhoneInput and CnicInput carry their own "?" (docs/33) */}
          <CnicScanButton onRead={(d) => setF((x) => ({ ...x, name: x.name || d.name || '', cnic: d.cnic ?? x.cnic, notes: [x.notes, cnicNote(d, pick)].filter(Boolean).join(' · ') }))} />
          <CnicInput label="party.cnic" help={<Help term="common.cnic" size="sm" />} value={f.cnic} onChange={(cnic) => setF({ ...f, cnic })} />
          <BiInput label="party.city" help={<Help term="party.city" size="sm" />} value={f.city} onChange={set('city')} />
          <BiInput label="party.address" help={<Help term="common.address" size="sm" />} value={f.address} onChange={set('address')} />
          <BiInput label="common.notes" help={<Help term="common.notes" size="sm" />} value={f.notes} onChange={set('notes')} />
          {/* owner addendum 5: a dealer / wholesale customer is sold items at the wholesale price */}
          <div className="flex items-center gap-1">
          <button type="button" role="switch" aria-checked={f.wholesale} onClick={() => setF({ ...f, wholesale: !f.wholesale })} className="tap flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 text-start" data-testid="party-wholesale">
            <span className="flex min-w-0 flex-1 flex-col"><BiLabel text="party.wholesale" size="md" bold /><BiLabel text="party.wholesaleHint" size="sm" tone="text-muted" /></span>
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${f.wholesale ? 'bg-emerald' : 'bg-line'}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${f.wholesale ? 'translate-x-5 rtl:-translate-x-5' : ''}`} /></span>
          </button>
          <Help term="party.wholesale" size="sm" />
          </div>
        </div>
      ) : null}
      <ErrorText error={error} />
      <BiButton type="submit" text="common.save" full loading={busy} disabled={f.kinds.length === 0} />
    </form>
  )
}
