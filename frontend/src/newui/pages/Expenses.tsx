/** Expenses & day closing in the new product (ADR-134), drawn from `05-expenses-and-day-closing.html`:
 *  a full screen with the file's rail (Expense F8 lit) and bar (CSV, WhatsApp, language, dark), four
 *  cards (cash in today, cash out today, the shown expenses, expected in the drawer), a left panel
 *  with two tabs — "+ Quick expense" (category pills, paid from galla or bank, amount with +100 /
 *  +500 / +1,000 / +5,000, a note, Save) and "Close the day" (the galla's waterfall, counted cash,
 *  match expected, the difference and the closing slip) — and on the right the expense list with
 *  dates, a search, the spend bar, category chips, edit / delete and the footer.
 *
 *  Everything is the live software's: categories and expenses (`/expenses`, owner / manager — the
 *  server's EXPENSES capability), the galla's day preview and close (`/expenses/day-close/preview`,
 *  `/expenses/day-close`, `/expenses/day-close` list), edit = the live replace (`PUT /expenses/{id}`)
 *  and delete = the live void with a reason (kept as Deleted).
 *
 *  Differences from the drawing: "Show sample shop entries" is sample and not built; the slip is shown
 *  on screen and "Lock & close day" saves the closing (the server has no printable Z-report yet, so
 *  the device's print window prints the screen); a closed day shows what was counted and the
 *  difference; the spend bar's legend shows amounts (the bar's widths are the shares). */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, Building2, CheckCircle2, Coffee, Download, HandCoins, Landmark, Languages, Lock, Moon,
  MoreHorizontal, Pencil, PlusCircle, Printer, Receipt, Search, Share2, ShoppingBag, Sun, Tag, Trash2, Truck, UserCheck, Users, Wifi, Wrench, X, Zap,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { isoDay, withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { LOCALES, setLocale } from '@/i18n'
import { useCashAccounts, useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import FileRail from '@/newui/FileRail'

type M = string
type When = 'all' | 'today' | 'yesterday' | 'week' | 'month'
interface Category { id: string; key: string; name: string; name_ur: string | null }
interface Expense { id: string; no: string; category_id: string; category_key: string; category_name: string | null; amount: M; cash_account_id: string; date: string; description: string | null; notes: string | null; status: string; created_at: string; party_id: string | null; staff_user_id: string | null }
interface Preview { cash_account_id: string; date: string; opening: M; cash_in: M; cash_out: M; expected: M; closed: boolean }
interface Close { id: string; date: string; cash_account_id: string; expected: M; counted: M; difference: M; closed_at: string }

const LIME = '#A3E635'
const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: M | number) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const signed = (v: M | number) => `${num(v) < 0 ? '− ' : ''}${rs(v)}`
const plus = (v: M | number) => `${num(v) < 0 ? '− ' : '+ '}${rs(v)}`
const META: Record<string, { Icon: typeof Tag; color: string }> = {
  rent: { Icon: Building2, color: '#6366F1' }, electricity: { Icon: Zap, color: '#F59E0B' }, salary: { Icon: Users, color: '#10B981' },
  advance: { Icon: HandCoins, color: '#14B8A6' }, repair_parts: { Icon: Wrench, color: '#3B82F6' }, transport: { Icon: Truck, color: '#8B5CF6' },
  tea: { Icon: Coffee, color: '#84CC16' }, mobile_bill: { Icon: Wifi, color: '#06B6D4' }, tax_fee: { Icon: Receipt, color: '#EC4899' },
  other_purchases: { Icon: ShoppingBag, color: '#F97316' }, owner_drawing: { Icon: UserCheck, color: '#EF4444' }, other: { Icon: MoreHorizontal, color: '#64748B' },
}
const meta = (key: string) => META[key] ?? { Icon: Tag, color: '#64748B' }
const range = (w: When): { from?: string; to?: string } => w === 'today' ? { from: isoDay(0), to: isoDay(0) } : w === 'yesterday' ? { from: isoDay(-1), to: isoDay(-1) } : w === 'week' ? { from: isoDay(-6), to: isoDay(0) } : w === 'month' ? { from: isoDay(1 - new Date().getDate()), to: isoDay(0) } : {}
const time = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

export default function NewExpenses() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const can = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const [when, setWhen] = useState<When>('all')
  const r = range(when)
  const qs = new URLSearchParams({ limit: '500', ...(r.from ? { date_from: r.from, date_to: r.to! } : {}) }).toString()
  const { data: cats } = useGet<Category[]>(['exp-cats'], can ? '/api/v1/expenses/categories' : null)
  const { data: rows } = useGet<Expense[]>(['expenses', when], can ? `/api/v1/expenses?${qs}` : null)
  const { data: preview } = useGet<Preview>(['day-preview'], can ? '/api/v1/expenses/day-close/preview' : null)
  const { data: closes } = useGet<Close[]>(['day-closes'], can ? '/api/v1/expenses/day-close' : null)
  const { data: accounts } = useCashAccounts()
  const accName = (id: string) => { const a = accounts?.find((x) => x.id === id); return a ? (ur && a.name_ur ? a.name_ur : a.name) : '' }
  const isGalla = (id: string) => accounts?.find((x) => x.id === id)?.kind === 'cash'
  const catName = (c: { key: string; name: string; name_ur: string | null }) => (ur && c.name_ur ? c.name_ur : c.name)
  const catOf = (e: Expense) => cats?.find((c) => c.key === e.category_key || c.id === e.category_id)

  /* the left panel */
  const [tab, setTab] = useState<'expense' | 'close'>('expense')
  const [catId, setCatId] = useState('')
  const [src, setSrc] = useState<'cash' | 'bank'>('cash')
  const [bankId, setBankId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [idem, setIdem] = useState(uid)
  const [counted, setCounted] = useState('')
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])
  useEffect(() => { if (!catId && cats?.length) setCatId(cats.find((c) => c.key === 'tea')?.id ?? cats[0].id) }, [cats, catId])
  const banks = (accounts ?? []).filter((a) => a.kind !== 'cash' && a.kind !== 'cheque' && a.kind !== 'remittance')
  useEffect(() => { if (!bankId && banks.length) setBankId(banks[0].id) }, [banks, bankId])

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const list = useMemo(() => rows ?? [], [rows])
  const live = list.filter((e) => e.status !== 'voided')
  const query = q.trim().toLowerCase()
  const shown = list.filter((e) => (catFilter === 'all' || e.category_key === catFilter) && (!query || `${catOf(e) ? catName(catOf(e)!) : e.category_name ?? ''} ${e.description ?? ''} ${accName(e.cash_account_id)} ${fmtDate(e.date)}`.toLowerCase().includes(query)))
  const total = live.reduce((s, e) => s + num(e.amount), 0)
  const shownTotal = shown.filter((e) => e.status !== 'voided').reduce((s, e) => s + num(e.amount), 0)
  const byCat = Object.entries(live.reduce<Record<string, number>>((m, e) => { m[e.category_key] = (m[e.category_key] ?? 0) + num(e.amount); return m }, {})).sort((a, b) => b[1] - a[1])
  const catLabel = (key: string) => { const c = cats?.find((x) => x.key === key); return c ? catName(c) : list.find((e) => e.category_key === key)?.category_name ?? key }
  const expected = num(preview?.expected)
  const todayClose = closes?.find((c) => c.date === preview?.date && c.cash_account_id === preview?.cash_account_id)
  const closed = !!preview?.closed
  const diff = counted === '' ? null : Number(counted) - expected

  function startEdit(e: Expense) {
    setTab('expense'); setEditing(e); setCatId(e.category_id); setAmount(String(num(e.amount))); setNote(e.description ?? '')
    setSrc(isGalla(e.cash_account_id) ? 'cash' : 'bank'); if (!isGalla(e.cash_account_id)) setBankId(e.cash_account_id)
  }
  function resetForm() { setEditing(null); setAmount(''); setNote(''); setErr(''); setIdem(uid()) }

  async function save() {
    if (!catId || !(Number(amount) > 0)) { setErr(pick('nexp.needAmount')); return }
    if (src === 'bank' && !bankId) { setErr(pick('nexp.noBank')); return }
    setBusy(true); setErr('')
    const body = { category_id: catId, amount: Number(amount), description: note.trim() || null, cash_account_id: src === 'bank' ? bankId : undefined }
    try {
      if (editing) await api('PUT', `/api/v1/expenses/${editing.id}`, { ...body, cash_account_id: src === 'bank' ? bankId : editing.cash_account_id, date: editing.date, party_id: editing.party_id, staff_user_id: editing.staff_user_id, notes: editing.notes })
      else await api('POST', '/api/v1/expenses', body, { idempotencyKey: idem })
      await inv('expenses', 'day-preview', 'day-closes', 'cash', 'book', 'day', 'dashboard', 'accounts')
      setToast(t(editing ? 'nexp.edited' : 'nexp.saved', { n: rs(Number(amount)) }))
      resetForm()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }

  async function closeDay() {
    if (counted === '') return
    setBusy(true); setErr('')
    try {
      await api('POST', '/api/v1/expenses/day-close', { counted: Number(counted) })
      await inv('day-preview', 'day-closes', 'day', 'dashboard')
      setToast(pick('nexp.closedToast')); setCounted('')
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }

  function csv() {
    const head = [pick('nexp.colDate'), pick('nexp.colCat'), pick('nexp.colNote'), pick('nexp.colFrom'), pick('nexp.colAmount'), pick('nexp.colStatus')]
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [head, ...shown.map((e) => [fmtDate(e.date), catOf(e) ? catName(catOf(e)!) : e.category_name ?? '', e.description ?? '', accName(e.cash_account_id), e.amount, e.status === 'voided' ? pick('sale.status.void') : ''])].map((l) => l.map((x) => esc(String(x))).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })); a.download = 'expenses.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  function share() {
    const lines = [t('nexp.waHead', { shop: shop?.name ?? '' }), t('nexp.waTotal', { n: rs(total), count: live.length }), ...byCat.slice(0, 6).map(([k, v]) => `• ${catLabel(k)}: ${rs(v)}`), preview ? t('nexp.waDrawer', { n: signed(expected) }) : ''].filter(Boolean)
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener')
  }

  const datePill = (w: When, label: string) => <button key={w} type="button" onClick={() => setWhen(w)} aria-pressed={when === w} data-testid={`nexp-d-${w}`} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer whitespace-nowrap ${when === w ? 'font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`}>{pick(label)}</button>
  const lab = 'text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400'
  const selCat = cats?.find((c) => c.id === catId)

  return (
    <div style={{ '--nl': LIME } as CSSProperties} className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nexp" data-newui="1" data-file="05">
      <FileRail lit="/new/expenses" lime={LIME} testid="nexp-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        {/* ===== BAR ===== */}
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => nav('/new')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('common.back')}</span></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base tracking-tight'}>{pick('nexp.title')}</h1>
                <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-extrabold bg-[#A3E635]/30 text-slate-900 dark:text-[var(--nl)]" dir="ltr">F8</span>
                {closed ? <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" data-testid="nexp-closed-badge">{pick('nexp.dayClosed')}</span> : null}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nexp.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can ? <button type="button" onClick={csv} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"><Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" /><span className="hidden sm:inline">{pick('nexp.csv')}</span></button> : null}
            {can ? <button type="button" onClick={share} className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"><Share2 className="w-3.5 h-3.5" /><span className="hidden md:inline">{pick('nexp.wa')}</span></button> : null}
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nexp-lang"><Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[var(--nl)]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </header>

        {!can ? (
          <div className="flex-1 flex items-center justify-center p-8" data-testid="nexp-no-access"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8"><p className="font-bold text-sm">{pick('nexp.noAccess')}</p></div></div>
        ) : (
          <>
            {/* ===== FOUR CARDS ===== */}
            <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nexp.cashIn')}</span><span className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><ArrowDownLeft className="w-3.5 h-3.5" /></span></div>
                <div className="font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 text-emerald-600 dark:text-emerald-400" dir="ltr" data-testid="nexp-in">{rs(num(preview?.cash_in))}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nexp.cashInSub')}</div>
              </div>
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nexp.cashOut')}</span><span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center"><ArrowUpRight className="w-3.5 h-3.5" /></span></div>
                <div className="font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 text-slate-900 dark:text-white" dir="ltr" data-testid="nexp-out">{rs(num(preview?.cash_out))}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nexp.cashOutSub')}</div>
              </div>
              <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nexp.shopExp')}</span><span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300">{t('nexp.entries', { n: live.length })}</span></div>
                <div className="font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 text-slate-900 dark:text-[var(--nl)]" dir="ltr" data-testid="nexp-total">{rs(total)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick(`nexp.w.${when}`)}</div>
              </div>
              <button type="button" onClick={() => setTab('close')} className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 dark:bg-obsidian-900 border border-slate-800 text-white shadow-xs cursor-pointer hover:border-[#A3E635]/60 transition-all text-start" data-testid="nexp-drawer-card">
                <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nexp.expected')}</span><span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${expected < 0 ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>{pick(expected < 0 ? 'nexp.negative' : closed ? 'nexp.closedShort' : 'nexp.open')}</span></div>
                <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${expected < 0 ? 'text-rose-400' : 'text-[var(--nl)]'}`} dir="ltr" data-testid="nexp-expected">{signed(expected)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nexp.expectedSub')}</div>
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden px-4 sm:px-6 pb-4 pt-2 gap-4">
              {/* ===== LEFT: QUICK EXPENSE / CLOSE THE DAY ===== */}
              <section className="w-full lg:w-[42%] lg:h-full bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col overflow-hidden">
                <div className="p-2 bg-slate-100/90 dark:bg-obsidian-850 border-b border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-1.5 shrink-0">
                  <button type="button" onClick={() => setTab('expense')} aria-pressed={tab === 'expense'} data-testid="nexp-tab-expense" className={`py-2.5 px-3 rounded-xl font-display text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${tab === 'expense' ? 'font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 shadow-2xs' : 'font-bold bg-transparent hover:bg-white/70 dark:hover:bg-obsidian-900/70 text-slate-600 dark:text-slate-300'}`}><PlusCircle className="w-3.5 h-3.5" /><span>{pick(editing ? 'nexp.editTab' : 'nexp.quickTab')}</span></button>
                  <button type="button" onClick={() => setTab('close')} aria-pressed={tab === 'close'} data-testid="nexp-tab-close" className={`py-2.5 px-3 rounded-xl font-display text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${tab === 'close' ? 'font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 shadow-2xs' : 'font-bold bg-transparent hover:bg-white/70 dark:hover:bg-obsidian-900/70 text-slate-600 dark:text-slate-300'}`}><Lock className="w-3.5 h-3.5" /><span>{pick('nexp.closeTab')}</span></button>
                </div>

                {tab === 'expense' ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="nexp-form">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2"><label className={lab}>{pick('nexp.step1')}</label><span className="text-[11px] font-extrabold text-emerald-700 dark:text-[var(--nl)]" dir="auto">{selCat ? catName(selCat) : ''}</span></div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" data-testid="nexp-cats">
                          {(cats ?? []).map((c) => { const on = c.id === catId; const { Icon } = meta(c.key); return (
                            <button key={c.id} type="button" onClick={() => setCatId(c.id)} aria-pressed={on} data-testid={`nexp-cat-${c.key}`} className={`p-2 rounded-xl border text-start transition-all flex items-center gap-1.5 cursor-pointer ${on ? 'bg-slate-900 dark:bg-[var(--nl)] border-slate-900 dark:border-[var(--nl)] text-white dark:text-obsidian-950 font-extrabold shadow-2xs' : 'bg-slate-50/80 dark:bg-obsidian-850/70 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold'}`}>
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${on ? 'text-[var(--nl)] dark:text-obsidian-950' : 'text-slate-400'}`} /><span className="text-[11px] leading-tight truncate" dir="auto">{catName(c)}</span>
                            </button>
                          ) })}
                        </div>
                      </div>
                      <div>
                        <label className={`block mb-1.5 ${lab}`}>{pick('nexp.step2')}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setSrc('cash')} aria-pressed={src === 'cash'} className={`p-2.5 rounded-xl font-display text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${src === 'cash' ? 'border-2 border-slate-900 dark:border-[var(--nl)] bg-slate-900 dark:bg-obsidian-850 text-white font-extrabold' : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850/60 text-slate-700 dark:text-slate-300 font-bold hover:border-slate-300'}`}><Banknote className="w-4 h-4 text-[var(--nl)]" /><span>{pick('nexp.galla')}</span></button>
                          <button type="button" onClick={() => setSrc('bank')} aria-pressed={src === 'bank'} disabled={!banks.length} title={!banks.length ? pick('nexp.noBank') : undefined} data-testid="nexp-src-bank" className={`p-2.5 rounded-xl font-display text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${src === 'bank' ? 'border-2 border-slate-900 dark:border-[var(--nl)] bg-slate-900 dark:bg-obsidian-850 text-white font-extrabold' : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850/60 text-slate-700 dark:text-slate-300 font-bold hover:border-slate-300'}`}><Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" /><span>{pick('nexp.bank')}</span></button>
                        </div>
                        {src === 'bank' && banks.length > 1 ? <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="mt-2 w-full px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700">{banks.map((b) => <option key={b.id} value={b.id}>{accName(b.id)}</option>)}</select> : null}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5"><label className={lab}>{pick('nexp.step3')} *</label><button type="button" onClick={() => setAmount('')} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer">{pick('nexp.clear')}</button></div>
                        <div className="relative" dir="ltr">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-display font-extrabold text-sm text-slate-400">{withCur('').trim()}</span>
                          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" data-testid="nexp-amount" className="w-full pl-11 pr-4 py-2.5 rounded-xl font-mono text-lg font-extrabold tabular-nums bg-slate-50 dark:bg-obsidian-850 border-2 border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-900 dark:focus:border-[var(--nl)]" />
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 mt-2" dir="ltr">
                          {[100, 500, 1000, 5000].map((v) => <button key={v} type="button" onClick={() => setAmount(String((Number(amount) || 0) + v))} className="py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-850 hover:bg-[#A3E635]/30 dark:hover:bg-[#A3E635]/20 border border-slate-200/80 dark:border-slate-700 font-mono text-[11px] font-extrabold tabular-nums text-slate-700 dark:text-slate-200 cursor-pointer transition-colors" data-testid={`nexp-plus-${v}`}>+{v.toLocaleString('en-US')}</button>)}
                        </div>
                      </div>
                      <div>
                        <label className={`block mb-1.5 ${lab}`}>{pick('nexp.step4')}</label>
                        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick('nexp.notePh')} data-testid="nexp-note" dir="auto" className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-900 dark:focus:border-[var(--nl)]" />
                      </div>
                      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
                    </div>
                    <div className="p-3.5 bg-slate-50/90 dark:bg-obsidian-850/90 border-t border-slate-200/80 dark:border-slate-800 shrink-0 flex gap-2">
                      {editing ? <button type="button" onClick={resetForm} className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">{pick('common.cancel')}</button> : null}
                      <button type="button" onClick={() => void save()} disabled={busy} className="flex-1 py-3 px-4 rounded-xl bg-[var(--nl)] hover:brightness-95 disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors" data-testid="nexp-save"><CheckCircle2 className="w-4 h-4 stroke-[2.5]" /><span>{pick(editing ? 'nlist.saveChanges' : 'nexp.save')}</span></button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="nexp-close">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                      <div className="rounded-2xl bg-slate-900 dark:bg-obsidian-950 border border-slate-800 p-4 text-white space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nexp.waterfall')}</span><span className="font-mono text-[10px] text-[var(--nl)]" dir="ltr">{preview ? fmtDate(preview.date) : ''}</span></div>
                        <div className="flex items-center justify-between text-xs"><span className="text-slate-400">{pick('nexp.opening')}</span><span className="font-mono font-bold tabular-nums text-slate-300" dir="ltr">{signed(num(preview?.opening))}</span></div>
                        <div className="flex items-center justify-between text-xs"><span className="text-emerald-400 font-semibold">(+) {pick('nexp.inShort')}</span><span className="font-mono font-bold tabular-nums text-emerald-400" dir="ltr">{plus(num(preview?.cash_in))}</span></div>
                        <div className="flex items-center justify-between text-xs"><span className="text-amber-400 font-semibold">(−) {pick('nexp.outShort')}</span><span className="font-mono font-bold tabular-nums text-amber-400" dir="ltr">− {rs(num(preview?.cash_out))}</span></div>
                        <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between"><span className="font-display font-extrabold text-xs sm:text-sm text-white">(=) {pick('nexp.expected')}</span><span className={`font-display font-extrabold text-base sm:text-lg tabular-nums ${expected < 0 ? 'text-rose-400' : 'text-[var(--nl)]'}`} dir="ltr" data-testid="nexp-wf-expected">{signed(expected)}</span></div>
                      </div>
                      {closed ? (
                        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1.5 text-xs" data-testid="nexp-closed">
                          <div className="font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{pick('nexp.dayClosed')}</div>
                          {todayClose ? <><div className="flex justify-between"><span>{pick('nexp.counted')}</span><span className="font-mono font-bold" dir="ltr">{rs(todayClose.counted)}</span></div><div className="flex justify-between"><span>{pick('nexp.difference')}</span><span className={`font-mono font-bold ${num(todayClose.difference) < 0 ? 'text-rose-600' : 'text-emerald-700'}`} dir="ltr">{plus(todayClose.difference)}</span></div></> : null}
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 space-y-2.5">
                          <div className="flex items-center justify-between"><label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{pick('nexp.countedLabel')}</label><button type="button" onClick={() => setCounted(String(Math.max(0, Math.round(expected))))} className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 font-display font-extrabold text-[10px] cursor-pointer hover:opacity-90 transition-opacity" data-testid="nexp-match">{pick('nexp.match')}</button></div>
                          <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={pick('nexp.countedPh')} dir="ltr" data-testid="nexp-counted" className="w-full px-3.5 py-2.5 rounded-xl font-mono text-base font-extrabold tabular-nums bg-white dark:bg-obsidian-900 border-2 border-slate-300 dark:border-slate-700 focus:outline-none focus:border-slate-900 dark:focus:border-[var(--nl)]" />
                          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${diff == null ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70' : diff === 0 ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70' : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70'}`}>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{pick('nexp.variance')}</span>
                            <span className="px-2 py-0.5 rounded-md font-mono text-xs font-extrabold tabular-nums bg-white/70 dark:bg-obsidian-900/70" dir="ltr" data-testid="nexp-variance">{diff == null ? pick('nexp.enterCounted') : diff === 0 ? pick('nexp.matches') : `${plus(diff)} ${pick(diff < 0 ? 'nexp.short' : 'nexp.extra')}`}</span>
                          </div>
                        </div>
                      )}
                      <div className="p-3.5 rounded-2xl bg-white dark:bg-obsidian-950 border border-dashed border-slate-300 dark:border-slate-700 font-mono text-[11px] space-y-1.5" dir="ltr" data-testid="nexp-slip">
                        <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-1.5"><div className="font-display font-extrabold text-xs uppercase tracking-wider">{shop?.name}</div><div className="text-[10px] text-slate-400">{pick('nexp.slipTitle')} • {preview ? fmtDate(preview.date) : ''}</div></div>
                        <div className="flex justify-between"><span>{pick('nexp.opening')}:</span><span>{signed(num(preview?.opening))}</span></div>
                        <div className="flex justify-between"><span>(+) {pick('nexp.inShort')}:</span><span>{plus(num(preview?.cash_in))}</span></div>
                        <div className="flex justify-between"><span>(−) {pick('nexp.outShort')}:</span><span>− {rs(num(preview?.cash_out))}</span></div>
                        <div className="flex justify-between font-bold border-t border-dashed border-slate-300 dark:border-slate-700 pt-1"><span>{pick('nexp.expected')}:</span><span>{signed(expected)}</span></div>
                        <div className="flex justify-between font-bold"><span>{pick('nexp.counted')}:</span><span>{closed && todayClose ? rs(todayClose.counted) : counted !== '' ? rs(Number(counted)) : pick('nexp.notEntered')}</span></div>
                        <div className="flex justify-between font-bold border-t border-dashed border-slate-300 dark:border-slate-700 pt-1"><span>{pick('nexp.difference')}:</span><span>{closed && todayClose ? plus(todayClose.difference) : diff == null ? '—' : plus(diff)}</span></div>
                      </div>
                      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
                    </div>
                    <div className="p-3.5 bg-slate-50/90 dark:bg-obsidian-850/90 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
                      {closed ? <button type="button" onClick={() => window.print()} className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-[var(--nl)] hover:opacity-95 text-white dark:text-obsidian-950 font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-opacity"><Printer className="w-4 h-4" /><span>{pick('nexp.printSlip')}</span></button>
                        : <button type="button" onClick={() => void closeDay()} disabled={busy || counted === ''} className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-[var(--nl)] hover:opacity-95 disabled:opacity-50 text-white dark:text-obsidian-950 font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-opacity" data-testid="nexp-lock"><Lock className="w-4 h-4" /><span>{pick('nexp.lock')}</span></button>}
                    </div>
                  </div>
                )}
              </section>

              {/* ===== RIGHT: THE EXPENSES ===== */}
              <section className="w-full lg:w-[58%] lg:h-full bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col overflow-hidden min-h-[420px]" data-testid="nexp-list">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
                  <div className="flex items-center gap-2"><h2 className="font-display font-extrabold text-sm sm:text-base">{pick('nexp.ledger')}</h2><span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300" dir="ltr">{shown.length}</span></div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nexp.search')} data-testid="nexp-q" className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-900 dark:focus:border-[var(--nl)]" /></div>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl shrink-0 overflow-x-auto">{datePill('all', 'nexp.d.all')}{datePill('today', 'nday.p.today')}{datePill('yesterday', 'nday.p.yesterday')}{datePill('week', 'nexp.d.week')}{datePill('month', 'nday.p.month')}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-obsidian-850/80 border border-slate-200/70 dark:border-slate-800 space-y-2" data-testid="nexp-spend">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><span>{pick('nexp.spend')}</span><span className="font-mono text-slate-900 dark:text-[var(--nl)]" dir="ltr">{pick('nday.total')}: {rs(total)}</span></div>
                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex gap-0.5">
                      {total > 0 ? byCat.map(([k, v]) => <div key={k} style={{ width: `${Math.max(4, (v / total) * 100)}%`, background: meta(k).color }} title={`${catLabel(k)}: ${rs(v)}`} className="h-full" />) : <div className="w-full h-full bg-slate-300 dark:bg-slate-700" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {byCat.length ? byCat.map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: meta(k).color }} /><span dir="auto">{catLabel(k)}: <strong className="font-mono" dir="ltr">{rs(v)}</strong></span></span>) : <span className="text-slate-400">{pick('nexp.noneYet')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {['all', ...new Set(list.map((e) => e.category_key))].map((k) => <button key={k} type="button" onClick={() => setCatFilter(k)} aria-pressed={catFilter === k} className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors cursor-pointer ${catFilter === k ? 'bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 font-extrabold' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200/70'}`} dir="auto">{k === 'all' ? pick('nday.all') : catLabel(k)}</button>)}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80" data-testid="nexp-rows">
                  {!shown.length ? (
                    <div className="p-10 text-center space-y-1.5"><div className="text-xs font-extrabold text-slate-600 dark:text-slate-300">{pick('nexp.noMatch')}</div><div className="text-[11px] text-slate-400">{pick('nexp.noMatchHint')}</div></div>
                  ) : shown.map((e) => {
                    const { Icon } = meta(e.category_key)
                    const voided = e.status === 'voided'
                    const galla = isGalla(e.cash_account_id)
                    return (
                      <div key={e.id} className={`px-4 py-3 hover:bg-slate-50/90 dark:hover:bg-obsidian-850/40 transition-colors flex items-center justify-between gap-3 ${voided ? 'opacity-50' : ''}`} data-testid="nexp-row">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-200"><Icon className="w-4 h-4" /></div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`font-display font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate ${voided ? 'line-through' : ''}`} dir="auto">{catOf(e) ? catName(catOf(e)!) : e.category_name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${galla ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300' : 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300'}`} dir="auto">{galla ? pick('nexp.galla') : accName(e.cash_account_id)}</span>
                              {voided ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600">{pick('sale.status.void')}</span> : null}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"><span dir="auto">{e.description || (catOf(e) ? catName(catOf(e)!) : e.category_name)}</span> • <span className="font-mono" dir="ltr">{fmtDate(e.date)}</span> <span dir="ltr">({time(e.created_at)})</span></div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="font-display font-extrabold text-xs sm:text-sm tabular-nums text-rose-600 dark:text-rose-400" dir="ltr">{rs(e.amount)}</div>
                          {!voided ? (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => startEdit(e)} aria-label={pick('common.edit')} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:border-slate-900 dark:hover:border-[var(--nl)] text-slate-600 dark:text-slate-300 cursor-pointer transition-colors" data-testid="nexp-edit"><Pencil className="w-3 h-3" /></button>
                              <button type="button" onClick={() => setVoiding(e)} aria-label={pick('crud.delete')} className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 cursor-pointer transition-colors" data-testid="nexp-delete"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="px-4 py-2.5 bg-slate-50/90 dark:bg-obsidian-850/90 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] shrink-0">
                  <span className="font-semibold text-slate-500" data-testid="nexp-count">{t('nexp.showing', { n: shown.length, total: list.length })}</span>
                  <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400 tabular-nums" dir="ltr">{pick('nexp.filteredTotal')}: {rs(shownTotal)}</span>
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      {voiding ? <VoidWindow e={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); setToast(pick('nkh.undone')) }} /> : null}
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-slate-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[var(--nl)]" /><span data-testid="nexp-toast">{toast}</span></div>
      </div>
    </div>
  )
}

/** Delete an expense entered by mistake (the live void, ADR-090): the money goes back, the entry stays as Deleted. */
function VoidWindow({ e, onClose, onDone }: { e: Expense; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/expenses/${e.id}/void`, { reason: why.trim() }); await inv('expenses', 'day-preview', 'cash', 'book', 'day', 'dashboard', 'accounts'); onDone() } catch (x) { setErr(errText(x, ur)) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nexp-void-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div><div><h3 className="font-display font-extrabold text-sm">{pick('nexp.deleteQ')}</h3><p className="text-xs text-slate-500 mt-0.5">{pick('del.expense.effect')}</p></div></div>
        <input value={why} onChange={(x) => setWhy(x.target.value)} minLength={3} maxLength={300} placeholder={pick('bill.reasonPh')} aria-label={pick('common.reason')} data-testid="nexp-void-why" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" />
        <p className="text-[10px] text-slate-500">{pick('bill.kept')}</p>
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"><X className="w-3.5 h-3.5 inline" /> {pick('common.cancel')}</button>
          <button type="button" onClick={() => void go()} disabled={busy || why.trim().length < 3} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nexp-void-yes">{pick('nkh.confirmDelete')}</button>
        </div>
      </div>
    </div>
  )
}
