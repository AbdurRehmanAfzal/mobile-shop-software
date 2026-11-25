/** The provider's control room in the new product (ADR-134, ADR-115, ADR-039). No mock-up draws it
 *  (owner 2026-11-23: design it from what the live software does, in the files' own visual language)
 *  — so it is drawn like the business overview (file 02) and the purchases list (file 10), in its own
 *  frame under `/control/new` (ADR-115: the provider's screens live under `/control`, never inside a
 *  shop's frame). This step is the business view — overview (monthly income, collections, pending /
 *  coming / overdue, by month, by channel, by package, usage), shops (filters and the chosen shop:
 *  fee, time left, deployment, remind, its payments and keys), payments (channels, status, the
 *  approved total, CSV) and license keys (make, send, copy, link, renew, cancel with a reason).
 *  Managing a shop itself (modules, fees, deals, logins, the bin) is the live control room for now.
 *
 *  Everything is the live provider console: `/admin/business/overview|shops|payments|keys`,
 *  `/admin/shops/{id}/deployment|renewal-code`, `/admin/keys/{id}/send|renew|link|revoke`. The server
 *  decides who the provider is on every request; this frame only keeps a shop's login out. */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Copy, CreditCard, ExternalLink, KeyRound, Languages, Link2, LogOut, MessageCircle, Moon, RefreshCw, Search, Send, ShieldCheck, Store, Sun, X, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { NEXT_KEY } from '@/features/admin/ControlShell'
import { SITE } from '@/features/admin/AppLinkCard'

type Tab = 'overview' | 'shops' | 'payments' | 'keys'
interface Overview {
  counts: Record<string, number>
  paying_shops: number; mrr: string; arpu: string; collected_total: string; collected_month: string; collected_prev_month: string
  pending_count: number; pending_amount: string
  coming_7: { count: number; amount: string }; coming_30: { count: number; amount: string }; overdue: { count: number; amount: string }
  by_channel: { method: string; count: number; amount: string }[]; by_plan: { plan: string; shops: number; mrr: string }[]
  monthly: { month: string; amount: string }[]; keys: { issued: number; redeemed: number; revoked: number }
}
interface ShopRow {
  organisation_id: string; shop_id: string; name: string; city: string | null; phone: string | null; plan: string; plan_status: string
  plan_expires_at: string | null; days_left: number | null; monthly_fee: string; paid_total: string; payments: number; pending_amount: string
  last_payment_at: string | null; last_payment_amount: string | null; last_channel: string | null
  deployment: 'cloud' | 'local'; online: boolean; last_used_at: string | null; install_version: string | null; keys_unused: number; keys_total: number
}
interface PayRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; months: number; status: string; paid_on: string; receipt_no: string | null; note: string | null }
interface KeyRow {
  id: string; shop_id: string; shop_name: string | null; months: number; code: string; status: 'issued' | 'redeemed' | 'revoked'; note: string | null
  issued_at: string; redeemed_at: string | null; redeemed_where: string | null; revoked_at: string | null; revoke_reason: string | null
  sent_count: number; last_sent_at: string | null; last_sent_via: string | null; link_active: boolean; link_expires_at: string | null; view_count: number
}
interface SendOut { whatsapp: string; sms: string; text: string; link: string | null; key: KeyRow }
const rs = (v: string | number | null | undefined) => withCur(Math.round(Number(v ?? 0)).toLocaleString('en-US'))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const pill = (on: boolean) => `px-3 py-1.5 rounded-xl text-xs whitespace-nowrap cursor-pointer ${on ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`
let leaving = false

