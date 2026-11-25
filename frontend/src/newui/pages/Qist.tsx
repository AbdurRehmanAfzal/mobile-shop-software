/** Qist (installments) in the new product (ADR-134). No mock-up draws it (owner 2026-11-23: design it
 *  from what the live software does, in the files' own visual language) — so it is drawn like file
 *  12 (amanat): the shared rail, the file's bar, four cards, tabs with a search and a card per plan on
 *  the left, and the chosen plan on the right: total / paid / left, the plan line and its progress,
 *  Take installment (cash, online, cheque or remittance), Remind on WhatsApp, the schedule, the
 *  customer and the guarantor, Open the bill, Cancel this plan.
 *
 *  Everything is the live qist: `GET /installments?view=` (today, overdue, active, closed) and
 *  `/installments/{id}`; take = `POST /installments/{id}/collect` (a payment on the bill), remind =
 *  `POST /installments/{id}/remind` (WhatsApp, or a link to send by hand), cancel =
 *  `POST /installments/{id}/cancel` with a reason (owner / manager, ADR-090: what is left stays as
 *  udhaar). A plan is made with a sale, so "+ New qist sale" opens the counter. The cards count the
 *  plans in each list — the app adds up no money. */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BellRing, CalendarClock, Check, CheckCircle2, Clock, FileText, HandCoins, Languages, MessageCircle, Moon, PhoneCall, Plus, Search, Sun, Trash2, UserCheck, X, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { ALL_BANKS, CURRENCIES, POPULAR_BANKS, REMIT_SERVICES } from '@/lib/pkPayments'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import FileRail from '../FileRail'

const LIME = '#A3E635'
type View = 'today' | 'overdue' | 'active' | 'closed'
const VIEWS: View[] = ['today', 'overdue', 'active', 'closed']
interface Row {
  id: string; invoice_id: string; invoice_no: string; party_id: string; party_name: string; party_phone: string | null; item: string
  total: string; advance: string; months: number; monthly: string; due_day: number; paid: string; remaining: string
  paid_count: number; overdue_count: number; overdue_amount: string; next_due: string | null; next_amount: string | null; days_late: number
  status: 'active' | 'closed' | 'void' | 'cancelled'; guarantor_name: string | null; guarantor_phone: string | null; guarantor_cnic: string | null; notes: string | null; last_reminded_at: string | null; created_at: string
}
interface Detail extends Row { schedule: { seq: number; due_date: string; amount: string; paid: string; status: 'paid' | 'partial' | 'today' | 'late' | 'due' }[]; payment_no?: string | null }

const plain = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
const rs = (v: string | number | null | undefined) => withCur(plain(v))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

