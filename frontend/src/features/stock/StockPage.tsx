import { ArrowUpDown, ChevronDown, FileSpreadsheet, PackagePlus, ScanLine } from 'lucide-react'
import { downloadFile } from '@/lib/files'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/components/Bilingual'
import { BtnText, Chip, Empty, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useBrands, useDevices } from '@/lib/queries'
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

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

/** Offer-style card (owner's UI guide: Easypaisa "Buy Package"): title + price, stat columns, pill CTA. */
export function DeviceCard({ d, onOpen, onSell }: { d: Device; onOpen: () => void; onSell?: () => void }) {
  const { pick } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  const stats: [string, string][] = [
    ['stock.storageShort', d.storage_name ?? '—'],
    ['stock.ptaShort', pick(`stock.pta.${d.pta_status}`)],
    ['stock.conditionShort', pick(`stock.condition.${d.condition}`)],
    ['stock.daysIn', String(daysSince(d.last_event_at))],
  ]
  return (
    <div className="card flex flex-col gap-3 p-4">
      <button type="button" onClick={onOpen} className="tap flex items-start justify-between gap-3 text-start">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold text-ink">{d.brand_name} {d.model_name}</div>
          <div className="truncate text-sm font-semibold text-emerald">{[d.colour_name, d.storage_name].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        {d.asking_price ? <MoneyText value={d.asking_price} tone="ink" size="lg" /> : null}
      </button>
      <div className="grid grid-cols-4 border-y border-line py-2">
        {stats.map(([k, v], i) => (
          <div key={k} className={`flex flex-col items-center gap-0.5 px-1 text-center ${i ? 'border-s border-line' : ''}`}>
            <span className="text-[11px] text-muted">{pick(k)}</span>
            <span className="truncate text-sm font-bold text-ink" dir="auto">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted">
          <span dir="ltr">{d.imei1}</span>
          {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
          {d.status !== 'in_stock' ? <Chip text={`stock.status.${d.status}`} tone="ink" /> : null}
        </div>
        {onSell && d.status === 'in_stock' && d.verification_status !== 'flagged' ? (
          <button type="button" onClick={onSell} className="tap min-h-11 shrink-0 rounded-full bg-emerald px-6 text-sm font-bold text-white shadow-cta">
            {pick('stock.sell')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

type Sort = 'newest' | 'oldest' | 'priceLow' | 'priceHigh'

export default function StockPage() {
  const nav = useNavigate()
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('in_stock')
  const [brand, setBrand] = useState<string>('')
  const [sort, setSort] = useState<Sort>('newest')
  const [lookup, setLookup] = useState(false)
  const { data, isLoading } = useDevices({ q: q || undefined, status: filter === 'all' ? undefined : filter, limit: 500 })
  const { data: brands } = useBrands()

  const counts = new Map<string, number>()
  for (const d of data ?? []) counts.set(d.brand_id, (counts.get(d.brand_id) ?? 0) + 1)
  const brandRow = (brands ?? []).filter((b) => counts.has(b.id))
  const rows = [...(data ?? [])]
    .filter((d) => !brand || d.brand_id === brand)
    .sort((a, b) =>
      sort === 'priceLow'
        ? Number(a.asking_price ?? 0) - Number(b.asking_price ?? 0)
        : sort === 'priceHigh'
          ? Number(b.asking_price ?? 0) - Number(a.asking_price ?? 0)
          : sort === 'oldest'
            ? a.last_event_at.localeCompare(b.last_event_at)
            : b.last_event_at.localeCompare(a.last_event_at),
    )

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="stock.title"
        back={false}
        right={
          <div className="flex gap-2">
            <button type="button" aria-label={pick('export.stock')} onClick={() => downloadFile(`/api/v1/exports/stock.csv?status=${filter}`, 'stock.csv')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
              <FileSpreadsheet size={20} />
            <BtnText k={'export.stock'} /></button>
            <button type="button" aria-label={pick('stock.imeiLookup')} onClick={() => setLookup(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
              <ScanLine size={20} />
            <BtnText k={'stock.imeiLookup'} /></button>
            <button type="button" aria-label={pick('counter.addStock')} onClick={() => nav('/purchase/new')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground">
              <PackagePlus size={20} />
            <BtnText k={'counter.addStock'} /></button>
          </div>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" />

      {brandRow.length ? (
        <div className="card -mx-1 flex gap-1 overflow-x-auto p-1.5">
          {[{ id: '', name: pick('stock.allBrands'), name_ur: null as string | null }, ...brandRow].map((b) => {
            const on = brand === b.id
            const label = ur && b.name_ur ? b.name_ur : b.name
            return (
              <button key={b.id || 'all'} type="button" onClick={() => setBrand(b.id)} className={`tap flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 ${on ? 'bg-emerald-tint' : ''}`}>
                <span className={`well h-9 w-9 rounded-full text-sm font-extrabold ${on ? 'bg-emerald text-white' : 'bg-ground text-ink'}`}>{b.id ? b.name.slice(0, 2).toUpperCase() : '★'}</span>
                <span className={`whitespace-nowrap text-xs font-bold ${on ? 'text-emerald-deep' : 'text-muted'}`}>
                  {label}
                  {b.id ? ` · ${counts.get(b.id)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex gap-2">
        <label className="relative flex-1">
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="min-h-11 w-full appearance-none rounded-xl border border-line bg-surface pe-8 ps-3 text-sm font-bold">
            {(['in_stock', 'on_loan', 'sold', 'faulty', 'all'] as Filter[]).map((f) => (
              <option key={f} value={f}>
                {f === 'all' ? pick('common.all') : pick(`stock.status.${f}`)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-emerald" />
        </label>
        <label className="relative flex-1">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 w-full appearance-none rounded-xl border border-line bg-surface pe-8 ps-3 text-sm font-bold">
            {(['newest', 'oldest', 'priceLow', 'priceHigh'] as Sort[]).map((o) => (
              <option key={o} value={o}>
                {pick(`stock.${o}`)}
              </option>
            ))}
          </select>
          <ArrowUpDown size={16} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-emerald" />
        </label>
      </div>
      {data ? <div className="text-xs font-semibold text-muted">{t('stock.count', { n: rows.length })}</div> : null}

      {isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty text={q || brand ? 'common.nothingFound' : 'stock.noDevices'} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((d) => (
            <DeviceCard key={d.id} d={d} onOpen={() => nav(`/stock/${d.id}`)} onSell={() => nav(`/sale/new?device=${d.id}`)} />
          ))}
        </div>
      )}
      <Sheet open={lookup} onClose={() => setLookup(false)} title="stock.imeiLookup">
        <ImeiLookupSheet
          onOpenDevice={(id) => {
            setLookup(false)
            nav(`/stock/${id}`)
          }}
          onBuy={(imei) => {
            setLookup(false)
            nav(`/purchase/new?imei=${imei}`)
          }}
        />
      </Sheet>
    </div>
  )
}