export default function NewControl() {
  const { pick, ur, cls } = useLang()
  const token = useAuth((s) => s.accessToken)
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const tab = (['overview', 'shops', 'payments', 'keys'].includes(params.get('tab') ?? '') ? params.get('tab') : 'overview') as Tab
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  useEffect(() => { if (token) { leaving = false; try { sessionStorage.removeItem(NEXT_KEY) } catch { /* private window */ } } }, [token])
  if (!token) {
    try { if (!leaving) sessionStorage.setItem(NEXT_KEY, pathname) } catch { /* private window */ }
    return <Navigate to="/login" replace />
  }
  const isSuper = !!me?.user.is_superuser
  const TABS: [Tab, string, typeof Store][] = [['overview', 'prov.tab.overview', BarChart3], ['shops', 'prov.tab.shops', Store], ['payments', 'prov.tab.payments', CreditCard], ['keys', 'prov.tab.keys', KeyRound]]

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid="nctl" data-newui="1" data-file="02">
      <header className="sticky top-0 z-20 bg-obsidian-900 text-white border-b border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[#B4F000] text-slate-950 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span>
          <div><div className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base tracking-tight'}>{pick('control.title')}</div><div className="text-[11px] text-slate-400">{me?.user.name || me?.user.phone}</div></div>
        </div>
        {isSuper ? <nav className="flex flex-wrap items-center gap-1" data-testid="nctl-tabs">{TABS.map(([k, label, I]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nctl-tab-${k}`} className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer ${tab === k ? 'font-extrabold bg-[#B4F000] text-slate-950' : 'font-bold text-slate-300 hover:bg-white/10'}`}><I className="w-3.5 h-3.5" />{pick(label)}</button>)}<Link to="/control" className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/10 flex items-center gap-1.5" data-testid="nctl-manage"><ExternalLink className="w-3.5 h-3.5" />{pick('nctl.manageShops')}</Link></nav> : null}
        <div className="flex items-center gap-2">
          <Link to="/new" className="px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-white/10" data-testid="nctl-to-app">{pick('control.toApp')}</Link>
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nctl-lang"><Languages className="w-3.5 h-3.5 text-[#B4F000]" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')}>{dark ? <Sun className="w-3.5 h-3.5 text-[#B4F000]" /> : <Moon className="w-3.5 h-3.5" />}</button>
          <button type="button" onClick={() => { leaving = true; logout() }} className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 text-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nctl-logout"><LogOut className="w-3.5 h-3.5" />{pick('auth.logout')}</button>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {!isSuper ? (
          <div className="max-w-md mx-auto mt-10 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3" data-testid="nctl-denied">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><ShieldCheck className="w-7 h-7" /></span>
            <div className="font-display font-extrabold">{pick('control.denied')}</div>
            <p className="text-xs text-slate-500">{pick('control.deniedHint')}</p>
            <Link to="/new" className="inline-flex px-4 py-2 rounded-xl bg-obsidian-900 text-white text-xs font-bold">{pick('control.toApp')}</Link>
          </div>
        ) : tab === 'overview' ? <OverviewTab go={setTab} /> : tab === 'shops' ? <ShopsTab /> : tab === 'payments' ? <PaymentsTab /> : <KeysTab />}
      </main>
    </div>
  )
}

function Fig({ label, value, sub, tone, onClick, testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void; testid?: string }) {
  const { pick } = useLang()
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`p-4 rounded-2xl text-start border ${tone ?? 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800'} ${onClick ? 'cursor-pointer hover:border-slate-400' : 'cursor-default'}`} data-testid={testid}>
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{pick(label)}</div>
      <div className="font-display font-extrabold text-xl mt-1" dir="ltr">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div> : null}
    </button>
  )
}
function Status({ s }: { s: string }) {
  const { pick } = useLang()
  const tone = s === 'locked' || s === 'expired' || s === 'rejected' ? 'bg-rose-100 text-rose-700' : s === 'due_soon' || s === 'pending' ? 'bg-amber-100 text-amber-800' : s === 'trial' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tone}`}>{pick(`prov.st.${s}`)}</span>
}
function Use({ r }: { r: Pick<ShopRow, 'deployment' | 'online'> }) {
  const { pick } = useLang()
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.deployment === 'local' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}><span className={`w-1.5 h-1.5 rounded-full ${r.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />{pick(r.deployment === 'local' ? 'prov.local' : 'prov.cloud')}</span>
}

