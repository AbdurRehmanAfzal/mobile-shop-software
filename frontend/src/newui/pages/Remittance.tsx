/** Money from abroad (remittance) in the new product (ADR-134). No mock-up draws it (owner 2026-11-23:
 *  design it from what the live software does, in the files' own visual language) — so it is drawn
 *  like file 03 (cash & bank) and file 12: the shared rail, the file's bar with the periods, five
 *  cards, the currencies as chips, filters, a row per remittance, and the "Remittance" money account
 *  with Move to bank.
 *
 *  Everything is the live software's: the shop audit's international report
 *  (`GET /shop-audit/international` — remittances on sales, purchases and khata payments, with the
 *  totals, fees, net and by currency, all the server's), the Remittance account's balance
 *  (`GET /ledger/accounts`, money on its way — not in the drawer or the bank yet), a move from it to
 *  the bank or the drawer (`POST /ledger/transfers`), and money received from abroad on a person's
 *  khata (`POST /payments` with the live remittance details — currency, amount sent, rate, sender,
 *  service, reference, fee, status). Owner / manager, as the report on the server. */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, FileText, Globe, Languages, Moon, Plus, Search, ShieldCheck, Sun, Users, Wallet, X, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { isoDay, withCur } from '@/lib/format'
import { CURRENCIES, REMIT_SERVICES } from '@/lib/pkPayments'
import { LOCALES, setLocale } from '@/i18n'
import { useCashAccounts, useGet, useInvalidate, useParties } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { periodOf, type Period } from '@/features/counter/PeriodPicker'
import type { Party } from '@/lib/types'
import FileRail from '../FileRail'

const LIME = '#B4F000'
type Kind = 'today' | 'week' | 'month' | 'year'
type M = string | null
interface Row { date: string; document_type: 'sale' | 'purchase' | 'payment'; document_id: string; document_no: string; direction: 'in' | 'out'; party_id: string | null; party_name: string | null; sender_name: string | null; country: string | null; service: string | null; currency: string | null; foreign_amount: M; rate: M; pkr_amount: string; reference: string | null; fee: M; net: string; status: string | null }
interface Intl { rows: Row[]; total_pkr_in: string; total_pkr_out: string; total_fees: string; total_net_in: string; by_status: Record<string, number>; by_currency: { currency: string; foreign_amount: string; pkr_amount: string; fees: string; net: string; count: number }[]; notes: string[] }

