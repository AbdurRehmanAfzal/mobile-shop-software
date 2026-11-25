/** The stock screen of the new product (ADR-134), drawn from `23-stock-inventory-command-center.html`
 *  (the final; 23b is its first draft): the file's own top bar (Add stock F3, Filters, Fields, cost
 *  visible, staff count without cost, stock sheet A4, language, dark), the kinds of stock with their
 *  counts, a search over IMEI / serial / model / dealer, and five views in the address (`?tab=`):
 *  the category & brand summary, model-wise units and cost, every item with its IMEI / serial (status
 *  tiles, the advanced filters as removable chips, "which details to show"), dealer & customer-wise
 *  stock with their khata, and the complete stock ledger with its period and filters.
 *
 *  Every figure is the server's: `/stock-hub/overview|models|parties|ledger` (read-only, derived from
 *  the units, items, purchases, sales and their events — `stockhub/service.py`), `/devices/stock-status`
 *  for the tiles, `/devices` with the live stock screen's filters for the units, `/accessories` for the
 *  items. The app adds nothing up; it only orders and searches rows. A unit opens its page
 *  (`/new/item/:id`), an item its page (`/new/stock-item/:id`), a dealer their khata
 *  (`/new/parties/:id`). The stock sheet and the staff count are the live ones (`/exports/stock`,
 *  `/stock/count`).
 *
 *  Differences from the drawing: no category shares, no totals worked out over the shown rows, no
 *  "Reorder" per phone (a phone is one unit); "Debit / Credit" per brand and model is what was bought
 *  (at cost) and what was sold (at price); the branch picker is the shop switcher of the live app. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, Boxes, Check, ClipboardList, Download, Eye, EyeOff, FileText, Filter, Headphones, LayoutGrid, Languages, Laptop, Moon, Plus,
  Search, Smartphone, Sun, Tablet, Users, Watch, X, XCircle,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import { fmtDate } from '@/components/ui'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { withCur } from '@/lib/format'
import { useModules, useTrade } from '@/lib/modules'
import { LOCALES, setLocale } from '@/i18n'
import { useDevices, useGet } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Device } from '@/lib/types'
import type { Item } from '@/features/accessories/types'
import { specLine } from '@/features/stock/StockPage'

type M = string
type Tab = 'summary' | 'models' | 'units' | 'parties' | 'ledger'
type Cat = 'all' | 'phone' | 'tablet' | 'watch' | 'laptop' | 'items'
interface Overview {
  kinds: { key: string; in_shop: number; sold: number; brands: number; cost: M | null; asking: M }[]
  brands: { brand_id: string; brand_name: string; kinds: string[]; models: number; in_shop: number; sold: number; avg_cost: M | null; cost: M | null; asking: M; bought: M | null; sold_value: M }[]
  units_in_shop: number; pieces_in_shop: number; units_sold: number; cost: M | null; asking: M; payable: M | null
}
interface ModelRow { kind: string; category?: string; brand_id?: string; brand_name: string | null; model_id?: string; model_name: string; item_id?: string; in_shop: number; sold: number; avg_cost: M | null; cost: M | null; asking: M; sold_value?: M }
interface PartyRow { party_id: string; name: string; name_ur: string | null; phone: string | null; party_kinds: string[]; kinds: string[]; brands: string[]; models: string[]; models_count: number; in_shop: number; sold: number; returned: number; pieces_in_shop: number; pieces_in: number; cost: M | null; billed: M | null; balance: M | null }
interface LedgerRow { at: string; date: string; kind: string; category: string; label: string; code: string | null; device_id: string | null; item_id: string | null; qty: number; unit_cost: M | null; price: M | null; profit: M | null; worth_after: M | null; no: string | null; party_id: string | null; party_name: string | null; document_type: string | null; document_id: string | null }
interface Ledger { rows: LedgerRow[]; total_rows: number; in_units: number; in_cost: M | null; out_units: number; out_value: M; returned_value: M | null; returned_count: number; profit: M | null }
interface Status { units: { on_hand: number; available: number; reserved: number; inspection: number; in_repair: number; faulty: number; approval: number; on_loan: number; locked: number }; items: { on_hand: number; low: number; out: number; reserved: number } }

const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const OWNED = 'in_stock,faulty,in_repair,on_loan,with_customer_for_approval'
const TILES = ['available', 'reserved', 'on_loan', 'inspection', 'in_repair', 'faulty', 'approval'] as const
type Tile = (typeof TILES)[number]
const FIELDS = ['imei', 'serial', 'barcode', 'boughtFrom', 'days', 'shelf', 'condition', 'pta', 'battery', 'grade', 'ram', 'region', 'cost', 'asking', 'status', 'idCheck'] as const
type FieldKey = (typeof FIELDS)[number]
const DEFAULT_FIELDS: FieldKey[] = ['imei', 'boughtFrom', 'days', 'cost', 'asking', 'status', 'idCheck']
const LS_FIELDS = 'newui.stock.fields'
interface Adv { statuses: string[]; brands: string[]; conditions: string[]; ptas: string[]; grade: string; ram: string; age: string; supplier: string; shelf: string; lock: boolean; idPending: boolean; min: string; max: string }
const NO_ADV: Adv = { statuses: [], brands: [], conditions: [], ptas: [], grade: '', ram: '', age: '', supplier: '', shelf: '', lock: false, idPending: false, min: '', max: '' }
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime()) / 86_400_000))

export default function NewStockHub() {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const trade = useTrade()
  const has = useModules()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [sp, setSp] = useSearchParams()
  const tab = (['summary', 'models', 'units', 'parties', 'ledger'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'summary') as Tab
  const cat = (['all', 'phone', 'tablet', 'watch', 'laptop', 'items'].includes(sp.get('cat') ?? '') ? sp.get('cat') : 'all') as Cat
  const q = sp.get('q') ?? ''
  const brandId = sp.get('brand') ?? ''
  const modelId = sp.get('model') ?? ''
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) } setSp(n, { replace: true }) }
  const [showCost, setShowCost] = useState(true)
  const [tile, setTile] = useState<Tile | ''>('')
  const [adv, setAdv] = useState<Adv>(NO_ADV)
  const [advOpen, setAdvOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [fields, setFields] = useState<FieldKey[]>(() => { try { const v = JSON.parse(localStorage.getItem(LS_FIELDS) ?? 'null'); return Array.isArray(v) && v.length ? v : DEFAULT_FIELDS } catch { return DEFAULT_FIELDS } })
  const keepFields = (f: FieldKey[]) => { setFields(f); try { localStorage.setItem(LS_FIELDS, JSON.stringify(f)) } catch { /* private window */ } }
  const costOk = canCost && showCost

  useEffect(() => {
    const goKeys: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F7: '/new/repairs', F8: '/new/expenses', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (goKeys[e.key]) { e.preventDefault(); nav(goKeys[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const { data: ov } = useGet<Overview>(['stock-hub', 'overview'], '/api/v1/stock-hub/overview')
  const { data: st } = useGet<Status>(['stock-status', cat], `/api/v1/devices/stock-status${cat !== 'all' && cat !== 'items' ? `?category=${cat}` : ''}`)
  const kinds: [Cat, typeof Smartphone, string][] = [
    ['all', Boxes, 'nst.all'],
    ...(trade.mobiles ? [['phone', Smartphone, 'devcat.phone'], ['tablet', Tablet, 'devcat.tablet'], ['watch', Watch, 'devcat.watch']] as [Cat, typeof Smartphone, string][] : []),
    ...(has('laptops') ? [['laptop', Laptop, 'devcat.laptop']] as [Cat, typeof Smartphone, string][] : []),
    ...(has('accessories') ? [['items', Headphones, 'nitem.items']] as [Cat, typeof Smartphone, string][] : []),
  ]
  const kindCount = (k: Cat) => (k === 'all' ? (ov ? ov.units_in_shop + ov.pieces_in_shop : null) : ov?.kinds.find((x) => x.key === k)?.in_shop ?? null)
  const advCount = adv.statuses.length + adv.brands.length + adv.conditions.length + adv.ptas.length + [adv.grade, adv.ram, adv.age, adv.supplier, adv.shelf, adv.min, adv.max].filter(Boolean).length + (adv.lock ? 1 : 0) + (adv.idPending ? 1 : 0)
  const alerts = st ? st.units.inspection + st.units.faulty + st.units.locked + st.items.low + st.items.out : null
  const sheetPath = (() => { const p = new URLSearchParams(); if (cat !== 'all' && cat !== 'items') p.set('category', cat); if (q) p.set('q', q); return `/api/v1/exports/stock?${p.toString()}` })()

  const tabBtn = (k: Tab, icon: ReactNode, label: string) => <button key={k} type="button" onClick={() => set({ tab: k })} aria-pressed={tab === k} className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${tab === k ? 'bg-[#A3E635] text-slate-950 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-800'}`} data-testid={`nst-tab-${k}`}>{icon}{pick(label)}</button>

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh" data-testid="nst" data-newui="1" data-file="23">
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800">
        <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/new" className="flex items-center gap-2.5 min-w-0"><span className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span><span className="hidden md:block min-w-0"><span className="block font-display font-extrabold text-sm truncate">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-500">{pick('nst.hub')}</span></span></Link>
            <button type="button" onClick={() => nav('/new/purchase/new')} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer" data-testid="nst-add"><Plus className="w-3.5 h-3.5" />{pick('nst.addStock')} <span className="font-mono opacity-70" dir="ltr">(F3)</span></button>
            <button type="button" onClick={() => { set({ tab: 'units' }); setAdvOpen(true) }} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nst-filters"><Filter className="w-3.5 h-3.5" />{pick('nst.filters')}<span className="px-1.5 rounded-full bg-[#A3E635] text-slate-950 text-[10px] font-extrabold" dir="ltr">{advCount}</span></button>
            <button type="button" onClick={() => { set({ tab: 'units' }); setFieldsOpen(true) }} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nst-fields"><LayoutGrid className="w-3.5 h-3.5" />{pick('nst.fieldsBtn')}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="nst-eye">{showCost ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}{pick(showCost ? 'nrep.costVisible' : 'nrep.costHidden')}</button> : null}
            <button type="button" onClick={() => nav('/stock/count')} className="px-2.5 py-1.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nst-count"><ClipboardList className="w-3.5 h-3.5" />{pick('nst.staffCount')}</button>
            <button type="button" onClick={() => void downloadFile(withDocLang(`${sheetPath}&format=pdf`), 'stock.pdf')} className="px-3 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nst-sheet"><FileText className="w-3.5 h-3.5" />{pick('nst.sheet')}</button>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nst-lang"><Languages className="w-3.5 h-3.5 text-blue-600" />{ur ? 'English' : 'اردو'}</button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="p-2 rounded-xl bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="nst-kinds">
            {kinds.map(([k, Icon, l]) => <button key={k} type="button" onClick={() => set({ cat: k === 'all' ? null : k, brand: null, model: null })} aria-pressed={cat === k} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${cat === k ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-transparent' : 'bg-white dark:bg-obsidian-850 border-slate-200 dark:border-slate-700'}`} data-testid={`nst-cat-${k}`}><Icon className="w-3.5 h-3.5" />{pick(l)}<span className={`px-1.5 rounded-md text-[10px] font-mono ${cat === k ? 'bg-white/20' : 'bg-slate-100 dark:bg-obsidian-900'}`} dir="ltr">{kindCount(k) ?? '…'}</span></button>)}
          </div>
          <div className="relative w-full sm:w-80"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => set({ q: e.target.value || null, tab: e.target.value ? 'units' : tab })} placeholder={pick('nst.searchPh')} className="w-full ps-9 pe-8 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" data-testid="nst-q" />{q ? <button type="button" onClick={() => set({ q: null })} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}</div>
        </div>
        <div className="px-4 sm:px-6 pb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabBtn('summary', <LayoutGrid className="w-3.5 h-3.5" />, 'nst.tab.summary')}
            {tabBtn('models', <Boxes className="w-3.5 h-3.5" />, 'nst.tab.models')}
            {tabBtn('units', <ClipboardList className="w-3.5 h-3.5" />, 'nst.tab.units')}
            {tabBtn('parties', <Users className="w-3.5 h-3.5" />, 'nst.tab.parties')}
            {tabBtn('ledger', <BookOpen className="w-3.5 h-3.5" />, 'nst.tab.ledger')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]"><span className="text-slate-400">{pick('nst.quick')}:</span>
            <button type="button" onClick={() => set({ tab: 'units', cat: 'items' })} className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 font-bold cursor-pointer" data-testid="nst-quick-low">{pick('nst.qLow')}{st ? ` (${st.items.low + st.items.out})` : ''}</button>
            <button type="button" onClick={() => { set({ tab: 'units' }); setAdv({ ...NO_ADV, idPending: true }) }} className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 font-bold cursor-pointer" data-testid="nst-quick-id">{pick('nst.qId')}</button>
            <button type="button" onClick={() => { set({ tab: 'units' }); setAdv({ ...NO_ADV, lock: true }) }} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 font-bold cursor-pointer" data-testid="nst-quick-lock">{pick('nst.qLock')}</button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-5">
        {tab === 'summary' ? <Summary ov={ov} cat={cat} costOk={costOk} canCost={canCost} alerts={alerts} onKind={(k) => set({ cat: k, tab: 'units' })} onBrand={(b) => set({ tab: 'models', brand: b })} onAlerts={() => { set({ tab: 'units' }); setTile('inspection') }} /> : null}
        {tab === 'models' ? <Models cat={cat} brandId={brandId} costOk={costOk} canCost={canCost} onClearBrand={() => set({ brand: null })} onModel={(m) => (m.item_id ? nav(`/new/stock-item/${m.item_id}`) : set({ tab: 'units', model: m.model_id ?? null }))} /> : null}
        {tab === 'units' ? <Units cat={cat} q={q} modelId={modelId} st={st} tile={tile} setTile={setTile} adv={adv} setAdv={setAdv} advOpen={advOpen} setAdvOpen={setAdvOpen} fields={fields} fieldsOpen={fieldsOpen} setFieldsOpen={setFieldsOpen} keepFields={keepFields} costOk={costOk} canCost={canCost} brands={ov?.brands ?? []} onClearModel={() => set({ model: null })} /> : null}
        {tab === 'parties' ? <Parties costOk={costOk} canCost={canCost} /> : null}
        {tab === 'ledger' ? <LedgerView cat={cat} costOk={costOk} canCost={canCost} brands={ov?.brands ?? []} /> : null}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ summary */

function Summary({ ov, cat, costOk, canCost, alerts, onKind, onBrand, onAlerts }: { ov?: Overview; cat: Cat; costOk: boolean; canCost: boolean; alerts: number | null; onKind: (k: string) => void; onBrand: (b: string) => void; onAlerts: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  if (!ov) return <Wait />
  const hide = (v: M | null) => (costOk ? rs(v) : '••••••')
  const kinds = ov.kinds.filter((k) => (k.in_shop || k.sold) && (cat === 'all' || k.key === cat))
  const brands = ov.brands.filter((b) => cat === 'all' || b.kinds.includes(cat))
  const ICON: Record<string, typeof Smartphone> = { phone: Smartphone, tablet: Tablet, watch: Watch, laptop: Laptop, items: Headphones }
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1fr] gap-3">
        <div className="p-5 rounded-2xl bg-obsidian-900 text-white" data-testid="nst-worth"><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">{pick('nst.worth')}</div><div className="font-display font-extrabold text-3xl text-[#A3E635] mt-1" dir="ltr">{canCost ? hide(ov.cost) : rs(ov.asking)}</div><div className="text-[11px] text-slate-300 mt-1">{t('nst.worthSub', { units: ov.units_in_shop, pieces: ov.pieces_in_shop, sold: ov.units_sold, brands: ov.brands.length })}</div></div>
        <div className="p-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nst-asking"><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nst.askingWorth')}</div><div className="font-display font-extrabold text-2xl mt-1" dir="ltr">{rs(ov.asking)}</div><div className="text-[11px] text-slate-500 mt-1">{pick('nst.askingSub')}</div></div>
        {canCost ? <div className="p-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nst-payable"><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nst.payable')}</div><div className="font-display font-extrabold text-2xl mt-1 text-rose-600" dir="ltr">{hide(ov.payable)}</div><div className="text-[11px] text-slate-500 mt-1">{pick('nst.payableSub')}</div></div> : null}
        <button type="button" onClick={onAlerts} className="p-5 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 cursor-pointer" data-testid="nst-alerts"><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nst.alerts')}</div><div className="font-display font-extrabold text-2xl mt-1 text-amber-600">{t('nst.alertsN', { n: alerts ?? 0 })}</div><div className="text-[11px] text-blue-600 font-bold mt-1">{pick('nst.inspect')} →</div></button>
      </section>
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="nst-kind-cards">
        {kinds.map((k) => { const Icon = ICON[k.key] ?? Boxes; return (
          <button key={k.key} type="button" onClick={() => onKind(k.key)} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 cursor-pointer" data-testid={`nst-kind-${k.key}`}>
            <Icon className="w-5 h-5 text-slate-500" />
            <div className="font-display font-extrabold text-sm mt-2">{pick(k.key === 'items' ? 'nitem.items' : `devcat.${k.key}`)}</div>
            <div className="font-mono font-bold text-sm mt-1 text-emerald-700 dark:text-emerald-400" dir="ltr">{canCost ? hide(k.cost) : rs(k.asking)}</div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{pick('nst.inShop')}: <strong className="text-slate-800 dark:text-slate-200">{k.in_shop}</strong></span><span>{pick('nst.sold')}: <strong className="text-slate-800 dark:text-slate-200">{k.sold}</strong></span></div>
          </button>
        ) })}
      </section>
      <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5" data-testid="nst-brands">
        <h2 className="font-display font-extrabold text-base">{pick('nst.brandsTitle')}</h2>
        <p className="text-[11px] text-slate-500 mb-3">{pick('nst.brandsSub')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800"><th className="py-2.5 text-start">{pick('nst.brand')}</th><th className="py-2.5 text-end">{pick('nst.models')}</th><th className="py-2.5 text-end">{pick('nst.inShop')}</th><th className="py-2.5 text-end">{pick('nst.sold')}</th>{canCost ? <><th className="py-2.5 text-end">{pick('nst.avgCost')}</th><th className="py-2.5 text-end">{pick('nst.stockCost')}</th></> : null}<th className="py-2.5 text-end">{pick('nst.askingWorth')}</th><th className="py-2.5 text-end">{pick('nst.boughtSold')}</th><th className="py-2.5" /></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {brands.map((b) => (
                <tr key={b.brand_id} data-testid="nst-brand-row">
                  <td className="py-3 font-display font-extrabold text-sm">{b.brand_name}</td><td className="py-3 text-end font-mono">{b.models}</td><td className="py-3 text-end font-mono text-emerald-700 font-bold">{b.in_shop}</td><td className="py-3 text-end font-mono">{b.sold}</td>
                  {canCost ? <><td className="py-3 text-end font-mono" dir="ltr">{b.avg_cost == null ? '—' : hide(b.avg_cost)}</td><td className="py-3 text-end font-mono" dir="ltr">{hide(b.cost)}</td></> : null}
                  <td className="py-3 text-end font-mono" dir="ltr">{rs(b.asking)}</td>
                  <td className="py-3 text-end font-mono text-[11px]" dir="ltr">{canCost ? <div>{pick('nst.dr')} {hide(b.bought)}</div> : null}<div className="text-emerald-700">{pick('nst.cr')} {rs(b.sold_value)}</div></td>
                  <td className="py-3 text-end"><button type="button" onClick={() => onBrand(b.brand_id)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold cursor-pointer" data-testid="nst-brand-models">{pick('nst.modelsBtn')} →</button></td>
                </tr>
              ))}
              {!brands.length ? <tr><td colSpan={9} className="py-6 text-center text-slate-400">{pick('nst.empty')}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ models */

function Models({ cat, brandId, costOk, canCost, onClearBrand, onModel }: { cat: Cat; brandId: string; costOk: boolean; canCost: boolean; onClearBrand: () => void; onModel: (m: ModelRow) => void }) {
  const { pick } = useLang()
  const qs = new URLSearchParams()
  if (cat !== 'all') qs.set('category', cat)
  if (brandId && cat !== 'items') qs.set('brand_id', brandId)
  const { data } = useGet<ModelRow[]>(['stock-hub', 'models', cat, brandId], `/api/v1/stock-hub/models?${qs}`)
  const hide = (v: M | null | undefined) => (costOk ? rs(v) : '••••••')
  if (!data) return <Wait />
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5" data-testid="nst-models">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3"><div><h2 className="font-display font-extrabold text-base">{pick('nst.modelsTitle')}</h2><p className="text-[11px] text-slate-500">{pick('nst.modelsSub')}</p></div>{brandId ? <button type="button" onClick={onClearBrand} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold flex items-center gap-1 cursor-pointer" data-testid="nst-clear-brand">{data[0]?.brand_name ?? pick('nst.brand')}<X className="w-3 h-3" /></button> : null}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800"><th className="py-2.5 text-start">{pick('nst.kindBrand')}</th><th className="py-2.5 text-start">{pick('nst.model')}</th><th className="py-2.5 text-end">{pick('nst.inShop')}</th><th className="py-2.5 text-end">{pick('nst.sold')}</th>{canCost ? <><th className="py-2.5 text-end">{pick('nst.avgCost')}</th><th className="py-2.5 text-end">{pick('nst.stockCost')}</th></> : null}<th className="py-2.5 text-end">{pick('nst.askingWorth')}</th><th className="py-2.5" /></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((m, i) => (
              <tr key={i} data-testid="nst-model-row">
                <td className="py-3"><span className="text-[10px] text-slate-400 block">{m.kind === 'items' ? pick('nitem.items') : pick(`devcat.${m.kind}`)}</span><span className="font-bold">{m.brand_name ?? '—'}</span></td>
                <td className="py-3 font-semibold" dir="auto">{m.model_name}</td>
                <td className="py-3 text-end font-mono font-bold text-emerald-700">{m.in_shop}</td><td className="py-3 text-end font-mono">{m.sold}</td>
                {canCost ? <><td className="py-3 text-end font-mono" dir="ltr">{m.avg_cost == null ? '—' : hide(m.avg_cost)}</td><td className="py-3 text-end font-mono" dir="ltr">{hide(m.cost)}</td></> : null}
                <td className="py-3 text-end font-mono" dir="ltr">{rs(m.asking)}</td>
                <td className="py-3 text-end"><button type="button" onClick={() => onModel(m)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold cursor-pointer" data-testid="nst-model-open">{pick(m.item_id ? 'nst.openItem' : 'nst.units')} →</button></td>
              </tr>
            ))}
            {!data.length ? <tr><td colSpan={8} className="py-6 text-center text-slate-400">{pick('nst.empty')}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ units */

function Units(p: { cat: Cat; q: string; modelId: string; st?: Status; tile: Tile | ''; setTile: (t: Tile | '') => void; adv: Adv; setAdv: (a: Adv) => void; advOpen: boolean; setAdvOpen: (v: boolean) => void; fields: FieldKey[]; fieldsOpen: boolean; setFieldsOpen: (v: boolean) => void; keepFields: (f: FieldKey[]) => void; costOk: boolean; canCost: boolean; brands: Overview['brands']; onClearModel: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { cat, q, modelId, st, tile, setTile, adv, setAdv, fields, costOk } = p
  const [sort, setSort] = useState<'newest' | 'priceHigh' | 'priceLow' | 'oldest'>('newest')
  const devCat = cat !== 'all' && cat !== 'items' ? cat : undefined
  const params = {
    category: devCat, q: q || undefined, model_id: modelId || undefined, limit: 500,
    statuses: tile || adv.statuses.length ? (adv.statuses.join(',') || undefined) : OWNED,
    sellable: tile === 'available' || undefined, reserved: tile === 'reserved' || undefined, inspection: tile === 'inspection' || undefined,
    status: tile === 'on_loan' ? 'on_loan' : tile === 'in_repair' ? 'in_repair' : tile === 'faulty' ? 'faulty' : tile === 'approval' ? 'with_customer_for_approval' : undefined,
    brand_ids: adv.brands.join(',') || undefined, conditions: adv.conditions.join(',') || undefined, pta_statuses: adv.ptas.join(',') || undefined,
    grade: adv.grade || undefined, ram_gb: adv.ram ? Number(adv.ram) : undefined, age_min: adv.age ? Number(adv.age) : undefined, supplier_id: adv.supplier || undefined,
    location: adv.shelf || undefined, lock_unchecked: adv.lock || undefined, id_pending: adv.idPending || undefined,
    price_min: adv.min ? Number(adv.min) : undefined, price_max: adv.max ? Number(adv.max) : undefined,
  }
  const { data: devices } = useDevices(cat === 'items' ? { limit: 1 } : params)
  const { data: items } = useGet<Item[]>(['accessories', 'all'], cat === 'all' || cat === 'items' ? '/api/v1/accessories' : null)
  const query = q.trim().toLowerCase()
  const shownItems = (cat === 'all' || cat === 'items') && !tile && !advCountOf(adv) && !modelId ? (items ?? []).filter((x) => x.qty !== 0 && (!query || `${x.name} ${x.sku} ${x.brand ?? ''} ${x.barcode ?? ''}`.toLowerCase().includes(query))) : []
  const rows = useMemo(() => {
    const list = cat === 'items' ? [] : [...(devices ?? [])]
    if (sort === 'priceHigh') list.sort((a, b) => num(b.asking_price) - num(a.asking_price))
    else if (sort === 'priceLow') list.sort((a, b) => num(a.asking_price) - num(b.asking_price))
    else if (sort === 'oldest') list.sort((a, b) => (a.first_seen_at < b.first_seen_at ? -1 : 1))
    else list.sort((a, b) => (a.first_seen_at > b.first_seen_at ? -1 : 1))
    return list
  }, [devices, sort, cat])
  const has = (f: FieldKey) => fields.includes(f) && (f !== 'cost' || p.canCost)
  const chips: { label: string; clear: () => void }[] = [
    ...(tile ? [{ label: pick(`nst.tile.${tile}`), clear: () => setTile('') }] : []),
    ...adv.statuses.map((s) => ({ label: pick(`stock.status.${s}`), clear: () => setAdv({ ...adv, statuses: adv.statuses.filter((x) => x !== s) }) })),
    ...adv.brands.map((b) => ({ label: `${pick('nst.brand')}: ${p.brands.find((x) => x.brand_id === b)?.brand_name ?? ''}`, clear: () => setAdv({ ...adv, brands: adv.brands.filter((x) => x !== b) }) })),
    ...adv.conditions.map((c) => ({ label: pick(`stock.condition.${c}`), clear: () => setAdv({ ...adv, conditions: adv.conditions.filter((x) => x !== c) }) })),
    ...adv.ptas.map((c) => ({ label: pick(`stock.pta.${c}`), clear: () => setAdv({ ...adv, ptas: adv.ptas.filter((x) => x !== c) }) })),
    ...(adv.grade ? [{ label: `${pick('nst.f.grade')} ${adv.grade}`, clear: () => setAdv({ ...adv, grade: '' }) }] : []),
    ...(adv.ram ? [{ label: `RAM ${adv.ram} GB`, clear: () => setAdv({ ...adv, ram: '' }) }] : []),
    ...(adv.age ? [{ label: t('nst.ageChip', { n: adv.age }), clear: () => setAdv({ ...adv, age: '' }) }] : []),
    ...(adv.supplier ? [{ label: pick('nst.f.supplier'), clear: () => setAdv({ ...adv, supplier: '' }) }] : []),
    ...(adv.shelf ? [{ label: `${pick('nst.f.shelf')}: ${adv.shelf}`, clear: () => setAdv({ ...adv, shelf: '' }) }] : []),
    ...(adv.lock ? [{ label: pick('nst.qLock'), clear: () => setAdv({ ...adv, lock: false }) }] : []),
    ...(adv.idPending ? [{ label: pick('nst.qId'), clear: () => setAdv({ ...adv, idPending: false }) }] : []),
    ...(adv.min || adv.max ? [{ label: `${pick('nst.f.price')} ${adv.min || '0'}–${adv.max || '∞'}`, clear: () => setAdv({ ...adv, min: '', max: '' }) }] : []),
    ...(modelId ? [{ label: pick('nst.oneModel'), clear: p.onClearModel }] : []),
  ]
  const tileCount = (k: Tile) => (st ? (k === 'approval' ? st.units.approval : st.units[k]) : null)
  return (
    <>
      {cat !== 'items' ? (
        <section className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5" data-testid="nst-tiles">
          {TILES.map((k) => <button key={k} type="button" onClick={() => setTile(tile === k ? '' : k)} aria-pressed={tile === k} className={`p-3 rounded-2xl text-start border cursor-pointer ${tile === k ? 'bg-[#A3E635]/25 border-[#A3E635]' : k === 'faulty' ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800'}`} data-testid={`nst-tile-${k}`}><div className="text-[11px] font-bold">{pick(`nst.tile.${k}`)}</div><div className="font-display font-extrabold text-xl mt-0.5">{tileCount(k) ?? '…'}</div>{k === 'available' && st ? <div className="text-[10px] text-slate-500">{t('nst.onHand', { n: st.units.on_hand })}</div> : null}</button>)}
        </section>
      ) : null}
      <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5" data-testid="nst-units">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => p.setAdvOpen(true)} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nst-adv-open"><Filter className="w-3.5 h-3.5" />{pick('nst.filters')}<span className="px-1.5 rounded-full bg-[#A3E635] text-slate-950 text-[10px] font-extrabold" dir="ltr">{chips.length}</span></button>
            {chips.map((c, i) => <button key={i} type="button" onClick={c.clear} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold flex items-center gap-1 cursor-pointer" data-testid="nst-chip">{c.label}<X className="w-3 h-3" /></button>)}
          </div>
          <div className="flex items-center gap-2">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nst-sort">{(['newest', 'priceHigh', 'priceLow', 'oldest'] as const).map((s) => <option key={s} value={s}>{pick(`nst.sort.${s}`)}</option>)}</select>
            <button type="button" onClick={() => p.setFieldsOpen(true)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"><LayoutGrid className="w-3.5 h-3.5" />{pick('nst.fieldsBtn')}</button>
          </div>
        </div>
        <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 text-xs mb-3 flex flex-wrap items-center justify-between gap-2"><span className="font-bold" data-testid="nst-shown">{t('nst.shown', { n: rows.length + shownItems.length })}</span><span className="text-[11px] text-slate-400">{pick('nst.fieldsHint')}</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="py-2.5 text-start">{pick('nst.col.item')}</th>
              {has('imei') || has('serial') || has('barcode') ? <th className="py-2.5 text-start">{pick('nst.col.codes')}</th> : null}
              {has('boughtFrom') ? <th className="py-2.5 text-start">{pick('nst.col.boughtFrom')}</th> : null}
              {has('days') || has('shelf') ? <th className="py-2.5 text-start">{pick('nst.col.shelfAge')}</th> : null}
              {has('cost') ? <th className="py-2.5 text-end">{pick('nst.col.cost')}</th> : null}
              {has('asking') ? <th className="py-2.5 text-end">{pick('nst.col.asking')}</th> : null}
              {has('status') || has('idCheck') ? <th className="py-2.5 text-start">{pick('nst.col.status')}</th> : null}
              <th className="py-2.5 text-end">{pick('nst.col.actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((d) => <UnitRow key={d.id} d={d} has={has} costOk={costOk} />)}
              {shownItems.map((it) => (
                <tr key={it.id} data-testid="nst-item-row">
                  <td className="py-3"><button type="button" onClick={() => nav(`/new/stock-item/${it.id}`)} className="font-bold text-start hover:underline cursor-pointer" dir="auto">{it.name}</button><div className="text-[11px] text-slate-500">{[kindLabel(pick, it.category), it.brand, it.variant].filter(Boolean).join(' · ')}</div></td>
                  {has('imei') || has('serial') || has('barcode') ? <td className="py-3 font-mono text-[11px]" dir="ltr">{it.sku}{it.barcode && it.barcode !== it.sku ? <div className="text-slate-400">{it.barcode}</div> : null}</td> : null}
                  {has('boughtFrom') ? <td className="py-3 text-slate-400">—</td> : null}
                  {has('days') || has('shelf') ? <td className="py-3 text-slate-500">{it.location || '—'}</td> : null}
                  {has('cost') ? <td className="py-3 text-end font-mono" dir="ltr">{costOk ? rs(it.avg_cost) : '••••'}</td> : null}
                  {has('asking') ? <td className="py-3 text-end font-mono" dir="ltr">{rs(it.price)}</td> : null}
                  {has('status') || has('idCheck') ? <td className="py-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${it.qty <= 0 ? 'bg-rose-100 text-rose-700' : it.low_stock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{it.qty <= 0 ? pick('acc.outOfStock') : t('nst.pieces', { n: it.qty })}{it.low_stock && it.qty > 0 ? ` · ${pick('acc.low')}` : ''}</span></td> : null}
                  <td className="py-3 text-end">{it.qty > 0 ? <button type="button" onClick={() => nav(`/new/sale/new?item=${it.id}`)} className="px-3 py-1.5 rounded-lg bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 text-[11px] font-extrabold cursor-pointer">{pick('stock.sell')}</button> : <button type="button" onClick={() => nav('/new/purchase/new')} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-extrabold cursor-pointer">+ {pick('nst.reorder')}</button>}</td>
                </tr>
              ))}
              {!rows.length && !shownItems.length ? <tr><td colSpan={9} className="py-8 text-center text-slate-400" data-testid="nst-none">{devices ? pick('nst.noneMatch') : '…'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      {p.advOpen ? <AdvWindow adv={adv} brands={p.brands} canCost={p.canCost} onClose={() => p.setAdvOpen(false)} onApply={(a) => { setAdv(a); setTile(''); p.setAdvOpen(false) }} /> : null}
      {p.fieldsOpen ? <FieldsWindow fields={fields} canCost={p.canCost} onClose={() => p.setFieldsOpen(false)} onSave={(f) => { p.keepFields(f); p.setFieldsOpen(false) }} /> : null}
    </>
  )
}
const advCountOf = (a: Adv) => a.statuses.length + a.brands.length + a.conditions.length + a.ptas.length + [a.grade, a.ram, a.age, a.supplier, a.shelf, a.min, a.max].filter(Boolean).length + (a.lock ? 1 : 0) + (a.idPending ? 1 : 0)

function UnitRow({ d, has, costOk }: { d: Device; has: (f: FieldKey) => boolean; costOk: boolean }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const extra = [has('condition') ? pick(`stock.condition.${d.condition}`) : null, has('pta') && ((d.category ?? 'phone') === 'phone' || d.cellular) ? pick(`stock.pta.${d.pta_status}`) : null, has('battery') && d.battery_health ? `${d.battery_health}%` : null, has('grade') && d.grade ? d.grade : null, has('ram') && d.ram_gb ? `RAM ${d.ram_gb}GB` : null, has('region') && d.region_code ? d.region_code : null].filter(Boolean).join(' · ')
  const sellable = (d.status === 'in_stock' || d.status === 'faulty') && d.verification_status !== 'flagged'
  return (
    <tr data-testid="nst-unit-row">
      <td className="py-3"><button type="button" onClick={() => nav(`/new/item/${d.id}`)} className="font-bold text-start hover:underline cursor-pointer" dir="auto">{d.brand_name} {d.model_name}</button><div className="text-[11px] text-slate-500" dir="auto">{specLine(d, pick)}{extra ? ` · ${extra}` : ''}</div></td>
      {has('imei') || has('serial') || has('barcode') ? <td className="py-3 font-mono text-[11px]" dir="ltr">{has('imei') ? <div>{d.imei1}</div> : null}{has('imei') && d.imei2 ? <div className="text-slate-400">{d.imei2}</div> : null}{has('serial') && d.serial ? <div className="text-slate-400">{d.serial}</div> : null}{has('barcode') && d.barcode ? <div className="text-slate-400">{d.barcode}</div> : null}</td> : null}
      {has('boughtFrom') ? <td className="py-3"><div className="font-semibold" dir="auto">{d.source_party_name ?? '—'}</div></td> : null}
      {has('days') || has('shelf') ? <td className="py-3 text-slate-500">{has('days') ? t('nst.days', { n: daysSince(d.first_seen_at) }) : null}{has('shelf') && d.location ? <div dir="auto">{d.location}</div> : null}</td> : null}
      {has('cost') ? <td className="py-3 text-end font-mono" dir="ltr">{d.cost_price == null ? '—' : costOk ? rs(d.cost_price) : '••••'}</td> : null}
      {has('asking') ? <td className="py-3 text-end font-mono" dir="ltr">{d.asking_price ? rs(d.asking_price) : <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">{pick('nst.setRate')}</span>}</td> : null}
      {has('status') || has('idCheck') ? <td className="py-3">{has('status') ? <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${d.status === 'faulty' ? 'bg-rose-100 text-rose-700' : d.reserved_party_id ? 'bg-amber-100 text-amber-800' : d.status === 'in_stock' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600'}`}>{d.reserved_party_id && d.status === 'in_stock' ? pick('nst.tile.reserved') : pick(`stock.status.${d.status}`)}</span> : null}{has('idCheck') && (d.verification_status === 'pending' || d.verification_status === 'flagged') ? <div className="mt-1"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${d.verification_status === 'flagged' ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{pick(`stock.verification.${d.verification_status}`)}</span></div> : null}</td> : null}
      <td className="py-3 text-end">{sellable ? <button type="button" onClick={() => nav(`/new/sale/new?device=${d.id}`)} className="px-3 py-1.5 rounded-lg bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 text-[11px] font-extrabold cursor-pointer" data-testid="nst-sell">{pick('stock.sell')}</button> : <button type="button" onClick={() => nav(`/new/item/${d.id}`)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold cursor-pointer">{pick('nst.open')}</button>}</td>
    </tr>
  )
}

function AdvWindow({ adv, brands, canCost, onClose, onApply }: { adv: Adv; brands: Overview['brands']; canCost: boolean; onClose: () => void; onApply: (a: Adv) => void }) {
  const { pick } = useLang()
  const [a, setA] = useState<Adv>(adv)
  const { data: parties } = useGet<PartyRow[]>(['stock-hub', 'parties'], '/api/v1/stock-hub/parties')
  const toggle = (k: 'statuses' | 'brands' | 'conditions' | 'ptas', v: string) => setA({ ...a, [k]: a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v] })
  const pill = (on: boolean) => `px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center gap-1 ${on ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-transparent' : 'bg-white dark:bg-obsidian-850 border-slate-200 dark:border-slate-700'}`
  const inp = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'
  const lbl = 'block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5'
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="nst-adv">
      <div className="w-full max-w-lg h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><h3 className="font-display font-extrabold text-sm flex items-center gap-1.5"><Filter className="w-4 h-4" />{pick('nst.advTitle')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div><div className={lbl}>{pick('nst.f.status')}</div><div className="flex flex-wrap gap-1.5">{['in_stock', 'in_repair', 'on_loan', 'with_customer_for_approval', 'faulty', 'sold'].map((s) => <button key={s} type="button" onClick={() => toggle('statuses', s)} className={pill(a.statuses.includes(s))} data-testid={`nst-f-status-${s}`}>{a.statuses.includes(s) ? <Check className="w-3 h-3" /> : null}{pick(`stock.status.${s}`)}</button>)}</div></div>
          <div><div className={lbl}>{pick('nst.brand')}</div><div className="flex flex-wrap gap-1.5">{brands.map((b) => <button key={b.brand_id} type="button" onClick={() => toggle('brands', b.brand_id)} className={pill(a.brands.includes(b.brand_id))} data-testid="nst-f-brand">{a.brands.includes(b.brand_id) ? <Check className="w-3 h-3" /> : null}{b.brand_name}<span className="font-mono text-[10px] opacity-70" dir="ltr">{b.in_shop}</span></button>)}</div></div>
          <div><div className={lbl}>{pick('nst.f.condition')}</div><div className="flex flex-wrap gap-1.5">{['box_pack', 'open_box', 'used', 'patched'].map((c) => <button key={c} type="button" onClick={() => toggle('conditions', c)} className={pill(a.conditions.includes(c))}>{pick(`stock.condition.${c}`)}</button>)}</div></div>
          <div><div className={lbl}>PTA</div><div className="flex flex-wrap gap-1.5">{['pta_approved', 'non_pta', 'jv', 'cpid'].map((c) => <button key={c} type="button" onClick={() => toggle('ptas', c)} className={pill(a.ptas.includes(c))}>{pick(`stock.pta.${c}`)}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>{pick('nst.f.grade')}</label><input value={a.grade} onChange={(e) => setA({ ...a, grade: e.target.value })} placeholder="A+" className={inp} /></div>
            <div><label className={lbl}>RAM (GB)</label><select value={a.ram} onChange={(e) => setA({ ...a, ram: e.target.value })} className={inp}><option value="">—</option>{[2, 3, 4, 6, 8, 12, 16, 32].map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label className={lbl}>{pick('nst.f.age')}</label><select value={a.age} onChange={(e) => setA({ ...a, age: e.target.value })} className={inp} data-testid="nst-f-age"><option value="">—</option>{[7, 15, 30, 60, 90].map((n) => <option key={n} value={n}>{pick('nst.f.olderThan').replace('{{n}}', String(n))}</option>)}</select></div>
            <div><label className={lbl}>{pick('nst.f.supplier')}</label><select value={a.supplier} onChange={(e) => setA({ ...a, supplier: e.target.value })} className={inp}><option value="">—</option>{(parties ?? []).map((pt) => <option key={pt.party_id} value={pt.party_id}>{pt.name}</option>)}</select></div>
            <div><label className={lbl}>{pick('nst.f.shelf')}</label><input value={a.shelf} onChange={(e) => setA({ ...a, shelf: e.target.value })} className={inp} /></div>
            <div><label className={lbl}>{pick('nst.f.price')}</label><div className="flex items-center gap-1"><input value={a.min} onChange={(e) => setA({ ...a, min: e.target.value.replace(/\D/g, '') })} placeholder="0" className={inp} dir="ltr" /><input value={a.max} onChange={(e) => setA({ ...a, max: e.target.value.replace(/\D/g, '') })} placeholder="∞" className={inp} dir="ltr" /></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setA({ ...a, lock: !a.lock })} className={pill(a.lock)} data-testid="nst-f-lock">{a.lock ? <Check className="w-3 h-3" /> : null}{pick('nst.qLock')}</button>
            <button type="button" onClick={() => setA({ ...a, idPending: !a.idPending })} className={pill(a.idPending)} data-testid="nst-f-id">{a.idPending ? <Check className="w-3 h-3" /> : null}{pick('nst.qId')}</button>
          </div>
          {canCost ? null : <p className="text-[11px] text-slate-400">{pick('nst.noCostFilters')}</p>}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"><button type="button" onClick={() => setA(NO_ADV)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 cursor-pointer" data-testid="nst-f-clear">{pick('nst.clearAll')}</button><button type="button" onClick={() => onApply(a)} className="px-5 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-sm cursor-pointer" data-testid="nst-f-apply">{pick('nst.apply')}</button></div>
      </div>
    </div>
  )
}

function FieldsWindow({ fields, canCost, onClose, onSave }: { fields: FieldKey[]; canCost: boolean; onClose: () => void; onSave: (f: FieldKey[]) => void }) {
  const { pick } = useLang()
  const [f, setF] = useState<FieldKey[]>(fields)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="nst-fields-window">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('nst.fieldsTitle')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{FIELDS.filter((k) => k !== 'cost' || canCost).map((k) => { const on = f.includes(k); return <button key={k} type="button" onClick={() => setF(on ? f.filter((x) => x !== k) : [...f, k])} className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${on ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-transparent' : 'border-slate-200 dark:border-slate-700'}`} data-testid={`nst-field-${k}`}><span className="w-3.5">{on ? <Check className="w-3.5 h-3.5" /> : null}</span>{pick(`nst.field.${k}`)}</button> })}</div>
        <div className="flex items-center justify-between"><button type="button" onClick={() => setF(DEFAULT_FIELDS)} className="text-xs font-bold text-slate-500 cursor-pointer">{pick('nst.defaults')}</button><button type="button" onClick={() => onSave(f)} className="px-5 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-sm cursor-pointer" data-testid="nst-fields-save">{pick('common.save')}</button></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ parties */

function Parties({ costOk, canCost }: { costOk: boolean; canCost: boolean }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [who, setWho] = useState<'all' | 'supplier' | 'customer'>('all')
  const { data } = useGet<PartyRow[]>(['stock-hub', 'parties'], '/api/v1/stock-hub/parties')
  if (!data) return <Wait />
  const rows = data.filter((r) => who === 'all' || r.party_kinds.includes(who))
  const hide = (v: M | null) => (costOk ? rs(v) : '••••••')
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5" data-testid="nst-parties">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4"><div><h2 className="font-display font-extrabold text-base">{t('nst.partiesTitle', { n: rows.length })}</h2><p className="text-[11px] text-slate-500">{pick('nst.partiesSub')}</p></div><div className="flex items-center gap-1">{(['all', 'supplier', 'customer'] as const).map((w) => <button key={w} type="button" onClick={() => setWho(w)} aria-pressed={who === w} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${who === w ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`}>{pick(w === 'all' ? 'nst.all' : `party.${w}`)}</button>)}</div></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((r) => { const bal = num(r.balance); return (
          <div key={r.party_id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-obsidian-850/40" data-testid="nst-party">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="flex gap-1">{r.party_kinds.map((k) => <span key={k} className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[10px] font-bold">{pick(`party.${k}`)}</span>)}</div><div className="font-display font-extrabold text-base mt-1" dir="auto">{ur ? r.name_ur || r.name : r.name}</div><div className="text-[11px] text-slate-500">{pick('nst.brands')}: <strong>{r.brands.join(', ') || '—'}</strong> ({t('nst.modelsN', { n: r.models_count })})</div></div>
              {canCost ? <div className="text-end shrink-0"><div className="text-[10px] font-bold uppercase text-slate-400">{pick(bal < 0 ? 'nst.dene' : bal > 0 ? 'nst.lene' : 'nst.clear')}</div><div className={`font-mono font-extrabold ${bal < 0 ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">{hide(r.balance)}</div></div> : null}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 p-3 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/70 dark:border-slate-800 text-xs">
              <div><div className="text-[10px] text-slate-400">{pick('nst.inShop')}</div><div className="font-bold">{t('nst.unitsN', { n: r.in_shop })}{r.pieces_in_shop ? <span className="block text-[10px] text-slate-500">{t('nst.pieces', { n: r.pieces_in_shop })}</span> : null}</div></div>
              <div><div className="text-[10px] text-slate-400">{pick('nst.soldOut')}</div><div className="font-bold">{t('nst.unitsN', { n: r.sold })}</div></div>
              {canCost ? <div><div className="text-[10px] text-slate-400">{pick('nst.stockCost')}</div><div className="font-bold text-emerald-700" dir="ltr">{hide(r.cost)}</div></div> : null}
              {canCost ? <div><div className="text-[10px] text-slate-400">{pick('nst.billed')}</div><div className="font-bold" dir="ltr">{hide(r.billed)}</div></div> : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500 truncate" dir="auto">{pick('nst.models')}: {r.models.join(' · ')}</span><button type="button" onClick={() => nav(`/new/parties/${r.party_id}`)} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer" data-testid="nst-party-open"><BookOpen className="w-3.5 h-3.5" />{pick('nst.partyStock')}</button></div>
          </div>
        ) })}
        {!rows.length ? <p className="text-xs text-slate-400">{pick('nst.empty')}</p> : null}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ ledger */

function LedgerView({ cat, costOk, canCost, brands }: { cat: Cat; costOk: boolean; canCost: boolean; brands: Overview['brands'] }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const today = new Date()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(iso(today))
  const [move, setMove] = useState('')
  const [brand, setBrand] = useState('')
  const [party, setParty] = useState('')
  const { data: parties } = useGet<PartyRow[]>(['stock-hub', 'parties'], '/api/v1/stock-hub/parties')
  const qs = new URLSearchParams()
  if (from) qs.set('date_from', from)
  if (to) qs.set('date_to', to)
  if (cat !== 'all') qs.set('category', cat)
  if (move) qs.set('move', move)
  if (brand) qs.set('brand_id', brand)
  if (party) qs.set('party_id', party)
  const { data } = useGet<Ledger>(['stock-hub', 'ledger', qs.toString()], `/api/v1/stock-hub/ledger?${qs}`)
  const hide = (v: M | null) => (costOk ? rs(v) : '••••')
  const preset = (k: 'today' | '7d' | 'month') => { if (k === 'today') { setFrom(iso(today)); setTo(iso(today)) } else if (k === '7d') { setFrom(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))); setTo(iso(today)) } else { setFrom(iso(new Date(today.getFullYear(), today.getMonth(), 1))); setTo(iso(today)) } }
  const sel = 'px-2.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'
  const open = (r: LedgerRow) => { if (r.document_type === 'invoice' && r.document_id) nav(`/sales/${r.document_id}`); else if ((r.document_type === 'purchase' || r.document_type === 'opening_stock') && r.document_id) nav(`/purchases/${r.document_id}`); else if (r.device_id) nav(`/new/item/${r.device_id}`); else if (r.item_id) nav(`/new/stock-item/${r.item_id}`) }
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr] gap-3">
        <div className="p-4 rounded-2xl bg-obsidian-900 text-white" data-testid="nst-l-in"><div className="text-[10px] font-extrabold uppercase text-slate-300">{pick('nst.l.in')}</div><div className="font-display font-extrabold text-2xl text-[#A3E635]">+{data?.in_units ?? '…'} {pick('nst.unitsWord')}</div>{canCost ? <div className="text-[11px] text-slate-300" dir="ltr">{hide(data?.in_cost ?? null)}</div> : null}</div>
        <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nst-l-out"><div className="text-[10px] font-extrabold uppercase text-slate-400">{pick('nst.l.out')}</div><div className="font-display font-extrabold text-2xl text-blue-600">−{data?.out_units ?? '…'} {pick('nst.unitsWord')}</div><div className="text-[11px] text-slate-500" dir="ltr">{rs(data?.out_value)}</div></div>
        {canCost ? <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nst-l-ret"><div className="text-[10px] font-extrabold uppercase text-slate-400">{pick('nst.l.returns')}</div><div className="font-display font-extrabold text-2xl text-amber-600" dir="ltr">{hide(data?.returned_value ?? null)}</div><div className="text-[11px] text-slate-500">{t('nst.l.returnsN', { n: data?.returned_count ?? 0 })}</div></div> : null}
        {canCost ? <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nst-l-profit"><div className="text-[10px] font-extrabold uppercase text-slate-400">{pick('nst.l.profit')}</div><div className="font-display font-extrabold text-2xl text-emerald-600" dir="ltr">{hide(data?.profit ?? null)}</div><div className="text-[11px] text-slate-500">{pick('nst.l.profitSub')}</div></div> : null}
        <div className="p-4 rounded-2xl bg-[#A3E635]/15 border border-[#A3E635]/60"><div className="text-[10px] font-extrabold uppercase text-lime-800 dark:text-[#A3E635]">{pick('nst.l.printTitle')}</div><div className="font-display font-extrabold text-sm mt-1">{pick('nst.l.printSub')}</div><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={() => void downloadFile(withDocLang(`/api/v1/exports/stock-cost?format=pdf`), 'stock-cost.pdf')} className="px-3 py-1.5 rounded-lg bg-obsidian-900 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer" data-testid="nst-l-pdf"><FileText className="w-3.5 h-3.5" />{pick('nst.l.pdf')}</button><button type="button" onClick={() => void downloadFile(withDocLang(`/api/v1/exports/stock-summary?format=csv`), 'stock-worth.csv')} className="px-3 py-1.5 rounded-lg bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><Download className="w-3.5 h-3.5" />Excel / CSV</button></div></div>
      </section>
      <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-xs"><span className="text-slate-400 font-bold">{pick('nst.l.period')}:</span>{(['today', '7d', 'month'] as const).map((k) => <button key={k} type="button" onClick={() => preset(k)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-850 font-bold cursor-pointer" data-testid={`nst-l-${k}`}>{pick(`nkf.preset.${k}`)}</button>)}</div><div className="flex items-center gap-1.5"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} dir="ltr" data-testid="nst-l-from" /><span className="text-slate-400 text-xs">→</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} dir="ltr" /></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={move} onChange={(e) => setMove(e.target.value)} className={sel} data-testid="nst-l-move"><option value="">{pick('nst.l.allMoves')}</option>{['in', 'out', 'return', 'transfer', 'adjust', 'parts'].map((m) => <option key={m} value={m}>{pick(`nst.l.k.${m}`)}</option>)}</select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={sel}><option value="">{pick('nst.l.allBrands')}</option>{brands.map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}</select>
          <select value={party} onChange={(e) => setParty(e.target.value)} className={sel}><option value="">{pick('nst.l.allParties')}</option>{(parties ?? []).map((pt) => <option key={pt.party_id} value={pt.party_id}>{pt.name}</option>)}</select>
        </div>
      </section>
      <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5" data-testid="nst-ledger">
        <h2 className="font-display font-extrabold text-base">{t('nst.l.title', { n: data?.total_rows ?? 0 })}</h2>
        <p className="text-[11px] text-slate-500 mb-3">{pick('nst.l.sub')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800"><th className="py-2.5 text-start">{pick('nst.l.date')}</th><th className="py-2.5 text-start">{pick('nst.l.type')}</th><th className="py-2.5 text-start">{pick('nst.l.item')}</th><th className="py-2.5 text-start">{pick('nst.l.party')}</th><th className="py-2.5 text-end">{pick('nst.l.qty')}</th>{canCost ? <th className="py-2.5 text-end">{pick('nst.l.unitCost')}</th> : null}<th className="py-2.5 text-end">{pick('nst.l.price')}</th>{canCost ? <><th className="py-2.5 text-end">{pick('nst.l.profitCol')}</th><th className="py-2.5 text-end">{pick('nst.l.worth')}</th></> : null}</tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.rows ?? []).map((r, i) => (
                <tr key={i} onClick={() => open(r)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-obsidian-850/50" data-testid="nst-l-row">
                  <td className="py-3 whitespace-nowrap"><div className="font-mono font-bold" dir="ltr">{r.no ?? '—'}</div><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(r.date)}</div></td>
                  <td className="py-3"><span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${r.kind === 'in' ? 'bg-emerald-50 text-emerald-700' : r.kind === 'out' ? 'bg-blue-50 text-blue-700' : r.kind.startsWith('return') ? 'bg-orange-50 text-orange-700' : r.kind.startsWith('transfer') ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>{pick(`nst.l.k.${r.kind}`)}</span></td>
                  <td className="py-3"><div className="font-bold" dir="auto">{r.label}</div><div className="text-[10px] text-slate-400 font-mono" dir="ltr">{r.category === 'items' ? pick('nitem.items') : pick(`devcat.${r.category}`)} · {r.code}</div></td>
                  <td className="py-3" dir="auto">{r.party_name ?? '—'}</td>
                  <td className={`py-3 text-end font-mono font-bold ${r.qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{r.qty > 0 ? <ArrowDownLeft className="inline w-3 h-3" /> : <ArrowUpRight className="inline w-3 h-3" />}{r.qty > 0 ? '+' : ''}{r.qty}</td>
                  {canCost ? <td className="py-3 text-end font-mono" dir="ltr">{r.unit_cost == null ? '—' : hide(r.unit_cost)}</td> : null}
                  <td className="py-3 text-end font-mono" dir="ltr">{r.price == null ? '—' : rs(r.price)}</td>
                  {canCost ? <><td className="py-3 text-end font-mono text-emerald-600" dir="ltr">{r.profit == null ? '—' : `${num(r.profit) < 0 ? '−' : '+'}${hide(r.profit)}`}</td><td className="py-3 text-end font-mono font-bold" dir="ltr">{hide(r.worth_after)}</td></> : null}
                </tr>
              ))}
              {data && !data.rows.length ? <tr><td colSpan={9} className="py-8 text-center text-slate-400">{pick('nst.l.none')}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function Wait() {
  return <div className="py-16 flex justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-obsidian-900 dark:border-t-[#A3E635]" /></div>
}

