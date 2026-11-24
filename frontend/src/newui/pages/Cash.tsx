/** Cash & bank in the new product (ADR-134), drawn from `03-cash-and-bank.html`: a full screen with
 *  the file's own rail (Cash & bank lit) and bar, four cards (all the money, cash in hand, bank /
 *  online, this month's cash flow), the accounts and wallets on the left with "less than zero" and
 *  its opening balance, Move money / Edit account / Add account as inline cards, and the chosen
 *  account's book on the right with its running balance, a search and In / Out / Transfers.
 *
 *  Everything is the live software's: the accounts and balances (`/ledger/accounts`), the book
 *  (`/ledger/accounts/{id}/book`, owner / manager), a move between accounts (`/ledger/transfers`, one
 *  balanced entry, never income or expense) and its undo (`/ledger/groups/{id}/reverse`, with a
 *  reason), the opening balance set later (`PATCH /ledger/accounts/{id}`, owner), a new account
 *  (owner), this month's flow (`/reports/cash-flow`, moves between accounts left out).
 *
 *  Differences from the drawing: there is no free cash entry in this software (docs/38 §4 — every
 *  rupee comes from a document), so "Manual cash in / out" records money out as an expense from this
 *  account (its category, e.g. the owner's drawing) and, for money in, opens the khata or the
 *  counter where the bill is; "Export CSV" writes the server's book rows to a file and "Print book"
 *  is the device's print window; the "Fill" amount is what makes the account zero. */

import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpDown, ArrowUpRight, Banknote, BarChart3, BookOpen, CalendarCheck, Check, ChevronRight,
  Download, FileText, Home, Landmark, Languages, LayoutGrid, Moon, PackagePlus, Pencil, Plus, PlusCircle, Printer, Search, Settings, ShieldCheck,
  ShoppingBag, Smartphone, Sun, Tag, Trash2, Undo2, UserCog, Users, Wallet, Wrench, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useModules } from '@/lib/modules'
import { useCashAccounts, useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { CashAccount } from '@/lib/types'

type M = string
type Kind = CashAccount['kind']
type Filter = 'all' | 'in' | 'out' | 'transfer'
type Drawer = null | 'move' | 'add' | 'edit'
interface BookRow { entry_id: string; group_id: string; at: string; document_type: string; document_id: string | null; memo: string | null; in: M; out: M; balance: M; reversed: boolean }
interface Book { opening_balance: M; closing_balance: M; rows: BookRow[] }
interface Flow { cash_account_id: string; cash_in: M; cash_out: M; transfers_in: M; transfers_out: M }
interface Category { id: string; key: string; name: string; name_ur: string | null }

const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: number) => withCur(Math.round(Math.abs(v)).toLocaleString('en-US'))
const signed = (v: number) => `${v < 0 ? '− ' : ''}${rs(v)}`
const isTransfer = (r: BookRow) => r.document_type === 'transfer' || r.document_type === 'reversal:transfer'
const docLink = (r: BookRow) => !r.document_id ? null : r.document_type === 'invoice' ? `/sales/${r.document_id}` : r.document_type === 'purchase' ? '/new/purchases' : r.document_type === 'repair' ? `/repairs/${r.document_id}` : r.document_type === 'expense' ? '/expenses' : null
const ICON: Record<Kind, typeof Banknote> = { cash: Banknote, bank: Landmark, easypaisa: Smartphone, jazzcash: Smartphone, cheque: FileText, remittance: ArrowDownLeft }