function OverviewTab({ go }: { go: (t: Tab) => void }) {
  const { pick, ur } = useLang()
  const { data: o } = useGet<Overview>(['prov-overview'], '/api/v1/admin/business/overview')
  if (!o) return <div className="py-16 text-center text-xs text-slate-400">…</div>
  const c = o.counts
  const n = (k: string, v: number) => pick(k).replace('{{n}}', String(v))
  const top = Math.max(1, ...o.monthly.map((m) => Number(m.amount)))
  const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { month: 'short' })
  return (
    <div className="space-y-4" data-testid="nctl-overview">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 rounded-2xl bg-[#B4F000] text-slate-950 p-5 flex flex-col justify-between" data-testid="nctl-mrr">
          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{pick('prov.mrr')}</div>
          <div className="font-display font-extrabold text-4xl tracking-tight my-2" dir="ltr">{rs(o.mrr)}</div>
          <div className="text-xs font-semibold opacity-80">{pick('prov.arpu')}: <span dir="ltr">{rs(o.arpu)}</span> · {n('prov.shopsN', c.paid ?? 0)}</div>
        </section>
        <section className="lg:col-span-2 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-5" data-testid="nctl-monthly">
          <div className="font-display font-extrabold text-sm mb-3">{pick('prov.byMonth')}</div>
          <div className="grid gap-2 items-end h-36" style={{ gridTemplateColumns: `repeat(${Math.max(1, o.monthly.length)}, minmax(0, 1fr))` }} dir="ltr">
            {o.monthly.map((m) => <div key={m.month} className="h-full flex flex-col justify-end items-center gap-1" title={`${m.month} · ${rs(m.amount)}`}><div className={`w-full rounded-t-lg ${Number(m.amount) > 0 ? 'bg-obsidian-900 dark:bg-[#B4F000]' : 'bg-slate-200 dark:bg-slate-800'}`} style={{ height: `${Math.max(4, Math.round((Number(m.amount) / top) * 100))}%` }} /><span className="text-[10px] font-semibold text-slate-400">{monthName(m.month)}</span></div>)}
          </div>
        </section>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Fig label="prov.collectedMonth" value={rs(o.collected_month)} sub={<>{pick('prov.collectedPrev')}: <span dir="ltr">{rs(o.collected_prev_month)}</span></>} testid="nctl-month" />
        <Fig label="prov.collectedTotal" value={rs(o.collected_total)} sub={n('prov.shopsN', o.paying_shops)} />
        <Fig label="prov.pending" value={rs(o.pending_amount)} sub={n('prov.shopsN', o.pending_count)} tone={o.pending_count ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60' : undefined} onClick={() => go('payments')} testid="nctl-pending" />
        <Fig label="prov.coming7" value={rs(o.coming_7.amount)} sub={n('prov.shopsN', o.coming_7.count)} />
        <Fig label="prov.coming30" value={rs(o.coming_30.amount)} sub={n('prov.shopsN', o.coming_30.count)} />
        <Fig label="prov.overdue" value={rs(o.overdue.amount)} sub={n('prov.shopsN', o.overdue.count)} tone={o.overdue.count ? 'bg-rose-50 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/60' : undefined} onClick={() => go('shops')} testid="nctl-overdue" />
        <Fig label="prov.onlineNow" value={c.online_now ?? 0} sub={<>{pick('prov.activeToday')} {c.active_today ?? 0} · {pick('prov.active7')} {c.active_7d ?? 0}</>} />
        <Fig label="prov.keys" value={o.keys.issued} sub={<>{pick('prov.keysRedeemed')} {o.keys.redeemed} · {pick('prov.keysRevoked')} {o.keys.revoked}</>} onClick={() => go('keys')} testid="nctl-keys" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2" data-testid="nctl-channels"><div className="font-display font-extrabold text-sm">{pick('prov.byChannel')}</div>{!o.by_channel.length ? <p className="text-xs text-slate-400">{pick('prov.none')}</p> : o.by_channel.map((ch) => <div key={ch.method} className="flex items-center justify-between text-xs"><span className="font-bold capitalize">{ch.method.replace(/_/g, ' ')}</span><span className="font-mono" dir="ltr">{ch.count} · {rs(ch.amount)}</span></div>)}</section>
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2"><div className="font-display font-extrabold text-sm">{pick('prov.byPlan')}</div>{o.by_plan.map((p) => <div key={p.plan} className="flex items-center justify-between text-xs"><span className="font-bold capitalize">{p.plan}</span><span className="font-mono" dir="ltr">{n('prov.shopsN', p.shops)} · {rs(p.mrr)} {pick('prov.perMonth')}</span></div>)}</section>
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5" data-testid="nctl-usage"><div className="font-display font-extrabold text-sm">{pick('prov.usage')}</div><div className="grid grid-cols-2 gap-2 text-xs"><div className="p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850"><div className="text-slate-500">{pick('prov.cloud')}</div><div className="font-display font-extrabold text-lg">{c.cloud ?? 0}</div></div><div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30"><div className="text-slate-500">{pick('prov.local')}</div><div className="font-display font-extrabold text-lg">{c.local ?? 0}</div></div></div><div className="flex flex-wrap gap-1.5">{(['ok', 'due_soon', 'expired', 'locked', 'unlimited', 'trial'] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><Status s={s} /><span className="font-mono text-xs" dir="ltr">{c[s] ?? 0}</span></span>)}</div></section>
      </div>
    </div>
  )
}

function ShopsTab() {
  const { pick } = useLang()
  const [q, setQ] = useState('')
  const [dep, setDep] = useState<'' | 'cloud' | 'local'>('')
  const [st, setSt] = useState('')
  const qs = new URLSearchParams()
  if (q.trim()) qs.set('q', q.trim())
  if (dep) qs.set('deployment', dep)
  if (st) qs.set('status', st)
  const { data } = useGet<ShopRow[]>(['prov-shops', qs.toString()], `/api/v1/admin/business/shops?${qs}`)
  const [sel, setSel] = useState<string | null>(null)
  const cur = (data ?? []).find((r) => r.shop_id === sel) ?? (data ?? [])[0] ?? null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-7 space-y-3">
        <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl.shopSearch')} className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nctl-shop-q" /></div>
        <div className="flex flex-wrap gap-1.5">{([['', 'prov.all'], ['cloud', 'prov.cloud'], ['local', 'prov.local']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setDep(v)} aria-pressed={dep === v} className={pill(dep === v)}>{pick(t)}</button>)}<span className="w-px bg-slate-200 dark:bg-slate-800 mx-1" />{([['', 'prov.all'], ['due', 'prov.st.due_soon'], ['expired', 'prov.st.expired'], ['locked', 'prov.st.locked'], ['ok', 'prov.st.ok']] as const).map(([v, t]) => <button key={`s${v}`} type="button" onClick={() => setSt(v)} aria-pressed={st === v} className={pill(st === v)} data-testid={`nctl-st-${v || 'all'}`}>{pick(t)}</button>)}</div>
        <div className="space-y-2" data-testid="nctl-shops">
          {!data ? <div className="py-10 text-center text-xs text-slate-400">…</div> : !data.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">{pick('prov.none')}</div> : data.map((r) => (
            <button key={r.organisation_id} type="button" onClick={() => setSel(r.shop_id)} className={`w-full p-3.5 rounded-2xl bg-white dark:bg-obsidian-900 text-start cursor-pointer ${cur?.shop_id === r.shop_id ? 'border-2 border-obsidian-900 dark:border-[#B4F000] shadow-md' : 'border border-slate-200 dark:border-slate-800 hover:border-slate-400'}`} data-testid="nctl-shop">
              <div className="flex items-center justify-between gap-2"><span className="font-display font-extrabold text-sm truncate" dir="auto">{r.name}{r.city ? <span className="font-normal text-slate-500"> · {r.city}</span> : null}</span><span className="font-mono text-xs font-bold shrink-0" dir="ltr">{Number(r.monthly_fee) ? `${rs(r.monthly_fee)} ${pick('prov.perMonth')}` : '—'}</span></div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 capitalize">{r.plan}</span><Status s={r.plan_status} />{r.days_left != null ? <span className={`text-[11px] font-semibold ${r.days_left < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{r.days_left >= 0 ? pick('prov.daysLeft').replace('{{n}}', String(r.days_left)) : pick('prov.daysOver').replace('{{n}}', String(-r.days_left))}</span> : null}<Use r={r} />{Number(r.pending_amount) ? <span className="text-[11px] font-bold text-amber-700">{pick('prov.pending')} <span dir="ltr">{rs(r.pending_amount)}</span></span> : null}</div>
              <div className="mt-1 text-[11px] text-slate-500">{pick('prov.paidTotal')} <span dir="ltr">{rs(r.paid_total)}</span> · {pick('prov.lastUsed')} <span dir="ltr">{r.last_used_at ? fmtDateTime(r.last_used_at) : pick('prov.never')}</span></div>
            </button>
          ))}
        </div>
      </div>
      <div className="lg:col-span-5">{cur ? <ShopPanel key={cur.shop_id} r={cur} /> : null}</div>
    </div>
  )
}

