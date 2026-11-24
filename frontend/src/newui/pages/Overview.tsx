/** The business overview in the new product (ADR-134), drawn from `02-business-overview.html`: a
 *  full screen with the file's own 220px sidebar (Overview lit) and bar (today / yesterday / week /
 *  this month / from – to, 7 / 30 days for the graphs, the profit eye, dark, language, Open full
 *  hisaab), four cards (sales with profit, to get, to give, stock on hand), two graphs (sales and
 *  purchases by day; profit by day with the "to get" curve) and four tabs: the period's pulse, udhaar
 *  & reminders, top models & stock alerts, recent activity & all-time totals.
 *
 *  Every figure is the server's: the period is `/reports/overview` (the live overview's, owner /
 *  manager — REPORTS_ALL), the graphs `/reports/trends?days=` (ADR-096). The app adds nothing up; a
 *  graph's height is only a drawing of the server's numbers.
 *
 *  Differences from the drawing: "Settle" in the udhaar lists opens that person's khata, where money
 *  is recorded (it never writes a payment by itself); "WhatsApp" opens WhatsApp with the person's
 *  number and the amount (`waNumber`); the "Net cash flow" line is the period's expenses instead (the
 *  server gives no such figure); the activity filters are the kinds of entries the server listed. */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity, AlertTriangle, ArrowLeftRight, ArrowUpRight, Award, BarChart3, BellRing, BookOpen, CalendarCheck, CalendarRange, ChevronRight, Download, Eye,
  EyeOff, FileSpreadsheet, FileText, History, Home, Landmark, Moon, PackageCheck, PackagePlus, Search, Settings, Share2, ShieldAlert, ShieldCheck,
  ShoppingBag, Smartphone, Sun, Tag, TrendingUp, Undo2, UserCog, Users, Wallet, Wrench, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { activeShop, useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useModules } from '@/lib/modules'
import { useGet } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'

type M = string
type PKind = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
type Tab = 'pulse' | 'udhaar' | 'models' | 'activity'
interface Who { party_id: string | null; name: string | null; phone?: string | null; amount: M; count?: number }
interface Overview {
  sales: { total: M; count: number; phones: number; paid: M; credit: M; profit: M | null }
  purchases: { count: number; total: M; paid: M; credit: M; phones: number; top: { name: string; qty: number; amount: M }[] }
  expenses: M; udhaar_given: M; udhaar_collected: M
  returns: { sale: { count: number; amount: M }; purchase: { count: number; amount: M } }
  payments: { in: { total: M; people: Who[]; people_count: number }; out: { total: M; people: Who[]; people_count: number } }
  people: { customers: number; dealers: number; new_customers: number; new_dealers: number }
  dues: { to_get: M; to_give: M; to_get_count: number; to_give_count: number; to_get_list: Who[]; to_give_list: Who[] }
  month: { from: string; sales: M; expenses: M; profit: M | null }
  top_sold: { name: string; qty: number; amount: M; profit: M | null }[]
  alerts: { on_hand: number; available: number; faulty: number; inspection: number; in_repair: number; reserved: number; old_60d: number; items_low: number; items_out: number; locked?: number }
  recent: { at: string; who: string | null; entity: string; action: string; ref: string | null }[]
  counts: { sales: number; purchases: number; returns: number; transfers: number; payments: number }
  repairs?: { open: number; came: number }
  show_cost: boolean
}
interface TRow { date: string; sales: M; purchases?: M; profit?: M; to_get: M; to_give: M }
interface Trends { days: number; show_cost: boolean; rows: TRow[]; totals: { sales: M; purchases?: M; profit?: M; to_get: M; to_give: M } }

const LIME = '#84CC16'
const num = (v: M | number | null | undefined) => Number(v ?? 0)
const n0 = (v: M | number | null | undefined) => Math.round(Math.abs(num(v))).toLocaleString('en-US')
const rs = (v: M | number | null | undefined) => withCur(n0(v))
const signed = (v: M | number | null | undefined) => `${num(v) < 0 ? '− ' : ''}${rs(v)}`
const MASK = '••••••'

