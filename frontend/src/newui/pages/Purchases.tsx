/** The purchases list and the bill inspector in the new product (ADR-134), drawn from
 *  `10-purchases-and-bill-inspector.html`: a full screen with the file's own rail (Purchases lit) and
 *  bar, three KPI cards that filter (all / paid & settled / still to pay), the search and the source
 *  pills, the bills as cards with their phones and IMEIs on the left (55%) and the chosen bill on the
 *  right (45%) with its people, phones, the dark money box, the payment drawer and four actions.
 *
 *  Everything comes from the live purchase API and does what the live bill page does: the list is
 *  `GET /purchases` (it shows cost, so only the owner / manager — the server says so too); "Pay the
 *  rest" is a payment out to the seller allocated to this bill (`POST /payments`); "Change what was
 *  paid" is the live correction of what was paid at the purchase (ADR-067, `POST /purchases/{id}/paid`
 *  with a reason); "Change party" is ADR-056 (`POST /purchases/{id}/party`); delete is the live
 *  delete (ADR-090) with its "first do this" check (ADR-100, `GET /delete-check/purchase/{id}`).
 *  The figures are the server's: total, paid, returned and what is still to give (`balance_due`).
 *
 *  Differences from the drawing: there is no purchase slip on the server, so the printer prints the
 *  bill's phone stickers and the PDF is the day's purchases sheet; "Edit bill" opens the live edit
 *  form (the bill is replaced, ADR-090) and "Return to seller" the live return sheet; a bill made by
 *  an exchange is changed and deleted with its sale, as in the live software; a deleted bill stays in
 *  the list marked Deleted and is left out of the cards' totals. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle, AlertTriangle, Banknote, BarChart2, BookOpen, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, FileDown, FileText,
  Home, Landmark, Languages, LayoutGrid, LineChart, Menu, Moon, Package, PackageCheck, PackagePlus, Pencil, Plus, Printer, Search, Settings,
  Share2, ShoppingBag, Smartphone, Sun, Tag, Trash2, Undo2, UserCheck, UserCog, Users, Wallet, Wrench, X, XCircle,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { labelPath, loadLabelPrefs } from '@/components/LabelSheet'
import { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { ApiError, get, post } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useModules } from '@/lib/modules'
import { useGet, useInvalidate, useParties } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Party, Purchase } from '@/lib/types'
import { ALL_BANKS, POPULAR_BANKS } from '@/lib/pkPayments'

type Filter = 'all' | 'settled' | 'topay' | 'supplier' | 'walk_in' | 'trade_in'
interface PaidInfo { paid_at_purchase: string; paid_later: string; max_at_purchase: string }
interface Blocker { code: string; to?: string | null; phone?: string | null; who?: string | null; ref?: string | null; amount?: string | number | null }

const n0 = (v: number | string) => Math.round(Number(v || 0)).toLocaleString('en-US')
const rs = (v: number | string) => withCur(n0(v))
const due = (p: Purchase) => (p.status === 'voided' ? 0 : Math.max(0, Number(p.balance_due || 0)))
const settledAmt = (p: Purchase) => Math.max(0, Number(p.total || 0) - Number(p.returned_total || 0) - due(p))
const SOURCE: Record<Purchase['kind'], string> = { supplier: 'purchase.supplier', walk_in: 'purchase.walkIn', trade_in: 'purchase.tradeIn', shop: 'purchase.shop' }
const badge = (k: Purchase['kind']) =>
  k === 'supplier' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70'
    : k === 'trade_in' ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/70'
      : 'bg-slate-100 dark:bg-obsidian-800 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
const lineName = (l: Purchase['lines'][number]) => l.device_label ?? l.description ?? ''

export default function NewPurchases() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const has = useModules()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const canManage = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const { data, isLoading } = useGet<Purchase[]>(['purchases', 'newui'], canManage ? '/api/v1/purchases?limit=500' : null)
  const bills = useMemo(() => data ?? [], [data])
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2400); return () => clearTimeout(x) }, [toast])

  /* the payment drawer: pay what is left, or (owner / manager) change what was paid at the purchase */
  const [drawer, setDrawer] = useState(false)
  const [amount, setAmount] = useState('')
  const [pay, setPay] = useState<PayState>(() => newPay('cash'))
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState<PaidInfo | null>(null)

  /* the two windows: change party, delete */
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  /* keys, as everywhere in the new product, and "/" for the search */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => {
      if (go[e.key]) { e.preventDefault(); nav(go[e.key]); return }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const live = bills.filter((b) => b.status !== 'voided')
  const unpaid = live.filter((b) => due(b) > 0)
  const settled = live.filter((b) => due(b) === 0)
  const phonesBought = live.reduce((s, b) => s + b.lines.filter((l) => l.device_id).length, 0)
  const totalAmt = live.reduce((s, b) => s + Number(b.total || 0), 0)
  const paidAmt = live.reduce((s, b) => s + settledAmt(b), 0)
  const dueAmt = unpaid.reduce((s, b) => s + due(b), 0)

  const query = q.trim().toLowerCase()
  const shown = bills.filter((b) => {
    if (filter === 'topay' && !(due(b) > 0)) return false
    if (filter === 'settled' && (b.status === 'voided' || due(b) > 0)) return false
    if ((filter === 'supplier' || filter === 'walk_in' || filter === 'trade_in') && b.kind !== filter) return false
    if (!query) return true
    return b.no.toLowerCase().includes(query) || (b.party_name ?? '').toLowerCase().includes(query) || pick(SOURCE[b.kind]).toLowerCase().includes(query)
      || b.lines.some((l) => lineName(l).toLowerCase().includes(query) || (l.imei1 ?? '').includes(query))
  })
  const bill = shown.find((b) => b.id === sel) ?? shown[0] ?? null
  const left = bill ? due(bill) : 0
  const isUnpaid = left > 0
  const posted = bill?.status === 'posted'

  /* opening a bill: an unpaid one opens its drawer at once (as the drawing does) */
  const billId = bill?.id
  useEffect(() => {
    if (!bill) return
    setDrawer(bill.status === 'posted' && due(bill) > 0)
    setAmount(due(bill) > 0 ? String(due(bill)) : '')
    setPay(newPay('cash')); setWhy(''); setErr(''); setInfo(null)
  }, [billId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* changing what was paid needs what was paid at the purchase and the most it can be */
  const fixing = drawer && !isUnpaid
  useEffect(() => {
    if (!fixing || !bill || !canManage) return
    let stale = false
    get<PaidInfo>(`/api/v1/purchases/${bill.id}/paid`).then((x) => { if (!stale) { setInfo(x); setAmount(String(Number(x.paid_at_purchase))) } }).catch(() => undefined)
    return () => { stale = true }
  }, [fixing, billId]) // eslint-disable-line react-hooks/exhaustive-deps

  const val = amount === '' ? null : Number(amount)
  const online = pay.method === 'online'
  const fixNow = info ? Number(info.paid_at_purchase) : 0
  const fixMax = info ? Number(info.max_at_purchase) : 0
  const diff = val == null ? 0 : val - fixNow
  const payOk = isUnpaid
    ? val != null && val > 0 && val <= left && (!online || payReady(pay))
    : !!info && val != null && val >= 0 && val <= fixMax && diff !== 0 && why.trim().length >= 2 && (diff < 0 || !online || payReady(pay))

  async function savePay() {
    if (!bill || !payOk || val == null) return
    setBusy(true); setErr('')
    try {
      if (isUnpaid) {
        await post('/api/v1/payments', { party_id: bill.party_id, direction: 'out', amount: val, payment: online ? payInfo(pay) : undefined, allocations: [{ document_type: 'purchase', document_id: bill.id, amount: val }] })
        setToast(t('nlist.payDone', { n: rs(val), who: bill.party_name ?? '' }))
      } else {
        await post(`/api/v1/purchases/${bill.id}/paid`, { paid_now: val, payment: diff > 0 && online ? payInfo(pay) : undefined, reason: why.trim() })
        setToast(pick('nlist.saved'))
      }
      await inv('purchases', 'purchase', 'parties', 'party', 'payments', 'dashboard', 'day', 'accounts')
      setDrawer(false)
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally {
      setBusy(false)
    }
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setToast(t('nlist.copied', { what: text }))
  }

  function share(b: Purchase) {
    const phones = b.lines.map((l) => `${lineName(l)}${l.imei1 ? ` (${l.imei1})` : ''}`).join(', ')
    const msg = t('nlist.waText', { shop: shop?.name ?? '', no: b.no, who: b.party_name ?? '', phones, total: rs(b.total), paid: rs(settledAmt(b)), left: rs(due(b)) })
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  function stickers(b: Purchase) {
    const ids = b.lines.filter((l) => l.device_id && !l.returned_at).map((l) => l.device_id!)
    if (!ids.length) { setToast(pick('nlist.noStickers')); return }
    const p = loadLabelPrefs(null)
    void openPrintable(labelPath('devices', ids, { ...p, fields: p.fields.filter((f) => f !== 'code' && f !== 'pcode') }))
  }

  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const pill = (f: Filter, label: string, rose = false) => (
    <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`nlist-f-${f}`}
      className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${filter === f ? 'font-bold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : `font-semibold bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 ${rose ? 'text-rose-600 dark:text-rose-400 hover:border-rose-400' : 'text-slate-700 dark:text-slate-300 hover:border-slate-400'}`}`}>
      {rose ? <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> : null}<span>{pick(label)}</span>
    </button>
  )
  const big = ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'

  return (
    <div className="font-sans bg-[#F6F7F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row" data-testid="nlist" data-newui="1" data-file="10">
      {menu ? <button type="button" aria-hidden onClick={() => setMenu(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden" /> : null}
      <Rail open={menu} onClose={() => setMenu(false)} has={has} role={role} />

      <div className="flex-1 flex flex-col min-w-0 lg:h-screen lg:overflow-hidden">
        {/* ===== TOP BAR ===== */}
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => setMenu(true)} aria-label={pick('nav.more')} className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"><Menu className="w-4 h-4" /></button>
              <button type="button" onClick={() => nav('/new')} className="px-2.5 py-1.5 rounded-xl bg-slate-100/80 dark:bg-obsidian-850 hover:bg-slate-200/80 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"><ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('common.back')}</span></button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className={big}>{pick('nlist.title')}</h1>
                  <span className="w-4 h-4 rounded-full border border-emerald-500/60 text-emerald-600 dark:text-[#A3E635] text-[10px] font-bold inline-flex items-center justify-center" title={pick('nlist.help')}>?</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nlist.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => nav('/new/purchase/new')} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-xs" data-testid="nlist-new"><Plus className="w-3.5 h-3.5" /><span>{pick('nlist.newPurchase')} <span dir="ltr">(F3)</span></span></button>
              {canManage ? <button type="button" onClick={() => void downloadFile(withDocLang('/api/v1/exports/purchases?format=xlsx'), 'purchases.xlsx')} className="hidden sm:flex px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold items-center gap-1.5 cursor-pointer" data-testid="nlist-download"><Download className="w-3.5 h-3.5" /><span>{pick('common.download')}</span></button> : null}
              <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="nlist-lang"><Languages className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" /><span className="hidden md:inline">{ur ? 'English' : 'اردو'}</span></button>
              <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center" title={userName} dir="ltr">{initials}</div>
            </div>
          </div>
        </header>

        {!canManage ? (
          <div className="flex-1 flex items-center justify-center p-8" data-testid="nlist-no-access">
            <div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8">
              <p className="font-bold text-sm">{pick('nlist.noAccess')}</p>
              <button type="button" onClick={() => nav('/new/purchase/new')} className="mt-3 px-3.5 py-1.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-xs font-bold cursor-pointer">{pick('counter.addStock')}</button>
            </div>
          </div>
        ) : (
          <>
            {/* ===== KPI STRIP + SEARCH & FILTERS ===== */}
            <div className="shrink-0 bg-[#F6F7F9] dark:bg-obsidian-950 border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" onClick={() => setFilter('all')} data-testid="nlist-kpi-all" className={`rounded-2xl bg-obsidian-900 dark:bg-obsidian-900 text-white p-3.5 cursor-pointer transition-all flex items-center justify-between text-start ${filter === 'all' ? 'border-2 border-obsidian-900 dark:border-[#A3E635] shadow-xs' : 'border border-slate-800 opacity-90 hover:opacity-100'}`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><span>{pick('nlist.totalPurchases')}</span><span className="px-1.5 rounded bg-white/10 text-[#A3E635] text-[10px]">{pick('nlist.all')}</span></div>
                    <div className="font-display font-extrabold text-xl sm:text-2xl text-white mt-0.5 tracking-tight" dir="ltr" data-testid="nlist-kpi-total">{rs(totalAmt)}</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">{t('nlist.billsPhones', { bills: live.length, phones: phonesBought })}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white/10 text-[#A3E635] flex items-center justify-center shrink-0"><ShoppingBag className="w-5 h-5" /></div>
                </button>
                <button type="button" onClick={() => setFilter('settled')} data-testid="nlist-kpi-settled" className={`rounded-2xl bg-white dark:bg-obsidian-900 p-3.5 cursor-pointer transition-all flex items-center justify-between text-start ${filter === 'settled' ? 'border-2 border-emerald-500 shadow-xs' : 'border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400'}`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400"><span>{pick('nlist.paidSettled')}</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></div>
                    <div className="font-display font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400 mt-0.5 tracking-tight" dir="ltr" data-testid="nlist-kpi-paid">{rs(paidAmt)}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('nlist.settledN', { n: settled.length })}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
                </button>
                <button type="button" onClick={() => setFilter('topay')} data-testid="nlist-kpi-topay" className={`rounded-2xl p-3.5 cursor-pointer transition-all flex items-center justify-between text-start ${filter === 'topay' ? 'bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 shadow-xs' : 'bg-rose-50/90 dark:bg-rose-950/25 border border-rose-200/90 dark:border-rose-800/70 hover:border-rose-500'}`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"><span>{pick('nlist.toPayKpi')}</span><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /></div>
                    <div className="font-display font-extrabold text-xl sm:text-2xl text-rose-600 dark:text-rose-400 mt-0.5 tracking-tight" dir="ltr" data-testid="nlist-kpi-due">{rs(dueAmt)}</div>
                    <div className="text-[11px] font-medium text-rose-700/80 dark:text-rose-300/80 mt-0.5 truncate">{unpaid.length === 0 ? pick('nlist.allSettled') : unpaid.length === 1 ? t('nlist.oneBill', { who: unpaid[0].party_name ?? '' }) : t('nlist.pendingN', { n: unpaid.length })}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><AlertCircle className="w-5 h-5" /></div>
                </button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nlist.search')} data-testid="nlist-search"
                    className="w-full ps-9 pe-8 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635] transition-colors" />
                  {q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {pill('all', 'nlist.all')}
                  {pill('topay', 'nlist.fToPay', true)}
                  {pill('supplier', 'purchase.supplier')}
                  {pill('walk_in', 'purchase.walkIn')}
                  {pill('trade_in', 'purchase.tradeIn')}
                </div>
              </div>
            </div>

            {/* ===== SPLIT: 55% LIST / 45% INSPECTOR ===== */}
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
              <div className="w-full lg:w-[55%] lg:h-full overflow-y-auto p-4 sm:px-6 space-y-2.5 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pb-0.5">
                  <span data-testid="nlist-count">{t('nlist.showing', { n: shown.length, total: bills.length })}</span>
                  <span className="hidden sm:inline">{pick('nlist.clickHint')}</span>
                </div>
                <div className="space-y-2.5 pb-6" data-testid="nlist-cards">
                  {isLoading ? <div className="p-8 text-center text-xs text-slate-400">…</div> : !shown.length ? (
                    <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8 text-center" data-testid="nlist-empty">
                      <p className="font-bold text-sm">{pick('nlist.noMatch')}</p>
                      <p className="text-xs text-slate-500 mt-1">{pick('nlist.noMatchHint')}</p>
                      <button type="button" onClick={() => { setQ(''); setFilter('all') }} className="mt-3 px-3.5 py-1.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-xs font-bold cursor-pointer">{pick('nlist.reset')}</button>
                    </div>
                  ) : shown.map((b) => {
                    const on = b.id === bill?.id
                    const owe = due(b)
                    const voided = b.status === 'voided'
                    const phones = b.lines.filter((l) => l.device_id).length
                    return (
                      <div key={b.id} role="button" tabIndex={0} onClick={() => setSel(b.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(b.id) }} data-testid={`nlist-card-${b.no}`}
                        className={`rounded-2xl bg-white dark:bg-obsidian-900 p-4 cursor-pointer transition-all ${voided ? 'opacity-60' : ''} ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] shadow-md ring-2 ring-[#A3E635]/20' : owe > 0 ? 'border border-rose-300/90 dark:border-rose-800/80 hover:border-rose-500' : 'border border-slate-200/90 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display font-bold text-sm sm:text-[15px] text-slate-900 dark:text-white truncate" dir="auto">{b.party_name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge(b.kind)}`}>{pick(SOURCE[b.kind])}</span>
                              {phones > 1 ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">{t('nlist.phonesN', { n: phones })}</span> : null}
                              {voided ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick('sale.status.void')}</span> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{b.no}</span><span>•</span>
                              <span dir="ltr">{b.purchased_at ? fmtDateTime(b.purchased_at) : fmtDate(b.date)}</span>
                              {b.created_by_name ? <><span>•</span><span>{t('nlist.by', { who: b.created_by_name })}</span></> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-end">
                              <div className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white" dir="ltr">{rs(b.total)}</div>
                              {voided ? null : owe > 0
                                ? <div className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />{t('nlist.toPayN', { n: rs(owe) })}</div>
                                : <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{pick('nlist.paid')}</div>}
                            </div>
                            {!voided && !b.exchange_id ? (
                              <div className="hidden sm:flex items-center gap-1 ms-1">
                                <button type="button" onClick={(e) => { e.stopPropagation(); nav(`/purchase/new?replace=${b.id}`) }} title={pick('nlist.editBill')} aria-label={pick('nlist.editBill')} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-[#A3E635] hover:bg-slate-50 dark:hover:bg-obsidian-800 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setSel(b.id); setDeleting(true) }} title={pick('nlist.deleteBill')} aria-label={pick('nlist.deleteBill')} className="p-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer" data-testid={`nlist-del-${b.no}`}><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {b.lines.length ? (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-1.5">
                            {b.lines.map((l) => (
                              <div key={l.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 text-[11px] max-w-full ${l.returned_at ? 'line-through opacity-60' : ''}`}>
                                {l.device_id ? <Smartphone className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" /> : <Package className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />}
                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" dir="auto">{lineName(l)}</span>
                                {l.imei1 ? <button type="button" onClick={(e) => { e.stopPropagation(); copy(l.imei1!) }} title={pick('nlist.tapCopy')} className="font-mono text-[10px] px-1.5 rounded bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#A3E635] cursor-pointer shrink-0" dir="ltr">{l.imei1}</button>
                                  : !l.device_id ? <span className="font-mono text-[10px] text-slate-400 shrink-0" dir="ltr">× {l.qty}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ===== RIGHT: THE BILL ===== */}
              <div className="w-full lg:w-[45%] lg:h-full overflow-y-auto bg-white dark:bg-obsidian-900 p-4 sm:p-6" data-testid="nlist-inspector">
                {!bill ? <div className="h-full min-h-40 flex items-center justify-center text-xs text-slate-400">{pick('nlist.selectBill')}</div> : (
                  <div className="space-y-4 pb-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <span className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="ltr" data-testid="nlist-bill-no">{bill.no}</span>
                        {!posted ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick('sale.status.void')}</span>
                          : isUnpaid ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1" data-testid="nlist-state"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> {pick('nlist.toPay')}</span>
                            : <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" data-testid="nlist-state">{pick('nlist.settled')}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => stickers(bill)} title={pick('nlist.printStickers')} aria-label={pick('nlist.printStickers')} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-slate-600 dark:text-slate-300 cursor-pointer" data-testid="nlist-print"><Printer className="w-4 h-4" /></button>
                        <button type="button" onClick={() => void downloadFile(withDocLang(`/api/v1/exports/purchases?format=pdf&date_from=${bill.date}&date_to=${bill.date}`), `purchases-${bill.date}.pdf`)} title={pick('nlist.pdf')} aria-label={pick('nlist.pdf')} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-slate-600 dark:text-slate-300 cursor-pointer"><FileDown className="w-4 h-4" /></button>
                        <button type="button" onClick={() => share(bill)} className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Share2 className="w-3.5 h-3.5" /><span>{pick('nlist.whatsapp')}</span></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        ['nlist.fromWhom', <button key="w" type="button" onClick={() => nav(`/parties/${bill.party_id}`)} className="font-bold text-xs sm:text-sm text-emerald-700 dark:text-[#A3E635] truncate hover:underline cursor-pointer max-w-full" dir="auto">{bill.party_name}</button>],
                        ['nlist.source', <span key="s" className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200">{pick(SOURCE[bill.kind])}</span>],
                        ['nlist.dateTime', <span key="d" className="font-semibold text-xs text-slate-800 dark:text-slate-200" dir="ltr">{bill.purchased_at ? fmtDateTime(bill.purchased_at) : fmtDate(bill.date)}</span>],
                        ['nlist.addedBy', <span key="a" className="font-semibold text-xs text-slate-800 dark:text-slate-200">{bill.created_by_name ?? '—'}</span>],
                      ] as const).map(([k, v]) => (
                        <div key={k} className="rounded-xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 p-3 min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick(k)}</div>
                          <div className="mt-0.5 truncate">{v}</div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('nlist.phonesTitle', { n: bill.lines.length })}</span>
                        <span className="text-[11px] text-slate-400">{pick('nlist.tapCopy')}</span>
                      </div>
                      <div className="space-y-2" data-testid="nlist-lines">
                        {bill.lines.map((l) => (
                          <div key={l.id} className={`rounded-xl bg-slate-50/90 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 p-3 flex items-center justify-between gap-3 ${l.returned_at ? 'opacity-60' : ''}`}>
                            <div className="min-w-0">
                              <div className={`font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate ${l.returned_at ? 'line-through' : ''}`} dir="auto">{lineName(l)}</div>
                              {l.returned_at ? <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{pick('nlist.returnedLine')}</div> : !l.device_id ? <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5" dir="ltr">× {l.qty}</div> : null}
                              <div className="flex items-center gap-2 mt-1.5">
                                {l.imei1 ? <button type="button" onClick={() => copy(l.imei1!)} className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 cursor-pointer" dir="ltr"><span>{l.imei1}</span><Copy className="w-3 h-3 opacity-60" /></button> : null}
                                {l.device_id ? <button type="button" onClick={() => nav(`/stock/${l.device_id}`)} className="text-[11px] font-semibold text-emerald-700 dark:text-[#A3E635] hover:underline cursor-pointer">{pick('nlist.viewStock')}</button>
                                  : l.accessory_id ? <button type="button" onClick={() => nav(`/accessories/${l.accessory_id}`)} className="text-[11px] font-semibold text-emerald-700 dark:text-[#A3E635] hover:underline cursor-pointer">{pick('nlist.viewStock')}</button> : null}
                              </div>
                            </div>
                            <div className="text-end shrink-0">
                              <div className="font-display font-extrabold text-sm text-slate-900 dark:text-white" dir="ltr">{rs(l.net_cost)}</div>
                              
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* the dark money box */}
                    <div className="rounded-2xl bg-[#0B0F19] border border-slate-800 text-white p-4 sm:p-5 space-y-3 shadow-md" data-testid="nlist-money">
                      <div className="flex items-center justify-between text-xs sm:text-sm"><span className="text-slate-400 font-medium">{pick('nlist.totalBill')}</span><span className="font-display font-bold text-base text-[#A3E635]" dir="ltr">{rs(bill.total)}</span></div>
                      <div className="flex items-center justify-between text-xs sm:text-sm"><span className="text-slate-400 font-medium">{pick('nlist.paidNow')}</span><span className="font-display font-bold text-base text-[#A3E635]" dir="ltr">{rs(bill.paid)}</span></div>
                      {posted && settledAmt(bill) - Number(bill.paid || 0) > 0.5 ? <div className="flex items-center justify-between text-xs sm:text-sm"><span className="text-slate-400 font-medium">{pick('nlist.paidLater')}</span><span className="font-display font-bold text-base text-[#A3E635]" dir="ltr">{rs(settledAmt(bill) - Number(bill.paid || 0))}</span></div> : null}
                      {Number(bill.returned_total) > 0 ? <div className="flex items-center justify-between text-xs sm:text-sm"><span className="text-slate-400 font-medium">{pick('nlist.returned')}</span><span className="font-display font-bold text-base text-amber-400" dir="ltr">−{rs(bill.returned_total)}</span></div> : null}
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <span className={`text-xs sm:text-sm font-bold ${isUnpaid ? 'text-rose-400' : 'text-amber-400'}`}>{pick('nlist.remaining')}</span>
                        <span className={`font-display font-extrabold text-xl sm:text-2xl ${isUnpaid ? 'text-rose-400' : 'text-[#A3E635]'}`} dir="ltr" data-testid="nlist-left">{rs(left)}</span>
                      </div>
                      {posted && (isUnpaid || canManage) ? (
                        <div className="pt-1">
                          <button type="button" onClick={() => setDrawer(!drawer)} data-testid="nlist-pay-toggle" className={`w-full py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${isUnpaid ? 'bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-extrabold' : 'bg-white/10 hover:bg-white/15 text-white font-semibold'}`}>
                            <Banknote className="w-4 h-4" /><span>{isUnpaid ? t('nlist.payRest', { n: rs(left) }) : pick('nlist.changePaid')}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* the payment drawer */}
                    {drawer && posted ? (
                      <div className="rounded-2xl bg-amber-50/90 dark:bg-obsidian-850 border border-amber-300/80 dark:border-[#A3E635]/40 p-4 space-y-3" data-testid="nlist-drawer">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{isUnpaid ? t('nlist.recordTo', { who: bill.party_name ?? '' }) : pick('nlist.fixTitle')}</span>
                          <button type="button" onClick={() => setAmount(String(isUnpaid ? left : fixMax))} className="px-2.5 py-1 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-[11px] font-bold cursor-pointer" data-testid="nlist-pay-full">{t('nlist.payFull', { n: rs(isUnpaid ? left : fixMax) })}</button>
                        </div>
                        {!isUnpaid && info ? <p className="text-[11px] text-slate-600 dark:text-slate-400">{t('nlist.fixHint', { now: rs(fixNow), later: rs(info.paid_later) })}</p> : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">{pick(isUnpaid ? 'nlist.amount' : 'nlist.fixAmount')}</label>
                            <input type="number" inputMode="numeric" min={0} max={isUnpaid ? left : fixMax} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" data-testid="nlist-pay-amount"
                              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">{pick('nlist.account')}</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(['cash', 'online'] as const).map((m) => (
                                <button key={m} type="button" onClick={() => setPay({ ...pay, method: m })} aria-pressed={pay.method === m} data-testid={`nlist-pay-${m}`}
                                  className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer ${pay.method === m ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-obsidian-900 dark:border-[#A3E635]' : 'bg-white dark:bg-obsidian-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{pick(m === 'cash' ? 'nlist.cashGalla' : 'nlist.onlineBank')}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {online ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {POPULAR_BANKS.slice(0, 5).map((b) => <button key={b} type="button" onClick={() => setPay({ ...pay, bank: b })} className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer ${pay.bank === b ? 'bg-obsidian-900 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-700'}`}>{b}</button>)}
                              <select value={pay.bank && !POPULAR_BANKS.slice(0, 5).includes(pay.bank) ? pay.bank : ''} onChange={(e) => setPay({ ...pay, bank: e.target.value })} className="px-2 py-0.5 rounded-lg text-[11px] bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700"><option value="">{pick('paym.otherBank')}</option>{ALL_BANKS.filter((b) => !POPULAR_BANKS.slice(0, 5).includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}</select>
                            </div>
                            <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pick('paym.tid')} className="w-full px-2.5 py-1.5 rounded-lg font-mono text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr" />
                          </div>
                        ) : null}
                        {!isUnpaid ? (
                          <>
                            {diff !== 0 ? <p className={`text-[11px] font-bold ${diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-[#A3E635]'}`} data-testid="nlist-fix-effect">{pick(diff < 0 ? 'purchase.paidFix.effectLess' : 'purchase.paidFix.effectMore').replace(/\{\{n\}\}/g, rs(Math.abs(diff))).replace('{{who}}', bill.party_name ?? '')}</p> : null}
                            <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} placeholder={pick('common.reason')} data-testid="nlist-fix-reason" className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
                          </>
                        ) : null}
                        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button type="button" onClick={() => setDrawer(false)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-black/5 cursor-pointer">{pick('common.cancel')}</button>
                          <button type="button" onClick={() => void savePay()} disabled={!payOk || busy} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs cursor-pointer" data-testid="nlist-pay-save">{pick('nlist.savePay')}</button>
                        </div>
                      </div>
                    ) : null}

                    {/* the four actions */}
                    {posted ? (
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        {!bill.exchange_id ? <Act Icon={Pencil} tone="text-slate-700 dark:text-[#A3E635]" title="nlist.editBill" sub="nlist.editHint" onClick={() => nav(`/purchase/new?replace=${bill.id}`)} testid="nlist-edit" /> : null}
                        <Act Icon={UserCheck} tone="text-blue-600 dark:text-blue-400" title="nlist.changeParty" sub="nlist.partyHint" onClick={() => setMoving(true)} testid="nlist-party" />
                        <Act Icon={Undo2} tone="text-amber-600 dark:text-amber-400" title="nlist.returnSeller" sub="nlist.returnHint" onClick={() => nav(`/purchases/${bill.id}?return=all`)} testid="nlist-return" />
                        <button type="button" onClick={() => (bill.exchange_id ? nav(`/purchases/${bill.id}`) : setDeleting(true))} data-testid="nlist-delete" className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/25 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200/80 dark:border-rose-900/60 text-start transition-colors cursor-pointer flex items-center gap-2.5">
                          <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <div><div className="font-bold text-xs text-rose-700 dark:text-rose-300">{pick('nlist.deleteBill')}</div><div className="text-[10px] text-rose-600/75 dark:text-rose-400/75">{pick(bill.exchange_id ? 'nlist.withSale' : 'nlist.deleteHint')}</div></div>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {moving && bill ? <PartyWindow bill={bill} onClose={() => setMoving(false)} onDone={(m) => { setMoving(false); setToast(m) }} /> : null}
      {deleting && bill ? <DeleteWindow bill={bill} onClose={() => setDeleting(false)} onDone={(m) => { setDeleting(false); setToast(m) }} /> : null}

      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nlist-toast">{toast}</span></div>
      </div>
    </div>
  )
}

function Act({ Icon, tone, title, sub, onClick, testid }: { Icon: typeof Pencil; tone: string; title: string; sub: string; onClick: () => void; testid: string }) {
  const { pick } = useLang()
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/80 dark:border-slate-800 text-start transition-colors cursor-pointer flex items-center gap-2.5">
      <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
      <div><div className="font-bold text-xs">{pick(title)}</div><div className="text-[10px] text-slate-500">{pick(sub)}</div></div>
    </button>
  )
}

/** The file's rail: shop mark, Dashboard, the counter's tiles with their keys, the shop grid with
 *  Purchases lit, the "/" hint. */
function Rail({ open, onClose, has, role }: { open: boolean; onClose: () => void; has: ReturnType<typeof useModules>; role: string | undefined }) {
  const { pick, ur, cls } = useLang()
  const shop = useAuth(activeShop)
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const managers = role === 'owner' || role === 'manager'
  const JOBS: [string, string, string, typeof Tag][] = [
    ['/new/khata', 'counter.khata', 'F4', BookOpen], ['/new/stock/summary', 'counter.stock', 'F6', Smartphone],
    ...(has('repairs') ? [['/new/repairs', 'counter.repair', 'F7', Wrench] as [string, string, string, typeof Tag]] : []),
    ['/new/return/new', 'counter.returnJob', 'F9', Undo2], ['/new/invoices', 'inv.short', 'F10', FileText],
    ...(has('expenses') ? [['/new/expenses', 'counter.expense', 'F8', Wallet] as [string, string, string, typeof Tag]] : []),
  ]
  const SHOP: [string, string, typeof Tag, boolean][] = [
    ['/new/parties', 'party.title', Users, true], ['/new/audit', 'audit.title', LineChart, managers], ['/new/hisaab', 'counter.dayTitle', CalendarCheck, true],
    ['/new/reports', 'more.reports', BarChart2, true], ['/new/more/cash', 'more.cashAccounts', Landmark, managers], ['/new/purchases', 'nav.purchases', PackageCheck, true],
    ['/new/more/staff', 'more.staff', UserCog, role === 'owner'], ['/new/more/settings', 'nlist.settings', Settings, role === 'owner'], ['/new/more', 'nav.allOptions', LayoutGrid, true],
  ]
  const tiny = ur ? cls('sm') : 'text-[10px]'
  const small = ur ? cls('sm') : 'text-xs'
  return (
    <aside className={`fixed lg:static top-0 start-0 z-50 h-screen w-[240px] shrink-0 bg-white dark:bg-obsidian-900 border-e border-slate-200/80 dark:border-slate-800/80 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'ltr:max-lg:-translate-x-full rtl:max-lg:translate-x-full'}`} data-testid="nlist-rail">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <NavLink to="/new" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
          <div className="min-w-0">
            <div className={`truncate ${ur ? `ur font-bold ${cls('md')}` : 'font-display font-bold text-sm tracking-tight leading-tight'}`}>{name}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</span></div>
          </div>
        </NavLink>
        <button type="button" onClick={onClose} aria-label={pick('common.close')} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <NavLink to="/new" className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold bg-slate-100/80 dark:bg-obsidian-850 text-slate-800 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-obsidian-800 transition-colors ${small}`}>
          <span className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" /><span>{pick('nav.dashboard')}</span></span>
          <ChevronRight className="w-3.5 h-3.5 opacity-50 rtl:rotate-180" />
        </NavLink>
        <div className="grid grid-cols-2 gap-1.5">
          <NavLink to="/new/sale/new" className="p-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 text-start transition-all shadow-xs cursor-pointer flex flex-col justify-between min-h-[60px]">
            <span className="flex items-center justify-between w-full"><span className="w-5 h-5 rounded-md bg-white/75 flex items-center justify-center"><Tag className="w-3 h-3 text-slate-900" /></span><span className="text-[10px] font-bold opacity-75" dir="ltr">F2</span></span>
            <span className={`font-bold mt-1.5 ${small}`}>{pick('counter.sell')}</span>
          </NavLink>
          <NavLink to="/new/purchase/new" className="p-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 hover:bg-obsidian-800 dark:hover:bg-slate-700 text-white text-start transition-all shadow-xs cursor-pointer flex flex-col justify-between min-h-[60px] border border-transparent dark:border-slate-700">
            <span className="flex items-center justify-between w-full"><span className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center"><PackagePlus className="w-3 h-3 text-[#A3E635]" /></span><span className="text-[10px] font-semibold text-slate-400" dir="ltr">F3</span></span>
            <span className={`font-bold mt-1.5 ${small}`}>{pick('counter.addStock')}</span>
          </NavLink>
          {JOBS.map(([to, label, key, Icon]) => (
            <NavLink key={to} to={to} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 text-start transition-colors cursor-pointer flex flex-col justify-between min-h-[56px]">
              <span className="flex items-center justify-between w-full"><Icon className="w-3.5 h-3.5 text-lime-700 dark:text-[#A3E635]" /><span className="text-[10px] text-slate-400" dir="ltr">{key}</span></span>
              <span className={`font-semibold mt-1 ${small}`}>{pick(label)}</span>
            </NavLink>
          ))}
        </div>
        <div>
          <div className={`px-1 mb-1.5 font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${tiny}`}>{pick('nlist.shop')}</div>
          <div className="grid grid-cols-3 gap-1.5">
            {SHOP.filter((x) => x[3]).map(([to, label, Icon]) => to === '/new/purchases' ? (
              <span key={to} aria-current="page" className="p-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border border-obsidian-900 dark:border-[#A3E635] flex flex-col items-center text-center gap-1 shadow-xs">
                <Icon className="w-3.5 h-3.5 text-[#A3E635] dark:text-obsidian-950" /><span className={`font-bold leading-tight ${tiny}`}>{pick(label)}</span>
              </span>
            ) : (
              <NavLink key={to} to={to} end={to === '/new/more'} className="p-2 rounded-xl bg-slate-50/80 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/60 dark:border-slate-800 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors">
                <Icon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" /><span className={`font-semibold leading-tight ${tiny}`}>{pick(label)}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>{pick('nlist.quickSearch')}</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 font-mono font-bold" dir="ltr">/</kbd>
        </div>
      </div>
    </aside>
  )
}

/** "Change party" (ADR-056): the wrong dealer / customer was picked; anyone of the shop, with a reason. */
function PartyWindow({ bill, onClose, onDone }: { bill: Purchase; onClose: () => void; onDone: (msg: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [q, setQ] = useState('')
  const { data: people } = useParties(q.trim().length >= 1 ? { q: q.trim() } : {})
  const [to, setTo] = useState<Party | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = !!to && to.id !== bill.party_id && why.trim().length >= 2
  async function save() {
    if (!ok) return
    setBusy(true); setErr('')
    try {
      await post(`/api/v1/purchases/${bill.id}/party`, { party_id: to!.id, reason: why.trim() })
      await inv('purchases', 'purchase', 'parties', 'party', 'payments')
      onDone(pick('nlist.saved'))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nlist-party-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-display font-bold text-base">{t('nlist.partyTitle', { no: bill.no })}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{pick('purchase.fix.partyHint')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">{pick('purchase.fix.partyNew')}</label>
            <input value={to ? to.name : q} onChange={(e) => { setTo(null); setQ(e.target.value) }} placeholder={pick('nlist.partySearch')} data-testid="nlist-party-q" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" dir="auto" />
            {!to ? (
              <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {(people ?? []).filter((p) => p.id !== bill.party_id).slice(0, 8).map((p) => (
                  <button key={p.id} type="button" onClick={() => setTo(p)} className="w-full px-3 py-2 text-start text-xs hover:bg-slate-50 dark:hover:bg-obsidian-850 flex items-center justify-between gap-2 cursor-pointer" data-testid="nlist-party-hit">
                    <span className="font-semibold truncate" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone ?? ''}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">{pick('common.reason')}</label>
            <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} data-testid="nlist-party-reason" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-800 cursor-pointer">{pick('common.cancel')}</button>
            <button type="button" onClick={() => void save()} disabled={!ok || busy} className="px-4 py-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-bold text-xs hover:opacity-90 disabled:opacity-50 cursor-pointer" data-testid="nlist-party-save">{pick('nlist.saveChanges')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Delete (ADR-090 / ADR-100): what stands in the way first, then what will happen, then a reason. */
function DeleteWindow({ bill, onClose, onDone }: { bill: Purchase; onClose: () => void; onDone: (msg: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stale = false
    get<{ ok: boolean; blockers: Blocker[] }>(`/api/v1/delete-check/purchase/${bill.id}`).then((c) => { if (!stale) setBlockers(c.ok ? [] : c.blockers) }).catch(() => undefined)
    return () => { stale = true }
  }, [bill.id])
  const text = (b: Blocker) => {
    const raw = pick(`delchk.c.${b.code}`)
    return (raw === `delchk.c.${b.code}` ? pick('delchk.c.not_in_shop') : raw)
      .replace('{{phone}}', b.phone ?? '—').replace('{{who}}', b.who ?? '—').replace('{{ref}}', b.ref ?? '—')
      .replace('{{amount}}', b.amount == null ? '—' : rs(b.amount))
  }
  async function del() {
    if (why.trim().length < 3) return
    setBusy(true); setErr('')
    try {
      await post(`/api/v1/purchases/${bill.id}/void`, { reason: why.trim() })
      await inv('purchases', 'purchase', 'devices', 'device', 'parties', 'party', 'invoices', 'dashboard', 'day', 'payments', 'stock-status', 'accounts')
      onDone(t('nlist.deletedN', { no: bill.no }))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nlist-delete-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
          <div>
            <h3 className="font-display font-bold text-sm">{pick('nlist.deleteQ')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('nlist.deleteDesc', { no: bill.no, who: bill.party_name ?? '', total: rs(bill.total) })}</p>
          </div>
        </div>
        {blockers.length ? (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2" role="alert" data-testid="nlist-blockers">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300"><AlertTriangle className="w-4 h-4" />{pick('delchk.title')}</div>
            {blockers.map((b, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white dark:bg-obsidian-850 px-2.5 py-1.5">
                <span className="flex-1 min-w-0 text-[11px] font-semibold">{text(b)}</span>
                {b.to ? <button type="button" onClick={() => { onClose(); nav(b.to!) }} className="px-2 py-1 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-[10px] font-bold cursor-pointer">{pick('delchk.open')}</button> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-xl bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200/80 dark:border-rose-900/60 p-3 space-y-1">
          <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{pick('del.purchase.effect')}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400"><span className="font-bold">{pick('del.example')}: </span>{pick('del.purchase.example')}</p>
        </div>
        <input value={why} onChange={(e) => setWhy(e.target.value)} minLength={3} maxLength={300} placeholder={pick('bill.reasonPh')} aria-label={pick('common.reason')} data-testid="nlist-delete-reason" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
        <p className="text-[10px] text-slate-500">{pick('bill.kept')}</p>
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-800 cursor-pointer">{pick('nlist.keepBill')}</button>
          <button type="button" onClick={() => void del()} disabled={why.trim().length < 3 || busy} className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nlist-delete-confirm">{pick('nlist.yesDelete')}</button>
        </div>
      </div>
    </div>
  )
}
