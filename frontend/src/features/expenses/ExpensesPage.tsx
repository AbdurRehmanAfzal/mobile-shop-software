import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import RemoveSheet from '@/components/RemoveSheet'
import { Chip, Empty, ErrorText, KV, List, Loading, MoneyText, PageHeader, Row, Sheet, fmtDate } from '@/components/ui'
import { api, post } from '@/lib/api'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

interface Category { id: string; key: string; name: string; name_ur: string | null; is_global: boolean }
interface Expense { id: string; no: string; category_id: string; cash_account_id: string; party_id: string | null; staff_user_id: string | null; notes: string | null; category_name: string | null; category_key: string; amount: string; date: string; description: string | null; staff_name: string | null; party_name: string | null; status: string }
interface Preview { opening: string; cash_in: string; cash_out: string; expected: string; closed: boolean }

export default function ExpensesPage() {
  const { pick, ur } = useLang()
  const { data: cats } = useGet<Category[]>(['exp-cats'], '/api/v1/expenses/categories')
  const { data, isLoading } = useGet<Expense[]>(['expenses'], '/api/v1/expenses')
  const { data: preview } = useGet<Preview>(['day-preview'], '/api/v1/expenses/day-close/preview')
  const [adding, setAdding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [catId, setCatId] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [counted, setCounted] = useState('')
  const create = useDocMutation<Record<string, unknown>, Expense>('POST', () => '/api/v1/expenses')
  const edit = useDocMutation<Record<string, unknown> & { id: string }, Expense>('PUT', (i) => `/api/v1/expenses/${i.id}`, ({ id: _id, ...body }) => body)
  const [current, setCurrent] = useState<Expense | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<Expense | null>(null)
  const [managing, setManaging] = useState(false)
  const [catEdit, setCatEdit] = useState<Category | null>(null)
  const [catRemove, setCatRemove] = useState<Category | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const renameCat = useDocMutation<{ id: string; name: string }, Category>('PATCH', (i) => `/api/v1/expenses/categories/${i.id}`, (i) => ({ name: i.name }))
  const inv = useInvalidate()
  const close = useDocMutation<Record<string, unknown>, unknown>('POST', () => '/api/v1/expenses/day-close')
  const catName = (c: Category) => (ur && c.name_ur ? c.name_ur : c.name)
  const diff = Number(counted || 0) - Number(preview?.expected ?? 0)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="expense.title"
        right={
          <div className="flex gap-2">
            <button type="button" aria-label={pick('expense.dayClose')} onClick={() => setClosing(true)} className="well tap h-11 w-11 border border-line bg-surface">
              <Lock size={18} />
            </button>
            <button type="button" aria-label={pick('expense.new')} onClick={() => setAdding(true)} className="well tap h-11 w-11 bg-emerald text-white shadow-cta">
              <Plus size={22} />
            </button>
          </div>
        }
      />
      {preview ? (
        <div className="hero grid grid-cols-3 gap-2 p-4">
          {([['expense.in', preview.cash_in], ['expense.out', preview.cash_out], ['expense.expected', preview.expected]] as const).map(([k, v]) => (
            <div key={k}>
              <BiLabel text={k} size="sm" tone="text-hero-text/75" />
              <MoneyText value={v} tone="ink" />
            </div>
          ))}
        </div>
      ) : null}
      {isLoading ? <Loading /> : !data?.length ? <Empty text="expense.none" /> : (
        <List>
          {data.map((e) => (
            <Row
              key={e.id}
              title={<span className={e.status === 'voided' ? 'line-through opacity-60' : ''}>{(cats?.find((c) => c.key === e.category_key) && catName(cats.find((c) => c.key === e.category_key)!)) || e.category_name}</span>}
              sub={<span><span dir="ltr">{fmtDate(e.date)}</span>{e.description ? ` · ${e.description}` : ''}{e.staff_name ? ` · ${e.staff_name}` : ''}{e.party_name ? ` · ${e.party_name}` : ''}</span>}
              right={<MoneyText value={-Number(e.amount)} />}
              onClick={e.status === 'voided' ? undefined : () => setCurrent(e)}
            />
          ))}
        </List>
      )}

      <Sheet open={adding} onClose={() => { setAdding(false); setEditingId(null) }} title={editingId ? 'crud.editExpense' : 'expense.new'}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <BiLabel text="expense.category" size="md" tone="text-muted" />
            <button type="button" onClick={() => setManaging(true)} className="text-xs font-bold text-emerald">{pick('crud.categories')}</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cats?.map((c) => (
              <button key={c.id} type="button" onClick={() => setCatId(c.id)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${catId === c.id ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>
                {catName(c)}
              </button>
            ))}
          </div>
          <BiInput label="expense.amount" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <BiInput label="expense.description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <ErrorText error={editingId ? edit.error : create.error} />
          <BiButton
            text="common.save"
            full
            loading={create.isPending || edit.isPending}
            disabled={!catId || !amount}
            onClick={async () => {
              const body = { category_id: catId, amount: Number(amount), description: desc || undefined }
              const old = data?.find((x) => x.id === editingId)
              // edit = the old expense is cancelled and a corrected one is posted; keep its account, date and links
              if (old) await edit.mutateAsync({ ...body, id: old.id, cash_account_id: old.cash_account_id, date: old.date, party_id: old.party_id, staff_user_id: old.staff_user_id, notes: old.notes })
              else await create.mutateAsync(body)
              setAdding(false)
              setEditingId(null)
              setAmount('')
              setDesc('')
            }}
          />
        </div>
      </Sheet>

      <Sheet open={current !== null} onClose={() => setCurrent(null)} title={{ en: current?.no ?? '', ur: current?.no ?? '' }}>
        {current ? (
          <div className="flex flex-col gap-3">
            <div className="card">
              <KV k="expense.amount" v={<MoneyText value={current.amount} tone="ink" />} />
              <KV k="common.date" v={<span dir="ltr">{fmtDate(current.date)}</span>} />
              {current.description ? <KV k="expense.description" v={current.description} /> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setCatId(current.category_id); setAmount(String(Number(current.amount))); setDesc(current.description ?? ''); setEditingId(current.id); setCurrent(null); setAdding(true) }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold">
                <Pencil size={16} /> {pick('common.edit')}
              </button>
              <button type="button" onClick={() => { setCancelling(current); setCurrent(null) }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold text-payable">
                <Trash2 size={16} /> {pick('crud.cancelExpense')}
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>

      <RemoveSheet
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="crud.cancelExpense"
        hint="crud.cancelExpenseHint"
        reason
        name={cancelling ? <MoneyText value={cancelling.amount} tone="ink" /> : ''}
        onConfirm={async (reason) => {
          await post(`/api/v1/expenses/${cancelling!.id}/void`, { reason })
          await inv()
        }}
      />

      <Sheet open={managing} onClose={() => setManaging(false)} title="crud.categories">
        <List>
          {cats?.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">{catName(c)}</span>
              {c.is_global ? <Chip text="catalogue.builtin" /> : (
                <>
                  <button type="button" aria-label={pick('catalogue.rename')} onClick={() => { setNewCatName(c.name); setCatEdit(c) }} className="well tap h-9 w-9 border border-line bg-surface"><Pencil size={15} /></button>
                  <button type="button" aria-label={pick('crud.delete')} onClick={() => setCatRemove(c)} className="well tap h-9 w-9 text-payable"><Trash2 size={15} /></button>
                </>
              )}
            </div>
          ))}
        </List>
      </Sheet>

      <Sheet open={catEdit !== null} onClose={() => setCatEdit(null)} title="catalogue.rename">
        {catEdit ? (
          <div className="flex flex-col gap-3">
            <BiInput label="catalogue.namePh" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} autoFocus />
            <ErrorText error={renameCat.error} />
            <BiButton text="common.save" full loading={renameCat.isPending} disabled={!newCatName.trim()} onClick={async () => { await renameCat.mutateAsync({ id: catEdit.id, name: newCatName.trim() }); setCatEdit(null) }} />
          </div>
        ) : null}
      </Sheet>

      <RemoveSheet
        open={catRemove !== null}
        onClose={() => setCatRemove(null)}
        name={catRemove ? catName(catRemove) : ''}
        onConfirm={async () => {
          await api('DELETE', `/api/v1/expenses/categories/${catRemove!.id}`)
          if (catId === catRemove!.id) setCatId('')
          await inv()
        }}
      />

      <Sheet open={closing} onClose={() => setClosing(false)} title="expense.dayClose">
        {preview ? (
          <div className="flex flex-col gap-3">
            <div className="card">
              <KV k="expense.opening" v={<MoneyText value={preview.opening} tone="ink" />} />
              <KV k="expense.in" v={<MoneyText value={preview.cash_in} tone="ink" />} />
              <KV k="expense.out" v={<MoneyText value={preview.cash_out} tone="ink" />} />
              <KV k="expense.expected" v={<MoneyText value={preview.expected} tone="ink" size="lg" />} />
            </div>
            {preview.closed ? <BiLabel text="expense.alreadyClosed" size="md" bold tone="text-emerald-deep" align="center" /> : (
              <>
                <BiInput label="expense.counted" type="number" inputMode="decimal" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
                {counted !== '' ? <KV k="expense.difference" v={<MoneyText value={diff} />} /> : null}
                <ErrorText error={close.error} />
                <BiButton text="expense.dayClose" full loading={close.isPending} disabled={counted === ''} onClick={async () => { await close.mutateAsync({ counted: Number(counted) }); setClosing(false) }} />
              </>
            )}
          </div>
        ) : <Loading />}
      </Sheet>
    </div>
  )
}
