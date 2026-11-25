/** The control room's "Shops & Plans" tab, drawn from file 26 (ADR-134 / ADR-115): the Android app
 *  card, software fees with the provider's settings (payment accounts, billing, website prices),
 *  requests from the website, and the customer shops — search, fees due / locked / fee unpaid /
 *  deleted, trial / basic / pro / chain. A shop opens in its own window with the file's four tabs:
 *  trade & modules; plan, special price & billing (plan and fee, record a payment — with a package
 *  when asked —, special price, package now fee later); password, PIN & branches (with its renewal
 *  keys and 7-day links, and delete); its payment & access ledger (where it runs, its payments, the
 *  password / PIN history). Also the new-shop window and the provider's settings windows.
 *
 *  Everything is the live control room's: `/admin/shops`, `/admin/fee-stats`, `/admin/shop-requests`,
 *  `/admin/password-requests`, `/admin/modules`, `/admin/billing`, `/admin/payment-accounts`,
 *  `/admin/pricing`, `/admin/shops/{id}/plan|modules|payments|quote|deal|credit|fee-dues|fee-invoice|
 *  owner-password|owner-pin|credential-history|branches|delete|restore|enter|deployment`,
 *  `/admin/business/shops|payments`. A password or PIN is never shown — only set anew. */

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArchiveRestore, BadgePercent, Building2, CalendarClock, Check, CheckCircle2, ChevronRight, CreditCard, Download, GitBranch, Hourglass, KeyRound, Landmark, Layers, Lock, LogIn, MessageCircle, Package, Plus, Printer, ScrollText, Search, Settings2, Share2, Smartphone, Store, Tag, Trash2, TriangleAlert } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { api, get } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { isoDay, normalisePhone } from '@/lib/format'
import { MODULE_KEYS } from '@/lib/modules'
import { waNumber } from '@/lib/phone'
import { useGet, useInvalidate } from '@/lib/queries'
import { APP_LINK, SITE } from '@/features/admin/AppLinkCard'
import type { CredRow } from '@/features/more/CredentialHistoryPage'
import { KeyList } from './ControlKeys'
import { BTN_DARK, BTN_LIGHT, CARD, INPUT, LABEL, LIME, METHODS, Modal, PLANS, PayLine, SOFT, chip, errText, rs, seg, type AdminShop, type ModuleCatalogue, type PayRow, type Settings, type ShopRow } from './controlParts'

interface BillingOut { bank: { bank_name: string; account_title: string; account_number: string; iban: string; branch: string }; support: { phone: string; whatsapp: string }; schedule: { info_days: number; warn_days: number; urgent_days: number; grace_days: number; snooze_hours: number }; note: { en: string; ur: string; roman: string }; qr_path: string | null; placeholders: boolean }
interface Account { label: string; account_name: string; number: string; note: string | null }
interface ShopReq { id: string; name: string; shop_name: string; city: string | null; phone: string; plan: string; note: string | null; created_at: string }
interface PwReq { id: string; shop_id: string; shop_name: string; user_id: string; name: string; phone: string; role: string; created_at: string }
interface Due { id: string; invoice_no: string; months: number; amount: string; paid: string; left: string; status: 'unpaid' | 'partial' | 'paid'; period_from: string | null; period_to: string | null; due_on: string | null; overdue: boolean; note?: string | null }
interface Quote { total: string; per_month: string; months: number; discount_pct: number; deal_months: number; extras: string[] }
interface Addon { en: string; ur: string; roman: string; price: number | string; per: 'month' | 'year' | 'once' }
interface Pricing { prices: Record<string, number | string>; setup_fee: Record<string, number | string>; yearly_paid_months: number | string; trial_days: number | string; addons: Addon[]; module_prices?: Record<string, number | string>; discount_per_year?: number | string; max_years?: number | string; sale_pct?: number | string; sale_until?: string }
type Filter = 'all' | 'due' | 'locked' | 'unpaid' | 'bin'
type DTab = 'modules' | 'billing' | 'security' | 'ledger'
type NewInit = Partial<{ shop_name: string; city: string; owner_name: string; phone: string; plan: (typeof PLANS)[number] }> & { request_id?: string }

const TRADE = ['mobiles', 'laptops', 'accessories'] as const
const TRADE_KEYS = ['no_mobiles', 'laptops', 'accessories']
const PAID_PLANS = ['basic', 'pro', 'chain'] as const
const PASSWORD = () => `ms${Math.floor(1000 + Math.random() * 9000)}${Math.floor(100 + Math.random() * 900)}`
const paidPlan = (p: string): (typeof PAID_PLANS)[number] => ((PAID_PLANS as readonly string[]).includes(p) ? (p as (typeof PAID_PLANS)[number]) : 'basic')
const feeOf = (s: AdminShop) => (Number(s.monthly_fee) ? String(Number(s.monthly_fee)) : '')
const initials = (n: string) => n.trim().slice(0, 2).toUpperCase()