function ShopPanel({ r }: { r: ShopRow }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const { data: pays } = useGet<{ rows: PayRow[] }>(['prov-shop-pays', r.shop_id], `/api/v1/admin/business/payments?q=${encodeURIComponent(r.name)}`)
  const [err, setErr] = useState('')
  const wa = waNumber(r.phone)
  const remind = `https://wa.me/${wa}?text=${encodeURIComponent(`${r.name}: Mobile Shop — ${r.plan} plan ${r.days_left != null && r.days_left >= 0 ? `ends in ${r.days_left} days` : 'has ended'}. Fee ${rs(r.monthly_fee)} / month. More → Software fees to pay.`)}`
  const mine = (pays?.rows ?? []).filter((p) => p.shop_id === r.shop_id)
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 lg:sticky lg:top-20" data-testid="nctl-shop-panel">
      <div><h2 className="font-display font-extrabold text-lg" dir="auto">{r.name}</h2><div className="text-[11px] text-slate-500" dir="ltr">{[r.city, r.phone].filter(Boolean).join(' · ')}</div></div>
      <div className="grid grid-cols-2 gap-2">
        <Fig label="prov.fee" value={rs(r.monthly_fee)} sub={<span className="capitalize">{r.plan}</span>} />
        <Fig label="prov.status" value={r.days_left != null ? (r.days_left >= 0 ? pick('prov.daysLeft').replace('{{n}}', String(r.days_left)) : pick('prov.daysOver').replace('{{n}}', String(-r.days_left))) : '∞'} sub={<Status s={r.plan_status} />} />
        <Fig label="prov.paidTotal" value={rs(r.paid_total)} sub={`${r.payments}×`} />
        <Fig label="prov.lastUsed" value={r.last_used_at ? fmtDate(r.last_used_at) : pick('prov.never')} sub={<Use r={r} />} />
      </div>
      {r.install_version ? <div className="text-[11px] text-slate-500">{pick('prov.version')} <span className="font-mono" dir="ltr">{r.install_version}</span></div> : null}
      <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">{pick('prov.deployment')}</div><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['cloud', 'local'] as const).map((v) => <button key={v} type="button" onClick={async () => { setErr(''); try { await api('PATCH', `/api/v1/admin/shops/${r.shop_id}/deployment`, { deployment: v }); await inv('prov-shops', 'prov-overview') } catch (e) { setErr(errText(e, ur)) } }} aria-pressed={r.deployment === v} className={`py-1.5 rounded-lg text-xs cursor-pointer ${r.deployment === v ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold text-slate-600'}`} data-testid={`nctl-dep-${v}`}>{pick(`prov.${v}`)}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-2">
        {wa ? <a href={remind} target="_blank" rel="noopener noreferrer" className="py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />{pick('prov.remind')}</a> : <span />}
        <button type="button" onClick={() => nav(`/control?shop=${r.shop_id}`)} className="py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nctl-open-admin"><Store className="w-3.5 h-3.5" />{pick('prov.openAdmin')}</button>
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">{pick('prov.tab.payments')}</div>{!mine.length ? <p className="text-xs text-slate-400">{pick('prov.none')}</p> : <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">{mine.map((p) => <PayLine key={p.id} p={p} />)}</div>}</div>
      <div><div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">{pick('prov.keys')}</div><KeyList shopId={r.shop_id} shopName={r.name} /></div>
    </section>
  )
}

