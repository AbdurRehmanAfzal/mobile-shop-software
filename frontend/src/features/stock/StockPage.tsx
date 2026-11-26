import DownloadButton from '@/components/DownloadButton'
import PriceListsButton from './PriceListsButton'
import { FaultChip } from './Faults'
import { ArrowUpDown, FileDown, PackagePlus, ScanLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang, BiLabel } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BtnText, Chip, Empty, ErrorText, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useBrands, useDevices, useGet, useInvalidate } from '@/lib/queries'
import { useAuth } from '@/lib/auth'
import { beep, useScan } from '@/lib/scanner'
import { lookupCode } from '@/components/ScanListener'
import type { Device, Party } from '@/lib/types'
import ImeiLookupSheet from './ImeiLookupSheet'
import LabelSheet from '@/components/LabelSheet'
import { api } from '@/lib/api'
import { Tag } from 'lucide-react'
import { BiButton } from '@/components/Bilingual'
import { simTypeText } from '@/features/purchase/AppleVariant'
import { ItemsInStock, KindTabs, StatusCards, type Kind, type Mode } from './StockCards'
import { ActiveChips, DEFAULT_SEL, FilterSheet, FiltersButton, NO_FX, NO_SEL, fxCount, selCount, type Fx, type Sel } from './StockFilters'
import { FieldsButton, StockGrid, StockList, StockTable, ViewSwitch, fieldBits, loadFields, loadView, saveFields, saveView, sortRows, FIELDS, type ColSort, type FieldKey, type StockView } from './StockViews'
import DeviceActions from './DeviceActions'
import { StockTabs } from './StockHub'

interface Kept { sel: Sel; sort: Sort; kind: Kind; mode: Mode; fx: Fx }
const KEEP = 'stock.filters.v2' // ADR-091: tick-box filters
function readKept(): Kept | null {
  try { return JSON.parse(sessionStorage.getItem(KEEP) ?? 'null') } catch { return null }
}
function writeKept(k: Kept) {
  try { sessionStorage.setItem(KEEP, JSON.stringify(k)) } catch { /* private mode */ }
}

/** what matters for this kind of device, e.g. "128GB · Black", "45mm · GPS · Battery 91%" */
/** a laptop as shopkeepers name it: "Core i5 8th Gen · 8GB · 256GB SSD · 14" · RTX 3060 6GB" (ADR-108; the server prints the same line on bills and stickers) */
export function laptopLine(d: Device): string {
  const s = d.specs ?? {}
  const cpu = [s.cpu, s.cpu_gen].filter(Boolean).join(' ')
  let drive = [d.storage_name, s.storage_type].filter(Boolean).join(' ')
  if (s.storage2) drive = drive ? `${drive} + ${s.storage2}` : String(s.storage2)
  const gpu = s.gpu ? `${s.gpu}${s.gpu_gb ? ` ${s.gpu_gb}GB` : ''}` : ''
  return [cpu, d.ram_gb ? `${d.ram_gb}GB` : '', drive, s.display_in ? `${s.display_in}"` : '', gpu].filter(Boolean).join(' · ')
}

