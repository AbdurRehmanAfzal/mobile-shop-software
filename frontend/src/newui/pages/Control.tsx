/** The provider's control room in the new product, drawn from file 26 ("Mobile Shop · Control —
 *  SaaS & Multi-Shop Access Center", ADR-134 / ADR-115 / ADR-039) in its own frame under
 *  `/control/new` (ADR-115: the provider's screens live under `/control`, never in a shop's frame).
 *
 *  The bar: SUPER ADMIN, four tabs (Shops & Plans · Business Overview · Subscription Ledger ·
 *  License Keys), + New Shop, the SaaS ledger as an A4 sheet, the language and dark mode.
 *  Shops & Plans (`ControlShops.tsx`): the Android app, software fees with the provider's settings,
 *  the customer shops and a shop's window. The overview, the ledger with the fees to check, and
 *  the keys (`ControlKeys.tsx`) are here.
 *
 *  Every figure and action is the live provider console's: `/admin/business/overview|shops|
 *  payments|keys`, `/admin/fee-payments`, `/admin/fee-stats`, `/admin/shops/*`, `/admin/keys/*`.
 *  The app adds up nothing. The server decides who the provider is on every request; this frame
 *  only keeps a shop's login out. */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { BarChart3, BookOpen, Check, CreditCard, ExternalLink, Image as ImageIcon, KeyRound, LogOut, Moon, Plus, Printer, Search, ShieldCheck, Store, Sun, Tag, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fileObjectUrl } from '@/lib/files'
import { isoDay } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { NEXT_KEY } from '@/features/admin/ControlShell'
import { KeysTab } from './ControlKeys'
import { NewShopModal, SettingsModal, ShopsTab } from './ControlShops'
import { BTN_LIGHT, CARD, INPUT, LIME, Modal, errText, rs, seg, useMethod, type AdminShop, type FeeRow, type Overview, type PayRow, type Settings, PayLine } from './controlParts'