function PayLine({ p }: { p: PayRow }) {
  const { pick } = useLang()
  const tone = p.status === 'approved' ? 'text-emerald-700' : p.status === 'pending' ? 'text-amber-700' : 'text-rose-600'
  return (
    <div className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs" data-testid="nctl-pay">
      <div className="min-w-0"><div className="font-bold truncate" dir="auto">{p.shop_name} <span className="font-semibold text-slate-500 capitalize">· {p.method.replace(/_/g, ' ')}</span></div><div className="text-[11px] text-slate-500 truncate" dir="ltr">{fmtDate(p.paid_on)} · {p.months}m{p.reference ? ` · ${p.reference}` : ''}{p.receipt_no ? ` · ${p.receipt_no}` : ''}</div></div>
      <div className="text-end shrink-0"><div className="font-mono font-bold" dir="ltr">{rs(p.amount)}</div><div className={`text-[10px] font-bold ${tone}`}>{pick(`prov.st.${p.status}`)}</div></div>
    </div>
  )
}

function PaymentsTab() {
  const { pick } = useLang()
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const qs = new URLSearchParams()
  if (method) qs.set('method', method)
  if (status) qs.set('status', status)
  if (q.trim()) qs.set('q', q.trim())
  const { data } = useGet<{ rows: PayRow[]; approved_total: string; methods: string[] }>(['prov-pays', qs.toString()], `/api/v1/admin/business/payments?${qs}`)
  // the rows as they are, into a file (no figure is worked out)
  const csv = () => {
    if (!data) return
    const head = 'date,shop,channel,amount,months,status,reference,receipt\n'
    const body = data.rows.map((p) => [p.paid_on, p.shop_name, p.method, p.amount, p.months, p.status, p.reference ?? '', p.receipt_no ?? ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([head + body], { type: 'text/csv' })); a.download = 'software-fees.csv'; a.click()
  }
  return (
    <div className="space-y-3" data-testid="nctl-payments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-[220px]"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl.shopSearch')} className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nctl-pay-q" /></div>
        <div className="flex items-center gap-3"><span className="text-xs font-bold">{pick('prov.approvedTotal')}: <span className="font-mono" dir="ltr" data-testid="nctl-approved">{rs(data?.approved_total)}</span></span><button type="button" onClick={csv} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer" data-testid="nctl-csv">{pick('prov.exportCsv')}</button></div>
      </div>
      <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setMethod('')} aria-pressed={!method} className={pill(!method)}>{pick('prov.allChannels')}</button>{(data?.methods ?? []).map((m) => <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={`${pill(method === m)} capitalize`}>{m.replace(/_/g, ' ')}</button>)}<span className="w-px bg-slate-200 dark:bg-slate-800 mx-1" />{([['', 'prov.all'], ['pending', 'prov.st.pending'], ['approved', 'prov.st.approved'], ['rejected', 'prov.st.rejected']] as const).map(([v, t]) => <button key={`s${v}`} type="button" onClick={() => setStatus(v)} aria-pressed={status === v} className={pill(status === v)}>{pick(t)}</button>)}</div>
      {!data ? <div className="py-10 text-center text-xs text-slate-400">…</div> : !data.rows.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">{pick('prov.none')}</div> : <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">{data.rows.map((p) => <PayLine key={p.id} p={p} />)}</div>}
    </div>
  )
}

