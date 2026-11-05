import { AlertTriangle, ArrowLeftRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
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
  const [newOpening, setNewOpening] = useState('')
  // owner 2026-11-05 (accounting audit): the opening balance can be set later too
  const rename = useDocMutation<{ id: string; name: string; opening_balance?: number }, CashAccount>('PATCH', (i) => `/api/v1/ledger/accounts/${i.id}`, (i) => ({ name: i.name, ...(i.opening_balance !== undefined ? { opening_balance: i.opening_balance } : {}) }))
  const edit = (a: CashAccount) => { setNewName(a.name); setNewOpening(String(Number(a.opening_balance ?? 0))); setEditing(a) }
  // a cheque account below zero is cheques given and not cleared yet — normal, no hint
  const below = (data ?? []).filter((a) => Number(a.balance) < 0 && a.kind !== 'cheque' && a.kind !== 'remittance')
  const inv = useInvalidate()
  const label = (a: CashAccount) => (ur && a.name_ur ? a.name_ur : a.name)
  // Shop Audit P2-1: counter cash to the bank (or back) as one balanced move, never income or expense
  const [moving, setMoving] = useState(false)
  const [mv, setMv] = useState({ from: '', to: '', amount: '', note: '' })
  const move = useDocMutation<Record<string, unknown>, { id: string }>('POST', () => '/api/v1/ledger/transfers')
  const canMove = role === 'owner' || role === 'manager'
  const { data: transfers } = useGet<{ id: string; at: string; from_name: string | null; to_name: string | null; amount: string; memo: string | null; posted_by_name: string | null; reversed: boolean }[]>(['transfers'], canMove ? '/api/v1/ledger/transfers?limit=20' : null)
  const openMove = () => { const a = data ?? []; setMv({ from: a.find((x) => x.is_default)?.id ?? a[0]?.id ?? '', to: a.find((x) => !x.is_default)?.id ?? '', amount: '', note: '' }); setMoving(true) }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="cash.title" help={<Help term="more.tile.cash" />} right={role === 'owner' ? <button type="button" aria-label="add" onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground"><Plus size={22} /><BtnText k={'cash.new'} /></button> : undefined} />
      <List>
        {data?.map((a) => <Row key={a.id} title={label(a)} sub={a.kind} right={<MoneyText value={a.balance} tone="ink" />} onClick={() => setBook(a)} />)}
      </List>
      {below.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-2xl bg-payable-tint px-4 py-3 text-payable" data-testid="cash-below-zero">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={ur ? 'text-sm leading-relaxed' : 'text-sm font-semibold'}>{pick('cash.belowZero').replace('{{name}}', label(a))}</span>
            {role === 'owner' ? <BiButton text="cash.setOpening" size="md" variant="secondary" onClick={() => edit(a)} /> : null}
          </div>
          <Help term="accounts.opening" size="sm" />
        </div>
      ))}
      {canMove && (data?.length ?? 0) > 1 ? (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><BiButton text="cash.move" icon={<ArrowLeftRight size={20} />} variant="secondary" full onClick={openMove} /></div>
          <Help term="accounts.move" size="sm" />
        </div>
      ) : null}
      {transfers?.length ? (
        <>
          <span className="flex items-center gap-1"><BiLabel text="cash.transfers" size="md" bold /><Help term="accounts.transfers" size="sm" /></span>
          <div className="card divide-y divide-line p-0" data-testid="transfers">
            {transfers.map((t) => (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2 ${t.reversed ? 'line-through opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" dir="auto">{t.from_name} → {t.to_name}</div>
                  <div className="text-xs text-muted"><span dir="ltr">{fmtDate(t.at)}</span>{t.posted_by_name ? ` · ${t.posted_by_name}` : ''}{t.memo ? ` · ${t.memo}` : ''}</div>
                </div>
                <MoneyText value={t.amount} tone="ink" size="sm" />
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Sheet open={moving} onClose={() => setMoving(false)} title="cash.move">
        <div className="flex flex-col gap-3">
          <BiLabel text="cash.moveHint" size="sm" tone="text-muted" />
          <span className="flex items-center gap-1"><BiLabel text="cash.from" size="md" tone="text-muted" /><Help term="accounts.from" size="sm" /></span>
          <div className="flex flex-wrap gap-2">
            {data?.map((a) => (
              <button key={a.id} type="button" aria-pressed={mv.from === a.id} onClick={() => setMv({ ...mv, from: a.id, to: mv.to === a.id ? '' : mv.to })} className={`tap h-11 rounded-full border-2 px-3.5 text-sm font-bold ${mv.from === a.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{label(a)}</button>
            ))}
          </div>
          <span className="flex items-center gap-1"><BiLabel text="cash.to" size="md" tone="text-muted" /><Help term="accounts.to" size="sm" /></span>
          <div className="flex flex-wrap gap-2">
            {data?.filter((a) => a.id !== mv.from).map((a) => (
              <button key={a.id} type="button" aria-pressed={mv.to === a.id} onClick={() => setMv({ ...mv, to: a.id })} className={`tap h-11 rounded-full border-2 px-3.5 text-sm font-bold ${mv.to === a.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{label(a)}</button>
            ))}
          </div>
          <BiInput label="cash.amount" type="number" inputMode="decimal" min={0} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className="num text-2xl" autoFocus help={<Help term="accounts.moveAmount" size="sm" />} />
          <BiInput label="cash.note" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} help={<Help term="common.notes" size="sm" />} />
          <ErrorText error={move.error} />
          <BiButton text="cash.moveNow" full loading={move.isPending} disabled={!mv.from || !mv.to || Number(mv.amount) <= 0} onClick={async () => { await move.mutateAsync({ from_account_id: mv.from, to_account_id: mv.to, amount: Number(mv.amount), note: mv.note || null }); setMoving(false) }} />
        </div>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="cash.new">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="cash.kind" size="md" tone="text-muted" /><Help term="accounts.kind" size="sm" /></span>
          <BiSegmented<Kind> value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'cash', text: 'pay.cash' }, { value: 'bank', text: 'pay.bank' }, { value: 'easypaisa', text: 'pay.easypaisa' }, { value: 'jazzcash', text: 'pay.jazzcash' }]} />
          <BiInput label="cash.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} help={<Help term="accounts.name" size="sm" />} />
          <BiInput label="cash.accountNo" value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} help={<Help term="accounts.accountNo" size="sm" />} />
          <BiInput label="cash.opening" type="number" inputMode="decimal" min={0} value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} help={<Help term="accounts.opening" size="sm" />} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!f.name} onClick={async () => { await create.mutateAsync({ ...f, name_ur: null, account_no: f.account_no || null, opening_balance: Number(f.opening_balance || 0) }); setAdding(false) }} />
        </div>
      </Sheet>

      <Sheet open={book !== null} onClose={() => setBook(null)} title="cash.book">
        {book && role === 'owner' ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { edit(book); setBook(null) }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold">
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
          <span className="mb-2 flex items-center gap-1"><BiLabel text="cash.book" size="sm" tone="text-muted" bold /><Help term="accounts.book" size="sm" /></span>
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
            <BiInput label="cash.name" value={newName} onChange={(e) => setNewName(e.target.value)} help={<Help term="accounts.name" size="sm" />} />
            <BiInput label="cash.opening" type="number" inputMode="decimal" min={0} value={newOpening} onChange={(e) => setNewOpening(e.target.value)} help={<Help term="accounts.opening" size="sm" />} data-testid="opening-input" />
            <ErrorText error={rename.error} />
            <BiButton text="common.save" full loading={rename.isPending} disabled={!newName.trim() || Number(newOpening) < 0} onClick={async () => { await rename.mutateAsync({ id: editing.id, name: newName.trim(), opening_balance: Number(newOpening || 0) }); await inv(); setEditing(null) }} />
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
