/** The control room's shop management in the new product (ADR-134, ADR-115) — the "Manage shops" tab
 *  of `/control/new`. No mock-up draws it, so it is drawn like the purchases list (file 10): the
 *  provider's inbox on top (fee payments to approve, requests for a shop, requests for a password),
 *  the shops with their filters and "+ Open a new shop" on the left, the chosen shop on the right in
 *  sections (enter, owner password, PIN and history, what it trades and its modules, package and fee,
 *  record a payment, renewal code, branch, special price, fees owed, delete), and the provider's own
 *  settings (billing, payment accounts, prices, the app link).
 *
 *  Everything is the live control room's: `/admin/shops`, `/admin/fee-payments`, `/admin/fee-stats`,
 *  `/admin/shop-requests`, `/admin/password-requests`, `/admin/modules`, `/admin/billing`,
 *  `/admin/payment-accounts`, `/admin/shops/{id}/plan|modules|owner-password|payments|renewal-code|
 *  branches|enter`. The live cards for a special price, fees owed, the PIN and its history, the bin,
 *  prices and the app link are used as they are, so no action is lost; they take the live look. */

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock, Check, CheckCircle2, ChevronDown, CreditCard, GitBranch, Image as ImageIcon, KeyRound, LogIn, MessageCircle, Plus, Search, Settings2, Store, Trash2, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { ApiError, api, get } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { fileObjectUrl } from '@/lib/files'
import { isoDay, normalisePhone, withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { useGet, useInvalidate } from '@/lib/queries'
import AdminCredentials from '@/features/admin/AdminCredentials'
import AdminDealCard from '@/features/admin/AdminDealCard'
import AdminPricing from '@/features/admin/AdminPricing'
import AppLinkCard, { APP_LINK, SITE } from '@/features/admin/AppLinkCard'
import FeeCreditCard from '@/features/admin/FeeCreditCard'
import ShopBinCard from '@/features/admin/ShopBinCard'

interface AdminShop { id: string; organisation_id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; branches: number; created_at: string; plan: string; plan_expires_at: string | null; days_left: number | null; monthly_fee: string; fee_note: string | null; plan_status: 'unlimited' | 'ok' | 'due_soon' | 'expired' | 'locked'; modules: string[]; modules_custom: boolean; grace_days?: number | null; fee_due?: string; fee_deal?: { plan: string; price: string; months: number | null; months_left: number | null; note: string | null } | null; deleted_at?: string | null; deleted_reason?: string | null }
interface BillingOut { bank: { bank_name: string; account_title: string; account_number: string; iban: string; branch: string }; support: { phone: string; whatsapp: string }; schedule: { info_days: number; warn_days: number; urgent_days: number; grace_days: number; snooze_hours: number }; note: { en: string; ur: string; roman: string }; qr_path: string | null; placeholders: boolean }
interface Account { label: string; account_name: string; number: string; note: string | null }
interface FeeRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; proof_path: string | null; months: number; note: string | null; status: string; created_at: string; receipt_no?: string | null; fee_due?: string; order?: { plan: string; months: number; years: number; discount_pct: number; total: string; extras: string[] } | null }
interface ShopReq { id: string; name: string; shop_name: string; city: string | null; phone: string; plan: string; note: string | null; created_at: string }
interface PwReq { id: string; shop_id: string; shop_name: string; user_id: string; name: string; phone: string; role: string; created_at: string }
interface ModuleCatalogue { modules: Record<string, { en: string; ur: string }>; plans: Record<string, string[]> }
type Filter = 'all' | 'due' | 'locked' | 'unpaid' | 'bin'
const PLANS = ['trial', 'basic', 'pro', 'chain'] as const
const TRADE = ['mobiles', 'laptops', 'accessories'] as const
const TRADE_KEYS = ['no_mobiles', 'laptops', 'accessories']
const EMPTY = { shop_name: '', city: '', owner_name: '', phone: '', password: '', locale: 'ur' as 'ur' | 'en', plan: 'trial' as (typeof PLANS)[number], modules: null as string[] | null }
const PASSWORD = () => `ms${Math.floor(1000 + Math.random() * 9000)}${Math.floor(100 + Math.random() * 900)}`
const rs = (v: string | number | null | undefined) => withCur(Math.round(Number(v ?? 0)).toLocaleString('en-US'))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const INPUT = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'
const LABEL = 'block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1'
const pill = (on: boolean) => `px-3 py-1.5 rounded-xl text-xs whitespace-nowrap cursor-pointer ${on ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`
const btnDark = 'px-3.5 py-2 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40'
const btnLight = 'px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40'