function KeysTab() {
  const { pick } = useLang()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [making, setMaking] = useState(false)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" data-testid="nctl-keys-tab">
      <div className="lg:col-span-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><div className="relative flex-1 min-w-[220px]"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl.keySearch')} className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" /></div>{([['', 'prov.all'], ['issued', 'prov.key.issued'], ['redeemed', 'prov.key.redeemed'], ['revoked', 'prov.key.revoked']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setStatus(v)} aria-pressed={status === v} className={pill(status === v)} data-testid={`nctl-key-${v || 'all'}`}>{pick(t)}</button>)}</div>
        <KeyList status={status} q={q} />
      </div>
      <div className="lg:col-span-4"><section className="rounded-2xl bg-obsidian-900 text-white p-4 space-y-3 lg:sticky lg:top-20"><div className="flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#B4F000]" /><span className="font-display font-extrabold text-sm">{pick('prov.key.generate')}</span></div><p className="text-[11px] text-slate-400">{pick('prov.key.hint')}</p>{making ? <MakeKey onClose={() => setMaking(false)} /> : <button type="button" onClick={() => setMaking(true)} className="w-full py-2.5 rounded-xl bg-[#B4F000] text-slate-950 text-xs font-extrabold cursor-pointer" data-testid="nctl-make-open">{pick('prov.key.generate')}</button>}</section></div>
    </div>
  )
}

