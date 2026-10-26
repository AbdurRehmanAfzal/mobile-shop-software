import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiSegmented, useLang } from '@/components/Bilingual'
import { BalanceLabel, Empty, List, Loading, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useParties } from '@/lib/queries'
import PartyForm from './PartyForm'

type Filter = 'all' | 'customer' | 'supplier' | 'shop' | 'balance'

export default function PartiesPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const params = { q: q || undefined, kind: filter === 'all' || filter === 'balance' ? undefined : filter, with_balance: filter === 'balance' ? true : undefined }
  const { data, isLoading } = useParties(params)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="party.title"
        back={false}
        right={
          <button type="button" aria-label={pick('party.new')} onClick={() => setAdding(true)} className="well tap h-11 w-11 bg-ink text-ground">
            <Plus size={22} />
          </button>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="party.searchPlaceholder" />
      <BiSegmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', text: 'common.all' },
          { value: 'customer', text: 'party.customer' },
          { value: 'supplier', text: 'party.supplier' },
          { value: 'shop', text: 'party.shop' },
          { value: 'balance', text: 'party.withBalance' },
        ]}
      />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty text={q ? 'common.nothingFound' : 'party.noParties'} />
      ) : (
        <List>
          {data.map((p) => (
            <Row key={p.id} title={p.name} sub={<span dir="ltr">{p.phone}</span>} right={<BalanceLabel value={p.balance} />} onClick={() => nav(`/parties/${p.id}`)} />
          ))}
        </List>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="party.new">
        <PartyForm
          onDone={(p) => {
            setAdding(false)
            nav(`/parties/${p.id}`)
          }}
        />
      </Sheet>
    </div>
  )
}