export function ManageTab() {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [params] = useSearchParams()
  const [sel, setSel] = useState<string | null>(params.get('shop'))
  const [making, setMaking] = useState<Partial<typeof EMPTY> & { request_id?: string } | null>(null)
  const [settings, setSettings] = useState<'billing' | 'accounts' | null>(null)
  const [pwFor, setPwFor] = useState<PwReq | null>(null)
  const [proof, setProof] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<FeeRow | null>(null)
  const [err, setErr] = useState('')
  const qs = q.trim() ? `q=${encodeURIComponent(q.trim())}` : ''
  const { data: shops } = useGet<AdminShop[]>(['admin-shops', q], `/api/v1/admin/shops${qs ? `?${qs}` : ''}`)
  const { data: binned } = useGet<AdminShop[]>(['admin-shops', 'bin', q], `/api/v1/admin/shops?deleted=true${qs ? `&${qs}` : ''}`)
  const { data: fees } = useGet<FeeRow[]>(['fee-pending'], '/api/v1/admin/fee-payments?status=pending')
  const { data: feeStats } = useGet<{ pending: number; month_total: string }>(['fee-stats'], '/api/v1/admin/fee-stats')
  const { data: shopReqs } = useGet<ShopReq[]>(['shop-requests'], '/api/v1/admin/shop-requests?open_only=true')
  const { data: pwReqs } = useGet<PwReq[]>(['pw-requests'], '/api/v1/admin/password-requests?open_only=true')
  const { data: billing } = useGet<BillingOut>(['billing'], '/api/v1/admin/billing')
  const owes = (s: AdminShop) => Number(s.fee_due ?? 0) > 0
  const isDue = (s: AdminShop) => s.plan_status === 'due_soon' || s.plan_status === 'expired'
  const list = filter === 'bin' ? binned ?? [] : (shops ?? []).filter((s) => filter === 'all' || (filter === 'unpaid' ? owes(s) : filter === 'due' ? isDue(s) : s.plan_status === 'locked'))
  const cur = [...(shops ?? []), ...(binned ?? [])].find((s) => s.id === sel) ?? list[0] ?? null
  const counts: Record<Filter, number> = { all: shops?.length ?? 0, due: (shops ?? []).filter(isDue).length, locked: (shops ?? []).filter((s) => s.plan_status === 'locked').length, unpaid: (shops ?? []).filter(owes).length, bin: binned?.length ?? 0 }

  async function decide(f: FeeRow, action: 'approve' | 'reject', body: Record<string, unknown> = {}) {
    setErr('')
    try { await api('POST', `/api/v1/admin/fee-payments/${f.id}/${action}`, body); await inv('fee-pending', 'fee-stats', 'admin-shops', 'prov-overview', 'prov-shops', 'prov-pays') } catch (e) { setErr(errText(e, ur)) }
  }

  return (
    <div className="space-y-4" data-testid="nctl-manage">
      {/* the provider's inbox */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3" data-testid="nctl-fees">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /><h2 className="font-display font-extrabold text-sm">{pick('admin.feesTitle')}</h2></div><span className="text-[11px] text-slate-500">{pick('admin.thisMonth')} <b dir="ltr">{rs(feeStats?.month_total)}</b> · {pick('admin.pendingN').replace('{{n}}', String(feeStats?.pending ?? 0))}</span></div>
          {!fees?.length ? <p className="text-xs text-slate-400">{pick('admin.noFees')}</p> : fees.map((f) => (
            <div key={f.id} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 space-y-2" data-testid="nctl-fee">
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-sm font-bold truncate" dir="auto">{f.shop_name}</div><div className="text-[11px] text-slate-500" dir="ltr">{f.method}{f.reference ? ` · ${f.reference}` : ''} · {f.months} {pick(f.months === 1 ? 'admin.month' : 'admin.months')} · {fmtDate(f.created_at)}</div></div><span className="font-display font-extrabold" dir="ltr">{rs(f.amount)}</span></div>
              {f.note ? <p className="text-[11px] text-slate-500" dir="auto">{f.note}</p> : null}
              {f.order ? <div className="text-[11px] p-2 rounded-lg bg-white dark:bg-obsidian-900 space-y-0.5"><div>{pick('admin.order.pkg')}: <b>{pick(`fees.pick.pkg.${f.order.plan}`)}</b>{f.order.extras.map((k) => ` + ${pick(`modules.${k}`)}`).join('')} · {f.order.years ? pick(f.order.years === 1 ? 'fees.pick.year' : 'fees.pick.years').replace('{{n}}', String(f.order.years)) : pick('fees.pick.month1')}{f.order.discount_pct ? ` · ${pick('fees.pick.off').replace('{{n}}', String(f.order.discount_pct))}` : ''}</div><div>{pick('admin.order.total')}: <b dir="ltr">{rs(f.order.total)}</b></div>{Number(f.amount) < Number(f.order.total) + Number(f.fee_due ?? 0) ? <div className="text-rose-600 font-bold">{pick('admin.order.short')}</div> : null}</div> : null}
              {Number(f.fee_due ?? 0) > 0 ? <div className="text-[11px] p-2 rounded-lg bg-rose-50 text-rose-700 font-semibold">{pick('admin.credit.clearsFirst').replace('{{n}}', rs(f.fee_due))}</div> : null}
              <div className="flex flex-wrap gap-1.5">
                {f.proof_path ? <button type="button" onClick={async () => setProof(await fileObjectUrl(f.proof_path!, f.shop_id))} className={btnLight}><ImageIcon className="w-3.5 h-3.5" />{pick('admin.proof')}</button> : null}
                <button type="button" onClick={() => void decide(f, 'approve')} className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer" data-testid="nctl-fee-approve"><Check className="w-3.5 h-3.5" />{pick('admin.approveMonths').replace('{{n}}', String(f.months))}</button>
                <button type="button" onClick={() => setRejecting(f)} className={`${btnLight} text-rose-600`} data-testid="nctl-fee-reject"><X className="w-3.5 h-3.5" />{pick('admin.reject')}</button>
                {f.order ? <button type="button" onClick={() => void decide(f, 'approve', { apply_order: false })} className={btnLight}>{pick('admin.order.moneyOnly')}</button> : null}
              </div>
            </div>
          ))}
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </section>
        <section className="rounded-2xl bg-obsidian-900 text-white p-4 space-y-3" data-testid="nctl-requests">
          <div className="flex items-center gap-2"><Store className="w-4 h-4 text-[#B4F000]" /><h2 className="font-display font-extrabold text-sm">{pick('admin.shopRequests')}</h2></div>
          {!shopReqs?.length ? <p className="text-[11px] text-slate-400">{pick('prov.none')}</p> : shopReqs.map((r) => (
            <div key={r.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5" data-testid="nctl-shopreq">
              <div className="text-xs font-bold" dir="auto">{r.shop_name}{r.city ? <span className="font-normal text-slate-400"> · {r.city}</span> : null}</div>
              <div className="text-[10px] text-slate-400" dir="ltr">{r.name} · {r.phone} · {r.plan} · {fmtDate(r.created_at)}</div>
              {r.note ? <div className="text-[10px] text-slate-400" dir="auto">{r.note}</div> : null}
              <div className="flex gap-1.5"><button type="button" onClick={() => setMaking({ shop_name: r.shop_name, city: r.city ?? '', owner_name: r.name, phone: r.phone, plan: (PLANS as readonly string[]).includes(r.plan) ? (r.plan as (typeof PLANS)[number]) : 'trial', password: PASSWORD(), request_id: r.id })} className="flex-1 py-1.5 rounded-lg bg-[#B4F000] text-slate-950 text-[11px] font-extrabold cursor-pointer" data-testid="nctl-shopreq-open">{pick('admin.newShop')}</button><a href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center" aria-label="WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a><button type="button" onClick={async () => { await api('POST', `/api/v1/admin/shop-requests/${r.id}/done`); await inv('shop-requests') }} aria-label={pick('admin.markDone')} className="px-2.5 py-1.5 rounded-lg bg-white/10 cursor-pointer"><Check className="w-3.5 h-3.5" /></button></div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 border-t border-white/10"><KeyRound className="w-4 h-4 text-amber-300" /><h2 className="font-display font-extrabold text-sm">{pick('admin.pwRequests')}</h2></div>
          {!pwReqs?.length ? <p className="text-[11px] text-slate-400">{pick('prov.none')}</p> : pwReqs.map((r) => (
            <div key={r.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2" data-testid="nctl-pwreq">
              <div className="min-w-0"><div className="text-xs font-bold truncate" dir="auto">{r.name} · {r.shop_name}</div><div className="text-[10px] text-slate-400" dir="ltr">{r.phone} · {fmtDate(r.created_at)}</div></div>
              <div className="flex gap-1.5 shrink-0"><button type="button" onClick={() => { setSel(r.shop_id); setFilter('all'); setPwFor(r) }} className="px-2.5 py-1.5 rounded-lg bg-[#B4F000] text-slate-950 text-[11px] font-extrabold cursor-pointer">{pick('admin.setPassword')}</button><button type="button" onClick={async () => { await api('POST', `/api/v1/admin/password-requests/${r.id}/done`); await inv('pw-requests') }} aria-label={pick('admin.markDone')} className="px-2 py-1.5 rounded-lg bg-white/10 cursor-pointer"><Check className="w-3.5 h-3.5" /></button></div>
            </div>
          ))}
        </section>
      </div>

      {/* the provider's own settings */}
      <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center gap-2" data-testid="nctl-settings">
        <Settings2 className="w-4 h-4 text-slate-500" /><span className="text-xs font-extrabold me-2">{pick('nctl.settings')}</span>
        <button type="button" onClick={() => setSettings('billing')} className={`${btnLight} ${billing?.placeholders ? 'bg-rose-50 border-rose-200 text-rose-700' : ''}`} data-testid="nctl-billing-open">{pick('admin.billing')}</button>
        <button type="button" onClick={() => setSettings('accounts')} className={btnLight} data-testid="nctl-accounts-open">{pick('admin.accounts')}</button>
        <AdminPricing />
        <div className="w-full"><AppLinkCard /></div>
      </section>

      {/* the shops */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3">
          <div className="flex gap-2"><div className="relative flex-1"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl.shopSearch')} className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nctl-m-q" /></div><button type="button" onClick={() => setMaking({ ...EMPTY, password: PASSWORD() })} className="px-3.5 py-2 rounded-xl bg-[#B4F000] text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nctl-new-shop"><Plus className="w-4 h-4" />{pick('admin.newShop')}</button></div>
          <div className="flex flex-wrap gap-1.5">{([['all', 'common.all'], ['due', 'admin.feesDue'], ['locked', 'admin.locked'], ['unpaid', 'admin.credit.filter'], ['bin', 'admin.bin.filter']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={pill(filter === k)} data-testid={`nctl-f-${k}`}>{pick(l)} <span className="font-mono" dir="ltr">{counts[k]}</span></button>)}</div>
          <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto" data-testid="nctl-m-shops">
            {!list.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-500">{pick('admin.none')}</div> : list.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSel(s.id); setPwFor(null) }} className={`w-full p-3 rounded-2xl bg-white dark:bg-obsidian-900 text-start cursor-pointer ${cur?.id === s.id ? 'border-2 border-obsidian-900 dark:border-[#B4F000] shadow-md' : 'border border-slate-200 dark:border-slate-800 hover:border-slate-400'}`} data-testid="nctl-m-shop">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold truncate" dir="auto">{s.name}{s.city ? <span className="font-normal text-slate-500"> · {s.city}</span> : null}</span><PlanChip s={s} /></div>
                <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-500"><span className="truncate" dir="ltr">{s.owner_name} · {s.owner_phone}{s.branches > 1 ? ` · ${s.branches} ${pick('admin.branches')}` : ''}</span><span className="shrink-0">{Number(s.monthly_fee) ? <span dir="ltr">{rs(s.monthly_fee)}/{pick('admin.month')}</span> : pick('admin.noFee')}</span></div>
                {owes(s) ? <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">{pick('admin.credit.chip')} <span dir="ltr">{rs(s.fee_due)}</span></span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="lg:col-span-7">{cur ? <ShopPanel key={cur.id} shop={cur} pwFor={pwFor?.shop_id === cur.id ? pwFor : null} clearPwFor={() => setPwFor(null)} /> : null}</div>
      </div>

      {making ? <NewShopDrawer init={making} onClose={() => setMaking(null)} onMade={(s) => { setSel(s.id); setFilter('all') }} /> : null}
      {settings === 'billing' && billing ? <BillingDrawer billing={billing} onClose={() => setSettings(null)} /> : null}
      {settings === 'accounts' ? <AccountsDrawer onClose={() => setSettings(null)} /> : null}
      {proof ? <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setProof(null)} role="presentation"><img src={proof} alt="" className="max-h-[85vh] max-w-full rounded-2xl" /></div> : null}
      {rejecting ? <Reason title="admin.reject" hint="admin.rejectWhy" onClose={() => setRejecting(null)} onDone={async (why) => { await decide(rejecting, 'reject', { note: why }); setRejecting(null) }} /> : null}
    </div>
  )
}

function PlanChip({ s }: { s: AdminShop }) {
  const { pick } = useLang()
  const tone = s.plan_status === 'locked' || s.plan_status === 'expired' ? 'bg-rose-100 text-rose-700' : s.plan_status === 'due_soon' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
  const text = s.plan_status === 'unlimited' ? pick('admin.unlimited') : s.plan_status === 'locked' ? pick('admin.locked') : s.days_left != null && s.days_left < 0 ? pick('admin.expiredDays').replace('{{n}}', String(-s.days_left)) : pick('admin.daysLeft').replace('{{n}}', String(s.days_left ?? 0))
  return <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${tone}`} data-testid="nctl-plan-chip">{s.plan} · {text}</span>
}

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
    <div className="space-y-2.5">
      <div><div className={LABEL}>{pick('admin.trade.title')}</div><div className="grid grid-cols-3 gap-1.5" data-testid="nctl-trade">{TRADE.map((l) => <label key={l} className={`p-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer border-2 ${on[l] ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}><input type="checkbox" checked={on[l]} disabled={on[l] && lines === 1} onChange={() => toggleLine(l)} className="w-4 h-4 accent-emerald-600" data-testid={`nctl-trade-${l}`} />{pick(`pkg.line.${l}`)}</label>)}</div></div>
      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : [...defaults])} className="w-4 h-4 accent-emerald-600" data-testid="nctl-follow-plan" />{pick('admin.followPlan').replace('{{plan}}', plan)}</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">{Object.entries(catalogue.modules).filter(([k]) => !TRADE_KEYS.includes(k)).map(([k, names]) => <label key={k} className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 bg-slate-50 dark:bg-obsidian-850 ${value === null ? 'opacity-60' : 'cursor-pointer'}`}><input type="checkbox" disabled={value === null} checked={shown.includes(k)} onChange={() => toggle(k)} className="w-3.5 h-3.5 accent-emerald-600" data-testid={`nctl-mod-${k}`} />{ur ? names.ur : names.en}</label>)}</div>
    </div>
  )
}

function Section({ title, open, onToggle, children, testid }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; testid: string }) {
  const { pick } = useLang()
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800" data-testid={testid}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-extrabold cursor-pointer" data-testid={`${testid}-open`}>{pick(title)}<ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
      {open ? <div className="px-3.5 pb-3.5 space-y-2.5">{children}</div> : null}
    </div>
  )
}

function ShopPanel({ shop: initial, pwFor, clearPwFor }: { shop: AdminShop; pwFor: PwReq | null; clearPwFor: () => void }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const setActiveShop = useAuth((s) => s.setActiveShop)
  const setMe = useAuth((s) => s.setMe)
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], '/api/v1/admin/modules')
  const [s, setS] = useState(initial)
  useEffect(() => setS(initial), [initial])
  const [open, setOpen] = useState<string | null>(pwFor ? 'pw' : 'plan')
  useEffect(() => { if (pwFor) setOpen('pw') }, [pwFor])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')
  const [pwDone, setPwDone] = useState<{ name: string; phone: string; password: string } | null>(null)
  const [mods, setMods] = useState<string[] | null>(initial.modules_custom ? initial.modules : null)
  const [plan, setPlan] = useState({ plan: initial.plan, monthly_fee: Number(initial.monthly_fee) ? String(Number(initial.monthly_fee)) : '', expires_on: initial.plan_expires_at ? initial.plan_expires_at.slice(0, 10) : '', note: initial.fee_note ?? '' })
  const [grace, setGrace] = useState(initial.grace_days == null ? '' : String(initial.grace_days))
  const [pay, setPay] = useState({ amount: Number(initial.monthly_fee) ? String(Number(initial.monthly_fee)) : '', method: 'cash', months: '1', reference: '', paid_on: isoDay(0) })
  const [receipt, setReceipt] = useState<string | null>(null)
  // a fee set just now fills an empty payment amount
  useEffect(() => { if (Number(s.monthly_fee)) setPay((p) => (p.amount ? p : { ...p, amount: String(Number(s.monthly_fee)) })) }, [s.monthly_fee])
  const [codeMonths, setCodeMonths] = useState('1')
  const [code, setCode] = useState<string | null>(null)
  const [branch, setBranch] = useState({ name: '', city: '' })
  const tog = (k: string) => setOpen(open === k ? null : k)
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); await inv('admin-shops', 'fee-stats', 'prov-shops', 'prov-overview') } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }
  const savePlan = (body: Record<string, unknown>) => run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/plan`, body); setS(r); setPlan((p) => ({ ...p, expires_on: r.plan_expires_at ? r.plan_expires_at.slice(0, 10) : '' })) })
  const enter = async () => { await api('POST', `/api/v1/admin/shops/${s.id}/enter`); setActiveShop(s.id); setMe(await get<MeOut>('/api/v1/me')); nav('/new') }
  const refreshed = async () => { const rows = await get<AdminShop[]>('/api/v1/admin/shops'); const r = rows.find((x) => x.id === s.id); if (r) setS(r) }

  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 lg:sticky lg:top-20" data-testid="nctl-m-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-display font-extrabold text-lg" dir="auto">{s.name}</h2><div className="text-[11px] text-slate-500" dir="ltr">{s.owner_name} · {s.owner_phone} · {s.users} {pick('admin.users')}</div><div className="mt-1 flex items-center gap-2"><PlanChip s={s} />{s.plan_expires_at ? <span className="text-[11px] text-slate-500">{pick('admin.expires')} <span dir="ltr">{fmtDate(s.plan_expires_at)}</span></span> : null}</div></div>
        {!s.deleted_at ? <button type="button" onClick={() => void enter()} className={btnDark} data-testid="nctl-enter"><LogIn className="w-3.5 h-3.5" />{pick('admin.openShop')}</button> : null}
      </div>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      {s.deleted_at ? <div className="live-card"><ShopBinCard shop={s} onSaved={(r) => setS(r)} /></div> : (
        <div className="space-y-2">
          <Section title="admin.planTitle" open={open === 'plan'} onToggle={() => tog('plan')} testid="nctl-sec-plan">
            <div className="flex flex-wrap gap-1">{PLANS.map((p) => <button key={p} type="button" onClick={() => setPlan({ ...plan, plan: p })} aria-pressed={plan.plan === p} className={`${pill(plan.plan === p)} capitalize`} data-testid={`nctl-plan-${p}`}>{p}</button>)}</div>
            <div className="grid grid-cols-2 gap-2"><div><label className={LABEL}>{pick('admin.monthlyFee')}</label><input type="number" min={0} value={plan.monthly_fee} onChange={(e) => setPlan({ ...plan, monthly_fee: e.target.value })} className={`${INPUT} font-mono`} dir="ltr" data-testid="nctl-fee-input" /></div><div><label className={LABEL}>{pick('admin.expiresOn')}</label><input type="date" value={plan.expires_on} onChange={(e) => setPlan({ ...plan, expires_on: e.target.value })} className={INPUT} dir="ltr" /></div></div>
            <div><label className={LABEL}>{pick('admin.feeNote')}</label><input value={plan.note} onChange={(e) => setPlan({ ...plan, note: e.target.value })} maxLength={200} className={INPUT} dir="auto" /></div>
            <div className="grid grid-cols-3 gap-1.5">{[1, 3, 12].map((m) => <button key={m} type="button" disabled={busy} onClick={() => void savePlan({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note, extend_months: m })} className="py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer" data-testid={`nctl-extend-${m}`}><CalendarClock className="w-3.5 h-3.5" />+{m} {pick(m === 1 ? 'admin.month' : 'admin.months')}</button>)}</div>
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void savePlan({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note, expires_on: plan.expires_on || null, clear_expiry: !plan.expires_on })} className={btnDark} data-testid="nctl-save-plan">{pick('admin.savePlan')}</button><button type="button" disabled={busy} onClick={() => void savePlan({ clear_expiry: true })} className={btnLight}>{pick('admin.unlimited')}</button></div>
            <div className="flex items-end gap-2"><div className="flex-1"><label className={LABEL}>{pick('admin.shopGrace')}</label><input type="number" min={0} max={90} value={grace} onChange={(e) => setGrace(e.target.value)} className={`${INPUT} font-mono`} dir="ltr" /></div><button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/plan`, { set_grace: true, grace_days: grace === '' ? null : Number(grace) }); setS({ ...r, grace_days: grace === '' ? null : Number(grace) }) })} className={btnLight}>{pick('common.save')}</button></div>
          </Section>
          <Section title="admin.modulesTitle" open={open === 'mods'} onToggle={() => tog('mods')} testid="nctl-sec-mods">
            <ModulesBox catalogue={catalogue} plan={plan.plan} value={mods} onChange={setMods} />
            <button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<AdminShop>('PATCH', `/api/v1/admin/shops/${s.id}/modules`, { modules: mods }); setS(r) })} className={`${btnDark} w-full`} data-testid="nctl-save-mods">{pick('admin.saveModules')}</button>
          </Section>
          <Section title="admin.recordPayment" open={open === 'pay'} onToggle={() => tog('pay')} testid="nctl-sec-pay">
            <p className="text-[11px] text-slate-500">{pick('admin.recordHint')}</p>
            <div className="grid grid-cols-2 gap-2"><div><label className={LABEL}>{pick('fees.amount')}</label><input type="number" min={1} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className={`${INPUT} font-mono`} dir="ltr" data-testid="nctl-pay-amount" /></div><div><label className={LABEL}>{pick('fees.months')}</label><input type="number" min={0} max={36} value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value })} className={`${INPUT} font-mono`} dir="ltr" /></div><div><label className={LABEL}>{pick('fees.method')}</label><input value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className={INPUT} /></div><div><label className={LABEL}>{pick('admin.paidOn')}</label><input type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} className={INPUT} dir="ltr" /></div></div>
            <div><label className={LABEL}>{pick('fees.reference')}</label><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className={INPUT} dir="ltr" /></div>
            {Number(s.fee_due ?? 0) > 0 ? <div className="text-[11px] p-2 rounded-lg bg-rose-50 text-rose-700 font-semibold">{pick('admin.credit.clearsFirst').replace('{{n}}', rs(s.fee_due))}</div> : null}
            {receipt ? <div className="text-[11px] p-2 rounded-lg bg-emerald-50 text-emerald-700 font-bold" data-testid="nctl-receipt">{pick('admin.receipt')} <span dir="ltr">{receipt}</span></div> : null}
            <button type="button" disabled={busy || !Number(pay.amount)} onClick={() => void run(async () => { const r = await api<FeeRow>('POST', `/api/v1/admin/shops/${s.id}/payments`, { amount: Number(pay.amount), method: pay.method, months: pay.months === '' ? 1 : Number(pay.months), reference: pay.reference || null, paid_on: pay.paid_on || null }); setReceipt(r.receipt_no ?? ''); await refreshed() })} className={`${btnDark} w-full`} data-testid="nctl-record"><CreditCard className="w-3.5 h-3.5" />{pick('admin.recordPayment')}</button>
          </Section>
          <Section title="admin.ownerPassword" open={open === 'pw'} onToggle={() => tog('pw')} testid="nctl-sec-pw">
            {pwFor ? <div className="p-2 rounded-lg bg-slate-50 dark:bg-obsidian-850 text-[11px] flex flex-wrap items-center gap-2" data-testid="nctl-pw-for"><span className="text-slate-500">{pick('admin.pwFor')}</span><b>{pwFor.name}</b><span dir="ltr">{pwFor.phone}</span><span className="px-1.5 rounded bg-white dark:bg-obsidian-900">{pick(`staff.roles.${pwFor.role}`)}</span><button type="button" onClick={clearPwFor} className="ms-auto text-emerald-700 font-bold underline cursor-pointer">{pick('admin.pwForOwner')}</button></div> : null}
            <div className="flex gap-2"><input value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} placeholder={pick('admin.password')} className={INPUT} data-testid="nctl-pw" /><button type="button" disabled={busy || pw.length < 6} onClick={() => void run(async () => { const r = await api<{ name: string; phone: string }>('POST', `/api/v1/admin/shops/${s.id}/owner-password`, { password: pw, user_id: pwFor?.user_id }); setPwDone({ ...r, password: pw }); setPw('') })} className={btnDark} data-testid="nctl-pw-save">{pick('common.save')}</button></div>
            {pwDone ? <div className="p-2.5 rounded-xl bg-[#B4F000] text-slate-950 space-y-1.5" data-testid="nctl-pw-done"><div className="text-xs font-extrabold">{pick('admin.pwSet')}</div><div className="font-mono text-xs" dir="ltr">{pwDone.phone} · {pwDone.password}</div><a href={`https://wa.me/${waNumber(pwDone.phone)}?text=${encodeURIComponent(`${s.name}\nMobile Shop\nLogin: ${pwDone.phone}\nNew password: ${pwDone.password}\n${SITE}`)}`} target="_blank" rel="noopener noreferrer" className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{pick('admin.sendWhatsapp')}</a></div> : null}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800"><div className={LABEL}>{pick('cred.adminPin')}</div><div className="live-card"><AdminCredentials shopId={s.id} userId={pwFor?.user_id} /></div></div>
          </Section>
          <Section title="admin.renewalCode" open={open === 'code'} onToggle={() => tog('code')} testid="nctl-sec-code">
            <p className="text-[11px] text-slate-500">{pick('admin.renewalHint')}</p>
            <div className="flex gap-2"><input type="number" min={1} max={36} value={codeMonths} onChange={(e) => setCodeMonths(e.target.value)} className={`${INPUT} font-mono w-24`} dir="ltr" /><button type="button" disabled={busy} onClick={() => void run(async () => { const r = await api<{ code: string }>('POST', `/api/v1/admin/shops/${s.id}/renewal-code`, { months: Number(codeMonths) || 1 }); setCode(r.code) })} className={`${btnDark} flex-1`} data-testid="nctl-code">{pick('admin.renewalCode')}</button></div>
            {code ? <div className="p-2.5 rounded-xl bg-[#B4F000] text-slate-950 space-y-1.5"><div className="text-xs font-extrabold">{pick('admin.codeMade')}</div><div className="font-mono text-[10px] break-all" dir="ltr" data-testid="nctl-code-out">{code}</div><a href={`https://wa.me/${waNumber(s.owner_phone ?? '')}?text=${encodeURIComponent(`${s.name}\nMobile Shop renewal code (${codeMonths} month):\n${code}\nMore → Software fees → Renewal code`)}`} target="_blank" rel="noopener noreferrer" className="py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{pick('admin.sendCode')}</a></div> : null}
          </Section>
          <Section title="admin.addBranch" open={open === 'branch'} onToggle={() => tog('branch')} testid="nctl-sec-branch">
            <p className="text-[11px] text-slate-500">{pick('admin.branchHint')}</p>
            <div className="grid grid-cols-2 gap-2"><input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} placeholder={pick('auth.shopName')} className={INPUT} data-testid="nctl-branch-name" /><input value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} placeholder={pick('auth.city')} className={INPUT} /></div>
            <button type="button" disabled={busy || branch.name.trim().length < 2} onClick={() => void run(async () => { const r = await api<AdminShop>('POST', `/api/v1/admin/shops/${s.id}/branches`, { name: branch.name, city: branch.city || null }); setS(r); setBranch({ name: '', city: '' }) })} className={`${btnDark} w-full`} data-testid="nctl-branch-save"><GitBranch className="w-3.5 h-3.5" />{pick('admin.addBranch')}</button>
          </Section>
          <Section title="nctl.more" open={open === 'more'} onToggle={() => tog('more')} testid="nctl-sec-more">
            <div className="live-card space-y-3"><AdminDealCard shop={s} onSaved={(r) => setS(r)} /><FeeCreditCard shop={s} onSaved={(r) => setS(r)} /><ShopBinCard shop={s} onSaved={(r) => setS(r)} /></div>
          </Section>
        </div>
      )}
    </section>
  )
}