const num = (v: M | number | undefined) => Number(v ?? 0)
const plain = (v: M | number | undefined) => Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 2 })
const rs = (v: M | number | undefined) => withCur(Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const periodFor = (k: Kind): Period => (k === 'year' ? { from: `${isoDay(0).slice(0, 4)}-01-01`, to: isoDay(0) } : periodOf(k))

export default function NewRemittance() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [kind, setKind] = useState<Kind>('month')
  const period = periodFor(kind)
  const { data } = useGet<Intl>(['audit-intl', period.from, period.to], manager ? `/api/v1/shop-audit/international?preset=custom&date_from=${period.from}&date_to=${period.to}` : null)
  const { data: accounts } = useCashAccounts()
  const remitAcc = (accounts ?? []).find((a) => a.kind === 'remittance')
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all')
  const [cur, setCur] = useState('')
  const [q, setQ] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [moving, setMoving] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3000); return () => clearTimeout(x) }, [toast])
  const query = q.trim().toLowerCase()
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (dir === 'all' || r.direction === dir) && (!cur || (r.currency ?? 'PKR') === cur) && (!query || `${r.party_name ?? ''} ${r.sender_name ?? ''} ${r.document_no} ${r.reference ?? ''} ${r.service ?? ''} ${r.country ?? ''}`.toLowerCase().includes(query))), [data, dir, cur, query])
  const open = (r: Row) => nav(r.document_type === 'sale' ? `/sales/${r.document_id}` : r.document_type === 'purchase' ? '/new/purchases' : r.party_id ? `/new/parties/${r.party_id}` : '/new/khata')

  const shell = (body: React.ReactNode) => (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nrem" data-newui="1" data-file="03">
      <FileRail lit="" lime={LIME} testid="nrem-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">{body}</div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#B4F000]" /><span data-testid="nrem-toast">{toast}</span></div></div>
    </div>
  )
  if (!manager) return shell(<div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="nrem-managers"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('nrem.managersOnly')}</p></div></div>)

  const fig = (testid: string, label: string, value: string, sub: string, tone: string, onClick?: () => void) => (
    <button type="button" onClick={onClick} disabled={!onClick} className={`p-4 rounded-2xl text-start border ${tone} ${onClick ? 'cursor-pointer' : 'cursor-default'}`} data-testid={testid}>
      <div className={`font-extrabold uppercase tracking-wider opacity-80 ${ur ? cls('sm') : 'text-[10px]'}`}>{pick(label)}</div>
      <div className="font-display font-extrabold text-xl sm:text-2xl tracking-tight mt-1" dir="ltr">{value}</div>
      <div className="text-[11px] opacity-75 mt-0.5 truncate">{sub}</div>
    </button>
  )

  return shell(
    <>
      <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-[#B4F000] dark:text-obsidian-950 flex items-center justify-center"><Globe className="w-4 h-4" /></span>
          <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('nrem.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nrem.subtitle')}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800" role="group">
          {(['today', 'week', 'month', 'year'] as Kind[]).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`nrem-p-${k}`} className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${kind === k ? 'font-bold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-400'}`}>{pick(`nrem.p.${k}`)}</button>)}
          </div>
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nrem-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#B4F000]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          <button type="button" onClick={() => setReceiving(true)} className="px-3.5 py-1.5 rounded-xl bg-[#B4F000] hover:brightness-95 text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="nrem-receive"><Plus className="w-4 h-4" />{pick('nrem.receive')}</button>
        </div>
      </header>

      <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-obsidian-900 text-white border border-slate-800 flex flex-col justify-between gap-2" data-testid="nrem-waiting">
            <div className="flex items-center justify-between"><span className={`font-extrabold uppercase tracking-wider text-slate-400 ${ur ? cls('sm') : 'text-[10px]'}`}>{pick('nrem.waiting')}</span><Wallet className="w-4 h-4 text-[#B4F000]" /></div>
            <div className="font-display font-extrabold text-xl sm:text-2xl text-[#B4F000]" dir="ltr">{remitAcc ? rs(remitAcc.balance) : '—'}</div>
            <div className="text-[11px] text-slate-400">{pick('nrem.waitingSub')}</div>
            <button type="button" disabled={!remitAcc || num(remitAcc.balance) <= 0} onClick={() => setMoving(true)} className="mt-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40" data-testid="nrem-move"><ArrowRightLeft className="w-3.5 h-3.5" />{pick('nrem.moveToBank')}</button>
          </div>
          {fig('nrem-in', 'nrem.kIn', rs(data?.total_pkr_in), t('nrem.count', { n: (data?.rows ?? []).filter((r) => r.direction === 'in').length }), 'bg-[#B4F000] text-slate-950 border-[#B4F000]', () => setDir('in'))}
          {fig('nrem-fees', 'nrem.kFees', rs(data?.total_fees), pick('nrem.kFeesSub'), 'bg-amber-50/90 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300')}
          {fig('nrem-net', 'nrem.kNet', rs(data?.total_net_in), pick('nrem.kNetSub'), 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300')}
          {fig('nrem-out', 'nrem.kOut', rs(data?.total_pkr_out), t('nrem.count', { n: (data?.rows ?? []).filter((r) => r.direction === 'out').length }), 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800', () => setDir('out'))}
        </div>

        {data?.by_currency.length ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="nrem-currencies">
            <button type="button" onClick={() => setCur('')} aria-pressed={!cur} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${!cur ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`}>{pick('nrem.allCur')}</button>
            {data.by_currency.map((c) => (
              <button key={c.currency} type="button" onClick={() => setCur(cur === c.currency ? '' : c.currency)} aria-pressed={cur === c.currency} className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer ${cur === c.currency ? 'bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`} data-testid={`nrem-cur-${c.currency}`}>
                <span className="font-mono font-extrabold">{c.currency}</span>{c.currency !== 'PKR' ? <span className="font-mono" dir="ltr">{plain(c.foreign_amount)}</span> : null}<span className="opacity-70" dir="ltr">= {rs(c.pkr_amount)}</span><span className="px-1.5 rounded-md bg-black/10 dark:bg-white/10 font-mono text-[10px]">{c.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800">
          <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5">{(['all', 'in', 'out'] as const).map((d) => <button key={d} type="button" onClick={() => setDir(d)} aria-pressed={dir === d} data-testid={`nrem-dir-${d}`} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${dir === d ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(`nrem.dir.${d}`)}</button>)}</div>
            <div className="relative flex-1 max-w-sm min-w-[200px]"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nrem.search')} className="w-full ps-8 pe-7 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nrem-q" />{q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}</div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="nrem-rows">
            {!rows.length ? <div className="p-10 text-center"><Globe className="w-8 h-8 mx-auto text-slate-300" /><div className="text-sm font-bold mt-2">{pick('nrem.none')}</div><div className="text-xs text-slate-500 mt-1">{pick('nrem.noneHint')}</div></div> : rows.map((r) => (
              <button key={`${r.document_type}-${r.document_id}`} type="button" onClick={() => open(r)} className="w-full p-3.5 sm:p-4 grid grid-cols-12 gap-3 items-center text-start hover:bg-slate-50 dark:hover:bg-obsidian-850/60 cursor-pointer" data-testid="nrem-row">
                <div className="col-span-12 sm:col-span-5 flex items-center gap-3 min-w-0">
                  <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${r.direction === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>{r.direction === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}</span>
                  <div className="min-w-0"><div className="text-sm font-bold truncate" dir="auto">{r.sender_name || r.party_name || '—'}{r.sender_name && r.party_name ? <span className="font-normal text-slate-500"> → {r.party_name}</span> : null}</div><div className="text-[11px] text-slate-500 truncate">{[r.country, r.service].filter(Boolean).join(' · ') || pick('nrem.noDetail')}</div></div>
                </div>
                <div className="col-span-6 sm:col-span-3 text-xs">{r.currency ? <div className="font-mono font-bold" dir="ltr">{plain(r.foreign_amount)} {r.currency} × {plain(r.rate)}</div> : <div className="text-slate-400">{pick('nrem.pkrOnly')}</div>}<div className="text-[11px] text-slate-500"><span dir="ltr">{fmtDate(r.date)}</span> · <span className="inline-flex items-center gap-0.5"><FileText className="w-3 h-3" /><span dir="ltr">{r.document_no}</span></span></div></div>
                <div className="col-span-6 sm:col-span-4 flex items-center justify-end gap-2.5">
                  {r.status ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{pick(`nrem.st.${r.status}`)}</span> : null}
                  <div className="text-end"><div className={`font-display font-extrabold text-sm ${r.direction === 'in' ? 'text-emerald-700 dark:text-[#B4F000]' : 'text-rose-600'}`} dir="ltr">{r.direction === 'in' ? '+' : '−'}{rs(r.pkr_amount)}</div>{num(r.fee) > 0 ? <div className="text-[10px] text-slate-500">{pick('nrem.fee')} <span dir="ltr">{rs(r.fee)}</span> · {pick('nrem.net')} <span dir="ltr">{rs(r.net)}</span></div> : null}</div>
                </div>
              </button>
            ))}
          </div>
          {data?.notes.length ? <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">{pick('nrem.note')}</div> : null}
        </div>
      </div>
      {receiving ? <ReceiveDrawer onClose={() => setReceiving(false)} onDone={(m) => { setReceiving(false); setToast(m) }} /> : null}
      {moving && remitAcc ? <MoveWindow fromId={remitAcc.id} max={num(remitAcc.balance)} onClose={() => setMoving(false)} onDone={(m) => { setMoving(false); setToast(m) }} /> : null}
    </>,
  )
}

/** money from abroad on a person's khata: the live payment with the remittance details */
function ReceiveDrawer({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [pq, setPq] = useState('')
  const { data: people } = useParties(pq.trim() ? { q: pq.trim() } : {})
  const [party, setParty] = useState<Party | null>(null)
  const [currency, setCurrency] = useState('SAR')
  const [foreign, setForeign] = useState('')
  const [rate, setRate] = useState('')
  const [pkr, setPkr] = useState('')
  const [sender, setSender] = useState('')
  const [service, setService] = useState('')
  const [reference, setReference] = useState('')
  const [fee, setFee] = useState('')
  const [status, setStatus] = useState<'received' | 'pending'>('received')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // the rupees come to amount sent × rate; the shop may type what actually arrived instead
  const made = Math.round(Number(foreign || 0) * Number(rate || 0) * 100) / 100
  const amount = pkr !== '' ? Number(pkr) : made
  const ready = !!party && amount > 0 && Number(foreign) > 0 && Number(rate) > 0 && !!sender.trim()
  const field = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'
  async function save() {
    if (!ready || !party) return
    setBusy(true); setErr('')
    try {
      const c = CURRENCIES.find((x) => x.code === currency)
      await api('POST', '/api/v1/payments', { party_id: party.id, direction: 'in', amount, payment: { method: 'remittance', currency, country: c?.country, foreign_amount: Number(foreign), rate: Number(rate), sender_name: sender.trim(), service: service || undefined, reference: reference.trim() || undefined, fee: Number(fee) > 0 ? Number(fee) : undefined, status } })
      await inv('audit-intl', 'cash', 'parties', 'party', 'payments', 'dashboard', 'day')
      onDone(t('nrem.received', { n: withCur(amount.toLocaleString('en-US')), who: party.name }))
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="nrem-drawer">
      <div className="w-full max-w-md h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div><h3 className="font-display font-extrabold text-sm">{pick('nrem.receive')}</h3><p className="text-[11px] text-slate-500">{pick('nrem.receiveHint')}</p></div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">1. {pick('nrem.forWhom')}</label>
            {party ? <div className="p-2.5 rounded-xl border-2 border-obsidian-900 dark:border-[#B4F000] flex items-center justify-between text-xs" data-testid="nrem-party"><span className="font-bold" dir="auto">{party.name}</span><button type="button" onClick={() => setParty(null)} className="text-slate-400 cursor-pointer" aria-label={pick('nlist.clear')}><X className="w-3.5 h-3.5" /></button></div> : (
              <>
                <div className="relative"><Users className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={pq} onChange={(e) => setPq(e.target.value)} placeholder={pick('nlist.partySearch')} className={`${field} ps-8`} data-testid="nrem-pq" /></div>
                <div className="max-h-44 overflow-y-auto space-y-1.5" data-testid="nrem-people">{(people ?? []).slice(0, 8).map((p) => <button key={p.id} type="button" onClick={() => setParty(p)} className="w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border border-slate-200 dark:border-slate-800 hover:border-slate-400"><span className="font-bold truncate" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone ?? ''}</span></button>)}</div>
              </>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">2. {pick('nrem.howMuch')}</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field} aria-label={pick('nq.currency')} data-testid="nrem-currency">{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
              <input type="number" min={0} value={foreign} onChange={(e) => setForeign(e.target.value)} placeholder={pick('nq.foreign')} className={field} dir="ltr" data-testid="nrem-foreign" />
              <input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={pick('nq.rate')} className={field} dir="ltr" data-testid="nrem-rate" />
            </div>
            <div className="p-3 rounded-xl bg-obsidian-900 text-white flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">{pick('nrem.comesTo')}</span><input type="number" min={0} value={pkr !== '' ? pkr : made ? String(made) : ''} onChange={(e) => setPkr(e.target.value)} className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-end font-mono font-extrabold text-[#B4F000]" dir="ltr" data-testid="nrem-pkr" /></div>
            <p className="text-[10px] text-slate-400">{pick('nrem.comesToHint')}</p>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">3. {pick('nrem.from')}</label>
            <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder={pick('nq.sender')} className={field} dir="auto" data-testid="nrem-sender" />
            <div className="grid grid-cols-2 gap-2">
              <select value={service} onChange={(e) => setService(e.target.value)} className={field} aria-label={pick('nq.service')} data-testid="nrem-service"><option value="">{pick('nq.service')}</option>{REMIT_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={pick('nrem.mtcn')} className={field} dir="ltr" />
              <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder={pick('nrem.feePh')} className={field} dir="ltr" data-testid="nrem-fee" />
              <div className="grid grid-cols-2 gap-1">{(['received', 'pending'] as const).map((s) => <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-xl text-[10px] font-extrabold cursor-pointer ${status === s ? 'bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850'}`}>{pick(`nrem.st.${s}`)}</button>)}</div>
            </div>
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 mb-2">{pick('nrem.lands')}</p>
          <button type="button" onClick={() => void save()} disabled={busy || !ready} className="w-full py-3 rounded-xl bg-[#B4F000] hover:brightness-95 disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer" data-testid="nrem-save"><Plus className="w-4 h-4" />{pick('nrem.save')} {amount > 0 ? <span dir="ltr">{withCur(amount.toLocaleString('en-US'))}</span> : null}</button>
        </div>
      </div>
    </div>
  )
}

/** the money on its way has arrived: move it from the Remittance account to the bank or the drawer */
function MoveWindow({ fromId, max, onClose, onDone }: { fromId: string; max: number; onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const { data: accounts } = useCashAccounts()
  const targets = (accounts ?? []).filter((a) => a.kind !== 'remittance' && a.kind !== 'cheque')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState(String(max))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!to && targets.length) setTo((targets.find((a) => a.kind !== 'cash') ?? targets[0]).id) }, [targets, to])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nrem-move-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('nrem.moveToBank')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <p className="text-xs text-slate-500">{pick('nrem.moveHint')}</p>
        <div className="space-y-1.5" data-testid="nrem-move-to">{targets.map((a) => <button key={a.id} type="button" onClick={() => setTo(a.id)} aria-pressed={to === a.id} className={`w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between cursor-pointer border ${to === a.id ? 'border-2 border-obsidian-900 dark:border-[#B4F000]' : 'border-slate-200 dark:border-slate-700'}`}><span className="font-bold" dir="auto">{ur ? a.name_ur || a.name : a.name}</span><span className="font-mono text-slate-500" dir="ltr">{rs(a.balance)}</span></button>)}</div>
        <input type="number" min={1} max={max} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl font-mono font-extrabold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" dir="ltr" data-testid="nrem-move-amount" />
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || !to || !(Number(amount) > 0) || Number(amount) > max} onClick={async () => { setBusy(true); setErr(''); try { await api('POST', '/api/v1/ledger/transfers', { from_account_id: fromId, to_account_id: to, amount: Number(amount), note: pick('nrem.moveNote') }); await inv('cash', 'book', 'transfers', 'dashboard', 'accounts', 'audit-intl'); onDone(t('nrem.moved', { n: withCur(Number(amount).toLocaleString('en-US')) })) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 disabled:opacity-50 font-bold text-xs cursor-pointer" data-testid="nrem-move-save">{pick('nrem.moveToBank')}</button></div>
      </div>
    </div>
  )
}
