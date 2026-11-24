/** A person's khata in the new product (ADR-134), drawn from `06-person-khata.html`: a full screen
 *  with the file's own sidebar, the bar with the breadcrumb, the profit eye, language and dark, the
 *  one-tap switch between people, the person's card (call, WhatsApp hisaab, edit, the "•••" menu),
 *  the two big money buttons and "Purana hisaab" with their drawer, four cards of the whole journey,
 *  and the statement in three tabs (account ledger, phones bought & sold, len-den & old balance).
 *
 *  Everything is the live software's: the balance and the ledger are the server's statement
 *  (`/ledger/parties/{id}/statement`, its running balance), the journey cards are the shop audit's
 *  (`/shop-audit/parties/{id}/journey`, owner / manager), len-den is `/payments/lending/{id}` and the
 *  old balance `/ledger/parties/{id}/opening-balance(s)` (ADR-110). "Paisa aya / diya" against a bill
 *  is a payment (`POST /payments`, put on the oldest open bills by the server), without a bill it is
 *  len-den (`purpose = lending`, docs/32), an old balance is the opening balance against capital —
 *  never stock or profit. The app adds nothing up: every figure is a server's.
 *
 *  Differences from the drawing: a statement row shows the entry's own note (the server's) instead of
 *  a made-up reference; the date filter is this month / last month / all; "Mobile wallet" picks
 *  JazzCash / Easypaisa / … and is sent as an online payment with that wallet; profit, the journey
 *  cards and the phones tab are for the owner / manager only (cost); an old balance and deleting a
 *  person are for the owner / manager, as in the live software. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, BookOpen, BookOpenCheck, CalendarCheck, CheckCircle2, Copy, Download, Eye, EyeOff,
  FileText, History, Languages, MessageCircle, Moon, MoreHorizontal, PackagePlus, Pencil, Phone, PhoneCall, Printer, Search, Share2, ShieldCheck,
  ShoppingBag, Smartphone, Sun, Tag, Trash2, Undo2, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { newPay, payInfo, type PayState } from '@/components/PayPicker'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate, useParties, useParty, useStatement } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Party, PartyKind, StatementRow } from '@/lib/types'
import { ALL_BANKS, POPULAR_BANKS } from '@/lib/pkPayments'

type M = string
type Tab = 'ledger' | 'phones' | 'lenden'
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
interface Old { group_id: string; at: string; amount: M; party_owes: boolean; memo: string | null; deleted: boolean }

const n0 = (v: number | string) => Math.round(Math.abs(Number(v || 0))).toLocaleString('en-US')
const rs = (v: number | string) => withCur(n0(v))
const WALLETS = ['JazzCash', 'Easypaisa', 'SadaPay', 'NayaPay', 'UPaisa']
const docLink = (r: StatementRow) => !r.document_id ? null
  : r.document_type === 'invoice' ? `/sales/${r.document_id}` : r.document_type === 'purchase' ? `/new/purchases` : r.document_type === 'repair' ? `/repairs/${r.document_id}` : null

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
  if (!id) return <div className="min-h-dvh bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="06" data-testid="nkh-wait">{people && !people.length ? <Nobody /> : null}</div>
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

  const [profit, setProfit] = useState(true)
  const [tab, setTab] = useState<Tab>('ledger')
  const [q, setQ] = useState('')
  const [when, setWhen] = useState<'all' | 'this' | 'last'>('all')
  const [toast, setToast] = useState('')
  const [more, setMore] = useState(false)
  const [wa, setWa] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [undoing, setUndoing] = useState<{ kind: 'old' | 'lend'; id: string } | null>(null)
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])

  /* the drawer */
  const [drawer, setDrawer] = useState(false)
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [kind, setKind] = useState<Kind>('bill')
  const [mode, setMode] = useState<Mode>('cash')
  const [bank, setBank] = useState('')
  const [ref, setRef] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
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
  const monthOf = (iso: string) => iso.slice(0, 7)
  const now = new Date()
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastM = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, '0')}`
  const inWhen = (iso: string) => when === 'all' || monthOf(iso) === (when === 'this' ? thisM : lastM)
  const query = q.trim().toLowerCase()
  const docName = (dt: string) => { const k = `nkh.doc.${dt}`; const v = pick(k); return v === k ? dt : v }
  const ledgerRows = rows.filter((r) => inWhen(r.at) && (!query || (r.memo ?? '').toLowerCase().includes(query) || docName(r.document_type).toLowerCase().includes(query)))
  const phoneRows = (journey?.timeline ?? []).filter((x) => x.devices.length && inWhen(x.date) && (!query || x.no.toLowerCase().includes(query) || x.devices.some((d) => d.label.toLowerCase().includes(query) || (d.imei1 ?? '').includes(query))))
  const lendRows = (lending?.entries ?? []).filter((x) => inWhen(x.date) && (!query || x.no.toLowerCase().includes(query) || (x.notes ?? '').toLowerCase().includes(query)))
  const oldRows = (olds ?? []).filter((x) => inWhen(x.at) && (!query || (x.memo ?? '').toLowerCase().includes(query)))
  const phonesCount = (journey?.timeline ?? []).filter((x) => x.devices.length).length

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
        await api('POST', '/api/v1/payments', { party_id: party.id, direction: dir, amount: v, payment: payInfo(pay), notes: note.trim() || undefined, purpose: kind === 'lenden' ? 'lending' : undefined, due_date: kind === 'lenden' && due ? due : undefined }, { idempotencyKey: idem })
      }
      await inv('party', 'parties', 'statement', 'party-journey', 'party-lending', 'old-balances', 'party-units', 'payments', 'dashboard', 'day', 'balances', 'accounts')
      setToast(t('nkh.saved', { n: rs(v), who: party.name }))
      setDrawer(false); setAmount(''); setNote(''); setRef(''); setDue(''); setIdem(uid())
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally { setBusy(false) }
  }

  if (!party) return <div className="min-h-dvh bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="06" />

  const name = ur ? party.name_ur || party.name : party.name
  const initials = party.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const switcher = (() => {
    const list = [...people].filter((p) => Number(p.balance) !== 0).sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance))).slice(0, 8)
    return list.some((p) => p.id === party.id) ? list : [party, ...list.slice(0, 7)]
  })()
  const tabBtn = (k: Tab, label: string, count: number) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nkh-tab-${k}`}
      className={`px-3.5 py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1.5 ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 shadow-2xs' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70'}`}>
      <span>{pick(label)}</span><span className={`px-1.5 rounded-md text-[10px] font-mono ${tab === k ? 'bg-white/20 dark:bg-obsidian-950/20' : 'bg-white dark:bg-obsidian-900'}`} dir="ltr">{count}</span>
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

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex" data-testid="nkh" data-newui="1" data-file="06">
      <Side />

      <div className="flex-1 flex flex-col min-w-0">
        {/* ===== BAR + SWITCHER ===== */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/85 dark:border-slate-800 px-4 sm:px-6 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <a href="/parties" className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('party.title')}</span></a>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className={`truncate ${ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base'} text-slate-900 dark:text-white`} dir="auto">{name}</span>
            </div>
            <div className="flex items-center gap-2">
              {canCost ? <button type="button" onClick={() => setProfit(!profit)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nkh-eye">{profit ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-[#9AE600]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}<span className="hidden sm:inline">{pick(profit ? 'nkh.profitShown' : 'nkh.profitHidden')}</span></button> : null}
              <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nkh-lang"><Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{ur ? 'English' : 'اردو'}</span></button>
              <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[#9AE600]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" data-testid="nkh-switcher">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 me-1">{pick('nkh.switch')}</span>
            {switcher.map((p) => {
              const on = p.id === party.id
              const b = Number(p.balance)
              return (
                <button key={p.id} type="button" onClick={() => nav(`/new/parties/${p.id}`)} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer transition-all ${on ? 'bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 shadow-2xs' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-obsidian-800'}`}>
                  <span dir="auto">{ur ? p.name_ur || p.name : p.name}</span>
                  <span className={on ? 'px-1.5 rounded bg-white/90 dark:bg-obsidian-950/90' : ''}>
                    {b > 0 ? <span className="font-mono text-[10px] font-extrabold text-amber-600 dark:text-amber-300" dir="ltr">{rs(b)} {pick('nkh.lena')}</span>
                      : b < 0 ? <span className="font-mono text-[10px] font-extrabold text-rose-600 dark:text-rose-400" dir="ltr">{rs(b)} {pick('nkh.dena')}</span>
                        : <span className="font-mono text-[10px] text-emerald-600 dark:text-[#9AE600]">{pick('nkh.clear')}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          {/* ===== A. THE PERSON + THE MONEY BUTTONS ===== */}
          <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-obsidian-900 dark:bg-[#9AE600] text-[#9AE600] dark:text-obsidian-950 font-display font-extrabold text-base flex items-center justify-center shrink-0" dir="ltr">{initials}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className={`${ur ? `ur font-extrabold ${cls('lg')}` : 'font-display font-extrabold text-lg sm:text-xl tracking-tight'} text-slate-900 dark:text-white`} dir="auto" data-testid="nkh-name">{name}</h1>
                    {party.kinds.map((k) => <span key={k} className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{pick(`party.${k}`)}</span>)}
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusPill}`} data-testid="nkh-status">{bal > 0 ? `${rs(bal)} • ${pick('nkh.willGet')}` : bal < 0 ? `${rs(bal)} • ${pick('nkh.willGive')}` : pick('nkh.settledPill')}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {party.phone ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(party.phone!).catch(() => undefined); setToast(t('nkh.copied', { what: party.phone })) }} className="inline-flex items-center gap-1.5 font-mono font-bold bg-slate-100 dark:bg-obsidian-850 hover:bg-slate-200 dark:hover:bg-obsidian-800 px-2 py-0.5 rounded-lg text-slate-800 dark:text-slate-200 cursor-pointer" dir="ltr"><Phone className="w-3 h-3 text-slate-400" /><span>{party.phone}</span><Copy className="w-2.5 h-2.5 text-slate-400" /></button> : <span className="text-[11px]">{pick('nkh.noPhone')}</span>}
                    {party.notes || party.address || party.city ? <span className="text-[11px]" dir="auto">{party.notes || [party.address, party.city].filter(Boolean).join(', ')}</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 relative">
                {party.phone ? <a href={`tel:${party.phone}`} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"><PhoneCall className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span className="hidden sm:inline">{pick('nkh.call')}</span></a> : null}
                <button type="button" onClick={() => setWa(true)} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors" data-testid="nkh-wa"><MessageCircle className="w-3.5 h-3.5" /><span>{pick('nkh.waHisaab')}</span></button>
                <button type="button" onClick={() => setEditing(true)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nkh-edit"><Pencil className="w-3.5 h-3.5 text-slate-500" /><span className="hidden sm:inline">{pick('common.edit')}</span></button>
                <div className="relative">
                  <button type="button" onClick={() => setMore(!more)} aria-label={pick('nkh.moreOptions')} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors" data-testid="nkh-more"><MoreHorizontal className="w-4 h-4" /></button>
                  {more ? (
                    <div className="absolute end-0 mt-1.5 w-52 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-40">
                      {canCost ? <button type="button" onClick={() => { setMore(false); open('out', 'old') }} className="w-full px-3.5 py-2 text-start text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-850 flex items-center gap-2 cursor-pointer"><History className="w-3.5 h-3.5 text-slate-400" /><span>{pick('nkh.addOld')}</span></button> : null}
                      <button type="button" onClick={() => { setMore(false); void openPrintable(`/api/v1/exports/parties/${party.id}/statement?format=pdf`) }} className="w-full px-3.5 py-2 text-start text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-850 flex items-center gap-2 cursor-pointer"><Printer className="w-3.5 h-3.5 text-slate-400" /><span>{pick('nkh.printAll')}</span></button>
                      {canCost ? <><div className="my-1 border-t border-slate-100 dark:border-slate-800" /><button type="button" onClick={() => { setMore(false); setRemoving(true) }} className="w-full px-3.5 py-2 text-start text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer" data-testid="nkh-delete"><Trash2 className="w-3.5 h-3.5" /><span>{pick('nkh.deletePerson')}</span></button></> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => open('in', 'bill')} className="flex-1 min-w-[190px] py-3 px-4 rounded-2xl bg-[#9AE600] hover:bg-[#84CC16] active:scale-[0.99] text-slate-950 font-display font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all" data-testid="nkh-in">
                <span className="w-6 h-6 rounded-lg bg-slate-950/10 flex items-center justify-center"><ArrowDownLeft className="w-4 h-4 stroke-[2.5]" /></span>
                <div className="text-start"><div>{pick('nkh.paisaAya')}</div><div className="text-[10px] font-semibold opacity-75">{pick('nkh.paisaAyaSub')}</div></div>
              </button>
              <button type="button" onClick={() => open('out', 'bill')} className="flex-1 min-w-[190px] py-3 px-4 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all" data-testid="nkh-out">
                <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center"><ArrowUpRight className="w-4 h-4 stroke-[2.5]" /></span>
                <div className="text-start"><div>{pick('nkh.paisaDiya')}</div><div className="text-[10px] font-semibold opacity-85">{pick('nkh.paisaDiyaSub')}</div></div>
              </button>
              {canCost ? (
                <button type="button" onClick={() => open('out', 'old')} className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:border-slate-400 dark:hover:border-slate-500 text-slate-800 dark:text-slate-200 font-display font-bold text-xs flex items-center gap-2 cursor-pointer transition-all" data-testid="nkh-old">
                  <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div className="text-start"><div>{pick('nkh.purana')}</div><div className="text-[10px] font-normal text-slate-500">{pick('nkh.puranaSub')}</div></div>
                </button>
              ) : null}
            </div>

            {drawer ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian-850 border-2 border-obsidian-900 dark:border-[#9AE600] space-y-3.5" data-testid="nkh-drawer">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${kind === 'old' ? 'bg-amber-500 text-white' : dir === 'in' ? 'bg-[#9AE600] text-slate-950' : 'bg-rose-500 text-white'}`} data-testid="nkh-drawer-badge">{pick(kind === 'old' ? 'nkh.badgeOld' : dir === 'in' ? 'nkh.badgeIn' : 'nkh.badgeOut')}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{pick(kind === 'old' ? 'nkh.helpOld' : `nkh.help.${kind}.${dir}`)}</span>
                  </div>
                  <button type="button" onClick={() => setDrawer(false)} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{pick('nkh.step1')}</label>
                    <div className={`grid ${canCost ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                      {(['bill', 'lenden', ...(canCost ? ['old'] : [])] as Kind[]).map((k) => (
                        <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`nkh-kind-${k}`} className={`py-2 px-2 rounded-xl text-[11px] cursor-pointer transition-all ${kind === k ? segOn : segOff}`}>
                          {pick(`nkh.kind.${k}`)}<span className="block text-[9px] font-normal opacity-80">{pick(`nkh.kindSub.${k}`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {kind === 'old' ? (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{pick('nkh.oldWhat')}</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={() => setDir('out')} aria-pressed={dir === 'out'} data-testid="nkh-old-lena" className={`py-2 px-3 rounded-xl text-xs cursor-pointer ${dir === 'out' ? 'font-extrabold bg-amber-500 text-white' : segOff}`}>{pick('nkh.oldLena')}</button>
                        <button type="button" onClick={() => setDir('in')} aria-pressed={dir === 'in'} data-testid="nkh-old-dena" className={`py-2 px-3 rounded-xl text-xs cursor-pointer ${dir === 'in' ? 'font-extrabold bg-rose-500 text-white' : segOff}`}>{pick('nkh.oldDena')}</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{pick('nkh.step2')}</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['cash', 'online', 'wallet'] as Mode[]).map((m) => (
                          <button key={m} type="button" onClick={() => { setMode(m); setBank(m === 'wallet' ? 'JazzCash' : '') }} aria-pressed={mode === m} data-testid={`nkh-mode-${m}`} className={`py-2 px-2 rounded-xl text-[11px] cursor-pointer ${mode === m ? segOn : segOff}`}>{pick(`nkh.mode.${m}`)}</button>
                        ))}
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
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nkh.step3')}</label>
                      <div className="flex items-center gap-1" dir="ltr">
                        {[5000, 10000, 50000].map((v) => <button key={v} type="button" onClick={() => setAmount(String((Number(amount) || 0) + v))} className="px-1.5 py-0.5 rounded bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold hover:border-slate-400 cursor-pointer">+{v / 1000}k</button>)}
                        {bal !== 0 && kind !== 'old' ? <button type="button" onClick={() => setAmount(String(Math.abs(bal)))} className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-extrabold cursor-pointer" data-testid="nkh-full">{pick('nkh.fullBal')}</button> : null}
                      </div>
                    </div>
                    <input ref={amountRef} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" dir="ltr" data-testid="nkh-amount" className="w-full px-3.5 py-2.5 rounded-xl font-mono text-base font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]" />
                  </div>
                  <div className={kind === 'lenden' ? 'md:col-span-2' : 'md:col-span-4'}>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{pick('nkh.step4')}</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick('nkh.notePh')} data-testid="nkh-note" className="w-full px-3.5 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none" dir="auto" />
                  </div>
                  {kind === 'lenden' ? (
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{pick('nkh.backBy')}</label>
                      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full px-2.5 py-2.5 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700" dir="ltr" />
                    </div>
                  ) : null}
                  <div className="md:col-span-3">
                    <button type="button" onClick={() => void save()} disabled={busy} className="w-full py-2.5 px-4 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] hover:opacity-95 disabled:opacity-50 text-white dark:text-obsidian-950 font-display font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all" data-testid="nkh-save"><CheckCircle2 className="w-4 h-4" /><span>{pick('nkh.saveEntry')}</span></button>
                  </div>
                </div>
                {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
              </div>
            ) : null}
          </section>

          {/* ===== B. THE WHOLE JOURNEY ===== */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`p-4 rounded-2xl shadow-2xs flex flex-col justify-between border-2 ${balTone === 'amber' ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-400/70' : balTone === 'rose' ? 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-400/70' : 'bg-white dark:bg-obsidian-900 border-emerald-500/40'}`} data-testid="nkh-balance">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick('nkh.balanceNow')}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${balTone === 'amber' ? 'bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200' : balTone === 'rose' ? 'bg-rose-200/80 dark:bg-rose-900 text-rose-900 dark:text-rose-200' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'}`}>{pick(bal > 0 ? 'nkh.tagGet' : bal < 0 ? 'nkh.tagGive' : 'nkh.tagSettled')}</span>
              </div>
              <div className="mt-2">
                <div className={`font-display font-extrabold text-2xl tracking-tight ${balTone === 'amber' ? 'text-amber-700 dark:text-amber-300' : balTone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-[#9AE600]'}`} dir="ltr" data-testid="nkh-bal">{rs(bal)}</div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{t('nkh.asOf', { d: fmtDate(new Date().toISOString()) })} • {pick(bal > 0 ? 'nkh.receivable' : bal < 0 ? 'nkh.payable' : 'nkh.clearAcc')}</div>
              </div>
            </div>
            {canCost && journey ? (
              <>
                <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between" data-testid="nkh-sold">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick('nkh.soldTo')}</span><span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300" dir="ltr">{pick('nkh.profit')}: {profit ? (journey.sold.profit == null ? '—' : `${Number(journey.sold.profit) < 0 ? '−' : ''}${rs(journey.sold.profit)}`) : `${withCur('')}••••`}</span></div>
                  <div className="mt-2"><div className="font-display font-extrabold text-xl text-slate-900 dark:text-white">{t('nkh.phonesN', { n: journey.sold.phones })}</div><div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{t('nkh.billsTotal', { n: journey.sold.bills, total: rs(journey.sold.value) })}</div></div>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between" data-testid="nkh-bought">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick('nkh.boughtFrom')}</span><span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300">{t('nkh.returnsN', { n: journey.returns.sale.count + journey.returns.purchase.count })}</span></div>
                  <div className="mt-2"><div className="font-display font-extrabold text-xl text-slate-900 dark:text-white">{t('nkh.phonesN', { n: journey.bought.phones })}</div><div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{t('nkh.billsTotal', { n: journey.bought.bills, total: rs(journey.bought.value ?? 0) })}</div></div>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col justify-between" data-testid="nkh-flow">
                  <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{pick('nkh.flow')}</span><ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" /></div>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">{pick('nkh.received')}</span><strong className="font-mono text-emerald-600 dark:text-[#9AE600]" dir="ltr">{rs(journey.money.received_total)}</strong></div>
                    <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">{pick('nkh.paid')}</span><strong className="font-mono text-rose-600 dark:text-rose-400" dir="ltr">{rs(journey.money.paid_total ?? 0)}</strong></div>
                  </div>
                </div>
              </>
            ) : null}
          </section>

          {/* ===== C. THE STATEMENT ===== */}
          <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {tabBtn('ledger', 'nkh.tabLedger', rows.length)}
                {canCost ? tabBtn('phones', 'nkh.tabPhones', phonesCount) : null}
                {tabBtn('lenden', 'nkh.tabLenden', (lending?.entries.length ?? 0) + (olds?.length ?? 0))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nkh.filterPh')} data-testid="nkh-q" className="ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none w-44 sm:w-52" />
                </div>
                <select value={when} onChange={(e) => setWhen(e.target.value as typeof when)} className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none cursor-pointer" data-testid="nkh-when">
                  <option value="all">{pick('nkh.allDates')}</option><option value="this">{pick('nkh.thisMonth')}</option><option value="last">{pick('nkh.lastMonth')}</option>
                </select>
                <button type="button" onClick={() => void downloadFile(withDocLang(`/api/v1/exports/parties/${party.id}/statement?format=pdf`), `khata-${party.name}.pdf`)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 text-xs font-bold flex items-center gap-1 cursor-pointer"><Download className="w-3.5 h-3.5 text-slate-500" /><span className="hidden sm:inline">PDF</span></button>
                <button type="button" onClick={() => setWa(true)} className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"><Share2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nkh.share')}</span></button>
              </div>
            </div>

            <div className="overflow-x-auto" data-testid={`nkh-pane-${tab}`}>
              {tab === 'ledger' ? (
                !ledgerRows.length ? (
                  <div className="p-10 text-center space-y-3" data-testid="nkh-empty">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-obsidian-850 text-slate-400 flex items-center justify-center mx-auto"><BookOpenCheck className="w-6 h-6" /></div>
                    <div>
                      <h3 className="font-display font-extrabold text-sm text-slate-900 dark:text-white">{t('nkh.noDealings', { who: name })}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">{pick(rows.length ? 'nkh.noMatch' : 'nkh.noDealingsHint')}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button type="button" onClick={() => open('in', 'bill')} className="px-3.5 py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs cursor-pointer">{pick('nkh.emptyIn')}</button>
                      <button type="button" onClick={() => open('out', 'lenden')} className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-display font-extrabold text-xs cursor-pointer">{pick('nkh.emptyOut')}</button>
                      {canCost ? <button type="button" onClick={() => open('out', 'old')} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-bold cursor-pointer">{pick('nkh.emptyOld')}</button> : null}
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-obsidian-850/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-4 text-start">{pick('nkh.colDate')}</th><th className="py-2.5 px-4 text-start">{pick('nkh.colDesc')}</th>
                        <th className="py-2.5 px-4 text-end">{pick('nkh.colDebit')}</th><th className="py-2.5 px-4 text-end">{pick('nkh.colCredit')}</th><th className="py-2.5 px-4 text-end">{pick('nkh.colRunning')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs" data-testid="nkh-ledger">
                      {[...ledgerRows].reverse().map((r) => {
                        const d = Number(r.debit), c = Number(r.credit), b = Number(r.balance)
                        const to = docLink(r)
                        const badge = r.document_type === 'opening_balance' ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          : r.document_type === 'lending' ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'
                        return (
                          <tr key={r.entry_id} className={`hover:bg-slate-50/70 dark:hover:bg-obsidian-850/40 transition-colors ${r.reversed ? 'opacity-50 line-through' : ''}`}>
                            <td className="py-3 px-4 whitespace-nowrap"><div className="font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">{fmtDate(r.at)}</div></td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900 dark:text-white" dir="auto">{r.memo || docName(r.document_type)}</div>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge}`}>{docName(r.document_type)}</span>
                                {to ? <button type="button" onClick={() => nav(to)} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{pick('nkh.open')}</button> : null}
                                {(r.document_type === 'payment' || r.document_type === 'lending') && r.document_id ? <button type="button" onClick={() => void openPrintable(`/api/v1/payments/${r.document_id}/receipt?format=thermal`)} aria-label={pick('unit.printReceipt')} className="text-slate-400 hover:text-slate-700 cursor-pointer"><Printer className="w-3 h-3" /></button> : null}
                              </div>
                            </td>
                            <td className={`py-3 px-4 text-end font-mono font-bold ${d > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-slate-700'}`} dir="ltr">{d > 0 ? rs(d) : '—'}</td>
                            <td className={`py-3 px-4 text-end font-mono font-bold ${c > 0 ? 'text-emerald-600 dark:text-[#9AE600]' : 'text-slate-300 dark:text-slate-700'}`} dir="ltr">{c > 0 ? rs(c) : '—'}</td>
                            <td className="py-3 px-4 text-end whitespace-nowrap">
                              {b > 0 ? <span className="font-mono font-extrabold text-amber-700 dark:text-amber-300"><span dir="ltr">{rs(b)}</span> <span className="text-[10px] font-sans font-bold">{pick('nkh.lena')}</span></span>
                                : b < 0 ? <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400"><span dir="ltr">{rs(b)}</span> <span className="text-[10px] font-sans font-bold">{pick('nkh.dena')}</span></span>
                                  : <span className="font-mono font-bold text-emerald-600 dark:text-[#9AE600]"><span dir="ltr">{rs(0)}</span> {pick('nkh.clear')}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : tab === 'phones' ? (
                !phoneRows.length ? (
                  <div className="p-10 text-center space-y-2"><div className="text-sm font-bold text-slate-700 dark:text-slate-300">{pick('nkh.noPhones')}</div><div className="text-xs text-slate-500">{t('nkh.noPhonesHint', { who: name })}</div></div>
                ) : (
                  <table className="w-full text-start border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-obsidian-850/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-4 text-start">{pick('nkh.colDir')}</th><th className="py-2.5 px-4 text-start">{pick('nkh.colPhone')}</th><th className="py-2.5 px-4 text-start">{pick('nkh.colBill')}</th>
                        <th className="py-2.5 px-4 text-end">{pick('nkh.colAmount')}</th><th className="py-2.5 px-4 text-end">{pick('nkh.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs" data-testid="nkh-phones">
                      {phoneRows.map((x, i) => {
                        const sold = x.kind === 'sale' || x.kind === 'purchase_return'
                        const to = x.kind === 'sale' ? `/sales/${x.id}` : x.kind === 'sale_return' ? `/sales/${x.ref_id ?? ''}` : '/new/purchases'
                        return (
                          <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-obsidian-850/40">
                            <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${sold ? 'bg-[#9AE600]/25 text-slate-900 dark:text-[#9AE600]' : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'}`}>{pick(`audit.journey.k.${x.kind}`)}</span></td>
                            <td className="py-3 px-4">{x.devices.map((d, j) => <div key={j} className={j ? 'mt-1' : ''}><div className="font-bold text-slate-900 dark:text-white" dir="auto">{d.label}</div>{d.imei1 ? <div className="font-mono text-[11px] text-slate-500" dir="ltr">{d.imei1}</div> : null}</div>)}</td>
                            <td className="py-3 px-4"><button type="button" onClick={() => nav(to)} className="font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" dir="ltr">{x.no}</button><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(x.date)}</div></td>
                            <td className="py-3 px-4 text-end font-mono font-extrabold" dir="ltr">{rs(x.amount)}</td>
                            <td className="py-3 px-4 text-end">{x.status ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300">{pick(`nkh.st.${x.status}`) === `nkh.st.${x.status}` ? x.status : pick(`nkh.st.${x.status}`)}</span> : null}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
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
      </div>

      {wa ? <WaWindow party={party} text={waText} onClose={() => setWa(false)} /> : null}
      {editing ? <EditWindow party={party} onClose={() => setEditing(false)} onDone={() => { setEditing(false); setToast(pick('nkh.savedPerson')) }} /> : null}
      {removing ? <RemoveWindow party={party} onClose={() => setRemoving(false)} /> : null}
      {undoing ? <UndoWindow what={undoing} onClose={() => setUndoing(null)} onDone={() => { setUndoing(null); setToast(pick('nkh.undone')) }} /> : null}

      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#9AE600]" /><span data-testid="nkh-toast">{toast}</span></div>
      </div>
    </div>
  )
}

/** The file's sidebar: the daily counter, khata & parties (People & khata lit), shop & audit, who is logged in. */
function Side() {
  const { pick, ur, cls } = useLang()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const managers = role === 'owner' || role === 'manager'
  const row = 'w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-obsidian-850 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-between cursor-pointer transition-colors'
  const head = `px-2.5 mb-1.5 font-bold uppercase tracking-wider text-slate-400 ${ur ? cls('sm') : 'text-[10px]'}`
  return (
    <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200/90 dark:border-slate-800 z-20 lg:sticky lg:top-0 lg:h-screen" data-testid="nkh-side">
      <NavLink to="/new" className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-[#9AE600] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
        <div className="min-w-0"><div className="font-display font-extrabold text-sm tracking-tight truncate">{name}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</div></div>
      </NavLink>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <div className={head}>{pick('nav.counterSection')}</div>
          <div className="space-y-1">
            <NavLink to="/new/sale/new" className="w-full px-2.5 py-2 rounded-xl bg-[#9AE600]/20 hover:bg-[#9AE600]/30 text-slate-900 dark:text-[#9AE600] font-display font-extrabold text-xs flex items-center justify-between cursor-pointer transition-colors"><span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> {pick('counter.sell')}</span><span className="font-mono text-[10px] opacity-75" dir="ltr">F2</span></NavLink>
            <NavLink to="/new/purchase/new" className={row}><span className="flex items-center gap-2"><PackagePlus className="w-3.5 h-3.5 text-slate-400" /> {pick('counter.addStock')}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">F3</span></NavLink>
            <NavLink to="/new/stock/summary" className={row}><span className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-slate-400" /> {pick('counter.stock')}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">F6</span></NavLink>
            <NavLink to="/new/return/new" className={row}><span className="flex items-center gap-2"><Undo2 className="w-3.5 h-3.5 text-slate-400" /> {pick('counter.returnJob')}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">F9</span></NavLink>
          </div>
        </div>
        <div>
          <div className={head}>{pick('nkh.khataSection')}</div>
          <div className="space-y-1">
            <div className="w-full px-2.5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-between shadow-xs" aria-current="page"><span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-[#9AE600] dark:text-obsidian-950" /> {pick('party.title')}</span><span className="font-mono text-[10px] opacity-80" dir="ltr">F4</span></div>
            <NavLink to="/new/invoices" className={row}><span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-slate-400" /> {pick('inv.short')}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">F10</span></NavLink>
            {managers ? <NavLink to="/new/purchases" className={row}><span className="flex items-center gap-2"><ShoppingBag className="w-3.5 h-3.5 text-slate-400" /> {pick('nav.purchases')}</span></NavLink> : null}
          </div>
        </div>
        <div>
          <div className={head}>{pick('nbuy.shopAudit')}</div>
          <div className="space-y-1">
            {managers ? <NavLink to="/new/audit" className={row}><span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> {pick('audit.title')}</span></NavLink> : null}
            <NavLink to="/new/hisaab" className={row}><span className="flex items-center gap-2"><CalendarCheck className="w-3.5 h-3.5" /> {pick('counter.dayTitle')}</span></NavLink>
            <NavLink to="/new/reports" className={row}><span className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5" /> {pick('more.reports')}</span></NavLink>
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center" dir="ltr">{initials}</div>
        <div className="min-w-0"><div className="text-xs font-bold truncate">{userName}</div><div className="text-[10px] text-slate-400">{role ? pick(`staff.roles.${role}`) : ''}</div></div>
      </div>
    </aside>
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