function NewShopDrawer({ init, onClose, onMade }: { init: Partial<typeof EMPTY> & { request_id?: string }; onClose: () => void; onMade: (s: AdminShop) => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], '/api/v1/admin/modules')
  const [f, setF] = useState({ ...EMPTY, ...init })
  const [made, setMade] = useState<{ shop: AdminShop; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = f.shop_name.trim().length >= 2 && f.owner_name.trim().length >= 2 && isMobileOk(f.phone) && f.password.length >= 6
  const share = made ? `https://wa.me/${waNumber(made.shop.owner_phone ?? '')}?text=${encodeURIComponent(`${made.shop.name}\nMobile Shop app\nLogin: ${made.shop.owner_phone}\nPassword: ${made.password}\n${SITE}\nAndroid app: ${APP_LINK}`)}` : ''
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="nctl-new-drawer">
      <div className="w-full max-w-lg h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick(made ? 'admin.created' : 'admin.newShop')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        {made ? (
          <div className="p-5 space-y-3" data-testid="nctl-made">
            <div className="p-5 rounded-2xl bg-[#B4F000] text-slate-950 text-center space-y-1"><CheckCircle2 className="w-8 h-8 mx-auto" /><div className="font-display font-extrabold" dir="auto">{made.shop.name}</div></div>
            <div className="text-xs font-extrabold">{pick('admin.giveDetails')}</div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 font-mono text-sm space-y-1" dir="ltr"><div>{made.shop.owner_phone}</div><div data-testid="nctl-made-pw">{made.password}</div></div>
            <a href={share} target="_blank" rel="noopener noreferrer" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"><MessageCircle className="w-4 h-4" />{pick('admin.sendWhatsapp')}</a>
            <button type="button" onClick={() => { setMade(null); setF({ ...EMPTY, password: PASSWORD() }) }} className={`${btnLight} w-full`}><Plus className="w-3.5 h-3.5" />{pick('admin.another')}</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2"><div><label className={LABEL}>{pick('auth.shopName')}</label><input value={f.shop_name} onChange={(e) => setF({ ...f, shop_name: e.target.value })} className={INPUT} dir="auto" data-testid="nctl-n-shop" /></div><div><label className={LABEL}>{pick('auth.city')}</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={INPUT} dir="auto" /></div></div>
              <div><label className={LABEL}>{pick('admin.ownerName')}</label><input value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} className={INPUT} dir="auto" data-testid="nctl-n-owner" /></div>
              <div className="nctl-phone"><PhoneInput label="admin.ownerPhone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} /></div>
              <div><label className={LABEL}>{pick('admin.password')}</label><div className="flex gap-2"><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} className={`${INPUT} font-mono`} dir="ltr" data-testid="nctl-n-pw" /><button type="button" onClick={() => setF({ ...f, password: PASSWORD() })} className={btnLight}>{pick('nctl.newPw')}</button></div></div>
              <div><label className={LABEL}>{pick('admin.language')}</label><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['ur', 'en'] as const).map((l) => <button key={l} type="button" onClick={() => setF({ ...f, locale: l })} aria-pressed={f.locale === l} className={`py-1.5 rounded-lg text-xs cursor-pointer ${f.locale === l ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold text-slate-600'}`}>{l === 'ur' ? 'اردو' : 'English'}</button>)}</div></div>
              <div><label className={LABEL}>{pick('admin.planTitle')}</label><div className="flex flex-wrap gap-1">{PLANS.map((p) => <button key={p} type="button" onClick={() => setF({ ...f, plan: p, modules: null })} aria-pressed={f.plan === p} className={`${pill(f.plan === p)} capitalize`}>{p}</button>)}</div></div>
              <ModulesBox catalogue={catalogue} plan={f.plan} value={f.modules} onChange={(modules) => setF({ ...f, modules })} />
              {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800"><button type="button" disabled={busy || !ok} onClick={async () => { setBusy(true); setErr(''); try { const { request_id, ...rest } = f as typeof f & { request_id?: string }; const shop = await api<AdminShop>('POST', '/api/v1/admin/shops', { ...rest, city: rest.city || null, phone: normalisePhone(rest.phone), request_id: init.request_id ?? request_id ?? null }); await inv('admin-shops', 'shop-requests', 'prov-shops', 'prov-overview'); setMade({ shop, password: f.password }); onMade(shop) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="w-full py-3 rounded-xl bg-[#B4F000] text-slate-950 text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40" data-testid="nctl-n-save"><Store className="w-4 h-4" />{pick('admin.newShop')}</button></div>
          </>
        )}
      </div>
    </div>
  )
}

