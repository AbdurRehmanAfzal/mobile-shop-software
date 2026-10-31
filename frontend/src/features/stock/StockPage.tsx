import DownloadButton from '@/components/DownloadButton'
import { ArrowUpDown, PackagePlus, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang, BiInput, BiLabel } from '@/components/Bilingual'
import { BtnText, Chip, Empty, ErrorText, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useBrands, useDevices, useInvalidate } from '@/lib/queries'
import { beep, useScan } from '@/lib/scanner'
import { lookupCode } from '@/components/ScanListener'
import type { Device } from '@/lib/types'
import ImeiLookupSheet from './ImeiLookupSheet'
import LabelSheet from '@/components/LabelSheet'
import { api } from '@/lib/api'
import { Tag } from 'lucide-react'
import { BiButton } from '@/components/Bilingual'

type Filter = 'in_stock' | 'on_loan' | 'sold' | 'faulty' | 'all'

/** what matters for this kind of device, e.g. "128GB · Black", "45mm · GPS · Battery 91%" */
export function specLine(d: Device, pick: (k: string) => string, withColour = true): string {
  const cat = d.category ?? 'phone'
  return [
    cat === 'watch' ? (d.size_mm ? `${d.size_mm}mm` : null) : d.storage_name,
    cat === 'phone' ? null : pick(d.cellular ? 'devx.simShort' : cat === 'tablet' ? 'devx.wifiShort' : 'devx.gpsShort'),
    withColour ? d.colour_name : null,
    d.battery_health ? pick('devx.bh').replace('{{n}}', String(d.battery_health)) : null,
  ].filter(Boolean).join(' · ')
}

/** PTA means something only for a phone or a tablet / watch that takes a SIM */
export const hasPta = (d: Device) => (d.category ?? 'phone') === 'phone' || !!d.cellular

