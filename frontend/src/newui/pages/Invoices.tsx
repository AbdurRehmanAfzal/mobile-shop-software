/** Every bill in one screen in the new product (ADR-134), drawn from
 *  `24-invoices-bills-command-center.html` (F10): the file's top bar (create a bill, the bills ledger
 *  report A4, profit eye, Excel / CSV, language, dark), search with Scan, the period presets and
 *  from–to, filters by kind of stock, type, state and payment mode, five views (all bills, dealer-wise,
 *  customer-wise, edited bills, full ledger) and the five figure cards; a bill opens its window with
 *  the receipt (80 mm / A4, English / Urdu — the server's printed page), WhatsApp, settle, correct,
 *  return and delete.
 *
 *  Every figure is the server's: `/bills-hub/bills` (read-only, `billshub/service.py`, built on the
 *  live every-bill list) gives the rows, the five figures and the bills per person for the filters
 *  chosen; the sheet and the A4 report are `/bills-hub/bills/sheet`. Settle is a payment against the
 *  bill (`POST /payments`, as the khata records one); "Correct" opens the live corrections and
 *  "Delete" the bill's own page, which checks what must be undone first (ADR-090 / ADR-099) — a bill is
 *  never rewritten and nothing is deleted in bulk. "Edited bills" are the bills with a correction the
 *  shop keeps (customer / dealer changed, paid or price corrected, replaced by its edit).
 *
 *  Differences from the drawing: the receipt is not drawn on this screen, the print buttons open the
 *  server's page (a purchase or a return has no slip, so it opens the bill's page); "Create new bill"
 *  offers the live forms instead of a free-typed bill; the repair stage is changed on the job's page. */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Building2, Eye, FileText, Pencil, Plus, Printer, RotateCcw, ScanLine, Search, Share2, Trash2, Undo2, User, Wallet, Wrench } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { activeShop, useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { useGet } from '@/lib/queries'
import { waNumber } from '@/lib/phone'
import { useModules } from '@/lib/modules'
import { DateBar, DeleteGo, EditChooser, Modal, SettleWindow, Toast, TopTools, kindIcon, kindKey, num, pillBox, pillOff, pillOn, rs, signed, usePeriod, type FixBill, type M, type SettleBill } from '@/newui/billsKit'

type Kind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'repair'
interface Line { kind: string; label: string | null; code: string | null; qty: number; device_id?: string; accessory_id?: string }
interface Change { type: string; memo: string | null; by: string | null; at: string | null; from_no?: string; from_total?: M }
export interface BillRow {
  kind: Kind; type: string; id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_name_ur: string | null; party_phone: string | null
  role: 'customer' | 'dealer'; lines: Line[]; kinds: string[]; total: M; paid: M; due: M; state: 'due' | 'paid' | 'in_repair' | 'returned' | 'void'
  ref_id: string | null; ref_no: string | null; created_by_name: string | null; mode: string | null; changes: Change[]; edited: boolean; replaced_by_no: string | null
  profit: M | null; stage: string | null; money_in: M; money_out: M
}
interface Group { party_id: string | null; name: string | null; name_ur: string | null; phone: string | null; role: 'customer' | 'dealer'; bills: number; kinds: string[]; billed: M; paid: M; to_get: M; to_pay: M; ids: string[] }
interface Data { rows: BillRow[]; total_rows: number; figures: { sales: M; sales_count: number; purchases: M | null; purchases_count: number | null; to_get: M; to_pay: M | null; profit: M | null; count: number; edited: number }; parties: Group[] }
type View = 'bills' | 'dealers' | 'customers' | 'edited' | 'ledger'
const VIEWS: View[] = ['bills', 'dealers', 'customers', 'edited', 'ledger']
const TYPES = ['sale', 'purchase', 'return', 'repair'] as const
const STATES = ['due', 'paid', 'in_repair', 'returned', 'void'] as const
const MODES = ['cash', 'bank', 'online', 'cheque', 'remittance', 'udhaar'] as const

export default function NewInvoices() {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const has = useModules()
  const { sp, set, preset, from, to } = usePeriod()
  const view = (VIEWS.includes(sp.get('view') as View) ? sp.get('view') : 'bills') as View
  const cat = sp.get('cat') ?? ''
  const type = sp.get('type') ?? ''
  const state = sp.get('state') ?? ''
  const mode = sp.get('mode') ?? ''
  const q = sp.get('q') ?? ''
  const [showCost, setShowCost] = useState(true)
  const [open, setOpen] = useState<BillRow | null>(null)
  const [settle, setSettle] = useState<SettleBill | null>(null)
  const [fix, setFix] = useState<FixBill | null>(null)
  const [del, setDel] = useState<FixBill | null>(null)
  const [create, setCreate] = useState(false)
  const [a4, setA4] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 2800); return () => clearTimeout(h) }, [toast])
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F7: '/new/repairs', F8: '/new/expenses' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const qs = new URLSearchParams()
  if (q.trim()) qs.set('q', q.trim())
  if (from) qs.set('date_from', from)
  if (to) qs.set('date_to', to)
  if (cat) qs.set('kind', cat)
  if (type) qs.set('type', type)
  if (state) qs.set('state', state)
  if (mode) qs.set('mode', mode)
  const path = `/api/v1/bills-hub/bills?${qs}&limit=1000`
  const { data } = useGet<Data>(['bills-hub', 'bills', qs.toString()], path)
  const sheet = `/api/v1/bills-hub/bills/sheet?${qs}${view === 'edited' ? '&edited=true' : ''}`
  const costOk = canCost && showCost
  const f = data?.figures
  const hide = (v: M | null | undefined) => (costOk ? rs(v) : '••••••')
  const cats: [string, string][] = [['', 'nbill.cat.all'], ['phone', 'devcat.phone'], ['laptop', 'devcat.laptop'], ['watch', 'devcat.watch'], ['tablet', 'devcat.tablet'], ...(has('accessories') ? [['items', 'nitem.items']] as [string, string][] : [])]
  const rows = (data?.rows ?? []).filter((r) => view !== 'edited' || r.edited)
  const act = { open: setOpen, settle: (r: BillRow) => setSettle({ id: r.id, no: r.no, kind: r.kind === 'purchase' ? 'purchase' : 'sale', party_id: r.party_id, party_name: r.party_name, due: r.due }), fix: (r: BillRow) => setFix(r), del: (r: BillRow) => setDel(r), share: (r: BillRow) => share(r) }
  function share(r: BillRow) {
    const msg = [`*${shop?.name ?? ''}*`, `${pick(`nbill.kindBill.${r.kind}`)}: ${r.no}`, `${pick('nbill.dateL')}: ${fmtDate(r.date)}`, r.party_name ? `${pick('nbill.partyL')}: ${r.party_name}` : '', ...r.lines.map((l) => `${l.label ?? ''}${l.code ? ` (${l.code})` : ''}`), `${pick('nbill.total')}: ${rs(r.total)}`, `${pick('nbill.paid')}: ${rs(r.paid)}`, `${pick('nbill.remaining')}: ${rs(r.due)}`].filter(Boolean).join('\n')
    window.open(`https://wa.me/${waNumber(r.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  return (
    <div className="font-sans bg-[#F2F4F7] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid="nbill" data-newui="1" data-file="24">
      <header className="bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 min-h-14 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <Link to="/new" className="flex items-center gap-2 pe-2.5 border-e border-slate-200 dark:border-slate-800 shrink-0">
              <span className="w-8 h-8 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span>
              <span className="hidden sm:block"><span className="block font-display font-extrabold text-sm tracking-tight leading-none">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-400 font-medium mt-0.5">{pick('nbill.sub')} <span dir="ltr">(F10)</span></span></span>
            </Link>
            <button type="button" onClick={() => setCreate(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 cursor-pointer shrink-0" data-testid="nbill-create"><Plus className="w-3.5 h-3.5" />{pick('nbill.newBill')}</button>
            <button type="button" onClick={() => setA4(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-extrabold bg-obsidian-950 dark:bg-obsidian-800 text-white border border-slate-700 hover:border-[#A3E635] cursor-pointer shrink-0" data-testid="nbill-a4"><BookOpen className="w-3.5 h-3.5 text-amber-400" />{pick('nbill.ledgerBtn')}</button>
          </div>
          <TopTools canCost={canCost} showCost={showCost} setShowCost={setShowCost} sheet={sheet} eyeOn="nbill.profitVisible" eyeOff="nbill.profitHidden" testid="nbill" />
        </div>
      </header>

      <section className="bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sm:sticky top-14 z-30">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => set({ q: e.target.value || null })} placeholder={pick('nbill.search')} className="w-full ps-8 pe-16 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#A3E635]" data-testid="nbill-q" />
              <button type="button" onClick={() => (document.querySelector('[data-testid="nbill-q"]') as HTMLInputElement | null)?.focus()} className="absolute end-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"><ScanLine className="w-3 h-3" />{pick('nbill.scan')}</button>
            </div>
            <DateBar preset={preset} from={from} to={to} set={set} testid="nbill" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className={pillBox} data-testid="nbill-cats">{cats.map(([k, l]) => { const I = kindIcon(k); return <button key={k} type="button" onClick={() => set({ cat: k || null })} aria-pressed={cat === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap flex items-center gap-1 ${cat === k ? pillOn : pillOff}`} data-testid={`nbill-cat-${k || 'all'}`}>{k ? <I className="w-3 h-3" /> : null}{pick(l)}</button> })}</div>
              <div className={pillBox}>{['', ...TYPES].filter((k) => k !== 'purchase' || canCost).map((k) => <button key={k} type="button" onClick={() => set({ type: k || null })} aria-pressed={type === k} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap ${type === k ? pillOn : pillOff}`} data-testid={`nbill-type-${k || 'all'}`}>{pick(`nbill.type.${k || 'all'}`)}</button>)}</div>
              <div className={pillBox}>{['', ...STATES].map((k) => <button key={k} type="button" onClick={() => set({ state: k || null })} aria-pressed={state === k} className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap ${state === k ? pillOn : pillOff}`} data-testid={`nbill-state-${k || 'all'}`}>{pick(`nbill.state.${k || 'all'}`)}</button>)}</div>
              <select value={mode} onChange={(e) => set({ mode: e.target.value || null })} className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700" data-testid="nbill-mode"><option value="">{pick('nbill.mode.all')}</option>{MODES.map((m) => <option key={m} value={m}>{pick(`nbill.mode.${m}`)}</option>)}</select>
            </div>
            <div className={`${pillBox} text-xs`}>
              {VIEWS.map((v) => <button key={v} type="button" onClick={() => set({ view: v === 'bills' ? null : v })} aria-pressed={view === v} className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer whitespace-nowrap ${view === v ? 'bg-[#A3E635] text-obsidian-950' : pillOff}`} data-testid={`nbill-view-${v}`}>{pick(`nbill.view.${v}`)}{v === 'edited' && f ? <span dir="ltr"> ({f.edited})</span> : null}</button>)}
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-5 flex-1 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="nbill-figures">
          <div className="p-4 rounded-2xl bg-[#A3E635] text-obsidian-950" data-testid="nbill-f-sales"><div className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">{pick('nbill.k.sales')}</div><div className="font-display font-extrabold text-xl sm:text-2xl mt-1" dir="ltr">{f ? rs(f.sales) : '…'}</div><div className="text-[11px] font-bold opacity-80 mt-0.5">{t('nbill.k.salesSub', { n: f?.sales_count ?? 0 })}</div></div>
          {canCost ? <div className="p-4 rounded-2xl bg-obsidian-950 text-white border border-slate-800" data-testid="nbill-f-purchases"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nbill.k.purchases')}</div><div className="font-display font-extrabold text-xl sm:text-2xl mt-1" dir="ltr">{f ? rs(f.purchases) : '…'}</div><div className="text-[11px] text-slate-400 mt-0.5">{t('nbill.k.purchasesSub', { n: f?.purchases_count ?? 0 })}</div></div> : null}
          <button type="button" onClick={() => set({ state: 'due', type: 'sale' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-amber-300/80 dark:border-amber-800 hover:border-amber-500 cursor-pointer" data-testid="nbill-f-toget"><div className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400">{pick('nbill.k.toGet')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-amber-700 dark:text-amber-300 mt-1" dir="ltr">{f ? rs(f.to_get) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('nbill.k.toGetSub')}</div></button>
          {canCost ? <button type="button" onClick={() => set({ state: 'due', type: 'purchase' })} className="p-4 rounded-2xl text-start bg-white dark:bg-obsidian-900 border border-rose-300/80 dark:border-rose-800 hover:border-rose-500 cursor-pointer" data-testid="nbill-f-topay"><div className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-400">{pick('nbill.k.toPay')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-rose-600 dark:text-rose-400 mt-1" dir="ltr">{f ? rs(f.to_pay) : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{pick('nbill.k.toPaySub')}</div></button> : null}
          <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nbill-f-profit"><div className="text-[10px] font-bold uppercase text-slate-400">{pick('nbill.k.profit')}</div><div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-[#A3E635] mt-1" dir="ltr">{f ? (canCost ? hide(f.profit) : '—') : '…'}</div><div className="text-[11px] text-slate-500 mt-0.5">{t('nbill.k.profitSub', { n: f?.count ?? 0, e: f?.edited ?? 0 })}</div></div>
        </div>
        {data && data.total_rows > data.rows.length ? <p className="text-[11px] text-amber-700 font-bold">{t('nbill.partial', { n: data.rows.length, t: data.total_rows })}</p> : null}

        {!data ? <div className="p-10 text-center text-slate-400">…</div>
          : view === 'ledger' ? <LedgerTable rows={rows} costOk={costOk} canCost={canCost} onOpen={setOpen} onA4={() => setA4(true)} />
            : view === 'dealers' || view === 'customers' ? <Groups rows={rows} groups={data.parties.filter((g) => g.role === (view === 'dealers' ? 'dealer' : 'customer'))} role={view === 'dealers' ? 'dealer' : 'customer'} act={act} costOk={costOk} />
              : (
                <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3" data-testid="nbill-list">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="font-display font-extrabold text-base">{t(view === 'edited' ? 'nbill.editedTitle' : 'nbill.listTitle', { n: rows.length })}</h2><p className="text-xs text-slate-500">{pick(view === 'edited' ? 'nbill.editedSub' : 'nbill.listSub')}</p></div>
                    <button type="button" onClick={() => set({ cat: null, type: null, state: null, mode: null, q: null })} className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" data-testid="nbill-reset"><RotateCcw className="w-3 h-3" />{pick('nbill.reset')}</button>
                  </div>
                  <div className="space-y-2.5">
                    {rows.length ? rows.map((r) => <BillCard key={`${r.kind}-${r.id}`} r={r} act={act} costOk={costOk} />) : <div className="p-8 text-center text-xs text-slate-400" data-testid="nbill-none">{pick('nbill.none')}</div>}
                  </div>
                </section>
              )}
      </main>

      {open ? <BillWindow r={open} costOk={costOk} canCost={canCost} onClose={() => setOpen(null)} act={act} /> : null}
      {settle ? <SettleWindow bill={settle} onClose={() => setSettle(null)} onDone={(m) => { setSettle(null); setOpen(null); setToast(m) }} /> : null}
      {fix ? <EditChooser bill={fix} onClose={() => setFix(null)} /> : null}
      {del ? <DeleteGo bill={del} onClose={() => setDel(null)} /> : null}
      {create ? <CreateWindow onClose={() => setCreate(false)} canCost={canCost} /> : null}
      {a4 ? <A4Window sheet={sheet} canCost={canCost} showCost={showCost} onClose={() => setA4(false)} /> : null}
      <Toast msg={toast} />
    </div>
  )
}

type Act = { open: (r: BillRow) => void; settle: (r: BillRow) => void; fix: (r: BillRow) => void; del: (r: BillRow) => void; share: (r: BillRow) => void }
const ICON_BOX: Record<Kind, string> = { sale: 'bg-[#A3E635] text-obsidian-950', purchase: 'bg-obsidian-950 text-white dark:bg-obsidian-800', sale_return: 'bg-amber-500/20 text-amber-800 dark:text-amber-300', purchase_return: 'bg-amber-500/20 text-amber-800 dark:text-amber-300', repair: 'bg-sky-500/20 text-sky-800 dark:text-sky-300' }
const STATE_PILL: Record<BillRow['state'], string> = { paid: 'bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635]', void: 'bg-slate-200 dark:bg-slate-800 text-slate-500 line-through', returned: 'bg-purple-500/15 text-purple-700 dark:text-purple-300', due: 'bg-amber-500/20 text-amber-800 dark:text-amber-300', in_repair: 'bg-amber-500/20 text-amber-800 dark:text-amber-300' }
const stateKey = (r: BillRow) => (r.state === 'due' && r.kind === 'purchase' ? 'nbill.st.toPay' : `nbill.st.${r.state}`)
const canSettle = (r: BillRow) => num(r.due) > 0 && r.state !== 'void' && (r.kind === 'sale' || r.kind === 'purchase') && !!r.party_id

function ChangeLine({ c }: { c: Change }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  return <span>{pick(`nbill.ch.${c.type}`)}{c.from_no ? <> · {t('nbill.replaces', { no: c.from_no, total: rs(c.from_total) })}</> : null}{c.memo ? <> · <span dir="auto">{c.memo}</span></> : null}</span>
}

function BillCard({ r, act, costOk }: { r: BillRow; act: Act; costOk: boolean }) {
  const { pick } = useLang()
  const I = r.kind === 'repair' ? Wrench : r.kind.endsWith('return') ? Undo2 : kindIcon(r.kinds[0] ?? 'phone')
  const first = r.lines[0]
  const last = r.changes[r.changes.length - 1]
  return (
    <div className={`rounded-2xl border ${r.edited ? 'border-amber-400/80 dark:border-amber-700' : 'border-slate-200/90 dark:border-slate-800'} hover:border-obsidian-950 dark:hover:border-[#A3E635] p-3.5 sm:px-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40 dark:bg-obsidian-850/60`} data-testid="nbill-row" data-no={r.no}>
      <button type="button" onClick={() => act.open(r)} className="flex items-start sm:items-center gap-3.5 cursor-pointer flex-1 min-w-0 text-start">
        <span className={`w-10 h-10 rounded-xl ${ICON_BOX[r.kind]} flex items-center justify-center shrink-0`}><I className="w-4 h-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-display font-extrabold text-sm sm:text-base truncate" dir="auto">{r.party_name ?? pick(r.kind === 'repair' ? 'inv.noName' : 'nbill.walkin')}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.role === 'dealer' ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{pick(`nbill.role.${r.role}`)}</span>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr">{r.no}</span>
            {r.kinds.map((k) => <span key={k} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick(kindKey(k))}</span>)}
            {r.edited ? <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />{pick('nbill.edited')}</span> : null}
            <span className="text-[11px] text-slate-400"><span dir="ltr">{fmtDate(r.date)}</span>{r.mode ? <> · {pick(`nbill.mode.${r.mode}`)}</> : null}</span>
          </span>
          <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
            <strong dir="auto">{first?.label ?? '—'}</strong>{r.lines.length > 1 ? <span dir="ltr"> +{r.lines.length - 1}</span> : null}{r.ref_no ? <span> ({pick('inv.ofBill')} <span dir="ltr">{r.ref_no}</span>)</span> : null}
            {first?.code ? <> · <span className="font-mono text-[11px] text-slate-400" dir="ltr">IMEI/SN: {first.code}</span></> : null}
          </span>
          {last ? <span className="block text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 truncate">↳ <ChangeLine c={last} /></span> : null}
        </span>
      </button>
      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200/70 dark:border-slate-800">
        <button type="button" onClick={() => act.open(r)} className="text-start lg:text-end cursor-pointer me-1">
          <span className="block font-mono font-extrabold text-sm sm:text-base" dir="ltr">{rs(r.total)}</span>
          <span className="flex items-center gap-1.5 mt-0.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${STATE_PILL[r.state]}`}>{pick(stateKey(r))}</span>{num(r.due) > 0 ? <span className="font-mono text-[11px] font-extrabold text-amber-700 dark:text-amber-300" dir="ltr">{rs(r.due)}</span> : null}{r.profit != null && r.kind === 'sale' && r.state !== 'void' ? <span className={`font-mono text-[10px] font-bold ${num(r.profit) < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-[#A3E635]'}`} dir="ltr">{costOk ? signed(r.profit) : '••••'}</span> : null}</span>
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => act.open(r)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 flex items-center gap-1 cursor-pointer" data-testid="nbill-view"><Eye className="w-3 h-3" />{pick('nbill.viewBtn')}</button>
          {canSettle(r) ? <button type="button" onClick={() => act.settle(r)} className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer" data-testid="nbill-settle-btn"><Wallet className="w-3 h-3" />{pick('nbill.settle')}</button> : null}
          <button type="button" onClick={() => act.share(r)} title={pick('nbill.whatsapp')} aria-label={pick('nbill.whatsapp')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 cursor-pointer"><Share2 className="w-3.5 h-3.5" /></button>
          {r.state !== 'void' ? <button type="button" onClick={() => act.fix(r)} title={pick('nbill.edit')} aria-label={pick('nbill.edit')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-amber-600 cursor-pointer" data-testid="nbill-edit-btn"><Pencil className="w-3.5 h-3.5" /></button> : null}
          {r.state !== 'void' ? <button type="button" onClick={() => act.del(r)} title={pick('nbill.delete')} aria-label={pick('nbill.delete')} className="p-1.5 rounded-xl bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-rose-600 cursor-pointer" data-testid="nbill-del-btn"><Trash2 className="w-3.5 h-3.5" /></button> : null}
        </div>
      </div>
    </div>
  )
}

function Groups({ rows, groups, role, act, costOk }: { rows: BillRow[]; groups: Group[]; role: 'dealer' | 'customer'; act: Act; costOk: boolean }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const n = groups.reduce((s, g) => s + g.bills, 0)
  const Icon = role === 'dealer' ? Building2 : User
  return (
    <div className="space-y-4" data-testid={`nbill-groups-${role}`}>
      <div className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5"><h2 className="font-display font-extrabold text-base flex items-center gap-2"><Icon className="w-4 h-4" />{t(role === 'dealer' ? 'nbill.dealersTitle' : 'nbill.customersTitle', { p: groups.length, n })}</h2><p className="text-xs text-slate-500 mt-0.5">{pick('nbill.groupSub')}</p></div>
      {!groups.length ? <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800">{pick('nbill.none')}</div> : groups.map((g) => (
        <div key={g.party_id ?? 'walkin'} className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nbill-group">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="font-display font-extrabold text-base flex items-center gap-1.5" dir="auto"><Icon className="w-4 h-4" />{(ur ? g.name_ur || g.name : g.name) ?? pick('nbill.walkin')}</span>{g.phone ? <span className="font-mono text-xs text-slate-400" dir="ltr">{g.phone}</span> : null}<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 dark:bg-obsidian-800">{t('nbill.bills', { n: g.bills })}</span>{g.party_id ? <button type="button" onClick={() => nav(`/new/parties/${g.party_id}`)} className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#A3E635]/30 cursor-pointer">{pick('nbill.openKhata')}</button> : null}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{pick('nbill.kindsOn')}: <strong>{g.kinds.map((k) => pick(kindKey(k))).join(', ')}</strong></div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div><span className="text-slate-400 block text-[10px]">{pick('nbill.billed')}</span><strong className="font-mono" dir="ltr">{rs(g.billed)}</strong></div>
              <div><span className="text-slate-400 block text-[10px]">{pick('nbill.paidSettled')}</span><strong className="font-mono text-emerald-600 dark:text-[#A3E635]" dir="ltr">{rs(g.paid)}</strong></div>
              <div data-testid="nbill-group-due"><span className="text-slate-400 block text-[10px]">{pick(role === 'dealer' ? 'nbill.deneBaqi' : 'nbill.leneBaqi')}</span><strong className={`font-mono ${num(role === 'dealer' ? g.to_pay : g.to_get) > 0 ? 'text-rose-600' : 'text-slate-400'}`} dir="ltr">{rs(role === 'dealer' ? g.to_pay : g.to_get)}</strong></div>
            </div>
          </div>
          <div className="p-3.5 space-y-2">{g.ids.map((id) => byId.get(id)).filter((r): r is BillRow => !!r).map((r) => <BillCard key={`${r.kind}-${r.id}`} r={r} act={act} costOk={costOk} />)}</div>
        </div>
      ))}
    </div>
  )
}

function LedgerTable({ rows, costOk, canCost, onOpen, onA4 }: { rows: BillRow[]; costOk: boolean; canCost: boolean; onOpen: (r: BillRow) => void; onA4: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  return (
    <section className="bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" data-testid="nbill-ledger">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-display font-extrabold text-base">{t('nbill.ledgerTitle', { n: rows.length })}</h2><p className="text-xs text-slate-500">{pick('nbill.ledgerSub')}</p></div>
        <button type="button" onClick={onA4} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#A3E635] text-obsidian-950 flex items-center gap-1.5 cursor-pointer"><Printer className="w-3.5 h-3.5" />{pick('nbill.printA4')}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs">
          <thead className="bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800"><tr>
            <th className="px-3 py-2.5 text-start">{pick('nbill.col.voucher')}</th><th className="px-3 py-2.5 text-start">{pick('nbill.col.type')}</th><th className="px-3 py-2.5 text-start">{pick('nbill.col.party')}</th><th className="px-3 py-2.5 text-start">{pick('nbill.col.mode')}</th>
            <th className="px-3 py-2.5 text-end">{pick('nbill.col.in')}</th><th className="px-3 py-2.5 text-end">{pick('nbill.col.out')}</th><th className="px-3 py-2.5 text-end">{pick('nbill.col.balance')}</th>{canCost ? <th className="px-3 py-2.5 text-end">{pick('nbill.col.profit')}</th> : null}
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} onClick={() => onOpen(r)} className="hover:bg-slate-50 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="nbill-ledger-row">
                <td className="px-3 py-2.5"><div className="font-mono font-bold text-xs" dir="ltr">{r.no}</div><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(r.date)}</div></td>
                <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${r.kind === 'sale' ? 'bg-[#A3E635]/30 dark:text-[#A3E635]' : r.kind === 'purchase' ? 'bg-slate-200 dark:bg-obsidian-800' : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'}`}>{pick(`nbill.kindBill.${r.kind}`)}</span> <span className="text-[10px] font-semibold text-slate-400">{r.kinds.map((k) => pick(kindKey(k))).join(', ')}</span></td>
                <td className="px-3 py-2.5"><div className="font-bold text-xs" dir="auto">{r.party_name ?? pick('nbill.walkin')} <span className="text-[10px] text-slate-400">({pick(`nbill.role.${r.role}`)})</span></div><div className="text-[11px] text-slate-500 truncate max-w-[230px]">{r.lines[0]?.label ?? '—'}{r.lines[0]?.code ? <> · <span className="font-mono" dir="ltr">{r.lines[0].code}</span></> : null}</div></td>
                <td className="px-3 py-2.5 text-xs font-semibold">{r.mode ? pick(`nbill.mode.${r.mode}`) : '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{num(r.money_in) > 0 ? `+${rs(r.money_in)}` : '—'}</td>
                <td className="px-3 py-2.5 text-end font-mono font-bold text-rose-600 dark:text-rose-400" dir="ltr">{num(r.money_out) > 0 ? `−${rs(r.money_out)}` : '—'}</td>
                <td className={`px-3 py-2.5 text-end font-mono font-bold ${num(r.due) > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-400'}`} dir="ltr">{num(r.due) > 0 ? rs(r.due) : pick('nbill.settled')}</td>
                {canCost ? <td className={`px-3 py-2.5 text-end font-mono font-extrabold ${num(r.profit) < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-[#A3E635]'}`} dir="ltr">{r.profit != null && r.state !== 'void' && num(r.profit) !== 0 ? (costOk ? signed(r.profit) : '••••') : '—'}</td> : null}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">{pick('nbill.none')}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BillWindow({ r, costOk, canCost, onClose, act }: { r: BillRow; costOk: boolean; canCost: boolean; onClose: () => void; act: Act }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [lang, setLang] = useState<'en' | 'ur'>('en')
  const [fmt, setFmt] = useState<'a4' | 'thermal'>('a4')
  const page = r.kind === 'sale' ? `/api/v1/sales/${r.id}/receipt?format=${fmt}&lang=${lang}` : r.kind === 'repair' ? `/api/v1/repairs/${r.id}/job-sheet?lang=${lang}` : null
  const own = r.kind === 'sale' ? `/new/item/${r.lines.find((l) => l.device_id)?.device_id ?? ''}` : null
  const billPage = r.kind === 'sale' ? `/sales/${r.id}` : r.kind === 'purchase' ? `/purchases/${r.id}` : r.kind === 'repair' ? `/new/repairs/${r.id}` : r.ref_id ? (r.kind === 'sale_return' ? `/sales/${r.ref_id}` : `/purchases/${r.ref_id}`) : '/returns'
  const seg = (on: boolean) => `px-2.5 py-1 rounded-md cursor-pointer ${on ? pillOn : ''}`
  const box = (label: string, children: ReactNode) => <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 space-y-2.5"><div className="font-display font-extrabold text-sm">{pick(label)}</div>{children}</div>
  return (
    <Modal wide onClose={onClose} testid="nbill-window" title={<span className="flex flex-wrap items-center gap-2.5"><span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase ${r.kind === 'sale' ? 'bg-[#A3E635] text-obsidian-950' : 'bg-obsidian-950 text-white'}`}>{pick(`nbill.kindBill.${r.kind}`)}</span><span dir="ltr">{r.no}</span><span dir="auto">— {r.party_name ?? pick('nbill.walkin')}</span></span>} sub={<><span dir="ltr">{fmtDate(r.date)}</span>{r.created_by_name ? <> · {t('nbill.by', { who: r.created_by_name })}</> : null} · {pick(stateKey(r))}</>}>
      <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {page ? <>
            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-obsidian-800 text-[11px] font-bold"><button type="button" onClick={() => setLang('en')} className={seg(lang === 'en')}>English</button><button type="button" onClick={() => setLang('ur')} className={seg(lang === 'ur')} data-testid="nbill-doc-ur">اردو</button></div>
            {r.kind === 'sale' ? <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-obsidian-800 text-[11px] font-bold"><button type="button" onClick={() => setFmt('a4')} className={seg(fmt === 'a4')}>{pick('nbill.fmtA4')}</button><button type="button" onClick={() => setFmt('thermal')} className={seg(fmt === 'thermal')} data-testid="nbill-fmt-80">{pick('nbill.fmt80')}</button></div> : null}
            <button type="button" onClick={() => void openPrintable(page)} className="px-3 py-1.5 rounded-xl font-extrabold bg-[#A3E635] text-obsidian-950 flex items-center gap-1.5 cursor-pointer" data-testid="nbill-print"><Printer className="w-3.5 h-3.5" />{pick('nbill.print')}</button>
          </> : <span className="text-[11px] text-slate-500">{pick('nbill.printNone')}</span>}
          <button type="button" onClick={() => act.share(r)} className="px-3 py-1.5 rounded-xl font-bold bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635] border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"><Share2 className="w-3.5 h-3.5" />{pick('nbill.whatsapp')}</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => nav(billPage)} className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer" data-testid="nbill-open-page"><FileText className="w-3.5 h-3.5" />{pick('nbill.openBill')}</button>
          {r.state !== 'void' ? <button type="button" onClick={() => act.fix(r)} className="px-3 py-1.5 rounded-xl font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer"><Pencil className="w-3.5 h-3.5" />{pick('nbill.edit')}</button> : null}
          {r.kind === 'sale' && (r.state === 'paid' || r.state === 'due') ? <button type="button" onClick={() => nav(`/return/new?invoice=${r.id}`)} className="px-3 py-1.5 rounded-xl font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center gap-1.5 cursor-pointer"><Undo2 className="w-3.5 h-3.5" />{pick('nbill.returnItems')}</button> : null}
          {r.state !== 'void' ? <button type="button" onClick={() => act.del(r)} className="px-3 py-1.5 rounded-xl font-bold bg-rose-500/15 text-rose-600 flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />{pick('nbill.delete')}</button> : null}
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
        <div className="lg:col-span-7 bg-slate-100 dark:bg-obsidian-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="bg-white text-slate-900 p-5 sm:p-6 rounded-xl shadow-md border border-slate-200 space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-3 rounded-lg">
              <div><span className="text-slate-400 block">{pick('nbill.partyL')}</span><strong dir="auto">{r.party_name ?? pick('nbill.walkin')}</strong>{r.party_phone ? <><br /><span className="font-mono text-slate-500" dir="ltr">{r.party_phone}</span></> : null}</div>
              <div className="text-end"><span className="text-slate-400 block">{pick('nbill.statusL')}</span><strong>{pick(`nbill.kindBill.${r.kind}`)}</strong><br /><span className="font-bold text-emerald-700">{pick(stateKey(r))}{r.mode ? ` · ${pick(`nbill.mode.${r.mode}`)}` : ''}</span></div>
            </div>
            <div className="border-y border-slate-200 py-3 space-y-2" data-testid="nbill-lines">
              {r.lines.map((l, i) => <div key={i}><div className="font-bold text-sm" dir="auto">{l.label ?? '—'}{l.qty > 1 ? <span dir="ltr"> × {l.qty}</span> : null}</div>{l.code ? <div className="text-[11px] text-slate-500 font-mono" dir="ltr">IMEI / Serial: {l.code}</div> : null}</div>)}
              {r.ref_no ? <div className="text-[11px] text-slate-500">{t('nbill.ofBill', { no: r.ref_no })}</div> : null}
            </div>
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between"><span>{pick('nbill.total')}</span><strong className="font-mono" dir="ltr">{rs(r.total)}</strong></div>
              <div className="flex justify-between text-[#A3E635]"><span>{pick('nbill.paid')}</span><strong className="font-mono" dir="ltr">{rs(r.paid)}</strong></div>
              <div className="flex justify-between border-t border-slate-700 pt-1.5 text-sm"><span>{pick('nbill.remaining')}</span><strong className={`font-mono ${num(r.due) > 0 ? 'text-amber-300' : 'text-[#A3E635]'}`} dir="ltr" data-testid="nbill-window-due">{rs(r.due)}</strong></div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 space-y-4">
          {canSettle(r) ? <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300/80 dark:border-amber-800 space-y-2.5"><div className="font-display font-extrabold text-sm text-amber-900 dark:text-amber-300">{t('nbill.settleBox', { amt: rs(r.due) })}</div><button type="button" onClick={() => act.settle(r)} className="w-full py-2 rounded-xl font-extrabold bg-emerald-600 text-white flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nbill-window-settle"><Wallet className="w-3.5 h-3.5" />{pick('nbill.settle')}</button></div> : null}
          {r.kind === 'repair' ? <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 space-y-2"><div className="font-display font-extrabold text-sm">{pick('nbill.repairStage')}: {r.stage ? pick(`repair.status.${r.stage}`) : '—'}</div><button type="button" onClick={() => nav(`/new/repairs/${r.id}`)} className="px-3 py-1.5 rounded-lg font-bold bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 cursor-pointer">{pick('nbill.openJob')}</button></div> : null}
          {canCost && r.kind === 'sale' && r.profit != null && r.state !== 'void' ? <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between"><span className="font-bold text-slate-600 dark:text-slate-300">{pick('nbill.profitBill')}</span><span className={`font-mono font-extrabold text-sm ${num(r.profit) < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-[#A3E635]'}`} dir="ltr">{costOk ? signed(r.profit) : '••••••'}</span></div> : null}
          {box('nbill.history', <div className="space-y-2" data-testid="nbill-history">
            {[...r.changes].reverse().map((c, i) => <div key={i} className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800"><div className="font-bold text-slate-800 dark:text-slate-200"><ChangeLine c={c} /></div>{c.by ? <div className="text-[10px] text-slate-400 mt-0.5">{t('nbill.by', { who: c.by })}</div> : null}</div>)}
            {r.replaced_by_no ? <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 font-bold">{t('nbill.replacedBy', { no: r.replaced_by_no })}</div> : null}
            <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800"><div className="font-bold">{pick('nbill.made')}</div><div className="text-[10px] text-slate-400 mt-0.5"><span dir="ltr">{fmtDate(r.date)}</span>{r.created_by_name ? <> · {t('nbill.by', { who: r.created_by_name })}</> : null}</div></div>
          </div>)}
          {own && own !== '/new/item/' ? <button type="button" onClick={() => nav(own)} className="text-[11px] font-bold text-emerald-700 dark:text-[#A3E635] hover:underline cursor-pointer">{pick('nbill.openItem')} →</button> : null}
        </div>
      </div>
    </Modal>
  )
}

function CreateWindow({ onClose, canCost }: { onClose: () => void; canCost: boolean }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const has = useModules()
  const choices: [string, string, typeof Plus][] = [
    ['nbill.c.sale', '/new/sale/new', Plus],
    ...(canCost ? [['nbill.c.purchase', '/new/purchase/new', Plus]] as [string, string, typeof Plus][] : []),
    ['nbill.c.return', '/return/new', Undo2],
    ...(has('repairs') ? [['nbill.c.repair', '/repairs/new', Wrench]] as [string, string, typeof Plus][] : []),
    ...(has('exchange') ? [['nbill.c.exchange', '/new/exchange/new', RotateCcw]] as [string, string, typeof Plus][] : []),
  ]
  return (
    <Modal title={pick('nbill.createTitle')} sub={pick('nbill.createSub')} onClose={onClose} testid="nbill-create-window">
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {choices.map(([l, to, I]) => <button key={l} type="button" onClick={() => nav(to)} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#A3E635] text-start font-bold text-sm flex items-center gap-2 cursor-pointer" data-testid="nbill-create-choice"><I className="w-4 h-4" />{pick(l)}</button>)}
      </div>
    </Modal>
  )
}

export function A4Window({ sheet, canCost, showCost, onClose, title = 'nbill.a4Title', sub = 'nbill.a4Sub' }: { sheet: string; canCost: boolean; showCost: boolean; onClose: () => void; title?: string; sub?: string }) {
  const { pick, ur } = useLang()
  const [hideProfit, setHideProfit] = useState(!showCost)
  const [lang, setLang] = useState<'en' | 'ur'>(ur ? 'ur' : 'en')
  const url = (fmt: string) => `${sheet}${sheet.includes('?') ? '&' : '?'}format=${fmt}&profit=${!hideProfit}&lang=${lang}`
  return (
    <Modal title={pick(title)} sub={pick(sub)} onClose={onClose} testid="nbill-a4-window">
      <div className="p-5 space-y-3 text-xs">
        {canCost ? <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer"><input type="checkbox" checked={hideProfit} onChange={(e) => setHideProfit(e.target.checked)} className="rounded" data-testid="nbill-a4-hide" />{pick('nbill.hideProfit')}</label> : null}
        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-obsidian-800 text-[11px] font-bold ms-3"><button type="button" onClick={() => setLang('en')} className={`px-2.5 py-1 rounded-md cursor-pointer ${lang === 'en' ? pillOn : ''}`}>English</button><button type="button" onClick={() => setLang('ur')} className={`px-2.5 py-1 rounded-md cursor-pointer ${lang === 'ur' ? pillOn : ''}`}>اردو</button></div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => void openPrintable(url('pdf'))} className="px-3.5 py-2 rounded-lg font-extrabold bg-[#A3E635] text-obsidian-950 flex items-center gap-1.5 cursor-pointer" data-testid="nbill-a4-print"><Printer className="w-3.5 h-3.5" />{pick('nbill.openPrint')}</button>
        </div>
      </div>
    </Modal>
  )
}