function BillingDrawer({ billing, onClose }: { billing: BillingOut; onClose: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [b, setB] = useState<BillingOut>(() => JSON.parse(JSON.stringify(billing)))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Drawer title="admin.billing" onClose={onClose} testid="nctl-billing">
      <p className="text-[11px] text-slate-500">{pick('admin.billingHint')}</p>
      {b.placeholders ? <div className="p-2 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-semibold">{pick('admin.placeholders')}</div> : null}
      {(['bank_name', 'account_title', 'account_number', 'iban', 'branch'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(k === 'bank_name' ? 'admin.bankName' : k === 'account_title' ? 'admin.accountTitle' : k === 'account_number' ? 'admin.accountNumber' : k === 'iban' ? 'admin.iban' : 'admin.branch')}</label><input value={b.bank[k] ?? ''} onChange={(e) => setB({ ...b, bank: { ...b.bank, [k]: e.target.value } })} className={INPUT} dir="ltr" data-testid={`nctl-bill-${k}`} /></div>)}
      <div className="grid grid-cols-2 gap-2">{(['phone', 'whatsapp'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(k === 'phone' ? 'admin.supportPhone' : 'admin.supportWa')}</label><input value={b.support[k] ?? ''} onChange={(e) => setB({ ...b, support: { ...b.support, [k]: e.target.value } })} className={INPUT} dir="ltr" /></div>)}</div>
      <div className={LABEL}>{pick('admin.schedule')}</div>
      <div className="grid grid-cols-3 gap-2">{(['info_days', 'warn_days', 'urgent_days', 'grace_days', 'snooze_hours'] as const).map((k) => <div key={k}><label className="block text-[10px] font-bold text-slate-500 mb-0.5">{pick(k === 'info_days' ? 'admin.infoDays' : k === 'warn_days' ? 'admin.warnDays' : k === 'urgent_days' ? 'admin.urgentDays' : k === 'grace_days' ? 'admin.graceDays' : 'admin.snoozeHours')}</label><input type="number" min={0} value={String(b.schedule[k])} onChange={(e) => setB({ ...b, schedule: { ...b.schedule, [k]: Number(e.target.value) } })} className={`${INPUT} font-mono`} dir="ltr" /></div>)}</div>
      {(['en', 'ur', 'roman'] as const).map((k) => <div key={k}><label className={LABEL}>{pick(`nctl.note.${k}`)}</label><input value={b.note[k] ?? ''} onChange={(e) => setB({ ...b, note: { ...b.note, [k]: e.target.value } })} className={INPUT} dir={k === 'ur' ? 'rtl' : 'ltr'} /></div>)}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('PUT', '/api/v1/admin/billing', { bank: b.bank, support: b.support, schedule: b.schedule, note: b.note }); await inv('billing'); onClose() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className={`${btnDark} w-full`} data-testid="nctl-bill-save">{pick('common.save')}</button>
    </Drawer>
  )
}