function MakeKey({ shopId, shopName, onClose }: { shopId?: string; shopName?: string; onClose?: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [shopQ, setShopQ] = useState('')
  const [shop, setShop] = useState<{ id: string; name: string } | null>(shopId ? { id: shopId, name: shopName ?? '' } : null)
  const [months, setMonths] = useState('1')
  const [note, setNote] = useState('')
  const [made, setMade] = useState<KeyRow | null>(null)
  const [err, setErr] = useState('')
  const { data: shops } = useGet<ShopRow[]>(['prov-shops-pick', shopQ], !shop ? `/api/v1/admin/business/shops?q=${encodeURIComponent(shopQ)}` : null)
  const field = 'w-full px-3 py-2 rounded-xl text-xs bg-white/10 border border-white/15 text-white placeholder:text-slate-400'
  if (made) return <div className="space-y-2"><div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-200 text-xs font-bold">{pick('prov.key.made')}</div><KeyCard k={made} dark />{onClose ? <button type="button" onClick={onClose} className="w-full py-2 rounded-xl bg-white/10 text-xs font-bold cursor-pointer">{pick('common.close')}</button> : null}</div>
  return (
    <div className="space-y-2.5" data-testid="nctl-make">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('prov.key.forShop')}</div>
      {shop ? <button type="button" onClick={() => !shopId && setShop(null)} className="w-full p-2.5 rounded-xl bg-[#B4F000]/20 border border-[#B4F000]/50 text-start text-xs font-bold text-[#B4F000]" data-testid="nctl-make-shop">{shop.name}</button> : (
        <><input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder={pick('nctl.shopSearch')} className={field} data-testid="nctl-make-q" /><div className="max-h-44 overflow-y-auto space-y-1">{(shops ?? []).slice(0, 20).map((s) => <button key={s.shop_id} type="button" onClick={() => setShop({ id: s.shop_id, name: s.name })} className="w-full px-2.5 py-2 rounded-lg text-start text-xs font-bold hover:bg-white/10 cursor-pointer">{s.name}{s.city ? <span className="font-normal text-slate-400"> · {s.city}</span> : null}</button>)}</div></>
      )}
      <div className="grid grid-cols-4 gap-1">{['1', '3', '6', '12'].map((m) => <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m} className={`py-2 rounded-lg text-[11px] font-extrabold cursor-pointer ${months === m ? 'bg-[#B4F000] text-slate-950' : 'bg-white/10'}`} data-testid={`nctl-months-${m}`}>{pick(m === '1' ? 'prov.key.month' : 'prov.key.months').replace('{{n}}', m)}</button>)}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick('prov.key.note')} className={field} />
      {err ? <p className="text-[11px] font-bold text-rose-300" role="alert">{err}</p> : null}
      <button type="button" disabled={!shop} onClick={async () => { setErr(''); try { const r = await api<{ key: KeyRow }>('POST', `/api/v1/admin/shops/${shop!.id}/renewal-code`, { months: Number(months), note: note || null }); setMade(r.key); await inv('prov-keys', 'prov-overview', 'prov-shops') } catch (e) { setErr(errText(e, ur)) } }} className="w-full py-2.5 rounded-xl bg-[#B4F000] text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40" data-testid="nctl-make-save">{pick('prov.key.generate')}</button>
    </div>
  )
}

function KeyList({ shopId, shopName, status, q }: { shopId?: string; shopName?: string; status?: string; q?: string }) {
  const { pick } = useLang()
  const [making, setMaking] = useState(false)
  const qs = new URLSearchParams()
  if (shopId) qs.set('shop_id', shopId)
  if (status) qs.set('status', status)
  if (q?.trim()) qs.set('q', q.trim())
  const { data } = useGet<KeyRow[]>(['prov-keys', qs.toString()], `/api/v1/admin/business/keys?${qs}`)
  return (
    <div className="space-y-2" data-testid="nctl-keys-list">
      {shopId ? (making ? <div className="p-3 rounded-xl bg-obsidian-900 text-white"><MakeKey shopId={shopId} shopName={shopName} onClose={() => setMaking(false)} /></div> : <button type="button" onClick={() => setMaking(true)} className="w-full py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nctl-shop-make"><KeyRound className="w-3.5 h-3.5" />{pick('prov.key.generate')}</button>) : null}
      {!data ? <div className="py-6 text-center text-xs text-slate-400">…</div> : !data.length ? <p className="text-xs text-slate-400">{pick('prov.none')}</p> : data.map((k) => <KeyCard key={k.id} k={k} />)}
    </div>
  )
}

