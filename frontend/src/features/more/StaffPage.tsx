import { Plus } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { Chip, ErrorText, List, PageHeader, Row, Sheet } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useDocMutation, useGet } from '@/lib/queries'
import { normalisePhone } from '@/lib/format'

interface Staff { id: string; name: string; phone: string; role: 'owner' | 'manager' | 'salesman' | 'technician'; is_active: boolean }
type Role = 'manager' | 'salesman' | 'technician'

export default function StaffPage() {
  const { pick } = useLang()
  const myId = useAuth((s) => s.me?.user.id)
  const { data } = useGet<Staff[]>(['staff'], '/api/v1/staff')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [f, setF] = useState({ name: '', phone: '', password: '', pin: '', role: 'salesman' as Role })
  const [pw, setPw] = useState('')
  const create = useDocMutation<Record<string, unknown>, Staff>('POST', () => '/api/v1/staff')
  const update = useDocMutation<{ id: string } & Record<string, unknown>, Staff>('PATCH', (i) => `/api/v1/staff/${i.id}`, ({ id: _id, ...rest }) => rest)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="staff.title" right={<button type="button" aria-label={pick('staff.new')} onClick={() => setAdding(true)} className="well tap h-11 w-11 bg-ink text-ground"><Plus size={22} /></button>} />
      <List>
        {data?.map((u) => (
          <Row key={u.id} title={u.name} sub={<span dir="ltr">{u.phone}</span>} right={<div className="flex flex-col items-end gap-1"><Chip text={`staff.roles.${u.role}`} tone="ink" />{!u.is_active ? <Chip text="staff.disabled" tone="bad" /> : null}</div>} onClick={u.id !== myId && u.role !== 'owner' ? () => { setEditing(u); setPw('') } : undefined} />
        ))}
      </List>

      <Sheet open={adding} onClose={() => setAdding(false)} title="staff.new">
        <div className="flex flex-col gap-3">
          <BiInput label="staff.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <BiInput label="staff.phone" type="tel" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <BiInput label="staff.password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} />
          <BiInput label="staff.pin" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} />
          <BiLabel text="staff.role" size="md" tone="text-muted" />
          <BiSegmented<Role> value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: 'salesman', text: 'staff.roles.salesman' }, { value: 'technician', text: 'staff.roles.technician' }, { value: 'manager', text: 'staff.roles.manager' }]} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!f.name || f.password.length < 6 || !f.phone} onClick={async () => { await create.mutateAsync({ name: f.name, phone: normalisePhone(f.phone), password: f.password, pin: f.pin || undefined, role: f.role }); setAdding(false); setF({ name: '', phone: '', password: '', pin: '', role: 'salesman' }) }} />
        </div>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? { en: editing.name, ur: editing.name } : ''}>
        {editing ? (
          <div className="flex flex-col gap-3">
            <BiLabel text="staff.role" size="md" tone="text-muted" />
            <BiSegmented<Role> value={editing.role as Role} onChange={async (role) => { const u = await update.mutateAsync({ id: editing.id, role }); setEditing(u) }} options={[{ value: 'salesman', text: 'staff.roles.salesman' }, { value: 'technician', text: 'staff.roles.technician' }, { value: 'manager', text: 'staff.roles.manager' }]} />
            <BiInput label="staff.resetPassword" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} />
            <BiButton text="common.save" variant="secondary" full disabled={pw.length < 6} loading={update.isPending} onClick={async () => { await update.mutateAsync({ id: editing.id, password: pw }); setPw('') }} />
            <BiButton text={editing.is_active ? 'staff.disable' : 'staff.enable'} variant={editing.is_active ? 'danger' : 'primary'} full loading={update.isPending} onClick={async () => { const u = await update.mutateAsync({ id: editing.id, is_active: !editing.is_active }); setEditing(u) }} />
            <ErrorText error={update.error} />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