function AccountsDrawer({ onClose }: { onClose: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<Account[]>(['pay-accounts'], '/api/v1/admin/payment-accounts')
  const [accts, setAccts] = useState<Account[] | null>(null)
  useEffect(() => { if (data && !accts) setAccts(data.map((a) => ({ ...a }))) }, [data, accts])
  const [err, setErr] = useState('')
  const set = (i: number, p: Partial<Account>) => setAccts((xs) => (xs ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <Drawer title="admin.accounts" onClose={onClose} testid="nctl-accounts">
      <p className="text-[11px] text-slate-500">{pick('admin.accountsHint')}</p>
      {(accts ?? []).map((a, i) => (
        <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 space-y-2" data-testid="nctl-acct">
          <div className="grid grid-cols-2 gap-2"><input value={a.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} placeholder={pick('admin.acctLabel')} className={INPUT} data-testid="nctl-acct-label" /><input value={a.account_name} onChange={(e) => set(i, { account_name: e.target.value })} maxLength={80} placeholder={pick('admin.acctName')} className={INPUT} /></div>
          <input value={a.number} onChange={(e) => set(i, { number: e.target.value })} maxLength={60} placeholder={pick('admin.acctNumber')} className={`${INPUT} font-mono`} dir="ltr" data-testid="nctl-acct-number" />
          <div className="flex gap-2"><input value={a.note ?? ''} onChange={(e) => set(i, { note: e.target.value || null })} maxLength={120} placeholder={pick('admin.acctNote')} className={INPUT} /><button type="button" onClick={() => setAccts((accts ?? []).filter((_, j) => j !== i))} aria-label={pick('crud.delete')} className="px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>
        </div>
      ))}
      <button type="button" onClick={() => setAccts([...(accts ?? []), { label: '', account_name: '', number: '', note: null }])} className={`${btnLight} w-full`} data-testid="nctl-acct-add"><Plus className="w-3.5 h-3.5" />{pick('admin.addAccount')}</button>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <button type="button" disabled={!accts || accts.some((a) => !a.label.trim() || a.number.trim().length < 3)} onClick={async () => { setErr(''); try { await api('PUT', '/api/v1/admin/payment-accounts', accts); await inv('pay-accounts'); onClose() } catch (e) { setErr(errText(e, ur)) } }} className={`${btnDark} w-full`} data-testid="nctl-acct-save">{pick('common.save')}</button>
    </Drawer>
  )
}

function Drawer({ title, onClose, children, testid }: { title: string; onClose: () => void; children: ReactNode; testid: string }) {
  const { pick } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid={testid}>
      <div className="w-full max-w-md h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick(title)}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function Reason({ title, hint, onClose, onDone }: { title: string; hint: string; onClose: () => void; onDone: (why: string) => Promise<void> }) {
  const { pick } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="nctl-reason">
      <div className="bg-white dark:bg-obsidian-900 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
        <h3 className="font-display font-extrabold text-sm">{pick(title)}</h3>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick(hint)} className={INPUT} data-testid="nctl-reason-why" />
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={btnLight}>{pick('common.cancel')}</button><button type="button" disabled={busy || !why.trim()} onClick={async () => { setBusy(true); try { await onDone(why.trim()) } finally { setBusy(false) } }} className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-40" data-testid="nctl-reason-yes">{pick(title)}</button></div>
      </div>
    </div>
  )
}