function KeyCard({ k: initial, dark }: { k: KeyRow; dark?: boolean }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [k, setK] = useState(initial)
  const [copied, setCopied] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text) } catch { /* the text is shown */ } setCopied(what); setTimeout(() => setCopied(null), 1800) }
  const send = async (via: 'whatsapp' | 'sms' | 'copy' | 'link') => {
    setErr('')
    try {
      const r = await api<SendOut>('POST', `/api/v1/admin/keys/${k.id}/send`, { via, site: SITE })
      setK(r.key); setLink(r.link)
      if (via === 'whatsapp') window.open(r.whatsapp, '_blank', 'noopener')
      else if (via === 'sms') window.location.href = r.sms
      else if (via === 'copy') await copy(r.text, 'key')
      else if (r.link) await copy(r.link, 'link')
      await inv('prov-overview')
    } catch (e) { setErr(errText(e, ur)) }
  }
  const act = async (path: string, body: unknown) => { setErr(''); try { const r = await api<KeyRow | { key: KeyRow }>('POST', `/api/v1/admin/keys/${k.id}/${path}`, body); setK('key' in r ? r.key : r); await inv('prov-keys', 'prov-overview', 'prov-shops') } catch (e) { setErr(errText(e, ur)) } }
  const tone = k.status === 'issued' ? 'bg-emerald-100 text-emerald-700' : k.status === 'redeemed' ? 'bg-slate-100 text-slate-600' : 'bg-rose-100 text-rose-700'
  const btn = `py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${dark ? 'bg-white/10 text-white' : 'bg-slate-100 dark:bg-obsidian-850'}`
  return (
    <div className={`p-3 rounded-xl space-y-2 ${dark ? 'bg-white/5 border border-white/10' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`} data-testid="nctl-key">
      <div className="flex items-center gap-2"><span className="flex-1 min-w-0 text-xs font-bold truncate" dir="auto">{k.shop_name}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tone}`} data-testid="nctl-key-status">{pick(`prov.key.${k.status}`)}</span><span className="font-mono text-[11px]" dir="ltr">{pick(k.months === 1 ? 'prov.key.month' : 'prov.key.months').replace('{{n}}', String(k.months))}</span></div>
      <div className={`font-mono text-[10px] break-all p-2 rounded-lg ${dark ? 'bg-black/30' : 'bg-slate-50 dark:bg-obsidian-850'}`} dir="ltr" data-testid="nctl-key-code">{k.code}</div>
      <div className="text-[10px] text-slate-500"><span dir="ltr">{fmtDateTime(k.issued_at)}</span>{k.sent_count ? <> · {pick('prov.key.sent').replace('{{n}}', String(k.sent_count))}{k.last_sent_via ? ` (${k.last_sent_via})` : ''}</> : null}{k.view_count ? <> · {pick('prov.key.viewed').replace('{{n}}', String(k.view_count))}</> : null}{k.redeemed_at ? <> · {pick('prov.key.redeemed')} <span dir="ltr">{fmtDate(k.redeemed_at)}</span>{k.redeemed_where ? ` ${pick(`prov.key.where.${k.redeemed_where}`)}` : ''}</> : null}{k.revoked_at ? <> · {pick('prov.key.revoked')}{k.revoke_reason ? `: ${k.revoke_reason}` : ''}</> : null}{k.note ? <> · {k.note}</> : null}</div>
      {link && k.status === 'issued' ? <div className="font-mono text-[10px] break-all text-emerald-600 select-all" dir="ltr" data-testid="nctl-key-link">{link}</div> : null}
      {k.status === 'issued' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button type="button" onClick={() => void send('whatsapp')} className="py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer bg-emerald-600 text-white"><MessageCircle className="w-3 h-3" />{pick('prov.key.whatsapp')}</button>
          <button type="button" onClick={() => void send('sms')} className={btn}><Send className="w-3 h-3" />{pick('prov.key.sms')}</button>
          <button type="button" onClick={() => void send('copy')} className={btn} data-testid="nctl-key-copy"><Copy className="w-3 h-3" />{copied === 'key' ? pick('prov.key.copied') : pick('prov.key.copy')}</button>
          <button type="button" onClick={() => void send('link')} className={btn} data-testid="nctl-key-copylink"><Link2 className="w-3 h-3" />{copied === 'link' ? pick('prov.key.copied') : pick('prov.key.copyLink')}</button>
          <button type="button" onClick={() => void act('renew', {})} className={btn}><RefreshCw className="w-3 h-3" />{pick('prov.key.renew')}</button>
          <button type="button" onClick={() => void act('link', {})} className={btn}><Link2 className="w-3 h-3" />{pick('prov.key.newLink')}</button>
          <button type="button" onClick={() => setRevoking(!revoking)} className={`${btn} text-rose-600`} data-testid="nctl-key-revoke"><XCircle className="w-3 h-3" />{pick('prov.key.revoke')}</button>
        </div>
      ) : k.status === 'redeemed' ? <button type="button" onClick={() => void act('renew', { revoke_old: false })} className={btn}><RefreshCw className="w-3 h-3" />{pick('prov.key.renew')}</button> : null}
      {revoking ? <div className="flex gap-1.5"><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('prov.key.revokeWhy')} className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] ${dark ? 'bg-white/10 text-white' : 'bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'}`} data-testid="nctl-key-why" /><button type="button" onClick={async () => { await act('revoke', { reason: why.trim() || null }); setRevoking(false) }} className="px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer" data-testid="nctl-key-revoke-yes">{pick('prov.key.revoke')}</button><button type="button" onClick={() => setRevoking(false)} aria-label={pick('common.close')} className="px-1.5 text-slate-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button></div> : null}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
    </div>
  )
}
