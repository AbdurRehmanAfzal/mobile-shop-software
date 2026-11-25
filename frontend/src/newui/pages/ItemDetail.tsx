/** One item's page in the new product (ADR-134), drawn from `17-item-detail-command-center.html` (the
 *  final of the three drafts): the file's own top bar (Back, the kinds of stock with this one lit, cost
 *  visible, language, dark), the item's name with its state, days in the shop and its chips, the main
 *  jobs (Sell, Reserve, Amanat, Repair, More actions, WhatsApp pitch), the rows of quick edits, stock
 *  & ledger movement and the danger zone, and the cards: identity & shelf, verification & proof,
 *  condition, specs & box, cost & margin, market & ageing, purchase & supplier khata, the timeline,
 *  the 50×30 sticker and the warranty.
 *
 *  Everything is the live phone page's (`features/stock/DeviceDetailPage.tsx`): the same actions with
 *  the same conditions (owner / manager for cost, a pending ID check, a flagged phone never sold), the
 *  same requests — `GET /devices/{id}`, `/history`, `/money`, `/devices/price-hint`; note =
 *  `POST /devices/{id}/events`, asking = `PATCH /devices/{id}` (PIN / approval), amanat = `POST /loans`,
 *  cost = `POST /purchases/cost`, IMEI = `POST /devices/{id}/correct-imei`, type =
 *  `/devices/reclassify/preview|apply`, lock = `POST /devices/{id}/lock-check`. The live sheets are
 *  reused for faults, reserve, PTA, the sticker and removing an old-stock entry; "Edit details" opens
 *  the live form.
 *
 *  Differences from the drawing: the shop has no QC matrix, so the card shows the phone's faults and
 *  its locked parts; there are no "added expenses" on a phone, so cost is the buying price, what was
 *  paid and what is still owed; the market range is the shop's own sales of the same model (the
 *  server's price hint), not a market feed; the sticker's ticks are the live sticker window's. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowLeft, ArrowRightLeft, Banknote, BookOpen, Bookmark, Download, Box, CheckCircle2, Check, Clock, Copy, CreditCard, Eye, EyeOff, Fingerprint, Headphones,
  Languages, Laptop, Lock, MessageCircle, Moon, NotebookPen, Pencil, Printer, RotateCcw, ScanLine, Search, ShieldCheck, SlidersHorizontal, ShieldAlert, Smartphone, Sun, Tablet, Tag,
  Trash2, Undo2, User, Watch, Wrench, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import LabelSheet from '@/components/LabelSheet'
import RemoveSheet from '@/components/RemoveSheet'
import { ApiError, api, patch, post } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { isoDay, withCur } from '@/lib/format'
import { useModules, useTrade } from '@/lib/modules'
import { LOCALES, setLocale } from '@/i18n'
import { useCashAccounts, useDevice, useDeviceEvent, useDeviceHistory, useGet, useInvalidate, useParties } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { DeviceCategory, DeviceDetail, DeviceEvent, Party } from '@/lib/types'
import { PtaCheckSheet } from '@/features/stock/PtaCheck'
import { LockChecksEditor, specRows, type LockChecks } from '@/features/stock/DeviceSpecs'
import { FaultSheet, faultName } from '@/features/stock/Faults'
import { ReserveSheet } from '@/features/stock/ReserveCard'
import LockedPanel from '@/features/stock/LockedPanel'
import { LABEL_FIELDS, LABEL_LS, labelPath, loadLabelPrefs, type LabelField, type Prefs } from '@/components/LabelSheet'
import { withDocLang } from '@/lib/docLang'
import { BASE, authHeaders, downloadFile, openPrintable } from '@/lib/files'
import type { UnitMoneyData } from '@/features/stock/UnitMoney'
import type { PriceHintData } from '@/components/PriceHint'

interface LedgerRow { upfront?: string | null; kind: string; at: string | null; date: string | null; no: string | null; doc_no: string | null; party_name: string | null; method: string | null; note: string | null; out: string | null; in: string | null; cash: string | null; net_after: string }
interface Ledger { rows: LedgerRow[]; out: string; in: string; net: string; paid: string; received: string; cost: string | null; added?: string | null; net_cost?: string | null; sold_for: string | null; profit: string | null; expected: string | null }
interface UnitCost { group_id: string; at: string; source: 'unit_expense' | 'repair_cost' | 'repair_lab'; document_id: string | null; kind: string | null; note: string | null; amount: string; undone: boolean }
type Money = Omit<UnitMoneyData, 'summary'> & { ledger?: Ledger | null; costs?: UnitCost[]; summary: UnitMoneyData['summary'] & { added?: string | null; net_cost?: string | null } }
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const utc = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) || iso.length <= 10 ? iso : `${iso}Z`)
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - utc(iso).getTime()) / 86_400_000))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const IN_TYPES = ['purchased', 'transferred_in', 'sale_returned']
const CHECK_TYPES = ['verified', 'lock_checked', 'pta_checked', 'marked_faulty', 'faulty_cleared', 'reclassified', 'corrected']

type Act = { key: string; label: string; run: () => void; testid?: string }
type Drawer = null | 'note' | 'price' | 'loan' | 'cost' | 'imei' | 'retype' | 'lock' | 'expense'

export default function NewItemDetail() {
  const { id } = useParams()
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canSeeCost = role === 'owner' || role === 'manager'
  const multiShop = useAuth((s) => (s.me?.shops.length ?? 0) > 1)
  const trade = useTrade()
  const has = useModules()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { data: d, isLoading, error } = useDevice(id)
  const { data: history } = useDeviceHistory(id)
  const { data: money } = useGet<Money>(['unit-money', id ?? ''], id ? `/api/v1/devices/${id}/money` : null)
  const ev = useDeviceEvent()
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [showCost, setShowCost] = useState(true)
  const [label, setLabel] = useState(false)
  const [pta, setPta] = useState(false)
  const [faults, setFaults] = useState(false)
  const [reserve, setReserve] = useState(false)
  const [remove, setRemove] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [undoCost, setUndoCost] = useState<UnitCost | null>(null)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const hist = useMemo(() => history ?? [], [history])
  const buyEv = [...hist].reverse().find((e) => e.type === 'purchased' && e.document_type === 'purchase')
  const boughtOn = buyEv?.document_id ?? null
  const soldOn = [...hist].reverse().find((e) => e.type === 'sold' && e.document_type === 'invoice')?.document_id ?? null
  const lastFix = hist.filter((e) => buyEv && e.seq > buyEv.seq && e.type === 'corrected' && (e.data as { field?: string } | null)?.field === 'cost').pop()
  const boughtFor = lastFix ? Number((lastFix.data as { to?: string }).to ?? 0) : buyEv?.amount != null ? Number(buyEv.amount) : null
  const soldSince = !!buyEv && hist.some((e) => e.seq > buyEv.seq && e.type === 'sold')

  if (error) return <div className="min-h-dvh flex items-center justify-center text-sm text-rose-600" data-newui="1">{errText(error, ur)}</div>
  if (isLoading || !d) return <div className="min-h-dvh flex items-center justify-center bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="17"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-obsidian-900 dark:border-t-[#A3E635]" /></div>

  const cat = (d.category ?? 'phone') as DeviceCategory
  const inStock = d.status === 'in_stock'
  const opening = hist.find((e) => e.document_type === 'opening_stock')
  const canRemoveOpening = canSeeCost && inStock && !!opening && hist.every((e) => e.seq <= opening.seq || e.type === 'verified')
  const phoneLike = cat === 'phone' || !!d.cellular
  const canCost = canSeeCost && !!boughtOn && boughtFor != null && !soldSince && ['in_stock', 'faulty', 'in_repair', 'with_customer_for_approval', 'on_loan'].includes(d.status)
  const costOk = canSeeCost && showCost
  const simple = async (type: string) => { setErr(''); try { await ev.mutateAsync({ id: d.id, type }); setToast(pick(`stock.events.${type}`)) } catch (e) { setErr(errText(e, ur)) } }
  const skip = async () => { setErr(''); try { await api('POST', `/api/v1/devices/${d.id}/verification/override`, { reason: pick('purchase.skipReason') }); await inv('devices', 'device', 'history', 'dashboard') } catch (e) { setErr(errText(e, ur)) } }

  // the live page's actions, with the same conditions (DeviceDetailPage.tsx)
  const sellable = (inStock || d.status === 'faulty') && d.verification_status !== 'flagged'
  const all: (Act | null)[] = [
    sellable ? { key: 'sell', label: 'stock.sell', run: () => nav(`/new/sale/new?device=${d.id}`), testid: 'nitem-sell' } : null,
    d.verification_status === 'pending' || d.verification_status === 'flagged' || d.condition !== 'box_pack' ? { key: 'verify', label: 'stock.verify', run: () => nav(`/stock/${d.id}/verify`) } : null,
    d.verification_status === 'pending' ? { key: 'skipId', label: 'purchase.skipKnown', run: () => void skip() } : null,
    d.status === 'sold' ? { key: 'return', label: 'counter.returnJob', run: () => nav(`/return/new?device=${d.id}`), testid: 'nitem-return' } : null,
    inStock ? { key: 'loan', label: 'stock.loanOut', run: () => setDrawer('loan') } : null,
    inStock ? { key: 'faulty', label: 'stock.markFaulty', run: () => setFaults(true) } : null,
    d.status === 'faulty' ? { key: 'faultEdit', label: 'faulty.edit', run: () => setFaults(true) } : null,
    d.status === 'faulty' ? { key: 'faultyCleared', label: 'stock.faultyCleared', run: () => void simple('faulty_cleared') } : null,
    inStock || d.status === 'faulty' ? { key: 'repair', label: 'stock.sendRepair', run: () => nav(`/repairs/new?device=${d.id}`) } : null,
    d.status === 'in_repair' ? { key: 'repairBack', label: 'stock.repairReturned', run: () => void simple('repair_returned') } : null,
    d.status === 'with_customer_for_approval' ? { key: 'approvalBack', label: 'stock.approvalReturned', run: () => void simple('approval_returned') } : null,
    { key: 'sticker', label: 'label.button', run: () => setLabel(true) },
    { key: 'price', label: 'stock.changePrice', run: () => setDrawer('price') },
    { key: 'note', label: 'stock.addNote', run: () => setDrawer('note') },
    { key: 'edit', label: 'crud.editDetails', run: () => nav(`/stock/${d.id}?edit=1`) },
    canSeeCost && boughtOn ? { key: 'changeSeller', label: 'purchase.fix.partyButton', run: () => nav(`/purchases/${boughtOn}?change=1`) } : null,
    canSeeCost && boughtOn ? { key: 'changePaid', label: 'purchase.paidFix.button', run: () => nav(`/purchases/${boughtOn}?paid=1`) } : null,
    canSeeCost && boughtOn && (inStock || d.status === 'faulty') ? { key: 'returnSeller', label: 'pret.button', run: () => nav(`/purchases/${boughtOn}?return=${d.id}`) } : null,
    canCost ? { key: 'fixCost', label: 'purchase.costFix.button', run: () => setDrawer('cost') } : null,
    canSeeCost && soldOn && d.status === 'sold' ? { key: 'changeBuyer', label: 'sale.fix.button', run: () => nav(`/sales/${soldOn}?change=1`) } : null,
    canSeeCost ? { key: 'balances', label: 'bal.short', run: () => nav(`/balances?q=${encodeURIComponent(d.imei1)}`) } : null,
    canSeeCost && phoneLike ? { key: 'fixImei', label: 'stock.fixImei.button', run: () => setDrawer('imei') } : null,
    d.condition !== 'box_pack' ? { key: 'lock', label: 'devx.lock.button', run: () => setDrawer('lock') } : null,
    canSeeCost && cat !== 'laptop' ? { key: 'retype', label: 'devx.retype', run: () => setDrawer('retype') } : null,
    inStock && canSeeCost && multiShop ? { key: 'transfer', label: 'transfer.sendBranch', run: () => nav(`/new/transfers/new?device=${d.id}`) } : null,
    canRemoveOpening ? { key: 'removeOld', label: 'crud.removeOldStock', run: () => setRemove(true) } : null,
    canSeeCost && boughtOn && inStock && !soldSince ? { key: 'deletePurchase', label: 'del.deletePurchase', run: () => nav(`/purchases/${boughtOn}?delete=1`) } : null,
    canSeeCost && soldOn && d.status === 'sold' ? { key: 'deleteSale', label: 'del.deleteSale', run: () => nav(`/sales/${soldOn}?delete=1`) } : null,
  ]
  const acts = all.filter((x): x is Act => !!x)
  const act = (k: string) => acts.find((a) => a.key === k)
  const HEAD = ['sell', 'return', 'loan', 'repair']
  const moreActs = acts.filter((a) => !HEAD.includes(a.key))

  // the item's line, as the stock shows it
  const title = [d.brand_name, d.model_name, d.storage_name].filter(Boolean).join(' ')
  const cameIn = [...hist].reverse().find((e) => IN_TYPES.includes(e.type))?.at ?? d.first_seen_at
  const days = daysSince(cameIn)
  const chips = [
    d.storage_name, d.colour_name, [pick(`stock.condition.${d.condition}`), d.grade].filter(Boolean).join(' · '),
    phoneLike ? pick(`stock.pta.${d.pta_status}`) : null, d.sim_type, d.ram_gb ? `${d.ram_gb} GB RAM` : null,
    d.battery_health ? `${pick('nitem.bat')}: ${d.battery_health}%${d.battery_cycles != null ? ` (${t('nitem.cycles', { n: d.battery_cycles })})` : ''}` : null,
  ].filter(Boolean) as string[]
  const included = (d.accessories ?? []).filter((a) => a.came_with)
  const accName = (a: DeviceDetail['accessories'][number]) => (a.kind === 'other' && a.label ? a.label : pick(`stock.acc.${a.kind}`))
  const pitch = () => {
    const text = [
      `*${shop?.name ?? ''}*`, `*${title}*`, chips.length ? `${pick('nitem.pSpecs')}: ${chips.join(' | ')}` : '',
      `${pick('nitem.pIncludes')}: ${included.length ? included.map(accName).join(', ') : pick('nitem.pPhoneOnly')}`,
      d.warranty_months ? `${pick('nitem.pWarranty')}: ${t('nitem.months', { n: d.warranty_months })}` : '',
      d.asking_price ? `*${pick('nitem.pDemand')}: ${rs(d.asking_price)}*` : '', pick('nitem.pVisit'),
    ].filter(Boolean).join('\n')
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setToast(pick('nitem.pitchCopied'))
  }
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).catch(() => undefined); setToast(t('nlist.copied', { what: v })) }
  const kinds = [
    ...(trade.mobiles ? [['phone', Smartphone, 'devcat.phone'], ['tablet', Tablet, 'devcat.tablet'], ['watch', Watch, 'devcat.watch']] as const : []),
    ...(has('laptops') ? [['laptop', Laptop, 'devcat.laptop']] as const : []),
    ...(has('accessories') ? [['items', Headphones, 'nitem.items']] as const : []),
  ]
  const statusTone = inStock ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : d.status === 'sold' ? 'bg-obsidian-900 text-white border-obsidian-900 dark:bg-[#A3E635] dark:text-obsidian-950' : d.status === 'faulty' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  const mark = d.brand_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const danger = ['deletePurchase', 'deleteSale', 'removeOld'].map(act).filter((a): a is Act => !!a)
  // file 20's row: the usual corrections first, as the file orders them, then every other job
  const ROW_FIRST = ['note', 'retype', 'changePaid', 'balances', 'transfer', 'returnSeller']
  const rowActs = [...ROW_FIRST.map(act).filter((a): a is Act => !!a), ...moreActs.filter((a) => !ROW_FIRST.includes(a.key) && !danger.includes(a))]

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh" data-testid="nitem" data-newui="1" data-file="17">
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/new" className="flex items-center gap-2.5 min-w-0"><span className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span><span className="hidden sm:block min-w-0"><span className="block font-display font-extrabold text-sm truncate">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-500 truncate">{shop?.city ?? ''}</span></span></Link>
          <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/new/stock/summary'))} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1 cursor-pointer" data-testid="nitem-back"><ArrowLeft className="w-3.5 h-3.5 rtl:-scale-x-100" />{pick('nitem.back')}</button>
        </div>
        <nav className="order-3 lg:order-none w-full lg:w-auto overflow-x-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800" data-testid="nitem-kinds">
          {kinds.map(([k, Icon, l]) => {
            const on = k === cat
            return <Link key={k} to={`/new/stock/summary?kind=${k}`} aria-current={on ? 'page' : undefined} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${on ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-obsidian-800'}`}><Icon className="w-3.5 h-3.5" />{pick(l)}</Link>
          })}
        </nav>
        <div className="flex items-center gap-2">
          {canSeeCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="nitem-eye">{showCost ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden sm:inline">{pick(showCost ? 'nrep.costVisible' : 'nrep.costHidden')}</span></button> : null}
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nitem-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
        </div>
      </header>

      {/* the item, its state and the main jobs */}
      <section className="bg-white dark:bg-obsidian-900 border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="w-12 h-12 shrink-0 rounded-2xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-sm" dir="ltr">{mark}</span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="auto" data-testid="nitem-title">{title}</h1><span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border flex items-center gap-1 ${statusTone}`} data-testid="nitem-status"><span className="w-1.5 h-1.5 rounded-full bg-current" />{pick(`stock.status.${d.status}`)}</span></div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {inStock || d.status === 'faulty' ? <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-semibold flex items-center gap-1" data-testid="nitem-days"><Clock className="w-3 h-3" />{t('nitem.daysIn', { n: days })}</span> : null}
              <span className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 border ${d.verification_status === 'flagged' ? 'bg-rose-50 text-rose-700 border-rose-200' : d.verification_status === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-[#A3E635]/25 text-lime-900 dark:text-[#A3E635] border-[#A3E635]/60'}`} data-testid="nitem-idstate">{d.verification_status === 'pending' || d.verification_status === 'flagged' ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}{pick(`stock.verification.${d.verification_status}`)}</span>
              {d.reserved_party_name ? <span className="px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1" data-testid="nitem-held"><Bookmark className="w-3 h-3" />{pick('reserve.heldFor')}: <span dir="auto">{d.reserved_party_name}</span></span> : null}
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="nitem-chips">{chips.map((c) => <span key={c} className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-[11px] font-semibold text-slate-700 dark:text-slate-300" dir="auto">{c}</span>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 relative">
          {act('sell') ? <button type="button" onClick={act('sell')!.run} className="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-sm flex items-center gap-1.5 cursor-pointer" data-testid="nitem-sell"><Banknote className="w-4 h-4" />{pick('stock.sell')}</button> : null}
          {act('return') ? <button type="button" onClick={act('return')!.run} className="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-sm flex items-center gap-1.5 cursor-pointer" data-testid="nitem-return"><Undo2 className="w-4 h-4" />{pick('counter.returnJob')}</button> : null}
          {act('loan') ? <button type="button" onClick={act('loan')!.run} className={btn} data-testid="nitem-loan"><ArrowRightLeft className="w-4 h-4 text-amber-500" />{pick('stock.loanOut')}</button> : null}
          {act('repair') ? <button type="button" onClick={act('repair')!.run} className={btn} data-testid="nitem-repair"><Wrench className="w-4 h-4 text-slate-500" />{pick('stock.sendRepair')}</button> : null}
          {d.reserved_party_id ? <button type="button" onClick={async () => { setErr(''); try { await api('POST', `/api/v1/devices/${d.id}/release`, {}); await inv('device', 'devices', 'history', 'stock-status', 'unit-money') } catch (e) { setErr(errText(e, ur)) } }} className={btn} data-testid="nitem-release"><Bookmark className="w-4 h-4 text-amber-500" />{pick('reserve.release')}</button>
            : inStock ? <button type="button" onClick={() => setReserve(true)} className={btn} data-testid="nitem-reserve"><Bookmark className="w-4 h-4 text-rose-500" />{pick('reserve.title')}</button> : null}
          <button type="button" onClick={pitch} className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nitem-pitch"><MessageCircle className="w-4 h-4" />{pick('nitem.pitch')}</button>
          {canSeeCost ? <button type="button" onClick={() => setLedgerOpen(true)} className="px-3.5 py-2.5 rounded-xl bg-obsidian-950 dark:bg-slate-100 text-white dark:text-obsidian-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nitem-ledger-open"><BookOpen className="w-4 h-4 text-amber-400 dark:text-amber-600" />{pick('nitem.lg.button')}</button> : null}
        </div>
      </section>

      {/* file 20: every other job as one row of chips, the delete at its end */}
      <section className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-1.5 border-b border-slate-200/90 dark:border-slate-800 bg-white/60 dark:bg-obsidian-900/60" data-testid="nitem-actions">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 me-1">{pick('nitem.more')}:</span>
        {rowActs.map((a) => { const Icon = ACT_ICON[a.key] ?? Pencil; const warn = a.key === 'returnSeller'; return <button key={a.key} type="button" onClick={a.run} className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${warn ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300' : 'bg-white dark:bg-obsidian-850 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`} data-testid={`nitem-act-${a.key}`}><Icon className="w-3.5 h-3.5" />{pick(a.label)}</button> })}
        {danger.length ? <span className="ms-auto flex flex-wrap gap-1.5" data-testid="nitem-danger">{danger.map((a) => <button key={a.key} type="button" onClick={a.run} className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-[11px] font-extrabold text-rose-600 flex items-center gap-1 cursor-pointer" data-testid={`nitem-danger-${a.key}`}><Trash2 className="w-3.5 h-3.5" />{pick(a.label)}</button>)}</span> : null}
      </section>
      {err ? <p className="px-6 pt-3 text-xs font-bold text-rose-600" role="alert">{err}</p> : null}

      <main className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1fr_1.15fr_0.85fr] gap-5 items-start">
        <div className="space-y-5">
          <Card title="nitem.identity" dot chip={d.barcode ?? undefined} testid="nitem-identity">
            <div className="space-y-2.5">
              {d.imei1 && !/^LAP|^SN/i.test(d.imei1) && cat !== 'laptop' ? <Field k="nitem.imei1" v={d.imei1} onCopy={copy} /> : null}
              {d.imei2 ? <Field k="nitem.imei2" v={d.imei2} onCopy={copy} /> : null}
              {d.serial || cat === 'laptop' ? <Field k="nitem.serial" v={d.serial || d.imei1} onCopy={copy} /> : null}
              {d.barcode ? <Field k="nitem.barcode" v={d.barcode} onCopy={copy} /> : null}
              <Field k="nitem.shelf" v={d.location || '—'} />
              {act('fixImei') ? <button type="button" onClick={act('fixImei')!.run} className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer" data-testid="nitem-fiximei">{pick('stock.fixImei.button')}</button> : null}
            </div>
          </Card>

          <Card title="nitem.verify" side={pick('nitem.tapToCheck')} testid="nitem-verify">
            <div className="grid grid-cols-2 gap-2.5">
              {phoneLike ? <button type="button" onClick={() => setPta(true)} className={`p-3 rounded-xl text-start border cursor-pointer ${d.pta_status === 'pta_approved' ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200' : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200'}`} data-testid="nitem-pta"><div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nitem.ptaStatus')}{d.pta_status !== 'pta_approved' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}</div><div className="font-bold text-sm mt-1">{pick(`stock.pta.${d.pta_status}`)}{d.sim_time_months != null ? ` (${t('nitem.simTime', { n: d.sim_time_months })})` : ''}</div></button> : null}
              <button type="button" onClick={() => (act('lock') ? setDrawer('lock') : undefined)} className={`p-3 rounded-xl text-start border ${act('lock') ? 'cursor-pointer' : 'cursor-default'} ${d.lock_checks ? (d.lock_ok === false ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200') : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200'}`} data-testid="nitem-lock"><div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nitem.lockTitle')}<Lock className="w-3.5 h-3.5" /></div><div className="font-bold text-sm mt-1">{d.condition === 'box_pack' && !d.lock_checks ? pick('nitem.boxNoLock') : !d.lock_checks ? pick('devx.lock.none') : d.lock_ok === false ? pick('devx.lock.bad') : pick('devx.lock.ok')}</div>{d.sim_lock ? <div className="text-[11px] text-slate-500 mt-0.5">{pick(`simlock.${d.sim_lock}`) !== `simlock.${d.sim_lock}` ? pick(`simlock.${d.sim_lock}`) : d.sim_lock}{d.sim_lock_carrier ? ` · ${d.sim_lock_carrier}` : ''}</div> : null}</button>
            </div>
            <div className="mt-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-850/60 flex flex-wrap items-center justify-between gap-2" data-testid="nitem-idcheck">
              <div className="flex items-center gap-2.5 min-w-0"><span className="w-9 h-9 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center"><Fingerprint className="w-4 h-4 text-slate-500" /></span><div className="min-w-0"><div className="text-xs font-bold truncate" dir="auto">{d.source_party_name || pick('nitem.noSeller')}</div><div className="text-[11px] text-slate-500">{pick(`stock.verification.${d.verification_status}`)}</div></div></div>
              <div className="flex items-center gap-1.5">
                {act('skipId') ? <button type="button" onClick={act('skipId')!.run} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] font-bold cursor-pointer" data-testid="nitem-skip">{pick('purchase.skipKnown')}</button> : null}
                <button type="button" onClick={() => nav(`/stock/${d.id}/verify`)} className="px-3 py-1.5 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-[11px] font-extrabold cursor-pointer" data-testid="nitem-idproof">{pick(d.verification_status === 'pending' || d.verification_status === 'flagged' ? 'counter.checkNow' : 'nitem.viewProof')}</button>
              </div>
            </div>
          </Card>

          <Card title="nitem.condition" testid="nitem-condition">
            <QcMatrix d={d} canMark={inStock || d.status === 'faulty'} onToast={setToast} />
            {d.faults?.some((f) => !qcKeys(cat).includes(f)) ? <div className="flex flex-wrap gap-1.5 mb-2.5">{d.faults.filter((f) => !qcKeys(cat).includes(f)).map((f) => <span key={f} className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-[11px] font-bold text-rose-700">{faultName(f, pick)}</span>)}</div> : null}
            {d.patch_details ? <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2.5"><strong>{pick('stock.patchDetails')}:</strong> <span dir="auto">{d.patch_details}</span></p> : null}
            <div className="flex flex-wrap gap-2">
              {act('faulty') ? <button type="button" onClick={act('faulty')!.run} className={small} data-testid="nitem-faulty">{pick('stock.markFaulty')}</button> : null}
              {act('faultEdit') ? <button type="button" onClick={act('faultEdit')!.run} className={small}>{pick('faulty.edit')}</button> : null}
              {act('faultyCleared') ? <button type="button" onClick={act('faultyCleared')!.run} className={small}>{pick('stock.faultyCleared')}</button> : null}
              {act('repairBack') ? <button type="button" onClick={act('repairBack')!.run} className={small}>{pick('stock.repairReturned')}</button> : null}
              {act('approvalBack') ? <button type="button" onClick={act('approvalBack')!.run} className={small}>{pick('stock.approvalReturned')}</button> : null}
            </div>
            <div className="mt-3 [&_*]:max-w-full"><LockedPanel d={d} canManage={canSeeCost} onChanged={() => void inv('devices', 'device', 'history', 'stock-status')} /></div>
          </Card>

          <Card title="nitem.specs" testid="nitem-specs" action={<button type="button" onClick={act('edit')!.run} className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer" data-testid="nitem-edit">{pick('crud.editDetails')}</button>}>
            <div className="grid grid-cols-2 gap-2.5 empty:hidden">
              {d.storage_name ? <Spec k="nitem.storage" v={d.storage_name} /> : null}
              {d.colour_name ? <Spec k="nitem.colour" v={d.colour_name} /> : null}
              {d.ram_gb ? <Spec k="nitem.ram" v={`${d.ram_gb} GB`} /> : null}
              {d.region_code ? <Spec k="nitem.region" v={d.region_code} /> : null}
              {d.battery_health ? <Spec k="nitem.battery" v={`${d.battery_health}%${d.battery_cycles != null ? ` · ${t('nitem.cycles', { n: d.battery_cycles })}` : ''}`} /> : null}
              {d.size_mm ? <Spec k="nitem.size" v={`${d.size_mm} mm`} /> : null}
              {d.sim_type ? <Spec k="nitem.sim" v={d.sim_type} /> : null}
              {specRows(cat, d.specs, pick).map(([k, v]) => <Spec key={k} k={k} v={v} />)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 first:mt-0 first:pt-0 first:border-t-0">
              <div className="text-[11px] font-bold text-slate-500 mb-2">{pick('nitem.box')}</div>
              <div className="flex flex-wrap gap-1.5" data-testid="nitem-box">{(d.accessories ?? []).length ? d.accessories.map((a, i) => <span key={a.id ?? i} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${a.came_with ? 'bg-[#A3E635]/20 border-[#A3E635]/60 text-lime-900 dark:text-[#A3E635]' : 'bg-slate-50 dark:bg-obsidian-850 border-slate-200 dark:border-slate-700 text-slate-400 line-through'}`} dir="auto">{a.came_with ? '✓ ' : ''}{accName(a)}{a.pending_from !== 'none' ? ` · ${pick('nitem.pending')}` : ''}</span>) : <span className="text-[11px] text-slate-400">{pick('nitem.pPhoneOnly')}</span>}</div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <CostCard d={d} money={money} canSeeCost={canSeeCost} costOk={costOk} onPrice={() => setDrawer('price')} onCost={act('fixCost')?.run} onExpense={canSeeCost && OWNED.includes(d.status) ? () => setDrawer('expense') : undefined} onUndo={canSeeCost && OWNED.includes(d.status) ? (g) => setUndoCost(g) : undefined} />
          <MarketCard d={d} days={days} counting={inStock || d.status === 'faulty'} />
          <KhataCard money={money} costOk={costOk} canSeeCost={canSeeCost} />
          {money?.ledger ? <LedgerCard led={money.ledger} costOk={costOk} onOpen={() => setLedgerOpen(true)} /> : null}
          <Timeline hist={hist} costOk={costOk} />
        </div>

        <div className="space-y-5 lg:col-span-2 xl:col-span-1">
          <Card title="nitem.sticker" icon={<Tag className="w-4 h-4 text-amber-500" />} chip={pick('nitem.livePreview')} testid="nitem-sticker">
            <Sticker deviceId={d.id} canSeeCost={canSeeCost} onMore={() => setLabel(true)} />
          </Card>
          <Card title="nitem.warranty" icon={<ShieldCheck className="w-4 h-4 text-blue-500" />} testid="nitem-warranty">
            <Warranty d={d} />
          </Card>
        </div>
      </main>

      {drawer === 'note' ? <NoteDrawer id={d.id} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.noted')) }} /> : null}
      {drawer === 'price' ? <PriceDrawer d={d} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.priceSaved')) }} /> : null}
      {drawer === 'loan' ? <LoanDrawer id={d.id} title={title} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('loan.givenDone')) }} /> : null}
      {drawer === 'cost' && boughtFor != null ? <CostDrawer d={d} boughtFor={boughtFor} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.costSaved')) }} /> : null}
      {drawer === 'imei' ? <ImeiDrawer d={d} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.imeiSaved')) }} /> : null}
      {drawer === 'retype' ? <RetypeDrawer d={d} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.typeSaved')) }} /> : null}
      {drawer === 'expense' ? <ExpenseDrawer d={d} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('nitem.ex.saved')) }} /> : null}
      {undoCost ? <UndoCostWindow deviceId={d.id} cost={undoCost} onClose={() => setUndoCost(null)} onDone={() => { setUndoCost(null); setToast(pick('nitem.ex.undone')) }} /> : null}
      {drawer === 'lock' ? <LockDrawer d={d} onClose={() => setDrawer(null)} onDone={() => { setDrawer(null); setToast(pick('devx.lock.ok')) }} /> : null}
      {ledgerOpen && money?.ledger ? <LedgerWindow id={d.id} title={title} shopName={shop?.name ?? ''} led={money.ledger} onClose={() => setLedgerOpen(false)} onToast={setToast} /> : null}
      <LabelSheet kind="devices" ids={[d.id]} open={label} onClose={() => setLabel(false)} />
      <PtaCheckSheet imei={d.imei1} open={pta} onClose={() => setPta(false)} deviceId={d.id} onSaved={() => void inv('devices', 'device', 'history')} />
      <FaultSheet open={faults} onClose={() => setFaults(false)} deviceId={d.id} current={d.faults} />
      <ReserveSheet open={reserve} onClose={() => setReserve(false)} onSave={async (b) => { await api('POST', `/api/v1/devices/${d.id}/reserve`, b); await inv('device', 'devices', 'history', 'stock-status', 'unit-money'); setToast(pick('nitem.reserved')) }} />
      <RemoveSheet open={remove} onClose={() => setRemove(false)} title="crud.removeOldStock" warn="oldStock" reason name={<span dir="ltr">{d.imei1}</span>} onConfirm={async (reason) => { await post(`/api/v1/devices/${d.id}/cancel-opening`, { reason }); await inv() }} />
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nitem-toast">{toast}</span></div></div>
    </div>
  )
}

const btn = 'px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:border-slate-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer'
const small = 'px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-obsidian-900 text-[11px] font-bold cursor-pointer'

/** file 20's chips: an icon per job */
const ACT_ICON: Record<string, typeof Tag> = {
  note: NotebookPen, retype: Tag, changePaid: CreditCard, balances: Banknote, transfer: ArrowRightLeft, returnSeller: RotateCcw,
  verify: ScanLine, skipId: ShieldCheck, faulty: AlertTriangle, faultEdit: AlertTriangle, faultyCleared: ShieldCheck, repairBack: Wrench,
  approvalBack: RotateCcw, sticker: Printer, price: Tag, edit: Pencil, changeSeller: User, fixCost: CreditCard, changeBuyer: User,
  fixImei: Fingerprint, lock: Lock,
}

export function Card({ title, children, dot, chip, side, icon, action, testid }: { title: string; children: ReactNode; dot?: boolean; chip?: string; side?: string; icon?: ReactNode; action?: ReactNode; testid?: string }) {
  const { pick } = useLang()
  return (
    <section className="p-5 rounded-3xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs" data-testid={testid}>
      <div className="flex items-center justify-between gap-2 mb-4"><h2 className="flex items-center gap-2 text-xs font-display font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{dot ? <span className="w-2 h-2 rounded-full bg-emerald-500" /> : null}{icon}{pick(title)}</h2>{chip ? <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-obsidian-850 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300" dir="ltr">{chip}</span> : side ? <span className="text-[11px] text-slate-400">{side}</span> : action}</div>
      {children}
    </section>
  )
}
export function Field({ k, v, onCopy }: { k: string; v: string; onCopy?: (v: string) => void }) {
  const { pick } = useLang()
  return <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick(k)}</div><div className="font-mono text-sm mt-0.5 truncate" dir="ltr">{v}</div></div>{onCopy ? <button type="button" onClick={() => onCopy(v)} className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" />{pick('nitem.copy')}</button> : null}</div>
}
export function Spec({ k, v }: { k: string; v: string }) {
  const { pick } = useLang()
  return <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick(k)}</div><div className="text-sm font-bold mt-0.5" dir="auto">{v}</div></div>
}

/** cost & margin (mock-ups 17 / 20): the buying price, what was added to the unit since (expenses, repairs)
 *  and the true net cost, each the server's (`/devices/{id}/money`); the expected / made profit is the
 *  server's item ledger's. Cost only for owner / manager. */
function CostCard({ d, money, canSeeCost, costOk, onPrice, onCost, onExpense, onUndo }: { d: DeviceDetail; money?: Money; canSeeCost: boolean; costOk: boolean; onPrice: () => void; onCost?: () => void; onExpense?: () => void; onUndo?: (c: UnitCost) => void }) {
  const { pick } = useLang()
  const s = money?.summary
  const led = money?.ledger
  const hide = (v: string | number | null | undefined) => (costOk ? rs(v) : '••••••')
  const sold = d.status === 'sold' && s?.sold_for != null
  const profitV = sold ? led?.profit ?? s?.margin ?? null : led?.expected ?? null
  const profit = num(profitV)
  const costs = (money?.costs ?? []).filter((c) => !c.undone)
  return (
    <Card title="nitem.cost" dot testid="nitem-cost" action={onExpense ? <button type="button" onClick={onExpense} className="px-3 py-1.5 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-[11px] font-extrabold cursor-pointer" data-testid="nitem-add-expense">+ {pick('nitem.ex.add')}</button> : undefined}>
      {canSeeCost ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="flex items-center justify-between gap-1 text-[11px] text-slate-500">{pick('nitem.base')}{onCost ? <button type="button" onClick={onCost} className="underline cursor-pointer" data-testid="nitem-fixcost">{pick('nitem.edit')}</button> : null}</div><div className="font-display font-extrabold text-base mt-1" dir="ltr" data-testid="nitem-c-cost">{hide(s?.cost ?? d.cost_price)}</div></div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="text-[11px] text-slate-500">{pick('nitem.added')}</div><div className="font-display font-extrabold text-base mt-1 text-amber-600" dir="ltr" data-testid="nitem-c-added">+{hide(s?.added ?? 0)}</div></div>
            <div className="p-3 rounded-xl bg-obsidian-900 text-white dark:bg-obsidian-800"><div className="text-[11px] text-slate-300">{pick('nitem.netCost')}</div><div className="font-display font-extrabold text-base mt-1 text-[#A3E635]" dir="ltr" data-testid="nitem-c-net">{hide(s?.net_cost ?? d.cost_price)}</div></div>
          </div>
          {costs.length ? (
            <div className="mt-2.5 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800" data-testid="nitem-costs">
              {costs.map((c) => (
                <div key={c.group_id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs" data-testid="nitem-cost-row">
                  <div className="min-w-0"><div className="font-bold">{c.source === 'unit_expense' ? pick(`nitem.ex.k.${c.kind ?? 'other'}`) : pick(`nitem.ex.src.${c.source}`)}</div><div className="text-[10px] text-slate-400 truncate" dir="auto">{fmtDate(c.at)}{c.note ? ` · ${c.note}` : ''}</div></div>
                  <div className="flex items-center gap-2 shrink-0"><span className="font-mono font-bold text-amber-700 dark:text-amber-400" dir="ltr">+{hide(c.amount)}</span>{onUndo && c.source === 'unit_expense' ? <button type="button" onClick={() => onUndo(c)} aria-label={pick('crud.delete')} className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer" data-testid="nitem-cost-undo"><Trash2 className="w-3.5 h-3.5" /></button> : null}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>{pick('nitem.paidOut')}: <strong className="text-emerald-700 dark:text-emerald-400" dir="ltr" data-testid="nitem-c-paid">{hide(s?.paid_out)}</strong></span><span>{pick('nitem.stillOwed')}: <strong className="text-slate-800 dark:text-slate-200" dir="ltr" data-testid="nitem-c-owed">{hide(s?.payable)}</strong></span></div>
        </>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button type="button" onClick={onPrice} className="p-4 rounded-xl text-start bg-[#A3E635]/15 border border-[#A3E635]/70 cursor-pointer" data-testid="nitem-asking"><div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">{pick(sold ? 'nitem.soldFor' : 'nitem.asking')}<span className="underline">{pick('nitem.edit')}</span></div><div className="font-display font-extrabold text-2xl mt-1" dir="ltr">{rs(sold ? s?.sold_for : d.asking_price)}</div>{s?.original_asking && s.original_asking !== s.asking_price && !sold ? <div className="text-[10px] text-slate-500 mt-0.5">{pick('nitem.firstAsking')}: <span dir="ltr">{rs(s.original_asking)}</span></div> : null}</button>
        {canSeeCost ? <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800" data-testid="nitem-profit"><div className="text-[11px] font-bold text-slate-500">{pick(sold ? 'nitem.profitMade' : 'nitem.profitExpected')}</div><div className={`font-display font-extrabold text-2xl mt-1 ${profit < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr">{profitV == null ? '—' : costOk ? `${profit < 0 ? '−' : '+'}${rs(profit)}` : '••••••'}</div>{sold ? <div className="text-[10px] text-slate-500 mt-0.5">{pick('nitem.received')}: <span dir="ltr">{rs(s?.received)}</span>{num(s?.receivable) ? <> · {pick('nitem.toGet')}: <span dir="ltr">{rs(s?.receivable)}</span></> : null}</div> : <div className="text-[10px] text-slate-500 mt-0.5">{pick('nitem.afterExpenses')}</div>}</div> : null}
      </div>
    </Card>
  )
}

/** the sticker ticks only a phone has (as the live sticker window, `LabelSheet`) */
const DEVICE_ONLY: readonly string[] = ['specs', 'ram', 'battery', 'cycles', 'serial', 'last4', 'condition', 'pta']
const OWNED = ['in_stock', 'faulty', 'in_repair', 'on_loan', 'with_customer_for_approval']
const EXPENSE_KINDS = ['parts', 'screen_guard', 'cleaning', 'transport', 'software', 'other'] as const

/** "+ Add expense": money spent on this unit, paid from a cash account, added to its cost (the server posts it) */
function ExpenseDrawer({ d, onClose, onDone }: { d: DeviceDetail; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data: accounts } = useCashAccounts()
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<(typeof EXPENSE_KINDS)[number]>('parts')
  const [note, setNote] = useState('')
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/devices/${d.id}/expenses`, { amount: Number(amount), kind, note: note.trim() || undefined, cash_account_id: account || undefined }); await inv('device', 'devices', 'history', 'unit-money', 'accounts', 'dashboard', 'day'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Shell title="nitem.ex.title" sub="nitem.ex.sub" onClose={onClose} testid="nitem-expense-drawer" foot={<button type="button" disabled={busy || !(Number(amount) > 0)} onClick={() => void save()} className={go} data-testid="nitem-expense-save">{pick('common.save')}</button>}>
      <div><label className={lbl}>{pick('nitem.ex.amount')}</label><input type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className={`${inp} font-mono font-extrabold text-lg`} dir="ltr" data-testid="nitem-expense-amount" /></div>
      <div><label className={lbl}>{pick('nitem.ex.what')}</label><div className="flex flex-wrap gap-1.5">{EXPENSE_KINDS.map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${kind === k ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`} data-testid={`nitem-expense-${k}`}>{pick(`nitem.ex.k.${k}`)}</button>)}</div></div>
      <div><label className={lbl}>{pick('nitem.ex.from')}</label><select value={account} onChange={(e) => setAccount(e.target.value)} className={inp} data-testid="nitem-expense-account"><option value="">{pick('nitem.ex.defaultCash')}</option>{(accounts ?? []).filter((a) => a.kind !== 'cheque' && a.kind !== 'remittance').map((a) => <option key={a.id} value={a.id}>{ur ? a.name_ur || a.name : a.name}</option>)}</select></div>
      <div><label className={lbl}>{pick('common.notes')}</label><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inp} dir="auto" data-testid="nitem-expense-note" /></div>
      <p className="text-[11px] text-slate-500">{pick('nitem.ex.rule')}</p>
      <Err e={err} />
    </Shell>
  )
}

function UndoCostWindow({ deviceId, cost, onClose, onDone }: { deviceId: string; cost: UnitCost; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Shell title="nitem.ex.undoTitle" sub="nitem.ex.undoSub" onClose={onClose} testid="nitem-expense-undo" foot={<button type="button" disabled={busy || why.trim().length < 3} onClick={async () => { setBusy(true); setErr(''); try { await api('POST', `/api/v1/devices/${deviceId}/expenses/${cost.group_id}/undo`, { reason: why.trim() }); await inv('device', 'devices', 'history', 'unit-money', 'accounts'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-display font-extrabold text-sm cursor-pointer" data-testid="nitem-expense-undo-yes">{pick('crud.delete')}</button>}>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between text-xs"><span>{pick(`nitem.ex.k.${cost.kind ?? 'other'}`)}</span><strong className="font-mono" dir="ltr">{rs(cost.amount)}</strong></div>
      <div><label className={lbl}>{pick('common.reason')}</label><input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} className={inp} dir="auto" data-testid="nitem-expense-undo-why" /></div>
      <Err e={err} />
    </Shell>
  )
}

/** QC matrix (mock-ups 17 / 20) drawn from the unit's own faults: a check passes while that fault is
 *  not marked; tapping it marks / clears the fault through the live "faulty" events (the unit becomes
 *  faulty with its first fault and back in stock when the last is cleared). */
const QC: Record<string, string[]> = {
  phone: ['display', 'touch', 'camera', 'face_id', 'fingerprint', 'battery', 'charging', 'speaker', 'mic', 'network', 'wifi', 'buttons', 'body', 'water'],
  tablet: ['display', 'touch', 'camera', 'battery', 'charging', 'speaker', 'mic', 'wifi', 'buttons', 'body'],
  watch: ['display', 'touch', 'battery', 'charging', 'buttons', 'body', 'water'],
  laptop: ['display', 'battery', 'charging', 'speaker', 'wifi', 'ram', 'storage', 'board', 'buttons', 'body'],
}
const qcKeys = (cat: string) => QC[cat] ?? QC.phone
function QcMatrix({ d, canMark, onToast }: { d: DeviceDetail; canMark: boolean; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const ev = useDeviceEvent()
  const inv = useInvalidate()
  const [err, setErr] = useState('')
  const keys = qcKeys(d.category ?? 'phone')
  const faults = d.faults ?? []
  const passing = keys.filter((k) => !faults.includes(k)).length
  async function flip(k: string) {
    if (!canMark || ev.isPending) return
    setErr('')
    const next = faults.includes(k) ? faults.filter((f) => f !== k) : [...faults, k]
    try {
      if (next.length) await ev.mutateAsync({ id: d.id, type: 'marked_faulty', data: { faults: next } })
      else await ev.mutateAsync({ id: d.id, type: 'faulty_cleared' })
      await inv('stock-status', 'device-options')
      onToast(pick(faults.includes(k) ? 'nitem.qc.cleared' : 'nitem.qc.marked'))
    } catch (e) { setErr(errText(e, ur)) }
  }
  return (
    <div className="mb-3" data-testid="nitem-qc">
      <div className="flex items-center justify-between mb-2"><span className="text-[11px] text-slate-500">{pick(canMark ? 'nitem.qc.hint' : 'nitem.qc.readOnly')}</span><span className={`font-display font-extrabold text-sm ${passing === keys.length ? 'text-emerald-600' : 'text-amber-600'}`} data-testid="nitem-qc-score">{passing} / {keys.length}</span></div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden mb-3"><div className={`h-full rounded-full ${passing === keys.length ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${(passing / keys.length) * 100}%` }} /></div>
      <div className="grid grid-cols-2 gap-2">
        {keys.map((k) => {
          const bad = faults.includes(k)
          return (
            <button key={k} type="button" disabled={!canMark || ev.isPending} onClick={() => void flip(k)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-start text-xs disabled:cursor-default cursor-pointer hover:border-slate-400" data-testid={`nitem-qc-${k}`}>
              <span className="truncate">{faultName(k, pick)}</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${bad ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700'}`}>{pick(bad ? 'nitem.qc.issue' : 'nitem.qc.pass')}</span>
            </button>
          )
        })}
      </div>
      <Err e={err} />
    </div>
  )
}

/** days in the shop and what the same model sold for here (the server's price hint) */
function MarketCard({ d, days, counting }: { d: DeviceDetail; days: number; counting: boolean }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const q = new URLSearchParams({ model_id: d.model_id })
  if (d.storage_id) q.set('storage_id', d.storage_id)
  q.set('condition', d.condition)
  q.set('exclude_device_id', d.id)
  const { data: h } = useGet<PriceHintData>(['price-hint', q.toString()], `/api/v1/devices/price-hint?${q}`)
  const target = h?.avg_days_to_sell ? Math.max(1, Math.round(h.avg_days_to_sell)) : null
  const slow = target != null && days > target
  const width = Math.min(100, target ? (days / (target * 2)) * 100 : Math.min(100, days * 3))
  return (
    <Card title="nitem.market" testid="nitem-market" action={counting ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${slow ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{pick(slow ? 'nitem.slow' : 'nitem.fresh')}</span> : undefined}>
      {counting ? (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 mb-3" data-testid="nitem-age">
          <div className="flex items-center justify-between text-xs"><span className="font-bold">{t('nitem.daysIn', { n: days })}</span>{target ? <span className="text-slate-500">{t('nitem.usually', { n: target })}</span> : null}</div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-obsidian-850 overflow-hidden"><div className={`h-full rounded-full ${slow ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${width}%` }} /></div>
        </div>
      ) : null}
      {h && (h.samples || h.in_stock_same) ? (
        <>
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-2">{t('nitem.soldHere', { n: h.samples })}</div>
          <div className="grid grid-cols-3 gap-2.5" data-testid="nitem-range">
            <Mk k="nitem.low" v={h.low} />
            <Mk k="nitem.mid" v={h.median} lit />
            <Mk k="nitem.high" v={h.high} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {h.last ? <span>{pick('nitem.lastSold')}: <strong className="text-slate-700 dark:text-slate-200" dir="ltr">{rs(h.last.price)}</strong> · <span dir="ltr">{fmtDate(h.last.date)}</span></span> : null}
            {h.in_stock_same ? <span>{t('nitem.sameInStock', { n: h.in_stock_same })}{h.stock_asking_low ? <> · <span dir="ltr">{rs(h.stock_asking_low)}{h.stock_asking_high && h.stock_asking_high !== h.stock_asking_low ? ` – ${rs(h.stock_asking_high)}` : ''}</span></> : null}</span> : null}
          </div>
        </>
      ) : <p className="text-[11px] text-slate-400">{pick('nitem.noMarket')}</p>}
    </Card>
  )
}
function Mk({ k, v, lit }: { k: string; v: string | null; lit?: boolean }) {
  const { pick } = useLang()
  return <div className={`p-3 rounded-xl text-center border ${lit ? 'bg-[#A3E635]/15 border-[#A3E635]/70' : 'border-slate-200 dark:border-slate-800'}`}><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick(k)}</div><div className="font-display font-extrabold text-sm mt-1" dir="ltr">{v != null ? rs(v) : '—'}</div></div>
}

/** the purchase (and the sale) this unit is on, with what was paid and what is left */
function KhataCard({ money, costOk, canSeeCost }: { money?: UnitMoneyData; costOk: boolean; canSeeCost: boolean }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const sides = [money?.purchase, money?.sale].filter(Boolean) as NonNullable<UnitMoneyData['purchase']>[]
  const src = money?.summary.source
  return (
    <Card title="nitem.khata" testid="nitem-khata" action={money?.purchase ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${num(money.purchase.remaining) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{pick(num(money.purchase.remaining) ? 'nitem.owed' : 'nitem.settled')}</span> : undefined}>
      {!sides.length ? <p className="text-[11px] text-slate-500">{pick(src === 'opening_stock' ? 'nitem.fromOpening' : src === 'branch' ? 'nitem.fromBranch' : 'nitem.noBill')}</p> : (
        <div className="space-y-2.5">
          {sides.map((s) => (
            <div key={s.doc_id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800" data-testid={`nitem-side-${s.doc_type}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0"><span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-obsidian-850 flex items-center justify-center"><User className="w-4 h-4 text-slate-500" /></span><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick(s.doc_type === 'purchase' ? 'nitem.boughtFrom' : 'nitem.soldTo')}</div><div className="font-bold text-sm truncate" dir="auto">{s.party_name || pick('nitem.walkIn')}</div><div className="font-mono text-[10px] text-slate-500" dir="ltr">{s.no} · {fmtDate(s.date)}</div></div></div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {s.party_id ? <button type="button" onClick={() => nav(`/new/parties/${s.party_id}`)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer" data-testid="nitem-ledger">{pick('nitem.ledgerBtn')}</button> : null}
                  <button type="button" onClick={() => nav(s.doc_type === 'purchase' ? `/purchases/${s.doc_id}` : `/sales/${s.doc_id}`)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer">{pick('nitem.bill')}</button>
                </div>
              </div>
              {s.doc_type === 'invoice' || canSeeCost ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-[11px] text-slate-500">{pick('nitem.agreed')}</div><div className="font-bold mt-0.5" dir="ltr">{s.doc_type === 'invoice' || costOk ? rs(s.line_total) : '••••'}</div></div>
                  <div><div className="text-[11px] text-slate-500">{pick('nitem.paid')}</div><div className="font-bold mt-0.5 text-emerald-700" dir="ltr">{s.doc_type === 'invoice' || costOk ? rs(s.paid) : '••••'}</div></div>
                  <div><div className="text-[11px] text-slate-500">{pick('nitem.balance')}</div><div className={`font-bold mt-0.5 ${num(s.remaining) ? 'text-amber-700' : ''}`} dir="ltr">{s.doc_type === 'invoice' || costOk ? rs(s.remaining) : '••••'}</div></div>
                </div>
              ) : null}
              {s.shared_bill ? <p className="mt-2 text-[10px] text-slate-400">{pick('nitem.sharedBill')}</p> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** the unit's own events (`/devices/{id}/history`), newest first */
function Timeline({ hist, costOk }: { hist: DeviceEvent[]; costOk: boolean }) {
  const { pick } = useLang()
  const [f, setF] = useState<'all' | 'money' | 'checks'>('all')
  const rows = [...hist].reverse().filter((e) => (f === 'all' ? true : f === 'money' ? e.amount != null : CHECK_TYPES.includes(e.type)))
  const evName = (type: string) => { const k = `stock.events.${type}`; const v = pick(k); return v === k ? type.replace(/_/g, ' ') : v }
  const showAmount = (e: DeviceEvent) => e.amount != null && (costOk || !['purchased', 'transferred_in', 'corrected'].includes(e.type))
  return (
    <Card title="nitem.timeline" testid="nitem-timeline" action={<div className="flex items-center gap-1">{(['all', 'money', 'checks'] as const).map((k) => <button key={k} type="button" onClick={() => setF(k)} aria-pressed={f === k} className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer ${f === k ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'text-slate-500'}`} data-testid={`nitem-tl-${k}`}>{pick(`nitem.tl.${k}`)}</button>)}</div>}>
      <div className="space-y-2">
        {rows.length ? rows.slice(0, 30).map((e) => (
          <div key={e.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2" data-testid="nitem-event">
            <div className="flex items-start gap-2.5 min-w-0"><span className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 dark:bg-obsidian-850 flex items-center justify-center">{e.type === 'verified' ? <ScanLine className="w-3.5 h-3.5 text-blue-600" /> : e.type === 'note' ? <NotebookPen className="w-3.5 h-3.5 text-slate-500" /> : e.amount != null ? <Banknote className="w-3.5 h-3.5 text-emerald-600" /> : <Box className="w-3.5 h-3.5 text-slate-500" />}</span><div className="min-w-0"><div className="text-xs font-bold" dir="auto">{evName(e.type)}{e.party_name ? <span className="font-normal"> — {e.party_name}</span> : null}</div><div className="text-[11px] text-slate-500" dir="auto">{[typeof e.data?.note === 'string' ? e.data.note : null, showAmount(e) ? rs(e.amount) : null, e.user_name].filter(Boolean).join(' · ')}</div></div></div>
            <span className="text-[10px] text-slate-400 shrink-0" dir="ltr">{fmtDate(e.at)}</span>
          </div>
        )) : <p className="text-[11px] text-slate-400">{pick('nitem.noEvents')}</p>}
      </div>
    </Card>
  )
}

/** mock-up 20: the unit's own ledger — every line is the server's (`/devices/{id}/money` → `ledger`) */
function LedgerCard({ led, costOk, onOpen }: { led: Ledger; costOk: boolean; onOpen: () => void }) {
  const { pick } = useLang()
  const hide = (v: string | null) => (costOk ? (v == null ? '—' : rs(v)) : '••••')
  const signed = (v: string) => (costOk ? `${num(v) < 0 ? '−' : '+'}${rs(v)}` : '••••')
  return (
    <Card title="nitem.lg.title" testid="nitem-ledger" action={<button type="button" onClick={onOpen} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-obsidian-800 flex items-center gap-1 cursor-pointer" data-testid="nitem-ledger-a4"><Printer className="w-3 h-3" />{pick('nitem.lg.a4')}</button>}>
      <p className="-mt-3 mb-3 text-[11px] text-slate-500">{pick('nitem.lg.sub')}</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2.5 rounded-xl text-center bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900"><div className="text-[10px] font-bold uppercase text-rose-700">{pick('nitem.lg.out')}</div><div className="font-display font-extrabold text-sm text-rose-700 dark:text-rose-300 mt-0.5" dir="ltr" data-testid="nitem-lg-out">{hide(led.out)}</div></div>
        <div className="p-2.5 rounded-xl text-center bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900"><div className="text-[10px] font-bold uppercase text-emerald-700">{pick('nitem.lg.in')}</div><div className="font-display font-extrabold text-sm text-emerald-700 dark:text-emerald-300 mt-0.5" dir="ltr" data-testid="nitem-lg-in">{hide(led.in)}</div></div>
        <div className="p-2.5 rounded-xl text-center bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800"><div className="text-[10px] font-bold uppercase text-slate-500">{pick('nitem.lg.net')}</div><div className="font-display font-extrabold text-sm mt-0.5" dir="ltr" data-testid="nitem-lg-net">{signed(led.net)}</div></div>
      </div>
      <LedgerTable rows={led.rows} costOk={costOk} />
    </Card>
  )
}
function LedgerTable({ rows, costOk }: { rows: LedgerRow[]; costOk: boolean }) {
  const { pick } = useLang()
  const cell = (v: string | null) => (v == null ? '—' : costOk ? rs(v) : '••••')
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
      <table className="w-full text-xs" data-testid="nitem-lg-rows">
        <thead><tr className="bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase tracking-wider text-slate-500"><th className="py-2 px-2.5 text-start">{pick('nitem.lg.date')}</th><th className="py-2 px-2.5 text-start">{pick('nitem.lg.what')}</th><th className="py-2 px-2.5 text-end">{pick('nitem.lg.outCol')}</th><th className="py-2 px-2.5 text-end">{pick('nitem.lg.inCol')}</th><th className="py-2 px-2.5 text-end">{pick('nitem.lg.netCol')}</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length ? rows.map((r, i) => (
            <tr key={i} data-testid="nitem-lg-row">
              <td className="py-2 px-2.5 whitespace-nowrap"><div className="font-semibold" dir="ltr">{r.date ? fmtDate(r.date) : ''}</div><div className="font-mono text-[10px] text-slate-400" dir="ltr">{r.no || r.doc_no || ''}</div></td>
              <td className="py-2 px-2.5"><div className="font-semibold">{pick(`nitem.lg.k.${r.kind}`)}</div><div className="text-[10px] text-slate-400" dir="auto">{[r.party_name, r.method ? pick(`nitem.lg.m.${r.method}`) !== `nitem.lg.m.${r.method}` ? pick(`nitem.lg.m.${r.method}`) : r.method : null, r.note, r.cash != null ? (costOk ? rs(r.cash) : '••••') : null, num(r.upfront) > 0 ? `${pick(r.kind === 'purchase' ? 'nitem.lg.paidNow' : 'nitem.lg.gotNow')}: ${costOk ? rs(r.upfront) : '••••'}` : null].filter(Boolean).join(' · ')}</div></td>
              <td className="py-2 px-2.5 text-end font-mono font-semibold text-rose-600 whitespace-nowrap" dir="ltr">{cell(r.out)}</td>
              <td className="py-2 px-2.5 text-end font-mono font-semibold text-emerald-600 whitespace-nowrap" dir="ltr">{cell(r.in)}</td>
              <td className={`py-2 px-2.5 text-end font-mono font-bold whitespace-nowrap ${num(r.net_after) >= 0 ? 'text-emerald-600 dark:text-[#A3E635]' : ''}`} dir="ltr">{costOk ? `${num(r.net_after) < 0 ? '−' : '+'}${rs(r.net_after)}` : '••••'}</td>
            </tr>
          )) : <tr><td colSpan={5} className="py-3 px-2.5 text-slate-400">{pick('nitem.noEvents')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/** the item ledger sheet: the server's A4 page as its own preview, printed, downloaded (CSV) or summed up for WhatsApp */
function LedgerWindow({ id, title, shopName, led, onClose, onToast }: { id: string; title: string; shopName: string; led: Ledger; onClose: () => void; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const path = `/api/v1/devices/${id}/ledger-sheet`
  useEffect(() => {
    let live = true
    fetch(`${BASE}${withDocLang(path)}`, { headers: authHeaders() }).then((r) => r.text()).then((h) => { if (live) setHtml(h) }).catch((e) => setErr(String(e)))
    return () => { live = false }
  }, [path])
  const share = () => {
    const text = t('nitem.lg.shareText', { shop: shopName, item: title, out: rs(led.out), in: rs(led.in), net: `${num(led.net) < 0 ? '−' : '+'}${rs(led.net)}` })
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    onToast(pick('nitem.lg.shared'))
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-5 bg-black/75 overflow-y-auto" data-testid="nitem-ledger-window">
      <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-obsidian-850 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5"><BookOpen className="w-5 h-5 text-amber-500" /><div><h3 className="font-display font-extrabold text-sm">{pick('nitem.lg.windowTitle')}</h3><p className="text-[11px] text-slate-500">{pick('nitem.lg.windowSub')}</p></div></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => { setErr(''); downloadFile(withDocLang(`${path}?format=csv`), 'item-ledger.csv').catch((e) => setErr(errText(e, ur))) }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer" data-testid="nitem-lg-csv"><Download className="w-3.5 h-3.5" />{pick('nitem.lg.csv')}</button>
            <button type="button" onClick={share} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer" data-testid="nitem-lg-share"><MessageCircle className="w-3.5 h-3.5" />{pick('nitem.lg.share')}</button>
            <button type="button" onClick={() => { setErr(''); openPrintable(path).catch((e) => setErr(errText(e, ur))) }} className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950 flex items-center gap-1 cursor-pointer" data-testid="nitem-lg-print"><Printer className="w-3.5 h-3.5" />{pick('nitem.lg.print')}</button>
            <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer" data-testid="nitem-lg-close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <Err e={err} />
        <div className="bg-slate-100 dark:bg-obsidian-950 p-3 sm:p-5">{html ? <iframe title={pick('nitem.lg.windowTitle')} srcDoc={html} sandbox="" className="w-full h-[75vh] rounded-lg bg-white border-0 shadow" data-testid="nitem-lg-frame" /> : <div className="h-40 flex items-center justify-center text-xs text-slate-400">…</div>}</div>
      </div>
    </div>
  )
}

/** the 50×30 sticker as the server draws it (the live sticker preview's request, `preview=1` so no print is
 *  recorded), its ticks remembered on this device like the live sticker window; size and copies there */
export function Sticker({ deviceId, canSeeCost, onMore, kind = 'devices' }: { deviceId: string; canSeeCost: boolean; onMore: () => void; kind?: 'devices' | 'items' }) {
  const { pick, ur } = useLang()
  const { data: shopFull } = useGet<{ label_prefs: Partial<Prefs> | null }>(['shop-full'], '/api/v1/shops/current')
  const [p, setP] = useState<Prefs>(() => loadLabelPrefs(null))
  useEffect(() => { setP(loadLabelPrefs(shopFull?.label_prefs)) }, [shopFull?.label_prefs])
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const path = labelPath(kind, [deviceId], { ...p, copies: 1 })
  useEffect(() => {
    let live = true
    const x = setTimeout(() => { fetch(`${BASE}${withDocLang(`${path}&preview=1`)}`, { headers: authHeaders() }).then((r) => r.text()).then((h) => { if (live) setHtml(h) }).catch(() => undefined) }, 250)
    return () => { live = false; clearTimeout(x) }
  }, [path])
  const keep = (next: Prefs) => { setP(next); try { localStorage.setItem(LABEL_LS, JSON.stringify(next)) } catch { /* private window */ } }
  const fields = LABEL_FIELDS.filter((f) => (canSeeCost || (f !== 'code' && f !== 'pcode')) && (kind === 'devices' || !DEVICE_ONLY.includes(f)))
  const toggle = (f: LabelField) => keep({ ...p, fields: p.fields.includes(f) ? p.fields.filter((y) => y !== f) : [...p.fields, f] })
  return (
    <>
      <div className="rounded-xl bg-slate-50 dark:bg-obsidian-850/70 border border-dashed border-slate-300 dark:border-slate-700 p-3 flex items-center justify-center min-h-[150px]">{html ? <iframe title={pick('nitem.sticker')} srcDoc={html} className="h-[160px] w-full border-0 rounded-lg bg-white" sandbox="" data-testid="nitem-sticker-frame" /> : <span className="text-xs text-slate-400">…</span>}</div>
      <div className="text-[11px] font-bold text-slate-500 mt-3 mb-2">{pick('dview.stickerFields')}</div>
      <div className="flex flex-wrap gap-1.5" data-testid="nitem-sticker-fields">{fields.map((f) => { const on = p.fields.includes(f); return <button key={f} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${on ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 border-obsidian-900 dark:border-[#A3E635]' : 'bg-white dark:bg-obsidian-850 text-slate-500 border-slate-200 dark:border-slate-700'}`} data-testid={`nitem-sf-${f}`}>{on ? <Check className="w-3 h-3 stroke-[3]" /> : <span className="text-slate-400">+</span>}{pick(`label.f.${f}`)}</button> })}</div>
      {kind === 'devices' && p.fields.includes('barcode') ? <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-bold text-slate-500">{pick('label.bar')}</span>{(['imei', 'code'] as const).map((b) => <button key={b} type="button" role="radio" aria-checked={p.bar === b} onClick={() => keep({ ...p, bar: b })} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${p.bar === b ? 'bg-slate-200 dark:bg-obsidian-800' : 'text-slate-500'}`}>{pick(b === 'imei' ? 'label.barImei' : 'label.barCode')}</button>)}</div> : null}
      <Err e={err} />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" disabled={!p.fields.length} onClick={() => { setErr(''); openPrintable(labelPath(kind, [deviceId], p)).catch((e) => setErr(errText(e, ur))) }} className="py-3 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50" data-testid="nitem-print"><Printer className="w-4 h-4" />{pick('nitem.printSticker')}</button>
        <button type="button" onClick={onMore} aria-label={pick('dview.stickerMore')} title={pick('dview.stickerMore')} className="px-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center cursor-pointer" data-testid="nitem-sticker-more"><SlidersHorizontal className="w-4 h-4" /></button>
      </div>
    </>
  )
}

function Warranty({ d }: { d: DeviceDetail }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  if (!d.warranty_months) return <p className="text-xs text-slate-500" data-testid="nitem-nowarranty">{pick('nitem.noWarranty')}</p>
  const start = d.warranty_start ? utc(d.warranty_start) : null
  const end = start ? new Date(start.getFullYear(), start.getMonth() + d.warranty_months, start.getDate()) : null
  const left = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{pick(`nitem.wBy.${d.warranty_by ?? 'shop'}`)}</span><span className="text-sm font-extrabold text-emerald-600" data-testid="nitem-wleft">{left == null ? t('nitem.months', { n: d.warranty_months }) : left > 0 ? t('nitem.daysLeft', { n: left }) : pick('nitem.expired')}</span></div>
      <div className="text-[11px] text-slate-500 mt-1">{end ? <>{pick('nitem.until')} <span dir="ltr">{fmtDate(end.toISOString().slice(0, 10))}</span></> : pick('nitem.startsOnSale')}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- drawers */

export function Shell({ title, sub, onClose, children, foot, testid }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot: ReactNode; testid: string }) {
  const { pick } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid={testid}>
      <div className="w-full max-w-md h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div><h3 className="font-display font-extrabold text-sm">{pick(title)}</h3>{sub ? <p className="text-[11px] text-slate-500">{pick(sub)}</p> : null}</div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">{foot}</div>
      </div>
    </div>
  )
}
export const inp = 'w-full px-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]'
export const lbl = 'block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5'
export const go = 'w-full py-3 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer'
export const Err = ({ e }: { e: string }) => (e ? <p className="text-[11px] font-bold text-rose-600" role="alert">{e}</p> : null)

function NoteDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const ev = useDeviceEvent()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  return (
    <Shell title="stock.addNote" sub="nitem.noteSub" onClose={onClose} testid="nitem-note-drawer" foot={<button type="button" disabled={!text.trim() || ev.isPending} onClick={async () => { try { await ev.mutateAsync({ id, type: 'note', note: text.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } }} className={go} data-testid="nitem-note-save">{pick('common.save')}</button>}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={500} autoFocus className={inp} dir="auto" data-testid="nitem-note-text" />
      <Err e={err} />
    </Shell>
  )
}

function PriceDrawer({ d, onClose, onDone }: { d: DeviceDetail; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [text, setText] = useState(String(num(d.asking_price) || ''))
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [perr, setPerr] = useState<ApiError | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const q = new URLSearchParams({ model_id: d.model_id })
  if (d.storage_id) q.set('storage_id', d.storage_id)
  q.set('condition', d.condition)
  q.set('exclude_device_id', d.id)
  const { data: h } = useGet<PriceHintData>(['price-hint', q.toString()], `/api/v1/devices/price-hint?${q}`)
  const low = d.cost_price != null && text !== '' && Number(text) < Number(d.cost_price)
  const needPin = !!perr && (perr.code === 'pin_required' || perr.code === 'pin_wrong')
  async function save() {
    setBusy(true); setErr('')
    try { await patch(`/api/v1/devices/${d.id}`, { asking_price: Number(text), asking_reason: reason || undefined, approval_pin: pin || undefined }); await inv('devices', 'device', 'unit-money', 'history'); onDone() } catch (e) { if (e instanceof ApiError) { setPerr(e); if (!['pin_required', 'pin_wrong', 'approval_required'].includes(e.code ?? '')) setErr(errText(e, ur)) } else setErr(String(e)) } finally { setBusy(false) }
  }
  return (
    <Shell title="stock.changePrice" sub="nitem.priceSub" onClose={onClose} testid="nitem-price-drawer" foot={<button type="button" disabled={busy || low || !(Number(text) > 0)} onClick={() => void save()} className={go} data-testid="nitem-price-save">{pick('common.save')}</button>}>
      <div><label className={lbl}>{pick('stock.asking')}</label><input type="number" min={0} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoFocus className={`${inp} font-mono font-extrabold text-lg`} dir="ltr" data-testid="nitem-price-input" />{low ? <p className="text-[11px] font-bold text-rose-600 mt-1">{pick('field.askingBelowCost')}</p> : null}</div>
      {h && (h.low || h.median || h.high || h.suggested) ? <div><div className={lbl}>{pick('nitem.useA')}</div><div className="flex flex-wrap gap-1.5">{([['nitem.low', h.low], ['nitem.mid', h.median], ['nitem.high', h.high], ['nitem.suggested', h.suggested]] as const).filter(([, v]) => v).map(([k, v]) => <button key={k} type="button" onClick={() => setText(String(Math.round(num(v))))} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold cursor-pointer">{pick(k)}: <span dir="ltr">{rs(v)}</span></button>)}</div></div> : null}
      <div><label className={lbl}>{pick('confirm.reason')}</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={inp} dir="auto" maxLength={200} /></div>
      {needPin ? <div><label className={lbl}>{pick('confirm.ownerPin')}</label><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${inp} font-mono tracking-[.3em]`} dir="ltr" data-testid="nitem-price-pin" /><p className="text-[11px] font-bold text-rose-600 mt-1">{pick(perr?.code === 'pin_wrong' ? 'confirm.pinWrong' : 'confirm.pinNeeded')}</p></div> : null}
      {perr?.code === 'approval_required' ? <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">{pick('confirm.blocked')}</p> : null}
      <Err e={err} />
    </Shell>
  )
}

function LoanDrawer({ id, title, onClose, onDone }: { id: string; title: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [pq, setPq] = useState('')
  const { data: people } = useParties(pq.trim() ? { q: pq.trim() } : {})
  const [party, setParty] = useState<Party | null>(null)
  const [days, setDays] = useState<number | null>(7)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function give() {
    if (!party) return
    setBusy(true); setErr('')
    try { await api('POST', '/api/v1/loans', { device_id: id, party_id: party.id, expected_back_at: days ? isoDay(days) : undefined, notes: notes.trim() || undefined }); await inv('loans', 'devices', 'device', 'history'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const pill = (on: boolean) => `px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${on ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`
  return (
    <Shell title="stock.loanOut" sub="loan.giveHint" onClose={onClose} testid="nitem-loan-drawer" foot={<>{party ? <p className="text-[11px] text-slate-500 mb-2" dir="auto">{title} → {party.name}</p> : null}<button type="button" disabled={busy || !party} onClick={() => void give()} className={go} data-testid="nitem-loan-save">{pick('loan.new')}</button></>}>
      <div>
        <label className={lbl}>1. {pick('loan.whichShop')}</label>
        <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={pq} onChange={(e) => setPq(e.target.value)} placeholder={pick('nlist.partySearch')} className={`${inp} ps-8`} data-testid="nitem-loan-q" /></div>
        <div className="mt-2 max-h-56 overflow-y-auto space-y-1.5" data-testid="nitem-loan-people">{(people ?? []).slice(0, 10).map((p) => <button key={p.id} type="button" onClick={() => setParty(p)} className={`w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border ${party?.id === p.id ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-slate-50 dark:bg-obsidian-850' : 'border-slate-200 dark:border-slate-800'}`}><span className="font-bold truncate" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone ?? ''}</span></button>)}</div>
      </div>
      <div>
        <label className={lbl}>2. {pick('loan.backIn')}</label>
        <div className="flex flex-wrap gap-1.5">{[3, 7, 15, 30].map((n) => <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n} className={pill(days === n)}>{pick('loan.days').replace('{{n}}', String(n))}</button>)}<button type="button" onClick={() => setDays(null)} aria-pressed={days === null} className={pill(days === null)}>{pick('loan.noDate')}</button></div>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={pick('nloan.notePh')} className={inp} dir="auto" />
      <Err e={err} />
    </Shell>
  )
}

function CostDrawer({ d, boughtFor, onClose, onDone }: { d: DeviceDetail; boughtFor: number; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [cost, setCost] = useState(String(boughtFor))
  const [mode, setMode] = useState<'' | 'paid' | 'khata'>('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const diff = cost !== '' ? Number(cost) - boughtFor : 0
  async function save() {
    setBusy(true); setErr('')
    try { await api('POST', '/api/v1/purchases/cost', { device_id: d.id, cost: Number(cost), reason: reason.trim(), mode }); await inv('devices', 'device', 'history', 'unit-money', 'purchases', 'parties', 'balances'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Shell title="purchase.costFix.title" sub="purchase.costFix.hint" onClose={onClose} testid="nitem-cost-drawer" foot={<button type="button" disabled={busy || reason.trim().length < 2 || cost === '' || Number(cost) < 0 || diff === 0 || !mode} onClick={() => void save()} className={go} data-testid="nitem-cost-save">{pick('common.save')}</button>}>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between text-xs"><span className="text-slate-500">{pick('purchase.costFix.now')}</span><strong className="font-mono" dir="ltr">{rs(boughtFor)}</strong></div>
      <div><label className={lbl}>{pick('purchase.costFix.new')}</label><input type="number" min={0} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} autoFocus className={`${inp} font-mono font-extrabold`} dir="ltr" data-testid="nitem-cost-input" /></div>
      {diff !== 0 ? (
        <div className="space-y-2" data-testid="nitem-cost-mode">
          <div className={lbl}>{pick('purchase.costFix.why')}</div>
          {(['paid', 'khata'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`w-full p-3 rounded-xl text-start border cursor-pointer ${mode === m ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-slate-50 dark:bg-obsidian-850' : 'border-slate-200 dark:border-slate-800'}`} data-testid={`nitem-cost-${m}`}><span className="block text-xs font-bold">{pick(`purchase.costFix.mode.${m}`)}</span><span className="block text-[11px] text-slate-500">{pick(`purchase.costFix.mode.${m}Hint`)}</span></button>)}
        </div>
      ) : null}
      {diff !== 0 && mode ? <p className={`p-3 rounded-xl text-xs font-bold ${diff > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`} data-testid="nitem-cost-effect">{pick(mode === 'khata' ? (diff > 0 ? 'purchase.costFix.more' : 'purchase.costFix.less') : (diff > 0 ? 'purchase.costFix.cashOut' : 'purchase.costFix.cashBack')).replace('{{n}}', withCur(Math.abs(diff).toLocaleString('en-US'))).replace('{{who}}', d.source_party_name ?? '')}</p> : null}
      <div><label className={lbl}>{pick('common.reason')}</label><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inp} dir="auto" data-testid="nitem-cost-reason" /></div>
      <Err e={err} />
    </Shell>
  )
}

function ImeiDrawer({ d, onClose, onDone }: { d: DeviceDetail; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [i1, setI1] = useState(d.imei1)
  const [i2, setI2] = useState(d.imei2 ?? '')
  const [clear2, setClear2] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = reason.trim().length >= 2 && i1.length === 15 && (clear2 || i2 === '' || i2.length === 15)
  async function save() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/devices/${d.id}/correct-imei`, { imei1: i1 !== d.imei1 ? i1 : undefined, imei2: !clear2 && i2 && i2 !== d.imei2 ? i2 : undefined, clear_imei2: clear2, reason: reason.trim() }); await inv('devices', 'device', 'history', 'unit-money'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Shell title="stock.fixImei.title" sub="stock.fixImei.hint" onClose={onClose} testid="nitem-imei-drawer" foot={<button type="button" disabled={busy || !ok} onClick={() => void save()} className={go} data-testid="nitem-imei-save">{pick('common.save')}</button>}>
      <div><label className={lbl}>{pick('nitem.imei1')}</label><input value={i1} onChange={(e) => setI1(e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" className={`${inp} font-mono`} dir="ltr" data-testid="nitem-imei1" /></div>
      {!clear2 ? <div><label className={lbl}>{pick('nitem.imei2')}</label><input value={i2} onChange={(e) => setI2(e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" className={`${inp} font-mono`} dir="ltr" /></div> : null}
      {d.imei2 ? <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={clear2} onChange={(e) => setClear2(e.target.checked)} className="w-4 h-4 accent-[#A3E635]" />{pick('stock.fixImei.clear2')}</label> : null}
      <div><label className={lbl}>{pick('common.reason')}</label><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inp} dir="auto" data-testid="nitem-imei-reason" /></div>
      <Err e={err} />
    </Shell>
  )
}

function RetypeDrawer({ d, onClose, onDone }: { d: DeviceDetail; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const cur = (d.category ?? 'phone') as DeviceCategory
  const [to, setTo] = useState<DeviceCategory>(cur === 'phone' ? 'tablet' : 'phone')
  const [preview, setPreview] = useState<{ problems: string[] }[] | null>(null)
  const [err, setErr] = useState('')
  const problems = preview?.[0]?.problems ?? []
  return (
    <Shell title="devx.retype" sub="devx.retypeHint" onClose={onClose} testid="nitem-retype-drawer" foot={!preview
      ? <button type="button" onClick={async () => { setErr(''); try { setPreview(await post(`/api/v1/devices/reclassify/preview`, { device_ids: [d.id], to_category: to })) } catch (e) { setErr(errText(e, ur)) } }} className={go} data-testid="nitem-retype-preview">{pick('devx.retypePreview')}</button>
      : <button type="button" disabled={!!problems.length} onClick={async () => { setErr(''); try { await post(`/api/v1/devices/reclassify/apply`, { device_ids: [d.id], to_category: to }); await inv('devices', 'device', 'history'); onDone() } catch (e) { setErr(errText(e, ur)) } }} className={go} data-testid="nitem-retype-apply">{pick('devx.retypeApply')}</button>}>
      <div className={lbl}>{pick('devx.retypeTo')}</div>
      <div className="grid grid-cols-2 gap-2">{(['phone', 'tablet', 'watch'] as DeviceCategory[]).filter((c) => c !== cur).map((c) => <button key={c} type="button" aria-pressed={to === c} onClick={() => { setTo(c); setPreview(null) }} className={`py-3 rounded-xl text-xs font-bold cursor-pointer border ${to === c ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-slate-50 dark:bg-obsidian-850' : 'border-slate-200 dark:border-slate-800'}`}>{pick(`devcat.${c}`)}</button>)}</div>
      {preview ? <p className={`p-3 rounded-xl text-xs font-bold ${problems.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{problems.length ? problems.map((p) => pick(`devx.problem.${p}`)).join(ur ? '، ' : ', ') : pick('nitem.retypeOk')}</p> : null}
      <Err e={err} />
    </Shell>
  )
}

function LockDrawer({ d, onClose, onDone }: { d: DeviceDetail; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [locks, setLocks] = useState<LockChecks>(d.lock_checks ?? {})
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  return (
    <Shell title="devx.lock.title" sub="devx.lock.hint" onClose={onClose} testid="nitem-lock-drawer" foot={<button type="button" disabled={!Object.keys(locks).length} onClick={async () => { setErr(''); try { await post(`/api/v1/devices/${d.id}/lock-check`, { checks: locks, note: note || null }); await inv('devices', 'device', 'history'); onDone() } catch (e) { setErr(errText(e, ur)) } }} className={go} data-testid="nitem-lock-save">{pick('common.save')}</button>}>
      <LockChecksEditor category={(d.category ?? 'phone') as DeviceCategory} value={locks} onChange={setLocks} />
      <div><label className={lbl}>{pick('devx.lock.note')}</label><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inp} dir="auto" /></div>
      <Err e={err} />
    </Shell>
  )
}