/** a shop's plan and time, as the file's lime badge */
function PlanBadge({ s }: { s: AdminShop }) {
  const { pick } = useLang()
  const tone = s.plan_status === 'locked' || s.plan_status === 'expired' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : s.plan_status === 'due_soon' ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300' : 'bg-[#A3E635]/25 text-emerald-800 dark:text-[#A3E635]'
  const text = s.plan_status === 'unlimited' ? pick('admin.unlimited') : s.plan_status === 'locked' ? pick('admin.locked') : s.days_left != null && s.days_left < 0 ? pick('admin.expiredDays').replace('{{n}}', String(-s.days_left)) : pick('admin.daysLeft').replace('{{n}}', String(s.days_left ?? 0))
  return <span className={`inline-block px-2.5 py-0.5 rounded-full font-extrabold whitespace-nowrap text-[11px] ${tone}`} data-testid="nctl-plan-chip">{pick(`nctl2.plan.${s.plan}`)} · {text}</span>
}

export function ShopsTab({ shopId, openShop, openSettings, go }: { shopId: string | null; openShop: (id: string | null) => void; openSettings: (s: Settings) => void; go: (t: 'overview' | 'payments') => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [plan, setPlan] = useState<'' | (typeof PLANS)[number]>('')
  const [pwFor, setPwFor] = useState<PwReq | null>(null)
  const [making, setMaking] = useState<NewInit | null>(null)
  const [err, setErr] = useState('')
  const { data: shops } = useGet<AdminShop[]>(['admin-shops', 'all'], '/api/v1/admin/shops')
  const { data: binned } = useGet<AdminShop[]>(['admin-shops', 'bin'], '/api/v1/admin/shops?deleted=true')
  const { data: shopReqs } = useGet<ShopReq[]>(['shop-requests'], '/api/v1/admin/shop-requests?open_only=true')
  const { data: pwReqs } = useGet<PwReq[]>(['pw-requests'], '/api/v1/admin/password-requests?open_only=true')
  const owes = (s: AdminShop) => Number(s.fee_due ?? 0) > 0
  const isDue = (s: AdminShop) => s.plan_status === 'due_soon' || s.plan_status === 'expired'
  const needle = q.trim().toLowerCase()
  const hit = (s: AdminShop) => !needle || `${s.name} ${s.owner_name ?? ''} ${s.owner_phone ?? ''} ${s.city ?? ''}`.toLowerCase().includes(needle)
  const list = (filter === 'bin' ? binned ?? [] : (shops ?? []).filter((s) => filter === 'all' || (filter === 'unpaid' ? owes(s) : filter === 'due' ? isDue(s) : s.plan_status === 'locked'))).filter((s) => hit(s) && (!plan || s.plan === plan))
  const counts: Record<Filter, number> = { all: shops?.length ?? 0, due: (shops ?? []).filter(isDue).length, locked: (shops ?? []).filter((s) => s.plan_status === 'locked').length, unpaid: (shops ?? []).filter(owes).length, bin: binned?.length ?? 0 }
  const cur = shopId ? [...(shops ?? []), ...(binned ?? [])].find((s) => s.id === shopId) ?? null : null
  const restore = async (s: AdminShop) => { setErr(''); try { await api('POST', `/api/v1/admin/shops/${s.id}/restore`, {}); await inv('admin-shops', 'prov-overview', 'prov-shops') } catch (e) { setErr(errText(e, ur)) } }

  return (
    <div className="space-y-5" data-testid="nctl-manage">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <AppCard />
        <FeesCard openSettings={openSettings} go={go} />
      </div>
      {(shopReqs?.length || pwReqs?.length) ? (
        <section className={`${CARD} p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4`} data-testid="nctl-requests">
          <div className="space-y-2">
            <h3 className="font-display font-extrabold text-sm flex items-center gap-2"><Store className="w-4 h-4 text-emerald-600 dark:text-[#A3E635]" />{pick('admin.shopRequests')}</h3>
            {!shopReqs?.length ? <p className="text-xs text-slate-400">{pick('prov.none')}</p> : shopReqs.map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2" data-testid="nctl-shopreq">
                <div className="min-w-0"><div className="text-xs font-bold" dir="auto">{r.shop_name}{r.city ? <span className="font-normal text-slate-400"> · {r.city}</span> : null}</div><div className="text-[11px] text-slate-500" dir="ltr">{r.name} · {r.phone} · {r.plan} · {fmtDate(r.created_at)}</div>{r.note ? <div className="text-[11px] text-slate-500" dir="auto">{r.note}</div> : null}</div>
                <div className="flex gap-1.5"><button type="button" onClick={() => setMaking({ shop_name: r.shop_name, city: r.city ?? '', owner_name: r.name, phone: r.phone, plan: (PLANS as readonly string[]).includes(r.plan) ? (r.plan as (typeof PLANS)[number]) : 'trial', request_id: r.id })} className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer ${LIME}`} data-testid="nctl-shopreq-open">{pick('admin.newShop')}</button><a href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white flex items-center" aria-label="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a><button type="button" onClick={async () => { await api('POST', `/api/v1/admin/shop-requests/${r.id}/done`); await inv('shop-requests') }} aria-label={pick('admin.markDone')} className={BTN_LIGHT}><Check className="w-3.5 h-3.5" /></button></div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="font-display font-extrabold text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-500" />{pick('admin.pwRequests')}</h3>
            {!pwReqs?.length ? <p className="text-xs text-slate-400">{pick('prov.none')}</p> : pwReqs.map((r) => (
              <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2" data-testid="nctl-pwreq">
                <div className="min-w-0"><div className="text-xs font-bold truncate" dir="auto">{r.name} · {r.shop_name}</div><div className="text-[11px] text-slate-500" dir="ltr">{r.phone} · {fmtDate(r.created_at)}</div></div>
                <div className="flex gap-1.5 shrink-0"><button type="button" onClick={() => { setPwFor(r); openShop(r.shop_id) }} className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer ${LIME}`}>{pick('admin.setPassword')}</button><button type="button" onClick={async () => { await api('POST', `/api/v1/admin/password-requests/${r.id}/done`); await inv('pw-requests') }} aria-label={pick('admin.markDone')} className={BTN_LIGHT}><Check className="w-3.5 h-3.5" /></button></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl2.shopSearch')} className={`${INPUT} ps-8 bg-slate-100 dark:bg-obsidian-850`} data-testid="nctl-m-q" /></div>
          <div className="flex flex-wrap items-center gap-1.5">{([['all', 'common.all'], ['due', 'admin.feesDue'], ['locked', 'admin.locked'], ['unpaid', 'admin.credit.filter'], ['bin', 'admin.bin.filter']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={chip(filter === k)} data-testid={`nctl-f-${k}`}>{pick(l)} <span className="font-mono" dir="ltr">{counts[k]}</span></button>)}</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-extrabold text-sm">{pick(filter === 'bin' ? 'nctl2.deletedShops' : 'nctl2.customerShops')} <span dir="ltr">({list.length})</span></h3>
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 text-[11px] overflow-x-auto max-w-full">{(['', ...PLANS] as const).map((p) => <button key={p || 'all'} type="button" onClick={() => setPlan(p)} aria-pressed={plan === p} className={`${seg(plan === p)} uppercase !px-2.5 !py-1 !text-[11px]`} data-testid={`nctl-p-${p || 'all'}`}>{p ? pick(`nctl2.plan.${p}`) : pick('common.all')}</button>)}</div>
        </div>
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden" data-testid="nctl-m-shops">
          {!shops ? <div className="py-10 text-center text-xs text-slate-400">…</div> : !list.length ? <div className="p-8 text-center text-sm text-slate-500">{pick('admin.none')}</div> : filter === 'bin' ? list.map((s) => (
            <div key={s.id} className="p-4 bg-rose-50/30 dark:bg-obsidian-850/60 flex flex-wrap items-center justify-between gap-3" data-testid="nctl-bin-row">
              <div className="flex items-center gap-3 min-w-0"><span className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4" /></span><div className="min-w-0"><div className="font-display font-extrabold text-sm truncate" dir="auto">{s.name}{s.city ? <span className="text-slate-500 font-normal"> · {s.city}</span> : null}</div><div className="text-xs text-slate-500 truncate">{s.owner_name} · <span dir="ltr">{s.owner_phone}</span> · {pick('admin.bin.since')} <span dir="ltr">{s.deleted_at ? fmtDate(s.deleted_at) : ''}</span>{s.deleted_reason ? ` · ${s.deleted_reason}` : ''}</div></div></div>
              <button type="button" onClick={() => void restore(s)} className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-restore"><ArchiveRestore className="w-3.5 h-3.5" />{pick('admin.bin.restore')}</button>
            </div>
          )) : list.map((s) => (
            <button key={s.id} type="button" onClick={() => { setPwFor(null); openShop(s.id) }} className="w-full p-4 bg-white dark:bg-obsidian-900 hover:bg-slate-50 dark:hover:bg-obsidian-850 transition flex flex-wrap items-center justify-between gap-3 cursor-pointer text-start" data-testid="nctl-m-shop">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-[#A3E635]/25 text-emerald-800 dark:text-[#A3E635] flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="font-display font-extrabold text-sm" dir="auto">{s.name}</span>{s.city ? <span className="text-xs text-slate-400">· {s.city}</span> : null}{s.branches > 1 ? <span className="text-[10px] font-bold text-slate-500">· {s.branches} {pick('admin.branches')}</span> : null}</div><div className="text-xs text-slate-500 mt-0.5">{s.owner_name} · <span className="font-mono" dir="ltr">{s.owner_phone}</span></div></div>
              </div>
              <div className="flex items-center gap-3 ms-auto">
                <div className="text-end"><PlanBadge s={s} /><div className={`text-[11px] font-bold mt-1 ${Number(s.monthly_fee) ? 'text-blue-700 dark:text-sky-400' : 'text-slate-400'}`}>{Number(s.monthly_fee) ? <span dir="ltr">{rs(s.monthly_fee)}/{pick('admin.month')}</span> : pick('admin.noFee')}</div>{owes(s) ? <div className="mt-1 text-[10px] font-extrabold text-rose-600">{pick('admin.credit.chip')} <span dir="ltr">{rs(s.fee_due)}</span></div> : null}</div>
                <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {cur ? <ShopDrawer key={cur.id} shop={cur} pwFor={pwFor?.shop_id === cur.id ? pwFor : null} clearPwFor={() => setPwFor(null)} onClose={() => { setPwFor(null); openShop(null) }} /> : null}
      {making ? <NewShopModal init={making} onClose={() => setMaking(null)} onMade={(s) => openShop(s.id)} /> : null}
    </div>
  )
}

/** the Android app's latest APK: download, WhatsApp, share (the live AppLinkCard's link and words) */
function AppCard() {
  const { pick } = useLang()
  const [copied, setCopied] = useState(false)
  const text = `${pick('appLink.message')}\n${APP_LINK}`
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Mobile Shop', text })
      else { await navigator.clipboard.writeText(APP_LINK); setCopied(true); setTimeout(() => setCopied(false), 2500) }
    } catch { /* the share sheet was closed */ }
  }
  const btn = 'py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer'
  return (
    <section className={`lg:col-span-6 ${CARD} p-4 sm:p-5 flex flex-col justify-between gap-3`} data-testid="nctl-app">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[#A3E635]/25 text-emerald-800 dark:text-[#A3E635] flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></span>
        <div className="min-w-0"><h3 className="font-display font-extrabold text-sm">{pick('nctl2.appTitle')}</h3><div className="font-mono text-[11px] text-slate-500 truncate" dir="ltr">{APP_LINK}</div><p className="text-[11px] text-slate-400 mt-0.5">{pick('appLink.hint')}</p></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <a href={APP_LINK} download className={`${btn} bg-slate-100 dark:bg-obsidian-800 hover:bg-slate-200`}><Download className="w-3.5 h-3.5" />{pick('appLink.download')}</a>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={`${btn} font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white`}><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>
        <button type="button" onClick={() => void share()} className={`${btn} bg-slate-100 dark:bg-obsidian-800 hover:bg-slate-200`}>{copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}{pick(copied ? 'appLink.copied' : 'nctl2.shareLink')}</button>
      </div>
    </section>
  )
}

function FeesCard({ openSettings, go }: { openSettings: (s: Settings) => void; go: (t: 'overview' | 'payments') => void }) {
  const { pick } = useLang()
  const { data: stats } = useGet<{ pending: number; month_total: string }>(['fee-stats'], '/api/v1/admin/fee-stats')
  const { data: billing } = useGet<BillingOut>(['billing'], '/api/v1/admin/billing')
  const pill = 'px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 hover:border-[#A3E635] flex items-center gap-1.5 cursor-pointer'
  return (
    <section className={`lg:col-span-6 ${CARD} p-4 sm:p-5 flex flex-col justify-between gap-3`} data-testid="nctl-fees">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#A3E635]/25 text-emerald-800 dark:text-[#A3E635] flex items-center justify-center shrink-0"><CreditCard className="w-5 h-5" /></span>
          <div><h3 className="font-display font-extrabold text-sm">{pick('admin.feesTitle')}</h3><p className="text-xs text-slate-500 mt-0.5">{pick('admin.thisMonth')} <b className="text-slate-900 dark:text-white" dir="ltr" data-testid="nctl-fees-month">{rs(stats?.month_total)}</b> · <button type="button" onClick={() => go('payments')} className={`underline cursor-pointer ${stats?.pending ? 'font-extrabold text-amber-600' : ''}`} data-testid="nctl-fees-check">{pick('admin.pendingN').replace('{{n}}', String(stats?.pending ?? 0))}</button></p></div>
        </div>
        <button type="button" onClick={() => go('overview')} className="px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 cursor-pointer">{pick('prov.open')} →</button>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="nctl-settings">
        <button type="button" onClick={() => openSettings('accounts')} className={pill} data-testid="nctl-accounts-open"><Landmark className="w-3.5 h-3.5" />{pick('admin.accounts')}</button>
        <button type="button" onClick={() => openSettings('billing')} className={`${pill} ${billing?.placeholders ? '!bg-rose-50 !border-rose-300 text-rose-700 dark:!bg-rose-950/30' : ''}`} data-testid="nctl-billing-open"><Settings2 className="w-3.5 h-3.5" />{pick('admin.billing')}</button>
        <button type="button" onClick={() => openSettings('prices')} className={pill} data-testid="nctl-prices-open"><Tag className="w-3.5 h-3.5" />{pick('admin.pricing')}</button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- a shop's window

function ShopDrawer({ shop: initial, pwFor, clearPwFor, onClose }: { shop: AdminShop; pwFor: PwReq | null; clearPwFor: () => void; onClose: () => void }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const setActiveShop = useAuth((s) => s.setActiveShop)
  const setMe = useAuth((s) => s.setMe)
  const [s, setS] = useState(initial)
  useEffect(() => setS(initial), [initial])
  const [tab, setTab] = useState<DTab>(pwFor ? 'security' : 'modules')
  useEffect(() => { if (pwFor) setTab('security') }, [pwFor])
  const [err, setErr] = useState('')
  const enter = async () => { setErr(''); try { await api('POST', `/api/v1/admin/shops/${s.id}/enter`); setActiveShop(s.id); setMe(await get<MeOut>('/api/v1/me')); nav('/new') } catch (e) { setErr(errText(e, ur)) } }
  const left = s.plan_status === 'unlimited' ? pick('admin.unlimited') : s.days_left != null && s.days_left < 0 ? pick('prov.daysOver').replace('{{n}}', String(-s.days_left)) : pick('prov.daysLeft').replace('{{n}}', String(s.days_left ?? 0))
  const remind = `https://wa.me/${waNumber(s.owner_phone ?? '')}?text=${encodeURIComponent(pick('nctl2.remindText').replace('{{owner}}', s.owner_name ?? '').replace('{{shop}}', s.name).replace('{{plan}}', pick(`nctl2.plan.${s.plan}`)).replace('{{left}}', left).replace('{{fee}}', rs(s.monthly_fee)))}`
  const TABS: [DTab, string, typeof Store][] = [['modules', 'nctl2.dt.modules', Layers], ['billing', 'nctl2.dt.billing', CreditCard], ['security', 'nctl2.dt.security', Lock], ['ledger', 'nctl2.dt.ledger', ScrollText]]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-5 bg-black/75 overflow-y-auto" data-testid="nctl-drawer" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden my-3" data-testid="nctl-m-panel">
        <div className="px-4 sm:px-5 py-4 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-obsidian-950 text-[#A3E635] font-display font-extrabold text-base flex items-center justify-center shrink-0" dir="auto">{initials(s.name)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-display font-extrabold text-lg" dir="auto">{s.name}</h2><PlanBadge s={s} />{s.plan_expires_at ? <span className="text-xs text-slate-500 font-semibold">{pick('admin.expires')} <span dir="ltr">{fmtDate(s.plan_expires_at)}</span></span> : null}</div>
              <p className="text-xs text-slate-500 mt-0.5">{s.owner_name} · <span dir="ltr">{s.owner_phone}</span> · {s.users} {pick('admin.users')}{s.city ? ` · ${s.city}` : ''}{s.branches > 1 ? ` · ${s.branches} ${pick('admin.branches')}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!s.deleted_at ? <button type="button" onClick={() => void enter()} className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-enter"><LogIn className="w-3.5 h-3.5" />{pick('admin.openShop')}</button> : null}
            <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-2 rounded-xl bg-slate-200/70 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 font-bold cursor-pointer" data-testid="nctl-drawer-close">✕</button>
          </div>
        </div>
        {s.deleted_at ? (
          <div className="p-5"><BinState s={s} onSaved={setS} /></div>
        ) : <>
          <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 overflow-x-auto max-w-full">{TABS.map(([k, l, I]) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`${seg(tab === k)} flex items-center gap-1.5`} data-testid={`nctl-dt-${k}`}><I className="w-3.5 h-3.5" />{pick(l)}</button>)}</div>
            {s.owner_phone ? <a href={remind} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635] flex items-center gap-1.5" data-testid="nctl-remind"><MessageCircle className="w-3.5 h-3.5" />{pick('nctl2.remind')}</a> : null}
          </div>
          {err ? <p className="px-5 pt-3 text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
          <div className="p-4 sm:p-5 space-y-5 text-xs">
            {tab === 'modules' ? <ModulesPane s={s} setS={setS} /> : tab === 'billing' ? <BillingPane s={s} setS={setS} /> : tab === 'security' ? <SecurityPane s={s} setS={setS} pwFor={pwFor} clearPwFor={clearPwFor} /> : <LedgerPane s={s} />}
          </div>
        </>}
      </div>
    </div>
  )
}

function useRun() {
  const { ur } = useLang()
  const inv = useInvalidate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); await inv('admin-shops', 'fee-stats', 'prov-shops', 'prov-overview', 'prov-pays') } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }
  return { busy, err, run }
}
const Err = ({ e }: { e: string }) => (e ? <p className="text-[11px] font-bold text-rose-600" role="alert">{e}</p> : null)
const Title = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => <h3 className="font-display font-extrabold text-sm flex items-center gap-2">{icon}{children}</h3>

/** what the shop trades (three ticks) and its modules: the same list the live control room writes (ADR-122) */
function ModulesBox({ catalogue, plan, value, onChange }: { catalogue: ModuleCatalogue | undefined; plan: string; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const { pick, ur } = useLang()
  if (!catalogue) return null
  const defaults = catalogue.plans[plan] ?? []
  const shown = value ?? defaults
  const on = { mobiles: !shown.includes('no_mobiles'), laptops: shown.includes('laptops'), accessories: shown.includes('accessories') }
  const lines = TRADE.filter((l) => on[l]).length
  const toggleLine = (l: (typeof TRADE)[number]) => { const key = l === 'mobiles' ? 'no_mobiles' : l; onChange(shown.includes(key) ? shown.filter((k) => k !== key) : [...shown, key]) }
  const toggle = (k: string) => onChange(shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k])
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-slate-50/70 dark:bg-obsidian-850 space-y-3">
        <div><h3 className="font-display font-extrabold text-sm">{pick('admin.trade.title')}</h3><p className="text-xs text-slate-500">{pick('admin.trade.hint')}</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="nctl-trade">{TRADE.map((l) => <label key={l} className={`p-3.5 rounded-xl border-2 flex items-center gap-3 cursor-pointer ${on[l] ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-900'}`}><input type="checkbox" checked={on[l]} disabled={on[l] && lines === 1} onChange={() => toggleLine(l)} className="w-4 h-4 accent-emerald-600" data-testid={`nctl-trade-${l}`} /><span className="font-bold text-xs">{pick(`pkg.line.${l}`)}</span></label>)}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800">
        <label className="inline-flex items-center gap-2.5 text-xs font-extrabold cursor-pointer"><input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : [...defaults])} className="w-4 h-4 accent-emerald-600" data-testid="nctl-follow-plan" />{pick('admin.followPlan').replace('{{plan}}', pick(`nctl2.plan.${plan}`))}</label>
        <span className="text-[11px] text-slate-500">{pick(value === null ? 'nctl2.followHint' : 'nctl2.customHint')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">{Object.entries(catalogue.modules).filter(([k]) => !TRADE_KEYS.includes(k)).map(([k, names]) => { const en = shown.includes(k); return <label key={k} className={`p-3 rounded-xl border flex items-center gap-2.5 ${en ? 'border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-obsidian-900'} ${value === null ? 'opacity-65' : 'cursor-pointer hover:border-[#A3E635]'}`}><input type="checkbox" disabled={value === null} checked={en} onChange={() => toggle(k)} className="w-4 h-4 accent-emerald-600" data-testid={`nctl-mod-${k}`} /><span className="font-bold text-xs">{ur ? names.ur : names.en}</span></label> })}</div>
    </div>
  )
}

function ModulesPane({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], '/api/v1/admin/modules')
  const [mods, setMods] = useState<string[] | null>(s.modules_custom ? s.modules : null)
  const { busy, err, run } = useRun()
  const [saved, setSaved] = useState(false)
  return (
    <div className="space-y-4" data-testid="nctl-sec-mods">
      <ModulesBox catalogue={catalogue} plan={s.plan} value={mods} onChange={(v) => { setMods(v); setSaved(false) }} />
      <Err e={err} />
      <div className="flex flex-wrap items-center justify-end gap-3">{saved ? <span className="text-xs font-bold text-emerald-600" data-testid="nctl-mods-saved">{pick('admin.saved')}</span> : null}<button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/modules`, { modules: mods }); setS(r); setSaved(true) })} className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-save-mods"><Check className="w-3.5 h-3.5" />{pick('admin.saveModules')}</button></div>
    </div>
  )
}

function BillingPane({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PlanCard s={s} setS={setS} />
      <PayCard s={s} setS={setS} />
      <DealCard s={s} setS={setS} />
      <CreditCard_ s={s} setS={setS} />
    </div>
  )
}

function PlanCard({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const [plan, setPlan] = useState({ plan: s.plan, monthly_fee: feeOf(s), expires_on: s.plan_expires_at ? s.plan_expires_at.slice(0, 10) : '', note: s.fee_note ?? '' })
  const [grace, setGrace] = useState(s.grace_days == null ? '' : String(s.grace_days))
  const save = (body: Record<string, unknown>) => run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/plan`, body); setS(r); setPlan((p) => ({ ...p, expires_on: r.plan_expires_at ? r.plan_expires_at.slice(0, 10) : '' })) })
  const base = () => ({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note })
  return (
    <section className={`p-4 ${SOFT} space-y-3`} data-testid="nctl-sec-plan">
      <Title icon={<Package className="w-4 h-4 text-amber-600" />}>{pick('admin.planTitle')}</Title>
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">{PLANS.map((p) => <button key={p} type="button" onClick={() => setPlan({ ...plan, plan: p })} aria-pressed={plan.plan === p} className={`${seg(plan.plan === p)} uppercase`} data-testid={`nctl-plan-${p}`}>{pick(`nctl2.plan.${p}`)}</button>)}</div>
      <div className="grid grid-cols-2 gap-3"><div><label className={LABEL}>{pick('admin.monthlyFee')}</label><input type="number" min={0} value={plan.monthly_fee} onChange={(e) => setPlan({ ...plan, monthly_fee: e.target.value })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-fee-input" /></div><div><label className={LABEL}>{pick('admin.expiresOn')}</label><input type="date" value={plan.expires_on} onChange={(e) => setPlan({ ...plan, expires_on: e.target.value })} className={INPUT} dir="ltr" data-testid="nctl-expires" /></div></div>
      <div><label className={LABEL}>{pick('admin.feeNote')}</label><input value={plan.note} onChange={(e) => setPlan({ ...plan, note: e.target.value })} maxLength={200} className={INPUT} dir="auto" /></div>
      <div className="grid grid-cols-3 gap-2">{[1, 3, 12].map((m) => <button key={m} type="button" disabled={busy} onClick={() => void save({ ...base(), extend_months: m })} className="py-2 rounded-xl font-extrabold bg-[#A3E635]/25 text-emerald-900 dark:text-[#A3E635] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40" data-testid={`nctl-extend-${m}`}><CalendarClock className="w-3.5 h-3.5" />+{m} {pick(m === 1 ? 'admin.month' : 'admin.months')}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 pt-1"><button type="button" disabled={busy} onClick={() => void save({ ...base(), expires_on: plan.expires_on || null, clear_expiry: !plan.expires_on })} className="py-2.5 rounded-xl font-extrabold bg-emerald-700 text-white cursor-pointer disabled:opacity-40" data-testid="nctl-save-plan">{pick('admin.savePlan')}</button><button type="button" disabled={busy} onClick={() => void save({ clear_expiry: true })} className={BTN_LIGHT} data-testid="nctl-unlimited">∞ {pick('admin.unlimited')}</button></div>
      <div className="flex items-end gap-2 pt-1 border-t border-slate-200 dark:border-slate-800"><div className="flex-1 pt-2"><label className={LABEL}>{pick('admin.shopGrace')}</label><input type="number" min={0} max={90} value={grace} onChange={(e) => setGrace(e.target.value)} className={`${INPUT} font-mono`} dir="ltr" data-testid="nctl-grace" /></div><button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/plan`, { set_grace: true, grace_days: grace === '' ? null : Number(grace) }); setS({ ...r, grace_days: grace === '' ? null : Number(grace) }) })} className={BTN_LIGHT}>{pick('common.save')}</button></div>
      <Err e={err} />
    </section>
  )
}

/** a payment taken by hand — with the package, modules and months it is for when the shop asked (ADR-098) */
function PayCard({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const { data: cat } = useGet<ModuleCatalogue>(['module-catalogue'], '/api/v1/admin/modules')
  const [f, setF] = useState({ amount: '', months: '1', method: 'cash', reference: '', paid_on: isoDay(0), pkg: false, plan: paidPlan(s.fee_deal?.plan ?? s.plan), modules: [] as string[] })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const months = Math.min(60, Math.max(1, Number(f.months) || 1))
  const order = { plan: f.plan, modules: f.modules, addons: [], months }
  const qkey = f.pkg ? `${s.id}|${f.plan}|${f.modules.join(',')}|${months}|${s.fee_deal?.price ?? ''}|${s.fee_deal?.months_left ?? ''}` : ''
  useEffect(() => {
    if (!qkey) { setQuote(null); return }
    let stale = false
    api<Quote>('POST', `/api/v1/admin/shops/${s.id}/quote`, order).then((q) => { if (!stale) setQuote(q) }).catch(() => { if (!stale) setQuote(null) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qkey])
  const amount = f.amount !== '' ? f.amount : f.pkg ? (quote ? String(Number(quote.total)) : '') : feeOf(s)
  const extra = cat ? Object.keys(cat.modules).filter((k) => !(cat.plans[f.plan] ?? []).includes(k)) : []
  return (
    <section className={`p-4 ${SOFT} space-y-3`} data-testid="nctl-sec-pay">
      <Title icon={<CreditCard className="w-4 h-4 text-blue-600" />}>{pick('nctl2.recordTitle')}</Title>
      <p className="text-[11px] text-slate-500">{pick('admin.recordHint')}</p>
      <label className="flex items-center gap-2 text-xs font-extrabold cursor-pointer"><input type="checkbox" checked={f.pkg} onChange={(e) => setF({ ...f, pkg: e.target.checked, amount: '' })} className="w-4 h-4 accent-emerald-600" data-testid="nctl-pay-pkg" />{pick('nctl2.withPackage')}</label>
      {f.pkg ? <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">
        <p className="text-[11px] text-slate-500">{pick('admin.payOrder.hint')}</p>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850">{PAID_PLANS.map((k) => <button key={k} type="button" aria-pressed={f.plan === k} onClick={() => setF({ ...f, plan: k, modules: [], amount: '' })} className={`${seg(f.plan === k)} uppercase`} data-testid={`nctl-order-plan-${k}`}>{pick(`fees.pick.pkg.${k}`)}</button>)}</div>
        {extra.length ? <><div className={LABEL}>{pick('admin.payOrder.modules')}</div><div className="flex flex-wrap gap-1.5">{extra.map((k) => { const on = f.modules.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setF({ ...f, modules: on ? f.modules.filter((x) => x !== k) : [...f.modules, k], amount: '' })} className={chip(on)} data-testid={`nctl-order-mod-${k}`}>{pick(`modules.${k}`)}</button> })}</div></> : null}
        {quote ? <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-obsidian-850" data-testid="nctl-order-quote"><span className="text-slate-500">{pick('admin.payOrder.total')}{quote.discount_pct ? ` · ${pick('fees.pick.off').replace('{{n}}', String(quote.discount_pct))}` : ''}</span><b className="font-mono text-sm" dir="ltr">{rs(quote.total)}</b></div> : null}
      </div> : null}
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL}>{pick('fees.amount')}</label><input type="number" min={1} value={amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-pay-amount" /></div>
        <div><label className={LABEL}>{pick('fees.months')}</label><input type="number" min={f.pkg ? 1 : 0} max={f.pkg ? 60 : 36} value={f.months} onChange={(e) => setF({ ...f, months: e.target.value, amount: f.pkg ? '' : f.amount })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-pay-months" /></div>
        <div><label className={LABEL}>{pick('fees.method')}</label><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className={`${INPUT} font-bold`} data-testid="nctl-pay-method">{METHODS.map((m) => <option key={m} value={m}>{pick(`pay.${m}`)}</option>)}</select></div>
        <div><label className={LABEL}>{pick('fees.reference')}</label><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={`${INPUT} font-mono`} dir="ltr" /></div>
        <div className="col-span-2"><label className={LABEL}>{pick('admin.paidOn')}</label><input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} className={INPUT} dir="ltr" /></div>
      </div>
      {Number(s.fee_due ?? 0) > 0 ? <div className="text-[11px] p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-semibold">{pick('admin.credit.clearsFirst').replace('{{n}}', rs(s.fee_due))}</div> : null}
      {receipt != null ? <div className="text-[11px] p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold" data-testid="nctl-receipt">{pick('admin.receipt')} <span dir="ltr">{receipt}</span></div> : null}
      <Err e={err} />
      <button type="button" disabled={busy || !Number(amount)} onClick={() => void run(async () => {
        const body: Record<string, unknown> = { amount: Number(amount), method: f.method, reference: f.reference || null, paid_on: f.paid_on || null }
        if (f.pkg) body.order = order
        else body.months = f.months === '' ? 1 : Number(f.months)
        const r = await api<{ receipt_no?: string | null }>('POST', `/api/v1/admin/shops/${s.id}/payments`, body)
        setReceipt(r.receipt_no ?? '')
        setF((x) => ({ ...x, amount: '', reference: '' }))
        const rows = await get<AdminShop[]>('/api/v1/admin/shops'); const n = rows.find((x) => x.id === s.id); if (n) setS(n)
      })} className={`w-full py-2.5 rounded-xl font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-record"><CheckCircle2 className="w-4 h-4" />{pick(f.pkg ? 'admin.payOrder.apply' : 'nctl2.recordBtn')}</button>
    </section>
  )
}

function DealCard({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const deal = s.fee_deal ?? null
  const [d, setD] = useState({ plan: paidPlan(deal?.plan ?? s.plan), price: deal ? String(Number(deal.price)) : '', months: deal?.months ? String(deal.months) : '', note: deal?.note ?? '' })
  const [saved, setSaved] = useState(false)
  return (
    <section className={`p-4 ${CARD} space-y-3`} data-testid="nctl-sec-deal">
      <div className="flex flex-wrap items-center justify-between gap-2"><Title icon={<BadgePercent className="w-4 h-4 text-amber-500" />}>{pick('admin.deal.title')}</Title>{deal ? <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635] font-bold" data-testid="nctl-deal-now">{pick(`fees.pick.pkg.${deal.plan}`)} · <span dir="ltr">{rs(deal.price)}</span> {pick('fees.pick.perMonth')} · {deal.months_left == null ? pick('admin.deal.noEnd') : pick('admin.deal.left').replace('{{n}}', String(deal.months_left))}</span> : null}</div>
      <p className="text-[11px] text-slate-500">{pick('admin.deal.hint')}</p>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850">{PAID_PLANS.map((k) => <button key={k} type="button" aria-pressed={d.plan === k} onClick={() => setD({ ...d, plan: k })} className={`${seg(d.plan === k)} uppercase`} data-testid={`nctl-deal-plan-${k}`}>{pick(`fees.pick.pkg.${k}`)}</button>)}</div>
      <div className="grid grid-cols-2 gap-3"><div><label className={LABEL}>{pick('admin.deal.price')}</label><input type="number" min={0} value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} className={`${INPUT} font-mono font-bold bg-slate-50 dark:bg-obsidian-850`} dir="ltr" data-testid="nctl-deal-price" /></div><div><label className={LABEL}>{pick('admin.deal.months')}</label><input type="number" min={1} max={120} value={d.months} onChange={(e) => setD({ ...d, months: e.target.value })} className={`${INPUT} font-mono font-bold bg-slate-50 dark:bg-obsidian-850`} dir="ltr" data-testid="nctl-deal-months" /></div></div>
      <div><label className={LABEL}>{pick('admin.deal.note')}</label><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} maxLength={200} className={`${INPUT} bg-slate-50 dark:bg-obsidian-850`} dir="auto" /></div>
      {saved ? <div className="text-[11px] font-bold text-emerald-600">{pick('admin.deal.saved')}</div> : null}
      <Err e={err} />
      <div className="flex gap-2">
        <button type="button" disabled={busy || d.price === '' || Number(d.price) < 0} onClick={() => void run(async () => { const r = await api<AdminShop>('PUT', `/api/v1/admin/shops/${s.id}/deal`, { plan: d.plan, price: Number(d.price), months: d.months === '' ? null : Number(d.months), note: d.note || null }); setS(r); setSaved(true) })} className={`${BTN_DARK} flex-1`} data-testid="nctl-deal-save"><Tag className="w-3.5 h-3.5" />{pick('admin.deal.save')}</button>
        {deal ? <button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('DELETE', `/api/v1/admin/shops/${s.id}/deal`); setS(r); setSaved(false) })} className="px-3 py-2 rounded-xl font-bold bg-rose-500/15 text-rose-600 flex items-center gap-1 cursor-pointer" data-testid="nctl-deal-remove"><Trash2 className="w-3.5 h-3.5" />{pick('nctl2.remove')}</button> : null}
      </div>
    </section>
  )
}

/** give the package now, take the fee later (ADR-053): only the provider sees this and its notes */
function CreditCard_({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const fee = Number(s.monthly_fee) || 0
  const [f, setF] = useState({ months: '1', amount: '', due_on: '', note: '' })
  const [given, setGiven] = useState(false)
  const amount = f.amount === '' && fee ? String(fee * Math.max(1, Number(f.months) || 1)) : f.amount
  const { data: dues, refetch } = useGet<{ rows: Due[]; total: string; paid: string; left: string }>(['fee-dues', s.id], `/api/v1/admin/shops/${s.id}/fee-dues`)
  const left = Number(dues?.left ?? 0)
  const wa = `https://wa.me/${waNumber(s.owner_phone ?? '')}?text=${encodeURIComponent(pick('admin.credit.waText').replace('{{shop}}', s.name).replace('{{total}}', rs(dues?.total ?? 0)).replace('{{paid}}', rs(dues?.paid ?? 0)).replace('{{left}}', rs(left)))}`
  const tone = (st: Due['status']) => (st === 'paid' ? 'bg-emerald-500/15 text-emerald-700' : st === 'partial' ? 'bg-amber-500/20 text-amber-800' : 'bg-rose-500/15 text-rose-700')
  return (
    <section className="p-4 rounded-2xl border border-amber-300/80 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 space-y-3" data-testid="nctl-sec-credit">
      <Title icon={<Hourglass className="w-4 h-4 text-amber-600" />}><span className="text-amber-900 dark:text-amber-300">{pick('admin.credit.title')}</span></Title>
      <p className="text-[11px] text-slate-500 flex items-start gap-1"><Lock className="w-3 h-3 mt-0.5 shrink-0" />{pick('admin.credit.hint')}</p>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={LABEL}>{pick('fees.months')}</label><input type="number" min={1} max={36} value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-credit-months" /></div>
        <div><label className={LABEL}>{pick('fees.amount')}</label><input type="number" min={1} value={amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-credit-amount" /></div>
        <div><label className={LABEL}>{pick('nctl2.payBy')}</label><input type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} className={INPUT} dir="ltr" /></div>
      </div>
      <div><label className={LABEL}>{pick('admin.credit.note')}</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} className={INPUT} dir="auto" data-testid="nctl-credit-note" /></div>
      {given ? <div className="text-[11px] font-bold text-emerald-700" data-testid="nctl-credit-given">{pick('admin.credit.given')}</div> : null}
      <Err e={err} />
      <button type="button" disabled={busy || !(Number(f.months) >= 1) || !Number(amount)} onClick={() => void run(async () => { const r = await api<AdminShop>('POST', `/api/v1/admin/shops/${s.id}/credit`, { months: Number(f.months), amount: Number(amount), due_on: f.due_on || null, note: f.note || null }); setS(r); setF({ months: '1', amount: '', due_on: '', note: '' }); setGiven(true); void refetch() })} className="w-full py-2.5 rounded-xl font-extrabold bg-amber-600 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40" data-testid="nctl-credit-give"><CalendarClock className="w-3.5 h-3.5" />{pick('admin.credit.give')}</button>
      {dues?.rows.length ? (
        <div className="space-y-2 pt-2 border-t border-amber-200 dark:border-amber-900" data-testid="nctl-dues">
          <div className="font-extrabold">{pick('admin.credit.list')}</div>
          {dues.rows.map((d) => (
            <div key={d.id} className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between gap-2"><span className="font-mono font-bold" dir="ltr">{d.invoice_no}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${tone(d.status)}`}>{pick(`fees.due.${d.status}`)}</span></div>
              <div className="flex items-center justify-between gap-2 text-slate-500"><span dir="ltr">{d.period_from ? fmtDate(d.period_from) : '—'} – {d.period_to ? fmtDate(d.period_to) : '—'} · {d.months} {pick(d.months === 1 ? 'admin.month' : 'admin.months')}</span><span className="font-mono font-bold text-slate-900 dark:text-white" dir="ltr">{rs(d.amount)}{Number(d.paid) ? <span className="text-slate-500 font-normal"> · {pick('fees.due.paidPart')} {rs(d.paid)}</span> : null}</span></div>
              {d.due_on && d.status !== 'paid' ? <div className={d.overdue ? 'font-bold text-rose-600' : 'text-slate-500'}>{pick(d.overdue ? 'fees.due.overdue' : 'fees.due.promised')} <span dir="ltr">{fmtDate(d.due_on)}</span></div> : null}
              {d.note ? <div className="text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3 shrink-0" />{d.note}</div> : null}
            </div>
          ))}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2 font-extrabold ${left > 0 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30'}`}>{pick(left > 0 ? 'fees.due.left' : 'fees.due.allPaid')}{left > 0 ? <span className="font-mono text-base" dir="ltr" data-testid="nctl-credit-left">{rs(left)}</span> : null}</div>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void openPrintable(`/api/v1/admin/shops/${s.id}/fee-invoice`)} className={BTN_LIGHT}><Printer className="w-3.5 h-3.5" />{pick('fees.due.invoice')}</button><a href={wa} target="_blank" rel="noopener noreferrer" className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-1.5" data-testid="nctl-credit-wa"><MessageCircle className="w-3.5 h-3.5" />{pick('admin.credit.send')}</a></div>
        </div>
      ) : null}
    </section>
  )
}

function SecurityPane({ s, setS, pwFor, clearPwFor }: { s: AdminShop; setS: (s: AdminShop) => void; pwFor: PwReq | null; clearPwFor: () => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const [pw, setPw] = useState('')
  const [pwDone, setPwDone] = useState<{ phone: string; password: string } | null>(null)
  const [pin, setPin] = useState('')
  const [pinDone, setPinDone] = useState<{ phone: string; pin: string } | null>(null)
  const [branch, setBranch] = useState({ name: '', city: '' })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className={`p-4 ${SOFT} space-y-3`} data-testid="nctl-sec-pw">
          <Title icon={<KeyRound className="w-4 h-4 text-amber-500" />}>{pick('nctl2.pwTitle')}</Title>
          {pwFor ? <div className="p-2 rounded-lg bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-[11px] flex flex-wrap items-center gap-2" data-testid="nctl-pw-for"><span className="text-slate-500">{pick('admin.pwFor')}</span><b dir="auto">{pwFor.name}</b><span dir="ltr">{pwFor.phone}</span><span className="px-1.5 rounded bg-slate-100 dark:bg-obsidian-850">{pick(`staff.roles.${pwFor.role}`)}</span><button type="button" onClick={clearPwFor} className="ms-auto text-emerald-700 dark:text-[#A3E635] font-bold underline cursor-pointer">{pick('admin.pwForOwner')}</button></div> : null}
          <div><label className={LABEL}>{pick('nctl2.newPassword')}</label><div className="flex gap-2"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} placeholder={pick('admin.password')} className={INPUT} data-testid="nctl-pw" /><button type="button" disabled={busy || pw.length < 6} onClick={() => void run(async () => { const r = await api<{ phone: string }>('POST', `/api/v1/admin/shops/${s.id}/owner-password`, { password: pw, user_id: pwFor?.user_id }); setPwDone({ phone: r.phone, password: pw }); setPw('') })} className={BTN_DARK} data-testid="nctl-pw-save">{pick('common.save')}</button></div></div>
          {pwDone ? <div className="p-2.5 rounded-xl bg-[#A3E635] text-obsidian-950 space-y-1.5" data-testid="nctl-pw-done"><div className="text-xs font-extrabold">{pick('admin.pwSet')}</div><div className="font-mono text-xs" dir="ltr">{pwDone.phone} · {pwDone.password}</div><a href={`https://wa.me/${waNumber(pwDone.phone)}?text=${encodeURIComponent(pick('nctl2.pwWa').replace('{{shop}}', s.name).replace('{{phone}}', pwDone.phone).replace('{{pw}}', pwDone.password).replace('{{site}}', SITE))}`} target="_blank" rel="noopener noreferrer" className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{pick('admin.sendWhatsapp')}</a></div> : null}
          <div><label className={LABEL}>{pick('cred.newPin')}</label><div className="flex gap-2"><input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-pin" /><button type="button" disabled={busy || pin.length < 4} onClick={() => void run(async () => { const r = await api<{ phone: string }>('POST', `/api/v1/admin/shops/${s.id}/owner-pin`, { pin, user_id: pwFor?.user_id }); setPinDone({ phone: r.phone, pin }); setPin('') })} className={BTN_DARK} data-testid="nctl-pin-save">{pick('common.save')}</button></div></div>
          {pinDone ? <div className="p-2.5 rounded-xl bg-[#A3E635] text-obsidian-950 text-xs font-bold" data-testid="nctl-pin-done">{pick('cred.pinSet')} <span className="font-mono" dir="ltr">{pinDone.phone} · {pinDone.pin}</span></div> : null}
          <p className="text-[11px] text-slate-500 flex items-start gap-1"><Lock className="w-3 h-3 mt-0.5 shrink-0" />{pick('nctl2.neverShown')}</p>
        </section>
        <section className={`p-4 ${SOFT} space-y-3`} data-testid="nctl-sec-branch">
          <Title icon={<Building2 className="w-4 h-4 text-emerald-600" />}>{pick('admin.addBranch')}</Title>
          <p className="text-[11px] text-slate-500">{pick('admin.branchHint')}</p>
          <div className="grid grid-cols-2 gap-2"><input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} placeholder={pick('auth.shopName')} className={`${INPUT} font-bold`} dir="auto" data-testid="nctl-branch-name" /><input value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} placeholder={pick('auth.city')} className={INPUT} dir="auto" /></div>
          <button type="button" disabled={busy || branch.name.trim().length < 2} onClick={() => void run(async () => { await api<AdminShop>('POST', `/api/v1/admin/shops/${s.id}/branches`, { name: branch.name, city: branch.city || null }); setBranch({ name: '', city: '' }); const rows = await get<AdminShop[]>('/api/v1/admin/shops'); const n = rows.find((x) => x.id === s.id); if (n) setS(n) })} className={`w-full py-2 rounded-xl font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-branch-save"><GitBranch className="w-3.5 h-3.5" />{pick('admin.addBranch')}</button>
          {s.branches > 1 ? <div className="text-[11px] font-bold text-slate-500" data-testid="nctl-branches">{s.branches} {pick('admin.branches')}</div> : null}
        </section>
      </div>
      <Err e={err} />
      <section className={`p-4 ${SOFT} space-y-3`} data-testid="nctl-sec-code">
        <Title icon={<KeyRound className="w-4 h-4 text-emerald-600" />}>{pick('nctl2.keysTitle')}</Title>
        <p className="text-[11px] text-slate-500">{pick('prov.key.hint')}</p>
        <KeyList shopId={s.id} shopName={s.name} />
      </section>
      <DangerZone s={s} setS={setS} />
    </div>
  )
}

function DangerZone({ s, setS }: { s: AdminShop; setS: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  const [asking, setAsking] = useState(false)
  const [f, setF] = useState({ confirm_name: '', reason: '' })
  const same = f.confirm_name.trim().replace(/\s+/g, ' ').toLowerCase() === s.name.trim().replace(/\s+/g, ' ').toLowerCase()
  return (
    <section className="p-4 rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 space-y-3" data-testid="nctl-danger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-display font-extrabold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-1.5"><TriangleAlert className="w-4 h-4" />{pick('admin.bin.title')}</div><p className="text-xs text-slate-500">{pick('admin.bin.warn')}</p></div>
        {!asking ? <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-600 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-delete"><Trash2 className="w-3.5 h-3.5" />{pick('admin.bin.delete')}</button> : null}
      </div>
      {asking ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label className={LABEL}>{pick('admin.bin.typeName')}</label><input value={f.confirm_name} onChange={(e) => setF({ ...f, confirm_name: e.target.value })} placeholder={s.name} autoComplete="off" className={INPUT} dir="auto" data-testid="nctl-bin-confirm" /></div>
        <div><label className={LABEL}>{pick('admin.bin.reason')}</label><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} className={INPUT} dir="auto" /></div>
        <button type="button" onClick={() => setAsking(false)} className={BTN_LIGHT}>{pick('common.cancel')}</button>
        <button type="button" disabled={!same || busy} onClick={() => void run(async () => { const r = await api<AdminShop>('POST', `/api/v1/admin/shops/${s.id}/delete`, { confirm_name: f.confirm_name, reason: f.reason.trim() || null }); setS(r) })} className="px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-600 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40" data-testid="nctl-bin-delete"><Trash2 className="w-3.5 h-3.5" />{pick('admin.bin.confirm')}</button>
      </div> : null}
      <Err e={err} />
    </section>
  )
}

function BinState({ s, onSaved }: { s: AdminShop; onSaved: (s: AdminShop) => void }) {
  const { pick } = useLang()
  const { busy, err, run } = useRun()
  return (
    <div className="p-4 rounded-2xl border-2 border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 space-y-3 text-xs" data-testid="nctl-in-bin">
      <div className="font-display font-extrabold text-sm text-rose-700 dark:text-rose-400">{pick('admin.bin.inBin')}</div>
      <div className="text-slate-500">{pick('admin.bin.since')} <span dir="ltr">{s.deleted_at ? fmtDate(s.deleted_at) : ''}</span>{s.deleted_reason ? ` · ${s.deleted_reason}` : ''}</div>
      <Err e={err} />
      <button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('POST', `/api/v1/admin/shops/${s.id}/restore`, {}); onSaved(r) })} className="px-4 py-2 rounded-xl font-extrabold bg-emerald-600 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-restore-one"><ArchiveRestore className="w-3.5 h-3.5" />{pick('admin.bin.restore')}</button>
    </div>
  )
}

function device(ua: string | null): string {
  if (!ua) return ''
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : ''
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [os, br].filter(Boolean).join(' · ')
}

function LedgerPane({ s }: { s: AdminShop }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data: rows } = useGet<ShopRow[]>(['prov-shops', `q=${s.name}`], `/api/v1/admin/business/shops?q=${encodeURIComponent(s.name)}`)
  const r = (rows ?? []).find((x) => x.shop_id === s.id) ?? null
  const { data: pays } = useGet<{ rows: PayRow[] }>(['prov-shop-pays', s.id], `/api/v1/admin/business/payments?q=${encodeURIComponent(s.name)}`)
  const mine = (pays?.rows ?? []).filter((p) => p.shop_id === s.id)
  const { data: creds } = useGet<CredRow[]>(['admin-cred', s.id], `/api/v1/admin/shops/${s.id}/credential-history`)
  const [err, setErr] = useState('')
  const box = 'bg-slate-50 dark:bg-obsidian-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2'
  return (
    <div className="space-y-4">
      <section className={box} data-testid="nctl-usage-shop">
        <Title icon={<Smartphone className="w-4 h-4 text-emerald-600" />}>{pick('prov.deployment')}</Title>
        {!r ? <div className="text-slate-400">…</div> : <>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 max-w-sm">{(['cloud', 'local'] as const).map((v) => <button key={v} type="button" onClick={async () => { setErr(''); try { await api('PATCH', `/api/v1/admin/shops/${s.id}/deployment`, { deployment: v }); await inv('prov-shops', 'prov-overview') } catch (e) { setErr(errText(e, ur)) } }} aria-pressed={r.deployment === v} className={seg(r.deployment === v)} data-testid={`nctl-dep-${v}`}>{pick(`prov.${v}`)}</button>)}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500"><span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${r.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />{pick('prov.lastUsed')} <b className="text-slate-800 dark:text-slate-100" dir="ltr">{r.last_used_at ? fmtDateTime(r.last_used_at) : pick('prov.never')}</b></span>{r.install_version ? <span>{pick('prov.version')} <b className="font-mono" dir="ltr">{r.install_version}</b></span> : null}<span>{pick('prov.paidTotal')} <b className="text-slate-800 dark:text-slate-100" dir="ltr">{rs(r.paid_total)}</b> · {r.payments}×</span></div>
        </>}
        <Err e={err} />
      </section>
      <section className={box} data-testid="nctl-shop-pays">
        <Title icon={<CreditCard className="w-4 h-4 text-blue-600" />}>{pick('nctl2.shopLedger')}</Title>
        {!pays ? <div className="text-slate-400">…</div> : !mine.length ? <p className="text-slate-400">{pick('nctl2.noPayments')}</p> : <div className="space-y-2">{mine.map((p) => <PayLine key={p.id} p={p} />)}</div>}
      </section>
      <section className={box} data-testid="nctl-cred-list">
        <Title icon={<ScrollText className="w-4 h-4 text-amber-600" />}>{pick('nctl2.accessHistory')}</Title>
        <p className="text-[11px] text-slate-500 flex items-start gap-1"><Lock className="w-3 h-3 mt-0.5 shrink-0" />{pick('cred.safe')}</p>
        {!creds ? <div className="text-slate-400">…</div> : !creds.length ? <p className="text-slate-400">{pick('cred.none')}</p> : creds.map((c) => (
          <div key={c.id} className="p-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/70 dark:border-slate-800 flex flex-wrap justify-between gap-2" data-testid="nctl-cred">
            <span className="font-bold"><span dir="auto">{c.user_name}</span> <span className="font-medium text-slate-500">· {pick(`staff.roles.${c.role}`)}</span> — {pick(`cred.kind.${c.kind}`)} {pick(`cred.action.${c.action}`)} · {c.by_kind === 'owner' && c.by_name ? `${pick('cred.by.owner')} (${c.by_name})` : pick(`cred.by.${c.by_kind}`)}</span>
            <span className="text-[11px] text-slate-400" dir="ltr">{fmtDateTime(c.at)}{device(c.user_agent) ? ` · ${device(c.user_agent)}` : ''}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- new shop, the provider's settings

export function NewShopModal({ init, onClose, onMade }: { init: NewInit; onClose: () => void; onMade: (s: AdminShop) => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], '/api/v1/admin/modules')
  const blank = { shop_name: '', city: '', owner_name: '', phone: '', password: PASSWORD(), locale: 'ur' as 'ur' | 'en', plan: 'trial' as (typeof PLANS)[number], modules: null as string[] | null, fee: '' }
  const [f, setF] = useState({ ...blank, ...init })
  const [made, setMade] = useState<{ shop: AdminShop; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = f.shop_name.trim().length >= 2 && f.owner_name.trim().length >= 2 && isMobileOk(f.phone) && f.password.length >= 6
  const share = made ? `https://wa.me/${waNumber(made.shop.owner_phone ?? '')}?text=${encodeURIComponent(pick('nctl2.newWa').replace('{{shop}}', made.shop.name).replace('{{phone}}', made.shop.owner_phone ?? '').replace('{{pw}}', made.password).replace('{{site}}', SITE).replace('{{app}}', APP_LINK))}` : ''
  async function create() {
    setBusy(true); setErr('')
    try {
      const shop = await api<AdminShop>('POST', '/api/v1/admin/shops', { shop_name: f.shop_name, city: f.city || null, owner_name: f.owner_name, phone: normalisePhone(f.phone), password: f.password, locale: f.locale, plan: f.plan, modules: f.modules, request_id: init.request_id ?? null })
      let out = shop
      if (f.fee !== '' && Number(f.fee) >= 0) out = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${shop.id}/plan`, { monthly_fee: Number(f.fee) })
      await inv('admin-shops', 'shop-requests', 'prov-shops', 'prov-overview')
      setMade({ shop: out, password: f.password })
      onMade(out)
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Modal title={pick(made ? 'admin.created' : 'nctl2.onboard')} icon={<Plus className="w-4 h-4" />} onClose={onClose} testid="nctl-new-drawer"
      footer={made ? undefined : <><button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-obsidian-800 cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || !ok} onClick={() => void create()} className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-n-save"><Check className="w-3.5 h-3.5" />{pick('nctl2.createShop')}</button></>}>
      {made ? (
        <div className="space-y-3" data-testid="nctl-made">
          <div className={`p-5 rounded-2xl text-center space-y-1 ${LIME}`}><CheckCircle2 className="w-8 h-8 mx-auto" /><div className="font-display font-extrabold" dir="auto">{made.shop.name}</div></div>
          <div className="font-extrabold">{pick('admin.giveDetails')}</div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 font-mono text-sm space-y-1" dir="ltr"><div>{made.shop.owner_phone}</div><div data-testid="nctl-made-pw">{made.password}</div></div>
          <a href={share} target="_blank" rel="noopener noreferrer" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold flex items-center justify-center gap-1.5"><MessageCircle className="w-4 h-4" />{pick('admin.sendWhatsapp')}</a>
          <button type="button" onClick={() => { setMade(null); setF({ ...blank, password: PASSWORD() }) }} className={`${BTN_LIGHT} w-full`}><Plus className="w-3.5 h-3.5" />{pick('admin.another')}</button>
        </div>
      ) : <>
        <div className="grid grid-cols-2 gap-3"><div><label className={LABEL}>{pick('auth.shopName')}</label><input value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} className={`${INPUT} font-bold bg-slate-50 dark:bg-obsidian-850`} dir="auto" data-testid="nctl-n-shop" /></div><div><label className={LABEL}>{pick('auth.city')}</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={`${INPUT} font-bold bg-slate-50 dark:bg-obsidian-850`} dir="auto" /></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start"><div><label className={LABEL}>{pick('admin.ownerName')}</label><input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} className={`${INPUT} font-bold bg-slate-50 dark:bg-obsidian-850`} dir="auto" data-testid="nctl-n-owner" /></div><div><PhoneInput label="admin.ownerPhone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} /></div></div>
        <div><label className={LABEL}>{pick('admin.password')}</label><div className="flex gap-2"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} className={`${INPUT} font-mono bg-slate-50 dark:bg-obsidian-850`} dir="ltr" data-testid="nctl-n-pw" /><button type="button" onClick={() => setF({ ...f, password: PASSWORD() })} className={BTN_LIGHT}>{pick('nctl.newPw')}</button></div><p className="text-[11px] text-slate-500 mt-1">{pick('nctl2.pwOnce')}</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2"><label className={LABEL}>{pick('nctl2.package')}</label><div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850">{PLANS.map((p) => <button key={p} type="button" onClick={() => setF({ ...f, plan: p, modules: null })} aria-pressed={f.plan === p} className={`${seg(f.plan === p)} uppercase !px-1`} data-testid={`nctl-n-plan-${p}`}>{pick(`nctl2.plan.${p}`)}</button>)}</div></div>
          <div><label className={LABEL}>{pick('admin.monthlyFee')}</label><input type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} className={`${INPUT} font-mono font-bold bg-slate-50 dark:bg-obsidian-850`} dir="ltr" data-testid="nctl-n-fee" /></div>
        </div>
        <div><label className={LABEL}>{pick('admin.language')}</label><div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 max-w-xs">{(['ur', 'en'] as const).map((l) => <button key={l} type="button" onClick={() => setF({ ...f, locale: l })} aria-pressed={f.locale === l} className={seg(f.locale === l)}>{l === 'ur' ? 'اردو' : 'English'}</button>)}</div></div>
        <ModulesBox catalogue={catalogue} plan={f.plan} value={f.modules} onChange={(modules) => setF({ ...f, modules })} />
        <Err e={err} />
      </>}
    </Modal>
  )
}

export function SettingsModal({ which, onClose }: { which: Settings; onClose: () => void }) {
  const { pick } = useLang()
  const title = which === 'accounts' ? 'admin.accounts' : which === 'billing' ? 'admin.billing' : 'admin.pricing'
  const Icon = which === 'accounts' ? Landmark : which === 'billing' ? Settings2 : Tag
  return (
    <Modal title={pick(title)} icon={<Icon className="w-4 h-4" />} onClose={onClose} testid={which === 'accounts' ? 'nctl-accounts' : which === 'billing' ? 'nctl-billing' : 'nctl-prices'}>
      {which === 'accounts' ? <AccountsBody onDone={onClose} /> : which === 'billing' ? <BillingBody onDone={onClose} /> : <PricesBody onDone={onClose} />}
    </Modal>
  )
}

function BillingBody({ onDone }: { onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<BillingOut>(['billing'], '/api/v1/admin/billing')
  const [b, setB] = useState<BillingOut | null>(null)
  useEffect(() => { if (data && !b) setB(JSON.parse(JSON.stringify(data))) }, [data, b])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!b) return <div className="py-6 text-center text-slate-400">…</div>
  const box = 'p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 space-y-2'
  return (
    <div className="space-y-3">
      <p className="text-slate-500">{pick('admin.billingHint')}</p>
      {b.placeholders ? <div className="p-2 rounded-lg bg-amber-50 text-amber-800 font-semibold">{pick('admin.placeholders')}</div> : null}
      <div className={box}>{(['bank_name', 'account_title', 'account_number', 'iban', 'branch'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(k === 'bank_name' ? 'admin.bankName' : k === 'account_title' ? 'admin.accountTitle' : k === 'account_number' ? 'admin.accountNumber' : k === 'iban' ? 'admin.iban' : 'admin.branch')}</label><input value={b.bank[k] ?? ''} onChange={(e) => setB({ ...b, bank: { ...b.bank, [k]: e.target.value } })} className={INPUT} dir="ltr" data-testid={`nctl-bill-${k}`} /></div>)}</div>
      <div className={`${box} grid grid-cols-2 gap-2 space-y-0`}>{(['phone', 'whatsapp'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(k === 'phone' ? 'admin.supportPhone' : 'admin.supportWa')}</label><input value={b.support[k] ?? ''} onChange={(e) => setB({ ...b, support: { ...b.support, [k]: e.target.value } })} className={INPUT} dir="ltr" /></div>)}</div>
      <div className={box}><div className="font-extrabold">{pick('admin.schedule')}</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(['info_days', 'warn_days', 'urgent_days', 'grace_days', 'snooze_hours'] as const).map((k) => <div key={k}><label className="block text-[10px] font-bold text-slate-500 mb-0.5">{pick(k === 'info_days' ? 'admin.infoDays' : k === 'warn_days' ? 'admin.warnDays' : k === 'urgent_days' ? 'admin.urgentDays' : k === 'grace_days' ? 'admin.graceDays' : 'admin.snoozeHours')}</label><input type="number" min={0} value={String(b.schedule[k])} onChange={(e) => setB({ ...b, schedule: { ...b.schedule, [k]: Number(e.target.value) } })} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid={`nctl-bill-${k}`} /></div>)}</div></div>
      <div className={box}>{(['en', 'ur', 'roman'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(`nctl.note.${k}`)}</label><input value={b.note[k] ?? ''} onChange={(e) => setB({ ...b, note: { ...b.note, [k]: e.target.value } })} className={INPUT} dir={k === 'ur' ? 'rtl' : 'ltr'} /></div>)}</div>
      <Err e={err} />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('PUT', '/api/v1/admin/billing', { bank: b.bank, support: b.support, schedule: b.schedule, note: b.note }); await inv('billing'); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className={`w-full py-2.5 rounded-xl font-extrabold cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-bill-save">{pick('common.save')}</button>
    </div>
  )
}

function AccountsBody({ onDone }: { onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<Account[]>(['pay-accounts'], '/api/v1/admin/payment-accounts')
  const [accts, setAccts] = useState<Account[] | null>(null)
  useEffect(() => { if (data && !accts) setAccts(data.map((a) => ({ ...a }))) }, [data, accts])
  const [err, setErr] = useState('')
  const set = (i: number, p: Partial<Account>) => setAccts((xs) => (xs ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-3">
      <p className="text-slate-500">{pick('admin.accountsHint')}</p>
      {(accts ?? []).map((a, i) => (
        <div key={i} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 space-y-2" data-testid="nctl-acct">
          <div className="grid grid-cols-2 gap-2"><input value={a.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} placeholder={pick('admin.acctLabel')} className={`${INPUT} font-bold`} data-testid="nctl-acct-label" /><input value={a.account_name} onChange={(e) => set(i, { account_name: e.target.value })} maxLength={80} placeholder={pick('admin.acctName')} className={INPUT} /></div>
          <input value={a.number} onChange={(e) => set(i, { number: e.target.value })} maxLength={60} placeholder={pick('admin.acctNumber')} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nctl-acct-number" />
          <div className="flex gap-2"><input value={a.note ?? ''} onChange={(e) => set(i, { note: e.target.value || null })} maxLength={120} placeholder={pick('admin.acctNote')} className={INPUT} /><button type="button" onClick={() => setAccts((accts ?? []).filter((_, j) => j !== i))} aria-label={pick('crud.delete')} className="px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>
        </div>
      ))}
      <button type="button" onClick={() => setAccts([...(accts ?? []), { label: '', account_name: '', number: '', note: null }])} className={`${BTN_LIGHT} w-full`} data-testid="nctl-acct-add"><Plus className="w-3.5 h-3.5" />{pick('admin.addAccount')}</button>
      <Err e={err} />
      <button type="button" disabled={!accts || accts.some((a) => !a.label.trim() || a.number.trim().length < 3)} onClick={async () => { setErr(''); try { await api('PUT', '/api/v1/admin/payment-accounts', accts); await inv('pay-accounts', 'billing'); onDone() } catch (e) { setErr(errText(e, ur)) } }} className={`w-full py-2.5 rounded-xl font-extrabold cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-acct-save">{pick('common.save')}</button>
    </div>
  )
}

/** website prices (ADR-092): what the landing page shows and what a shop sees when it pays */
function PricesBody({ onDone }: { onDone: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<Pricing>(['admin-pricing'], '/api/v1/admin/pricing')
  const [p, setP] = useState<Pricing | null>(null)
  useEffect(() => { if (data && !p) setP(JSON.parse(JSON.stringify(data))) }, [data, p])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!p) return <div className="py-6 text-center text-slate-400">…</div>
  const num = (v: number | string | undefined) => Number(v || 0)
  const box = 'p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'
  const Num = ({ label, value, onChange, testid, min = 0, max }: { label: string; value: number | string | undefined; onChange: (v: string) => void; testid?: string; min?: number; max?: number }) => <div><label className={LABEL}>{pick(label)}</label><input type="number" min={min} max={max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid={testid} /></div>
  async function save() {
    if (!p) return
    setBusy(true); setErr('')
    try {
      await api('PUT', '/api/v1/admin/pricing', {
        prices: Object.fromEntries(PAID_PLANS.map((k) => [k, num(p.prices[k])])),
        setup_fee: Object.fromEntries(PAID_PLANS.map((k) => [k, num(p.setup_fee[k])])),
        yearly_paid_months: num(p.yearly_paid_months),
        trial_days: num(p.trial_days),
        module_prices: Object.fromEntries(MODULE_KEYS.map((k) => [k, num(p.module_prices?.[k] ?? 0)])),
        discount_per_year: num(p.discount_per_year ?? 5),
        max_years: num(p.max_years ?? 5),
        sale_pct: num(p.sale_pct ?? 0),
        sale_until: p.sale_until || null,
        addons: p.addons.filter((a) => a.en.trim()).map((a) => ({ ...a, price: num(a.price) })),
      })
      await inv('admin-pricing')
      onDone()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3" data-testid="nctl-prices-body">
      <p className="text-slate-500">{pick('admin.pricingHint')}</p>
      {PAID_PLANS.map((k) => <div key={k} className={`${box} grid grid-cols-2 gap-2`}><div className="col-span-2 font-extrabold uppercase">{pick(`fees.pick.pkg.${k}`)}</div>{Num({ label: 'admin.priceMonth', value: p.prices[k], onChange: (v) => setP({ ...p, prices: { ...p.prices, [k]: v } }), testid: `nctl-price-${k}` })}{Num({ label: 'admin.priceSetup', value: p.setup_fee[k], onChange: (v) => setP({ ...p, setup_fee: { ...p.setup_fee, [k]: v } }) })}</div>)}
      <div className={`${box} grid grid-cols-2 gap-2`}>
        {Num({ label: 'admin.yearMonths', value: p.yearly_paid_months, onChange: (v) => setP({ ...p, yearly_paid_months: v }), min: 1, max: 12 })}
        {Num({ label: 'admin.trialDays', value: p.trial_days, onChange: (v) => setP({ ...p, trial_days: v }), max: 90 })}
        {Num({ label: 'admin.discountYear', value: p.discount_per_year ?? 5, onChange: (v) => setP({ ...p, discount_per_year: v }), max: 15 })}
        {Num({ label: 'admin.maxYears', value: p.max_years ?? 5, onChange: (v) => setP({ ...p, max_years: v }), min: 1, max: 5 })}
        {Num({ label: 'admin.salePct', value: p.sale_pct ?? 0, onChange: (v) => setP({ ...p, sale_pct: v }), max: 90 })}
        <div><label className={LABEL}>{pick('admin.saleUntil')}</label><input type="date" value={p.sale_until ?? ''} onChange={(e) => setP({ ...p, sale_until: e.target.value })} className={INPUT} dir="ltr" /></div>
      </div>
      <div className="font-extrabold">{pick('admin.modulePrices')}</div>
      <div className={`${box} grid grid-cols-2 gap-2`}>{MODULE_KEYS.map((k) => <div key={k}>{Num({ label: `modules.${k}`, value: p.module_prices?.[k] ?? 0, onChange: (v) => setP({ ...p, module_prices: { ...(p.module_prices ?? {}), [k]: v } }) })}</div>)}</div>
      <div className="font-extrabold">{pick('admin.addons')}</div>
      {p.addons.map((a, i) => {
        const set = (patch: Partial<Addon>) => setP({ ...p, addons: p.addons.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
        return (
          <div key={i} className={`${box} grid grid-cols-2 gap-2`}>
            <div className="col-span-2"><label className={LABEL}>{pick('admin.addonEn')}</label><input value={a.en} onChange={(e) => set({ en: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>{pick('admin.addonUr')}</label><input value={a.ur} onChange={(e) => set({ ur: e.target.value })} className={INPUT} dir="rtl" /></div>
            <div><label className={LABEL}>{pick('admin.addonRoman')}</label><input value={a.roman} onChange={(e) => set({ roman: e.target.value })} className={INPUT} /></div>
            {Num({ label: 'admin.addonPrice', value: a.price, onChange: (v) => set({ price: v }) })}
            <div><label className={LABEL}>{pick('admin.addonPer')}</label><select value={a.per} onChange={(e) => set({ per: e.target.value as Addon['per'] })} className={`${INPUT} font-bold`}>{(['month', 'year', 'once'] as const).map((x) => <option key={x} value={x}>{pick(`landing.per.${x}`)}</option>)}</select></div>
            <button type="button" onClick={() => setP({ ...p, addons: p.addons.filter((_, j) => j !== i) })} className="col-span-2 py-1.5 rounded-xl text-rose-600 font-bold flex items-center justify-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />{pick('crud.delete')}</button>
          </div>
        )
      })}
      <button type="button" onClick={() => setP({ ...p, addons: [...p.addons, { en: '', ur: '', roman: '', price: '', per: 'once' }] })} className={`${BTN_LIGHT} w-full border-dashed`}><Plus className="w-3.5 h-3.5" />{pick('admin.addonAdd')}</button>
      <Err e={err} />
      <button type="button" disabled={busy} onClick={() => void save()} className={`w-full py-2.5 rounded-xl font-extrabold cursor-pointer disabled:opacity-40 ${LIME}`} data-testid="nctl-prices-save">{pick('common.save')}</button>
    </div>
  )
}