export default function NewQist() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [params] = useSearchParams()
  const { id: openId } = useParams()
  const [view, setView] = useState<View>(() => (VIEWS.includes(params.get('view') as View) ? (params.get('view') as View) : 'active'))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(openId ?? null)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3200); return () => clearTimeout(x) }, [toast])
  const lists = {
    today: useGet<Row[]>(['installments', 'today', ''], '/api/v1/installments?view=today').data,
    overdue: useGet<Row[]>(['installments', 'overdue', ''], '/api/v1/installments?view=overdue').data,
    active: useGet<Row[]>(['installments', 'active', ''], '/api/v1/installments?view=active').data,
    closed: useGet<Row[]>(['installments', 'closed', ''], '/api/v1/installments?view=closed').data,
  }
  const query = q.trim()
  const { data: found } = useGet<Row[]>(['installments', 'search', view, query], query ? `/api/v1/installments?view=${view}&q=${encodeURIComponent(query)}` : null)
  const shown = (query ? found : lists[view]) ?? []
  const plan = shown.find((r) => r.id === sel) ?? shown[0] ?? null
  const late = lists.overdue ?? []
  const worst = useMemo(() => [...late].sort((a, b) => b.days_late - a.days_late)[0], [late])

  const card = (v: View, label: string, Icon: typeof Clock, tone: string, sub: string) => (
    <button type="button" onClick={() => { setView(v); setSel(null) }} className={`p-3.5 rounded-2xl text-start cursor-pointer ${tone} ${view === v ? 'ring-2 ring-obsidian-900 dark:ring-[#A3E635]' : ''}`} data-testid={`nq-k-${v}`}>
      <div className="flex items-center justify-between"><span className={`font-extrabold uppercase tracking-wider ${ur ? cls('sm') : 'text-[10px]'}`}>{pick(label)}</span><Icon className="w-3.5 h-3.5 opacity-70" /></div>
      <div className="font-display font-extrabold text-xl mt-1">{t('nq.plans', { n: (lists[v] ?? []).length })}</div>
      <div className="text-[11px] opacity-80 truncate" dir="auto">{sub}</div>
    </button>
  )

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nq" data-newui="1" data-file="12">
      <FileRail lit="" lime={LIME} testid="nq-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2"><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('inst.title')}</h1><span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#A3E635]/30 text-slate-800 dark:text-[#A3E635] border border-[#A3E635]/60">{pick('nq.badge')}</span></div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nq.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nq-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
            <button type="button" onClick={() => nav('/new/sale/new')} className="px-3.5 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="nq-new"><Plus className="w-4 h-4" />{pick('nq.newSale')}</button>
          </div>
        </header>

        <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {card('today', 'inst.view.today', CalendarClock, 'bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200', pick('nq.todaySub'))}
          {card('overdue', 'inst.view.overdue', Clock, 'bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200', worst ? `${worst.party_name} • ${pick('inst.lateBy').replace('{{n}}', String(worst.days_late))}` : pick('nq.noneLate'))}
          {card('active', 'inst.view.active', HandCoins, 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800', pick('nq.activeSub'))}
          {card('closed', 'inst.view.closed', CheckCircle2, 'bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200', pick('nq.closedSub'))}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
          <div className="w-full lg:w-[55%] lg:h-full flex flex-col min-h-0 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800">
            <div className="shrink-0 px-4 sm:px-6 pt-2 pb-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">{VIEWS.map((v) => <button key={v} type="button" onClick={() => { setView(v); setSel(null) }} aria-pressed={view === v} data-testid={`nq-tab-${v}`} className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${view === v ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}><span>{pick(`inst.view.${v}`)}</span><span className={`px-1.5 rounded-md text-[10px] font-mono ${view === v ? 'bg-white/20' : 'bg-slate-100 dark:bg-obsidian-850'}`} dir="ltr">{(lists[v] ?? []).length}</span></button>)}</div>
              <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('inst.search')} className="w-full ps-9 pe-8 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" data-testid="nq-q" />{q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}</div>
            </div>
            <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 pb-6 space-y-2.5" data-testid="nq-cards">
              {!shown.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700"><div className="text-sm font-bold">{pick('inst.none')}</div><div className="text-xs text-slate-500 mt-1">{pick('nq.noneHint')}</div></div> : shown.map((r) => {
                const on = r.id === plan?.id
                const lateNow = r.status === 'active' && r.days_late > 0
                return (
                  <div key={r.id} role="button" tabIndex={0} onClick={() => setSel(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(r.id) }} data-testid="nq-card" className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-obsidian-900 cursor-pointer transition-all ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] shadow-md' : 'border border-slate-200/90 dark:border-slate-800 hover:border-slate-400 shadow-2xs'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-display font-extrabold text-sm sm:text-[15px] truncate" dir="auto">{r.party_name}</div><div className="mt-0.5 text-[11px] text-slate-500 truncate" dir="auto">{r.item ? `${r.item} · ` : ''}<span dir="ltr">{r.invoice_no}</span></div></div>
                      <div className="shrink-0 text-end"><div className="font-display font-extrabold text-base" dir="ltr">{rs(r.next_amount ?? r.monthly)}</div>{r.status !== 'active' ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'closed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{pick(`inst.status.${r.status}`)}</span> : <span className={`text-[11px] font-bold ${lateNow ? 'text-rose-600' : 'text-slate-500'}`}>{lateNow ? pick('inst.lateBy').replace('{{n}}', String(r.days_late)) : r.next_due ? <>{pick('inst.nextDue')} <span dir="ltr">{fmtDate(r.next_due)}</span></> : ''}</span>}</div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, r.months)}, minmax(0, 1fr))` }} dir="ltr">{Array.from({ length: r.months }, (_, i) => <span key={i} className={`h-1.5 rounded-full ${i < r.paid_count ? 'bg-emerald-500' : i < r.paid_count + r.overdue_count ? 'bg-rose-400' : 'bg-slate-200 dark:bg-obsidian-800'}`} />)}</div>
                      <span className="shrink-0 text-[11px] font-bold text-slate-600 dark:text-slate-300" dir="ltr">{r.paid_count}/{r.months}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">{pick('inst.remaining')}: <strong className="font-mono text-slate-800 dark:text-slate-200" dir="ltr">{plain(r.remaining)}</strong></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="w-full lg:w-[45%] lg:h-full lg:overflow-y-auto bg-white dark:bg-obsidian-900 p-4 sm:p-6 space-y-4" data-testid="nq-detail">
            {plan ? <PlanPanel key={plan.id} id={plan.id} onToast={setToast} /> : <div className="h-full min-h-40 flex items-center justify-center text-xs text-slate-400">{pick('nq.pick')}</div>}
          </div>
        </div>
      </div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nq-toast">{toast}</span></div></div>
    </div>
  )
}

function PlanPanel({ id, onToast }: { id: string; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const role = useAuth((s) => s.me?.user.role)
  const canCancel = role === 'owner' || role === 'manager'
  const { data: p } = useGet<Detail>(['installment', id], `/api/v1/installments/${id}`)
  const [taking, setTaking] = useState(false)
  const [amount, setAmount] = useState('')
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cancel, setCancel] = useState(false)
  if (!p) return <div className="py-16 text-center text-xs text-slate-400">…</div>
  const amt = amount === '' ? String(Number(p.next_amount ?? p.monthly)) : amount
  const active = p.status === 'active'
  const lateNow = active && p.days_late > 0

  async function take() {
    setBusy(true); setErr('')
    try {
      const r = await api<Detail>('POST', `/api/v1/installments/${id}/collect`, { amount: Number(amt), payment: payInfo(pay) })
      await inv('installment', 'installments', 'dashboard', 'parties', 'party', 'day')
      onToast(`${pick('inst.collected')} ${r.payment_no ?? ''}`); setTaking(false); setAmount(''); setPay(newPay())
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  async function remind() {
    setErr('')
    try {
      const m = await api<{ status: string; link: string | null }>('POST', `/api/v1/installments/${id}/remind`)
      if (m.status !== 'sent' && m.link) window.open(m.link, '_blank', 'noopener')
      onToast(pick(m.status === 'sent' ? 'inst.reminded' : 'inst.remindOpened')); await inv('installment')
    } catch (e) { setErr(errText(e, ur)) }
  }
  const stTone = (s: string) => (s === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : s === 'late' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : s === 'partial' || s === 'today' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-obsidian-800 dark:text-slate-300')

  return (
    <>
      <div className="space-y-2 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${lateNow ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 border-rose-200' : active ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 border-blue-200' : p.status === 'closed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`} data-testid="nq-state"><span className={`w-2 h-2 rounded-full ${lateNow ? 'bg-rose-500 animate-pulse' : active ? 'bg-blue-500' : p.status === 'closed' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{lateNow ? pick('inst.lateBy').replace('{{n}}', String(p.days_late)) : pick(`inst.status.${p.status}`)}</span>
          <button type="button" onClick={() => nav(`/sales/${p.invoice_id}`)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer" data-testid="nq-bill"><FileText className="w-3.5 h-3.5" />{pick('inst.viewBill')} <span dir="ltr">{p.invoice_no}</span><ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" /></button>
        </div>
        <h2 className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="auto" data-testid="nq-title">{p.party_name}</h2>
        <div className="text-xs text-slate-500" dir="auto">{p.item}</div>
      </div>

      <div className="grid grid-cols-3 gap-2.5" data-testid="nq-money">
        <Fig k="inst.total" v={rs(p.total)} />
        <Fig k="inst.paidSoFar" v={rs(p.paid)} tone="green" />
        <Fig k="inst.remaining" v={rs(p.remaining)} tone={lateNow ? 'rose' : 'amber'} />
      </div>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 text-xs space-y-2">
        <div className="font-semibold text-slate-600 dark:text-slate-300" data-testid="nq-planline">{pick('inst.planLine').replace('{{adv}}', plain(p.advance)).replace('{{m}}', String(p.months)).replace('{{x}}', plain(p.monthly)).replace('{{d}}', String(p.due_day))}</div>
        <div className="flex items-center gap-2"><div className="flex-1 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, p.months)}, minmax(0, 1fr))` }} dir="ltr">{p.schedule.map((s) => <span key={s.seq} className={`h-2 rounded-full ${s.status === 'paid' ? 'bg-emerald-500' : s.status === 'late' ? 'bg-rose-400' : s.status === 'partial' || s.status === 'today' ? 'bg-amber-400' : 'bg-slate-200 dark:bg-obsidian-800'}`} />)}</div><span className="font-bold" dir="ltr">{p.paid_count}/{p.months}</span></div>
        {p.last_reminded_at ? <div className="text-[11px] text-slate-400">{pick('nq.lastReminded')} <span dir="ltr">{fmtDate(p.last_reminded_at)}</span></div> : null}
      </div>

      {active ? (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-obsidian-850/90 border border-slate-200/90 dark:border-slate-800 space-y-3" data-testid="nq-actions">
          <div className="flex items-center justify-between"><span className="text-[11px] font-display font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{pick('nq.thisMonth')}</span>{p.next_due ? <span className="text-[11px] text-slate-500">{pick('inst.nextDue')}: <strong dir="ltr">{fmtDate(p.next_due)}</strong> · <strong dir="ltr">{rs(p.next_amount)}</strong></span> : null}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setTaking(!taking)} className="py-2.5 px-3 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nq-take"><HandCoins className="w-4 h-4" />{pick('inst.collect')}</button>
            <button type="button" onClick={() => void remind()} disabled={!p.party_phone} className="py-2.5 px-3 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nq-remind"><BellRing className="w-4 h-4 text-emerald-600" />{pick('inst.remind')}</button>
          </div>
          {taking ? (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3" data-testid="nq-take-box">
              <div><label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">{pick('inst.amount')}</label><input type="number" min={1} max={Number(p.remaining)} value={amt} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl font-mono text-lg font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700" dir="ltr" data-testid="nq-amount" /></div>
              <PayWay pay={pay} setPay={setPay} />
              <button type="button" onClick={() => void take()} disabled={busy || !Number(amt) || Number(amt) > Number(p.remaining) || !payReady(pay)} className="w-full py-2.5 px-4 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nq-take-save"><Check className="w-4 h-4" />{pick('inst.collectNow')} <span dir="ltr">{rs(amt)}</span></button>
            </div>
          ) : null}
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
          {canCancel ? <button type="button" onClick={() => setCancel(true)} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer" data-testid="nq-cancel"><Trash2 className="w-3 h-3" />{pick('del.cancelPlan')}</button> : null}
        </div>
      ) : null}

      <div className="space-y-2" data-testid="nq-schedule">
        <div className="text-[11px] font-display font-extrabold uppercase tracking-wider text-slate-400">{pick('inst.schedule')}</div>
        {p.schedule.map((s) => (
          <div key={s.seq} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50/80 dark:bg-obsidian-850/60 border border-slate-200/60 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2.5"><span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[11px] ${stTone(s.status)}`}>{s.status === 'paid' ? <Check className="w-3.5 h-3.5" /> : s.seq}</span><div><div className="font-bold" dir="ltr">{fmtDate(s.due_date)}</div>{s.status === 'partial' ? <div className="text-[10px] text-slate-500">{pick('inst.partial').replace('{{n}}', plain(s.paid))}</div> : null}</div></div>
            <div className="flex items-center gap-2"><span className="font-mono font-bold" dir="ltr">{rs(s.amount)}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stTone(s.status)}`}>{pick(`inst.st.${s.status}`)}</span></div>
          </div>
        ))}
      </div>

      <div className="p-3.5 rounded-2xl bg-white dark:bg-obsidian-850/60 border border-slate-200/90 dark:border-slate-800 space-y-2.5" data-testid="nq-people">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('inst.people')}</div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><button type="button" onClick={() => nav(`/new/parties/${p.party_id}`)} className="font-display font-extrabold text-sm hover:underline cursor-pointer" dir="auto">{p.party_name}</button><div className="text-[11px] text-slate-500" dir="ltr">{p.party_phone ?? ''}</div></div>
          {p.party_phone ? <div className="flex items-center gap-1.5 shrink-0"><a href={`tel:${p.party_phone}`} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-900 text-xs font-bold flex items-center gap-1"><PhoneCall className="w-3.5 h-3.5 text-blue-600" />{pick('nkh.call')}</a><a href={`https://wa.me/${waNumber(p.party_phone)}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a></div> : null}
        </div>
        {p.guarantor_name ? (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2" data-testid="nq-guarantor">
            <div className="flex items-center gap-2 min-w-0"><span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-obsidian-800 flex items-center justify-center text-slate-500 shrink-0"><UserCheck className="w-4 h-4" /></span><div className="min-w-0"><div className="text-xs font-bold truncate" dir="auto">{p.guarantor_name} <span className="font-normal text-slate-500">· {pick('inst.guarantor')}</span></div><div className="text-[11px] text-slate-500" dir="ltr">{[p.guarantor_phone, p.guarantor_cnic].filter(Boolean).join(' · ')}</div></div></div>
            {p.guarantor_phone ? <a href={`tel:${p.guarantor_phone}`} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1 shrink-0"><PhoneCall className="w-3.5 h-3.5 text-blue-600" />{pick('nkh.call')}</a> : null}
          </div>
        ) : null}
        {p.notes ? <p className="text-[11px] text-slate-500 italic" dir="auto">"{p.notes}"</p> : null}
      </div>
      {cancel ? <CancelWindow id={id} onClose={() => setCancel(false)} onDone={() => { setCancel(false); onToast(pick('nkh.undone')); void inv('installment', 'installments', 'dashboard') }} /> : null}
    </>
  )
}

function Fig({ k, v, tone }: { k: string; v: string; tone?: 'green' | 'amber' | 'rose' }) {
  const { pick } = useLang()
  const c = tone === 'green' ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/70 text-emerald-700 dark:text-[#A3E635]' : tone === 'amber' ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/70 text-amber-700 dark:text-amber-300' : tone === 'rose' ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/70 text-rose-700 dark:text-rose-300' : 'bg-slate-50 dark:bg-obsidian-850 border-slate-200/70 dark:border-slate-800'
  return <div className={`p-3 rounded-xl border ${c}`}><div className="text-[10px] font-bold uppercase opacity-80">{pick(k)}</div><div className="font-display font-extrabold text-sm mt-0.5" dir="ltr">{v}</div></div>
}

/** how the installment was paid: the live payment details (cash, online with the bank, cheque, remittance) */
function PayWay({ pay, setPay }: { pay: PayState; setPay: (p: PayState) => void }) {
  const { pick } = useLang()
  const field = 'w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700'
  return (
    <div className="space-y-2" data-testid="nq-pay">
      <div className="grid grid-cols-4 gap-1">{(['cash', 'online', 'cheque', 'remittance'] as const).map((m) => <button key={m} type="button" onClick={() => setPay({ ...newPay(m), chequeDate: pay.chequeDate })} aria-pressed={pay.method === m} className={`py-2 px-1 rounded-xl text-[10px] font-extrabold cursor-pointer ${pay.method === m ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-600'}`} data-testid={`nq-pay-${m}`}>{pick(`nq.m.${m}`)}</button>)}</div>
      {pay.method === 'online' || pay.method === 'cheque' ? (
        <>
          <div className="flex flex-wrap gap-1">{POPULAR_BANKS.slice(0, 8).map((b) => <button key={b} type="button" onClick={() => setPay({ ...pay, bank: b })} className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${pay.bank === b ? 'bg-obsidian-900 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700'}`}>{b}</button>)}</div>
          <select value={pay.bank} onChange={(e) => setPay({ ...pay, bank: e.target.value })} className={field} aria-label={pick('nq.bank')} data-testid="nq-pay-bank"><option value="">{pick('nq.bank')}</option>{ALL_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
          <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pick(pay.method === 'cheque' ? 'nq.chequeNo' : 'nq.tid')} className={field} dir="ltr" />
          {pay.method === 'cheque' ? <input type="date" value={pay.chequeDate} onChange={(e) => setPay({ ...pay, chequeDate: e.target.value })} className={field} dir="ltr" /> : null}
        </>
      ) : null}
      {pay.method === 'remittance' ? (
        <div className="grid grid-cols-2 gap-2">
          <select value={pay.currency} onChange={(e) => setPay({ ...pay, currency: e.target.value })} className={field} aria-label={pick('nq.currency')}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.country}</option>)}</select>
          <select value={pay.service} onChange={(e) => setPay({ ...pay, service: e.target.value })} className={field} aria-label={pick('nq.service')}><option value="">{pick('nq.service')}</option>{REMIT_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <input type="number" min={0} value={pay.foreign} onChange={(e) => setPay({ ...pay, foreign: e.target.value })} placeholder={pick('nq.foreign')} className={field} dir="ltr" />
          <input type="number" min={0} value={pay.rate} onChange={(e) => setPay({ ...pay, rate: e.target.value })} placeholder={pick('nq.rate')} className={field} dir="ltr" />
          <input value={pay.sender} onChange={(e) => setPay({ ...pay, sender: e.target.value })} placeholder={pick('nq.sender')} className={`${field} col-span-2`} dir="auto" />
        </div>
      ) : null}
    </div>
  )
}

function CancelWindow({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nq-cancel-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('del.cancelPlan')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <p className="text-xs text-slate-500">{pick('del.installment.effect')}</p>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('bill.reasonPh')} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nq-cancel-why" />
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || why.trim().length < 3} onClick={async () => { setBusy(true); setErr(''); try { await api('POST', `/api/v1/installments/${id}/cancel`, { reason: why.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-rose-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nq-cancel-yes">{pick('nkh.confirmDelete')}</button></div>
      </div>
    </div>
  )
}