export function DeviceRow({ d, onClick }: { d: Device; onClick?: () => void }) {
  const { pick } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  return (
    <Row
      title={[`${d.brand_name} ${d.model_name}`, specLine(d, pick)].filter(Boolean).join(' · ')}
      sub={
        <span className="flex flex-wrap items-center gap-1.5">
          <span dir="ltr">{d.imei1}</span>
          <Chip text={`stock.condition.${d.condition}`} />
          {hasPta(d) && d.pta_status !== 'pta_approved' ? <Chip text={`stock.pta.${d.pta_status}`} tone="warn" /> : null}
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
export function DeviceCard({ d, onOpen, onSell, selected, onSelect }: { d: Device; onOpen: () => void; onSell?: () => void; selected?: boolean; onSelect?: () => void }) {
  const { pick } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  const stats: [string, string][] = [
    d.category === 'watch' ? ['devx.sizeShort', d.size_mm ? `${d.size_mm}mm` : '—'] : ['stock.storageShort', d.storage_name ?? '—'],
    hasPta(d) ? ['stock.ptaShort', pick(`stock.pta.${d.pta_status}`)] : ['devx.simLabel', pick(d.category === 'tablet' ? 'devx.wifiShort' : 'devx.gpsShort')],
    ['stock.conditionShort', pick(`stock.condition.${d.condition}`)],
    ['stock.daysIn', String(daysSince(d.last_event_at))],
  ]
  return (
    <div className={`card flex flex-col gap-3 p-4 ${selected ? 'ring-2 ring-emerald' : ''}`}>
      {onSelect ? <label className="tap flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={!!selected} onChange={onSelect} className="h-6 w-6 accent-[rgb(var(--emerald))]" /><span className="text-sm font-bold">{pick('label.pick')}</span></label> : null}
      <button type="button" onClick={onOpen} className="tap flex items-start justify-between gap-3 text-start">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold text-ink">{d.brand_name} {d.model_name}</div>
          <div className="truncate text-sm font-semibold text-emerald">{[d.colour_name, specLine(d, pick, false)].filter(Boolean).join(' · ') || '—'}</div>
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
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  // opened from the Shop Audit: condition / PTA / type come in the link
  const [preset] = useState(() => { const sp = new URLSearchParams(window.location.search); return { condition: sp.get('condition') ?? undefined, pta_status: sp.get('pta_status') ?? undefined, category: sp.get('category') ?? undefined } })
  const [filter, setFilter] = useState<Filter>('in_stock')
  const [brand, setBrand] = useState<string>('')
  const [sort, setSort] = useState<Sort>('newest')
  const [lookup, setLookup] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [labels, setLabels] = useState(false)
  // owner addendum 6: grade / RAM / price range / lock-unchecked filters, and a type change for the picked units
  const [more, setMore] = useState(false)
  const [fx, setFx] = useState({ grade: '', ram: '', min: '', max: '', lock: false })
  const [retype, setRetype] = useState(false)
  const [toCat, setToCat] = useState<'phone' | 'tablet' | 'watch'>('tablet')
  const [retypeRows, setRetypeRows] = useState<{ id: string; imei1: string; problems: string[] }[] | null>(null)
  const [retypeErr, setRetypeErr] = useState<unknown>(null)
  const { data, isLoading } = useDevices({ q: q || undefined, status: filter === 'all' ? undefined : filter, ...preset, limit: 500, grade: fx.grade || undefined, ram_gb: fx.ram ? Number(fx.ram) : undefined, price_min: fx.min ? Number(fx.min) : undefined, price_max: fx.max ? Number(fx.max) : undefined, lock_unchecked: fx.lock || undefined })
  useScan(async (code) => {
    const r = await lookupCode(code).catch(() => null)
    if (r?.kind === 'device' && r.device) { beep('ok'); nav(`/stock/${r.device.id}`) } else if (r?.kind === 'item' && r.item) { beep('ok'); nav(`/accessories?q=${encodeURIComponent(r.item.sku)}`) } else { beep('error'); setQ(code) }
  })
  const { data: brands } = useBrands()
  const inv = useInvalidate()

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
            <DownloadButton path={`/api/v1/exports/stock?status=${filter}`} name="stock" />
            <button type="button" aria-pressed={picking} aria-label={pick('label.many')} onClick={() => { setPicking(!picking); setPicked([]) }} className={`tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border ${picking ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>
              <Tag size={20} />
            <BtnText k={'label.many'} /></button>
            <button type="button" aria-label={pick('stock.imeiLookup')} onClick={() => setLookup(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
              <ScanLine size={20} />
            <BtnText k={'stock.imeiLookup'} /></button>
            <button type="button" aria-label={pick('counter.addStock')} onClick={() => nav('/purchase/new')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground">
              <PackagePlus size={20} />
            <BtnText k={'counter.addStock'} /></button>
          </div>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />

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

      {/* owner 2026-10-27: the phone's own dropdown list mixed the chosen line's text with its colour;
          plain buttons show which one is on */}
      <div className="flex flex-wrap gap-1.5">
        {(['in_stock', 'on_loan', 'sold', 'faulty', 'all'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`tap h-11 shrink-0 rounded-full border-2 px-4 font-bold ${filter === f ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`}>
            {f === 'all' ? pick('common.all') : pick(`stock.status.${f}`)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
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
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={more} onClick={() => setMore(!more)} className={`tap h-9 rounded-full border-2 px-3 text-[12px] font-bold ${more || fx.grade || fx.ram || fx.min || fx.max || fx.lock ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`} data-testid="stock-filters">{pick('devx.filters')}</button>
        {fx.lock ? <span className="tap h-9 rounded-full border-2 border-ink bg-ink px-3 text-[12px] font-bold leading-8 text-ground">{pick('devx.lockUnchecked')}</span> : null}
      </div>
      {more ? (
        <div className="card grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><BiLabel text="devx.grade" size="sm" tone="text-muted" /><select value={fx.grade} onChange={(e) => setFx({ ...fx, grade: e.target.value })} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-bold"><option value="">{pick('devx.anyGrade')}</option>{['a', 'b', 'refurbished', 'copy'].map((g) => <option key={g} value={g}>{pick(`devx.grades.${g}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1"><BiLabel text="devx.ram" size="sm" tone="text-muted" /><select value={fx.ram} onChange={(e) => setFx({ ...fx, ram: e.target.value })} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-bold"><option value="">{pick('devx.anyRam')}</option>{[2, 3, 4, 6, 8, 12, 16].map((g) => <option key={g} value={g}>{g} GB</option>)}</select></label>
          <BiInput label="devx.priceMin" type="number" inputMode="numeric" min={0} value={fx.min} onChange={(e) => setFx({ ...fx, min: e.target.value })} className="num" />
          <BiInput label="devx.priceMax" type="number" inputMode="numeric" min={0} value={fx.max} onChange={(e) => setFx({ ...fx, max: e.target.value })} className="num" />
          <button type="button" role="switch" aria-checked={fx.lock} onClick={() => setFx({ ...fx, lock: !fx.lock })} className="tap col-span-2 flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-ground px-4 text-start"><span className="flex-1"><BiLabel text="devx.lockUnchecked" size="md" bold /></span><span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${fx.lock ? 'bg-emerald' : 'bg-line'}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${fx.lock ? 'translate-x-5 rtl:-translate-x-5' : ''}`} /></span></button>
        </div>
      ) : null}
      {data ? <div className="text-xs font-semibold text-muted">{t('stock.count', { n: rows.length })}</div> : null}

      {isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty text={q || brand ? 'common.nothingFound' : 'stock.noDevices'} />
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {rows.map((d) => (
            <DeviceCard key={d.id} d={d} onOpen={() => nav(`/stock/${d.id}`)} onSell={() => nav(`/sale/new?device=${d.id}`)} selected={picked.includes(d.id)} onSelect={picking ? () => setPicked((x) => (x.includes(d.id) ? x.filter((i) => i !== d.id) : [...x, d.id])) : undefined} />
          ))}
        </div>
      )}
      {picking ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 lg:bottom-4">
          <BiButton text="label.selectAll" variant="secondary" onClick={() => setPicked(rows.map((d) => d.id))} />
          <BiButton text={{ en: `${pick('label.printN').replace('{{n}}', String(picked.length))}`, ur: `${pick('label.printN').replace('{{n}}', String(picked.length))}`, roman: `${pick('label.printN').replace('{{n}}', String(picked.length))}` }} icon={<Tag size={20} />} className="flex-1" disabled={!picked.length} onClick={() => setLabels(true)} />
          <BiButton text="devx.retype" variant="secondary" disabled={!picked.length} onClick={() => { setRetypeRows(null); setRetypeErr(null); setRetype(true) }} />
        </div>
      ) : null}
      <Sheet open={retype} onClose={() => setRetype(false)} title="devx.retype">
        <div className="flex flex-col gap-3">
          <BiLabel text="devx.retypeHint" size="sm" tone="text-muted" />
          <div className="grid grid-cols-3 gap-2">
            {(['phone', 'tablet', 'watch'] as const).map((c) => <button key={c} type="button" aria-pressed={toCat === c} onClick={() => { setToCat(c); setRetypeRows(null) }} className={`tap min-h-12 rounded-2xl border-2 font-bold ${toCat === c ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{pick(`devcat.${c}`)}</button>)}
          </div>
          {retypeRows ? <div className="card flex flex-col gap-1 text-sm">{retypeRows.map((r) => <div key={r.id} className="flex justify-between gap-2"><span className="num" dir="ltr">{r.imei1}</span><span className={r.problems.length ? 'text-payable' : 'text-emerald-deep'}>{r.problems.length ? r.problems.map((p) => pick(`devx.problem.${p}`)).join(', ') : '✓'}</span></div>)}</div> : null}
          <ErrorText error={retypeErr} />
          {!retypeRows ? <BiButton text="devx.retypePreview" full onClick={async () => { try { setRetypeRows(await api('POST', '/api/v1/devices/reclassify/preview', { device_ids: picked, to_category: toCat })) } catch (e) { setRetypeErr(e) } }} /> : <BiButton text="devx.retypeApply" full disabled={retypeRows.some((r) => r.problems.length)} onClick={async () => { try { await api('POST', '/api/v1/devices/reclassify/apply', { device_ids: picked, to_category: toCat }); await inv('devices'); setRetype(false); setPicked([]) } catch (e) { setRetypeErr(e) } }} />}
        </div>
      </Sheet>
      <LabelSheet kind="devices" ids={picked} open={labels} onClose={() => setLabels(false)} />
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
