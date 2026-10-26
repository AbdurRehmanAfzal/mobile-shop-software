import { useState, type FormEvent } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
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
      <BiInput label="party.name" value={f.name} onChange={set('name')} required minLength={2} />
      <BiInput label="party.phone" type="tel" inputMode="numeric" placeholder="03001234567" value={f.phone} onChange={set('phone')} required />
      <BiInput label="party.cnic" inputMode="numeric" placeholder="33100-1234567-1" value={f.cnic} onChange={set('cnic')} />
      <BiInput label="party.city" value={f.city} onChange={set('city')} />
      <BiInput label="party.address" value={f.address} onChange={set('address')} />
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
      <ErrorText error={error} />
      <BiButton type="submit" text="common.save" full loading={busy} disabled={f.kinds.length === 0} />
    </form>
  )
}
