import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { BiButton, BiInput, BiLabel, BiSegmented } from '@/components/Bilingual'
import { Chip, ErrorText, List, Loading, MoneyText, PageHeader, Row, Sheet, fmtDate } from '@/components/ui'
import { useDocMutation, useLoans } from '@/lib/queries'
import type { Loan } from '@/lib/types'

export default function LoansPage() {
  const nav = useNavigate()
  const [status, setStatus] = useState<'out' | 'returned' | 'sold'>('out')
  const { data, isLoading } = useLoans({ status })
  const [selling, setSelling] = useState<Loan | null>(null)
  const [price, setPrice] = useState('')
  const [paid, setPaid] = useState('')
  const ret = useDocMutation<{ id: string }, Loan>('POST', (i) => `/api/v1/loans/${i.id}/return`, () => ({}))
  const sell = useDocMutation<{ id: string; price: number; paid: number }, Loan>('POST', (i) => `/api/v1/loans/${i.id}/sell`, (i) => ({ price: i.price, paid: i.paid }))

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="loan.title" />
      <BiLabel text="counter.loanHint" size="sm" tone="text-muted" />
      <BiSegmented value={status} onChange={setStatus} options={[{ value: 'out', text: 'loan.out' }, { value: 'returned', text: 'loan.returned' }, { value: 'sold', text: 'loan.sold' }]} />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <span className="well h-14 w-14 rounded-2xl bg-stockt text-stockt-icon"><RotateCcw size={26} /></span>
          <BiLabel text="loan.none" size="md" align="center" tone="text-muted" />
        </div>
      ) : (
        <List>
          {data.map((l) => (
            <div key={l.id}>
              <Row
                title={l.device_label}
                sub={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span dir="ltr">{l.imei1}</span> · {l.party_name} · <span dir="ltr">{fmtDate(l.out_at)}</span>
                    {l.overdue ? <Chip text="loan.overdue" tone="bad" /> : null}
                  </span>
                }
                onClick={() => nav(`/stock/${l.device_id}`)}
              />
              {l.status === 'out' ? (
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  <BiButton text="loan.markReturned" size="sm" variant="secondary" loading={ret.isPending} onClick={() => ret.mutate({ id: l.id })} />
                  <BiButton text="loan.sellToShop" size="sm" variant="gold" onClick={() => { setSelling(l); setPrice(''); setPaid('') }} />
                </div>
              ) : null}
            </div>
          ))}
        </List>
      )}
      <ErrorText error={ret.error} />
      <Sheet open={selling !== null} onClose={() => setSelling(null)} title="loan.sellToShop">
        {selling ? (
          <div className="flex flex-col gap-3">
            <div className="card">
              <div className="font-semibold">{selling.device_label}</div>
              <div className="text-xs text-muted">{selling.party_name}</div>
            </div>
            <BiInput label="loan.price" type="number" inputMode="decimal" min={0} value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
            <BiInput label="sale.paidNow" type="number" inputMode="decimal" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} />
            <div className="card flex items-center justify-between text-sm">
              <span className="text-muted">=</span>
              <MoneyText value={Number(price || 0) - Number(paid || 0)} />
            </div>
            <ErrorText error={sell.error} />
            <BiButton text="common.confirm" full loading={sell.isPending} disabled={!price} onClick={async () => { await sell.mutateAsync({ id: selling.id, price: Number(price), paid: Number(paid || 0) }); setSelling(null) }} />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
