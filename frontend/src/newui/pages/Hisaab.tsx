/** The day's hisaab in the new product (ADR-134), drawn from `04-day-hisaab.html`: a full screen
 *  with the file's own rail (Day's hisaab lit) and bar (today / yesterday / week / this month / from
 *  – to, the profit eye, WhatsApp day summary, print the A4 hisaab, language, dark), the lime banner
 *  (phones sold, net profit, total sales), the dark "left in hand" card with came in / went out and
 *  its formula, six figures (two of them filter the list), and "what was sold" with All / Cash /
 *  Part udhaar / Full udhaar, a search, a bill's drawer and the footer's sums.
 *
 *  Every figure is the server's day report (`/reports/day`, the same one the live hisaab reads):
 *  sales, how the money came, udhaar given and back, came in / went out by reason, expenses, profit
 *  and margin (owner / manager), and each line's own split, time, IMEI, cost and profit (ADR-134,
 *  additive keys). A salesman sees today only, without profit or cost (ADR-072). The list's counts
 *  and the footer add up only the rows on the screen.
 *
 *  Differences from the drawing: "Receive udhaar" in a bill's drawer opens the person's khata, where
 *  money in is recorded (the drawer never writes a payment by itself); the A4 hisaab is the server's
 *  own sheet (`/exports/day`, PDF); a sale with no person is "Walk-in". */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Calendar, Eye, EyeOff, Info, Moon, Printer, Search, Share2, Shield, Smartphone, Sun, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useGet } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { DayItem, DayReport } from '@/lib/types'
import { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import FileRail from '@/newui/FileRail'

type PKind = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
type Filter = 'all' | 'cash' | 'part' | 'udhaar' | 'cash-any' | 'udhaar-any'
const LIME = '#8CE01D'
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const n0 = (v: string | number | null | undefined) => Math.round(Math.abs(num(v))).toLocaleString('en-US')
const rs = (v: string | number | null | undefined) => withCur(n0(v))
const signed = (v: string | number | null | undefined) => `${num(v) < 0 ? '− ' : ''}${rs(v)}`
const paidAll = (i: DayItem) => i.how !== 'udhaar' && i.how !== 'part'
const time = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }

export default function NewHisaab() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const role = useAuth((x) => x.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  // ADR-072: a salesman sees today's hisaab only
  const period: Period = manager ? { from: params.get('from') || isoDay(0), to: params.get('to') || params.get('from') || isoDay(0) } : { from: isoDay(0), to: isoDay(0) }
  const kind: PKind = (['today', 'yesterday', 'week', 'month'] as const).find((k) => { const p = periodOf(k); return p.from === period.from && p.to === period.to }) ?? 'custom'
  const [custom, setCustom] = useState(false)
  const [range, setRange] = useState<Period>(period)
  const setPeriod = (p: Period) => setParams({ from: p.from, to: p.to }, { replace: true })
  const { data } = useGet<DayReport>(['day', period.from, period.to, 'newui'], `/api/v1/reports/day?${periodQuery(period)}`)

  const [showProfit, setShowProfit] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])
  useEffect(() => { setSel(null) }, [period.from, period.to])

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const items = useMemo(() => data?.items ?? [], [data])
  const live = items.filter((i) => !i.returned)
  const count = (f: (i: DayItem) => boolean) => new Set(live.filter(f).map((i) => i.invoice_id)).size
  const query = q.trim().toLowerCase()
  const shown = items.map((it, idx) => ({ it, idx })).filter(({ it }) => {
    if (filter === 'cash' && !paidAll(it)) return false
    if (filter === 'part' && it.how !== 'part') return false
    if (filter === 'udhaar' && it.how !== 'udhaar') return false
    if (filter === 'cash-any' && it.how === 'udhaar') return false
    if (filter === 'udhaar-any' && paidAll(it)) return false
    if (!query) return true
    return `${it.name} ${it.party_name ?? ''} ${it.sold_by ?? ''} ${it.invoice_no} ${it.imei1 ?? ''}`.toLowerCase().includes(query)
  })
  const footCash = shown.reduce((s, { it }) => s + (it.returned ? 0 : num(it.paid_now ?? (paidAll(it) ? it.amount : 0))), 0)
  const footOwed = shown.reduce((s, { it }) => s + (it.returned ? 0 : num(it.owed ?? 0)), 0)
  const footTotal = shown.reduce((s, { it }) => s + (it.returned ? 0 : num(it.amount)), 0)

  const cameIn = (data?.came_in ?? {}) as Record<string, string>
  const wentOut = (data?.went_out ?? {}) as Record<string, string>
  const IN_ROWS = ['sales', 'udhaar_back', 'lending', ...Object.keys(cameIn).filter((k) => !['sales', 'udhaar_back', 'lending'].includes(k) && num(cameIn[k]) !== 0)]
  const OUT_ROWS = ['stock', 'paid_out', 'lending', 'expenses', ...Object.keys(wentOut).filter((k) => !['stock', 'paid_out', 'lending', 'expenses'].includes(k) && num(wentOut[k]) !== 0)]
  const net = num(data?.cash_net)
  const stock = num(wentOut.stock)
  const digital = data ? num(data.received.easypaisa) + num(data.received.jazzcash) + num(data.received.bank) : 0
  const profitShown = data?.profit != null && showProfit
  const periodLabel = kind === 'custom' ? `${fmtDate(period.from)} – ${fmtDate(period.to)}` : `${pick(`nday.p.${kind}`)} (${period.from === period.to ? fmtDate(period.from) : `${fmtDate(period.from)} – ${fmtDate(period.to)}`})`
  const it = sel != null ? items[sel] : null

  function shareDay() {
    if (!data) return
    const lines = [
      t('nday.waHead', { period: periodLabel }),
      t('nday.waSold', { n: data.phones_sold, total: rs(data.sales_total) }),
      t('nday.waCash', { n: rs(data.received.cash) }),
      t('nday.waUdhaar', { given: rs(data.udhaar_given), back: rs(data.udhaar_received) }),
      t('nday.waHand', { n: signed(data.cash_net) }),
      data.profit != null && showProfit ? t('nday.waProfit', { n: signed(data.profit) }) : '',
    ].filter(Boolean)
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener')
  }

  const pill = (k: PKind, label: string) => (
    <button key={k} type="button" onClick={() => { if (k === 'custom') { setCustom(!custom); setRange(period) } else { setCustom(false); setPeriod(periodOf(k)) } }} aria-pressed={kind === k} data-testid={`nday-p-${k}`}
      className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap ${kind === k ? 'font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`}>
      {k === 'custom' ? <Calendar className="w-3 h-3" /> : null}<span>{pick(label)}</span>
    </button>
  )
  const tab = (f: Filter, label: string, n: number) => (
    <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`nday-f-${f}`} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer whitespace-nowrap ${filter === f ? 'font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`}>{pick(label)} ({n})</button>
  )
  const badge = (x: DayItem) => x.returned ? <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-200 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick('counter.returned')}</span>
    : x.how === 'part' ? <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{pick('nday.part')} {x.paid_now != null ? <span className="font-mono font-normal" dir="ltr">({t('nday.partSplit', { paid: n0(x.paid_now), owed: n0(x.owed) })})</span> : null}</span>
      : x.how === 'udhaar' ? <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">{pick('nday.udhaar')} {x.owed != null ? <span className="font-mono font-normal" dir="ltr">({t('nday.baqi', { n: n0(x.owed) })})</span> : null}</span>
        : <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[var(--nl)] text-slate-950">{pick(x.how === 'cash' ? 'nday.cashSettled' : 'nday.onlineSettled')}</span>

  return (
    <div style={{ '--nl': LIME } as CSSProperties} className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nday" data-newui="1" data-file="04">
      <FileRail lit="/new/hisaab" lime={LIME} testid="nday-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        {/* ===== BAR ===== */}
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => nav('/new')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('common.back')}</span></button>
            <div className="flex items-center gap-2">
              <h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base tracking-tight'}>{pick(period.from === period.to ? 'counter.dayTitle' : 'counter.hisaab')}</h1>
              <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300" dir="ltr" data-testid="nday-date">{period.from === period.to ? fmtDate(period.from) : `${fmtDate(period.from)} – ${fmtDate(period.to)}`}</span>
            </div>
            {manager ? (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl overflow-x-auto">
                {pill('today', 'nday.p.today')}{pill('yesterday', 'nday.p.yesterday')}{pill('week', 'nday.p.week')}{pill('month', 'nday.p.month')}{pill('custom', 'nday.p.custom')}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {data?.profit != null ? <button type="button" onClick={() => setShowProfit(!showProfit)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nday-eye">{showProfit ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden md:inline text-[11px]">{pick(showProfit ? 'nday.profitShown' : 'nday.profitHidden')}</span></button> : null}
            <button type="button" onClick={shareDay} className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nday-wa"><Share2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nday.waSummary')}</span></button>
            <button type="button" onClick={() => void openPrintable(`/api/v1/exports/day?format=pdf&${periodQuery(period)}`)} className="px-2.5 py-1.5 rounded-xl bg-slate-900 dark:bg-[var(--nl)] hover:opacity-95 text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-opacity" data-testid="nday-print"><Printer className="w-3.5 h-3.5" /><span className="hidden md:inline">{pick('nday.printA4')}</span></button>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors" data-testid="nday-lang"><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs flex items-center justify-center cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[var(--nl)]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}</button>
          </div>
        </header>

        {custom && manager ? (
          <div className="shrink-0 px-4 sm:px-6 py-2 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs" data-testid="nday-range">
            <span className="font-bold text-slate-500">{pick('nday.customRange')}</span>
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-mono text-xs" dir="ltr" data-testid="nday-from" />
            <span className="text-slate-400">{pick('nday.to')}</span>
            <input type="date" value={range.to} min={range.from} max={isoDay(0)} onChange={(e) => setRange({ ...range, to: e.target.value })} className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-mono text-xs" dir="ltr" data-testid="nday-to" />
            <button type="button" onClick={() => { if (range.from && range.to) { setPeriod(range); setCustom(false) } }} className="px-3 py-1 rounded-lg bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 font-bold text-xs cursor-pointer" data-testid="nday-apply">{pick('nday.apply')}</button>
          </div>
        ) : null}

        {!data ? <div className="flex-1 p-10 text-center text-xs text-slate-400">…</div> : (
          <>
            {/* ===== LIME BANNER ===== */}
            <div className="shrink-0 px-4 sm:px-6 pt-3 pb-1.5">
              <div className="rounded-2xl bg-[var(--nl)] text-slate-950 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs" data-testid="nday-banner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 text-[var(--nl)] flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></div>
                  <div>
                    <div className="flex items-center gap-2"><span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900/75">{pick('counter.sold')}</span><span className="px-2 py-0.5 rounded-full bg-slate-950/10 font-mono text-xs font-extrabold" data-testid="nday-phones">{t('nday.phonesN', { n: data.phones_sold })}</span></div>
                    <div className="text-xs font-bold text-slate-900/80 mt-0.5">{periodLabel} • {pick('nday.counterSummary')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-5">
                  {data.profit != null ? (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-950 text-white flex items-center gap-2 shadow-2xs">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nday.netProfit')}</span>
                      <span className="font-display font-extrabold text-sm sm:text-base tabular-nums text-[var(--nl)]" dir="ltr" data-testid="nday-profit">{profitShown ? signed(data.profit) : `${withCur('')}•••••`}</span>
                    </div>
                  ) : null}
                  <div className="text-end">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-900/70">{pick('nday.totalSales')}</div>
                    <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tight tabular-nums leading-none" dir="ltr" data-testid="nday-total">{rs(data.sales_total)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden px-4 sm:px-6 pb-4 pt-2 gap-4">
              {/* ===== LEFT: CASH FLOW + SIX FIGURES ===== */}
              <section className="w-full lg:w-[46%] lg:h-full flex flex-col gap-3 lg:overflow-y-auto pe-0.5">
                <div className="rounded-2xl bg-[#0F172A] text-white p-4 border border-slate-800 shadow-sm space-y-3 shrink-0" data-testid="nday-hand">
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nday.leftInHand')}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${net < 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>{pick(net < 0 ? (stock > 0 ? 'nday.stockOutflow' : 'nday.moreOut') : 'nday.inHandOk')}</span>
                      </div>
                      <div className={`font-display font-extrabold text-2xl sm:text-[26px] tracking-tight tabular-nums mt-0.5 ${net < 0 ? 'text-rose-400' : 'text-[var(--nl)]'}`} dir="ltr" data-testid="nday-net">{signed(net)}</div>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[10px] font-mono space-y-0.5" dir="ltr">
                      <div className="text-slate-400">{pick('nday.formula')}: <span className="text-white font-bold">{pick('nday.formulaText')}</span></div>
                      <div className="text-slate-300">{n0(data.money_in)} − {n0(data.money_out)} = <span className={`font-bold ${net < 0 ? 'text-rose-400' : 'text-[var(--nl)]'}`}>{net < 0 ? '-' : ''}{n0(net)}</span></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-emerald-950/35 border border-emerald-800/50 p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-emerald-800/40 pb-1.5"><span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1"><ArrowDownLeft className="w-3 h-3" />{pick('counter.cameIn')}</span><span className="font-mono font-extrabold text-xs text-emerald-400 tabular-nums" dir="ltr">+ {rs(data.money_in)}</span></div>
                      <div className="space-y-1.5 text-[11px]" data-testid="nday-in">{IN_ROWS.map((k) => <div key={k} className="flex items-center justify-between gap-2"><span className="text-slate-300">{pick(`nday.in.${k}`) === `nday.in.${k}` ? pick(`counter.inWhy.${k}`) : pick(`nday.in.${k}`)}</span><span className="font-mono font-bold text-white tabular-nums whitespace-nowrap" dir="ltr">{rs(cameIn[k] ?? 0)}</span></div>)}</div>
                    </div>
                    <div className="rounded-xl bg-rose-950/30 border border-rose-800/50 p-3 space-y-2">
                      <div className="flex items-center justify-between border-b border-rose-800/40 pb-1.5"><span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />{pick('counter.wentOut')}</span><span className="font-mono font-extrabold text-xs text-rose-400 tabular-nums" dir="ltr">− {rs(data.money_out)}</span></div>
                      <div className="space-y-1.5 text-[11px]" data-testid="nday-out">{OUT_ROWS.map((k) => <div key={k} className="flex items-center justify-between gap-2"><span className="text-slate-300">{pick(`nday.out.${k}`) === `nday.out.${k}` ? pick(`counter.outWhy.${k}`) : pick(`nday.out.${k}`)}</span><span className="font-mono font-bold text-white tabular-nums whitespace-nowrap" dir="ltr">{rs(wentOut[k] ?? 0)}</span></div>)}</div>
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-2 text-[11px] text-slate-300"><Info className="w-3.5 h-3.5 text-[var(--nl)] shrink-0" /><span>{stock > 0 ? t('nday.stockNote', { n: rs(stock) }) : net >= 0 ? t('nday.handNote', { n: rs(net) }) : pick('nday.outNote')}</span></div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0">
                  <button type="button" onClick={() => setFilter(filter === 'cash-any' ? 'all' : 'cash-any')} className={`p-3 rounded-2xl bg-white dark:bg-obsidian-900 border-2 text-start shadow-2xs transition-all cursor-pointer group ${filter === 'cash-any' ? 'border-emerald-500' : 'border-transparent hover:border-emerald-500/60'}`} data-testid="nday-cash">
                    <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.cashReceived')}</span><span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 opacity-80 group-hover:opacity-100">{pick('nday.filter')} ↗</span></div>
                    <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-emerald-600 dark:text-emerald-400 mt-1" dir="ltr">{rs(data.received.cash)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{t('nday.cashSub', { full: count((i) => i.how === 'cash'), part: count((i) => i.how === 'part') })}</div>
                  </button>
                  <div className="p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 text-start shadow-2xs">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.online')}</div>
                    <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-slate-900 dark:text-white mt-1" dir="ltr">{rs(digital)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nday.onlineSub')}</div>
                  </div>
                  <button type="button" onClick={() => setFilter(filter === 'udhaar-any' ? 'all' : 'udhaar-any')} className={`p-3 rounded-2xl bg-white dark:bg-obsidian-900 border-2 text-start shadow-2xs transition-all cursor-pointer group ${filter === 'udhaar-any' ? 'border-amber-500' : 'border-transparent hover:border-amber-500/60'}`} data-testid="nday-given">
                    <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.udhaarGiven')}</span><span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 opacity-80 group-hover:opacity-100">{pick('nday.filter')} ↗</span></div>
                    <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-amber-600 dark:text-amber-400 mt-1" dir="ltr">{rs(data.udhaar_given)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{t('nday.givenSub', { full: count((i) => i.how === 'udhaar'), part: count((i) => i.how === 'part') })}</div>
                  </button>
                  <div className="p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 text-start shadow-2xs">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.udhaarBack')}</div>
                    <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-emerald-600 dark:text-emerald-400 mt-1" dir="ltr" data-testid="nday-back">{rs(data.udhaar_received)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nday.udhaarBackSub')}</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 text-start shadow-2xs">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.expense')}</div>
                    <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-rose-600 dark:text-rose-400 mt-1" dir="ltr" data-testid="nday-expense">{rs(data.expenses)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nday.expenseSub')}</div>
                  </div>
                  {data.profit != null ? (
                    <button type="button" onClick={() => setShowProfit(!showProfit)} className="p-3 rounded-2xl bg-[#0F172A] text-white border border-slate-800 text-start shadow-xs cursor-pointer hover:border-[var(--nl)]/60 transition-colors" data-testid="nday-profit-card">
                      <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('counter.profit')}</span><Shield className="w-3 h-3 text-[var(--nl)]" /></div>
                      <div className={`font-display font-extrabold text-base sm:text-lg tabular-nums mt-1 ${num(data.profit) < 0 ? 'text-rose-400' : 'text-[var(--nl)]'}`} dir="ltr">{profitShown ? signed(data.profit) : `${withCur('')}•••••`}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate" data-testid="nday-margin">{profitShown && data.margin != null ? t('nday.margin', { n: data.margin }) : pick('nday.tapToShow')}</div>
                    </button>
                  ) : (
                    <div className="p-3 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 text-start shadow-2xs">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nday.bills')}</div>
                      <div className="font-display font-extrabold text-base sm:text-lg tabular-nums text-slate-900 dark:text-white mt-1" dir="ltr">{data.sales_count}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{pick('nday.billsSub')}</div>
                    </div>
                  )}
                </div>
              </section>

              {/* ===== RIGHT: WHAT WAS SOLD ===== */}
              <section className="w-full lg:w-[54%] lg:h-full bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-col overflow-hidden min-h-[420px]" data-testid="nday-sold">
                <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><h2 className="font-display font-extrabold text-sm sm:text-base">{pick('counter.whatSold')}</h2><span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold bg-[var(--nl)]/25 text-slate-900 dark:text-[var(--nl)]">{t('nday.phonesN', { n: data.phones_sold })}</span></div>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl overflow-x-auto">
                      {tab('all', 'nday.all', items.length)}
                      {tab('cash', 'nday.cash', items.filter(paidAll).length)}
                      {tab('part', 'nday.part', items.filter((i) => i.how === 'part').length)}
                      {tab('udhaar', 'nday.fullUdhaar', items.filter((i) => i.how === 'udhaar').length)}
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nday.search')} className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-900 dark:focus:border-[var(--nl)]" data-testid="nday-q" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80" data-testid="nday-rows">
                  {!shown.length ? (
                    <div className="p-10 text-center space-y-1.5"><div className="text-xs font-extrabold text-slate-600 dark:text-slate-300">{pick(items.length ? 'nday.noMatch' : 'counter.nothingSold')}</div>{items.length ? <div className="text-[11px] text-slate-400">{t('nday.noMatchHint', { n: items.length })}</div> : null}</div>
                  ) : shown.map(({ it: x, idx }) => (
                    <button key={idx} type="button" onClick={() => setSel(sel === idx ? null : idx)} data-testid="nday-row" className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors text-start ${sel === idx ? 'bg-[var(--nl)]/15 dark:bg-[var(--nl)]/10 border-s-4 border-s-slate-900 dark:border-s-[var(--nl)]' : 'hover:bg-slate-50 dark:hover:bg-obsidian-850/50'} ${x.returned ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5"><span className={`font-display font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate ${x.returned ? 'line-through' : ''}`} dir="auto">{x.qty > 1 ? `${x.qty} × ` : ''}{x.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{x.invoice_no}</span></div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"><span className="font-semibold text-slate-700 dark:text-slate-300" dir="auto">{x.party_name ?? pick('counter.walkIn')}</span>{x.sold_by ? ` • ${x.sold_by}` : ''}{x.at ? <> • <span className="font-mono text-[10px]" dir="ltr">{period.from === period.to ? time(x.at) : `${fmtDate(x.at)} ${time(x.at)}`}</span></> : null}</div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2.5 shrink-0">
                        {badge(x)}
                        <span className="font-display font-extrabold text-xs sm:text-sm tabular-nums text-slate-900 dark:text-white min-w-[78px] text-end" dir="ltr">{n0(x.amount)}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {it ? (
                  <div className="shrink-0 border-t-2 border-slate-900 dark:border-[var(--nl)] bg-slate-50 dark:bg-obsidian-850 p-3.5 sm:p-4 space-y-3" data-testid="nday-drawer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded font-mono text-[10px] font-extrabold bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950" dir="ltr">{it.invoice_no}</span><span className="font-display font-extrabold text-xs sm:text-sm truncate" dir="auto">{it.name}</span></div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{pick('nday.customer')}: <strong className="text-slate-800 dark:text-slate-200" dir="auto">{it.party_name ?? pick('counter.walkIn')}</strong>{it.imei1 ? <> • IMEI: <span className="font-mono" dir="ltr">{it.imei1}</span></> : null}</div>
                      </div>
                      <button type="button" onClick={() => setSel(null)} aria-label={pick('common.close')} className="p-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-obsidian-800 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                    <div className={`grid grid-cols-2 ${it.cost != null ? 'sm:grid-cols-5' : 'sm:grid-cols-3'} gap-2 text-[11px]`}>
                      {it.cost != null ? <Cell k="nday.costPrice" v={showProfit ? rs(it.cost) : `${withCur('')}•••••`} /> : null}
                      <Cell k="nday.salePrice" v={rs(it.amount)} />
                      {it.profit != null ? <Cell k="counter.profit" v={showProfit ? signed(it.profit) : `${withCur('')}•••••`} tone={num(it.profit) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'} /> : null}
                      <Cell k="nday.cashPaid" v={rs(it.paid_now ?? (paidAll(it) ? it.amount : 0))} tone="text-emerald-600 dark:text-emerald-400" />
                      <Cell k="nday.udhaarLeft" v={rs(it.owed ?? 0)} tone={num(it.owed) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
                    </div>
                    <p className="text-[10px] text-slate-500">{pick('nday.billNote')}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {num(it.owed) > 0 && !it.returned ? <button type="button" onClick={() => nav('/new/khata')} className="px-3 py-1.5 rounded-xl bg-[var(--nl)] hover:brightness-95 text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nday-receive">{t('nday.receive', { n: rs(it.owed) })}</button>
                        : <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold">{pick(it.returned ? 'counter.returned' : 'nday.settledBill')}</span>}
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => nav(`/sales/${it.invoice_id}`)} className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold cursor-pointer">{pick('nday.openBill')}</button>
                        <button type="button" onClick={() => void openPrintable(`/api/v1/sales/${it.invoice_id}/receipt?format=thermal`)} className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-obsidian-900 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nday-receipt"><Printer className="w-3.5 h-3.5" /><span>{pick('nday.print80')}</span></button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="px-4 py-2 bg-slate-100/80 dark:bg-obsidian-950 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                  <span className="font-semibold text-slate-500" data-testid="nday-count">{t('nday.showing', { n: shown.length, total: items.length })}</span>
                  <div className="flex items-center gap-3 font-mono font-bold tabular-nums" dir="ltr">
                    <span className="text-emerald-600 dark:text-emerald-400">{pick('nday.cash')}: {rs(footCash)}</span>
                    <span className="text-amber-600 dark:text-amber-400">{pick('nday.udhaar')}: {rs(footOwed)}</span>
                    <span className="text-slate-900 dark:text-white">{pick('nday.total')}: {rs(footTotal)}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-slate-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[var(--nl)]" /><span>{toast}</span></div>
      </div>
    </div>
  )
}

function Cell({ k, v, tone = '' }: { k: string; v: string; tone?: string }) {
  const { pick } = useLang()
  return (
    <div className="p-2 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800">
      <div className="text-[9px] font-bold uppercase text-slate-400">{pick(k)}</div>
      <div className={`font-mono font-bold mt-0.5 ${tone}`} dir="ltr">{v}</div>
    </div>
  )
}