export function specLine(d: Device, pick: (k: string) => string, withColour = true): string {
  const cat = d.category ?? 'phone'
  return [
    cat === 'laptop' ? laptopLine(d) || null : cat === 'watch' ? (d.size_mm ? `${d.size_mm}mm` : null) : d.storage_name,
    cat === 'phone' || cat === 'laptop' ? null : pick(d.cellular ? 'devx.simShort' : cat === 'tablet' ? 'devx.wifiShort' : 'devx.gpsShort'),
    withColour ? d.colour_name : null,
    d.region_code ?? null,
    simTypeText(d.sim_type, pick),
    d.battery_health ? pick('devx.bh').replace('{{n}}', String(d.battery_health)) : null,
    d.battery_cycles != null ? pick('devx.cyclesShort').replace('{{n}}', String(d.battery_cycles)) : null,
    d.location ? `${pick('stock.shelf')}: ${d.location}` : null,
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
          {hasPta(d) && d.pta_status !== 'pta_approved' && !(d.lock_type && d.pta_status === 'unknown') ? <Chip text={`stock.pta.${d.pta_status}`} tone="warn" /> : null}
          {d.verification_status !== 'not_required' ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
          <FaultChip faults={d.faults} />
          {d.lock_type ? <Chip text={`locked.type.${d.lock_type}`} tone="bad" /> : null}
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
export function DeviceCard({ d, onOpen, onSell, selected, onSelect, fields, actions }: { d: Device; onOpen: () => void; onSell?: () => void; selected?: boolean; onSelect?: () => void; fields?: FieldKey[]; actions?: boolean }) {
  const { pick } = useLang()
  const vTone = d.verification_status === 'flagged' ? 'bad' : d.verification_status === 'pending' ? 'warn' : 'ok'
  // the stock page's chosen fields fill the four boxes (owner 2026-11-09); elsewhere the usual four
  const picked: [string, string][] | null = fields ? fieldBits(d, fields, pick, ['asking', 'cost', 'imei', 'status', 'verification']).slice(0, 4).map((x) => [x.f.label, String(x.v)]) : null
  const stats: [string, string][] = picked ?? [
    d.category === 'watch' ? ['devx.sizeShort', d.size_mm ? `${d.size_mm}mm` : '—'] : ['stock.storageShort', d.storage_name ?? '—'],
    hasPta(d) ? ['stock.ptaShort', pick(`stock.pta.${d.pta_status}`)] : d.category === 'laptop' ? ['devx.ram', d.ram_gb ? `${d.ram_gb}GB` : '—'] : ['devx.simLabel', pick(d.category === 'tablet' ? 'devx.wifiShort' : 'devx.gpsShort')],
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
      {fields?.includes('cost') && d.cost_price != null ? <span className="-mt-2 text-xs text-muted">{pick('stock.col.cost')} <MoneyText value={d.cost_price} tone="muted" size="sm" /></span> : null}
      {stats.length ? <div className="grid border-y border-line py-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map(([k, v], i) => (
          <div key={k} className={`flex flex-col items-center gap-0.5 px-1 text-center ${i ? 'border-s border-line' : ''}`}>
            <span className="text-[11px] text-muted">{pick(k)}</span>
            <span className="truncate text-sm font-bold text-ink" dir="auto">{v}</span>
          </div>
        ))}
      </div> : null}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted">
          {!fields || fields.includes('imei') ? <span dir="ltr">{d.imei1}</span> : null}
          {d.verification_status !== 'not_required' && (!fields || fields.includes('verification') || d.verification_status === 'flagged') ? <Chip text={`stock.verification.${d.verification_status}`} tone={vTone} /> : null}
          {d.status !== 'in_stock' ? <Chip text={`stock.status.${d.status}`} tone="ink" /> : null}
          <FaultChip faults={d.faults} />
          {d.lock_type ? <Chip text={`locked.type.${d.lock_type}`} tone="bad" /> : null}
          {d.reserved_party_id ? <span className="rounded-full bg-gold-tint px-2 py-0.5 font-bold text-ink" data-testid="card-reserved-chip">{pick('reserve.chip')} {d.reserved_party_name}</span> : null}
        </div>
        {/* ADR-090: ✎ / 🗑 on the stock page's cards */}
        {actions ? <DeviceActions d={d} /> : null}
        {onSell && (d.status === 'in_stock' || d.status === 'faulty') && d.verification_status !== 'flagged' ? (
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
  // opened from the Shop Audit: condition / PTA / type come in the link
  const [preset] = useState(() => { const sp = new URLSearchParams(window.location.search); return { condition: sp.get('condition') ?? undefined, pta_status: sp.get('pta_status') ?? undefined, category: sp.get('category') ?? undefined } })
  // owner brief 2026-11-10 (ADR-059): the chosen filters come back when the shopkeeper returns from
  // a phone's page (kept for this tab only; a link from the Shop Audit starts fresh)
  // owner 2026-11-12: a model opened from the stock summary is that model only (not every name that starts the same)
  const [model, setModel] = useState<{ id: string; name: string } | null>(() => { const sp = new URLSearchParams(window.location.search); const id = sp.get('model_id'); return id ? { id, name: sp.get('model') ?? '' } : null })
  const kept = useState(() => (preset.condition || preset.pta_status || preset.category || model ? null : readKept()))[0]
  // ADR-091: tick boxes; a link from the Shop Audit (condition / PTA / type) starts with those ticked
  const [sel, setSel] = useState<Sel>(() => (preset.condition || preset.pta_status ? { ...DEFAULT_SEL, condition: preset.condition ? [preset.condition] : [], pta: preset.pta_status ? [preset.pta_status] : [] } : kept?.sel ?? DEFAULT_SEL))
  const [sort, setSort] = useState<Sort>(kept?.sort ?? 'newest')
  const [kind, setKind] = useState<Kind>((preset.category as Kind | undefined) ?? kept?.kind ?? '')
  const [mode, setMode] = useState<Mode>(kept?.mode ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [lookup, setLookup] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [labels, setLabels] = useState(false)
  // owner addendum 6: a type change for the picked units
  const [view, setView] = useState<StockView>(loadView)
  const [fields, setFields] = useState<FieldKey[]>(loadFields)
  const [colSort, setColSort] = useState<ColSort>(null)
  const [fx, setFx] = useState<Fx>({ ...NO_FX, ...(kept?.fx ?? {}) })
  useEffect(() => { writeKept({ sel, sort, kind, mode, fx }) }, [sel, sort, kind, mode, fx])
  const { data: suppliers } = useGet<Party[]>(['parties', 'suppliers'], filtersOpen || fx.supplier ? '/api/v1/parties?kind=supplier' : null)
  const [retype, setRetype] = useState(false)
  const [toCat, setToCat] = useState<'phone' | 'tablet' | 'watch'>('tablet')
  const [retypeRows, setRetypeRows] = useState<{ id: string; imei1: string; problems: string[] }[] | null>(null)
  const [retypeErr, setRetypeErr] = useState<unknown>(null)
  // a status card (quick view) wins over the ticked statuses; the ticked ones are sent together
  const statusParam = mode === 'in_repair' || mode === 'faulty' || mode === 'with_customer_for_approval' ? mode : mode === 'locked' ? 'in_stock' : undefined
  const statuses = !mode && sel.status.length ? sel.status.join(',') : undefined
  // owner 2026-11-12 (ADR-066): a faulty phone is still stock (it can be sold as it is)
  const withFaulty = mode === 'locked'
  const conditions = sel.condition.join(',') || undefined
  const ptas = sel.pta.join(',') || undefined
  const { data, isLoading } = useDevices({ q: q || undefined, status: statusParam, statuses, with_faulty: withFaulty || undefined, model_id: model?.id, category: kind || undefined, conditions, pta_statuses: ptas, limit: 500, grade: fx.grade || undefined, ram_gb: fx.ram ? Number(fx.ram) : undefined, price_min: fx.min ? Number(fx.min) : undefined, price_max: fx.max ? Number(fx.max) : undefined, lock_unchecked: fx.lock || undefined, sellable: mode === 'sellable' || undefined, inspection: mode === 'inspection' || undefined, reserved: mode === 'reserved' || undefined, locked: mode === 'locked' || undefined, location: fx.shelf || undefined, age_min: fx.age ? Number(fx.age) : undefined, cost_min: canCost && fx.costMin ? Number(fx.costMin) : undefined, cost_max: canCost && fx.costMax ? Number(fx.costMax) : undefined, supplier_id: fx.supplier || undefined })
  useScan(async (code) => {
    const r = await lookupCode(code).catch(() => null)
    if (r?.kind === 'device' && r.device) { beep('ok'); nav(`/stock/${r.device.id}`) } else if (r?.kind === 'item' && r.item) { beep('ok'); nav(`/accessories?q=${encodeURIComponent(r.item.sku)}`) } else { beep('error'); setQ(code) }
  })
  const { data: brands } = useBrands()
  const inv = useInvalidate()

  const togglePick = (d: Device) => setPicked((x) => (x.includes(d.id) ? x.filter((i) => i !== d.id) : [...x, d.id]))
  const counts = new Map<string, number>()
  for (const d of data ?? []) counts.set(d.brand_id, (counts.get(d.brand_id) ?? 0) + 1)
  const brandRow = (brands ?? []).filter((b) => counts.has(b.id))
  const sorted = [...(data ?? [])]
    .filter((d) => !sel.brand.length || sel.brand.includes(d.brand_id))
    .sort((a, b) =>
      sort === 'priceLow'
        ? Number(a.asking_price ?? 0) - Number(b.asking_price ?? 0)
        : sort === 'priceHigh'
          ? Number(b.asking_price ?? 0) - Number(a.asking_price ?? 0)
          : sort === 'oldest'
            ? a.last_event_at.localeCompare(b.last_event_at)
            : b.last_event_at.localeCompare(a.last_event_at),
    )
  const sortField = colSort ? (colSort.key === 'name' ? null : FIELDS.find((f) => f.key === colSort.key)) : null
  const rows = colSort ? sortRows(sorted, (d) => (colSort.key === 'name' ? `${d.brand_name} ${d.model_name}` : sortField!.get(d, pick)), colSort.up) : sorted
  // owner 2026-11-09: Download / Share give what the page shows: its filters, fields and order
  const exportPath = (() => {
    const p = new URLSearchParams({ status: statusParam ?? 'all', cols: ['name', ...fields].join(',') })
    if (statuses) p.set('statuses', statuses)
    if (sel.brand.length) p.set('brand_ids', sel.brand.join(','))
    if (conditions) p.set('conditions', conditions)
    if (ptas) p.set('pta_statuses', ptas)
    if (kind) p.set('category', kind)
    if (q) p.set('q', q)
    if (model) p.set('model_id', model.id)
    if (withFaulty) p.set('with_faulty', 'true')
    if (mode === 'locked') p.set('locked', 'true')
    if (fx.grade) p.set('grade', fx.grade)
    if (fx.ram) p.set('ram_gb', fx.ram)
    if (fx.min) p.set('price_min', fx.min)
    if (fx.max) p.set('price_max', fx.max)
    if (fx.lock) p.set('lock_unchecked', 'true')
    const s = colSort ? { sort: colSort.key, desc: !colSort.up } : sort === 'priceLow' ? { sort: 'asking', desc: false } : sort === 'priceHigh' ? { sort: 'asking', desc: true } : sort === 'oldest' ? { sort: 'oldest', desc: false } : null
    if (s) { p.set('sort', s.sort); if (s.desc) p.set('desc', 'true') }
    return `/api/v1/exports/stock?${p.toString()}`
  })()

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="stock.title"
        back={false}
        help={<Help term="stock.page" />}
        right={
          <div className="flex gap-2">
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
      {/* ADR-141: the stock screens, one tap apart */}
      <StockTabs />
      {/* ADR-091: the search on top, with × to clear */}
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan /></div><Help term="stock.search" size="sm" /></div>
      {model ? (
        <div className="flex items-center gap-2" data-testid="model-filter">
          <span className="rounded-full bg-ink px-3 py-1.5 text-sm font-bold text-ground">{pick('stock.modelOnly')}: {model.name}</span>
          <button type="button" onClick={() => setModel(null)} className="tap min-h-9 rounded-full border border-line bg-surface px-3 text-sm font-bold" data-testid="model-filter-clear">{pick('stock.modelClear')}</button>
        </div>
      ) : null}
      <KindTabs value={kind} onChange={(k) => setKind(k)} />
      {/* one bar: filters (tick boxes), order, reports */}
      <div className="flex items-center gap-2">
        <FiltersButton n={selCount(sel) + fxCount(fx) + (mode ? 1 : 0)} onClick={() => setFiltersOpen(true)} />
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{pick('sfx.sortBy')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-12 w-full appearance-none rounded-2xl border border-line bg-surface pe-8 ps-3 text-sm font-bold" data-testid="stock-sort">
            {(['newest', 'oldest', 'priceLow', 'priceHigh'] as Sort[]).map((o) => (
              <option key={o} value={o}>{pick(`stock.${o}`)}</option>
            ))}
          </select>
          <ArrowUpDown size={16} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-emerald" />
        </label>
        <button type="button" onClick={() => setReportsOpen(true)} className="tap flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-bold" data-testid="stock-reports">
          <FileDown size={18} className="text-emerald-deep" />{pick('sfx.reports')}
        </button>
      </div>
      <ActiveChips
        sel={sel}
        onSel={setSel}
        fx={fx}
        onFx={setFx}
        brandName={(id) => (brands ?? []).find((b) => b.id === id)?.name ?? '—'}
        supplierName={(id) => (suppliers ?? []).find((s) => s.id === id)?.name ?? pick('stock.fx.supplier')}
        extra={mode ? [{ key: 'mode', label: pick(`sfx.mode.${mode}`), onRemove: () => setMode('') }] : []}
        onClearAll={() => { setSel(NO_SEL); setFx(NO_FX); setMode('') }}
      />
      <StatusCards kind={kind} mode={mode} onMode={(m) => setMode(m)} canCost={canCost} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1"><ViewSwitch value={view} onChange={(v) => { setView(v); saveView(v) }} /></div>
        <FieldsButton value={fields} onChange={(v) => { setFields(v); saveFields(v) }} />
      </div>
      {/* ADR-121 / ADR-123: "All stock" is not only phones — the accessories are in it, and the search finds them */}
      {!kind && !picking ? <ItemsInStock q={q} /> : null}
      {data ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface px-3 py-2 text-sm font-semibold text-muted" data-testid="stock-summary-line">
          <span className="font-extrabold text-ink">{t(`stock.countBy.${kind || 'all'}`, { n: rows.length })}</span>
          <span>{pick('sfx.askingTotal')} <MoneyText value={rows.reduce((s, d) => s + Number(d.asking_price ?? 0), 0)} tone="ink" size="sm" /></span>
          {canCost ? <span>{pick('sfx.costTotal')} <MoneyText value={rows.reduce((s, d) => s + Number(d.cost_price ?? 0), 0)} tone="muted" size="sm" /></span> : null}
          <Help term="stock.card" size="sm" />
        </div>
      ) : null}
      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} sel={sel} onSel={(s) => { setSel(s); if (s.status.length) setMode('') }} fx={fx} onFx={setFx} brands={brandRow.map((b) => ({ id: b.id, name: ur && b.name_ur ? b.name_ur : b.name, count: counts.get(b.id) }))} canCost={canCost} suppliers={suppliers} shown={rows.length} />
      <Sheet open={reportsOpen} onClose={() => setReportsOpen(false)} title="sfx.reports">
        <div className="flex flex-col gap-3" data-testid="reports-sheet">
          <BiLabel text="sfx.reportsHint" size="sm" tone="text-muted" />
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton path={exportPath} name="stock" />
            <PriceListsButton path={exportPath} />
          </div>
        </div>
      </Sheet>

      {isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty text={q || selCount(sel) || fxCount(fx) ? 'common.nothingFound' : 'stock.noDevices'} />
      ) : view === 'table' ? (
        <StockTable rows={rows} fields={fields} by={colSort} onSort={setColSort} onOpen={(d) => nav(`/stock/${d.id}`)} picked={picking ? picked : undefined} onPick={picking ? togglePick : undefined} />
      ) : view === 'grid' ? (
        <StockGrid rows={rows} fields={fields} onOpen={(d) => nav(`/stock/${d.id}`)} picked={picking ? picked : undefined} onPick={picking ? togglePick : undefined} />
      ) : view === 'list' ? (
        <StockList rows={rows} fields={fields} onOpen={(d) => nav(`/stock/${d.id}`)} picked={picking ? picked : undefined} onPick={picking ? togglePick : undefined} />
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {rows.map((d) => (
            <DeviceCard key={d.id} d={d} fields={fields} actions={!picking} onOpen={() => nav(`/stock/${d.id}`)} onSell={() => nav(`/sale/new?device=${d.id}`)} selected={picked.includes(d.id)} onSelect={picking ? () => setPicked((x) => (x.includes(d.id) ? x.filter((i) => i !== d.id) : [...x, d.id])) : undefined} />
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
          <span className="flex items-center gap-1"><BiLabel text="devx.retypeHint" size="sm" tone="text-muted" /><Help term="device.retype" size="sm" /></span>
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