export default function NewOverview() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const can = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const [period, setPeriodState] = useState<Period>(() => periodOf('today'))
  const kind: PKind = (['today', 'yesterday', 'week', 'month'] as const).find((k) => { const p = periodOf(k); return p.from === period.from && p.to === period.to }) ?? 'custom'
  const [custom, setCustom] = useState(false)
  const [range, setRange] = useState<Period>(period)
  const [days, setDays] = useState<7 | 30>(7)
  const [hide, setHide] = useState(false)
  const [tab, setTab] = useState<Tab>('pulse')
  const [uq, setUq] = useState('')
  const [act, setAct] = useState('all')
  const [full, setFull] = useState(false)
  const { data: o } = useGet<Overview>(['overview', period.from, period.to, 'newui'], can ? `/api/v1/reports/overview?${periodQuery(period)}` : null)
  const { data: tr } = useGet<Trends>(['trends', days], can ? `/api/v1/reports/trends?days=${days}` : null)

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const money = (v: M | number | null | undefined) => (hide ? `${withCur('')}${MASK}` : signed(v))
  const periodName = pick(`nov.p.${kind}`)
  const pill = (k: PKind) => (
    <button key={k} type="button" onClick={() => { if (k === 'custom') { setCustom(!custom); setRange(period) } else { setCustom(false); setPeriodState(periodOf(k)) } }} aria-pressed={kind === k} data-testid={`nov-p-${k}`}
      className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all whitespace-nowrap ${kind === k ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}>{pick(`nov.p.${k}`)}</button>
  )
  const tabBtn = (k: Tab, Icon: typeof Activity, label: string, tone: string, extra?: ReactNode) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nov-tab-${k}`}
      className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${tab === k ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-obsidian-850'}`}>
      <Icon className={`w-3.5 h-3.5 ${tab === k ? '' : tone}`} /><span>{pick(label)}</span>{extra}
    </button>
  )
  const entities = useMemo(() => [...new Set((o?.recent ?? []).map((r) => r.entity))], [o])
  const entityName = (e: string) => { const v = pick(`ov.entity.${e}`); return v === `ov.entity.${e}` ? e.replace(/_/g, ' ') : v }
  const uqq = uq.trim().toLowerCase()
  const fil = (rows: Who[]) => rows.filter((r) => !uqq || (r.name ?? '').toLowerCase().includes(uqq) || (r.phone ?? '').includes(uqq))
  const remind = (w: Who, get: boolean) => {
    const msg = t(get ? 'nov.remindGet' : 'nov.remindGive', { shop: shop?.name ?? '', who: w.name ?? '', n: rs(w.amount) })
    window.open(`https://wa.me/${waNumber(w.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  return (
    <div style={{ '--nl': LIME } as CSSProperties} className="font-sans bg-[#F8FAFC] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex flex-col" data-testid="nov" data-newui="1" data-file="02">
      <div className="flex-1 flex min-h-0 lg:overflow-hidden">
        <Side />
        <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
          {/* ===== BAR ===== */}
          <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-extrabold text-sm sm:text-base tracking-tight'} dir="auto">{t('nov.title', { shop: shop?.name ?? '' })}</h1>
                <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {pick('nov.live')}</span>
              </div>
              {can ? <div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-x-auto">{(['today', 'yesterday', 'week', 'month', 'custom'] as PKind[]).map(pill)}</div> : null}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {can ? <div className="hidden sm:flex items-center bg-slate-100 dark:bg-obsidian-850 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">{([7, 30] as const).map((d) => <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} data-testid={`nov-days-${d}`} className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all ${days === d ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`}>{t('nov.days', { n: d })}</button>)}</div> : null}
              {o?.show_cost ? <button type="button" onClick={() => setHide(!hide)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nov-eye">{hide ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-[#65A30D]" />}<span className="hidden md:inline">{pick(hide ? 'nov.profitHidden' : 'nov.profitShown')}</span></button> : null}
              <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[#84CC16]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}</button>
              <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-[11px] font-extrabold cursor-pointer transition-colors" data-testid="nov-lang">{ur ? 'English' : 'اردو'}</button>
              {can ? <button type="button" onClick={() => setFull(true)} className="px-3 py-1.5 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-slate-950 font-extrabold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors" data-testid="nov-full"><FileSpreadsheet className="w-3.5 h-3.5" /><span>{pick('nov.fullHisaab')}</span></button> : null}
            </div>
          </header>
          {custom && can ? (
            <div className="shrink-0 px-4 sm:px-5 py-2 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-500">{pick('nday.customRange')}</span>
              <input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-mono text-xs" dir="ltr" />
              <span className="text-slate-400">{pick('nday.to')}</span>
              <input type="date" value={range.to} min={range.from} max={isoDay(0)} onChange={(e) => setRange({ ...range, to: e.target.value })} className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-mono text-xs" dir="ltr" />
              <button type="button" onClick={() => { setPeriodState(range); setCustom(false) }} className="px-3 py-1 rounded-lg bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950 font-bold text-xs cursor-pointer">{pick('nday.apply')}</button>
            </div>
          ) : null}

          {!can ? (
            <div className="flex-1 flex items-center justify-center p-8" data-testid="nov-no-access"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8"><p className="font-bold text-sm">{pick('nov.noAccess')}</p></div></div>
          ) : !o ? <div className="flex-1 p-10 text-center text-xs text-slate-400">…</div> : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden px-4 sm:px-5 py-2.5 gap-2.5">
              {/* ===== FOUR CARDS ===== */}
              <section className="shrink-0 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                <button type="button" onClick={() => setTab('pulse')} className="text-start rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-[#84CC16] p-3 transition-all cursor-pointer group shadow-2xs" data-testid="nov-sales">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{t('nov.salesOf', { p: periodName })}</span>{o.sales.profit != null ? <span className="px-2 py-0.5 rounded-full bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16] font-mono text-[10px] font-extrabold" dir="ltr" data-testid="nov-sales-profit">{hide ? MASK : `${num(o.sales.profit) < 0 ? '−' : '+'} ${rs(o.sales.profit)} ${pick('nov.profitWord')}`}</span> : null}</div>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><div className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-[#0F172A] dark:text-white" dir="ltr" data-testid="nov-sales-total">{rs(o.sales.total)}</div><span className="text-[10px] font-semibold text-slate-400 group-hover:text-[#65A30D] flex items-center gap-0.5">{t('nov.billsPhones', { b: o.sales.count, p: o.sales.phones })} <ArrowUpRight className="w-3 h-3" /></span></div>
                </button>
                <button type="button" onClick={() => setTab('udhaar')} className="text-start rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 p-3 transition-all cursor-pointer group shadow-2xs" data-testid="nov-get">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{pick('nov.toGet')}</span><span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-extrabold">{t('nov.people', { n: o.dues.to_get_count })}</span></div>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><div className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-amber-600 dark:text-amber-400" dir="ltr" data-testid="nov-get-total">{rs(o.dues.to_get)}</div><span className="text-[10px] font-semibold text-slate-400 group-hover:text-amber-600 flex items-center gap-0.5">{pick('nov.reminders')} <ArrowUpRight className="w-3 h-3" /></span></div>
                </button>
                <button type="button" onClick={() => setTab('udhaar')} className="text-start rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-rose-400 p-3 transition-all cursor-pointer group shadow-2xs" data-testid="nov-give">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{pick('nov.toGive')}</span><span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-mono text-[10px] font-extrabold">{t('nov.people', { n: o.dues.to_give_count })}</span></div>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><div className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-rose-600 dark:text-rose-400" dir="ltr" data-testid="nov-give-total">{rs(o.dues.to_give)}</div><span className="text-[10px] font-semibold text-slate-400 group-hover:text-rose-600 flex items-center gap-0.5">{pick('nov.dealers')} <ArrowUpRight className="w-3 h-3" /></span></div>
                </button>
                <button type="button" onClick={() => setTab('models')} className="text-start rounded-2xl bg-[#0F172A] dark:bg-obsidian-900 border border-slate-800 hover:border-[#84CC16] p-3 text-white transition-all cursor-pointer group shadow-2xs" data-testid="nov-stock">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-slate-300">{pick('nov.stockOnHand')}</span><span className="px-2 py-0.5 rounded-full bg-[#84CC16]/20 text-[#84CC16] font-mono text-[10px] font-extrabold">{t('nov.forSale', { n: o.alerts.available })}</span></div>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><div className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-white" dir="ltr">{o.alerts.on_hand} <span className="font-sans text-xs font-semibold text-slate-400">{pick('nov.phonesWord')}</span></div><span className="text-[10px] font-mono text-amber-300">{t('nov.idFaulty', { id: o.alerts.inspection, f: o.alerts.faulty })}</span></div>
                </button>
              </section>

              {/* ===== GRAPHS ===== */}
              {tr ? <Graphs tr={tr} hide={hide} /> : null}

              {/* ===== FOUR TABS ===== */}
              <section className="flex-1 flex flex-col min-h-[340px] rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                <div className="shrink-0 px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {tabBtn('pulse', Activity, 'nov.tabPulse', '')}
                    {tabBtn('udhaar', BellRing, 'nov.tabUdhaar', 'text-amber-500', <span className="px-1.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-extrabold" dir="ltr">{o.dues.to_get_count + o.dues.to_give_count}</span>)}
                    {tabBtn('models', Smartphone, 'nov.tabModels', 'text-[#65A30D]')}
                    {tabBtn('activity', History, 'nov.tabActivity', 'text-sky-500')}
                  </div>
                  <span className="hidden xl:inline text-[11px] font-mono text-slate-400" dir="ltr">{shop?.city ? `${shop.city} · ` : ''}{period.from === period.to ? fmtDate(period.from) : `${fmtDate(period.from)} – ${fmtDate(period.to)}`}</span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3.5" data-testid={`nov-pane-${tab}`}>
                  {tab === 'pulse' ? (
                    <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <Bento Icon={TrendingUp} tone="bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16]" title="nov.salesBreak" sub={t('nov.billsSold', { b: o.sales.count, p: o.sales.phones })} link={<button type="button" onClick={() => setTab('models')} className="text-[11px] font-bold text-[#65A30D] dark:text-[#84CC16] hover:underline cursor-pointer">{pick('nov.viewTop')} →</button>}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                          <Fig k="nov.totalSales" v={rs(o.sales.total)} />
                          {o.sales.profit != null ? <Fig k="nov.netProfit" v={money(o.sales.profit)} lime /> : <Fig k="ov.phonesSold" v={String(o.sales.phones)} />}
                          <Fig k="nov.paidCashBank" v={rs(o.sales.paid)} tone="text-emerald-600 dark:text-emerald-400" />
                          <Fig k="nov.onUdhaar" v={rs(o.sales.credit)} tone="text-amber-600 dark:text-amber-400" />
                        </div>
                      </Bento>
                      <Bento Icon={ShoppingBag} tone="bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400" title="nov.purchBreak" sub={t('nov.billsBought', { b: o.purchases.count, p: o.purchases.phones })} link={<button type="button" onClick={() => nav('/new/purchases')} className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer">{pick('nov.viewBought')} →</button>}>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <Fig k="nov.totalPurchases" v={rs(o.purchases.total)} />
                          <Fig k="nov.paidCashBank" v={rs(o.purchases.paid)} tone="text-emerald-600 dark:text-emerald-400" />
                          <Fig k="nov.onUdhaarDene" v={rs(o.purchases.credit)} rose />
                        </div>
                      </Bento>
                      <Bento Icon={ArrowLeftRight} tone="bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" title="nov.moneyInOut" sub={<>{pick('nov.udhaarCollected')}: <strong className="font-mono text-emerald-600" dir="ltr">{rs(o.udhaar_collected)}</strong> · {pick('nov.expenses')}: <strong className="font-mono text-rose-600" dir="ltr">{rs(o.expenses)}</strong></>} link={<span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-extrabold">{t('nov.inOut', { i: o.payments.in.people_count, o: o.payments.out.people_count })}</span>}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]" data-testid="nov-money">
                          <Flow title={t('nov.receivedN', { n: o.payments.in.people_count })} total={o.payments.in.total} rows={o.payments.in.people} tone="text-emerald-600 dark:text-emerald-400" />
                          <Flow title={t('nov.paidOutN', { n: o.payments.out.people_count })} total={o.payments.out.total} rows={o.payments.out.people} tone="text-rose-600 dark:text-rose-400" />
                        </div>
                      </Bento>
                      <Bento Icon={CalendarRange} tone="bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400" title="nov.monthTitle" sub={t('nov.monthSub', { d: fmtDate(o.month.from) })} link={<div className="flex items-center gap-1.5 text-[10px] font-bold"><span className="px-2 py-0.5 rounded-md bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">{pick('ov.customers')}: <strong>{o.people.customers}</strong> <span className="text-emerald-600">+{o.people.new_customers}</span></span><span className="px-2 py-0.5 rounded-md bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">{pick('ov.dealers')}: <strong>{o.people.dealers}</strong> <span className="text-emerald-600">+{o.people.new_dealers}</span></span></div>}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                          <Fig k="nov.monthSales" v={rs(o.month.sales)} small />
                          {o.month.profit != null ? <Fig k="nov.monthProfit" v={money(o.month.profit)} lime small /> : <Fig k="nov.monthExpenses" v={rs(o.month.expenses)} small />}
                          <Fig k="nov.repairs" v={<>{o.repairs?.open ?? 0} <span className="font-sans text-[10px] font-normal text-slate-400">{pick('nov.open')}</span></>} small />
                          <Fig k="nov.returns" v={<>{o.returns.sale.count + o.returns.purchase.count} <span className="font-sans text-[10px] font-normal text-slate-400">{periodName.toLowerCase()}</span></>} small />
                        </div>
                      </Bento>
                    </div>
                  ) : tab === 'udhaar' ? (
                    <div className="h-full flex flex-col gap-2.5">
                      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-md"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={uq} onChange={(e) => setUq(e.target.value)} placeholder={pick('nov.filterPeople')} data-testid="nov-uq" className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#84CC16]" /></div>
                        <div className="text-[11px] text-slate-500">{pick('nov.listNote')}</div>
                      </div>
                      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-y-auto">
                        <DueList get title={t('nov.getTitle', { n: o.dues.to_get_count })} total={o.dues.to_get} rows={fil(o.dues.to_get_list)} onRemind={(w) => remind(w, true)} />
                        <DueList get={false} title={t('nov.giveTitle', { n: o.dues.to_give_count })} total={o.dues.to_give} rows={fil(o.dues.to_give_list)} onRemind={(w) => remind(w, false)} />
                      </div>
                    </div>
                  ) : tab === 'models' ? (
                    <div className="h-full flex flex-col justify-between gap-3">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto">
                        <div className="rounded-2xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2" data-testid="nov-top-sold">
                          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2"><h3 className="font-extrabold text-xs flex items-center gap-1.5"><Award className="w-4 h-4 text-[#65A30D]" /> {t('nov.topSold', { p: periodName })}</h3><span className="font-mono text-[10px] font-bold text-slate-400" dir="ltr">{t('nov.unitsTotal', { n: o.sales.phones, total: rs(o.sales.total) })}</span></div>
                          <div className="space-y-1.5 text-xs">{o.top_sold.length ? o.top_sold.map((r) => (
                            <div key={r.name} className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0"><div className="font-extrabold truncate" dir="auto">{r.name} <span className="text-slate-400 font-mono text-[10px]" dir="ltr">× {r.qty}</span></div></div>
                              <div className="text-end shrink-0"><div className="font-mono font-extrabold tabular-nums" dir="ltr">{rs(r.amount)}</div>{r.profit != null ? <div className={`font-mono text-[10px] font-extrabold ${num(r.profit) < 0 ? 'text-rose-600' : 'text-[#65A30D] dark:text-[#84CC16]'}`} dir="ltr">{pick('ov.profit')} {money(r.profit)}</div> : null}</div>
                            </div>
                          )) : <p className="text-[11px] text-slate-400 p-2">{pick('nov.nothing')}</p>}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2" data-testid="nov-top-bought">
                          <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2"><h3 className="font-extrabold text-xs flex items-center gap-1.5"><PackageCheck className="w-4 h-4 text-sky-500" /> {t('nov.topBought', { p: periodName })}</h3><span className="font-mono text-[10px] font-bold text-slate-400" dir="ltr">{t('nov.unitsTotal', { n: o.purchases.phones, total: rs(o.purchases.total) })}</span></div>
                          <div className="space-y-1.5 text-xs">{o.purchases.top.length ? o.purchases.top.map((r) => (
                            <div key={r.name} className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div className="font-extrabold truncate min-w-0" dir="auto">{r.name} <span className="text-slate-400 font-mono text-[10px]" dir="ltr">× {r.qty}</span></div>
                              <div className="font-mono font-extrabold tabular-nums shrink-0" dir="ltr">{rs(r.amount)}</div>
                            </div>
                          )) : <p className="text-[11px] text-slate-400 p-2">{pick('nov.nothing')}</p>}</div>
                        </div>
                      </div>
                      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="nov-alerts">
                        <Alert k="nov.onHand" v={o.alerts.on_hand} />
                        <Alert k="nov.forSaleWord" v={o.alerts.available} cls="bg-lime-50/80 dark:bg-lime-950/40 border-lime-200 dark:border-lime-900 text-[#65A30D] dark:text-[#84CC16]" />
                        <Alert k="nov.idPending" v={o.alerts.inspection} cls="bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300" Icon={AlertTriangle} />
                        <Alert k="nov.faulty" v={o.alerts.faulty} cls="bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300" Icon={ShieldAlert} />
                        <Alert k="nov.reserved" v={o.alerts.reserved} wide />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col justify-between gap-3">
                      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {['all', ...entities].map((e) => <button key={e} type="button" onClick={() => setAct(e)} aria-pressed={act === e} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${act === e ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{e === 'all' ? `${pick('nday.all')} (${o.recent.length})` : entityName(e)}</button>)}
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold">{pick('nov.staffFeed')}</span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 content-start" data-testid="nov-feed">
                        {o.recent.filter((r) => act === 'all' || r.entity === act).map((r, i) => (
                          <div key={i} className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                            <div className="min-w-0"><div className="font-bold text-xs truncate" dir="auto">{entityName(r.entity)} · {r.action.replace(/_/g, ' ')}{r.ref ? <span dir="ltr"> · {r.ref}</span> : null}</div><div className="text-[10px] text-slate-500 mt-0.5">{r.who ?? '—'} · <span className="font-mono" dir="ltr">{fmtDateTime(r.at)}</span></div></div>
                            <span className="shrink-0 px-2 py-0.5 rounded-md font-mono text-[9px] font-extrabold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">{entityName(r.entity)}</span>
                          </div>
                        ))}
                        {!o.recent.length ? <p className="text-[11px] text-slate-400 p-2">{pick('nov.nothing')}</p> : null}
                      </div>
                      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800" data-testid="nov-counts">
                        {([['ov.sales', o.counts.sales], ['ov.purchases', o.counts.purchases], ['ov.returnsN', o.counts.returns], ['ov.payments', o.counts.payments], ['ov.customers', o.people.customers], ['ov.dealers', o.people.dealers]] as [string, number][]).map(([k, v]) => (
                          <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 text-center"><div className="font-mono text-sm font-extrabold" dir="ltr">{v}</div><div className="text-[10px] text-slate-500 font-semibold">{pick(k)}</div></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {full && o ? (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4" data-testid="nov-full-window">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div><h3 className="font-extrabold text-sm" dir="auto">{t('nov.fullTitle', { shop: shop?.name ?? '' })}</h3><p className="text-[11px] text-slate-500" dir="ltr">{period.from === period.to ? fmtDate(period.from) : `${fmtDate(period.from)} – ${fmtDate(period.to)}`}</p></div>
              <button type="button" onClick={() => setFull(false)} aria-label={pick('common.close')} className="p-1.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 hover:bg-slate-200 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850"><div className="font-sans text-[10px] text-slate-500">{pick('nov.totalSales')}</div><div className="text-sm font-extrabold mt-0.5" dir="ltr">{rs(o.sales.total)}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850"><div className="font-sans text-[10px] text-slate-500">{pick('nov.totalPurchases')}</div><div className="text-sm font-extrabold mt-0.5" dir="ltr">{rs(o.purchases.total)}</div></div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"><div className="font-sans text-[10px]">{t('nov.getTitle', { n: o.dues.to_get_count })}</div><div className="text-sm font-extrabold mt-0.5" dir="ltr">{rs(o.dues.to_get)}</div></div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"><div className="font-sans text-[10px]">{t('nov.giveTitle', { n: o.dues.to_give_count })}</div><div className="text-sm font-extrabold mt-0.5" dir="ltr">{rs(o.dues.to_give)}</div></div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => nav(`/new/hisaab?from=${period.from}&to=${period.to}`)} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-extrabold cursor-pointer">{pick('nov.openHisaab')}</button>
              <button type="button" onClick={() => void openPrintable(`/api/v1/reports/overview/export?format=pdf&${periodQuery(period)}`)} className="px-3.5 py-2 rounded-xl bg-[#0F172A] dark:bg-obsidian-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> {pick('nov.pdf')}</button>
              <button type="button" onClick={() => { const msg = [t('nov.fullTitle', { shop: shop?.name ?? '' }), `${pick('nov.totalSales')}: ${rs(o.sales.total)}`, `${pick('nov.totalPurchases')}: ${rs(o.purchases.total)}`, `${t('nov.getTitle', { n: o.dues.to_get_count })}: ${rs(o.dues.to_get)}`, `${t('nov.giveTitle', { n: o.dues.to_give_count })}: ${rs(o.dues.to_give)}`].join('\n'); window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener') }} className="px-3.5 py-2 rounded-xl bg-[#84CC16] text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"><Share2 className="w-3.5 h-3.5" /> {pick('nexp.wa')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Bento({ Icon, tone, title, sub, link, children }: { Icon: typeof Activity; tone: string; title: string; sub: ReactNode; link?: ReactNode; children: ReactNode }) {
  const { pick } = useLang()
  return (
    <div className="rounded-2xl bg-slate-50/90 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 p-3.5 flex flex-col justify-between gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0"><span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-4 h-4" /></span><div className="min-w-0"><h3 className="font-extrabold text-xs">{pick(title)}</h3><p className="text-[10px] text-slate-500">{sub}</p></div></div>
        {link}
      </div>
      {children}
    </div>
  )
}

function Fig({ k, v, tone = '', lime, rose, small }: { k: string; v: ReactNode; tone?: string; lime?: boolean; rose?: boolean; small?: boolean }) {
  const { pick } = useLang()
  const box = lime ? 'bg-lime-50/80 dark:bg-lime-950/40 border-lime-200 dark:border-lime-900' : rose ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900' : 'bg-white dark:bg-obsidian-900 border-slate-200/70 dark:border-slate-800'
  const label = lime ? 'text-[#65A30D] dark:text-[#84CC16] font-bold' : rose ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-400 font-semibold'
  const val = lime ? 'text-[#65A30D] dark:text-[#84CC16]' : rose ? 'text-rose-600 dark:text-rose-400' : tone
  return (
    <div className={`p-2.5 rounded-xl border ${box}`}>
      <div className={`text-[10px] ${label}`}>{pick(k)}</div>
      <div className={`font-mono ${small ? 'text-xs' : 'text-xs sm:text-sm'} font-extrabold tabular-nums mt-0.5 ${val}`} dir="ltr">{v}</div>
    </div>
  )
}

function Flow({ title, total, rows, tone }: { title: string; total: M; rows: Who[]; tone: string }) {
  const { pick } = useLang()
  return (
    <div className="p-2 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
      <div className={`flex justify-between font-extrabold border-b border-slate-100 dark:border-slate-800 pb-1 ${tone}`}><span>{title}</span><span className="font-mono" dir="ltr">{rs(total)}</span></div>
      {rows.slice(0, 3).map((r, i) => <div key={i} className="flex justify-between gap-2 text-[10px]"><span className="truncate" dir="auto">{r.name ?? pick('ov.walkIn')}</span><span className="font-mono font-bold" dir="ltr">{n0(r.amount)}</span></div>)}
      {!rows.length ? <div className="text-[10px] text-slate-400">{pick('nov.nothing')}</div> : null}
    </div>
  )
}

function DueList({ get, title, total, rows, onRemind }: { get: boolean; title: string; total: M; rows: Who[]; onRemind: (w: Who) => void }) {
  const { pick } = useLang()
  const nav = useNavigate()
  return (
    <div className="rounded-2xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 flex flex-col min-h-0" data-testid={get ? 'nov-get-list' : 'nov-give-list'}>
      <div className="px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className={`font-extrabold text-xs flex items-center gap-1.5 ${get ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}><span className={`w-2 h-2 rounded-full ${get ? 'bg-amber-500' : 'bg-rose-500'}`} /> {title}</span>
        <span className={`font-mono text-xs font-extrabold tabular-nums ${get ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`} dir="ltr">{rs(total)}</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800">
        {rows.map((w, i) => (
          <div key={w.party_id ?? i} className="px-3.5 py-2 flex items-center justify-between gap-2 hover:bg-white dark:hover:bg-obsidian-900 transition-colors">
            <div className="min-w-0"><div className="font-bold text-xs truncate" dir="auto">{w.name ?? pick('ov.walkIn')}</div>{w.phone ? <div className="font-mono text-[10px] text-slate-400" dir="ltr">{w.phone}</div> : null}</div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`font-mono text-xs font-extrabold tabular-nums me-1 ${get ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`} dir="ltr">{rs(w.amount)}</span>
              {get && w.phone ? <button type="button" onClick={() => onRemind(w)} className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold cursor-pointer">WhatsApp</button> : null}
              {w.party_id ? <button type="button" onClick={() => nav(`/new/parties/${w.party_id}`)} className={`px-2 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer ${get ? 'bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'bg-rose-600 hover:bg-rose-700 text-white'}`} data-testid="nov-settle">{pick('nov.settle')}</button> : null}
            </div>
          </div>
        ))}
        {!rows.length ? <p className="px-3.5 py-3 text-[11px] text-slate-400">{pick('nov.nobody')}</p> : null}
      </div>
    </div>
  )
}

function Alert({ k, v, cls = 'bg-slate-50 dark:bg-obsidian-850 border-slate-200 dark:border-slate-800', Icon, wide }: { k: string; v: number; cls?: string; Icon?: typeof Activity; wide?: boolean }) {
  const { pick } = useLang()
  return (
    <div className={`p-2.5 rounded-xl border flex items-center justify-between ${cls} ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <span className="text-[11px] font-extrabold flex items-center gap-1 opacity-90">{Icon ? <Icon className="w-3.5 h-3.5" /> : null}{pick(k)}</span>
      <span className="font-mono text-sm font-extrabold" dir="ltr">{v}</span>
    </div>
  )
}

/** The two graphs: sales (lime line and area) with purchases (dashed slate) by day, and profit by
 *  day (lime bars, rose below zero) with the "to get" curve (amber). Heights are only a drawing of the
 *  server's numbers; the box at the top right says what a hovered day was. */
function Graphs({ tr, hide }: { tr: Trends; hide: boolean }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const [hl, setHl] = useState<number | null>(null)
  const [hr, setHr] = useState<number | null>(null)
  const rows = tr.rows
  const W = 560, H = 92, padX = 24, padY = 10
  const n = rows.length
  const step = n > 1 ? (W - padX * 2) / (n - 1) : 0
  const x = (i: number) => padX + i * step
  const lbl = (d: string) => { const at = new Date(`${d}T00:00:00`); return tr.days === 7 ? at.toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { weekday: 'short' }) : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  const sales = rows.map((r) => num(r.sales)), purch = rows.map((r) => num(r.purchases))
  const maxL = Math.max(1, ...sales, ...purch) * 1.1
  const y = (v: number, max: number) => H - padY - (v / max) * (H - padY * 2)
  const path = (vals: number[], max: number) => vals.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v, max).toFixed(1)}`).join(' ')
  const showProfit = tr.show_cost && rows.some((r) => r.profit != null)
  const prof = rows.map((r) => num(r.profit)), get = rows.map((r) => num(r.to_get))
  const maxP = Math.max(1, ...prof.map(Math.abs)) * 1.15, maxG = Math.max(1, ...get) * 1.1
  const barW = Math.max(6, Math.min(28, step * 0.6))
  const every = n > 10 ? Math.ceil(n / 8) : 1
  const peak = showProfit ? prof.reduce((b, v, i) => (v > prof[b] ? i : b), 0) : 0
  const money = (v: number) => withCur(Math.round(v).toLocaleString('en-US'))
  return (
    <section className="shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-2.5" data-testid="nov-graphs">
      <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div>
            <div className="flex items-center gap-2"><h2 className="font-extrabold text-xs text-[#0F172A] dark:text-white">{pick('nov.chartSales')}</h2><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-obsidian-850 font-mono text-[9px] font-bold text-slate-500">{t('nov.lastDays', { n: tr.days })}</span></div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px]"><span className="flex items-center gap-1 font-bold text-[#65A30D] dark:text-[#84CC16]"><span className="w-2 h-2 rounded-full bg-[#84CC16]" /> {pick('nov.sales')}: <strong className="font-mono tabular-nums" dir="ltr">{rs(tr.totals.sales)}</strong></span>{tr.totals.purchases != null ? <span className="flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300"><span className="w-2 h-0.5 bg-slate-500 inline-block" /> {pick('nov.purchases')}: <strong className="font-mono tabular-nums" dir="ltr">{rs(tr.totals.purchases)}</strong></span> : null}</div>
          </div>
          <div className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300" data-testid="nov-hover-left">{hl == null ? pick('nov.hover') : `${lbl(rows[hl].date)}: ${pick('nov.sales')} ${money(sales[hl])} · ${pick('nov.purchShort')} ${money(purch[hl])}`}</div>
        </div>
        <div className="relative w-full h-[108px]" dir="ltr">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 560 110" preserveAspectRatio="none" role="img" aria-label={pick('nov.chartSales')}>
            <defs><linearGradient id="nov-lime" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#84CC16" stopOpacity="0.28" /><stop offset="100%" stopColor="#84CC16" stopOpacity="0.01" /></linearGradient></defs>
            <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#CBD5E1" strokeOpacity="0.4" strokeWidth="1" />
            <line x1={padX} y1={H / 2} x2={W - padX} y2={H / 2} stroke="#CBD5E1" strokeOpacity="0.25" strokeDasharray="3 3" strokeWidth="1" />
            {n > 1 ? <path d={`${path(sales, maxL)} L ${x(n - 1)} ${H - padY} L ${x(0)} ${H - padY} Z`} fill="url(#nov-lime)" /> : null}
            {tr.totals.purchases != null ? <path d={path(purch, maxL)} fill="none" stroke="#64748B" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /> : null}
            <path d={path(sales, maxL)} fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" />
            {rows.map((r, i) => (
              <g key={r.date}>
                {tr.totals.purchases != null ? <circle cx={x(i)} cy={y(purch[i], maxL)} r={n > 10 ? 2 : 3} fill="#64748B" /> : null}
                <circle cx={x(i)} cy={y(sales[i], maxL)} r={n > 10 ? 2.5 : 4} fill="#84CC16" stroke="#0F172A" strokeWidth="1.5" />
                {i % every === 0 ? <text x={x(i)} y="106" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="#64748B">{lbl(r.date)}</text> : null}
                <rect x={x(i) - Math.max(step / 2, 8)} y="0" width={Math.max(step, 16)} height="108" fill="transparent" className="cursor-pointer" onMouseEnter={() => setHl(i)} onMouseLeave={() => setHl(null)} />
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div>
            <div className="flex items-center gap-2"><h2 className="font-extrabold text-xs text-[#0F172A] dark:text-white">{pick(showProfit ? 'nov.chartProfit' : 'nov.chartGet')}</h2>{showProfit ? <span className="px-1.5 py-0.5 rounded bg-lime-100 dark:bg-lime-950 font-mono text-[9px] font-extrabold text-[#65A30D] dark:text-[#84CC16]" dir="ltr">{pick('ov.profit')}: {hide ? MASK : signed(tr.totals.profit)}</span> : null}</div>
            <div className="flex items-center gap-3 mt-0.5 text-[10px]"><span className="font-bold text-amber-600 dark:text-amber-400">● {pick('nov.toGetShort')}: <strong className="font-mono tabular-nums" dir="ltr">{rs(tr.totals.to_get)}</strong></span><span className="font-bold text-rose-600 dark:text-rose-400">┄ {pick('nov.toGiveShort')}: <strong className="font-mono tabular-nums" dir="ltr">{rs(tr.totals.to_give)}</strong></span></div>
          </div>
          <div className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300" data-testid="nov-hover-right">{hr != null ? `${lbl(rows[hr].date)}: ${showProfit ? `${pick('ov.profit')} ${hide ? MASK : money(prof[hr])} · ` : ''}${pick('nov.lene')} ${money(get[hr])}` : showProfit && n ? t('nov.peak', { d: lbl(rows[peak].date), n: hide ? MASK : money(prof[peak]) }) : pick('nov.hover')}</div>
        </div>
        <div className="relative w-full h-[108px]" dir="ltr">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 560 110" preserveAspectRatio="none" role="img" aria-label={pick('nov.chartProfit')}>
            <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#CBD5E1" strokeOpacity="0.4" strokeWidth="1" />
            {rows.map((r, i) => {
              const v = prof[i]
              const h = showProfit ? Math.max(4, (Math.abs(v) / maxP) * (H - padY * 2)) : 0
              return (
                <g key={r.date}>
                  {showProfit ? <rect x={x(i) - barW / 2} y={H - padY - h} width={barW} height={h} rx="5" fill={v < 0 ? '#F43F5E' : '#84CC16'} fillOpacity="0.85" /> : null}
                  {i % every === 0 ? <text x={x(i)} y="106" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono" fill="#64748B">{lbl(r.date)}</text> : null}
                </g>
              )
            })}
            <path d={path(get, maxG)} fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
            {rows.map((r, i) => (
              <g key={`g${r.date}`}>
                <circle cx={x(i)} cy={y(get[i], maxG)} r={n > 10 ? 2 : 3.5} fill="#F59E0B" stroke="#0F172A" strokeWidth="1.2" />
                <rect x={x(i) - Math.max(step / 2, 8)} y="0" width={Math.max(step, 16)} height="108" fill="transparent" className="cursor-pointer" onMouseEnter={() => setHr(i)} onMouseLeave={() => setHr(null)} />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  )
}

/** The file's own 220px sidebar: Dashboard, the counter's eight tiles, the shop's two-column list with Overview lit. */
function Side() {
  const { pick, ur, cls } = useLang()
  const has = useModules()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const managers = role === 'owner' || role === 'manager'
  const small = ur ? cls('sm') : 'text-[11px]'
  const tiny = ur ? cls('sm') : 'text-[10px]'
  const JOBS: [string, string, string, typeof Tag][] = [
    ['/new/khata', 'counter.khata', 'F4', BookOpen], ['/new/stock/summary', 'counter.stock', 'F6', Smartphone],
    ...(has('repairs') ? [['/new/repairs', 'counter.repair', 'F7', Wrench] as [string, string, string, typeof Tag]] : []),
    ['/new/return/new', 'counter.returnJob', 'F9', Undo2], ['/new/invoices', 'inv.short', 'F10', FileText],
    ...(has('expenses') ? [['/new/expenses', 'counter.expense', 'F8', Wallet] as [string, string, string, typeof Tag]] : []),
  ]
  const SHOP: [string, string, typeof Tag, boolean][] = [
    ['/new/parties', 'party.title', Users, true], ['/new/audit', 'audit.title', ShieldCheck, managers], ['/new/hisaab', 'counter.dayTitle', CalendarCheck, true],
    ['/new/overview', 'nov.overview', BarChart3, managers], ['/new/more/cash', 'more.cashAccounts', Landmark, managers], ['/new/purchases', 'nav.purchases', ShoppingBag, managers],
    ['/new/more/staff', 'more.staff', UserCog, role === 'owner'], ['/new/more/settings', 'more.settings', Settings, role === 'owner'],
  ]
  return (
    <aside className="hidden lg:flex lg:w-[220px] shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200 dark:border-slate-800 z-20" data-testid="nov-side">
      <NavLink to="/new" className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#0F172A] dark:bg-[#84CC16] text-[#84CC16] dark:text-obsidian-950 flex items-center justify-center font-extrabold text-xs shrink-0 shadow-xs" dir="ltr">{mark}</div>
        <div className="min-w-0"><div className="font-extrabold text-xs tracking-tight truncate">{name}</div><div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</div></div>
      </NavLink>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <NavLink to="/new" className={`w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-obsidian-850 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between cursor-pointer transition-colors ${ur ? cls('sm') : 'text-xs'}`}><span className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-slate-400" /> {pick('nav.dashboard')}</span><ChevronRight className="w-3 h-3 text-slate-400 rtl:rotate-180" /></NavLink>
        <div>
          <div className={`px-2 mb-1 font-extrabold uppercase tracking-wider text-slate-400 ${ur ? cls('sm') : 'text-[9px]'}`}>{pick('nav.counterSection')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NavLink to="/new/sale/new" className={`p-2 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-slate-950 font-extrabold flex flex-col justify-between gap-1 cursor-pointer transition-colors ${small}`}><span className="flex items-center justify-between w-full"><Tag className="w-3 h-3" /><span className="font-mono text-[9px] opacity-80" dir="ltr">F2</span></span><span>{pick('counter.sell')}</span></NavLink>
            <NavLink to="/new/purchase/new" className={`p-2 rounded-xl bg-[#0F172A] dark:bg-obsidian-800 hover:opacity-95 text-white font-extrabold flex flex-col justify-between gap-1 cursor-pointer ${small}`}><span className="flex items-center justify-between w-full"><PackagePlus className="w-3 h-3 text-[#84CC16]" /><span className="font-mono text-[9px] text-slate-400" dir="ltr">F3</span></span><span>{pick('counter.addStock')}</span></NavLink>
            {JOBS.map(([to, label, key, I]) => <NavLink key={to} to={to} className={`p-1.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex flex-col gap-0.5 cursor-pointer ${small}`}><span className="flex items-center justify-between w-full"><I className="w-3 h-3 text-[#65A30D]" /><span className="font-mono text-[9px] text-slate-400" dir="ltr">{key}</span></span><span>{pick(label)}</span></NavLink>)}
          </div>
        </div>
        <div>
          <div className={`px-2 mb-1 font-extrabold uppercase tracking-wider text-slate-400 ${ur ? cls('sm') : 'text-[9px]'}`}>{pick('nlist.shop')}</div>
          <div className={`grid grid-cols-2 gap-1.5 font-semibold text-slate-600 dark:text-slate-300 ${tiny}`}>
            {SHOP.filter((s) => s[3]).map(([to, label, I]) => to === '/new/overview' ? (
              <span key={to} aria-current="page" className="p-1.5 rounded-xl bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950 font-extrabold flex items-center gap-1.5 ring-2 ring-[#0F172A]/20 dark:ring-[#84CC16]/40"><I className="w-3 h-3 text-[#84CC16] dark:text-obsidian-950 shrink-0" /><span className="truncate">{pick(label)}</span></span>
            ) : (
              <NavLink key={to} to={to} className="p-1.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 flex items-center gap-1.5 cursor-pointer"><I className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{pick(label)}</span></NavLink>
            ))}
          </div>
        </div>
      </div>
      <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16] font-extrabold text-[11px] flex items-center justify-center shrink-0" dir="ltr">{initials}</div>
        <div className="min-w-0"><div className="text-[11px] font-bold truncate">{userName}</div><div className="text-[9px] text-slate-400 truncate">{role ? pick(`staff.roles.${role}`) : ''}</div></div>
      </div>
    </aside>
  )
}
