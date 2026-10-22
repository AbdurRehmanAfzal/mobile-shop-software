import { Plus, Lock } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Empty, ErrorText, KV, List, Loading, MoneyText, PageHeader, Row, Sheet, fmtDate } from '@/components/ui'
import { useDocMutation, useGet } from '@/lib/queries'

interface Category { id: string; key: string; name: string; name_ur: string | null }
interface Expense { id: string; no: string; category_name: string | null; category_key: string; amount: string; date: string; description: string | null; staff_name: string | null; party_name: string | null; status: string }
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
            />
          ))}
        </List>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="expense.new">
        <div className="flex flex-col gap-3">
          <BiLabel text="expense.category" size="md" tone="text-muted" />
          <div className="flex flex-wrap gap-1.5">
            {cats?.map((c) => (
              <button key={c.id} type="button" onClick={() => setCatId(c.id)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${catId === c.id ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`}>
                {catName(c)}
              </button>
            ))}
          </div>
          <BiInput label="expense.amount" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <BiInput label="expense.description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!catId || !amount} onClick={async () => { await create.mutateAsync({ category_id: catId, amount: Number(amount), description: desc || undefined }); setAdding(false); setAmount(''); setDesc('') }} />
        </div>
      </Sheet>

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
