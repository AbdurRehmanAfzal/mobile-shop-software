/** The sales screen of the new product (ADR-134), drawn from the Sales screen of
 *  `25-sales-purchases-command-center.html` (F2): the file's top bar (Sales / Purchases screens, new
 *  sale, the sales ledger report A4, profit & cost eye, Excel / CSV, language, dark), search with Scan,
 *  the period presets and from–to, filters by kind of stock, deal (udhaar, paid, loss deals), brand and
 *  channel, the six figure cards and five views: analytics & brands (a card per kind, a brand table),
 *  models sold with profit / loss, customers & dealers, the sale invoices (select several to settle
 *  their udhaar), and the full sales ledger.
 *
 *  Every figure is the server's: `/bills-hub/sales` (read-only, `billshub/service.py`) gives the kept
 *  lines of the sale bills with their cost, profit or loss, what was received and is still udhaar, and
 *  the same per kind, brand, model, person and bill; the sheet and the A4 report are
 *  `/bills-hub/sales/sheet`. The Purchases screen is `/new/purchases-screen` (the same file).
 *
 *  Differences from the drawing: "Duplicate" is "a new bill for this customer" (a phone is sold once);
 *  there is no bulk delete (ADR-099: each delete is checked on its own on the bill's page); settling
 *  several bills records one payment per bill; "+ Add" opens the counter. */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, BookOpen, Boxes, Eye, FileText, Pencil, Plus, Printer, RotateCcw, ScanLine, Search, Share2, ShoppingBag, Trash2, Users, Wallet } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { useGet, useInvalidate } from '@/lib/queries'
import { waNumber } from '@/lib/phone'
import { useModules } from '@/lib/modules'
import { A4Window } from '@/newui/pages/Invoices'
import { DateBar, DeleteGo, EditChooser, Modal, SettleWindow, Toast, TopTools, kindIcon, kindKey, num, pillBox, pillOff, pillOn, rs, signed, usePeriod, type FixBill, type M, type SettleBill } from '@/newui/billsKit'

interface Line { invoice_id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_phone: string | null; role: 'customer' | 'dealer'; kind: string; brand: string | null; brand_key: string; model: string; model_key: string; code: string | null; device_id: string | null; accessory_id: string | null; qty: number; sale: M; cost: M | null; profit: M | null; received: M; udhaar: M; mode: string | null; bought_from: string | null; bought_no: string | null }
interface Agg { units: number; bills: number; sale: M; cost: M | null; received: M; udhaar: M; profit: M | null; gain: M | null; loss: M | null }
interface Bill { id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_phone: string | null; role: 'customer' | 'dealer'; total: M; paid: M; returned: M; due: M; status: string; mode: string | null; profit: M | null; edited: boolean }
interface Data {
  figures: Agg & { net: M | null }; kinds: (Agg & { key: string })[]; brands: (Agg & { key: string; brand: string | null; models: number })[]
  models: (Agg & { key: string; kind: string; brand: string | null; model: string; lines: Line[] })[]
  parties: (Agg & { party_id: string | null; name: string | null; phone: string | null; role: string; ids: string[] })[]
  bills: Bill[]; lines: Line[]; brand_options: { key: string; name: string }[]
}
type Tab = 'overview' | 'models' | 'parties' | 'invoices' | 'ledger'
const TABS: Tab[] = ['overview', 'models', 'parties', 'invoices', 'ledger']
const TAB_ICON = { overview: BarChart3, models: Boxes, parties: Users, invoices: FileText, ledger: BookOpen }
const MODES = ['cash', 'bank', 'online', 'cheque', 'remittance', 'udhaar'] as const

