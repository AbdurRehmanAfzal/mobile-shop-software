/** The purchases screen of the new product (ADR-134), drawn from the Purchases screen of
 *  `25-sales-purchases-command-center.html` (F3): the file's top bar (Sales / Purchases screens, new
 *  purchase bill, the purchases ledger report A4, the cost eye, Excel / CSV, language, dark), search with
 *  Scan, the period presets and from–to, filters by kind of stock, deal (still to pay, paid), brand and
 *  channel, the five figure cards and five views: purchase analytics & brands (a card per kind, a brand
 *  table), models bought (cost / stock), dealers & sellers, the purchase bills (select several to pay
 *  what is left on them), and the full purchase ledger.
 *
 *  Every figure is the server's: `/bills-hub/purchases` (read-only, `billshub/service.py`) gives the
 *  kept lines of the purchase bills with what each cost, what was paid and is still to pay the seller,
 *  and where the stock is now (in the shop, sold and to whom), and the same per kind, brand, model,
 *  seller and bill, with the average buying cost of one unit; the sheet and the A4 report are
 *  `/bills-hub/purchases/sheet`. It is all cost, so the screen is for the owner and the manager.
 *
 *  Differences from the drawing: there is no "duplicate" and no bulk delete (ADR-099: each delete is
 *  checked on its own on the bill's page); a correction goes through the live screens (ADR-090);
 *  paying several bills records one payment per bill. */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, BookOpen, Boxes, Eye, FileText, Lock, Package, Pencil, Plus, Printer, RotateCcw, ScanLine, Search, Share2, ShoppingBag, Trash2, Users, Wallet } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { useGet, useInvalidate } from '@/lib/queries'
import { waNumber } from '@/lib/phone'
import { useModules } from '@/lib/modules'
import { A4Window } from '@/newui/pages/Invoices'
import { DateBar, DeleteGo, EditChooser, Modal, SettleWindow, Toast, TopTools, kindIcon, kindKey, num, pillBox, pillOff, pillOn, rs, usePeriod, type FixBill, type M, type SettleBill } from '@/newui/billsKit'

type Where = 'in_shop' | 'sold' | 'part' | 'other'
interface Line { purchase_id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_phone: string | null; role: 'customer' | 'dealer'; kind: string; brand: string | null; brand_key: string; model: string; model_key: string; code: string | null; device_id: string | null; accessory_id: string | null; qty: number; amount: M; unit_cost: M; paid: M; due: M; in_shop: number; sold: number; state: Where; sold_to: string | null; sold_no: string | null; mode: string | null }
interface Agg { units: number; bills: number; amount: M; paid: M; due: M; in_shop: number; sold: number; avg: M }
interface Bill { id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_phone: string | null; role: 'customer' | 'dealer'; supplier_no: string | null; total: M; paid: M; returned: M; due: M; status: string; mode: string | null; edited: boolean }
interface Data {
  figures: Agg; kinds: (Agg & { key: string })[]; brands: (Agg & { key: string; brand: string | null; models: number })[]
  models: (Agg & { key: string; kind: string; brand: string | null; model: string; lines: Line[] })[]
  parties: (Agg & { party_id: string | null; name: string | null; phone: string | null; role: string; ids: string[] })[]
  bills: Bill[]; lines: Line[]; brand_options: { key: string; name: string }[]
}
type Tab = 'overview' | 'models' | 'parties' | 'invoices' | 'ledger'
const TABS: Tab[] = ['overview', 'models', 'parties', 'invoices', 'ledger']
const TAB_ICON = { overview: BarChart3, models: Boxes, parties: Users, invoices: FileText, ledger: BookOpen }
const MODES = ['cash', 'bank', 'online', 'cheque', 'remittance', 'udhaar'] as const
const WHERE_TONE: Record<Where, string> = { in_shop: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', sold: 'bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635]', part: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', other: 'bg-slate-200 text-slate-600 dark:bg-obsidian-800 dark:text-slate-300' }