type Tab = 'shops' | 'overview' | 'payments' | 'keys'
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
  const raw = params.get('tab') ?? ''
  // `manage` and `shops` were two tabs before file 26 drew them as one
  const tab: Tab = raw === 'overview' || raw === 'payments' || raw === 'keys' ? raw : 'shops'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); p.delete('shop'); return p }, { replace: true })
  const openShop = (id: string | null) => setParams((p) => { p.set('tab', 'shops'); if (id) p.set('shop', id); else p.delete('shop'); return p }, { replace: true })
  const [making, setMaking] = useState(false)
  const [a4, setA4] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const isSuper = !!me?.user.is_superuser
  const { data: shops } = useGet<AdminShop[]>(['admin-shops', 'all'], token && isSuper ? '/api/v1/admin/shops' : null)
  useEffect(() => { if (token) { leaving = false; try { sessionStorage.removeItem(NEXT_KEY) } catch { /* private window */ } } }, [token])
  if (!token) {
    try { if (!leaving) sessionStorage.setItem(NEXT_KEY, pathname) } catch { /* private window */ }
    return <Navigate to="/login" replace />
  }
  const TABS: [Tab, string, typeof Store][] = [['shops', 'nctl2.tab.shops', Store], ['overview', 'nctl2.tab.overview', BarChart3], ['payments', 'nctl2.tab.payments', CreditCard], ['keys', 'nctl2.tab.keys', KeyRound]]
  const iconBtn = 'px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-800 flex items-center gap-1 cursor-pointer'

  return (
    <div className="font-sans bg-[#F2F4F7] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh flex flex-col" data-testid="nctl" data-newui="1" data-file="26">
      <header className="bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 print:hidden">
        <div className="max-w-[1640px] mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-obsidian-950 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base tracking-tight'}>{pick('control.title')}</span>{isSuper ? <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#A3E635]/25 text-emerald-800 dark:text-[#A3E635]" data-testid="nctl-super">{pick('nctl2.superAdmin')}</span> : null}</div>
              <div className="text-[11px] text-slate-500 truncate">{pick('nctl2.owner')} <b dir="auto">{me?.user.name || me?.user.phone}</b></div>
            </div>
          </div>
          {isSuper ? (
            <nav className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 overflow-x-auto max-w-full" data-testid="nctl-tabs">
              {TABS.map(([k, label, I]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nctl-tab-${k}`} className={`${seg(tab === k)} flex items-center gap-1.5`}><I className="w-3.5 h-3.5" />{pick(label)}{k === 'shops' && shops ? <span className="font-mono" dir="ltr">({shops.length})</span> : null}</button>)}
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {isSuper ? <>
              <button type="button" onClick={() => setMaking(true)} className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer ${LIME}`} data-testid="nctl-new-shop"><Plus className="w-3.5 h-3.5" />{pick('nctl2.newShop')}</button>
              <button type="button" onClick={() => setA4(true)} className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-obsidian-950 dark:bg-obsidian-800 text-white border border-slate-700 flex items-center gap-1 cursor-pointer" data-testid="nctl-a4-open"><BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nctl2.a4')}</span></button>
              <Link to="/control" className={iconBtn} data-testid="nctl-current" title={pick('nctl.currentHint')} aria-label={pick('nctl.current')}><ExternalLink className="w-3.5 h-3.5" /></Link>
            </> : null}
            <Link to="/new" className={iconBtn} data-testid="nctl-to-app">{pick('control.toApp')}</Link>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className={iconBtn} data-testid="nctl-lang"><span dir="ltr">EN / اردو</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-obsidian-950 dark:bg-white text-white dark:text-obsidian-950 cursor-pointer" aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} data-testid="nctl-theme">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}</button>
            <button type="button" onClick={() => { leaving = true; logout() }} className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nctl-logout" aria-label={pick('auth.logout')}><LogOut className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </header>
      <main className="max-w-[1640px] w-full mx-auto px-3 sm:px-6 py-5 flex-1 space-y-5 print:hidden">
        {!isSuper ? (
          <div className={`max-w-md mx-auto mt-10 text-center ${CARD} p-6 space-y-3`} data-testid="nctl-denied">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><ShieldCheck className="w-7 h-7" /></span>
            <div className="font-display font-extrabold">{pick('control.denied')}</div>
            <p className="text-xs text-slate-500">{pick('control.deniedHint')}</p>
            <Link to="/new" className="inline-flex px-4 py-2 rounded-xl bg-obsidian-950 text-white text-xs font-bold">{pick('control.toApp')}</Link>
          </div>
        ) : tab === 'overview' ? <OverviewTab go={setTab} openSettings={setSettings} openA4={() => setA4(true)} />
          : tab === 'payments' ? <PaymentsTab openA4={() => setA4(true)} />
          : tab === 'keys' ? <KeysTab />
          : <ShopsTab shopId={params.get('shop')} openShop={openShop} openSettings={setSettings} go={setTab} />}
      </main>
      {isSuper && making ? <NewShopModal init={{}} onClose={() => setMaking(false)} onMade={(s) => openShop(s.id)} /> : null}
      {isSuper && settings ? <SettingsModal which={settings} onClose={() => setSettings(null)} /> : null}
      {isSuper && a4 ? <LedgerA4 owner={me?.user.name || me?.user.phone || ''} onClose={() => setA4(false)} /> : null}
    </div>
  )
}

function Fig({ label, value, sub, tone, onClick, testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void; testid?: string }) {
  const { pick } = useLang()
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`p-4 rounded-2xl text-start ${CARD} ${onClick ? 'cursor-pointer hover:border-[#A3E635]' : 'cursor-default'}`} data-testid={testid}>
      <div className="text-[11px] font-bold text-slate-500">{pick(label)}</div>
      <div className={`font-display font-extrabold text-xl sm:text-2xl mt-1 ${tone ?? ''}`} dir="ltr">{value}</div>
      {sub ? <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div> : null}
    </button>
  )
}

