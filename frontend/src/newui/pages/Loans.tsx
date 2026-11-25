/** Amanat (loans) in the new product (ADR-134), drawn from `12-loans-amanat.html`: a full screen with
 *  the file's own sidebar (Loans / Amanat lit, with the count out) and bar (cost visible, language,
 *  dark, + Give phone on amanat), four cards (out now, returned, sold to them, the longest out / due),
 *  Out / Returned / Sold tabs with a search, a card per phone with its holder, and on the right the
 *  chosen phone: cost / asking / target profit, the holder with Call and WhatsApp reminder, the
 *  settlement (came back, or they kept it — a sale), the phone's own history and the slip proof.
 *
 *  Everything is the live amanat: `/loans` (and the phone `GET /devices/{id}` with its events, the
 *  holder `GET /parties/{id}`); came back = `POST /loans/{id}/return`, kept = `POST /loans/{id}/sell`
 *  (the live sale, its bill in Sales, the rest on their khata), give = `POST /loans`, delete =
 *  `POST /loans/{id}/cancel` with a reason (ADR-090, owner / manager). Cost and profit only with
 *  VIEW_COST (the server sends no cost to a salesman).
 *
 *  Differences from the drawing: the server has no printed amanat slip, so the slip is a proof on the
 *  screen only; a sold phone's price is on its bill (Open bill); "online" pays into the shop's first
 *  bank / wallet account; the timeline is the phone's own events. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight, BadgeCheck, BarChart3, BookOpen, CheckCircle2, Clock, Copy, Eye, EyeOff, FileText, Languages, MessageCircle, Moon, PackagePlus, PhoneCall,
  Plus, Printer, Receipt, RotateCcw, Search, ShieldCheck, Smartphone, Store, Sun, Tag, Trash2, Undo2, Users, Wrench, X, XCircle,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { isoDay, withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useCashAccounts, useDevices, useGet, useInvalidate, useLoans, useParties } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { DeviceDetail, Loan, Party } from '@/lib/types'

type Tab = 'out' | 'returned' | 'sold'
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime()) / 86_400_000))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const specOf = (d?: { storage_name: string | null; colour_name: string | null } | null) => [d?.storage_name, d?.colour_name].filter(Boolean).join(' ')

export default function NewLoans() {
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

  const [tab, setTab] = useState<Tab>('out')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [showCost, setShowCost] = useState(true)
  const [giving, setGiving] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2800); return () => clearTimeout(x) }, [toast])
  const { data: out } = useLoans({ status: 'out' })
  const { data: returned } = useLoans({ status: 'returned' })
  const { data: sold } = useLoans({ status: 'sold' })
  const { data: onLoan } = useDevices({ status: 'on_loan', limit: 500 })
  const devById = useMemo(() => new Map((onLoan ?? []).map((d) => [d.id, d])), [onLoan])

  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const lists: Record<Tab, Loan[]> = { out: out ?? [], returned: returned ?? [], sold: sold ?? [] }
  const query = q.trim().toLowerCase()
  const shown = lists[tab].filter((l) => !query || `${l.device_label ?? ''} ${l.imei1 ?? ''} ${l.party_name ?? ''}`.toLowerCase().includes(query))
  const loan = shown.find((l) => l.id === sel) ?? shown[0] ?? null
  const outCost = (out ?? []).reduce((s, l) => s + num(devById.get(l.device_id)?.cost_price), 0)
  const due = [...(out ?? [])].filter((l) => l.expected_back_at).sort((a, b) => (a.expected_back_at! < b.expected_back_at! ? -1 : 1))[0]
  const longest = [...(out ?? [])].sort((a, b) => (a.out_at < b.out_at ? -1 : 1))[0]
  const alertLoan = due ?? longest
  const costOk = canCost && showCost

  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" onClick={() => { setTab(k); setSel(null) }} aria-pressed={tab === k} data-testid={`nloan-tab-${k}`} className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}>
      <span>{pick(label)}</span><span className={`px-1.5 rounded-md text-[10px] font-mono ${tab === k ? 'bg-white/20' : 'bg-slate-100 dark:bg-obsidian-850'}`} dir="ltr">{lists[k].length}</span>
    </button>
  )

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nloan" data-newui="1" data-file="12">
      <Side outCount={(out ?? []).length} />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2"><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('loan.title')}</h1><span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">{pick('nloan.badge')}</span></div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nloan.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="nloan-eye">{showCost ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden sm:inline">{pick(showCost ? 'nrep.costVisible' : 'nrep.costHidden')}</span></button> : null}
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nloan-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
            <button type="button" onClick={() => setGiving(true)} className="px-3.5 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="nloan-give"><Plus className="w-4 h-4" />{pick('nloan.give')}</button>
          </div>
        </header>

        <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <button type="button" onClick={() => setTab('out')} className={`p-3.5 rounded-2xl text-start cursor-pointer bg-white dark:bg-obsidian-900 ${tab === 'out' ? 'border-2 border-obsidian-900 dark:border-[#A3E635]' : 'border border-slate-200 dark:border-slate-800'}`} data-testid="nloan-k-out">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nloan.kOut')}</span><span className="w-2 h-2 rounded-full bg-amber-500" /></div>
            <div className="flex items-baseline justify-between mt-1 gap-2"><span className="font-display font-extrabold text-xl">{t('nloan.phones', { n: (out ?? []).length })}</span>{canCost ? <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 font-mono text-[11px] font-bold text-amber-700" dir="ltr">{costOk ? rs(outCost) : '••••'}</span> : null}</div>
          </button>
          <button type="button" onClick={() => setTab('returned')} className={`p-3.5 rounded-2xl text-start cursor-pointer bg-white dark:bg-obsidian-900 ${tab === 'returned' ? 'border-2 border-obsidian-900 dark:border-[#A3E635]' : 'border border-slate-200 dark:border-slate-800'}`} data-testid="nloan-k-returned">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nloan.kReturned')}</span><RotateCcw className="w-3.5 h-3.5 text-slate-400" /></div>
            <div className="flex items-baseline justify-between mt-1 gap-2"><span className="font-display font-extrabold text-xl">{t('nloan.phones', { n: (returned ?? []).length })}</span><span className="text-[11px] text-slate-500">{pick('nloan.backInStock')}</span></div>
          </button>
          <button type="button" onClick={() => setTab('sold')} className={`p-3.5 rounded-2xl text-start cursor-pointer bg-white dark:bg-obsidian-900 ${tab === 'sold' ? 'border-2 border-obsidian-900 dark:border-[#A3E635]' : 'border border-slate-200 dark:border-slate-800'}`} data-testid="nloan-k-sold">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nloan.kSold')}</span><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /></div>
            <div className="flex items-baseline justify-between mt-1 gap-2"><span className="font-display font-extrabold text-xl">{t('nloan.phones', { n: (sold ?? []).length })}</span><span className="text-[11px] text-emerald-700">{pick('nloan.billsInSales')}</span></div>
          </button>
          <button type="button" onClick={() => { if (alertLoan) { setTab('out'); setSel(alertLoan.id) } }} className="p-3.5 rounded-2xl text-start cursor-pointer bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70" data-testid="nloan-k-alert">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">{pick('nloan.kAlert')}</span><Clock className="w-3.5 h-3.5 text-amber-600" /></div>
            {alertLoan ? <><div className="font-display font-extrabold text-sm mt-1">{alertLoan.expected_back_at ? <>{pick('nloan.dueOn')} <span dir="ltr">{fmtDate(alertLoan.expected_back_at)}</span></> : t('nloan.daysOut', { n: daysSince(alertLoan.out_at) })}</div><div className="text-[11px] text-amber-700 dark:text-amber-300 truncate" dir="auto">{alertLoan.party_name} • {t('nloan.daysOut', { n: daysSince(alertLoan.out_at) })}</div></> : <div className="text-xs font-bold mt-1 text-slate-500">{pick('nloan.nothingOut')}</div>}
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
          <div className="w-full lg:w-[55%] lg:h-full flex flex-col min-h-0 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800">
            <div className="shrink-0 px-4 sm:px-6 pt-2 pb-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">{tabBtn('out', 'loan.out')}{tabBtn('returned', 'loan.returned')}{tabBtn('sold', 'loan.sold')}</div>
              <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nloan.search')} className="w-full ps-9 pe-8 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" data-testid="nloan-q" />{q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}</div>
            </div>
            <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 pb-6 space-y-2.5" data-testid="nloan-cards">
              {!shown.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700"><div className="text-sm font-bold">{pick('nloan.none')}</div><div className="text-xs text-slate-500 mt-1">{pick('nloan.noneHint')}</div></div> : shown.map((l) => {
                const on = l.id === loan?.id
                const days = daysSince(l.out_at)
                const warn = l.status === 'out' && (l.overdue || days >= 5)
                const d = devById.get(l.device_id)
                return (
                  <div key={l.id} role="button" tabIndex={0} onClick={() => setSel(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(l.id) }} data-testid="nloan-card" className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-obsidian-900 cursor-pointer transition-all ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] shadow-md' : 'border border-slate-200/90 dark:border-slate-800 hover:border-slate-400 shadow-2xs'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-display font-extrabold text-sm sm:text-[15px] truncate" dir="auto">{l.device_label}</div><div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">{l.imei1 ? <button type="button" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(l.imei1!).catch(() => undefined); setToast(t('nlist.copied', { what: l.imei1 })) }} className="inline-flex items-center gap-1 font-mono bg-slate-100 dark:bg-obsidian-850 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 cursor-pointer" dir="ltr"><span>{l.imei1}</span><Copy className="w-2.5 h-2.5 opacity-70" /></button> : null}{d ? <span className="hidden sm:inline">{specOf(d)}</span> : null}</div></div>
                      <div className="shrink-0">{l.status === 'out' ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${warn ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' : 'bg-slate-100 dark:bg-obsidian-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{warn ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> : null}{l.overdue ? pick('loan.overdue') : t('nloan.daysOut', { n: days })}</span> : l.status === 'returned' ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 border border-emerald-200">{pick('nloan.returnedTick')}</span> : l.status === 'sold' ? <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950">{pick('loan.sold')}</span> : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600">{pick('sale.status.void')}</span>}</div>
                    </div>
                    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50/90 dark:bg-obsidian-850/80 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0"><span className="w-6 h-6 rounded-lg bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 shrink-0"><Store className="w-3.5 h-3.5" /></span><div className="min-w-0"><div className="text-xs font-bold truncate" dir="auto">{l.party_name}</div><div className="text-[10px] text-slate-500">{pick('nloan.given')}: <span dir="ltr">{fmtDate(l.out_at)}</span>{l.status === 'out' && l.expected_back_at ? <> • {pick('nloan.due')}: <strong className={warn ? 'text-amber-600' : ''} dir="ltr">{fmtDate(l.expected_back_at)}</strong></> : null}{l.settled_at ? <> → <span dir="ltr">{fmtDate(l.settled_at)}</span></> : null}</div></div></div>
                      {canCost && d ? <span className="text-[11px] text-slate-500 shrink-0">{pick('nloan.cost')}: <strong className="font-mono text-slate-700 dark:text-slate-300" dir="ltr">{costOk ? rs(d.cost_price) : '••••'}</strong></span> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="w-full lg:w-[45%] lg:h-full lg:overflow-y-auto bg-white dark:bg-obsidian-900 p-4 sm:p-6 space-y-4" data-testid="nloan-detail">
            {loan ? <Detail key={loan.id} loan={loan} costOk={costOk} canCost={canCost} shopName={shop?.name ?? ''} onToast={setToast} onMoved={(to) => { setTab(to); setSel(loan.id) }} /> : <div className="h-full min-h-40 flex items-center justify-center text-xs text-slate-400">{pick('nloan.pick')}</div>}
          </div>
        </div>
      </div>
      {giving ? <GiveDrawer onClose={() => setGiving(false)} onDone={(m) => { setGiving(false); setToast(m); setTab('out'); void inv('loans', 'devices') }} /> : null}
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nloan-toast">{toast}</span></div></div>
    </div>
  )
}

function Detail({ loan, costOk, canCost, shopName, onToast, onMoved }: { loan: Loan; costOk: boolean; canCost: boolean; shopName: string; onToast: (m: string) => void; onMoved: (to: Tab) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const { data: d } = useGet<DeviceDetail>(['device', loan.device_id], `/api/v1/devices/${loan.device_id}`)
  const { data: party } = useGet<Party>(['party', loan.party_id], `/api/v1/parties/${loan.party_id}`)
  const { data: accounts } = useCashAccounts()
  const [selling, setSelling] = useState(false)
  const [price, setPrice] = useState('')
  const [mode, setMode] = useState<'cash' | 'online' | 'khata'>('cash')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [slip, setSlip] = useState(false)
  const [cancel, setCancel] = useState(false)
  useEffect(() => { if (d && !price) setPrice(String(num(d.asking_price))) }, [d, price])
  const isOut = loan.status === 'out'
  const days = daysSince(loan.out_at)
  const warn = isOut && (loan.overdue || days >= 5)
  const bal = num(party?.balance)
  const profit = num(d?.asking_price) - num(d?.cost_price)
  const bank = (accounts ?? []).find((a) => a.kind !== 'cash' && a.kind !== 'cheque' && a.kind !== 'remittance')

  async function back() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/loans/${loan.id}/return`, {}); await inv('loans', 'devices', 'device', 'dashboard'); onToast(pick('loan.backDone')); onMoved('returned') } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  async function sell() {
    const p = Number(price || 0)
    setBusy(true); setErr('')
    try {
      await api('POST', `/api/v1/loans/${loan.id}/sell`, { price: p, paid: mode === 'khata' ? 0 : p, cash_account_id: mode === 'online' ? bank?.id : undefined })
      await inv('loans', 'devices', 'device', 'parties', 'party', 'dashboard', 'day', 'sales')
      onToast(pick('loan.soldDone')); onMoved('sold')
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const remind = () => { const msg = t('nloan.remindText', { who: loan.party_name ?? '', model: loan.device_label ?? '', imei: loan.imei1 ?? '', date: loan.expected_back_at ? fmtDate(loan.expected_back_at) : '—', shop: shopName }); window.open(`https://wa.me/${waNumber(party?.whatsapp || party?.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener') }
  const evName = (type: string) => { const k = `stock.events.${type}`; const v = pick(k); return v === k ? type.replace(/_/g, ' ') : v }

  return (
    <>
      <div className="space-y-2 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {isOut ? <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${warn ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300' : 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 border-blue-200'}`} data-testid="nloan-state"><span className={`w-2 h-2 rounded-full ${warn ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />{t('nloan.outDays', { n: days })}</span>
            : loan.status === 'returned' ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-700 border border-emerald-200" data-testid="nloan-state"><span className="w-2 h-2 rounded-full bg-emerald-500" />{pick('nloan.returnedBig')}</span>
              : loan.status === 'sold' ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950" data-testid="nloan-state"><span className="w-2 h-2 rounded-full bg-[#A3E635] dark:bg-obsidian-950" />{pick('nloan.soldBig')}</span>
                : <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-slate-200 text-slate-600" data-testid="nloan-state">{pick('sale.status.void')}</span>}
          <button type="button" onClick={() => nav(`/new/item/${loan.device_id}`)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer">{pick('nloan.viewStock')}<ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" /></button>
        </div>
        <h2 className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="auto" data-testid="nloan-title">{loan.device_label}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">{loan.imei1 ? <span className="inline-flex items-center gap-1.5 font-mono font-bold bg-slate-100 dark:bg-obsidian-850 px-2.5 py-1 rounded-lg text-slate-800 dark:text-slate-200" dir="ltr">IMEI: {loan.imei1}</span> : null}{d ? <><span>•</span><span>{[specOf(d), pick(`stock.condition.${d.condition}`)].filter(Boolean).join(' · ')}</span></> : null}</div>
      </div>
      {canCost ? (
        <div className="grid grid-cols-3 gap-2.5" data-testid="nloan-money">
          <Fig k="nloan.costPrice" v={costOk ? rs(d?.cost_price) : '••••••'} />
          <Fig k="nloan.askingPrice" v={rs(d?.asking_price)} />
          <Fig k="nloan.targetProfit" v={costOk ? `${profit < 0 ? '−' : '+'}${rs(profit)}` : '••••••'} green />
        </div>
      ) : null}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-obsidian-850/60 border border-slate-200/90 dark:border-slate-800 space-y-2.5" data-testid="nloan-holder">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nloan.holder')}</div><button type="button" onClick={() => nav(`/new/parties/${loan.party_id}`)} className="font-display font-extrabold text-sm mt-0.5 hover:underline cursor-pointer" dir="auto">{loan.party_name}</button><div className="text-[11px] text-slate-500" dir="ltr">{party?.phone ?? ''}</div></div>
          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${bal > 0 ? 'bg-amber-100 text-amber-800' : bal < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 dark:bg-obsidian-800 text-slate-600'}`}>{pick('nloan.khata')}: {bal > 0 ? `${rs(bal)} ${pick('nkh.lena')}` : bal < 0 ? `${rs(bal)} ${pick('nkh.dena')}` : pick('nkh.clear')}</span>
        </div>
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 truncate italic" dir="auto">{loan.notes ? `"${loan.notes}"` : ''}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {party?.phone ? <a href={`tel:${party.phone}`} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-900 text-xs font-bold flex items-center gap-1"><PhoneCall className="w-3.5 h-3.5 text-blue-600" />{pick('nkh.call')}</a> : null}
            {party?.phone && isOut ? <button type="button" onClick={remind} className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nloan-wa"><MessageCircle className="w-3.5 h-3.5" />{pick('nloan.waRemind')}</button> : null}
          </div>
        </div>
      </div>
      {isOut ? (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian-850/90 border border-slate-200/90 dark:border-slate-800 space-y-3" data-testid="nloan-settle">
          <div className="flex items-center justify-between"><span className="text-[11px] font-display font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{pick('nloan.settle')}</span><span className="text-[11px] text-slate-400">{pick('nloan.settleNote')}</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button type="button" onClick={() => void back()} disabled={busy} className="py-2.5 px-3 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nloan-back"><RotateCcw className="w-4 h-4 text-emerald-600" />{pick('loan.markReturned')}</button>
            <button type="button" onClick={() => setSelling(!selling)} className="py-2.5 px-3 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nloan-kept"><BadgeCheck className="w-4 h-4 stroke-[2.5]" />{pick('nloan.kept')}</button>
          </div>
          {selling ? (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3" data-testid="nloan-sell-box">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div><label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">{pick('nloan.dealPrice')}</label><input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-3 py-2 rounded-xl font-mono text-sm font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700" dir="ltr" data-testid="nloan-price" /></div>
                <div><label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">{pick('nloan.payMode')}</label><div className="grid grid-cols-3 gap-1">{(['cash', 'online', 'khata'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} disabled={m === 'online' && !bank} className={`py-2 px-1.5 rounded-xl text-[10px] font-extrabold cursor-pointer disabled:opacity-40 ${mode === m ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-600'}`} data-testid={`nloan-mode-${m}`}>{pick(`nloan.m.${m}`)}</button>)}</div></div>
              </div>
              <p className="text-[11px] text-slate-500">{pick(mode === 'khata' ? 'nloan.khataNote' : 'nloan.paidNote')}</p>
              <button type="button" onClick={() => void sell()} disabled={busy || !(Number(price) > 0)} className="w-full py-2.5 px-4 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nloan-sell"><Receipt className="w-4 h-4" />{pick('nloan.confirmSale')}</button>
            </div>
          ) : null}
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
          {canCost ? <button type="button" onClick={() => setCancel(true)} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer" data-testid="nloan-cancel"><Trash2 className="w-3 h-3" />{pick('del.cancelLoan')}</button> : null}
        </div>
      ) : loan.status === 'sold' && loan.invoice_id ? (
        <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">{pick('nloan.convertedTitle')}</div><div className="font-display font-extrabold text-sm mt-0.5">{pick('nloan.convertedSub')}</div></div><button type="button" onClick={() => nav(`/sales/${loan.invoice_id}`)} className="px-3.5 py-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="nloan-bill"><FileText className="w-3.5 h-3.5" />{pick('nloan.openBill')}</button></div>
      ) : loan.status === 'returned' ? (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-obsidian-850/70 border border-slate-200/80 flex items-center justify-between text-xs"><span><strong>{pick('nloan.returnedOn')}</strong> <span className="font-mono" dir="ltr">{loan.settled_at ? fmtDate(loan.settled_at) : ''}</span></span><span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">{pick('nloan.inStock')}</span></div>
      ) : null}
      <div className="space-y-2" data-testid="nloan-timeline">
        <div className="text-[11px] font-display font-extrabold uppercase tracking-wider text-slate-400">{pick('nloan.timeline')}</div>
        {(d?.recent_events ?? []).slice(0, 8).map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-slate-50/80 dark:bg-obsidian-850/60 border border-slate-200/60 dark:border-slate-800 text-xs">
            <div className="flex items-start gap-2"><span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${e.type === 'loaned_out' ? 'bg-amber-500' : e.type === 'loan_returned' || e.type === 'sold' ? 'bg-emerald-500' : 'bg-slate-400'}`} /><div><div className="font-bold" dir="auto">{evName(e.type)}{e.party_name ? <span className="font-normal"> — {e.party_name}</span> : null}</div><div className="text-[10px] text-slate-400">{e.user_name ?? ''}</div></div></div>
            <span className="font-mono text-[10px] text-slate-500 shrink-0" dir="ltr">{fmtDate(e.at)}</span>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={() => setSlip(!slip)} className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-bold flex items-center justify-between cursor-pointer" data-testid="nloan-slip-toggle"><span className="flex items-center gap-1.5"><Printer className="w-3.5 h-3.5 text-slate-500" />{pick('nloan.slipProof')}</span><span className="text-[11px] text-blue-600">{pick(slip ? 'nloan.hideSlip' : 'nloan.showSlip')}</span></button>
        {slip ? (
          <div className="mt-3 p-4 rounded-xl bg-white text-slate-900 border border-dashed border-slate-300 text-xs space-y-1.5 shadow-xs" data-testid="nloan-slip">
            <div className="text-center border-b border-dashed border-slate-300 pb-2"><div className="font-display font-extrabold uppercase" dir="auto">{shopName}</div><div className="text-[10px] text-slate-500">{pick('nloan.slipTitle')}</div></div>
            <SlipRow k="nloan.holder" v={<strong dir="auto">{loan.party_name}</strong>} />
            <SlipRow k="nloan.device" v={<strong dir="auto">{loan.device_label}</strong>} />
            <SlipRow k="IMEI" v={<span className="font-mono" dir="ltr">{loan.imei1}</span>} />
            <SlipRow k="nloan.given" v={<span dir="ltr">{fmtDate(loan.out_at)}</span>} />
            <SlipRow k="nloan.due" v={<strong dir="ltr">{loan.expected_back_at ? fmtDate(loan.expected_back_at) : '—'}</strong>} />
            <div className="pt-1 border-t border-slate-200"><SlipRow k="nloan.agreedValue" v={<strong dir="ltr">{rs(d?.asking_price)}</strong>} /></div>
            <p className="pt-2 text-center text-[10px] text-slate-400">{pick('nloan.slipNote')}</p>
          </div>
        ) : null}
      </div>
      {cancel ? <CancelWindow id={loan.id} onClose={() => setCancel(false)} onDone={() => { setCancel(false); onToast(pick('nkh.undone')); void inv('loans', 'devices', 'device') }} /> : null}
    </>
  )
}

function Fig({ k, v, green }: { k: string; v: string; green?: boolean }) {
  const { pick } = useLang()
  return <div className={`p-3 rounded-xl border ${green ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/70' : 'bg-slate-50 dark:bg-obsidian-850 border-slate-200/70 dark:border-slate-800'}`}><div className={`text-[10px] font-bold uppercase ${green ? 'text-emerald-700' : 'text-slate-400'}`}>{pick(k)}</div><div className={`font-display font-extrabold text-sm mt-0.5 ${green ? 'text-emerald-700 dark:text-[#A3E635]' : ''}`} dir="ltr">{v}</div></div>
}
function SlipRow({ k, v }: { k: string; v: ReactNode }) {
  const { pick } = useLang()
  return <div className="flex justify-between gap-2"><span>{k === 'IMEI' ? k : pick(k)}:</span>{v}</div>
}

function CancelWindow({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nloan-cancel-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('del.cancelLoan')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <p className="text-xs text-slate-500">{pick('del.loan.effect')}</p>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('bill.reasonPh')} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nloan-cancel-why" />
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || why.trim().length < 3} onClick={async () => { setBusy(true); setErr(''); try { await api('POST', `/api/v1/loans/${id}/cancel`, { reason: why.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-rose-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nloan-cancel-yes">{pick('nkh.confirmDelete')}</button></div>
      </div>
    </div>
  )
}

/** "+ Give phone on amanat": which phone (in stock) → to whom (anyone of the shop's people) → back in how many days, a note. */
function GiveDrawer({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const [dq, setDq] = useState('')
  const [pq, setPq] = useState('')
  const { data: stock } = useDevices({ status: 'in_stock', q: dq.trim() || undefined, limit: 30 })
  const { data: people } = useParties(pq.trim() ? { q: pq.trim() } : {})
  const [devId, setDevId] = useState('')
  const [party, setParty] = useState<Party | null>(null)
  const [days, setDays] = useState<number | null>(7)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dev = stock?.find((d) => d.id === devId)
  async function give() {
    if (!devId || !party) return
    setBusy(true); setErr('')
    try { await api('POST', '/api/v1/loans', { device_id: devId, party_id: party.id, expected_back_at: days ? isoDay(days) : undefined, notes: notes.trim() || undefined }); onDone(pick('loan.givenDone')) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const row = (on: boolean) => `w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-slate-50 dark:bg-obsidian-850' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'}`
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="nloan-drawer">
      <div className="w-full max-w-md h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div><h3 className="font-display font-extrabold text-sm">{pick('nloan.give')}</h3><p className="text-[11px] text-slate-500">{pick('loan.giveHint')}</p></div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">1. {pick('loan.pickPhone')}</label>
            <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={dq} onChange={(e) => setDq(e.target.value)} placeholder={pick('nloan.searchStock')} className="w-full ps-8 pe-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nloan-dq" /></div>
            <div className="max-h-56 overflow-y-auto space-y-1.5" data-testid="nloan-stock">{(stock ?? []).map((d) => <button key={d.id} type="button" onClick={() => setDevId(d.id)} className={row(devId === d.id)}><span className="min-w-0"><span className="font-bold block truncate" dir="auto">{d.brand_name} {d.model_name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{d.imei1}</span></span><span className="text-[10px] text-slate-500 shrink-0">{specOf(d)}</span></button>)}{stock && !stock.length ? <p className="text-[11px] text-slate-400">{pick('nloan.noStock')}</p> : null}</div>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">2. {pick('loan.whichShop')}</label>
            <div className="relative"><Users className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={pq} onChange={(e) => setPq(e.target.value)} placeholder={pick('nlist.partySearch')} className="w-full ps-8 pe-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nloan-pq" /></div>
            <div className="max-h-48 overflow-y-auto space-y-1.5" data-testid="nloan-people">{(people ?? []).slice(0, 10).map((p) => <button key={p.id} type="button" onClick={() => setParty(p)} className={row(party?.id === p.id)}><span className="font-bold truncate" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone ?? ''}</span></button>)}</div>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">3. {pick('loan.backIn')}</label>
            <div className="flex flex-wrap gap-1.5">{[3, 7, 15, 30].map((d) => <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${days === d ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`}>{pick('loan.days').replace('{{n}}', String(d))}</button>)}<button type="button" onClick={() => setDays(null)} aria-pressed={days === null} className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${days === null ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`}>{pick('loan.noDate')}</button></div>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={pick('nloan.notePh')} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" dir="auto" />
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          {dev && party ? <p className="text-[11px] text-slate-500 mb-2" dir="auto">{dev.brand_name} {dev.model_name} → {party.name}</p> : null}
          <button type="button" onClick={() => void give()} disabled={busy || !devId || !party} className="w-full py-3 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer" data-testid="nloan-give-save"><Plus className="w-4 h-4" />{pick('loan.new')}</button>
        </div>
      </div>
    </div>
  )
}

/** The file's sidebar: the daily counter, stock & amanat (Loans lit with the count out), shop & audit, who is logged in. */
function Side({ outCount }: { outCount: number }) {
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
  const link = (to: string, Icon: typeof Tag, label: string, key?: string) => <NavLink key={to} to={to} className={row}><span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /> {pick(label)}</span>{key ? <span className="font-mono text-[10px] text-slate-400" dir="ltr">{key}</span> : null}</NavLink>
  return (
    <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200/90 dark:border-slate-800 z-20 lg:h-screen" data-testid="nloan-side">
      <NavLink to="/new" className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5"><div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs" dir="ltr">{mark}</div><div className="min-w-0"><div className="font-display font-extrabold text-sm truncate">{name}</div><div className="text-[11px] text-slate-500 truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</div></div></NavLink>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div><div className={head}>{pick('nav.counterSection')}</div><div className="space-y-1">
          <NavLink to="/new/sale/new" className="w-full px-2.5 py-2 rounded-xl bg-[#A3E635]/20 hover:bg-[#A3E635]/30 text-slate-900 dark:text-[#A3E635] font-display font-extrabold text-xs flex items-center justify-between"><span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> {pick('counter.sell')}</span><span className="font-mono text-[10px] opacity-75" dir="ltr">F2</span></NavLink>
          {link('/new/purchase/new', PackagePlus, 'counter.addStock', 'F3')}{link('/new/khata', BookOpen, 'counter.khata', 'F4')}{link('/new/return/new', Undo2, 'counter.returnJob', 'F9')}
        </div></div>
        <div><div className={head}>{pick('nloan.stockSection')}</div><div className="space-y-1">
          {link('/new/stock/summary', Smartphone, 'counter.stock', 'F6')}
          <div className="w-full px-2.5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-between" aria-current="page"><span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#A3E635] dark:text-obsidian-950" /> {pick('nloan.navTitle')}</span><span className="px-1.5 rounded-md bg-[#A3E635] text-slate-950 text-[10px] font-extrabold dark:bg-obsidian-950 dark:text-[#A3E635]" dir="ltr">{outCount}</span></div>
          {link('/new/repairs', Wrench, 'counter.repair', 'F7')}
        </div></div>
        <div><div className={head}>{pick('nbuy.shopAudit')}</div><div className="space-y-1">
          {link('/new/invoices', FileText, 'inv.short')}{link('/new/khata', Users, 'party.title')}{managers ? link('/new/audit', ShieldCheck, 'audit.title') : null}{link('/new/reports', BarChart3, 'more.reports')}
        </div></div>
      </div>
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 font-bold text-xs flex items-center justify-center" dir="ltr">{initials}</div><div className="min-w-0"><div className="text-xs font-bold truncate">{userName}</div><div className="text-[10px] text-slate-400">{role ? pick(`staff.roles.${role}`) : ''}</div></div></div>
    </aside>
  )
}