export default function NewCash() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const role = useAuth((s) => s.me?.user.role)
  const owner = role === 'owner'
  const canSee = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const { data: accounts } = useCashAccounts()
  const list = useMemo(() => accounts ?? [], [accounts])
  const [selId, setSelId] = useState<string | null>(null)
  const sel = list.find((a) => a.id === selId) ?? list.find((a) => a.is_default) ?? list[0] ?? null
  const { data: book } = useGet<Book>(['book', sel?.id], sel && canSee ? `/api/v1/ledger/accounts/${sel.id}/book` : null)
  const { data: flow } = useGet<Flow[]>(['cash-flow-month'], canSee ? '/api/v1/reports/cash-flow' : null)
  const { data: cats } = useGet<Category[]>(['exp-cats'], canSee ? '/api/v1/expenses/categories' : null)

  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [manual, setManual] = useState(false)
  const [toast, setToast] = useState('')
  const [undo, setUndo] = useState<BookRow | null>(null)
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const name = (a: CashAccount) => (ur && a.name_ur ? a.name_ur : a.name)
  const cashBal = list.filter((a) => a.kind === 'cash').reduce((s, a) => s + num(a.balance), 0)
  const bankBal = list.filter((a) => a.kind !== 'cash').reduce((s, a) => s + num(a.balance), 0)
  const allBal = cashBal + bankBal
  const flowIn = (flow ?? []).reduce((s, f) => s + num(f.cash_in) - num(f.transfers_in), 0)
  const flowOut = (flow ?? []).reduce((s, f) => s + num(f.cash_out) - num(f.transfers_out), 0)
  const selBal = num(sel?.balance)
  const below = !!sel && selBal < 0 && sel.kind !== 'cheque' && sel.kind !== 'remittance'

  const query = q.trim().toLowerCase()
  const rows = book?.rows ?? []
  const shown = [...rows].reverse().filter((r) => {
    if (filter === 'transfer' && !isTransfer(r)) return false
    if (filter === 'in' && (isTransfer(r) || !(num(r.in) > 0))) return false
    if (filter === 'out' && (isTransfer(r) || !(num(r.out) > 0))) return false
    return !query || (r.memo ?? '').toLowerCase().includes(query) || r.document_type.toLowerCase().includes(query) || fmtDate(r.at).includes(query)
  })
  const sumIn = shown.reduce((s, r) => s + num(r.in), 0)
  const sumOut = shown.reduce((s, r) => s + num(r.out), 0)
  const docName = (dt: string) => { const k = `ncash.doc.${dt.replace('reversal:', '')}`; const v = pick(k); return v === k ? dt : v }

  function exportCsv() {
    if (!sel || !book) return
    const head = [pick('ncash.colDate'), pick('ncash.colWhat'), pick('ncash.colType'), pick('ncash.colIn'), pick('ncash.colOut'), pick('ncash.colBalance')]
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [head, ...book.rows.map((r) => [fmtDate(r.at), r.memo ?? '', docName(r.document_type), r.in, r.out, r.balance])].map((l) => l.map((x) => esc(String(x))).join(','))
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `cash-book-${sel.name}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const kpi = 'p-3 sm:p-3.5 rounded-2xl shadow-2xs cursor-pointer transition-all text-start'
  const onCard = 'bg-white dark:bg-obsidian-900 border-2 border-obsidian-900 dark:border-[#A3E635]'
  const offCard = 'bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
  const firstBank = list.find((a) => a.kind !== 'cash')
  const firstCash = list.find((a) => a.kind === 'cash')

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="ncash" data-newui="1" data-file="03">
      <Rail role={role} />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        {/* ===== BAR ===== */}
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => nav('/new')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('common.back')}</span></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base tracking-tight'}>{pick('cash.title')}</h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#A3E635]/25 text-slate-900 dark:text-[#A3E635]">{pick('ncash.badge')}</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('ncash.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canSee ? <button type="button" onClick={exportCsv} disabled={!book} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="ncash-csv"><Download className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /><span className="hidden sm:inline">{pick('ncash.exportCsv')}</span></button> : null}
            {canSee ? <button type="button" onClick={() => window.print()} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"><Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" /><span className="hidden md:inline">{pick('ncash.printBook')}</span></button> : null}
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="ncash-lang"><Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </header>

        {!canSee ? (
          <div className="flex-1 flex items-center justify-center p-8" data-testid="ncash-no-access">
            <div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8"><p className="font-bold text-sm">{pick('ncash.noAccess')}</p></div>
          </div>
        ) : (
          <>
            {/* ===== FOUR CARDS ===== */}
            <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <button type="button" onClick={() => firstCash && setSelId(firstCash.id)} className={`${kpi} bg-obsidian-900 dark:bg-obsidian-900 border border-slate-800 text-white hover:border-slate-700`} data-testid="ncash-kpi-all">
                <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('ncash.kpiAll')}</span><span className="w-6 h-6 rounded-lg bg-slate-800 text-[#A3E635] flex items-center justify-center"><Wallet className="w-3.5 h-3.5" /></span></div>
                <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${allBal < 0 ? 'text-rose-400' : 'text-[#A3E635]'}`} dir="ltr">{signed(allBal)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('ncash.kpiAllSub')}</div>
              </button>
              <button type="button" onClick={() => firstCash && setSelId(firstCash.id)} className={`${kpi} ${sel?.kind === 'cash' ? onCard : offCard}`} data-testid="ncash-kpi-cash">
                <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('ncash.kpiCash')}</span><span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${cashBal < 0 ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'}`}>{pick(cashBal < 0 ? 'ncash.deficit' : 'ncash.balanced')}</span></div>
                <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${cashBal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr" data-testid="ncash-cash">{signed(cashBal)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('ncash.clickCash')}</div>
              </button>
              <button type="button" onClick={() => firstBank && setSelId(firstBank.id)} className={`${kpi} ${sel && sel.kind !== 'cash' ? onCard : offCard}`} data-testid="ncash-kpi-bank">
                <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('ncash.kpiBank')}</span><span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">{t('ncash.nAccounts', { n: list.filter((a) => a.kind !== 'cash').length })}</span></div>
                <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${bankBal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`} dir="ltr" data-testid="ncash-bank">{signed(bankBal)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('ncash.clickBank')}</div>
              </button>
              <div className={`${kpi} cursor-default bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800`} data-testid="ncash-kpi-flow">
                <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('ncash.kpiFlow')}</span><span className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><ArrowUpDown className="w-3.5 h-3.5" /></span></div>
                <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${flowIn - flowOut >= 0 ? 'text-emerald-600 dark:text-[#A3E635]' : 'text-rose-600 dark:text-rose-400'}`} dir="ltr">{flowIn - flowOut >= 0 ? '+ ' : ''}{signed(flowIn - flowOut)}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums truncate">{t('ncash.flowSub', { inn: rs(flowIn), out: rs(flowOut) })}</div>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden px-4 sm:px-6 pb-4 pt-2 gap-4">
              {/* ===== LEFT: ACCOUNTS ===== */}
              <div className="w-full lg:w-[38%] lg:h-full lg:overflow-y-auto space-y-3.5 pe-0.5">
                <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-3.5 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('ncash.accounts')}</span>
                    {owner ? <button type="button" onClick={() => setDrawer(drawer === 'add' ? null : 'add')} className="px-2.5 py-1 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-[11px] flex items-center gap-1 cursor-pointer hover:opacity-95 transition-opacity" data-testid="ncash-add"><Plus className="w-3 h-3 stroke-[2.5]" /><span>{pick('ncash.addAccount')}</span></button> : null}
                  </div>
                  <div className="space-y-2" data-testid="ncash-accounts">
                    {list.map((a) => {
                      const on = a.id === sel?.id
                      const neg = num(a.balance) < 0
                      const Icon = ICON[a.kind] ?? Wallet
                      return (
                        <button key={a.id} type="button" onClick={() => setSelId(a.id)} aria-pressed={on} data-testid={`ncash-acc-${a.kind}`} className={`w-full p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 text-start ${on ? 'bg-obsidian-900 dark:bg-obsidian-850 border-obsidian-900 dark:border-[#A3E635] text-white shadow-xs' : 'bg-slate-50/80 dark:bg-obsidian-850/50 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-[#A3E635] text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}><Icon className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5"><span className="font-display font-extrabold text-xs sm:text-sm truncate" dir="auto">{name(a)}</span><span className={`px-1.5 rounded font-mono text-[9px] uppercase font-bold ${on ? 'bg-white/15 text-slate-200' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{pick(`ncash.kind.${a.kind}`)}</span></div>
                              <div className={`text-[10px] truncate ${on ? 'text-slate-400' : 'text-slate-500'}`}>{a.is_default ? pick('ncash.counterGalla') : pick('ncash.active')} • {pick('ncash.open')}: <span dir="ltr">{rs(num(a.opening_balance))}</span></div>
                            </div>
                          </div>
                          <div className="text-end shrink-0 flex items-center gap-1.5">
                            <div className={`font-display font-extrabold text-xs sm:text-sm tabular-nums ${neg ? (on ? 'text-rose-400' : 'text-rose-600 dark:text-rose-400') : (on ? 'text-[#A3E635]' : 'text-emerald-600 dark:text-emerald-400')}`} dir="ltr">{signed(num(a.balance))}</div>
                            <ChevronRight className={`w-4 h-4 rtl:rotate-180 ${on ? 'text-[#A3E635]' : 'text-slate-400'}`} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>

                {below && sel ? <BelowZero acc={sel} owner={owner} name={name(sel)} onDone={(m) => setToast(m)} /> : null}

                <section className="grid grid-cols-2 gap-2">
                  {list.length ? <button type="button" disabled={list.length < 2} title={list.length < 2 ? pick('ncash.needTwo') : undefined} onClick={() => setDrawer(drawer === 'move' ? null : 'move')} className="disabled:opacity-50 disabled:cursor-not-allowed p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 hover:border-obsidian-900 dark:hover:border-[#A3E635] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all" data-testid="ncash-move"><ArrowLeftRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{pick('ncash.moveShort')}</span></button> : <span />}
                  {owner && sel ? <button type="button" onClick={() => setDrawer(drawer === 'edit' ? null : 'edit')} className="p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 hover:border-obsidian-900 dark:hover:border-[#A3E635] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all" data-testid="ncash-edit"><Pencil className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /><span>{pick('crud.editAccount')}</span></button> : null}
                </section>

                {drawer === 'move' ? <MoveCard accounts={list} from={sel?.id ?? ''} name={name} onClose={() => setDrawer(null)} onDone={(m) => { setDrawer(null); setToast(m) }} /> : null}
                {drawer === 'add' ? <AddCard onClose={() => setDrawer(null)} onDone={(a, m) => { setDrawer(null); setSelId(a); setToast(m) }} /> : null}
                {drawer === 'edit' && sel ? <EditCard key={sel.id} acc={sel} onClose={() => setDrawer(null)} onDone={(m) => { setDrawer(null); setToast(m) }} onGone={() => { setDrawer(null); setSelId(null) }} /> : null}
              </div>

              {/* ===== RIGHT: THE BOOK ===== */}
              <section className="w-full lg:w-[62%] lg:h-full bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col overflow-hidden min-h-[420px]" data-testid="ncash-book">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center shrink-0">{sel ? (() => { const I = ICON[sel.kind] ?? Wallet; return <I className="w-4 h-4" /> })() : null}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><h2 className="font-display font-extrabold text-sm sm:text-base truncate" dir="auto" data-testid="ncash-book-title">{sel ? t('ncash.bookOf', { name: name(sel) }) : ''}</h2>{sel ? <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300">{pick(`ncash.kind.${sel.kind}`)}</span> : null}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('ncash.bookSub', { open: rs(num(book?.opening_balance)), n: rows.length })}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setManual(!manual)} className="px-3 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="ncash-manual"><PlusCircle className="w-3.5 h-3.5" /><span>{pick('ncash.manual')}</span></button>
                      <div className="text-end ps-2 border-s border-slate-200 dark:border-slate-800">
                        <div className="text-[9px] font-bold uppercase text-slate-400">{pick('ncash.current')}</div>
                        <div className={`font-display font-extrabold text-sm sm:text-base tabular-nums ${selBal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr" data-testid="ncash-current">{signed(selBal)}</div>
                      </div>
                    </div>
                  </div>
                  {manual && sel ? <ManualBar acc={sel} name={name(sel)} cats={cats ?? []} onClose={() => setManual(false)} onDone={(m) => { setManual(false); setToast(m) }} /> : null}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('ncash.search')} data-testid="ncash-q" className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl shrink-0">
                      {(['all', 'in', 'out', 'transfer'] as Filter[]).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`ncash-f-${f}`} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${filter === f ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`}>{pick(`ncash.f.${f}`)}</button>)}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80" data-testid="ncash-rows">
                  {!shown.length ? (
                    <div className="p-10 text-center space-y-1.5"><div className="text-xs font-extrabold text-slate-600 dark:text-slate-300">{pick(rows.length ? 'ncash.noMatch' : 'ncash.noRows')}</div><div className="text-[11px] text-slate-400">{pick(rows.length ? 'ncash.noMatchHint' : 'ncash.noRowsHint')}</div></div>
                  ) : shown.map((r) => {
                    const tr = isTransfer(r)
                    const amt = num(r.in) - num(r.out)
                    const to = docLink(r)
                    return (
                      <div key={r.entry_id} className={`px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-obsidian-850/40 transition-colors flex items-center justify-between gap-3 ${r.reversed ? 'opacity-50 line-through' : ''}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tr ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' : amt >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'}`}>{tr ? <ArrowLeftRight className="w-4 h-4" /> : amt >= 0 ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}</div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-display font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate" dir="auto">{r.memo || docName(r.document_type)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${tr ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : amt >= 0 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'}`}>{pick(tr ? 'ncash.badgeTransfer' : amt >= 0 ? 'ncash.badgeIn' : 'ncash.badgeOut')}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <span dir="ltr">{fmtDate(r.at)}</span>
                              <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300">{docName(r.document_type)}</span>
                              {to ? <button type="button" onClick={() => nav(to)} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{pick('nkh.open')}</button> : null}
                              {tr && r.document_type === 'transfer' && !r.reversed ? <button type="button" onClick={() => setUndo(r)} className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer" data-testid="ncash-undo-transfer">{pick('del.undoTransfer')}</button> : null}
                            </div>
                          </div>
                        </div>
                        <div className="text-end shrink-0">
                          <div className={`font-display font-extrabold text-xs sm:text-sm tabular-nums ${tr ? 'text-blue-600 dark:text-blue-400' : amt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`} dir="ltr">{amt >= 0 ? '+ ' : ''}{signed(amt)}</div>
                          <div className="font-mono text-[10px] tabular-nums text-slate-400 mt-0.5" dir="ltr">= {num(r.balance).toLocaleString('en-US')}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="px-4 py-2.5 bg-slate-50/90 dark:bg-obsidian-850/90 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                  <span className="font-semibold text-slate-500" data-testid="ncash-count">{t('ncash.showing', { n: shown.length, total: rows.length })}</span>
                  <div className="flex items-center gap-3 font-mono font-bold tabular-nums" dir="ltr">
                    <span className="text-emerald-600 dark:text-emerald-400">{pick('ncash.in')}: +{rs(sumIn)}</span>
                    <span className="text-rose-600 dark:text-rose-400">{pick('ncash.out')}: −{rs(sumOut)}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      {undo ? <UndoTransfer row={undo} onClose={() => setUndo(null)} onDone={() => { setUndo(null); setToast(pick('nkh.undone')); void inv('cash', 'book', 'cash-flow-month') }} /> : null}

      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="ncash-toast">{toast}</span></div>
      </div>
    </div>
  )
}

const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const box = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none'
const lab = 'block text-[10px] font-bold uppercase text-slate-400 mb-1'
const REFRESH = ['cash', 'book', 'cash-flow-month', 'transfers', 'dashboard', 'day', 'accounts', 'expenses']

/** "Less than zero": the opening balance was never entered; the owner sets it (PATCH, ADR owner 2026-11-05). */
function BelowZero({ acc, owner, name, onDone }: { acc: CashAccount; owner: boolean; name: string; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const zero = num(acc.opening_balance) - num(acc.balance)
  async function save() {
    setBusy(true); setErr('')
    try { await api('PATCH', `/api/v1/ledger/accounts/${acc.id}`, { name: acc.name, opening_balance: Number(v) }); await inv(...REFRESH); onDone(pick('ncash.saved')) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl bg-rose-50/90 dark:bg-rose-950/35 border border-rose-300 dark:border-rose-800/80 p-3.5 space-y-2.5" data-testid="ncash-below">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-900/70 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 mt-0.5"><AlertTriangle className="w-4 h-4" /></div>
        <div className="space-y-1">
          <div className="text-xs font-extrabold text-rose-800 dark:text-rose-200">{t('ncash.belowTitle', { name, n: signed(num(acc.balance)) })}</div>
          <p className="text-[11px] leading-relaxed text-rose-700/90 dark:text-rose-300/90">{pick('ncash.belowText')}</p>
        </div>
      </div>
      {owner ? (
        <div className="p-2.5 rounded-xl bg-white/90 dark:bg-obsidian-900/90 border border-rose-200 dark:border-rose-800/60 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick('cash.opening')}</label>
            <button type="button" onClick={() => setV(String(Math.round(zero)))} className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" data-testid="ncash-fill">{t('ncash.fill', { n: rs(zero) })}</button>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} placeholder="24000000" dir="ltr" data-testid="ncash-opening" className="w-full px-3 py-2 rounded-xl font-mono text-xs font-extrabold tabular-nums bg-slate-50 dark:bg-obsidian-850 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" />
            <button type="button" onClick={() => void save()} disabled={busy || v === '' || Number(v) < 0} className="px-3.5 py-2 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-xs shrink-0 cursor-pointer transition-colors" data-testid="ncash-opening-save">{pick('ncash.reconcile')}</button>
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </div>
      ) : <p className="text-[11px] text-rose-700/90">{pick('ncash.ownerSets')}</p>}
    </section>
  )
}

/** Move money between the shop's own accounts (one balanced entry). */
function MoveCard({ accounts, from: start, name, onClose, onDone }: { accounts: CashAccount[]; from: string; name: (a: CashAccount) => string; onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(() => accounts.find((a) => a.id !== start)?.id ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await api('POST', '/api/v1/ledger/transfers', { from_account_id: from, to_account_id: to, amount: Number(amount), note: note.trim() || null }); await inv(...REFRESH); onDone(t('ncash.moved', { n: rs(Number(amount)) })) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border-2 border-blue-500/70 p-4 shadow-sm space-y-3" data-testid="ncash-move-card">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center"><ArrowLeftRight className="w-3.5 h-3.5" /></span>
          <div><h3 className="font-display font-extrabold text-xs">{pick('ncash.moveTitle')}</h3><p className="text-[10px] text-slate-400">{pick('ncash.moveSub')}</p></div>
        </div>
        <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lab}>{pick('cash.from')}</label><select value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(accounts.find((a) => a.id !== e.target.value)?.id ?? '') }} className={`${box} font-bold cursor-pointer`} data-testid="ncash-move-from">{accounts.map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}</select></div>
        <div><label className={lab}>{pick('cash.to')}</label><select value={to} onChange={(e) => setTo(e.target.value)} className={`${box} font-bold cursor-pointer`} data-testid="ncash-move-to">{accounts.filter((a) => a.id !== from).map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={lab}>{pick('cash.amount')} *</label><input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" dir="ltr" className={`${box} font-mono font-extrabold`} data-testid="ncash-move-amount" /></div>
        <div><label className={lab}>{pick('cash.note')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick('ncash.moveNotePh')} className={box} dir="auto" /></div>
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <button type="button" onClick={() => void go()} disabled={busy || !from || !to || !(Number(amount) > 0)} className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors" data-testid="ncash-move-save"><Check className="w-4 h-4" /><span>{pick('ncash.moveNow')}</span></button>
    </section>
  )
}

/** A new account or wallet (owner): cash / bank / Easypaisa / JazzCash, with its opening balance. */
function AddCard({ onClose, onDone }: { onClose: () => void; onDone: (id: string, m: string) => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [kind, setKind] = useState<Kind>('easypaisa')
  const [nm, setNm] = useState('')
  const [no, setNo] = useState('')
  const [open, setOpen] = useState('0')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { const a = await api<CashAccount>('POST', '/api/v1/ledger/accounts', { kind, name: nm.trim(), name_ur: null, account_no: no.trim() || null, opening_balance: Number(open || 0) }); await inv(...REFRESH); onDone(a.id, pick('ncash.saved')) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border-2 border-[#A3E635] p-4 shadow-sm space-y-3" data-testid="ncash-add-card">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2"><h3 className="font-display font-extrabold text-xs">{pick('ncash.addTitle')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <div>
        <label className={lab}>{pick('cash.kind')}</label>
        <div className="grid grid-cols-4 gap-1.5">
          {(['cash', 'bank', 'easypaisa', 'jazzcash'] as Kind[]).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`ncash-kind-${k}`} className={`py-1.5 rounded-xl text-[11px] cursor-pointer ${kind === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300'}`}>{pick(`ncash.kind.${k}`)}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div><label className={lab}>{pick('cash.name')} *</label><input value={nm} onChange={(e) => setNm(e.target.value)} placeholder={pick('ncash.namePh')} className={`${box} font-bold`} dir="auto" data-testid="ncash-add-name" /></div>
        <div><label className={lab}>{pick('cash.accountNo')}</label><input value={no} onChange={(e) => setNo(e.target.value)} placeholder="0300-1234567" className={`${box} font-mono`} dir="ltr" /></div>
      </div>
      <div><label className={lab}>{pick('cash.opening')}</label><input type="number" min={0} value={open} onChange={(e) => setOpen(e.target.value)} className={`${box} font-mono font-extrabold`} dir="ltr" data-testid="ncash-add-opening" /></div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <button type="button" onClick={() => void save()} disabled={busy || !nm.trim() || Number(open) < 0} className="w-full py-2.5 px-4 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-xs cursor-pointer transition-colors" data-testid="ncash-add-save">{pick('ncash.addSave')}</button>
    </section>
  )
}

/** Edit the chosen account (owner): its name and opening balance; an account other than the galla may be deleted. */
function EditCard({ acc, onClose, onDone, onGone }: { acc: CashAccount; onClose: () => void; onDone: (m: string) => void; onGone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [nm, setNm] = useState(acc.name)
  const [open, setOpen] = useState(String(num(acc.opening_balance)))
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try { await api('PATCH', `/api/v1/ledger/accounts/${acc.id}`, { name: nm.trim(), opening_balance: Number(open || 0) }); await inv(...REFRESH); onDone(pick('ncash.saved')) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  async function del() {
    setBusy(true); setErr('')
    try { await api('DELETE', `/api/v1/ledger/accounts/${acc.id}`); await inv(...REFRESH); onGone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border-2 border-emerald-500 p-4 shadow-sm space-y-3" data-testid="ncash-edit-card">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2"><h3 className="font-display font-extrabold text-xs">{pick('ncash.editTitle')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <div className="space-y-2.5">
        <div><label className={lab}>{pick('cash.name')} *</label><input value={nm} onChange={(e) => setNm(e.target.value)} className={`${box} font-bold`} dir="auto" data-testid="ncash-edit-name" /></div>
        <div><label className={lab}>{pick('cash.opening')}</label><input type="number" min={0} value={open} onChange={(e) => setOpen(e.target.value)} className={`${box} font-mono font-extrabold`} dir="ltr" data-testid="ncash-edit-opening" /></div>
      </div>
      {sure ? <p className="text-[11px] font-bold text-rose-600">{pick('ncash.deleteSure')}</p> : null}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex items-center justify-between gap-2 pt-1">
        {!acc.is_default ? <button type="button" onClick={() => (sure ? void del() : setSure(true))} disabled={busy} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer flex items-center gap-1" data-testid="ncash-edit-delete"><Trash2 className="w-3.5 h-3.5" />{pick(sure ? 'nkh.confirmDelete' : 'ncash.deleteAcc')}</button> : null}
        <button type="button" onClick={() => void save()} disabled={busy || !nm.trim() || Number(open) < 0} className="flex-1 py-2.5 px-4 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-xs cursor-pointer transition-colors" data-testid="ncash-edit-save">{pick('nlist.saveChanges')}</button>
      </div>
    </section>
  )
}

/** "Manual cash in / out": out is an expense paid from this account (its category); in comes with a
 *  bill or from a person, so it opens where that is recorded — never a free entry (docs/38 §4). */
function ManualBar({ acc, name, cats, onClose, onDone }: { acc: CashAccount; name: string; cats: Category[]; onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [dir, setDir] = useState<'in' | 'out'>('out')
  const [cat, setCat] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const catName = (c: Category) => (ur && c.name_ur ? c.name_ur : c.name)
  async function save() {
    setBusy(true); setErr('')
    try { await api('POST', '/api/v1/expenses', { category_id: cat, amount: Number(amount), cash_account_id: acc.id, description: desc.trim() || null }); await inv(...REFRESH); onDone(t('ncash.paidOut', { n: rs(Number(amount)), name })) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 space-y-2.5" data-testid="ncash-manual-bar">
      <div className="flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{t('ncash.manualIn', { name })}</span><button type="button" onClick={onClose} className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer">{pick('common.close')}</button></div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <div className="sm:col-span-3 flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <button type="button" onClick={() => setDir('in')} aria-pressed={dir === 'in'} className={`flex-1 py-2 text-xs cursor-pointer ${dir === 'in' ? 'font-extrabold bg-emerald-600 text-white' : 'font-bold bg-white dark:bg-obsidian-900 text-slate-600 dark:text-slate-300'}`} data-testid="ncash-manual-in">+ {pick('ncash.in')}</button>
          <button type="button" onClick={() => setDir('out')} aria-pressed={dir === 'out'} className={`flex-1 py-2 text-xs cursor-pointer ${dir === 'out' ? 'font-extrabold bg-rose-600 text-white' : 'font-bold bg-white dark:bg-obsidian-900 text-slate-600 dark:text-slate-300'}`} data-testid="ncash-manual-out">− {pick('ncash.out')}</button>
        </div>
        {dir === 'in' ? (
          <div className="sm:col-span-9 flex flex-wrap items-center gap-2" data-testid="ncash-manual-in-help">
            <span className="text-[11px] text-slate-600 dark:text-slate-300 flex-1 min-w-[160px]">{pick('ncash.inHelp')}</span>
            <button type="button" onClick={() => nav('/new/khata')} className="px-3 py-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs cursor-pointer">{pick('party.title')}</button>
            <button type="button" onClick={() => nav('/new/sale/new')} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-900 text-xs font-bold cursor-pointer">{pick('counter.sell')}</button>
          </div>
        ) : (
          <>
            <div className="sm:col-span-3"><select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full px-2.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 cursor-pointer" data-testid="ncash-manual-cat"><option value="">{pick('ncash.pickCat')}</option>{cats.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}</select></div>
            <div className="sm:col-span-3"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={pick('ncash.descPh')} className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none" dir="auto" data-testid="ncash-manual-desc" /></div>
            <div className="sm:col-span-2"><input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={pick('cash.amount')} dir="ltr" className="w-full px-2.5 py-2 rounded-xl font-mono text-xs font-extrabold tabular-nums bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none" data-testid="ncash-manual-amount" /></div>
            <div className="sm:col-span-1"><button type="button" onClick={() => void save()} disabled={busy || !cat || !(Number(amount) > 0)} className="w-full py-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] disabled:opacity-50 text-white dark:text-obsidian-950 font-display font-extrabold text-xs cursor-pointer" data-testid="ncash-manual-save">{pick('ncash.add')}</button></div>
          </>
        )}
      </div>
      {dir === 'out' ? <p className="text-[10px] text-slate-500">{pick('ncash.outHelp')}</p> : null}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
    </div>
  )
}

/** Undo a move between accounts made by mistake: both accounts as before, the move kept crossed out. */
function UndoTransfer({ row, onClose, onDone }: { row: BookRow; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/ledger/groups/${row.group_id}/reverse`, { reason: why.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="ncash-undo-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0"><Undo2 className="w-5 h-5" /></div><div><h3 className="font-display font-extrabold text-sm">{pick('del.undoTransfer')}</h3><p className="text-xs text-slate-500 mt-0.5">{pick('ncash.undoHint')}</p></div></div>
        <input value={why} onChange={(e) => setWhy(e.target.value)} minLength={3} maxLength={200} placeholder={pick('common.reason')} className={box} data-testid="ncash-undo-why" />
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button>
          <button type="button" onClick={() => void go()} disabled={busy || why.trim().length < 3} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="ncash-undo-yes">{pick('nkh.confirmDelete')}</button>
        </div>
      </div>
    </div>
  )
}

/** The file's rail: shop mark, Dashboard, the counter's tiles with their keys, the shop grid with Cash & bank lit, who is logged in. */
function Rail({ role }: { role: string | undefined }) {
  const { pick, ur, cls } = useLang()
  const has = useModules()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const managers = role === 'owner' || role === 'manager'
  const JOBS: [string, string, string, typeof Tag][] = [
    ['/new/khata', 'counter.khata', 'F4', BookOpen], ['/new/stock/summary', 'counter.stock', 'F6', Smartphone],
    ...(has('repairs') ? [['/new/repairs', 'counter.repair', 'F7', Wrench] as [string, string, string, typeof Tag]] : []),
    ['/new/return/new', 'counter.returnJob', 'F9', Undo2], ['/new/invoices', 'inv.short', 'F10', FileText],
    ...(has('expenses') ? [['/new/expenses', 'counter.expense', 'F8', Wallet] as [string, string, string, typeof Tag]] : []),
  ]
  const SHOP: [string, string, typeof Tag, boolean][] = [
    ['/new/parties', 'party.title', Users, true], ['/new/audit', 'audit.title', ShieldCheck, managers], ['/new/hisaab', 'counter.dayTitle', CalendarCheck, true],
    ['/new/reports', 'more.reports', BarChart3, true], ['/new/more/cash', 'more.cashAccounts', Landmark, managers], ['/new/purchases', 'nav.purchases', ShoppingBag, managers],
    ['/new/more/staff', 'more.staff', UserCog, role === 'owner'], ['/new/more/settings', 'more.settings', Settings, role === 'owner'], ['/new/more', 'nav.allOptions', LayoutGrid, true],
  ]
  const tiny = ur ? cls('sm') : 'text-[10px]'
  const small = ur ? cls('sm') : 'text-xs'
  return (
    <aside className="hidden lg:flex lg:w-64 shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200/90 dark:border-slate-800 z-20 lg:h-screen" data-testid="ncash-rail">
      <NavLink to="/new" className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
        <div className="min-w-0"><div className="font-display font-extrabold text-sm tracking-tight truncate">{name}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</div></div>
      </NavLink>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <NavLink to="/new" className={`w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-obsidian-850 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between cursor-pointer transition-colors ${small}`}><span className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-slate-400" /> {pick('nav.dashboard')}</span><ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" /></NavLink>
          <div className={`px-2.5 mt-3 mb-1.5 font-extrabold uppercase tracking-wider text-slate-400 ${tiny}`}>{pick('nav.counterSection')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NavLink to="/new/sale/new" className="p-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex flex-col justify-between gap-1.5 shadow-2xs cursor-pointer transition-colors min-h-[56px]"><span className="flex items-center justify-between w-full"><Tag className="w-3.5 h-3.5" /><span className="text-[10px] opacity-75" dir="ltr">F2</span></span><span className={small}>{pick('counter.sell')}</span></NavLink>
            <NavLink to="/new/purchase/new" className="p-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 hover:opacity-95 text-white font-display font-extrabold text-xs flex flex-col justify-between gap-1.5 shadow-2xs cursor-pointer transition-colors min-h-[56px]"><span className="flex items-center justify-between w-full"><PackagePlus className="w-3.5 h-3.5 text-[#A3E635]" /><span className="text-[10px] text-slate-400" dir="ltr">F3</span></span><span className={small}>{pick('counter.addStock')}</span></NavLink>
            {JOBS.map(([to, label, key, Icon]) => (
              <NavLink key={to} to={to} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex flex-col justify-between gap-1.5 cursor-pointer transition-colors min-h-[52px]"><span className="flex items-center justify-between w-full"><Icon className="w-3.5 h-3.5 text-emerald-600" /><span className="text-[10px] text-slate-400" dir="ltr">{key}</span></span><span className={small}>{pick(label)}</span></NavLink>
            ))}
          </div>
        </div>
        <div>
          <div className={`px-2.5 mb-1.5 font-extrabold uppercase tracking-wider text-slate-400 ${tiny}`}>{pick('nlist.shop')}</div>
          <div className="grid grid-cols-3 gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
            {SHOP.filter((x) => x[3]).map(([to, label, Icon]) => to === '/new/more/cash' ? (
              <span key={to} aria-current="page" className="p-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-extrabold flex flex-col items-center text-center gap-1 shadow-xs"><Icon className="w-3.5 h-3.5 text-[#A3E635] dark:text-obsidian-950" /><span className={`leading-tight ${tiny}`}>{pick(label)}</span></span>
            ) : (
              <NavLink key={to} to={to} end={to === '/new/more'} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"><Icon className="w-3.5 h-3.5 text-slate-500" /><span className={`leading-tight ${tiny}`}>{pick(label)}</span></NavLink>
            ))}
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