const ST_TONE: Record<string, string> = { ok: 'bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635]', due_soon: 'bg-slate-100 dark:bg-obsidian-800 text-slate-500', expired: 'bg-rose-500/10 text-rose-500', locked: 'bg-rose-500/10 text-rose-500', unlimited: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', trial: 'bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300' }

function OverviewTab({ go, openSettings, openA4 }: { go: (t: Tab) => void; openSettings: (s: Settings) => void; openA4: () => void }) {
  const { pick, ur } = useLang()
  const method = useMethod()
  const { data: o } = useGet<Overview>(['prov-overview'], '/api/v1/admin/business/overview')
  if (!o) return <div className="py-16 text-center text-xs text-slate-400">…</div>
  const c = o.counts
  const n = (k: string, v: number) => pick(k).replace('{{n}}', String(v))
  const top = Math.max(1, ...o.monthly.map((m) => Number(m.amount)))
  const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(ur ? 'ur-PK' : 'en-GB', { month: 'short' })
  const short = (v: string) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))
  return (
    <div className="space-y-5" data-testid="nctl-overview">
      <section className="p-5 sm:p-6 rounded-2xl bg-obsidian-950 text-white border border-slate-800 shadow-lg flex flex-wrap items-center justify-between gap-4" data-testid="nctl-mrr">
        <div>
          <div className="text-xs font-bold text-[#A3E635] uppercase tracking-wider">{pick('prov.mrr')}</div>
          <div className="font-display font-extrabold text-3xl sm:text-4xl text-[#A3E635] mt-1" dir="ltr">{rs(o.mrr)}</div>
          <div className="text-xs text-slate-300 mt-1">{pick('prov.arpu')}: <b dir="ltr">{rs(o.arpu)}</b> · {pick('nctl2.payingShops')} <b dir="ltr">{c.paid ?? 0}</b></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openSettings('prices')} className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-white/10 hover:bg-white/15 border border-white/15 flex items-center gap-1.5 cursor-pointer"><Tag className="w-3.5 h-3.5" />{pick('nctl2.editPrices')}</button>
          <button type="button" onClick={openA4} className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${LIME}`}><Printer className="w-3.5 h-3.5" />{pick('nctl2.printStatement')}</button>
        </div>
      </section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Fig label="prov.collectedMonth" value={rs(o.collected_month)} sub={<>{pick('prov.collectedPrev')}: <span dir="ltr">{rs(o.collected_prev_month)}</span></>} testid="nctl-month" />
        <Fig label="prov.collectedTotal" value={rs(o.collected_total)} tone="text-emerald-600 dark:text-[#A3E635]" sub={n('prov.shopsN', o.paying_shops)} />
        <Fig label="prov.pending" value={rs(o.pending_amount)} tone={o.pending_count ? 'text-amber-600' : undefined} sub={n('prov.shopsN', o.pending_count)} onClick={() => go('payments')} testid="nctl-pending" />
        <Fig label="prov.coming7" value={rs(o.coming_7.amount)} sub={n('prov.shopsN', o.coming_7.count)} />
        <Fig label="prov.coming30" value={rs(o.coming_30.amount)} tone="text-amber-600" sub={n('prov.shopsN', o.coming_30.count)} />
        <Fig label="prov.overdue" value={rs(o.overdue.amount)} tone={o.overdue.count ? 'text-rose-600' : undefined} sub={n('prov.shopsN', o.overdue.count)} onClick={() => go('shops')} testid="nctl-overdue" />
        <Fig label="prov.onlineNow" value={c.online_now ?? 0} sub={<>{pick('prov.activeToday')} {c.active_today ?? 0} · {pick('prov.active7')} {c.active_7d ?? 0}</>} />
        <Fig label="prov.keys" value={o.keys.issued} sub={<>{pick('prov.keysRedeemed')} {o.keys.redeemed} · {pick('prov.keysRevoked')} {o.keys.revoked}</>} onClick={() => go('keys')} testid="nctl-keys" />
      </div>
      <section className={`${CARD} p-5`} data-testid="nctl-monthly">
        <div className="mb-3"><h3 className="font-display font-extrabold text-sm">{pick('prov.byMonth')}</h3>{o.monthly.length ? <span className="text-[11px] text-slate-400">{monthName(o.monthly[0].month)} → {monthName(o.monthly[o.monthly.length - 1].month)}</span> : null}</div>
        <div className="grid gap-2 items-end h-36 pt-4 px-2 border-b border-slate-200 dark:border-slate-800" style={{ gridTemplateColumns: `repeat(${Math.max(1, o.monthly.length)}, minmax(0, 1fr))` }} dir="ltr">
          {o.monthly.map((m) => { const v = Number(m.amount); return <div key={m.month} className="h-full flex flex-col justify-end items-center gap-1" title={`${m.month} · ${rs(m.amount)}`}>{v > 0 ? <span className="text-[9px] font-mono font-bold text-emerald-700 dark:text-[#A3E635]">{short(m.amount)}</span> : null}<div className={`w-full max-w-[34px] rounded-t-lg ${v > 0 ? 'bg-emerald-600 dark:bg-[#A3E635]' : 'bg-slate-100 dark:bg-obsidian-800'}`} style={{ height: `${v > 0 ? Math.max(15, Math.round((v / top) * 100)) : 4}%` }} /></div> })}
        </div>
        <div className="grid gap-2 text-center text-[10px] font-bold text-slate-400 pt-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, o.monthly.length)}, minmax(0, 1fr))` }} dir="ltr">{o.monthly.map((m) => <span key={m.month}>{monthName(m.month)}</span>)}</div>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <section className={`${CARD} p-5 space-y-1`} data-testid="nctl-channels"><h3 className="font-display font-extrabold text-sm mb-1.5">{pick('prov.byChannel')}</h3>{!o.by_channel.length ? <p className="text-slate-400">{pick('prov.none')}</p> : o.by_channel.map((ch) => <div key={ch.method} className="flex justify-between py-1.5 border-b last:border-0 border-slate-100 dark:border-slate-800"><span className="font-bold">{method(ch.method)}</span><span className="font-mono" dir="ltr">{ch.count} · <b>{rs(ch.amount)}</b></span></div>)}</section>
        <section className={`${CARD} p-5 space-y-1`}><h3 className="font-display font-extrabold text-sm mb-1.5">{pick('prov.byPlan')}</h3>{o.by_plan.map((p) => <div key={p.plan} className="flex justify-between py-1.5 border-b last:border-0 border-slate-100 dark:border-slate-800"><span className="font-bold">{pick(`nctl2.plan.${p.plan}`)}</span><span className="font-mono" dir="ltr">{n('prov.shopsN', p.shops)} · {rs(p.mrr)} {pick('prov.perMonth')}</span></div>)}</section>
      </div>
      <section className={`${CARD} p-5 space-y-3`} data-testid="nctl-usage">
        <h3 className="font-display font-extrabold text-sm">{pick('prov.usage')}</h3>
        <div className="grid grid-cols-2 gap-3"><div className="p-4 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800"><div className="text-xs text-slate-500">{pick('prov.cloud')}</div><div className="font-display font-extrabold text-2xl mt-1">{c.cloud ?? 0}</div></div><div className="p-4 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800"><div className="text-xs text-slate-500">{pick('prov.local')}</div><div className="font-display font-extrabold text-2xl mt-1">{c.local ?? 0}</div></div></div>
        <div className="flex flex-wrap gap-2 text-[11px] font-extrabold pt-1">{(['ok', 'due_soon', 'expired', 'locked', 'unlimited', 'trial'] as const).map((s) => <span key={s} className={`px-2.5 py-1 rounded-full ${ST_TONE[s]}`}>{pick(`prov.st.${s}`)} <span dir="ltr">{c[s] ?? 0}</span></span>)}</div>
      </section>
    </div>
  )
}


