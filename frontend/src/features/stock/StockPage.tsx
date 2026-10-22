import { Download, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiSegmented, useLang } from '@/components/Bilingual'
import { Chip, Empty, List, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useDevices } from '@/lib/queries'
import type { Device } from '@/lib/types'
import ImeiLookupSheet from './ImeiLookupSheet'

type Filter = 'in_stock' | 'on_loan' | 'sold' | 'faulty' | 'all'

export function DeviceRow({ d, onClick }: { d: Device; onClick?: () => void }) {
  const { pick } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  return (
    <Row
      title={`${d.brand_name} ${d.model_name}${d.storage_name ? ` · ${d.storage_name}` : ''}${d.colour_name ? ` · ${d.colour_name}` : ''}`}
      sub={
        <span className="flex flex-wrap items-center gap-1.5">
          <span dir="ltr">{d.imei1}</span>
          <Chip text={`stock.condition.${d.condition}`} />
          {d.pta_status !== 'pta_approved' ? <Chip text={`stock.pta.${d.pta_status}`} tone="warn" /> : null}
          {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
        </span>
      }
      right={
        <div className="flex flex-col items-end gap-1">
          {d.asking_price ? <MoneyText value={d.asking_price} tone="ink" /> : null}
          <span className="text-[11px] font-bold text-muted">{pick(`stock.status.${d.status}`)}</span>
        </div>
      }
      onClick={onClick}
    />
  )
}

export default function StockPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('in_stock')
  const [lookup, setLookup] = useState(false)
  const { data, isLoading } = useDevices({ q: q || undefined, status: filter === 'all' ? undefined : filter })

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="stock.title"
        back={false}
        right={
          <div className="flex gap-2">
            <button type="button" aria-label={pick('stock.imeiLookup')} onClick={() => setLookup(true)} className="well tap h-11 w-11 border border-line bg-surface">
              <ScanLine size={20} />
            </button>
            <button type="button" aria-label={pick('purchase.title')} onClick={() => nav('/purchase/new')} className="well tap h-11 w-11 bg-emerald text-white shadow-cta">
              <Download size={20} />
            </button>
          </div>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />
      <BiSegmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'in_stock', text: 'stock.status.in_stock' },
          { value: 'on_loan', text: 'stock.status.on_loan' },
          { value: 'sold', text: 'stock.status.sold' },
          { value: 'faulty', text: 'stock.status.faulty' },
          { value: 'all', text: 'common.all' },
        ]}
      />
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty text={q ? 'common.nothingFound' : 'stock.noDevices'} />
      ) : (
        <List>
          {data.map((d) => (
            <DeviceRow key={d.id} d={d} onClick={() => nav(`/stock/${d.id}`)} />
          ))}
        </List>
      )}
      <Sheet open={lookup} onClose={() => setLookup(false)} title="stock.imeiLookup">
        <ImeiLookupSheet onOpenDevice={(id) => { setLookup(false); nav(`/stock/${id}`) }} onBuy={(imei) => { setLookup(false); nav(`/purchase/new?imei=${imei}`) }} />
      </Sheet>
    </div>
  )
}
