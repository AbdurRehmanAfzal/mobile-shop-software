import { useState, type FormEvent } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import CnicScanButton from '@/components/CnicScanButton'
import { cnicNote } from '@/lib/cnicOcr'
import { CnicInput, PhoneInput } from '@/components/FieldInputs'
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
      {/* owner 2026-10-28: a photo of the CNIC fills the name and number; the rest goes to notes */}
      <CnicScanButton onRead={(d) => setF((x) => ({ ...x, name: x.name || d.name || '', cnic: d.cnic ?? x.cnic, notes: [x.notes, cnicNote(d, pick)].filter(Boolean).join(' · ') }))} />
      <BiInput label="party.name" value={f.name} onChange={set('name')} required minLength={2} />
      <PhoneInput label="party.phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} required />
      <CnicInput label="party.cnic" value={f.cnic} onChange={(cnic) => setF({ ...f, cnic })} />
      <BiInput label="party.city" value={f.city} onChange={set('city')} />
      <BiInput label="party.address" value={f.address} onChange={set('address')} />
      <BiInput label="common.notes" value={f.notes} onChange={set('notes')} />
      <div>
        <BiLabel text="party.kinds" size="md" tone="text-muted" />
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
      {/* owner addendum 5: a dealer / wholesale customer is sold items at the wholesale price */}
      <button type="button" role="switch" aria-checked={f.wholesale} onClick={() => setF({ ...f, wholesale: !f.wholesale })} className="tap flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-ground px-4 py-2 text-start" data-testid="party-wholesale">
        <span className="flex min-w-0 flex-1 flex-col"><BiLabel text="party.wholesale" size="md" bold /><BiLabel text="party.wholesaleHint" size="sm" tone="text-muted" /></span>
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${f.wholesale ? 'bg-emerald' : 'bg-line'}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${f.wholesale ? 'translate-x-5 rtl:-translate-x-5' : ''}`} /></span>
      </button>
      <ErrorText error={error} />
      <BiButton type="submit" text="common.save" full loading={busy} disabled={f.kinds.length === 0} />
    </form>
  )
}
