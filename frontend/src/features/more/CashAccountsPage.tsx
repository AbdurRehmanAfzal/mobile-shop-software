import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import RemoveSheet from '@/components/RemoveSheet'
import { BtnText, ErrorText, fmtDate, List, MoneyText, PageHeader, Row, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCashAccounts, useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import type { CashAccount } from '@/lib/types'

type Kind = CashAccount['kind']
interface Book { opening_balance: string; closing_balance: string; rows: { entry_id: string; at: string; memo: string | null; in: string; out: string; balance: string; reversed: boolean }[] }

export default function CashAccountsPage() {
  const { ur, pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data } = useCashAccounts()
  const [adding, setAdding] = useState(false)
  const [book, setBook] = useState<CashAccount | null>(null)
  const [f, setF] = useState({ kind: 'easypaisa' as Kind, name: '', account_no: '', opening_balance: '' })
  const { data: rows } = useGet<Book>(['book', book?.id], book && role !== 'salesman' ? `/api/v1/ledger/accounts/${book.id}/book` : null)
  const create = useDocMutation<Record<string, unknown>, CashAccount>('POST', () => '/api/v1/ledger/accounts')
  const [editing, setEditing] = useState<CashAccount | null>(null)
  const [removing, setRemoving] = useState<CashAccount | null>(null)
  const [newName, setNewName] = useState('')
  const rename = useDocMutation<{ id: string; name: string }, CashAccount>('PATCH', (i) => `/api/v1/ledger/accounts/${i.id}`, (i) => ({ name: i.name }))
  const inv = useInvalidate()
  const label = (a: CashAccount) => (ur && a.name_ur ? a.name_ur : a.name)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="cash.title" right={role === 'owner' ? <button type="button" aria-label="add" onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground"><Plus size={22} /><BtnText k={'cash.new'} /></button> : undefined} />
      <List>
        {data?.map((a) => <Row key={a.id} title={label(a)} sub={a.kind} right={<MoneyText value={a.balance} tone="ink" />} onClick={() => setBook(a)} />)}
      </List>

      <Sheet open={adding} onClose={() => setAdding(false)} title="cash.new">
        <div className="flex flex-col gap-3">
          <BiLabel text="cash.kind" size="md" tone="text-muted" />
          <BiSegmented<Kind> value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'cash', text: 'pay.cash' }, { value: 'bank', text: 'pay.bank' }, { value: 'easypaisa', text: 'pay.easypaisa' }, { value: 'jazzcash', text: 'pay.jazzcash' }]} />
          <BiInput label="cash.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <BiInput label="cash.accountNo" value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} />
          <BiInput label="cash.opening" type="number" inputMode="decimal" min={0} value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!f.name} onClick={async () => { await create.mutateAsync({ ...f, name_ur: null, account_no: f.account_no || null, opening_balance: Number(f.opening_balance || 0) }); setAdding(false) }} />
        </div>
      </Sheet>

      <Sheet open={book !== null} onClose={() => setBook(null)} title="cash.book">
        {book && role === 'owner' ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setNewName(book.name); setEditing(book); setBook(null) }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold">
              <Pencil size={16} /> {pick('crud.editAccount')}
            </button>
            {!book.is_default ? (
              <button type="button" onClick={() => { setRemoving(book); setBook(null) }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold text-payable">
                <Trash2 size={16} /> {pick('crud.delete')}
              </button>
            ) : null}
          </div>
        ) : null}
        {rows ? (
          <div className="card divide-y divide-line p-0">
            {[...rows.rows].reverse().map((r) => (
              <div key={r.entry_id} className={`flex items-center gap-3 px-3 py-2 ${r.reversed ? 'line-through opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.memo}</div>
                  <div className="text-xs text-muted" dir="ltr">{fmtDate(r.at)}</div>
                </div>
                <div className="text-end">
                  {Number(r.in) > 0 ? <MoneyText value={r.in} tone="ink" size="sm" /> : <MoneyText value={-Number(r.out)} size="sm" />}
                  <div className="text-xs text-muted" dir="ltr">= {Number(r.balance).toLocaleString('en-US')}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="crud.editAccount">
        {editing ? (
          <div className="flex flex-col gap-3">
            <BiInput label="cash.name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <ErrorText error={rename.error} />
            <BiButton text="common.save" full loading={rename.isPending} disabled={!newName.trim()} onClick={async () => { await rename.mutateAsync({ id: editing.id, name: newName.trim() }); setEditing(null) }} />
          </div>
        ) : null}
      </Sheet>

      <RemoveSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        name={removing ? label(removing) : ''}
        onConfirm={async () => {
          await api('DELETE', `/api/v1/ledger/accounts/${removing!.id}`)
          await inv()
        }}
      />
    </div>
  )
}
