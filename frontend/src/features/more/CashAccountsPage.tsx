import { Plus } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { ErrorText, List, MoneyText, PageHeader, Row, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useCashAccounts, useDocMutation, useGet } from '@/lib/queries'
import type { CashAccount } from '@/lib/types'

type Kind = CashAccount['kind']
interface Book { opening_balance: string; closing_balance: string; rows: { entry_id: string; at: string; memo: string | null; in: string; out: string; balance: string; reversed: boolean }[] }

export default function CashAccountsPage() {
  const { ur } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data } = useCashAccounts()
  const [adding, setAdding] = useState(false)
  const [book, setBook] = useState<CashAccount | null>(null)
  const [f, setF] = useState({ kind: 'easypaisa' as Kind, name: '', account_no: '', opening_balance: '' })
  const { data: rows } = useGet<Book>(['book', book?.id], book && role !== 'salesman' ? `/api/v1/ledger/accounts/${book.id}/book` : null)
  const create = useDocMutation<Record<string, unknown>, CashAccount>('POST', () => '/api/v1/ledger/accounts')
  const label = (a: CashAccount) => (ur && a.name_ur ? a.name_ur : a.name)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="cash.title" right={role === 'owner' ? <button type="button" aria-label="add" onClick={() => setAdding(true)} className="well tap h-11 w-11 bg-emerald text-white shadow-cta"><Plus size={22} /></button> : undefined} />
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
    </div>
  )
}