export default function NewSales() {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const has = useModules()
  const { sp, set, preset, from, to } = usePeriod()
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'overview') as Tab
  const cat = sp.get('cat') ?? ''
  const deal = sp.get('deal') ?? ''
  const brand = sp.get('brand') ?? ''
  const mode = sp.get('mode') ?? ''
  const q = sp.get('q') ?? ''
  const [showCost, setShowCost] = useState(true)
  const [settle, setSettle] = useState<SettleBill | null>(null)
  const [fix, setFix] = useState<FixBill | null>(null)
  const [del, setDel] = useState<FixBill | null>(null)
  const [a4, setA4] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 2800); return () => clearTimeout(h) }, [toast])
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchases-screen', F4: '/new/khata', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const qs = new URLSearchParams()
  if (q.trim()) qs.set('q', q.trim())
  if (from) qs.set('date_from', from)
  if (to) qs.set('date_to', to)
  if (cat) qs.set('kind', cat)
  if (deal) qs.set('deal', deal)
  if (brand) qs.set('brand', brand)
  if (mode) qs.set('mode', mode)
  const { data } = useGet<Data>(['bills-hub', 'sales', qs.toString()], `/api/v1/bills-hub/sales?${qs}`)
  const sheet = `/api/v1/bills-hub/sales/sheet?${qs}`
  const costOk = canCost && showCost
  const hide = (v: M | null | undefined) => (costOk ? rs(v) : '••••••')
  const pl = (v: M | null | undefined) => (costOk ? signed(v) : '••••••')
  const f = data?.figures
  const cats: [string, string][] = [['', 'nsales.cat.all'], ['phone', 'devcat.phone'], ['laptop', 'devcat.laptop'], ['watch', 'devcat.watch'], ['tablet', 'devcat.tablet'], ...(has('accessories') ? [['items', 'nitem.items']] as [string, string][] : [])]
  const deals = ['', 'udhaar', 'paid', ...(canCost ? ['loss'] : [])]
  const billById = useMemo(() => new Map((data?.bills ?? []).map((b) => [b.id, b])), [data])
  const act: Act = {
    settle: (b) => setSettle({ id: b.id, no: b.no, kind: 'sale', party_id: b.party_id, party_name: b.party_name, due: b.due }),
    fix: (b) => setFix({ id: b.id, no: b.no, kind: 'sale', party_id: b.party_id }),
    del: (b) => setDel({ id: b.id, no: b.no, kind: 'sale' }),
    open: (id) => nav(`/sales/${id}`),
    share: (b) => { const msg = [`*${shop?.name ?? ''}*`, `${pick('nbill.kindBill.sale')}: ${b.no}`, `${pick('nbill.dateL')}: ${fmtDate(b.date)}`, b.party_name ? `${pick('nbill.partyL')}: ${b.party_name}` : '', `${pick('nbill.total')}: ${rs(b.total)}`, `${pick('nbill.paid')}: ${rs(b.paid)}`, `${pick('nbill.remaining')}: ${rs(b.due)}`].filter(Boolean).join('\n'); window.open(`https://wa.me/${waNumber(b.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener') },
    newFor: (pid) => nav(pid ? `/sale/new?party=${pid}` : '/new/sale/new'),
  }

  return (
    <div className="font-sans bg-[#F2F4F7] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid="nsales" data-newui="1" data-file="25">
      <header className="bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/new" className="flex items-center gap-2 pe-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0">
              <span className="w-8 h-8 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span>
              <span className="hidden sm:block"><span className="block font-display font-extrabold text-sm tracking-tight leading-none">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-400 font-medium mt-0.5">{pick('nsales.sub')}</span></span>
            </Link>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700">
              <span className="px-3.5 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 bg-[#A3E635] text-obsidian-950 shadow-xs" aria-current="page"><ShoppingBag className="w-3.5 h-3.5" />{pick('nsales.salesScreen')} <span dir="ltr">(F2)</span></span>
              {canCost ? <button type="button" onClick={() => nav('/new/purchases-screen')} className="px-3.5 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer" data-testid="nsales-purchases"><Boxes className="w-3.5 h-3.5" />{pick('nsales.purchasesScreen')} <span dir="ltr">(F3)</span></button> : null}
            </div>
            <button type="button" onClick={() => nav('/new/sale/new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 cursor-pointer" data-testid="nsales-new"><Plus className="w-3.5 h-3.5" />{pick('nsales.newSale')}</button>
            <button type="button" onClick={() => setA4(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-obsidian-950 dark:bg-obsidian-800 text-white border border-slate-700 hover:border-[#A3E635] cursor-pointer" data-testid="nsales-a4"><BookOpen className="w-3.5 h-3.5 text-amber-400" />{pick('nsales.ledgerBtn')}</button>
          </div>
          <TopTools canCost={canCost} showCost={showCost} setShowCost={setShowCost} sheet={sheet} eyeOn="nsales.costVisible" eyeOff="nsales.costHidden" testid="nsales" />
        </div>
      </header>

      <section className="bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-30">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => set({ q: e.target.value || null })} placeholder={pick('nsales.search')} className="w-full ps-8 pe-16 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#A3E635]" data-testid="nsales-q" />
              <button type="button" onClick={() => (document.querySelector('[data-testid="nsales-q"]') as HTMLInputElement | null)?.focus()} className="absolute end-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"><ScanLine className="w-3 h-3" />{pick('nbill.scan')}</button>
            </div>
            <DateBar preset={preset} from={from} to={to} set={set} testid="nsales" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className={pillBox}>{cats.map(([k, l]) => { const I = kindIcon(k); return <button key={k} type="button" onClick={() => set({ cat: k || null })} aria-pressed={cat === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap flex items-center gap-1 ${cat === k ? pillOn : pillOff}`} data-testid={`nsales-cat-${k || 'all'}`}>{k ? <I className="w-3 h-3" /> : null}{pick(l)}</button> })}</div>
              <div className={pillBox}>{deals.map((k) => <button key={k} type="button" onClick={() => set({ deal: k || null })} aria-pressed={deal === k} className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap ${deal === k ? pillOn : pillOff}`} data-testid={`nsales-deal-${k || 'all'}`}>{pick(`nsales.deal.${k || 'all'}`)}</button>)}</div>
              <select value={brand} onChange={(e) => set({ brand: e.target.value || null })} className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="nsales-brand"><option value="">{t('nsales.brandAll', { n: data?.brand_options.length ?? 0 })}</option>{(data?.brand_options ?? []).map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select>
              <select value={mode} onChange={(e) => set({ mode: e.target.value || null })} className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="nsales-mode"><option value="">{pick('nsales.modeAll')}</option>{MODES.map((m) => <option key={m} value={m}>{pick(`nbill.mode.${m}`)}</option>)}</select>
            </div>
            <div className={`${pillBox} text-xs`}>
              {TABS.map((k) => { const I = TAB_ICON[k]; return <button key={k} type="button" onClick={() => set({ tab: k === 'overview' ? null : k })} aria-pressed={tab === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap flex items-center gap-1 ${tab === k ? 'bg-[#A3E635] text-obsidian-950' : pillOff}`} data-testid={`nsales-tab-${k}`}><I className="w-3 h-3" />{pick(`nsales.tab.${k}`)}</button> })}
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-5 flex-1 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="nsales-figures">
          <div className="p-4 rounded-2xl bg-[#A3E635] text-obsidian-950" data-testid="nsales-f-sales"><div className="text-[10px] font-extrabold uppercase opacity-80">{pick('nsales.k.sales')}</div><div className="font-display font-extrabold text-xl sm:text-2xl mt-1" dir="ltr">{f ? rs(f.sale) : '…'}</div><div className="text-[11px] font-bold opacity-80 mt-0.5">{t('nsales.k.salesSub', { u: f?.units ?? 0, b: f?.bills ?? 0 })}</div></div>
          {canCost ? <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nsales-f-cost"><div className="text-[10px] font-bold uppercase text-slate-400">{pick('nsales.k.cost')}</div><div className="font-display font-extrabold text-xl sm:text-2xl mt-1" dir="ltr">{f ? hide(f.cost) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('nsales.k.costSub')}</div></div> : null}
          <button type="button" onClick={() => set({ deal: 'paid' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-emerald-300/70 dark:border-emerald-800 cursor-pointer" data-testid="nsales-f-received"><div className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-[#A3E635]">{pick('nsales.k.received')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-[#A3E635] mt-1" dir="ltr">{f ? rs(f.received) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('nsales.k.receivedSub')}</div></button>
          <button type="button" onClick={() => set({ deal: 'udhaar' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-amber-300/80 dark:border-amber-800 cursor-pointer" data-testid="nsales-f-udhaar"><div className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400">{pick('nsales.k.udhaar')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-amber-700 dark:text-amber-300 mt-1" dir="ltr">{f ? rs(f.udhaar) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('nsales.k.udhaarSub')}</div></button>
          {canCost ? <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800" data-testid="nsales-f-gain"><div className="text-[10px] font-extrabold uppercase text-emerald-800 dark:text-[#A3E635]">{pick('nsales.k.gain')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-700 dark:text-[#A3E635] mt-1" dir="ltr">{f ? (costOk ? `+${rs(f.gain)}` : '••••••') : '…'}</div><div className="text-[11px] text-emerald-700/80 dark:text-emerald-300 mt-0.5">{t('nsales.k.net', { v: f ? pl(f.net) : '…' })}</div></div> : null}
          {canCost ? <button type="button" onClick={() => set({ deal: 'loss' })} className="p-4 rounded-2xl text-start bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800 cursor-pointer" data-testid="nsales-f-loss"><div className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400">{pick('nsales.k.loss')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-rose-600 dark:text-rose-400 mt-1" dir="ltr">{f ? (costOk ? (num(f.loss) > 0 ? `−${rs(f.loss)}` : rs(0)) : '••••••') : '…'}</div><div className="text-[11px] text-rose-700/80 dark:text-rose-300 mt-0.5">{pick('nsales.k.lossSub')}</div></button> : null}
        </div>

        {!data ? <div className="p-10 text-center text-slate-400">…</div>
          : tab === 'overview' ? <Overview d={data} cat={cat} canCost={canCost} hide={hide} pl={pl} setCat={(k) => set({ cat: k })} setBrand={(b) => set({ brand: b, tab: 'models' })} reset={() => set({ cat: null, brand: null, deal: null, mode: null })} onNew={() => nav('/new/sale/new')} />
            : tab === 'models' ? <Models d={data} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} />
              : tab === 'parties' ? <Parties d={data} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} />
                : tab === 'invoices' ? <Invoices bills={data.bills} canCost={canCost} pl={pl} act={act} onDone={setToast} />
                  : <Ledger lines={data.lines} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} onA4={() => setA4(true)} />}
      </main>

      {settle ? <SettleWindow bill={settle} onClose={() => setSettle(null)} onDone={(m) => { setSettle(null); setToast(m) }} /> : null}
      {fix ? <EditChooser bill={fix} onClose={() => setFix(null)} /> : null}
      {del ? <DeleteGo bill={del} onClose={() => setDel(null)} /> : null}
      {a4 ? <A4Window sheet={sheet} canCost={canCost} showCost={showCost} onClose={() => setA4(false)} title="nsales.a4Title" sub="nsales.a4Sub" /> : null}
      <Toast msg={toast} />
    </div>
  )
}

type Act = { settle: (b: Bill) => void; fix: (b: Bill) => void; del: (b: Bill) => void; open: (id: string) => void; share: (b: Bill) => void; newFor: (pid: string | null) => void }
type Fmt = (v: M | null | undefined) => string
const plTone = (v: M | null | undefined) => (num(v) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]')

function Overview({ d, cat, canCost, hide, pl, setCat, setBrand, reset, onNew }: { d: Data; cat: string; canCost: boolean; hide: Fmt; pl: Fmt; setCat: (k: string) => void; setBrand: (b: string) => void; reset: () => void; onNew: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const has = useModules()
  const kinds = d.kinds.filter((k) => k.key !== 'laptop' || has('laptops')).filter((k) => k.key !== 'items' || has('accessories'))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="nsales-kinds">
        {kinds.map((k) => { const I = kindIcon(k.key); return (
          <button key={k.key} type="button" onClick={() => setCat(k.key)} className={`p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border ${cat === k.key ? 'border-[#A3E635] ring-2 ring-[#A3E635]/40' : 'border-slate-200 dark:border-slate-800'} hover:border-obsidian-950 dark:hover:border-[#A3E635] cursor-pointer`} data-testid={`nsales-kind-${k.key}`}>
            <div className="flex items-center justify-between"><span className="font-display font-extrabold text-sm flex items-center gap-1.5"><I className="w-4 h-4" />{pick(kindKey(k.key))}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-obsidian-800">{t('nsales.units', { n: k.units })}</span></div>
            <div className="font-mono font-extrabold text-lg mt-2" dir="ltr">{rs(k.sale)}</div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px]"><span className="text-slate-400">{pick('nsales.debit')}: <strong className="text-amber-600" dir="ltr">{rs(k.udhaar)}</strong></span>{canCost ? <span className={`font-bold ${plTone(k.profit)}`} dir="ltr">{pl(k.profit)}</span> : null}</div>
          </button>
        ) })}
      </div>
      <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nsales-brands">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-display font-extrabold text-base">{pick('nsales.brandTitle')}</h2><p className="text-xs text-slate-500">{pick('nsales.brandSub')}</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onNew} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">+ {pick('nsales.addSale')}</button><button type="button" onClick={reset} className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3 h-3" />{pick('nsales.reset')}</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800"><tr>
              <th className="px-4 py-2.5 text-start">{pick('nsales.col.brand')}</th><th className="px-4 py-2.5 text-end">{pick('nsales.col.units')}</th>{canCost ? <th className="px-4 py-2.5 text-end">{pick('nsales.col.cost')}</th> : null}<th className="px-4 py-2.5 text-end">{pick('nsales.col.sales')}</th><th className="px-4 py-2.5 text-end">{pick('nsales.col.received')}</th><th className="px-4 py-2.5 text-end">{pick('nsales.col.udhaar')}</th>{canCost ? <th className="px-4 py-2.5 text-end">{pick('nsales.col.pl')}</th> : null}<th className="px-4 py-2.5 text-end">{pick('nsales.col.quick')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.brands.map((b) => (
                <tr key={b.key} onClick={() => setBrand(b.key)} className="hover:bg-slate-50 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="nsales-brand-row">
                  <td className="px-4 py-3 font-display font-extrabold text-sm">{b.brand ?? '—'} <span className="text-[11px] font-normal text-slate-400">({t('nsales.models', { n: b.models })})</span></td>
                  <td className="px-4 py-3 text-end font-mono font-bold">{b.units}</td>
                  {canCost ? <td className="px-4 py-3 text-end font-mono" dir="ltr">{hide(b.cost)}</td> : null}
                  <td className="px-4 py-3 text-end font-mono font-bold" dir="ltr">{rs(b.sale)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(b.received)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-amber-600" dir="ltr">{rs(b.udhaar)}</td>
                  {canCost ? <td className={`px-4 py-3 text-end font-mono font-extrabold ${plTone(b.profit)}`} dir="ltr">{pl(b.profit)}</td> : null}
                  <td className="px-4 py-3 text-end"><button type="button" onClick={(e) => { e.stopPropagation(); setBrand(b.key) }} className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">{pick('nsales.modelsBtn')} →</button></td>
                </tr>
              ))}
              {!d.brands.length ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">{pick('nsales.none')}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function RowActs({ b, act }: { b: Bill | undefined; act: Act }) {
  const { pick } = useLang()
  if (!b) return null
  return (
    <span className="inline-flex items-center gap-1">
      {num(b.due) > 0 && b.party_id ? <button type="button" onClick={(e) => { e.stopPropagation(); act.settle(b) }} title={pick('nbill.settle')} aria-label={pick('nbill.settle')} className="p-1 rounded bg-emerald-600 text-white cursor-pointer" data-testid="nsales-settle-btn"><Wallet className="w-3 h-3" /></button> : null}
      <button type="button" onClick={(e) => { e.stopPropagation(); act.fix(b) }} title={pick('nbill.edit')} aria-label={pick('nbill.edit')} className="p-1 rounded bg-slate-100 dark:bg-obsidian-800 text-amber-600 cursor-pointer"><Pencil className="w-3 h-3" /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); act.newFor(b.party_id) }} title={pick('nsales.newFor')} aria-label={pick('nsales.newFor')} className="p-1 rounded bg-slate-100 dark:bg-obsidian-800 cursor-pointer"><Plus className="w-3 h-3" /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); act.del(b) }} title={pick('nbill.delete')} aria-label={pick('nbill.delete')} className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
    </span>
  )
}

function Models({ d, canCost, hide, pl, bills, act }: { d: Data; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  if (!d.models.length) return <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800">{pick('nsales.noModels')}</div>
  return (
    <div className="space-y-3" data-testid="nsales-models">
      {d.models.map((m) => (
        <div key={m.key} className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nsales-model">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950">{pick(kindKey(m.kind))}</span><span className="font-display font-extrabold text-base" dir="auto">{[m.brand, m.model].filter(Boolean).join(' ')}</span><span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 dark:bg-obsidian-800">{t('nsales.units', { n: m.units })}</span></div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {canCost ? <div><span className="text-slate-400 block text-[10px]">{pick('nsales.m.cost')}</span><strong className="font-mono" dir="ltr">{hide(m.cost)}</strong></div> : null}
              <div><span className="text-slate-400 block text-[10px]">{pick('nsales.m.sale')}</span><strong className="font-mono" dir="ltr">{rs(m.sale)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('nsales.m.udhaar')}</span><strong className="font-mono text-amber-600" dir="ltr">{rs(m.udhaar)}</strong></div>
              {canCost ? <div><span className="text-slate-400 block text-[10px]">{pick('nsales.m.pl')}</span><strong className={`font-mono ${plTone(m.profit)}`} dir="ltr">{pl(m.profit)}</strong></div> : null}
            </div>
          </div>
          <LineTable lines={m.lines} canCost={canCost} hide={hide} pl={pl} bills={bills} act={act} />
        </div>
      ))}
    </div>
  )
}

function LineTable({ lines, canCost, hide, pl, bills, act, full }: { lines: Line[]; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act; full?: boolean }) {
  const { pick } = useLang()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800"><tr>
          <th className="px-4 py-2 text-start">{pick('nsales.col.bill')}</th>{full ? <th className="px-4 py-2 text-start">{pick('nsales.col.kindBrand')}</th> : null}<th className="px-4 py-2 text-start">{pick(full ? 'nsales.col.modelCode' : 'nsales.col.code')}</th><th className="px-4 py-2 text-start">{pick('nsales.col.buyer')}</th>{canCost ? <th className="px-4 py-2 text-start">{pick('nsales.col.bought')}</th> : null}
          {canCost ? <th className="px-4 py-2 text-end">{pick('nsales.m.cost')}</th> : null}<th className="px-4 py-2 text-end">{pick('nsales.col.sale')}</th>{full ? <th className="px-4 py-2 text-end">{pick('nsales.col.received')}</th> : null}<th className="px-4 py-2 text-end">{pick('nsales.col.udhaar')}</th>{canCost ? <th className="px-4 py-2 text-end">{pick('nsales.m.pl')}</th> : null}<th className="px-4 py-2 text-end">{pick('nsales.col.actions')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((l, i) => (
            <tr key={`${l.invoice_id}-${i}`} onClick={() => act.open(l.invoice_id)} className="hover:bg-slate-50 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="nsales-line">
              <td className="px-4 py-2 font-mono font-bold whitespace-nowrap" dir="ltr">{l.no} <span className="text-slate-400 font-normal">({fmtDate(l.date)})</span></td>
              {full ? <td className="px-4 py-2"><strong>{pick(kindKey(l.kind))}</strong><br /><span className="text-[11px] text-slate-500">{l.brand ?? '—'}</span></td> : null}
              <td className="px-4 py-2">{full ? <><strong dir="auto">{l.model}</strong>{l.qty > 1 ? <span dir="ltr"> ({l.qty}×)</span> : null}<br /></> : null}<span className="font-mono text-[11px] text-slate-500" dir="ltr">{l.code ?? '—'}</span></td>
              <td className="px-4 py-2 font-bold" dir="auto">{l.party_name ?? pick('nbill.walkin')} <span className="text-[10px] text-slate-400">({pick(`nbill.role.${l.role}`)})</span></td>
              {canCost ? <td className="px-4 py-2 text-slate-500" dir="auto">{l.bought_from ? <>{l.bought_from} <span dir="ltr">({l.bought_no})</span></> : '—'}</td> : null}
              {canCost ? <td className="px-4 py-2 text-end font-mono" dir="ltr">{hide(l.cost)}</td> : null}
              <td className="px-4 py-2 text-end font-mono font-bold" dir="ltr">{rs(l.sale)}</td>
              {full ? <td className="px-4 py-2 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(l.received)}</td> : null}
              <td className={`px-4 py-2 text-end font-mono ${num(l.udhaar) > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}`} dir="ltr">{num(l.udhaar) > 0 ? rs(l.udhaar) : '0'}</td>
              {canCost ? <td className={`px-4 py-2 text-end font-mono font-extrabold ${plTone(l.profit)}`} dir="ltr">{pl(l.profit)}</td> : null}
              <td className="px-4 py-2 text-end whitespace-nowrap"><RowActs b={bills.get(l.invoice_id)} act={act} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Parties({ d, canCost, hide, pl, bills, act }: { d: Data; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  void hide
  if (!d.parties.length) return <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800">{pick('nsales.none')}</div>
  return (
    <div className="space-y-4" data-testid="nsales-parties">
      {d.parties.map((p) => (
        <div key={p.party_id ?? 'walkin'} className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nsales-party">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${p.role === 'dealer' ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>{pick(`nbill.role.${p.role}`)}</span>{p.party_id ? <button type="button" onClick={() => nav(`/new/parties/${p.party_id}`)} className="font-display font-extrabold text-base hover:underline cursor-pointer" dir="auto">{p.name}</button> : <span className="font-display font-extrabold text-base">{pick('nbill.walkin')}</span>}{p.phone ? <span className="font-mono text-xs text-slate-400" dir="ltr">{p.phone}</span> : null}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t('nsales.p.bills', { b: p.bills, u: p.units })}</div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div><span className="text-slate-400 block text-[10px]">{pick('nsales.p.total')}</span><strong className="font-mono" dir="ltr">{rs(p.sale)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('nsales.p.settled')}</span><strong className="font-mono text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(p.received)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('nsales.p.udhaar')}</span><strong className={`font-mono ${num(p.udhaar) > 0 ? 'text-rose-600' : 'text-slate-400'}`} dir="ltr">{rs(p.udhaar)}</strong></div>
              {canCost ? <div><span className="text-slate-400 block text-[10px]">{pick('nsales.p.profit')}</span><strong className={`font-mono ${plTone(p.profit)}`} dir="ltr">{pl(p.profit)}</strong></div> : null}
              <button type="button" onClick={() => act.newFor(p.party_id)} className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">+ {t('nsales.p.newBill', { n: (p.name ?? pick('nbill.walkin')).split(' ')[0] })}</button>
            </div>
          </div>
          <div className="p-3.5 space-y-2">{p.ids.map((id) => bills.get(id)).filter((b): b is Bill => !!b).map((b) => <BillCard key={b.id} b={b} canCost={canCost} pl={pl} act={act} />)}</div>
        </div>
      ))}
    </div>
  )
}

function BillCard({ b, canCost, pl, act, checked, onCheck }: { b: Bill; canCost: boolean; pl: Fmt; act: Act; checked?: boolean; onCheck?: (v: boolean) => void }) {
  const { pick } = useLang()
  return (
    <div className={`rounded-2xl border ${checked ? 'border-[#A3E635] ring-1 ring-[#A3E635]' : b.edited ? 'border-amber-400/80 dark:border-amber-700' : 'border-slate-200/90 dark:border-slate-800'} p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40 dark:bg-obsidian-850/60`} data-testid="nsales-bill" data-no={b.no}>
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        {onCheck ? <input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} aria-label={b.no} className="mt-1 sm:mt-0 rounded cursor-pointer" data-testid="nsales-check" /> : null}
        <button type="button" onClick={() => act.open(b.id)} className="w-10 h-10 rounded-xl bg-[#A3E635] text-obsidian-950 flex items-center justify-center shrink-0 cursor-pointer"><ShoppingBag className="w-4 h-4" /></button>
        <button type="button" onClick={() => act.open(b.id)} className="min-w-0 flex-1 text-start cursor-pointer">
          <span className="flex flex-wrap items-center gap-1.5"><span className="font-display font-extrabold text-sm" dir="auto">{b.party_name ?? pick('nbill.walkin')}</span><span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr">{b.no}</span>{b.edited ? <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300">{pick('nbill.edited')}</span> : null}<span className="text-[11px] text-slate-400"><span dir="ltr">{fmtDate(b.date)}</span>{b.mode ? <> · {pick(`nbill.mode.${b.mode}`)}</> : null}</span></span>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/70 dark:border-slate-800">
        <div className="text-start lg:text-end me-1"><div className="font-mono font-extrabold text-sm" dir="ltr">{rs(b.total)}</div><div className="flex items-center gap-1.5 text-[10px] font-bold mt-0.5"><span className="text-emerald-600 dark:text-[#A3E635]">{pick('nsales.credit')}: <span dir="ltr">{rs(b.paid)}</span></span>{num(b.due) > 0 ? <span className="text-amber-600">· {pick('nsales.debit')}: <span dir="ltr">{rs(b.due)}</span></span> : null}{canCost && b.profit != null ? <span className={plTone(b.profit)} dir="ltr">({pl(b.profit)})</span> : null}</div></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => act.open(b.id)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 flex items-center gap-1 cursor-pointer"><Eye className="w-3 h-3" />{pick('nbill.viewBtn')}</button>
          {num(b.due) > 0 && b.party_id ? <button type="button" onClick={() => act.settle(b)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-emerald-600 text-white flex items-center gap-1 cursor-pointer"><Wallet className="w-3 h-3" />{pick('nbill.settle')}</button> : null}
          <button type="button" onClick={() => act.share(b)} title={pick('nbill.whatsapp')} aria-label={pick('nbill.whatsapp')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 cursor-pointer"><Share2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => act.fix(b)} title={pick('nbill.edit')} aria-label={pick('nbill.edit')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-amber-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => act.newFor(b.party_id)} title={pick('nsales.newFor')} aria-label={pick('nsales.newFor')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => act.del(b)} title={pick('nbill.delete')} aria-label={pick('nbill.delete')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  )
}

/** the sale invoices; several can be picked and their udhaar settled, one payment per bill */
function Invoices({ bills, canCost, pl, act, onDone }: { bills: Bill[]; canCost: boolean; pl: Fmt; act: Act; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const all = bills.length > 0 && bills.every((b) => sel.has(b.id))
  const picked = bills.filter((b) => sel.has(b.id) && num(b.due) > 0 && b.party_id)
  async function settleAll() {
    setBusy(true); setErr(null)
    let n = 0
    try {
      for (const b of picked) {
        await api('POST', '/api/v1/payments', { party_id: b.party_id, direction: 'in', amount: num(b.due), allocations: [{ document_type: 'invoice', document_id: b.id, amount: num(b.due) }] })
        n += 1
      }
      setSel(new Set()); setConfirm(false)
      onDone(t('nsales.settleSelDone', { n }))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally {
      setBusy(false)
      if (n) await inv('bills-hub', 'invoices', 'sales', 'party', 'parties', 'statement', 'payments', 'dashboard', 'day', 'balances')
    }
  }
  return (
    <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5" data-testid="nsales-invoices">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-3"><label className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(bills.map((b) => b.id)) : new Set())} className="rounded" data-testid="nsales-check-all" />{pick('nsales.selectAll')}</label><h2 className="font-display font-extrabold text-base">{t('nsales.invTitle', { n: bills.length })}</h2></div>
        <div className="flex flex-wrap items-center gap-1.5">
          {sel.size ? <>
            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-100 dark:bg-obsidian-800">{t('nsales.selected', { n: sel.size })}</span>
            <button type="button" disabled={!picked.length} onClick={() => setConfirm(true)} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 text-white cursor-pointer disabled:opacity-50" data-testid="nsales-settle-sel">{pick('nsales.settleSel')}</button>
            <span className="text-[11px] text-slate-500 max-w-[260px]">{pick('nsales.noBulkDelete')}</span>
          </> : <button type="button" onClick={() => nav('/new/sale/new')} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">+ {pick('nsales.createNew')}</button>}
        </div>
      </div>
      {bills.map((b) => <BillCard key={b.id} b={b} canCost={canCost} pl={pl} act={act} checked={sel.has(b.id)} onCheck={(v) => { const n = new Set(sel); if (v) n.add(b.id); else n.delete(b.id); setSel(n) }} />)}
      {!bills.length ? <div className="p-8 text-center text-xs text-slate-400">{pick('nsales.none')}</div> : null}
      {confirm ? (
        <Modal title={t('nsales.settleSelTitle', { n: picked.length })} sub={pick('nsales.settleSelSub')} onClose={() => setConfirm(false)} testid="nsales-settle-window">
          <div className="p-5 space-y-2 text-xs">
            {picked.map((b) => <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850"><span><span className="font-mono font-bold" dir="ltr">{b.no}</span> · <span dir="auto">{b.party_name}</span></span><span className="font-mono font-extrabold text-amber-700" dir="ltr">{rs(b.due)}</span></div>)}
            {err ? <p className="text-rose-600 font-bold" role="alert">{err}</p> : null}
            <button type="button" disabled={busy} onClick={() => void settleAll()} className="w-full py-2.5 rounded-xl font-extrabold bg-emerald-600 text-white cursor-pointer disabled:opacity-50" data-testid="nsales-settle-sel-go">{pick('nbill.apply')}</button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

function Ledger({ lines, canCost, hide, pl, bills, act, onA4 }: { lines: Line[]; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act; onA4: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  return (
    <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nsales-ledger">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display font-extrabold text-base">{t('nsales.ledTitle', { n: lines.length })}</h2><p className="text-xs text-slate-500">{pick('nsales.ledSub')}</p></div>
        <button type="button" onClick={onA4} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-obsidian-950 text-white dark:bg-obsidian-800 flex items-center gap-1.5 cursor-pointer"><Printer className="w-3.5 h-3.5" />{pick('nsales.ledPrint')}</button>
      </div>
      <LineTable lines={lines} canCost={canCost} hide={hide} pl={pl} bills={bills} act={act} full />
    </section>
  )
}
