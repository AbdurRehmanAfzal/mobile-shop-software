import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BalanceLabel, BtnText, Empty, List, Loading, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useParties } from '@/lib/queries'
import PartyForm from './PartyForm'

type Filter = 'all' | 'customer' | 'supplier' | 'shop' | 'balance'
// each filter means something different: the "?" beside them explains the open one (docs/33)
const FILTERS: { value: Filter; text: string; help: string }[] = [
  { value: 'all', text: 'common.all', help: 'party.filter.all' },
  { value: 'customer', text: 'party.customer', help: 'party.filter.customer' },
  { value: 'supplier', text: 'party.supplier', help: 'party.filter.supplier' },
  { value: 'shop', text: 'party.shop', help: 'party.filter.shop' },
  { value: 'balance', text: 'party.withBalance', help: 'party.filter.balance' },
]

export default function PartiesPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [q, setQ] = useState('')
  // the shop audit's people counts open this list on one kind (docs/31)
  const [sp] = useSearchParams()
  const [filter, setFilter] = useState<Filter>(((['customer', 'supplier', 'shop'] as const).find((k) => k === sp.get('kind')) ?? 'all') as Filter)
  const [adding, setAdding] = useState(false)
  const params = { q: q || undefined, kind: filter === 'all' || filter === 'balance' ? undefined : filter, with_balance: filter === 'balance' ? true : undefined }
  const { data, isLoading } = useParties(params)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="party.title"
        back={false}
        help={<Help term="khata" />}
        right={
          <button type="button" aria-label={pick('party.new')} onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground">
            <Plus size={22} />
          <BtnText k={'party.new'} /></button>
        }
      />
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="party.searchPlaceholder" /></div><Help term="common.search" size="sm" /></div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiSegmented<Filter> value={filter} onChange={setFilter} options={FILTERS} /></div>
        <Help term={FILTERS.find((x) => x.value === filter)!.help} size="sm" />
      </div>
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