export default function NewPurchasesScreen() {
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
    const go: Record<string, string> = { F2: '/new/sales', F4: '/new/khata', F10: '/new/invoices' }
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
  const { data } = useGet<Data>(['bills-hub', 'purchases', qs.toString()], canCost ? `/api/v1/bills-hub/purchases?${qs}` : null)
  const sheet = `/api/v1/bills-hub/purchases/sheet?${qs}`
  const hide = (v: M | null | undefined) => (showCost ? rs(v) : '••••••')
  const f = data?.figures
  const cats: [string, string][] = [['', 'nsales.cat.all'], ['phone', 'devcat.phone'], ['laptop', 'devcat.laptop'], ['watch', 'devcat.watch'], ['tablet', 'devcat.tablet'], ...(has('accessories') ? [['items', 'nitem.items']] as [string, string][] : [])]
  const deals = ['', 'udhaar', 'paid']
  const billById = useMemo(() => new Map((data?.bills ?? []).map((b) => [b.id, b])), [data])
  const act: Act = {
    settle: (b) => setSettle({ id: b.id, no: b.no, kind: 'purchase', party_id: b.party_id, party_name: b.party_name, due: b.due }),
    fix: (b) => setFix({ id: b.id, no: b.no, kind: 'purchase', party_id: b.party_id }),
    del: (b) => setDel({ id: b.id, no: b.no, kind: 'purchase' }),
    open: (id) => nav(`/purchases/${id}`),
    share: (b) => { const msg = [`*${shop?.name ?? ''}*`, `${pick('nbill.kindBill.purchase')}: ${b.no}`, `${pick('nbill.dateL')}: ${fmtDate(b.date)}`, b.party_name ? `${pick('nbill.partyL')}: ${b.party_name}` : '', `${pick('nbill.total')}: ${rs(b.total)}`, `${pick('nbill.paid')}: ${rs(b.paid)}`, `${pick('nbill.remaining')}: ${rs(b.due)}`].filter(Boolean).join('\n'); window.open(`https://wa.me/${waNumber(b.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener') },
  }

  if (!canCost) {
    return (
      <div className="font-sans bg-[#F2F4F7] dark:bg-obsidian-950 text-slate-900 dark:text-slate-100 min-h-dvh flex items-center justify-center p-6" data-testid="npsc" data-newui="1" data-file="25">
        <div className="max-w-sm text-center bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-3" data-testid="npsc-locked">
          <Lock className="w-8 h-8 mx-auto text-slate-400" />
          <p className="font-display font-extrabold">{pick('npsc.locked')}</p>
          <button type="button" onClick={() => nav('/new/sales')} className="px-4 py-2 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">{pick('nsales.salesScreen')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="font-sans bg-[#F2F4F7] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid="npsc" data-newui="1" data-file="25">
      <header className="bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/new" className="flex items-center gap-2 pe-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0">
              <span className="w-8 h-8 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span>
              <span className="hidden sm:block"><span className="block font-display font-extrabold text-sm tracking-tight leading-none">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-400 font-medium mt-0.5">{pick('nsales.sub')}</span></span>
            </Link>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700">
              <button type="button" onClick={() => nav('/new/sales')} className="px-3.5 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer" data-testid="npsc-sales"><ShoppingBag className="w-3.5 h-3.5" />{pick('nsales.salesScreen')} <span dir="ltr">(F2)</span></button>
              <span className="px-3.5 py-1.5 rounded-lg text-xs font-display font-extrabold flex items-center gap-1.5 bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 shadow-xs" aria-current="page"><Boxes className="w-3.5 h-3.5" />{pick('nsales.purchasesScreen')} <span dir="ltr">(F3)</span></span>
            </div>
            <button type="button" onClick={() => nav('/new/purchase/new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 cursor-pointer" data-testid="npsc-new"><Plus className="w-3.5 h-3.5" />{pick('npsc.newBill')}</button>
            <button type="button" onClick={() => setA4(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-obsidian-950 dark:bg-obsidian-800 text-white border border-slate-700 hover:border-[#A3E635] cursor-pointer" data-testid="npsc-a4"><BookOpen className="w-3.5 h-3.5 text-amber-400" />{pick('npsc.ledgerBtn')}</button>
          </div>
          <TopTools canCost showCost={showCost} setShowCost={setShowCost} sheet={sheet} eyeOn="npsc.costVisible" eyeOff="npsc.costHidden" testid="npsc" />
        </div>
      </header>

      <section className="bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-30">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => set({ q: e.target.value || null })} placeholder={pick('npsc.search')} className="w-full ps-8 pe-16 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#A3E635]" data-testid="npsc-q" />
              <button type="button" onClick={() => (document.querySelector('[data-testid="npsc-q"]') as HTMLInputElement | null)?.focus()} className="absolute end-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"><ScanLine className="w-3 h-3" />{pick('nbill.scan')}</button>
            </div>
            <DateBar preset={preset} from={from} to={to} set={set} testid="npsc" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className={pillBox}>{cats.map(([k, l]) => { const I = kindIcon(k); return <button key={k} type="button" onClick={() => set({ cat: k || null })} aria-pressed={cat === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap flex items-center gap-1 ${cat === k ? pillOn : pillOff}`} data-testid={`npsc-cat-${k || 'all'}`}>{k ? <I className="w-3 h-3" /> : null}{pick(l)}</button> })}</div>
              <div className={pillBox}>{deals.map((k) => <button key={k} type="button" onClick={() => set({ deal: k || null })} aria-pressed={deal === k} className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap ${deal === k ? pillOn : pillOff}`} data-testid={`npsc-deal-${k || 'all'}`}>{pick(`npsc.deal.${k || 'all'}`)}</button>)}</div>
              <select value={brand} onChange={(e) => set({ brand: e.target.value || null })} className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="npsc-brand"><option value="">{t('nsales.brandAll', { n: data?.brand_options.length ?? 0 })}</option>{(data?.brand_options ?? []).map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select>
              <select value={mode} onChange={(e) => set({ mode: e.target.value || null })} className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="npsc-mode"><option value="">{pick('nsales.modeAll')}</option>{MODES.map((m) => <option key={m} value={m}>{pick(`nbill.mode.${m}`)}</option>)}</select>
            </div>
            <div className={`${pillBox} text-xs`}>
              {TABS.map((k) => { const I = TAB_ICON[k]; return <button key={k} type="button" onClick={() => set({ tab: k === 'overview' ? null : k })} aria-pressed={tab === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap flex items-center gap-1 ${tab === k ? 'bg-[#A3E635] text-obsidian-950' : pillOff}`} data-testid={`npsc-tab-${k}`}><I className="w-3 h-3" />{pick(`npsc.tab.${k}`)}</button> })}
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-5 flex-1 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="npsc-figures">
          <div className="p-4 rounded-2xl bg-obsidian-950 text-white border border-slate-800" data-testid="npsc-f-amount"><div className="text-[10px] font-extrabold uppercase text-slate-400">{pick('npsc.k.total')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-[#A3E635] mt-1" dir="ltr">{f ? hide(f.amount) : '…'}</div><div className="text-[11px] text-slate-300 mt-0.5">{t('nsales.k.salesSub', { u: f?.units ?? 0, b: f?.bills ?? 0 })}</div></div>
          <button type="button" onClick={() => set({ deal: 'paid' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-emerald-300/70 dark:border-emerald-800 cursor-pointer" data-testid="npsc-f-paid"><div className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-[#A3E635]">{pick('npsc.k.paid')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-[#A3E635] mt-1" dir="ltr">{f ? rs(f.paid) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('npsc.k.paidSub')}</div></button>
          <button type="button" onClick={() => set({ deal: 'udhaar' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-rose-300/80 dark:border-rose-800 cursor-pointer" data-testid="npsc-f-due"><div className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400">{pick('npsc.k.due')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-rose-600 dark:text-rose-400 mt-1" dir="ltr">{f ? rs(f.due) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('npsc.k.dueSub')}</div></button>
          <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="npsc-f-avg"><div className="text-[10px] font-bold uppercase text-slate-400">{pick('npsc.k.avg')}</div><div className="font-display font-extrabold text-xl sm:text-2xl mt-1" dir="ltr">{f ? hide(f.avg) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{t('npsc.k.avgSub', { n: f?.units ?? 0 })}</div></div>
          <div className="col-span-2 md:col-span-1 p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="npsc-f-stock"><div className="text-[10px] font-bold uppercase text-slate-400">{pick('npsc.k.stock')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-sky-600 dark:text-sky-400 mt-1">{t('npsc.k.inShop', { n: f?.in_shop ?? 0 })}</div><div className="text-[11px] text-slate-500 mt-0.5">{t('npsc.k.soldOut', { n: f?.sold ?? 0 })}</div></div>
        </div>

        {!data ? <div className="p-10 text-center text-slate-400">…</div>
          : tab === 'overview' ? <Overview d={data} cat={cat} hide={hide} setCat={(k) => set({ cat: k })} setBrand={(b) => set({ brand: b, tab: 'models' })} reset={() => set({ cat: null, brand: null, deal: null, mode: null })} onNew={() => nav('/new/purchase/new')} />
            : tab === 'models' ? <Models d={data} hide={hide} bills={billById} act={act} />
              : tab === 'parties' ? <Parties d={data} hide={hide} bills={billById} act={act} />
                : tab === 'invoices' ? <Bills bills={data.bills} act={act} onDone={setToast} />
                  : <Ledger lines={data.lines} hide={hide} bills={billById} act={act} onA4={() => setA4(true)} />}
      </main>

      {settle ? <SettleWindow bill={settle} onClose={() => setSettle(null)} onDone={(m) => { setSettle(null); setToast(m) }} /> : null}
      {fix ? <EditChooser bill={fix} onClose={() => setFix(null)} /> : null}
      {del ? <DeleteGo bill={del} onClose={() => setDel(null)} /> : null}
      {a4 ? <A4Window sheet={sheet} canCost={false} showCost onClose={() => setA4(false)} title="npsc.a4Title" sub="npsc.a4Sub" /> : null}
      <Toast msg={toast} />
    </div>
  )
}

type Act = { settle: (b: Bill) => void; fix: (b: Bill) => void; del: (b: Bill) => void; open: (id: string) => void; share: (b: Bill) => void }
type Fmt = (v: M | null | undefined) => string

function WherePill({ l }: { l: Line }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const label = l.state === 'part' ? t('npsc.where.partN', { h: l.in_shop, s: l.sold }) : pick(`npsc.where.${l.state}`)
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${WHERE_TONE[l.state]}`} data-testid="npsc-where">{label}</span>
      {l.sold_to || l.sold_no ? <span className="text-[10px] text-slate-500" dir="auto">{l.sold_to ?? pick('nbill.walkin')} {l.sold_no ? <span dir="ltr">({l.sold_no})</span> : null}</span> : null}
    </span>
  )
}

function Overview({ d, cat, hide, setCat, setBrand, reset, onNew }: { d: Data; cat: string; hide: Fmt; setCat: (k: string) => void; setBrand: (b: string) => void; reset: () => void; onNew: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const has = useModules()
  const kinds = d.kinds.filter((k) => k.key !== 'laptop' || has('laptops')).filter((k) => k.key !== 'items' || has('accessories'))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="npsc-kinds">
        {kinds.map((k) => { const I = kindIcon(k.key); return (
          <button key={k.key} type="button" onClick={() => setCat(k.key)} className={`p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border ${cat === k.key ? 'border-[#A3E635] ring-2 ring-[#A3E635]/40' : 'border-slate-200 dark:border-slate-800'} hover:border-obsidian-950 dark:hover:border-[#A3E635] cursor-pointer`} data-testid={`npsc-kind-${k.key}`}>
            <div className="flex items-center justify-between"><span className="font-display font-extrabold text-sm flex items-center gap-1.5"><I className="w-4 h-4" />{pick(kindKey(k.key))}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-obsidian-800">{t('nsales.units', { n: k.units })}</span></div>
            <div className="font-mono font-extrabold text-lg mt-2" dir="ltr">{hide(k.amount)}</div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px]"><span className="text-slate-400">{pick('npsc.toPay')}: <strong className="text-rose-600" dir="ltr">{rs(k.due)}</strong></span><span className="text-slate-400">{pick('npsc.col.paid')}: <strong className="text-slate-700 dark:text-slate-200" dir="ltr">{rs(k.paid)}</strong></span></div>
          </button>
        ) })}
      </div>
      <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="npsc-brands">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-display font-extrabold text-base">{pick('npsc.brandTitle')}</h2><p className="text-xs text-slate-500">{pick('nsales.brandSub')}</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onNew} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">+ {pick('npsc.addBill')}</button><button type="button" onClick={reset} className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3 h-3" />{pick('nsales.reset')}</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800"><tr>
              <th className="px-4 py-2.5 text-start">{pick('nsales.col.brand')}</th><th className="px-4 py-2.5 text-end">{pick('nsales.col.units')}</th><th className="px-4 py-2.5 text-end">{pick('npsc.col.avg')}</th><th className="px-4 py-2.5 text-end">{pick('npsc.col.amount')}</th><th className="px-4 py-2.5 text-end">{pick('npsc.col.paid')}</th><th className="px-4 py-2.5 text-end">{pick('npsc.col.due')}</th><th className="px-4 py-2.5 text-end">{pick('npsc.col.stock')}</th><th className="px-4 py-2.5 text-end">{pick('nsales.col.quick')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.brands.map((b) => (
                <tr key={b.key} onClick={() => setBrand(b.key)} className="hover:bg-slate-50 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="npsc-brand-row">
                  <td className="px-4 py-3 font-display font-extrabold text-sm">{b.brand ?? '—'} <span className="text-[11px] font-normal text-slate-400">({t('nsales.models', { n: b.models })})</span></td>
                  <td className="px-4 py-3 text-end font-mono font-bold">{b.units}</td>
                  <td className="px-4 py-3 text-end font-mono" dir="ltr">{hide(b.avg)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold" dir="ltr">{hide(b.amount)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(b.paid)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-rose-600" dir="ltr">{rs(b.due)}</td>
                  <td className="px-4 py-3 text-end text-[11px]"><span className="text-sky-600 dark:text-sky-400 font-bold">{t('npsc.k.inShop', { n: b.in_shop })}</span> · <span className="text-slate-500">{t('npsc.soldN', { n: b.sold })}</span></td>
                  <td className="px-4 py-3 text-end"><button type="button" onClick={(e) => { e.stopPropagation(); setBrand(b.key) }} className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">{pick('nsales.modelsBtn')} →</button></td>
                </tr>
              ))}
              {!d.brands.length ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">{pick('npsc.none')}</td></tr> : null}
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
      {num(b.due) > 0 && b.party_id ? <button type="button" onClick={(e) => { e.stopPropagation(); act.settle(b) }} title={pick('npsc.pay')} aria-label={pick('npsc.pay')} className="p-1 rounded bg-emerald-600 text-white cursor-pointer" data-testid="npsc-settle-btn"><Wallet className="w-3 h-3" /></button> : null}
      <button type="button" onClick={(e) => { e.stopPropagation(); act.fix(b) }} title={pick('nbill.edit')} aria-label={pick('nbill.edit')} className="p-1 rounded bg-slate-100 dark:bg-obsidian-800 text-amber-600 cursor-pointer"><Pencil className="w-3 h-3" /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); act.del(b) }} title={pick('nbill.delete')} aria-label={pick('nbill.delete')} className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
    </span>
  )
}

function Models({ d, hide, bills, act }: { d: Data; hide: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  if (!d.models.length) return <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800">{pick('nsales.noModels')}</div>
  return (
    <div className="space-y-3" data-testid="npsc-models">
      {d.models.map((m) => (
        <div key={m.key} className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="npsc-model">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950">{pick(kindKey(m.kind))}</span><span className="font-display font-extrabold text-base" dir="auto">{[m.brand, m.model].filter(Boolean).join(' ')}</span><span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-slate-200 dark:bg-obsidian-800">{t('nsales.units', { n: m.units })}</span></div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.avg')}</span><strong className="font-mono" dir="ltr">{hide(m.avg)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.amount')}</span><strong className="font-mono" dir="ltr">{hide(m.amount)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.due')}</span><strong className="font-mono text-rose-600" dir="ltr">{rs(m.due)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.stock')}</span><strong className="text-sky-600 dark:text-sky-400">{t('npsc.k.inShop', { n: m.in_shop })}</strong> <span className="text-slate-500">· {t('npsc.soldN', { n: m.sold })}</span></div>
            </div>
          </div>
          <LineTable lines={m.lines} hide={hide} bills={bills} act={act} />
        </div>
      ))}
    </div>
  )
}

function LineTable({ lines, hide, bills, act, full }: { lines: Line[]; hide: Fmt; bills: Map<string, Bill>; act: Act; full?: boolean }) {
  const { pick } = useLang()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800"><tr>
          <th className="px-4 py-2 text-start">{pick('nsales.col.bill')}</th>{full ? <th className="px-4 py-2 text-start">{pick('nsales.col.kindBrand')}</th> : null}<th className="px-4 py-2 text-start">{pick(full ? 'nsales.col.modelCode' : 'nsales.col.code')}</th><th className="px-4 py-2 text-start">{pick('npsc.col.seller')}</th>
          <th className="px-4 py-2 text-end">{pick('npsc.col.unit')}</th><th className="px-4 py-2 text-end">{pick('npsc.col.amount')}</th>{full ? <th className="px-4 py-2 text-end">{pick('npsc.col.paid')}</th> : null}<th className="px-4 py-2 text-end">{pick('npsc.col.due')}</th><th className="px-4 py-2 text-start">{pick('npsc.col.where')}</th><th className="px-4 py-2 text-end">{pick('nsales.col.actions')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((l, i) => (
            <tr key={`${l.purchase_id}-${i}`} onClick={() => act.open(l.purchase_id)} className="hover:bg-slate-50 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="npsc-line">
              <td className="px-4 py-2 font-mono font-bold whitespace-nowrap" dir="ltr">{l.no} <span className="text-slate-400 font-normal">({fmtDate(l.date)})</span></td>
              {full ? <td className="px-4 py-2"><strong>{pick(kindKey(l.kind))}</strong><br /><span className="text-[11px] text-slate-500">{l.brand ?? '—'}</span></td> : null}
              <td className="px-4 py-2">{full ? <><strong dir="auto">{l.model}</strong>{l.qty > 1 ? <span dir="ltr"> ({l.qty}×)</span> : null}<br /></> : null}<span className="font-mono text-[11px] text-slate-500" dir="ltr">{l.code ?? '—'}</span></td>
              <td className="px-4 py-2 font-bold" dir="auto">{l.party_name ?? '—'} <span className="text-[10px] text-slate-400">({pick(`nbill.role.${l.role}`)})</span></td>
              <td className="px-4 py-2 text-end font-mono" dir="ltr">{hide(l.unit_cost)}</td>
              <td className="px-4 py-2 text-end font-mono font-bold" dir="ltr">{hide(l.amount)}</td>
              {full ? <td className="px-4 py-2 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(l.paid)}</td> : null}
              <td className={`px-4 py-2 text-end font-mono ${num(l.due) > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}`} dir="ltr">{num(l.due) > 0 ? rs(l.due) : '0'}</td>
              <td className="px-4 py-2"><WherePill l={l} /></td>
              <td className="px-4 py-2 text-end whitespace-nowrap"><RowActs b={bills.get(l.purchase_id)} act={act} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Parties({ d, hide, bills, act }: { d: Data; hide: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  if (!d.parties.length) return <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800">{pick('npsc.none')}</div>
  return (
    <div className="space-y-4" data-testid="npsc-parties">
      {d.parties.map((p) => (
        <div key={p.party_id ?? 'none'} className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="npsc-party">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${p.role === 'dealer' ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>{pick(`nbill.role.${p.role}`)}</span>{p.party_id ? <button type="button" onClick={() => nav(`/new/parties/${p.party_id}`)} className="font-display font-extrabold text-base hover:underline cursor-pointer" dir="auto" data-testid="npsc-party-open">{p.name}</button> : <span className="font-display font-extrabold text-base">—</span>}{p.phone ? <span className="font-mono text-xs text-slate-400" dir="ltr">{p.phone}</span> : null}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t('nsales.p.bills', { b: p.bills, u: p.units })}</div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.p.total')}</span><strong className="font-mono" dir="ltr">{hide(p.amount)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.paid')}</span><strong className="font-mono text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(p.paid)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.due')}</span><strong className={`font-mono ${num(p.due) > 0 ? 'text-rose-600' : 'text-slate-400'}`} dir="ltr" data-testid="npsc-party-due">{rs(p.due)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('npsc.col.stock')}</span><strong className="text-sky-600 dark:text-sky-400">{t('npsc.k.inShop', { n: p.in_shop })}</strong></div>
            </div>
          </div>
          <div className="p-3.5 space-y-2">{p.ids.map((id) => bills.get(id)).filter((b): b is Bill => !!b).map((b) => <BillCard key={b.id} b={b} act={act} />)}</div>
        </div>
      ))}
    </div>
  )
}

function BillCard({ b, act, checked, onCheck }: { b: Bill; act: Act; checked?: boolean; onCheck?: (v: boolean) => void }) {
  const { pick } = useLang()
  return (
    <div className={`rounded-2xl border ${checked ? 'border-[#A3E635] ring-1 ring-[#A3E635]' : b.edited ? 'border-amber-400/80 dark:border-amber-700' : 'border-slate-200/90 dark:border-slate-800'} p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40 dark:bg-obsidian-850/60`} data-testid="npsc-bill" data-no={b.no}>
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        {onCheck ? <input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} aria-label={b.no} className="mt-1 sm:mt-0 rounded cursor-pointer" data-testid="npsc-check" /> : null}
        <button type="button" onClick={() => act.open(b.id)} className="w-10 h-10 rounded-xl bg-obsidian-950 text-[#A3E635] dark:bg-[#A3E635] dark:text-obsidian-950 flex items-center justify-center shrink-0 cursor-pointer"><Package className="w-4 h-4" /></button>
        <button type="button" onClick={() => act.open(b.id)} className="min-w-0 flex-1 text-start cursor-pointer">
          <span className="flex flex-wrap items-center gap-1.5"><span className="font-display font-extrabold text-sm" dir="auto">{b.party_name ?? '—'}</span><span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr">{b.no}</span>{b.supplier_no ? <span className="text-[10px] text-slate-400" dir="ltr">#{b.supplier_no}</span> : null}{b.edited ? <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300">{pick('nbill.edited')}</span> : null}<span className="text-[11px] text-slate-400"><span dir="ltr">{fmtDate(b.date)}</span>{b.mode ? <> · {pick(`nbill.mode.${b.mode}`)}</> : null}</span></span>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/70 dark:border-slate-800">
        <div className="text-start lg:text-end me-1"><div className="font-mono font-extrabold text-sm" dir="ltr">{rs(b.total)}</div><div className="flex items-center gap-1.5 text-[10px] font-bold mt-0.5"><span className="text-emerald-600 dark:text-[#A3E635]">{pick('npsc.col.paid')}: <span dir="ltr">{rs(b.paid)}</span></span>{num(b.due) > 0 ? <span className="text-rose-600">· {pick('npsc.toPay')}: <span dir="ltr">{rs(b.due)}</span></span> : null}</div></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => act.open(b.id)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 flex items-center gap-1 cursor-pointer"><Eye className="w-3 h-3" />{pick('nbill.viewBtn')}</button>
          {num(b.due) > 0 && b.party_id ? <button type="button" onClick={() => act.settle(b)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-emerald-600 text-white flex items-center gap-1 cursor-pointer" data-testid="npsc-pay"><Wallet className="w-3 h-3" />{pick('npsc.pay')}</button> : null}
          <button type="button" onClick={() => act.share(b)} title={pick('nbill.whatsapp')} aria-label={pick('nbill.whatsapp')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 cursor-pointer"><Share2 className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => act.fix(b)} title={pick('nbill.edit')} aria-label={pick('nbill.edit')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-amber-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => act.del(b)} title={pick('nbill.delete')} aria-label={pick('nbill.delete')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </div>
  )
}

/** the purchase bills; several can be picked and what is left on them paid, one payment per bill */
function Bills({ bills, act, onDone }: { bills: Bill[]; act: Act; onDone: (m: string) => void }) {
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
  async function payAll() {
    setBusy(true); setErr(null)
    let n = 0
    try {
      for (const b of picked) {
        await api('POST', '/api/v1/payments', { party_id: b.party_id, direction: 'out', amount: num(b.due), allocations: [{ document_type: 'purchase', document_id: b.id, amount: num(b.due) }] })
        n += 1
      }
      setSel(new Set()); setConfirm(false)
      onDone(t('npsc.paySelDone', { n }))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally {
      setBusy(false)
      if (n) await inv('bills-hub', 'invoices', 'purchases', 'party', 'parties', 'statement', 'payments', 'dashboard', 'day', 'balances')
    }
  }
  return (
    <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5" data-testid="npsc-bills">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-3"><label className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(bills.map((b) => b.id)) : new Set())} className="rounded" data-testid="npsc-check-all" />{pick('nsales.selectAll')}</label><h2 className="font-display font-extrabold text-base">{t('npsc.billsTitle', { n: bills.length })}</h2></div>
        <div className="flex flex-wrap items-center gap-1.5">
          {sel.size ? <>
            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-slate-100 dark:bg-obsidian-800">{t('nsales.selected', { n: sel.size })}</span>
            <button type="button" disabled={!picked.length} onClick={() => setConfirm(true)} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 text-white cursor-pointer disabled:opacity-50" data-testid="npsc-pay-sel">{pick('npsc.paySel')}</button>
            <span className="text-[11px] text-slate-500 max-w-[260px]">{pick('nsales.noBulkDelete')}</span>
          </> : <button type="button" onClick={() => nav('/new/purchase/new')} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 cursor-pointer">+ {pick('npsc.addBill')}</button>}
        </div>
      </div>
      {bills.map((b) => <BillCard key={b.id} b={b} act={act} checked={sel.has(b.id)} onCheck={(v) => { const n = new Set(sel); if (v) n.add(b.id); else n.delete(b.id); setSel(n) }} />)}
      {!bills.length ? <div className="p-8 text-center text-xs text-slate-400">{pick('npsc.none')}</div> : null}
      {confirm ? (
        <Modal title={t('npsc.paySelTitle', { n: picked.length })} sub={pick('npsc.paySelSub')} onClose={() => setConfirm(false)} testid="npsc-pay-window">
          <div className="p-5 space-y-2 text-xs">
            {picked.map((b) => <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850"><span><span className="font-mono font-bold" dir="ltr">{b.no}</span> · <span dir="auto">{b.party_name}</span></span><span className="font-mono font-extrabold text-rose-600" dir="ltr">{rs(b.due)}</span></div>)}
            {err ? <p className="text-rose-600 font-bold" role="alert">{err}</p> : null}
            <button type="button" disabled={busy} onClick={() => void payAll()} className="w-full py-2.5 rounded-xl font-extrabold bg-emerald-600 text-white cursor-pointer disabled:opacity-50" data-testid="npsc-pay-sel-go">{pick('nbill.apply')}</button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

function Ledger({ lines, hide, bills, act, onA4 }: { lines: Line[]; hide: Fmt; bills: Map<string, Bill>; act: Act; onA4: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  return (
    <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="npsc-ledger">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display font-extrabold text-base">{t('npsc.ledTitle', { n: lines.length })}</h2><p className="text-xs text-slate-500">{pick('npsc.ledSub')}</p></div>
        <button type="button" onClick={onA4} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-obsidian-950 text-white dark:bg-obsidian-800 flex items-center gap-1.5 cursor-pointer"><Printer className="w-3.5 h-3.5" />{pick('nsales.ledPrint')}</button>
      </div>
      <LineTable lines={lines} hide={hide} bills={bills} act={act} full />
    </section>
  )
}
