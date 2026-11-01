/** Super admin (product owner only): every customer shop, and "Open a new shop" with the owner's
 *  login, which can be sent on WhatsApp. Owner (2026-10-26): shops are not self-service. */

import { BarChart3, CalendarClock, ChevronRight, Check, CheckCircle2, CreditCard, GitBranch, Image as ImageIcon, KeyRound, LogIn, MessageCircle, Plus, Store, Trash2, X } from 'lucide-react'
import { isoDay } from '@/lib/format'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { BtnText, Empty, ErrorText, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { useAuth, type MeOut } from '@/lib/auth'
import { api, get } from '@/lib/api'
import { fileObjectUrl } from '@/lib/files'
import AppLinkCard, { APP_LINK, SITE } from './AppLinkCard'
import { normalisePhone } from '@/lib/format'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

interface AdminShop { id: string; organisation_id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; branches: number; created_at: string; plan: string; plan_expires_at: string | null; days_left: number | null; monthly_fee: string; fee_note: string | null; plan_status: 'unlimited' | 'ok' | 'due_soon' | 'expired' | 'locked'; modules: string[]; modules_custom: boolean; grace_days?: number | null }
interface BillingOut { bank: { bank_name: string; account_title: string; account_number: string; iban: string; branch: string }; support: { phone: string; whatsapp: string }; schedule: { info_days: number; warn_days: number; urgent_days: number; grace_days: number; snooze_hours: number }; note: { en: string; ur: string; roman: string }; qr_path: string | null; placeholders: boolean }
type DueFilter = 'all' | 'due' | 'locked'
interface Account { label: string; account_name: string; number: string; note: string | null }
interface FeeRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; proof_path: string | null; months: number; note: string | null; status: string; decision_note: string | null; created_at: string; paid_on?: string | null; receipt_no?: string | null }
interface ShopReq { id: string; name: string; shop_name: string; city: string | null; phone: string; plan: string; note: string | null; created_at: string }
interface PwReq { id: string; shop_id: string; shop_name: string; user_id: string; name: string; phone: string; role: string; sent_to: string; created_at: string }
const PLANS = ['trial', 'basic', 'pro', 'chain'] as const
const EMPTY = { shop_name: '', city: '', owner_name: '', phone: '', password: '', locale: 'ur' as 'ur' | 'en', plan: 'trial' as (typeof PLANS)[number], modules: null as string[] | null }
const PASSWORD = () => `ms${Math.floor(1000 + Math.random() * 9000)}${Math.floor(100 + Math.random() * 900)}`
interface ModuleCatalogue { modules: Record<string, { en: string; ur: string }>; plans: Record<string, string[]> }