/** the fees shops sent in, to check: the screenshot, received for the months, months only, reject with a reason */
function FeesToCheck() {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const method = useMethod()
  const { data: fees } = useGet<FeeRow[]>(['fee-pending'], '/api/v1/admin/fee-payments?status=pending')
  const [proof, setProof] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<FeeRow | null>(null)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  async function decide(f: FeeRow, action: 'approve' | 'reject', body: Record<string, unknown> = {}) {
    setErr('')
    try { await api('POST', `/api/v1/admin/fee-payments/${f.id}/${action}`, body); await inv('fee-pending', 'fee-stats', 'admin-shops', 'prov-overview', 'prov-shops', 'prov-pays') } catch (e) { setErr(errText(e, ur)) }
  }
  if (!fees?.length) return null
  return (
    <section className="p-4 rounded-2xl border border-amber-300/80 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5" data-testid="nctl-check">
      <h3 className="font-display font-extrabold text-sm text-amber-900 dark:text-amber-300">{pick('nctl2.toCheck')} <span dir="ltr">({fees.length})</span></h3>
      {fees.map((f) => (
        <div key={f.id} className="p-3 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 space-y-2" data-testid="nctl-fee">
          <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-sm font-bold truncate" dir="auto">{f.shop_name}</div><div className="text-[11px] text-slate-500" dir="ltr">{method(f.method)}{f.reference ? ` · ${f.reference}` : ''} · {f.months} {pick(f.months === 1 ? 'admin.month' : 'admin.months')} · {fmtDate(f.created_at)}</div></div><span className="font-mono font-extrabold" dir="ltr">{rs(f.amount)}</span></div>
          {f.note ? <p className="text-[11px] text-slate-500" dir="auto">{f.note}</p> : null}
          {f.order ? <div className="text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-obsidian-850 space-y-0.5"><div>{pick('admin.order.pkg')}: <b>{pick(`fees.pick.pkg.${f.order.plan}`)}</b>{f.order.extras.map((k) => ` + ${pick(`modules.${k}`)}`).join('')} · {f.order.years ? pick(f.order.years === 1 ? 'fees.pick.year' : 'fees.pick.years').replace('{{n}}', String(f.order.years)) : pick('fees.pick.month1')}{f.order.discount_pct ? ` · ${pick('fees.pick.off').replace('{{n}}', String(f.order.discount_pct))}` : ''}</div><div>{pick('admin.order.total')}: <b dir="ltr">{rs(f.order.total)}</b></div>{Number(f.amount) < Number(f.order.total) + Number(f.fee_due ?? 0) ? <div className="text-rose-600 font-bold">{pick('admin.order.short')}</div> : null}</div> : null}
          {Number(f.fee_due ?? 0) > 0 ? <div className="text-[11px] p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-semibold">{pick('admin.credit.clearsFirst').replace('{{n}}', rs(f.fee_due))}</div> : null}
          <div className="flex flex-wrap gap-1.5">
            {f.proof_path ? <button type="button" onClick={async () => setProof(await fileObjectUrl(f.proof_path!, f.shop_id))} className={BTN_LIGHT}><ImageIcon className="w-3.5 h-3.5" />{pick('admin.proof')}</button> : null}
            <button type="button" onClick={() => void decide(f, 'approve')} className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer" data-testid="nctl-fee-approve"><Check className="w-3.5 h-3.5" />{pick('admin.approveMonths').replace('{{n}}', String(f.months))}</button>
            {f.order ? <button type="button" onClick={() => void decide(f, 'approve', { apply_order: false })} className={BTN_LIGHT}>{pick('admin.order.moneyOnly')}</button> : null}
            <button type="button" onClick={() => { setRejecting(f); setWhy('') }} className={`${BTN_LIGHT} text-rose-600`} data-testid="nctl-fee-reject"><X className="w-3.5 h-3.5" />{pick('admin.reject')}</button>
          </div>
        </div>
      ))}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      {proof ? <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6" onClick={() => setProof(null)} role="presentation"><img src={proof} alt="" className="max-h-[85vh] max-w-full rounded-2xl" /></div> : null}
      {rejecting ? (
        <Modal title={pick('admin.reject')} onClose={() => setRejecting(null)} testid="nctl-reason" footer={<><button type="button" onClick={() => setRejecting(null)} className={BTN_LIGHT}>{pick('common.cancel')}</button><button type="button" disabled={!why.trim()} onClick={async () => { await decide(rejecting, 'reject', { note: why.trim() }); setRejecting(null) }} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold cursor-pointer disabled:opacity-40" data-testid="nctl-reason-yes">{pick('admin.reject')}</button></>}>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('admin.rejectWhy')} className={INPUT} data-testid="nctl-reason-why" />
        </Modal>
      ) : null}
    </section>
  )
}

function PaymentsTab({ openA4 }: { openA4: () => void }) {
  const { pick } = useLang()
  const method = useMethod()
  const [m, setM] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const qs = new URLSearchParams()
  if (m) qs.set('method', m)
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
    <div className="space-y-4" data-testid="nctl-payments">
      <FeesToCheck />
      <div className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl2.paySearch')} className={`${INPUT} ps-8 bg-slate-100 dark:bg-obsidian-850`} data-testid="nctl-pay-q" /></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full"><button type="button" onClick={() => setM('')} aria-pressed={!m} className={seg(!m)}>{pick('prov.allChannels')}</button>{(data?.methods ?? []).map((x) => <button key={x} type="button" onClick={() => setM(x)} aria-pressed={m === x} className={seg(m === x)}>{method(x)}</button>)}</div>
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full">{([['', 'prov.all'], ['pending', 'prov.st.pending'], ['approved', 'prov.st.approved'], ['rejected', 'prov.st.rejected']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setStatus(v)} aria-pressed={status === v} className={seg(status === v)} data-testid={`nctl-pst-${v || 'all'}`}>{pick(t)}</button>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 text-xs">
          <div>{pick('prov.approvedTotal')} <span dir="ltr">({data?.rows.length ?? 0})</span>: <b className="font-display font-extrabold text-base ms-1" dir="ltr" data-testid="nctl-approved">{rs(data?.approved_total)}</b></div>
          <div className="flex gap-2"><button type="button" onClick={csv} className={BTN_LIGHT} data-testid="nctl-csv">{pick('prov.exportCsv')}</button><button type="button" onClick={openA4} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer ${LIME}`}><Printer className="w-3.5 h-3.5" />{pick('nctl2.printA4')}</button></div>
        </div>
        {!data ? <div className="py-10 text-center text-xs text-slate-400">…</div> : !data.rows.length ? <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">{pick('prov.none')}</div> : <div className="space-y-2.5">{data.rows.map((p) => <PayLine key={p.id} p={p} />)}</div>}
      </div>
    </div>
  )
}

/** the SaaS ledger as an A4 sheet: the console's own figures and every fee row, through the print window */
function LedgerA4({ owner, onClose }: { owner: string; onClose: () => void }) {
  const { pick } = useLang()
  const method = useMethod()
  const { data: o } = useGet<Overview>(['prov-overview'], '/api/v1/admin/business/overview')
  const { data } = useGet<{ rows: PayRow[]; approved_total: string }>(['prov-pays', ''], '/api/v1/admin/business/payments?')
  return (
    <Modal wide title={pick('nctl2.a4Title')} icon={<BookOpen className="w-4 h-4" />} onClose={onClose} testid="nctl-a4" footer={<button type="button" onClick={() => window.print()} className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-obsidian-950 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-a4-print"><Printer className="w-3.5 h-3.5" />{pick('nctl2.printPdf')}</button>}>
      <div className="bg-white text-slate-900 rounded-xl p-4 sm:p-6 space-y-5 print:p-0" data-testid="nctl-a4-sheet">
        <div className="flex justify-between items-start gap-3 border-b-2 border-slate-900 pb-4">
          <div><div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{pick('nctl2.a4Kicker')}</div><h1 className="font-display font-extrabold text-2xl mt-0.5">{pick('control.title')}</h1><p className="text-xs text-slate-600">{pick('nctl2.owner')} <b dir="auto">{owner}</b> · {pick('nctl2.generated')} <span dir="ltr">{fmtDate(isoDay(0))}</span></p></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-100"><div className="text-[10px] uppercase font-bold text-slate-500">{pick('nctl2.activeShops')}</div><div className="font-mono font-extrabold text-base" dir="ltr">{o?.counts.total ?? '…'}</div></div>
          <div className="p-3 rounded-xl bg-emerald-50"><div className="text-[10px] uppercase font-bold text-emerald-700">{pick('prov.collectedTotal')}</div><div className="font-mono font-extrabold text-base text-emerald-800" dir="ltr">{o ? rs(o.collected_total) : '…'}</div></div>
          <div className="p-3 rounded-xl bg-amber-50"><div className="text-[10px] uppercase font-bold text-amber-700">{pick('prov.pending')}</div><div className="font-mono font-extrabold text-base text-amber-800" dir="ltr">{o ? rs(o.pending_amount) : '…'}</div></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs border-collapse min-w-[560px]">
            <thead><tr className="border-b-2 border-slate-800 text-slate-600 uppercase text-[10px]">{['nctl2.col.receipt', 'nctl2.col.shop', 'nctl2.col.date', 'nctl2.col.channel', 'nctl2.col.months', 'nctl2.col.ref', 'nctl2.col.status'].map((h) => <th key={h} className="py-2 text-start">{pick(h)}</th>)}<th className="py-2 text-end">{pick('nctl2.col.amount')}</th></tr></thead>
            <tbody className="divide-y divide-slate-200">{(data?.rows ?? []).map((p) => <tr key={p.id} data-testid="nctl-a4-row"><td className="py-2 font-mono font-bold" dir="ltr">{p.receipt_no ?? '—'}</td><td className="py-2 font-bold" dir="auto">{p.shop_name}</td><td className="py-2 font-mono" dir="ltr">{fmtDate(p.paid_on)}</td><td className="py-2">{method(p.method)}</td><td className="py-2" dir="ltr">{p.months}</td><td className="py-2 font-mono" dir="ltr">{p.reference ?? '—'}</td><td className="py-2 font-bold">{pick(`prov.st.${p.status}`)}</td><td className="py-2 text-end font-mono font-extrabold" dir="ltr">{rs(p.amount)}</td></tr>)}</tbody>
            <tfoot><tr className="border-t-2 border-slate-800"><td colSpan={7} className="py-2 font-extrabold">{pick('prov.approvedTotal')}</td><td className="py-2 text-end font-mono font-extrabold" dir="ltr" data-testid="nctl-a4-total">{rs(data?.approved_total)}</td></tr></tfoot>
          </table>
        </div>
      </div>
    </Modal>
  )
}
