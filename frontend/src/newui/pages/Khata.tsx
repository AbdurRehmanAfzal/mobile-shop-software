/** A person's khata in the new product (ADR-134), drawn from `21-party-khata-full-ledger.html` (the
 *  full version of `06-person-khata.html`, which this screen was first built from): the file's top bar
 *  (back, the people with an open balance one tap apart, the profit eye, the full ledger report,
 *  language, dark), the person with their dates (opened, first and last dealing, the promised date of an
 *  open len-den with Change) and the four buttons (money received, money paid, old balance, WhatsApp
 *  khata), four cards (the balance with the old opening, their phones in the shop / sold / returned,
 *  money by channel, the profit from them), and the tabs: the complete account ledger with Fix / Edit on
 *  every line, the stock & sales tracker, the brand & model breakdown, the payment method log, and
 *  len-den & the old balance.
 *
 *  Everything is the live software's: the balance and the ledger are the server's statement
 *  (`/ledger/parties/{id}/statement`), the phones, models, channels, old balance and promise are
 *  `/parties/{id}/khata` (read-only, derived from the documents and the ledger), the profit and the
 *  money totals the shop audit's journey (owner / manager), len-den `/payments/lending/{id}`, the old
 *  balance `/ledger/parties/{id}/opening-balance(s)` (ADR-110). Money in / out is a payment
 *  (`POST /payments`), len-den a payment with `purpose = lending` (docs/32), an old balance the opening
 *  balance against capital. The full report is the server's A4 page (`/parties/{id}/khata-report`).
 *
 *  Differences from the drawing: "Fix / Edit" opens the live correction for that kind of entry (change
 *  the customer / dealer / what was paid, delete with a reason) — a line is never edited in place
 *  (ADR-090, the ledger is append-only); an entry has a date but no time of its own; "Download report"
 *  is the live statement's PDF; profit, cost and what was paid out are for the owner / manager only. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, BookOpen, FileSpreadsheet, Landmark, BookOpenCheck, CalendarCheck, CheckCircle2, Copy, Download, Eye, EyeOff,
  FileText, History, Languages, MessageCircle, Moon, MoreHorizontal, Pencil, Phone, Printer, Search,
  Smartphone, Sun, Tag, Trash2, Undo2, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { newPay, payInfo, type PayState } from '@/components/PayPicker'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { BASE, authHeaders, downloadFile, openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { isoDay, withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate, useParties, useParty, useStatement } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Party, PartyKind, StatementRow } from '@/lib/types'
import { ALL_BANKS, POPULAR_BANKS } from '@/lib/pkPayments'

type M = string
type Tab = 'ledger' | 'items' | 'models' | 'methods' | 'lenden'
type Kind = 'bill' | 'lenden' | 'old'
type Mode = 'cash' | 'online' | 'wallet'
interface Journey {
  sold: { bills: number; phones: number; value: M; profit: M | null }
  bought: { bills: number; phones: number; value: M | null }
  money: { received_total: M; paid_total: M | null }
  returns: { sale: { count: number; amount: M }; purchase: { count: number; amount: M } }
  timeline: { date: string; kind: string; no: string; id: string; ref_id?: string; amount: M; status?: string; devices: { label: string; imei1: string }[] }[]
}
interface LendEntry { id: string; no: string; direction: 'in' | 'out'; amount: M; open: M; date: string; method: string; notes: string | null; status: string; due_date: string | null }
interface Lending { lending: M; entries: LendEntry[] }
interface KhataUnit { role: 'bought_from' | 'sold_to'; state: 'in_shop' | 'sold' | 'returned' | 'other' | 'sold_to'; device_id: string; label: string; brand_name: string | null; model_name: string | null; storage_name: string | null; imei1: string | null; doc_id: string; no: string; date: string; days_in_shop: number | null; cost: M | null; sold_for: M | null; sold_no: string | null; profit: M | null; remaining?: M }
interface Pile { count: number; cost: M | null }
interface KhataFile {
  created_at: string; balance: M; old_balance: M | null
  promise: { date: string; side: string; entries: string[] } | null
  stock: { bought: number; in_shop: Pile; sold: Pile & { value: M; profit: M | null }; returned: Pile; other: Pile; dearest: { label: string; cost: M | null; device_id: string } | null; sold_to: number }
  units: KhataUnit[]
  models: { brand_name: string | null; model_name: string | null; bought: number; in_shop: number; sold: number; returned: number; sold_to: number; highest_cost: M | null; total_cost: M | null }[]
  channels: { method: string; in: M; out: M | null; count: number }[]
  money_in: M; money_out: M | null
  payments: { id: string; no: string; date: string; direction: 'in' | 'out'; method: string; amount: M | null; purpose: string; reference: string | null; notes: string | null }[]
}
interface Old { group_id: string; at: string; amount: M; party_owes: boolean; memo: string | null; deleted: boolean }

const n0 = (v: number | string) => Math.round(Math.abs(Number(v || 0))).toLocaleString('en-US')
const rs = (v: number | string) => withCur(n0(v))
const WALLETS = ['JazzCash', 'Easypaisa', 'SadaPay', 'NayaPay', 'UPaisa']

export default function NewKhata() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: people } = useParties({})
  // `/new/khata` with nobody chosen opens the person with the biggest open balance
  useEffect(() => {
    if (id || !people?.length) return
    const first = [...people].sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)))[0]
    nav(`/new/parties/${first.id}`, { replace: true })
  }, [id, people, nav])
  if (!id) return <div className="min-h-dvh bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="21" data-testid="nkh-wait">{people && !people.length ? <Nobody /> : null}</div>
  return <Person key={id} id={id} people={people ?? []} />
}

function Nobody() {
  const { pick } = useLang()
  return (
    <div className="min-h-dvh flex items-center justify-center p-8 text-center" data-testid="nkh-nobody">
      <div className="max-w-sm rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8 space-y-3">
        <p className="font-bold text-sm">{pick('nkh.nobody')}</p>
        <a href="/parties" className="inline-block px-3.5 py-2 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 text-xs font-bold">{pick('nkh.directory')}</a>
      </div>
    </div>
  )
}

function Person({ id, people }: { id: string; people: Party[] }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const { data: party } = useParty(id)
  const { data: st } = useStatement(id)
  const { data: journey } = useGet<Journey>(['party-journey', id, null], canCost ? `/api/v1/shop-audit/parties/${id}/journey` : null)
  const { data: lending } = useGet<Lending>(['party-lending', id], `/api/v1/payments/lending/${id}`)
  const { data: olds } = useGet<Old[]>(['old-balances', id], canCost ? `/api/v1/ledger/parties/${id}/opening-balances` : null)
  const { data: kh } = useGet<KhataFile>(['party-khata', id], `/api/v1/parties/${id}/khata`)

  const [profit, setProfit] = useState(true)
  const [tab, setTab] = useState<Tab>('ledger')
  const [q, setQ] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [toast, setToast] = useState('')
  const [more, setMore] = useState(false)
  const [wa, setWa] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [undoing, setUndoing] = useState<{ kind: 'old' | 'lend'; id: string } | null>(null)
  const [fixing, setFixing] = useState<StatementRow | null>(null)
  const [report, setReport] = useState(false)
  const [promising, setPromising] = useState(false)
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])

  /* the entry window */
  const [drawer, setDrawer] = useState(false)
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [kind, setKind] = useState<Kind>('bill')
  const [mode, setMode] = useState<Mode>('cash')
  const [bank, setBank] = useState('')
  const [ref, setRef] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [idem, setIdem] = useState(uid)
  const amountRef = useRef<HTMLInputElement>(null)
  const open = (d: 'in' | 'out', k: Kind) => { setDir(d); setKind(k === 'old' && !canCost ? 'bill' : k); setDrawer(true); setErr(''); setTimeout(() => amountRef.current?.focus(), 30) }

  /* keys */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F6: '/new/stock/summary', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const bal = Number(party?.balance ?? 0)
  const rows = useMemo(() => st?.rows ?? [], [st])
  const query = q.trim().toLowerCase()
  const docName = (dt: string): string => { if (dt.startsWith('reversal:')) return `${pick('nkf.reversedOf')}: ${docName(dt.slice(9))}`; const k = `nkh.doc.${dt}`; const v = pick(k); return v === k ? dt.replace(/_/g, ' ') : v }
  const rowType = (r: StatementRow): string => (r.reversed || r.document_type === 'correction' || r.document_type.startsWith('reversal:') || r.document_type.endsWith('_void') || r.document_type.endsWith('_change') ? 'mistake' : r.document_type === 'invoice' ? 'sale' : r.document_type === 'purchase' ? 'purchase' : r.document_type === 'payment' || r.document_type === 'lending' ? (Number(r.credit) > 0 ? 'payment_in' : 'payment_out') : r.document_type.includes('return') ? 'return' : 'other')
  const ledgerRows = rows.filter((r) => (type === 'all' || ['unsold', 'sold', 'returned'].includes(type) || rowType(r) === type) && (!query || (r.memo ?? '').toLowerCase().includes(query) || docName(r.document_type).toLowerCase().includes(query) || String(Number(r.debit) + Number(r.credit)).includes(query.replace(/[,\s]/g, ''))))
  const units = kh?.units ?? []
  const unitRows = units.filter((u) => (type === 'all' || !['unsold', 'sold', 'returned'].includes(type) || (type === 'unsold' ? u.state === 'in_shop' : type === 'sold' ? u.state === 'sold' || u.state === 'sold_to' : u.state === 'returned')) && (!query || `${u.label} ${u.imei1 ?? ''} ${u.no} ${u.sold_no ?? ''}`.toLowerCase().includes(query)))
  const modelRows = (kh?.models ?? []).filter((m) => !query || `${m.brand_name ?? ''} ${m.model_name ?? ''}`.toLowerCase().includes(query))
  const payRows = (kh?.payments ?? []).filter((p) => !query || `${p.no} ${p.method} ${p.reference ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(query))
  const lendRows = (lending?.entries ?? []).filter((x) => !query || x.no.toLowerCase().includes(query) || (x.notes ?? '').toLowerCase().includes(query))
  const oldRows = (olds ?? []).filter((x) => !query || (x.memo ?? '').toLowerCase().includes(query))
  const liveRows = rows.filter((r) => !r.reversed)
  const firstAt = liveRows[0]?.at
  const lastAt = liveRows[liveRows.length - 1]?.at

  async function save() {
    const v = Number(amount)
    if (!party || !(v > 0)) { setErr(pick('nkh.needAmount')); amountRef.current?.focus(); return }
    const wallet = mode === 'wallet'
    if ((mode === 'online' || wallet) && !bank) { setErr(pick(wallet ? 'nkh.pickWallet' : 'nkh.pickBank')); return }
    setBusy(true); setErr('')
    try {
      if (kind === 'old') {
        await api('POST', `/api/v1/ledger/parties/${party.id}/opening-balance`, { amount: v, party_owes: dir === 'out', memo: note.trim() || undefined })
      } else {
        const pay: PayState = mode === 'cash' ? newPay('cash') : { ...newPay('online'), bank, reference: ref }
        await api('POST', '/api/v1/payments', { party_id: party.id, direction: dir, amount: v, payment: payInfo(pay), notes: note.trim() || undefined, purpose: kind === 'lenden' ? 'lending' : undefined, due_date: kind === 'lenden' && due ? due : undefined, date: day || undefined }, { idempotencyKey: idem })
      }
      await inv('party', 'parties', 'statement', 'party-journey', 'party-lending', 'old-balances', 'party-units', 'party-khata', 'payments', 'dashboard', 'day', 'balances', 'accounts')
      setToast(t('nkh.saved', { n: rs(v), who: party.name }))
      setDrawer(false); setAmount(''); setNote(''); setRef(''); setDue(''); setDay(''); setIdem(uid())
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally { setBusy(false) }
  }

  if (!party) return <div className="min-h-dvh bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="21" />

  const name = ur ? party.name_ur || party.name : party.name
  const initials = party.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const shopMark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const switcher = (() => {
    const list = [...people].filter((p) => Number(p.balance) !== 0).sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance))).slice(0, 6)
    return list.some((p) => p.id === party.id) ? list : [party, ...list.slice(0, 5)]
  })()
  const tabBtn = (k: Tab, label: string, count?: number) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nkh-tab-${k}`}
      className={`px-3.5 py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1.5 whitespace-nowrap ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 shadow-2xs' : 'font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-obsidian-800'}`}>
      <span>{pick(label)}</span>{count != null ? <span className={`px-1.5 rounded-md text-[10px] font-mono ${tab === k ? 'bg-white/20 dark:bg-obsidian-950/20' : 'bg-white dark:bg-obsidian-900'}`} dir="ltr">{count}</span> : null}
    </button>
  )
  const segOn = 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950'
  const segOff = 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
  const balTone = bal > 0 ? 'amber' : bal < 0 ? 'rose' : 'emerald'
  const statusPill = bal > 0 ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
    : bal < 0 ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
      : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  const waText = [
    t('nkh.waHead', { shop: '', who: party.name }).trim(),
    bal > 0 ? t('nkh.waOwesUs', { n: rs(bal) }) : bal < 0 ? t('nkh.waWeOwe', { n: rs(bal) }) : pick('nkh.waClear'),
    journey ? t('nkh.waFlow', { inn: rs(journey.money.received_total), out: rs(journey.money.paid_total ?? 0) }) : '',
  ].filter(Boolean).join('\n')
  const s = kh?.stock
  const profitShown = (v: string | null | undefined) => (v == null ? '—' : profit ? `${Number(v) < 0 ? '−' : '+'}${rs(v)}` : '••••')
  const fact = (label: string, value: ReactNode, testid?: string) => <span className="flex items-center gap-1" data-testid={testid}><span className="text-slate-500 dark:text-slate-400">{pick(label)}:</span><strong className="text-slate-800 dark:text-slate-200">{value}</strong></span>
  const sep = <span className="text-slate-300 dark:text-slate-700">|</span>

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh" data-testid="nkh" data-newui="1" data-file="21">
      {/* ===== THE BAR: shop, back, the people with an open balance, eye, full report, language, dark ===== */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/85 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <NavLink to="/new" className="flex items-center gap-2.5 shrink-0"><span className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-[#9AE600] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs" dir="ltr">{shopMark}</span><span className="hidden md:block"><span className="block font-display font-extrabold text-sm leading-tight">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-500">{pick('nkf.smart')}</span></span></NavLink>
          <a href="/parties" className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 shrink-0" data-testid="nkh-back"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('nkf.back')}</span></a>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 overflow-x-auto min-w-0" data-testid="nkh-switcher">
            {switcher.map((p) => {
              const on = p.id === party.id
              const b = Number(p.balance)
              return (
                <button key={p.id} type="button" onClick={() => nav(`/new/parties/${p.id}`)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${on ? 'bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 shadow-2xs' : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-obsidian-800'}`}>
                  <span dir="auto">{ur ? p.name_ur || p.name : p.name}</span>
                  <span className="text-[10px] opacity-80">({pick(b > 0 ? 'nkf.lene' : b < 0 ? 'nkf.dene' : 'nkh.clear')})</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCost ? <button type="button" onClick={() => setProfit(!profit)} className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${profit ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-slate-50 dark:bg-obsidian-850 border-slate-200 dark:border-slate-700 text-slate-500'}`} data-testid="nkh-eye">{profit ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}<span className="hidden sm:inline">{pick(profit ? 'nkf.profitVisible' : 'nkf.profitHidden')}</span></button> : null}
          <button type="button" onClick={() => setReport(true)} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nkh-report"><FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nkf.fullReport')}</span></button>
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nkh-lang"><Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="p-2 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#9AE600]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}</button>
        </div>
      </header>

      {/* ===== THE PERSON, THEIR DATES AND THE FOUR BUTTONS ===== */}
      <section className="bg-white dark:bg-obsidian-900 border-b border-slate-200/85 dark:border-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-obsidian-900 dark:bg-[#9AE600] text-[#9AE600] dark:text-obsidian-950 font-display font-extrabold text-base flex items-center justify-center shrink-0" dir="ltr">{initials}</div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`${ur ? `ur font-extrabold ${cls('lg')}` : 'font-display font-extrabold text-lg sm:text-xl tracking-tight'} text-slate-900 dark:text-white`} dir="auto" data-testid="nkh-name">{name}</h1>
                {party.kinds.map((k) => <span key={k} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">{pick(`party.${k}`)}</span>)}
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusPill}`} data-testid="nkh-status">{bal > 0 ? `${rs(bal)} • ${pick('nkh.willGet')}` : bal < 0 ? `${rs(bal)} • ${pick('nkh.willGive')}` : pick('nkh.settledPill')}</span>
                <button type="button" onClick={() => setEditing(true)} className="px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-850 flex items-center gap-1 cursor-pointer" data-testid="nkh-edit"><Pencil className="w-3 h-3" />{pick('nkf.editProfile')}</button>
                <div className="relative">
                  <button type="button" onClick={() => setMore(!more)} aria-label={pick('nkh.moreOptions')} className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-obsidian-850 cursor-pointer" data-testid="nkh-more"><MoreHorizontal className="w-4 h-4" /></button>
                  {more ? (
                    <div className="absolute start-0 top-full mt-1 z-30 w-56 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1">
                      <a href={`/parties/${party.id}`} className="w-full px-3.5 py-2 text-start text-xs font-bold hover:bg-slate-50 dark:hover:bg-obsidian-850 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /><span>{pick('nkh.openClassic')}</span></a>
                      {canCost ? <><div className="my-1 border-t border-slate-100 dark:border-slate-800" /><button type="button" onClick={() => { setMore(false); setRemoving(true) }} className="w-full px-3.5 py-2 text-start text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer" data-testid="nkh-delete"><Trash2 className="w-3.5 h-3.5" /><span>{pick('nkh.deletePerson')}</span></button></> : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]" data-testid="nkh-facts">
                {party.phone ? <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-rose-500" /><span className="font-mono font-bold" dir="ltr">{party.phone}</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(party.phone ?? '').catch(() => undefined); setToast(t('nlist.copied', { what: party.phone })) }} className="text-blue-600 hover:underline cursor-pointer">{pick('nkf.copy')}</button></span> : null}
                {party.phone ? sep : null}
                {fact('nkf.created', <span dir="ltr">{fmtDate(kh?.created_at ?? party.created_at)}</span>)}
                {firstAt ? <>{sep}{fact('nkf.firstDeal', <span dir="ltr" className="text-emerald-700 dark:text-emerald-400">{fmtDate(firstAt)}</span>)}</> : null}
                {lastAt ? <>{sep}{fact('nkf.lastDeal', <span dir="ltr">{fmtDate(lastAt)}</span>)}</> : null}
                {kh?.promise ? <>{sep}<span className="flex items-center gap-1 text-amber-700 dark:text-amber-300" data-testid="nkh-promise"><CalendarCheck className="w-3 h-3" />{pick('nkf.promise')}: <strong dir="ltr">{fmtDate(kh.promise.date)}</strong><button type="button" onClick={() => setPromising(true)} className="underline cursor-pointer" data-testid="nkh-promise-change">{pick('nkf.change')}</button></span></> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <button type="button" onClick={() => open('in', 'bill')} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-start flex items-center gap-2 cursor-pointer" data-testid="nkh-in"><ArrowDownLeft className="w-4 h-4" /><span><span className="block font-display font-extrabold text-xs">{pick('nkf.received')}</span><span className="block text-[10px] opacity-85">{pick('nkf.receivedSub')}</span></span></button>
            <button type="button" onClick={() => open('out', 'bill')} className="px-4 py-2.5 rounded-xl bg-obsidian-900 dark:bg-slate-100 hover:opacity-95 text-white dark:text-obsidian-950 text-start flex items-center gap-2 cursor-pointer" data-testid="nkh-out"><ArrowUpRight className="w-4 h-4" /><span><span className="block font-display font-extrabold text-xs">{pick('nkf.paid')}</span><span className="block text-[10px] opacity-85">{pick('nkf.paidSub')}</span></span></button>
            {canCost ? <button type="button" onClick={() => open('out', 'old')} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-start flex items-center gap-2 cursor-pointer" data-testid="nkh-old"><History className="w-4 h-4 text-amber-600" /><span><span className="block font-display font-bold text-xs">{pick('nkf.old')}</span><span className="block text-[10px] text-slate-500">{pick('nkf.oldSub')}</span></span></button> : null}
            <button type="button" onClick={() => setWa(true)} className="px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-obsidian-900 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-2 cursor-pointer" data-testid="nkh-wa"><MessageCircle className="w-4 h-4" />{pick('nkf.waKhata')}</button>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* ===== FOUR CARDS: the balance, their stock, the channels, the profit ===== */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className={`p-5 rounded-2xl border-2 flex flex-col justify-between ${balTone === 'amber' ? 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-300 dark:border-amber-800' : balTone === 'rose' ? 'bg-rose-50/80 dark:bg-rose-950/25 border-rose-300 dark:border-rose-800' : 'bg-white dark:bg-obsidian-900 border-emerald-400/50'}`} data-testid="nkh-balance">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-extrabold uppercase tracking-wider ${balTone === 'amber' ? 'text-amber-800 dark:text-amber-300' : balTone === 'rose' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700'}`}>{pick(bal > 0 ? 'nkf.toGet' : bal < 0 ? 'nkf.toGive' : 'nkf.settled')}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${balTone === 'amber' ? 'bg-amber-500' : balTone === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}>{pick(bal > 0 ? 'nkf.theyOwe' : bal < 0 ? 'nkf.weOwe' : 'nkh.clear')}</span>
            </div>
            <div className={`font-display font-extrabold text-3xl tracking-tight mt-3 ${balTone === 'amber' ? 'text-amber-700 dark:text-amber-300' : balTone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-[#9AE600]'}`} dir="ltr" data-testid="nkh-bal">{rs(bal)}</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-2">{kh?.old_balance != null ? <>{pick('nkf.oldOpening')}: <span dir="ltr">{rs(kh.old_balance)}</span> · </> : null}{t('nkh.asOf', { d: fmtDate(new Date().toISOString()) })}</div>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800" data-testid="nkh-stock">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300"><span>{pick('nkf.stockTitle')}</span><Smartphone className="w-3.5 h-3.5 text-amber-500" /></div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {([['in_shop', 'nkf.inShop', 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'], ['sold', 'nkf.soldOut', 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'], ['returned', 'nkf.returned', 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300']] as const).map(([k, l, tone]) => (
                <button key={k} type="button" onClick={() => { setTab('items'); setType(k === 'in_shop' ? 'unsold' : k) }} className={`p-2 rounded-xl border text-center cursor-pointer ${tone}`} data-testid={`nkh-stock-${k}`}>
                  <div className="text-[9px] font-extrabold uppercase leading-tight">{pick(l)}</div>
                  <div className="font-display font-extrabold text-xl mt-0.5">{s ? s[k].count : '—'}</div>
                  {canCost && s ? <div className="text-[10px] font-mono" dir="ltr">{profit || k !== 'sold' ? rs(k === 'sold' ? s.sold.value : s[k].cost ?? 0) : '••••'}</div> : null}
                </button>
              ))}
            </div>
            {s?.dearest ? <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-500">{pick('nkf.dearest')}:</span><button type="button" onClick={() => nav(`/new/item/${s.dearest!.device_id}`)} className="font-bold truncate hover:underline cursor-pointer" dir="auto">{s.dearest.label} (<span dir="ltr">{rs(s.dearest.cost ?? 0)}</span>)</button></div> : s?.sold_to ? <div className="mt-2.5 text-[11px] text-slate-500">{t('nkf.soldToN', { n: s.sold_to })}</div> : null}
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800" data-testid="nkh-channels">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300"><span>{pick('nkf.channels')}</span><Landmark className="w-3.5 h-3.5 text-slate-400" /></div>
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {(kh?.channels ?? []).slice(0, 4).map((c) => (
                <div key={c.method} className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-semibold truncate">{methodName(c.method, pick)}</span>
                  <span className="font-mono font-bold" dir="ltr">{short(Number(c.in) + Number(c.out ?? 0))}</span>
                </div>
              ))}
              {kh && !kh.channels.length ? <div className="col-span-2 text-[11px] text-slate-400">{pick('nkf.noMoney')}</div> : null}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-500">{pick('nkf.totalFlow')}:</span><strong className="font-mono" dir="ltr">{kh?.money_out != null ? `${pick('nkf.paidShort')} ${short(kh.money_out)} · ` : ''}{pick('nkf.recvShort')} {short(kh?.money_in ?? 0)}</strong></div>
          </div>
          {canCost ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between" data-testid="nkh-profit">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300"><span>{pick('nkf.profitTitle')}</span><button type="button" onClick={() => setProfit(!profit)} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-obsidian-850 text-[10px] font-bold cursor-pointer">{pick(profit ? 'nkf.hideProfit' : 'nkf.showProfit')}</button></div>
              <div className={`font-display font-extrabold text-3xl mt-3 ${Number(s?.sold.profit ?? 0) + Number(journey?.sold.profit ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#9AE600]'}`} dir="ltr" data-testid="nkh-profit-val">{s ? profitShown(s.sold.profit) : '—'}</div>
              <div className="text-[11px] text-slate-500 mt-2">{s ? t('nkf.profitSub', { sold: s.sold.count, bought: s.bought }) : ''}{journey?.sold.profit != null && Number(journey.sold.profit) !== 0 ? <> · {pick('nkf.onSalesToThem')}: <span dir="ltr">{profitShown(journey.sold.profit)}</span></> : null}</div>
            </div>
          ) : null}
        </section>

        {/* ===== THE STATEMENT, THEIR PHONES, BY MODEL, BY CHANNEL, LEN-DEN ===== */}
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 overflow-x-auto max-w-full">
              {tabBtn('ledger', 'nkf.tabLedger', rows.length)}
              {tabBtn('items', 'nkf.tabItems', units.length)}
              {tabBtn('models', 'nkf.tabModels')}
              {tabBtn('methods', 'nkf.tabMethods')}
              {tabBtn('lenden', 'nkh.tabLenden', (lending?.entries.length ?? 0) + (olds?.length ?? 0))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nkf.searchPh')} data-testid="nkh-q" className="ps-8 pe-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none w-56 sm:w-72" /></div>
              <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 cursor-pointer" data-testid="nkh-type">
                {TYPES.map((x) => <option key={x} value={x}>{pick(`nkf.type.${x}`)}</option>)}
              </select>
            </div>
          </div>
          {tab === 'ledger' ? <div className="px-4 py-2.5 bg-amber-50/80 dark:bg-amber-950/20 border-y border-amber-200/70 dark:border-amber-900/50 flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="text-amber-900 dark:text-amber-200"><strong>{pick('nkf.fixTitle')}</strong> {pick('nkf.fixHint')}</span><span className="font-mono text-amber-700 dark:text-amber-400">{pick('nkf.auditTrail')}</span></div> : null}

          <div className="overflow-x-auto" data-testid={`nkh-pane-${tab}`}>
            {tab === 'ledger' ? (
              !ledgerRows.length ? (
                <div className="p-10 text-center space-y-3" data-testid="nkh-empty">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-obsidian-850 text-slate-400 flex items-center justify-center mx-auto"><BookOpenCheck className="w-6 h-6" /></div>
                  <div><h3 className="font-display font-extrabold text-sm">{t('nkh.noDealings', { who: name })}</h3><p className="text-xs text-slate-500 max-w-md mx-auto mt-1">{pick(rows.length ? 'nkh.noMatch' : 'nkh.noDealingsHint')}</p></div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button type="button" onClick={() => open('in', 'bill')} className="px-3.5 py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs cursor-pointer">{pick('nkh.emptyIn')}</button>
                    <button type="button" onClick={() => open('out', 'lenden')} className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-display font-extrabold text-xs cursor-pointer">{pick('nkh.emptyOut')}</button>
                    {canCost ? <button type="button" onClick={() => open('out', 'old')} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-bold cursor-pointer">{pick('nkh.emptyOld')}</button> : null}
                  </div>
                </div>
              ) : (
                <table className="w-full text-start border-collapse">
                  <thead><tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">{pick('nkf.colWhen')}</th><th className="py-3 px-4 text-start">{pick('nkf.colVoucher')}</th><th className="py-3 px-4 text-start">{pick('nkf.colDetails')}</th>
                    <th className="py-3 px-4 text-end">{pick('nkf.colAmount')}</th><th className="py-3 px-4 text-end">{pick('nkf.colRunning')}</th><th className="py-3 px-4 text-end">{pick('nkf.colFix')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs" data-testid="nkh-ledger">
                    {[...ledgerRows].reverse().map((r) => {
                      const d = Number(r.debit), c = Number(r.credit), b = Number(r.balance)
                      const ty = rowType(r)
                      return (
                        <tr key={r.entry_id} className={`hover:bg-slate-50/70 dark:hover:bg-obsidian-850/40 ${ty === 'mistake' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''} ${r.reversed ? 'opacity-55' : ''}`} data-testid="nkh-row">
                          <td className="py-3.5 px-4 whitespace-nowrap"><div className="font-bold" dir="ltr">{fmtDate(r.at)}</div><div className="font-mono text-[10px] text-slate-400" dir="ltr">{timeOf(r.at)}</div></td>
                          <td className="py-3.5 px-4"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TYPE_TONE[ty] ?? TYPE_TONE.other}`}>{pick(`nkf.badge.${ty}`)}</span>{r.reversed ? <span className="ms-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-obsidian-800 text-slate-600">{pick('sale.status.void')}</span> : null}</td>
                          <td className="py-3.5 px-4"><div className={`font-semibold ${r.reversed ? 'line-through' : ''}`} dir="auto">{r.memo || docName(r.document_type)}</div><div className="text-[10px] text-slate-400">{docName(r.document_type)}</div></td>
                          <td className={`py-3.5 px-4 text-end font-mono font-extrabold whitespace-nowrap ${d > 0 ? 'text-emerald-700 dark:text-[#9AE600]' : 'text-slate-900 dark:text-white'}`} dir="ltr">{d > 0 ? `+${rs(d)}` : `−${rs(c)}`}</td>
                          <td className="py-3.5 px-4 text-end whitespace-nowrap">{b > 0 ? <span className="font-mono font-extrabold text-amber-700 dark:text-amber-300"><span dir="ltr">{rs(b)}</span> <span className="text-[10px] font-sans">({pick('nkf.lene')})</span></span> : b < 0 ? <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400"><span dir="ltr">−{rs(b)}</span> <span className="text-[10px] font-sans">({pick('nkf.dene')})</span></span> : <span className="font-mono font-bold text-slate-400"><span dir="ltr">{rs(0)}</span> ({pick('nkh.clear')})</span>}</td>
                          <td className="py-3.5 px-4 text-end">{!r.reversed ? <button type="button" onClick={() => setFixing(r)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer" data-testid="nkh-fix"><Pencil className="w-3 h-3 text-amber-600" />{pick('nkf.fix')}</button> : null}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            ) : tab === 'items' ? (
              !unitRows.length ? <div className="p-10 text-center space-y-2"><div className="text-sm font-bold text-slate-700 dark:text-slate-300">{pick('nkh.noPhones')}</div><div className="text-xs text-slate-500">{t('nkh.noPhonesHint', { who: name })}</div></div> : (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="nkh-items">
                  {unitRows.map((u, i) => {
                    const dearest = s?.dearest?.device_id === u.device_id
                    return (
                      <div key={`${u.role}-${u.device_id}-${i}`} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-obsidian-850/40" data-testid="nkh-item">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-obsidian-800 text-[10px] font-bold">{u.brand_name}</span><button type="button" onClick={() => nav(`/new/item/${u.device_id}`)} className="font-display font-extrabold text-sm hover:underline cursor-pointer" dir="auto">{u.model_name}{u.storage_name ? ` ${u.storage_name}` : ''}</button>{dearest ? <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[10px] font-bold">{pick('nkf.dearestTag')}</span> : null}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{u.imei1 ? `IMEI ${u.imei1} · ` : ''}{u.no} · {fmtDate(u.date)}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${STATE_TONE[u.state]}`} data-testid="nkh-item-state">{u.state === 'in_shop' ? t('nkf.st.in_shopDays', { n: u.days_in_shop ?? 0 }) : pick(`nkf.st.${u.state}`)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div><div className="text-[10px] text-slate-400">{pick(u.role === 'sold_to' ? 'nkf.soldRate' : 'nkf.cost')}</div><div className="font-mono font-bold" dir="ltr">{u.role === 'sold_to' ? rs(u.sold_for ?? 0) : u.cost != null ? rs(u.cost) : '—'}</div></div>
                          <div><div className="text-[10px] text-slate-400">{pick(u.role === 'sold_to' ? 'nkf.left' : 'nkf.soldRate')}</div><div className="font-mono font-bold" dir="ltr">{u.role === 'sold_to' ? rs(u.remaining ?? 0) : u.sold_for != null ? rs(u.sold_for) : <span className="font-sans text-slate-400">{pick('nkf.notSold')}</span>}</div></div>
                          <div><div className="text-[10px] text-slate-400">{pick('nkf.profit')}</div><div className={`font-mono font-bold ${Number(u.profit ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#9AE600]'}`} dir="ltr">{u.profit != null ? profitShown(u.profit) : '—'}</div></div>
                        </div>
                        {u.role === 'bought_from' && u.state === 'in_shop' ? (
                          <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-2 gap-2">
                            {canCost ? <button type="button" onClick={() => nav(`/purchases/${u.doc_id}?return=${u.device_id}`)} className="py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-900 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer" data-testid="nkh-item-return"><Undo2 className="w-3.5 h-3.5" />{pick('nkf.returnDealer')}</button> : <span />}
                            <button type="button" onClick={() => nav(`/new/sale/new?device=${u.device_id}`)} className="py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] text-slate-950 text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer" data-testid="nkh-item-sell"><Tag className="w-3.5 h-3.5" />{pick('nkf.sellNow')}</button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )
            ) : tab === 'models' ? (
              !modelRows.length ? <div className="p-10 text-center text-sm font-bold text-slate-500">{pick('nkh.noPhones')}</div> : (
                <table className="w-full text-start border-collapse text-xs" data-testid="nkh-models">
                  <thead><tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">{pick('nkf.brand')}</th><th className="py-3 px-4 text-start">{pick('nkf.model')}</th><th className="py-3 px-4 text-end">{pick('nkf.bought')}</th><th className="py-3 px-4 text-end">{pick('nkf.inShop')}</th><th className="py-3 px-4 text-end">{pick('nkf.soldOut')}</th><th className="py-3 px-4 text-end">{pick('nkf.returned')}</th><th className="py-3 px-4 text-end">{pick('nkf.soldToThem')}</th>
                    {canCost ? <><th className="py-3 px-4 text-end">{pick('nkf.highest')}</th><th className="py-3 px-4 text-end">{pick('nkf.totalCost')}</th></> : null}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {modelRows.map((m, i) => (
                      <tr key={i}>
                        <td className="py-3 px-4 font-bold">{m.brand_name}</td><td className="py-3 px-4" dir="auto">{m.model_name}</td><td className="py-3 px-4 text-end font-mono font-bold">{m.bought}</td>
                        <td className="py-3 px-4 text-end"><span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">{m.in_shop}</span></td>
                        <td className="py-3 px-4 text-end"><span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">{m.sold}</span></td>
                        <td className="py-3 px-4 text-end"><span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold">{m.returned}</span></td>
                        <td className="py-3 px-4 text-end font-mono">{m.sold_to}</td>
                        {canCost ? <><td className="py-3 px-4 text-end font-mono" dir="ltr">{rs(m.highest_cost ?? 0)}</td><td className="py-3 px-4 text-end font-mono font-bold" dir="ltr">{rs(m.total_cost ?? 0)}</td></> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : tab === 'methods' ? (
              <div className="p-4 space-y-4" data-testid="nkh-methods">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(kh?.channels ?? []).map((c) => (
                    <div key={c.method} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800" data-testid="nkh-channel">
                      <div className="font-display font-extrabold text-sm">{methodName(c.method, pick)}</div>
                      {c.out != null ? <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">{pick('nkf.paidOut')}</span><strong className="font-mono text-rose-600" dir="ltr">{rs(c.out)}</strong></div> : null}
                      <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-500">{pick('nkf.recvIn')}</span><strong className="font-mono text-emerald-600" dir="ltr">{rs(c.in)}</strong></div>
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">{t('nkf.entriesN', { n: c.count })}</div>
                    </div>
                  ))}
                </div>
                {payRows.length ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {payRows.map((p) => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono font-bold" dir="ltr">{p.no}</span><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-obsidian-850 text-[10px] font-bold">{methodName(p.method, pick)}</span>{p.purpose === 'lending' ? <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] font-bold">{pick('nkh.lendBadge')}</span> : null}</div><div className="text-[10px] text-slate-400" dir="auto">{fmtDate(p.date)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</div></div>
                        <div className="flex items-center gap-2 shrink-0"><span className={`font-mono font-extrabold ${p.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{p.amount != null ? `${p.direction === 'in' ? '+' : '−'}${rs(p.amount)}` : '••••'}</span><button type="button" onClick={() => void openPrintable(`/api/v1/payments/${p.id}/receipt?format=thermal`)} aria-label={pick('unit.printReceipt')} className="text-slate-400 hover:text-slate-700 cursor-pointer"><Printer className="w-3.5 h-3.5" /></button></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">{pick('nkf.noMoney')}</p>}
              </div>
            ) : (
              !lendRows.length && !oldRows.length ? (
                <div className="p-10 text-center space-y-3">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{pick('nkh.noLenden')}</div>
                  <div className="text-xs text-slate-500 max-w-md mx-auto">{pick('nkh.noLendenHint')}</div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button type="button" onClick={() => open('out', 'lenden')} className="px-3.5 py-2 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-bold text-xs cursor-pointer">{pick('nkh.recordLenden')}</button>
                    {canCost ? <button type="button" onClick={() => open('out', 'old')} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">{pick('nkh.emptyOld')}</button> : null}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="nkh-lenden">
                  {oldRows.map((r) => (
                    <div key={r.group_id} className={`p-4 flex items-center justify-between gap-3 ${r.deleted ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">{pick('nkh.oldBadge')}</span>{r.deleted ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-obsidian-800 text-slate-600">{pick('sale.status.void')}</span> : null}</div>
                        <div className={`text-xs font-semibold mt-0.5 ${r.deleted ? 'line-through' : ''}`} dir="auto">{r.memo || pick(r.party_owes ? 'party.partyOwes' : 'party.iOwe')}</div>
                        <div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(r.at)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`font-mono font-extrabold text-sm ${r.party_owes ? 'text-amber-600' : 'text-rose-600'}`}><span dir="ltr">{rs(r.amount)}</span> {pick(r.party_owes ? 'nkh.lena' : 'nkh.dena')}</div>
                        {!r.deleted && canCost ? <button type="button" onClick={() => setUndoing({ kind: 'old', id: r.group_id })} aria-label={pick('crud.delete')} className="p-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 text-rose-500 hover:bg-rose-50 cursor-pointer" data-testid="nkh-old-undo"><Trash2 className="w-3.5 h-3.5" /></button> : null}
                      </div>
                    </div>
                  ))}
                  {lendRows.map((r) => (
                    <div key={r.id} className={`p-4 flex items-center justify-between gap-3 ${r.status === 'voided' ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold" dir="ltr">{r.no}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">{pick('nkh.lendBadge')}</span>{r.status === 'voided' ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-obsidian-800 text-slate-600">{pick('sale.status.void')}</span> : null}</div>
                        <div className="text-xs font-semibold mt-0.5" dir="auto">{r.notes || pick(r.direction === 'out' ? 'nkh.lendOut' : 'nkh.lendIn')}</div>
                        <div className="text-[10px] text-slate-400"><span dir="ltr">{fmtDate(r.date)}</span>{r.due_date ? <> • {pick('nkh.backBy')} <span dir="ltr">{fmtDate(r.due_date)}</span></> : null}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`font-mono font-extrabold text-sm ${r.direction === 'out' ? 'text-amber-600' : 'text-emerald-600'}`}><span dir="ltr">{r.direction === 'out' ? '+' : ''}{rs(r.amount)}</span> {pick(r.direction === 'out' ? 'nkh.lena' : 'nkh.aya')}</div>
                        {r.status !== 'voided' && canCost ? <button type="button" onClick={() => setUndoing({ kind: 'lend', id: r.id })} aria-label={pick('crud.delete')} className="p-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 text-rose-500 hover:bg-rose-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </section>
      </main>

      {/* ===== THE ENTRY WINDOW: money in / out (against bills or len-den) or an old balance ===== */}
      {drawer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4" data-testid="nkh-drawer">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div><span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${kind === 'old' ? 'bg-amber-500 text-white' : dir === 'in' ? 'bg-emerald-600 text-white' : 'bg-obsidian-900 text-white dark:bg-slate-100 dark:text-obsidian-950'}`} data-testid="nkh-drawer-badge">{pick(kind === 'old' ? 'nkh.badgeOld' : dir === 'in' ? 'nkh.badgeIn' : 'nkh.badgeOut')}</span><p className="text-[11px] text-slate-500 mt-1.5" dir="auto">{name} · {pick(kind === 'old' ? 'nkh.helpOld' : `nkh.help.${kind}.${dir}`)}</p></div>
              <button type="button" onClick={() => setDrawer(false)} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={LBL}>{pick('nkh.step1')}</label>
                <div className={`grid ${canCost ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                  {(['bill', 'lenden', ...(canCost ? ['old'] : [])] as Kind[]).map((k) => (
                    <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`nkh-kind-${k}`} className={`py-2 px-2 rounded-xl text-[11px] cursor-pointer transition-all ${kind === k ? segOn : segOff}`}>{pick(`nkh.kind.${k}`)}<span className="block text-[9px] font-normal opacity-80">{pick(`nkh.kindSub.${k}`)}</span></button>
                  ))}
                </div>
              </div>
              {kind === 'old' ? (
                <div>
                  <label className={LBL}>{pick('nkh.oldWhat')}</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => setDir('out')} aria-pressed={dir === 'out'} data-testid="nkh-old-lena" className={`py-2 px-3 rounded-xl text-xs cursor-pointer ${dir === 'out' ? 'font-extrabold bg-amber-500 text-white' : segOff}`}>{pick('nkh.oldLena')}</button>
                    <button type="button" onClick={() => setDir('in')} aria-pressed={dir === 'in'} data-testid="nkh-old-dena" className={`py-2 px-3 rounded-xl text-xs cursor-pointer ${dir === 'in' ? 'font-extrabold bg-rose-500 text-white' : segOff}`}>{pick('nkh.oldDena')}</button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className={LBL}>{pick('nkh.step2')}</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['cash', 'online', 'wallet'] as Mode[]).map((m) => <button key={m} type="button" onClick={() => { setMode(m); setBank(m === 'wallet' ? 'JazzCash' : '') }} aria-pressed={mode === m} data-testid={`nkh-mode-${m}`} className={`py-2 px-2 rounded-xl text-[11px] cursor-pointer ${mode === m ? segOn : segOff}`}>{pick(`nkh.mode.${m}`)}</button>)}
                  </div>
                  {mode !== 'cash' ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(mode === 'wallet' ? WALLETS : POPULAR_BANKS.filter((b) => !WALLETS.includes(b)).slice(0, 5)).map((b) => <button key={b} type="button" onClick={() => setBank(b)} className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer ${bank === b ? 'bg-obsidian-900 text-white dark:bg-[#9AE600] dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-700'}`}>{b}</button>)}
                        {mode === 'online' ? <select value={bank && !POPULAR_BANKS.includes(bank) ? bank : ''} onChange={(e) => setBank(e.target.value)} className="px-2 py-0.5 rounded-lg text-[11px] bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700"><option value="">{pick('paym.otherBank')}</option>{ALL_BANKS.filter((b) => !POPULAR_BANKS.includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}</select> : null}
                      </div>
                      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={pick('paym.tid')} className="w-full px-2.5 py-1.5 rounded-lg font-mono text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr" />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nkh.step3')}</label>
                  <div className="flex items-center gap-1" dir="ltr">
                    {[5000, 10000, 50000].map((v) => <button key={v} type="button" onClick={() => setAmount(String((Number(amount) || 0) + v))} className="px-1.5 py-0.5 rounded bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold hover:border-slate-400 cursor-pointer">+{v / 1000}k</button>)}
                    {bal !== 0 && kind !== 'old' ? <button type="button" onClick={() => setAmount(String(Math.abs(bal)))} className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-extrabold cursor-pointer" data-testid="nkh-full">{pick('nkh.fullBal')}</button> : null}
                  </div>
                </div>
                <input ref={amountRef} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" dir="ltr" data-testid="nkh-amount" className="w-full px-3.5 py-2.5 rounded-xl font-mono text-base font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]" />
              </div>
              {kind !== 'old' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>{pick('nkf.date')}</label><input type="date" value={day} max={isoDay(0)} onChange={(e) => setDay(e.target.value)} className="w-full px-2.5 py-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700" dir="ltr" data-testid="nkh-date" /></div>
                  {kind === 'lenden' ? <div><label className={LBL}>{pick('nkh.backBy')}</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full px-2.5 py-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700" dir="ltr" data-testid="nkh-due" /></div> : null}
                </div>
              ) : null}
            </div>
            <div>
              <label className={LBL}>{pick('nkh.step4')}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick('nkh.notePh')} data-testid="nkh-note" className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none" dir="auto" />
            </div>
            {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setDrawer(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button>
              <button type="button" onClick={() => void save()} disabled={busy} className="px-5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] hover:opacity-95 disabled:opacity-50 text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="nkh-save"><CheckCircle2 className="w-4 h-4" /><span>{pick('nkh.saveEntry')}</span></button>
            </div>
          </div>
        </div>
      ) : null}

      {wa ? <WaWindow party={party} text={waText} onClose={() => setWa(false)} /> : null}
      {editing ? <EditWindow party={party} onClose={() => setEditing(false)} onDone={() => { setEditing(false); setToast(pick('nkh.savedPerson')) }} /> : null}
      {removing ? <RemoveWindow party={party} onClose={() => setRemoving(false)} /> : null}
      {undoing ? <UndoWindow what={undoing} onClose={() => setUndoing(null)} onDone={() => { setUndoing(null); setToast(pick('nkh.undone')); void inv('party-khata') }} /> : null}
      {fixing ? <FixWindow row={fixing} canCost={canCost} onClose={() => setFixing(null)} onUndo={(w) => { setFixing(null); setUndoing(w) }} /> : null}
      {promising && kh?.promise ? <PromiseWindow promise={kh.promise} onClose={() => setPromising(false)} onDone={() => { setPromising(false); setToast(pick('nkf.promiseSaved')) }} /> : null}
      {report ? <ReportWindow party={party} canCost={canCost} waText={waText} onClose={() => setReport(false)} onToast={setToast} /> : null}

      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#9AE600]" /><span data-testid="nkh-toast">{toast}</span></div>
      </div>
    </div>
  )
}

const LBL = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5'
const TYPES = ['all', 'unsold', 'sold', 'returned', 'purchase', 'sale', 'payment_in', 'payment_out', 'return', 'mistake'] as const
type TypeFilter = (typeof TYPES)[number]
const TYPE_TONE: Record<string, string> = {
  purchase: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  sale: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300',
  payment_in: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  payment_out: 'bg-pink-50 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300',
  return: 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300',
  mistake: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
  other: 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300',
}
const STATE_TONE: Record<string, string> = {
  in_shop: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
  sold: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
  sold_to: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300',
  returned: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
  other: 'bg-slate-100 dark:bg-obsidian-850 text-slate-600',
}
const timeOf = (iso: string) => { const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
/** a large amount in lakh, as the file prints it (12.5L); under a lakh in full */
const short = (v: number | string) => { const n = Math.abs(Number(v || 0)); return n >= 100000 ? `${(n / 100000).toFixed(n >= 10_000_000 ? 0 : 1)}L` : n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
const methodName = (m: string, pick: (k: string) => string) => { const k = `nkf.m.${m}`; const v = pick(k); return v === k ? m : v }

/** "Fix / Edit" on a statement line: what the live software lets the shop correct for that kind of entry */
function FixWindow({ row, canCost, onClose, onUndo }: { row: StatementRow; canCost: boolean; onClose: () => void; onUndo: (w: { kind: 'old' | 'lend'; id: string }) => void }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const id = row.document_id
  const acts: { key: string; label: string; run: () => void; danger?: boolean }[] = []
  if (row.document_type === 'invoice' && id) {
    acts.push({ key: 'open', label: 'nkf.fx.openBill', run: () => nav(`/sales/${id}`) })
    if (canCost) acts.push({ key: 'buyer', label: 'sale.fix.button', run: () => nav(`/sales/${id}?change=1`) }, { key: 'del', label: 'del.deleteSale', run: () => nav(`/sales/${id}?delete=1`), danger: true })
  } else if (row.document_type === 'purchase' && id) {
    acts.push({ key: 'open', label: 'nkf.fx.openBill', run: () => nav(`/purchases/${id}`) })
    if (canCost) acts.push({ key: 'seller', label: 'purchase.fix.partyButton', run: () => nav(`/purchases/${id}?change=1`) }, { key: 'paid', label: 'purchase.paidFix.button', run: () => nav(`/purchases/${id}?paid=1`) }, { key: 'del', label: 'del.deletePurchase', run: () => nav(`/purchases/${id}?delete=1`), danger: true })
  } else if ((row.document_type === 'payment' || row.document_type === 'lending') && id) {
    acts.push({ key: 'receipt', label: 'unit.printReceipt', run: () => void openPrintable(`/api/v1/payments/${id}/receipt?format=a4`) })
    if (canCost) acts.push({ key: 'void', label: 'nkf.fx.deletePayment', run: () => onUndo({ kind: 'lend', id }), danger: true })
  } else if (row.document_type === 'opening_balance') {
    if (canCost) acts.push({ key: 'void', label: 'nkf.fx.deleteOld', run: () => onUndo({ kind: 'old', id: row.group_id }), danger: true })
  } else if (row.document_type === 'repair' && id) {
    acts.push({ key: 'open', label: 'nkf.fx.openJob', run: () => nav(`/new/repairs/${id}`) })
  }
  return (
    <Modal testid="nkh-fix-window" wide>
      <div className="flex items-start justify-between gap-2"><div><h3 className="font-display font-extrabold text-sm">{pick('nkf.fixWindow')}</h3><p className="text-[11px] text-slate-500 mt-0.5" dir="auto">{fmtDate(row.at)} · {row.memo || row.document_type}</p></div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <p className="text-xs text-slate-500">{pick('nkf.fixRule')}</p>
      <div className="space-y-1.5">
        {acts.length ? acts.map((a) => <button key={a.key} type="button" onClick={a.run} className={`w-full px-3.5 py-2.5 rounded-xl border text-start text-xs font-bold cursor-pointer ${a.danger ? 'border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-obsidian-850'}`} data-testid={`nkh-fx-${a.key}`}>{pick(a.label)}</button>) : <p className="text-xs text-slate-400">{pick('nkf.fx.none')}</p>}
      </div>
    </Modal>
  )
}

/** "Change" the promised date: every open len-den entry of this person gets the new date */
function PromiseWindow({ promise, onClose, onDone }: { promise: NonNullable<KhataFile['promise']>; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [day, setDay] = useState(promise.date)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Modal testid="nkh-promise-window">
      <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('nkf.promiseTitle')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <p className="text-xs text-slate-500">{pick('nkf.promiseHint')}</p>
      <input type="date" value={day} min={isoDay(0)} onChange={(e) => setDay(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" dir="ltr" data-testid="nkh-promise-date" />
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || !day} onClick={async () => { setBusy(true); setErr(''); try { for (const pid of promise.entries) await api('PATCH', `/api/v1/payments/${pid}/due-date`, { due_date: day }); await inv('party-khata', 'party-lending'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer" data-testid="nkh-promise-save">{pick('common.save')}</button></div>
    </Modal>
  )
}

/** The full ledger report: the server's A4 page for the period and sections chosen, previewed here, printed, downloaded */
function ReportWindow({ party, canCost, waText, onClose, onToast }: { party: Party; canCost: boolean; waText: string; onClose: () => void; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const [preset, setPreset] = useState<'all' | 'today' | '7d' | 'month'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [secs, setSecs] = useState<string[]>(['channels', 'models', 'units', 'ledger'])
  const [hideProfit, setHideProfit] = useState(true)
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [wa, setWa] = useState(false)
  const pickPreset = (p: typeof preset) => {
    setPreset(p)
    const today = isoDay(0)
    if (p === 'all') { setFrom(''); setTo('') } else if (p === 'today') { setFrom(today); setTo(today) } else if (p === '7d') { setFrom(isoDay(-6)); setTo(today) } else { setFrom(`${today.slice(0, 8)}01`); setTo(today) }
  }
  const qs = new URLSearchParams()
  if (from) qs.set('date_from', from)
  if (to) qs.set('date_to', to)
  qs.set('sections', secs.join(',') || 'ledger')
  if (canCost && !hideProfit) qs.set('profit', 'true')
  const path = `/api/v1/parties/${party.id}/khata-report?${qs}`
  const range = `${from ? `&date_from=${from}` : ''}${to ? `&date_to=${to}` : ''}`
  useEffect(() => {
    let live = true
    const x = setTimeout(() => { fetch(`${BASE}${withDocLang(path)}`, { headers: authHeaders() }).then((r) => r.text()).then((h) => { if (live) setHtml(h) }).catch((e) => setErr(String(e))) }, 200)
    return () => { live = false; clearTimeout(x) }
  }, [path])
  const pill = (on: boolean) => `px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${on ? 'bg-[#9AE600] text-slate-950' : 'text-slate-300 hover:text-white'}`
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-5 bg-black/75 overflow-y-auto" data-testid="nkh-report-window">
      <div className="w-full max-w-5xl rounded-2xl overflow-hidden bg-obsidian-900 border border-slate-700 shadow-2xl">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700">
          <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded-md bg-[#9AE600] text-slate-950 text-[10px] font-extrabold">A4</span><span className="font-display font-extrabold text-sm text-white">{pick('nkf.reportTitle')}</span></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setWa(true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nkh-rep-wa"><MessageCircle className="w-3.5 h-3.5" />{pick('nkf.shareWa')}</button>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(waText).catch(() => undefined); onToast(pick('nkf.copied')) }} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nkh-rep-copy"><Copy className="w-3.5 h-3.5" />{pick('nkf.copyText')}</button>
            <button type="button" onClick={() => { setErr(''); downloadFile(withDocLang(`/api/v1/exports/parties/${party.id}/statement?format=pdf${range}`), `khata-${party.name}.pdf`).catch((e) => setErr(errText(e, ur))) }} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nkh-rep-pdf"><Download className="w-3.5 h-3.5" />PDF</button>
            <button type="button" onClick={() => { setErr(''); downloadFile(withDocLang(`/api/v1/exports/parties/${party.id}/statement?format=csv${range}`), `khata-${party.name}.csv`).catch((e) => setErr(errText(e, ur))) }} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nkh-rep-csv"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('nkf.excel')}</button>
            <button type="button" onClick={() => { setErr(''); openPrintable(path).catch((e) => setErr(errText(e, ur))) }} className="px-3.5 py-1.5 rounded-lg bg-[#9AE600] hover:bg-[#84CC16] text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer" data-testid="nkh-rep-print"><Printer className="w-3.5 h-3.5" />{pick('nkf.printA4')}</button>
            <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer" data-testid="nkh-rep-close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="px-4 py-3 space-y-2.5 border-b border-slate-700 text-xs text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800">{(['all', 'today', '7d', 'month'] as const).map((p) => <button key={p} type="button" onClick={() => pickPreset(p)} className={pill(preset === p)} data-testid={`nkh-rep-${p}`}>{pick(`nkf.preset.${p}`)}</button>)}</div>
            <div className="flex items-center gap-2"><label className="flex items-center gap-1">{pick('nkf.from')}<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('all') }} className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-600 text-white" dir="ltr" data-testid="nkh-rep-from" /></label><label className="flex items-center gap-1">{pick('nkf.to')}<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('all') }} className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-600 text-white" dir="ltr" /></label></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canCost ? <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={hideProfit} onChange={(e) => setHideProfit(e.target.checked)} className="accent-[#9AE600]" data-testid="nkh-rep-hideprofit" />{pick('nkf.hideProfitPrint')}</label> : null}
            {(['channels', 'models', 'units', 'ledger'] as const).map((k) => <label key={k} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={secs.includes(k)} onChange={(e) => setSecs(e.target.checked ? [...secs, k] : secs.filter((x) => x !== k))} className="accent-[#9AE600]" data-testid={`nkh-rep-sec-${k}`} />{pick(`nkf.sec.${k}`)}</label>)}
            <button type="button" onClick={() => { pickPreset('all'); setSecs(['channels', 'models', 'units', 'ledger']); setHideProfit(true) }} className="ms-auto text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">{pick('nkf.reset')}</button>
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-400" role="alert">{err}</p> : null}
        </div>
        <div className="bg-slate-200 dark:bg-obsidian-950 p-3 sm:p-5">{html ? <iframe title={pick('nkf.reportTitle')} srcDoc={html} sandbox="" className="w-full h-[72vh] rounded-lg bg-white border-0 shadow" data-testid="nkh-rep-frame" /> : <div className="h-40 flex items-center justify-center text-xs text-slate-500">…</div>}</div>
      </div>
      {wa ? <WaWindow party={party} text={waText} onClose={() => setWa(false)} /> : null}
    </div>
  )
}

function Modal({ children, testid, wide }: { children: ReactNode; testid: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid={testid}>
      <div className={`bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl ${wide ? 'max-w-md' : 'max-w-sm'} w-full p-5 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto`}>{children}</div>
    </div>
  )
}
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

/** WhatsApp hisaab: the server's balance in a few lines, editable, sent with the person's own number. */
function WaWindow({ party, text, onClose }: { party: Party; text: string; onClose: () => void }) {
  const { pick } = useLang()
  const [msg, setMsg] = useState(text)
  const num = waNumber(party.whatsapp || party.phone)
  return (
    <Modal testid="nkh-wa-window" wide>
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><MessageCircle className="w-4 h-4" /></span>
          <div><h3 className="font-display font-bold text-sm">{pick('nkh.waTitle')}</h3><p className="text-[11px] text-slate-500">{pick(num ? 'nkh.waReady' : 'nkh.waNoNumber')}</p></div>
        </div>
        <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={8} dir="auto" data-testid="nkh-wa-text" className="w-full p-3 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-medium leading-relaxed focus:outline-none" />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.close')}</button>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(msg).catch(() => undefined); window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); onClose() }} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"><Copy className="w-3.5 h-3.5" /><span>{pick('nkh.waSend')}</span></button>
      </div>
    </Modal>
  )
}

/** Edit: name, mobile (through PhoneInput, ADR-107), kind, address and note — the live PATCH. */
function EditWindow({ party, onClose, onDone }: { party: Party; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [nm, setNm] = useState(party.name)
  const [ph, setPh] = useState(party.phone ?? '')
  const [kinds, setKinds] = useState<PartyKind[]>(party.kinds)
  const [address, setAddress] = useState(party.address ?? '')
  const [notes, setNotes] = useState(party.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const KINDS: PartyKind[] = ['customer', 'supplier', 'shop', 'technician']
  async function save() {
    setBusy(true); setErr('')
    try {
      await api('PATCH', `/api/v1/parties/${party.id}`, { name: nm.trim(), phone: ph || null, kinds, address: address.trim() || null, notes: notes.trim() || null })
      await inv('party', 'parties')
      onDone()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const box = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none'
  return (
    <Modal testid="nkh-edit-window" wide>
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <h3 className="font-display font-extrabold text-sm">{pick('nkh.editTitle')}</h3>
        <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="space-y-3">
        <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nkh.fullName')}</label><input value={nm} onChange={(e) => setNm(e.target.value)} className={`${box} font-bold`} dir="auto" data-testid="nkh-edit-name" /></div>
        <PhoneInput label="party.phone" value={ph} onChange={setPh} />
        <div>
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nkh.role')}</label>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => { const on = kinds.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setKinds(on ? (kinds.length > 1 ? kinds.filter((x) => x !== k) : kinds) : [...kinds, k])} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${on ? 'bg-obsidian-900 text-white dark:bg-[#9AE600] dark:text-obsidian-950 border-transparent' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-700'}`}>{pick(`party.${k}`)}</button> })}
          </div>
        </div>
        <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nkh.address')}</label><input value={address} onChange={(e) => setAddress(e.target.value)} className={box} dir="auto" /></div>
        <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nkh.noteLabel')}</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={box} dir="auto" /></div>
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button>
        <button type="button" onClick={() => void save()} disabled={busy || nm.trim().length < 2} className="px-4 py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-xs cursor-pointer" data-testid="nkh-edit-save">{pick('nlist.saveChanges')}</button>
      </div>
    </Modal>
  )
}

/** Delete a person (owner / manager): the live delete; the server refuses one with open dealings. */
function RemoveWindow({ party, onClose }: { party: Party; onClose: () => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Modal testid="nkh-remove-window">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
        <div><h3 className="font-display font-extrabold text-sm">{pick('nkh.deleteQ')}</h3><p className="text-xs text-slate-500 mt-0.5">{t('nkh.deleteDesc', { who: party.name })}</p></div>
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('DELETE', `/api/v1/parties/${party.id}`); await inv('parties'); nav('/new/khata', { replace: true }) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nkh-remove-yes">{pick('nkh.confirmDelete')}</button>
      </div>
    </Modal>
  )
}

/** Undo an old balance (a reversing entry, ADR-110) or cancel a len-den entry (the live void), with a reason. */
function UndoWindow({ what, onClose, onDone }: { what: { kind: 'old' | 'lend'; id: string }; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try {
      await api('POST', what.kind === 'old' ? `/api/v1/ledger/opening-balances/${what.id}/undo` : `/api/v1/payments/${what.id}/void`, { reason: why.trim() })
      await inv('party', 'parties', 'statement', 'party-journey', 'party-lending', 'old-balances', 'party-units', 'payments', 'dashboard', 'balances')
      onDone()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Modal testid="nkh-undo-window">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
        <div><h3 className="font-display font-extrabold text-sm">{pick(what.kind === 'old' ? 'old.undo' : 'nkh.cancelLend')}</h3><p className="text-xs text-slate-500 mt-0.5">{pick(what.kind === 'old' ? 'old.undoHint' : 'bill.kept')}</p></div>
      </div>
      <input value={why} onChange={(e) => setWhy(e.target.value)} minLength={3} maxLength={200} placeholder={pick('common.reason')} data-testid="nkh-undo-why" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" />
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button>
        <button type="button" onClick={() => void go()} disabled={busy || why.trim().length < 3} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nkh-undo-yes">{pick('nkh.confirmDelete')}</button>
      </div>
    </Modal>
  )
}