/** "Follow the plan" (its defaults shown greyed) or a hand-picked list of modules */
function ModulePicker({ catalogue, plan, value, onChange }: { catalogue: ModuleCatalogue | undefined; plan: string; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const { pick, ur, cls } = useLang()
  if (!catalogue) return null
  const defaults = catalogue.plans[plan] ?? []
  const custom = value !== null
  const shown = value ?? defaults
  const toggle = (k: string) => onChange(shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k])
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
        <input type="checkbox" checked={!custom} onChange={(e) => onChange(e.target.checked ? null : [...defaults])} className="h-6 w-6 accent-[rgb(var(--emerald))]" />
        <span className={`flex-1 font-semibold ${ur ? cls('sm') : 'text-sm'}`}>{pick('admin.followPlan').replace('{{plan}}', plan)}</span>
      </label>
      <div className="card grid grid-cols-1 divide-y divide-line p-0">
        {Object.entries(catalogue.modules).map(([k, names]) => (
          <label key={k} className={`flex items-center gap-3 px-4 py-2.5 ${custom ? '' : 'opacity-60'}`}>
            <input type="checkbox" disabled={!custom} checked={shown.includes(k)} onChange={() => toggle(k)} className="h-5 w-5 accent-[rgb(var(--emerald))]" />
            <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{ur ? names.ur : names.en}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function PlanChip({ s }: { s: AdminShop }) {
  const { pick } = useLang()
  const tone = s.plan_status === 'locked' ? 'bg-payable-tint text-payable' : s.plan_status === 'expired' ? 'bg-payable-tint text-payable' : s.plan_status === 'due_soon' ? 'bg-[#F59E0B]/15 text-[#92400E]' : 'bg-emerald-tint text-emerald-deep'
  const text = s.plan_status === 'unlimited' ? pick('admin.unlimited') : s.plan_status === 'locked' ? pick('admin.locked') : s.days_left != null && s.days_left < 0 ? pick('admin.expiredDays').replace('{{n}}', String(-s.days_left)) : pick('admin.daysLeft').replace('{{n}}', String(s.days_left ?? 0))
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{s.plan} · {text}</span>
}

export default function AdminPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const isSuper = useAuth((s) => !!s.me?.user.is_superuser)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [made, setMade] = useState<{ shop: AdminShop; password: string } | null>(null)
  const [due, setDue] = useState<DueFilter>('all')
  const [sel, setSel] = useState<AdminShop | null>(null)
  const [plan, setPlan] = useState({ plan: 'basic', monthly_fee: '', expires_on: '', note: '' })
  const [branch, setBranch] = useState({ name: '', city: '' })
  const [pw, setPw] = useState('')
  const [pwDone, setPwDone] = useState<{ name: string; phone: string; password: string } | null>(null)
  const setActiveShop = useAuth((s) => s.setActiveShop)
  const setMe = useAuth((s) => s.setMe)
  const { data: reqs } = useGet<PwReq[]>(['pw-requests'], isSuper ? '/api/v1/admin/password-requests?open_only=true' : null)
  const { data: shopReqs } = useGet<ShopReq[]>(['shop-requests'], isSuper ? '/api/v1/admin/shop-requests?open_only=true' : null)
  const [fromReq, setFromReq] = useState<string | null>(null)
  const { data: fees } = useGet<FeeRow[]>(['fee-pending'], isSuper ? '/api/v1/admin/fee-payments?status=pending' : null)
  const { data: feeStats } = useGet<{ pending: number; month_total: string; month: string }>(['fee-stats'], isSuper ? '/api/v1/admin/fee-stats' : null)
  const { data: savedAccounts } = useGet<Account[]>(['pay-accounts'], isSuper ? '/api/v1/admin/payment-accounts' : null)
  const [accts, setAccts] = useState<Account[] | null>(null)
  // owner addendum 3: billing settings, manual payments, renewal codes, per-shop grace
  const { data: billing } = useGet<BillingOut>(['billing'], isSuper ? '/api/v1/admin/billing' : null)
  const [bill, setBill] = useState<BillingOut | null>(null)
  const [billOpen, setBillOpen] = useState(false)
  useEffect(() => { if (billOpen && !bill && billing) setBill(JSON.parse(JSON.stringify(billing))) }, [billOpen, bill, billing])
  const saveBilling = useDocMutation<BillingOut, BillingOut>('PUT', () => '/api/v1/admin/billing', (b) => ({ bank: b.bank, support: b.support, schedule: b.schedule, note: b.note }))
  const [pay, setPay] = useState({ amount: '', method: 'cash', months: '1', reference: '', paid_on: isoDay(0) })
  const recordPay = useDocMutation<typeof pay, FeeRow>('POST', () => `/api/v1/admin/shops/${sel?.id}/payments`, (p) => ({ amount: Number(p.amount), method: p.method, months: Number(p.months) || 1, reference: p.reference || null, paid_on: p.paid_on || null }))
  const [codeMonths, setCodeMonths] = useState('1')
  const [codeOut, setCodeOut] = useState<string | null>(null)
  const makeCode = useDocMutation<{ months: number }, { code: string }>('POST', () => `/api/v1/admin/shops/${sel?.id}/renewal-code`)
  const [grace, setGrace] = useState('')
  const [acctsOpen, setAcctsOpen] = useState(false)
  const saveAccts = useDocMutation<Account[], Account[]>('PUT', () => '/api/v1/admin/payment-accounts')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const inv = useInvalidate()
  const [decided, setDecided] = useState<string[]>([])
  const decide = async (f: FeeRow, action: 'approve' | 'reject') => {
    const note = action === 'reject' ? window.prompt(pick('admin.rejectWhy')) ?? '' : null
    if (action === 'reject' && !note) return
    await api('POST', `/api/v1/admin/fee-payments/${f.id}/${action}`, action === 'approve' ? {} : { note })
    // the row goes at once; the lists refresh behind it (the shop list can take a few seconds)
    setDecided((d) => [...d, f.id])
    inv('fee-pending', 'fee-stats', 'admin-shops', 'prov-overview', 'prov-shops', 'prov-pays')
  }
  const setPassword = useDocMutation<{ password: string; user_id?: string }, { user_id: string; name: string; phone: string }>('POST', () => `/api/v1/admin/shops/${sel?.id}/owner-password`)
  const openAsAdmin = async (shop: AdminShop) => {
    await api('POST', `/api/v1/admin/shops/${shop.id}/enter`)
    setActiveShop(shop.id)
    const me = await get<MeOut>('/api/v1/me')
    setMe(me)
    nav('/')
  }
  const savePlan = useDocMutation<Record<string, unknown>, AdminShop>('PATCH', () => `/api/v1/admin/shops/${sel?.id}/plan`)
  const addBranch = useDocMutation<typeof branch, AdminShop>('POST', () => `/api/v1/admin/shops/${sel?.id}/branches`, (b) => ({ name: b.name, city: b.city || null }))
  const openShop = (s: AdminShop) => { setCodeOut(null); makeCode.reset(); recordPay.reset(); setPay({ amount: Number(s.monthly_fee) ? String(Number(s.monthly_fee)) : '', method: 'cash', months: '1', reference: '', paid_on: isoDay(0) }); setGrace(s.grace_days == null ? '' : String(s.grace_days)); setMods(s.modules_custom ? s.modules : null); saveModules.reset(); setPw(''); setPwDone(null); setPassword.reset(); setSel(s); setPlan({ plan: s.plan, monthly_fee: Number(s.monthly_fee) ? String(Number(s.monthly_fee)) : '', expires_on: s.plan_expires_at ? s.plan_expires_at.slice(0, 10) : '', note: s.fee_note ?? '' }); setBranch({ name: '', city: '' }); savePlan.reset(); addBranch.reset() }
  const [params] = useSearchParams()
  const wantShop = params.get('shop')
  const { data, isLoading } = useGet<AdminShop[]>(['admin-shops', q], isSuper ? `/api/v1/admin/shops${q ? `?q=${encodeURIComponent(q)}` : ''}` : null)
  const create = useDocMutation<typeof EMPTY & { request_id?: string | null }, AdminShop>('POST', () => '/api/v1/admin/shops', (x) => ({ ...x, city: x.city || null, phone: normalisePhone(x.phone) }))
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], isSuper ? '/api/v1/admin/modules' : null)
  const [mods, setMods] = useState<string[] | null>(null)
  const saveModules = useDocMutation<{ modules: string[] | null }, AdminShop>('PATCH', () => `/api/v1/admin/shops/${sel?.id}/modules`)
  const shown = (data ?? []).filter((s) => due === 'all' || (due === 'due' ? s.plan_status === 'due_soon' || s.plan_status === 'expired' : s.plan_status === 'locked'))
  const dueCount = (data ?? []).filter((s) => s.plan_status === 'due_soon' || s.plan_status === 'expired').length
  const lockedCount = (data ?? []).filter((s) => s.plan_status === 'locked').length
  useEffect(() => { if (wantShop && data && !sel) { const s = data.find((x) => x.id === wantShop); if (s) openShop(s) } }, [wantShop, data]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  if (!isSuper) return <Navigate to="/" replace />

  const share = made
    ? `https://wa.me/92${(made.shop.owner_phone ?? '').replace(/^0/, '')}?text=${encodeURIComponent(
        `${made.shop.name}\nMobile Shop app\nLogin: ${made.shop.owner_phone}\nPassword: ${made.password}\n${SITE}\nAndroid app: ${APP_LINK}`,
      )}`
    : ''

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="admin.title"
        right={
          <button type="button" aria-label={pick('admin.newShop')} onClick={() => { setMade(null); setF(EMPTY); create.reset(); setOpen(true) }} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-ink px-2 py-1 text-ground">
            <Plus size={20} />
            <BtnText k="admin.newShop" />
          </button>
        }
      />
      <BiLabel text="admin.only" size="sm" tone="text-muted" />
      {/* docs/28: the business view — income, channels, time left, usage, keys */}
      <button type="button" onClick={() => nav('/admin/business')} className="tap hero flex items-center gap-3 px-5 py-4 text-start" data-testid="open-business">
        <span className="well h-11 w-11 shrink-0 bg-white/15"><BarChart3 size={22} /></span>
        <span className="flex-1 text-base font-extrabold">{pick('prov.open')}</span>
        <ChevronRight size={20} className="rtl:rotate-180" />
      </button>
      <AppLinkCard />
      <section className="card flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><CreditCard size={20} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <BiLabel text="admin.feesTitle" size="md" bold />
            <span className="text-xs text-muted">{pick('admin.thisMonth')} <span className="num" dir="ltr">Rs. {Number(feeStats?.month_total ?? 0).toLocaleString('en-US')}</span> · {pick('admin.pendingN').replace('{{n}}', String(feeStats?.pending ?? 0))}</span>
          </span>
          <button type="button" onClick={() => { setAccts(savedAccounts ? savedAccounts.map((a) => ({ ...a })) : []); setAcctsOpen(true) }} className={`tap rounded-full border border-line px-3 py-1.5 text-xs font-bold ${ur ? cls('sm') : ''}`}>{pick('admin.accounts')}</button>
          <button type="button" onClick={() => { if (billing) setBill(JSON.parse(JSON.stringify(billing))); setBillOpen(true) }} className={`tap rounded-full px-3 py-1.5 text-xs font-bold ${billing?.placeholders ? 'bg-payable-tint text-payable' : 'border border-line'} ${ur ? cls('sm') : ''}`} data-testid="billing-open">{pick('admin.billing')}</button>
        </div>
        {fees?.filter((f) => !decided.includes(f.id)).length ? (
          <div className="divide-y divide-line">
            {fees.filter((f) => !decided.includes(f.id)).map((f) => (
              <div key={f.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{f.shop_name}</span>
                    <span className="text-xs text-muted" dir="ltr">{f.method}{f.reference ? ` · ${f.reference}` : ''} · {f.months} {pick(f.months === 1 ? 'admin.month' : 'admin.months')} · {fmtDate(f.created_at)}</span>
                  </span>
                  <span className="num text-lg" dir="ltr">Rs. {Number(f.amount).toLocaleString('en-US')}</span>
                </div>
                {f.note ? <span className="text-sm text-muted">{f.note}</span> : null}
                <div className="flex gap-2">
                  {f.proof_path ? <button type="button" onClick={async () => setProofUrl(await fileObjectUrl(f.proof_path!, f.shop_id))} className="tap flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold"><ImageIcon size={16} /> {pick('admin.proof')}</button> : null}
                  <button type="button" onClick={() => decide(f, 'approve')} className="tap flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald text-sm font-bold text-white"><Check size={16} /> {pick('admin.approveMonths').replace('{{n}}', String(f.months))}</button>
                  <button type="button" onClick={() => decide(f, 'reject')} className="tap flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm font-bold text-payable"><X size={16} /> {pick('admin.reject')}</button>
                </div>
              </div>
            ))}
          </div>
        ) : <BiLabel text="admin.noFees" size="sm" tone="text-muted" />}
      </section>
      <Sheet open={billOpen} onClose={() => setBillOpen(false)} title="admin.billing">
        {bill ? (
          <div className="flex flex-col gap-3" data-testid="billing-sheet">
            <BiLabel text="admin.billingHint" size="sm" tone="text-muted" />
            {bill.placeholders ? <BiAlert text="admin.placeholders" kind="info" /> : null}
            {([['bank_name', 'admin.bankName'], ['account_title', 'admin.accountTitle'], ['account_number', 'admin.accountNumber'], ['iban', 'admin.iban'], ['branch', 'admin.branch']] as const).map(([k, label]) => (
              <BiInput key={k} label={label} value={bill.bank[k] ?? ''} onChange={(e) => setBill({ ...bill, bank: { ...bill.bank, [k]: e.target.value } })} dir="ltr" />
            ))}
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="admin.supportPhone" value={bill.support.phone ?? ''} onChange={(e) => setBill({ ...bill, support: { ...bill.support, phone: e.target.value } })} dir="ltr" />
              <BiInput label="admin.supportWa" value={bill.support.whatsapp ?? ''} onChange={(e) => setBill({ ...bill, support: { ...bill.support, whatsapp: e.target.value } })} dir="ltr" />
            </div>
            <BiLabel text="admin.schedule" size="md" bold />
            <div className="grid grid-cols-2 gap-2">
              {([['info_days', 'admin.infoDays'], ['warn_days', 'admin.warnDays'], ['urgent_days', 'admin.urgentDays'], ['grace_days', 'admin.graceDays'], ['snooze_hours', 'admin.snoozeHours']] as const).map(([k, label]) => (
                <BiInput key={k} label={label} type="number" inputMode="numeric" min={0} value={String(bill.schedule[k])} onChange={(e) => setBill({ ...bill, schedule: { ...bill.schedule, [k]: Number(e.target.value) } })} className="num" />
              ))}
            </div>
            <BiInput label={{ en: 'Note (English)', ur: 'نوٹ (انگریزی)', roman: 'Note (English)' }} value={bill.note.en ?? ''} onChange={(e) => setBill({ ...bill, note: { ...bill.note, en: e.target.value } })} />
            <BiInput label={{ en: 'Note (Urdu)', ur: 'نوٹ (اردو)', roman: 'Note (Urdu)' }} value={bill.note.ur ?? ''} onChange={(e) => setBill({ ...bill, note: { ...bill.note, ur: e.target.value } })} dir="rtl" />
            <BiInput label={{ en: 'Note (Roman)', ur: 'نوٹ (رومن)', roman: 'Note (Roman)' }} value={bill.note.roman ?? ''} onChange={(e) => setBill({ ...bill, note: { ...bill.note, roman: e.target.value } })} />
            <ErrorText error={saveBilling.error} />
            <BiButton text="common.save" full loading={saveBilling.isPending} onClick={async () => { await saveBilling.mutateAsync(bill); inv('billing'); setBillOpen(false) }} />
          </div>
        ) : null}
      </Sheet>
      <Sheet open={!!proofUrl} onClose={() => setProofUrl(null)} title="admin.proof">
        {proofUrl ? <img src={proofUrl} alt="" className="max-h-[70vh] w-full rounded-2xl object-contain" /> : null}
      </Sheet>
      <Sheet open={acctsOpen} onClose={() => setAcctsOpen(false)} title="admin.accounts">
        {accts ? (
          <div className="flex flex-col gap-3">
            <BiLabel text="admin.accountsHint" size="sm" tone="text-muted" />
            {accts.map((a, i) => (
              <div key={i} className="card flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <BiInput label="admin.acctLabel" value={a.label} onChange={(e) => setAccts(accts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={40} />
                  <BiInput label="admin.acctName" value={a.account_name} onChange={(e) => setAccts(accts.map((x, j) => (j === i ? { ...x, account_name: e.target.value } : x)))} maxLength={80} />
                </div>
                <BiInput label="admin.acctNumber" value={a.number} onChange={(e) => setAccts(accts.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} maxLength={60} dir="ltr" className="num" />
                <div className="flex items-end gap-2">
                  <div className="flex-1"><BiInput label="admin.acctNote" value={a.note ?? ''} onChange={(e) => setAccts(accts.map((x, j) => (j === i ? { ...x, note: e.target.value || null } : x)))} maxLength={120} /></div>
                  <button type="button" aria-label={pick('crud.delete')} onClick={() => setAccts(accts.filter((_, j) => j !== i))} className="tap mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-line text-payable"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
            <BiButton text="admin.addAccount" icon={<Plus size={20} />} variant="secondary" full onClick={() => setAccts([...accts, { label: '', account_name: '', number: '', note: null }])} />
            <ErrorText error={saveAccts.error} />
            <BiButton text="common.save" full loading={saveAccts.isPending} disabled={accts.some((a) => !a.label.trim() || a.number.trim().length < 3)} onClick={async () => { await saveAccts.mutateAsync(accts); inv('pay-accounts'); setAcctsOpen(false) }} />
          </div>
        ) : null}
      </Sheet>
      {shopReqs?.length ? (
        <section className="flex flex-col gap-2">
          <BiLabel text="admin.shopRequests" size="md" bold />
          <div className="card divide-y divide-line p-0">
            {shopReqs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><Store size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{r.shop_name}{r.city ? <span className="font-medium text-muted"> · {r.city}</span> : null}</span>
                  <span className="truncate text-xs text-muted" dir="ltr">{r.name} · {r.phone} · {r.plan} · {fmtDate(r.created_at)}</span>
                  {r.note ? <span className="text-xs text-muted">{r.note}</span> : null}
                </span>
                <button type="button" onClick={() => { setMade(null); setF({ ...EMPTY, shop_name: r.shop_name, city: r.city ?? '', owner_name: r.name, phone: r.phone.replace(/^0/, ''), plan: (r.plan as (typeof PLANS)[number]) || 'trial', password: PASSWORD() }); setFromReq(r.id); create.reset(); setOpen(true) }} className="tap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-ground">{pick('admin.newShop')}</button>
                <a href={`https://wa.me/92${r.phone.replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="tap flex h-9 w-9 items-center justify-center rounded-full bg-emerald text-white"><MessageCircle size={16} /></a>
                <button type="button" aria-label={pick('admin.markDone')} onClick={async () => { await api('POST', `/api/v1/admin/shop-requests/${r.id}/done`); create.reset() }} className="tap flex h-9 w-9 items-center justify-center rounded-full border border-line text-emerald"><Check size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {reqs?.length ? (
        <section className="flex flex-col gap-2">
          <BiLabel text="admin.pwRequests" size="md" bold />
          <div className="card divide-y divide-line p-0">
            {reqs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="well h-10 w-10 shrink-0 bg-payable-tint text-payable"><KeyRound size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{r.name} · {r.shop_name}</span>
                  <span className="text-xs text-muted" dir="ltr">{r.phone} · {fmtDate(r.created_at)}</span>
                </span>
                <button type="button" onClick={() => { const s = data?.find((x) => x.id === r.shop_id); if (s) openShop(s) }} className={`tap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-ground`}>{pick('admin.setPassword')}</button>
                <button type="button" aria-label={pick('admin.markDone')} onClick={async () => { await api('POST', `/api/v1/admin/password-requests/${r.id}/done`); create.reset() }} className="tap flex h-9 w-9 items-center justify-center rounded-full border border-line text-emerald"><Check size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <SearchBox value={q} onChange={setQ} placeholder="common.search" />
      <div className="flex flex-wrap gap-1.5">
        {([['all', pick('common.all'), data?.length ?? 0], ['due', pick('admin.feesDue'), dueCount], ['locked', pick('admin.locked'), lockedCount]] as const).map(([k, label, n]) => (
          <button key={k} type="button" aria-pressed={due === k} onClick={() => setDue(k)} className={`tap h-10 rounded-full border-2 px-3.5 font-bold ${due === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
            {label} <span className="num">{n}</span>
          </button>
        ))}
      </div>
      <BiLabel text="admin.shops" size="md" bold />
      {isLoading ? <Loading /> : !shown.length ? <Empty text="admin.none" /> : (
        <div className="card divide-y divide-line p-0">
          {shown.map((s) => (
            <button key={s.id} type="button" onClick={() => openShop(s)} className="tap flex w-full items-center gap-3 px-4 py-3 text-start">
              <span className="well h-11 w-11 shrink-0 bg-emerald-tint text-emerald-deep"><Store size={20} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{s.name}{s.city ? <span className="font-medium text-muted"> · {s.city}</span> : null}</span>
                <span className="truncate text-xs text-muted" dir="ltr">{s.owner_name} · {s.owner_phone}{s.branches > 1 ? ` · ${s.branches} ${pick('admin.branches')}` : ''}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <PlanChip s={s} />
                <span className="text-xs text-muted">{Number(s.monthly_fee) ? <span className="num" dir="ltr">Rs. {Number(s.monthly_fee).toLocaleString('en-US')}/{pick('admin.month')}</span> : pick('admin.noFee')}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? { en: sel.name, ur: sel.name, roman: sel.name } : 'admin.shops'}>
        {sel ? (
          <div className="flex flex-col gap-3">
            <div className="card flex flex-col gap-1" dir="ltr">
              <span className="text-sm text-muted">{sel.owner_name} · {sel.owner_phone} · {sel.users} {pick('admin.users')}</span>
              <span className="flex items-center gap-2"><PlanChip s={sel} />{sel.plan_expires_at ? <span className="text-sm text-muted">{pick('admin.expires')} {fmtDate(sel.plan_expires_at)}</span> : null}</span>
            </div>
            <BiButton text="admin.openShop" icon={<LogIn size={20} />} full onClick={() => openAsAdmin(sel)} />

            <BiLabel text="admin.ownerPassword" size="md" bold className="mt-1" />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <BiInput label="admin.password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} />
              <BiButton text="common.save" variant="secondary" disabled={pw.length < 6} loading={setPassword.isPending} onClick={async () => { const r = await setPassword.mutateAsync({ password: pw }); setPwDone({ ...r, password: pw }); setPw('') }} />
            </div>
            <ErrorText error={setPassword.error} />
            {pwDone ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-sell p-3 text-sell-fg">
                <span className="text-sm font-bold">{pick('admin.pwSet')}</span>
                <span className="num" dir="ltr">{pwDone.phone} · {pwDone.password}</span>
                <a href={`https://wa.me/92${pwDone.phone.replace(/^0/, '')}?text=${encodeURIComponent(`${sel.name}\nMobile Shop\nLogin: ${pwDone.phone}\nNew password: ${pwDone.password}\n${SITE}`)}`} target="_blank" rel="noopener noreferrer" className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald font-bold text-white">
                  <MessageCircle size={18} /> {pick('admin.sendWhatsapp')}
                </a>
              </div>
            ) : null}

            <BiLabel text="admin.modulesTitle" size="md" bold className="mt-1" />
            <ModulePicker catalogue={catalogue} plan={plan.plan} value={mods} onChange={setMods} />
            <ErrorText error={saveModules.error} />
            <BiButton text="admin.saveModules" variant="secondary" full loading={saveModules.isPending} onClick={async () => { const r = await saveModules.mutateAsync({ modules: mods }); setSel(r) }} />

            <BiLabel text="admin.planTitle" size="md" bold className="mt-1" />
            <BiSegmented<(typeof PLANS)[number]> value={plan.plan as (typeof PLANS)[number]} onChange={(p) => setPlan({ ...plan, plan: p })} options={PLANS.map((p) => ({ value: p, text: { en: p, ur: p, roman: p } }))} />
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="admin.monthlyFee" type="number" inputMode="numeric" min={0} value={plan.monthly_fee} onChange={(e) => setPlan({ ...plan, monthly_fee: e.target.value })} className="num" />
              <BiInput label="admin.expiresOn" type="date" value={plan.expires_on} onChange={(e) => setPlan({ ...plan, expires_on: e.target.value })} dir="ltr" />
            </div>
            <BiInput label="admin.feeNote" value={plan.note} onChange={(e) => setPlan({ ...plan, note: e.target.value })} maxLength={200} />
            <div className="grid grid-cols-3 gap-2">
              {[1, 3, 12].map((m) => (
                <button key={m} type="button" disabled={savePlan.isPending} onClick={async () => { const r = await savePlan.mutateAsync({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note, extend_months: m }); setSel(r); setPlan({ ...plan, expires_on: r.plan_expires_at ? r.plan_expires_at.slice(0, 10) : '' }) }} className={`tap flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-emerald-tint font-bold text-emerald-deep ${ur ? cls('sm') : 'text-sm'}`}>
                  <CalendarClock size={16} /> +{m} {pick(m === 1 ? 'admin.month' : 'admin.months')}
                </button>
              ))}
            </div>
            <ErrorText error={savePlan.error} />
            <div className="grid grid-cols-2 gap-2">
              <BiButton text="admin.savePlan" full loading={savePlan.isPending} onClick={async () => { const r = await savePlan.mutateAsync({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note, expires_on: plan.expires_on || null, clear_expiry: !plan.expires_on }); setSel(r) }} />
              <BiButton text="admin.unlimited" variant="secondary" full loading={savePlan.isPending} onClick={async () => { const r = await savePlan.mutateAsync({ clear_expiry: true }); setSel(r); setPlan({ ...plan, expires_on: '' }) }} />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <BiInput label="admin.shopGrace" type="number" inputMode="numeric" min={0} max={90} value={grace} onChange={(e) => setGrace(e.target.value)} className="num" />
              <BiButton text="common.save" variant="secondary" loading={savePlan.isPending} onClick={async () => { const r = await savePlan.mutateAsync({ set_grace: true, grace_days: grace === '' ? null : Number(grace) }); setSel({ ...r, grace_days: grace === '' ? null : Number(grace) }) }} />
            </div>

            <BiLabel text="admin.recordPayment" size="md" bold className="mt-2" />
            <BiLabel text="admin.recordHint" size="sm" tone="text-muted" />
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="fees.amount" type="number" inputMode="numeric" min={1} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="num" />
              <BiInput label="fees.months" type="number" inputMode="numeric" min={1} max={36} value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value })} className="num" />
              <BiInput label="fees.method" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} />
              <BiInput label="admin.paidOn" type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} dir="ltr" />
            </div>
            <BiInput label="fees.reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} dir="ltr" />
            <ErrorText error={recordPay.error} />
            {recordPay.data ? <BiAlert text={{ en: `${pick('admin.receipt')} ${recordPay.data.receipt_no ?? ''}`, ur: `${pick('admin.receipt')} ${recordPay.data.receipt_no ?? ''}`, roman: `${pick('admin.receipt')} ${recordPay.data.receipt_no ?? ''}` }} kind="success" /> : null}
            <BiButton text="admin.recordPayment" icon={<CreditCard size={20} />} variant="secondary" full disabled={!Number(pay.amount)} loading={recordPay.isPending} onClick={async () => { await recordPay.mutateAsync(pay); inv('admin-shops', 'fee-stats'); const rows = await get<AdminShop[]>('/api/v1/admin/shops'); const r = rows.find((x) => x.id === sel.id); if (r) setSel(r) }} data-testid="record-payment" />

            <BiLabel text="admin.renewalCode" size="md" bold className="mt-2" />
            <BiLabel text="admin.renewalHint" size="sm" tone="text-muted" />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <BiInput label="fees.months" type="number" inputMode="numeric" min={1} max={36} value={codeMonths} onChange={(e) => setCodeMonths(e.target.value)} className="num" />
              <BiButton text="admin.renewalCode" variant="secondary" loading={makeCode.isPending} onClick={async () => { const r = await makeCode.mutateAsync({ months: Number(codeMonths) || 1 }); setCodeOut(r.code) }} data-testid="make-code" />
            </div>
            <ErrorText error={makeCode.error} />
            {codeOut ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-sell p-3 text-sell-fg">
                <span className="text-sm font-bold">{pick('admin.codeMade')}</span>
                <span className="num break-all text-xs" dir="ltr" data-testid="renewal-code-out">{codeOut}</span>
                <a href={`https://wa.me/92${(sel.owner_phone ?? '').replace(/^0/, '')}?text=${encodeURIComponent(`${sel.name}\nMobile Shop renewal code (${codeMonths} month):\n${codeOut}\nMore → Software fees → Renewal code`)}`} target="_blank" rel="noopener noreferrer" className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald font-bold text-white"><MessageCircle size={18} /> {pick('admin.sendCode')}</a>
              </div>
            ) : null}

            <BiLabel text="admin.addBranch" size="md" bold className="mt-2" />
            <BiLabel text="admin.branchHint" size="sm" tone="text-muted" />
            <BiInput label="auth.shopName" value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} />
            <BiInput label="auth.city" value={branch.city} onChange={(e) => setBranch({ ...branch, city: e.target.value })} />
            <ErrorText error={addBranch.error} />
            <BiButton text="admin.addBranch" icon={<GitBranch size={20} />} variant="secondary" full loading={addBranch.isPending} disabled={branch.name.trim().length < 2} onClick={async () => { const r = await addBranch.mutateAsync(branch); setSel(r); setBranch({ name: '', city: '' }) }} />
          </div>
        ) : null}
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title={made ? 'admin.created' : 'admin.newShop'}>
        {made ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-1 rounded-3xl bg-sell px-4 py-5 text-sell-fg">
              <CheckCircle2 size={32} />
              <span className="text-lg font-extrabold">{made.shop.name}</span>
            </div>
            <BiLabel text="admin.giveDetails" size="md" bold />
            <div className="card flex flex-col gap-1" dir="ltr">
              <span className="text-sm text-muted">{pick('auth.phone')}</span>
              <span className="num text-xl">{made.shop.owner_phone}</span>
              <span className="mt-2 text-sm text-muted">{pick('auth.password')}</span>
              <span className="num text-xl">{made.password}</span>
            </div>
            <a href={share} target="_blank" rel="noopener noreferrer" className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald font-bold text-white">
              <MessageCircle size={20} /> {pick('admin.sendWhatsapp')}
            </a>
            <BiButton text="admin.another" icon={<Plus size={20} />} variant="secondary" full onClick={() => { setMade(null); setF(EMPTY); create.reset() }} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <BiInput label="auth.shopName" value={f.shop_name} onChange={set('shop_name')} />
            <BiInput label="auth.city" value={f.city} onChange={set('city')} />
            <BiInput label="admin.ownerName" value={f.owner_name} onChange={set('owner_name')} />
            <PhoneInput label="admin.ownerPhone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
            <BiInput label="admin.password" value={f.password} onChange={set('password')} minLength={6} />
            <BiLabel text="admin.language" size="md" tone="text-muted" />
            <BiSegmented<'ur' | 'en'> value={f.locale} onChange={(locale) => setF({ ...f, locale })} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو', roman: 'Urdu' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی', roman: 'English' } }]} />
            <BiLabel text="admin.planTitle" size="md" tone="text-muted" />
            <BiSegmented<(typeof PLANS)[number]> value={f.plan} onChange={(plan) => setF({ ...f, plan, modules: null })} options={PLANS.map((p) => ({ value: p, text: { en: p, ur: p, roman: p } }))} />
            <ModulePicker catalogue={catalogue} plan={f.plan} value={f.modules} onChange={(modules) => setF({ ...f, modules })} />
            <ErrorText error={create.error} />
            <BiButton
              text="admin.newShop"
              icon={<Store size={20} />}
              full
              loading={create.isPending}
              disabled={f.shop_name.trim().length < 2 || f.owner_name.trim().length < 2 || !isMobileOk(f.phone) || f.password.length < 6}
              onClick={async () => {
                const shop = await create.mutateAsync({ ...f, request_id: fromReq })
                setFromReq(null)
                setMade({ shop, password: f.password })
              }}
            />
          </div>
        )}
      </Sheet>
    </div>
  )
}
