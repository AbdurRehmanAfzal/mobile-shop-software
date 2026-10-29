/** Super admin (product owner only): every customer shop, and "Open a new shop" with the owner's
 *  login, which can be sent on WhatsApp. Owner (2026-10-26): shops are not self-service. */

import { CalendarClock, Check, CheckCircle2, GitBranch, KeyRound, LogIn, MessageCircle, Plus, Store } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { BtnText, Empty, ErrorText, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { useAuth, type MeOut } from '@/lib/auth'
import { api, get } from '@/lib/api'
import AppLinkCard, { APP_LINK, SITE } from './AppLinkCard'
import { normalisePhone } from '@/lib/format'
import { useDocMutation, useGet } from '@/lib/queries'

interface AdminShop { id: string; organisation_id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; branches: number; created_at: string; plan: string; plan_expires_at: string | null; days_left: number | null; monthly_fee: string; fee_note: string | null; plan_status: 'unlimited' | 'ok' | 'due_soon' | 'expired' | 'locked'; modules: string[]; modules_custom: boolean }
type DueFilter = 'all' | 'due' | 'locked'
interface PwReq { id: string; shop_id: string; shop_name: string; user_id: string; name: string; phone: string; role: string; sent_to: string; created_at: string }
const PLANS = ['trial', 'basic', 'pro', 'chain'] as const
const EMPTY = { shop_name: '', city: '', owner_name: '', phone: '', password: '', locale: 'ur' as 'ur' | 'en', plan: 'trial' as (typeof PLANS)[number], modules: null as string[] | null }
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
  const openShop = (s: AdminShop) => { setMods(s.modules_custom ? s.modules : null); saveModules.reset(); setPw(''); setPwDone(null); setPassword.reset(); setSel(s); setPlan({ plan: s.plan, monthly_fee: Number(s.monthly_fee) ? String(Number(s.monthly_fee)) : '', expires_on: s.plan_expires_at ? s.plan_expires_at.slice(0, 10) : '', note: s.fee_note ?? '' }); setBranch({ name: '', city: '' }); savePlan.reset(); addBranch.reset() }
  const { data, isLoading } = useGet<AdminShop[]>(['admin-shops', q], isSuper ? `/api/v1/admin/shops${q ? `?q=${encodeURIComponent(q)}` : ''}` : null)
  const create = useDocMutation<typeof EMPTY, AdminShop>('POST', () => '/api/v1/admin/shops', (x) => ({ ...x, city: x.city || null, phone: normalisePhone(x.phone) }))
  const { data: catalogue } = useGet<ModuleCatalogue>(['module-catalogue'], isSuper ? '/api/v1/admin/modules' : null)
  const [mods, setMods] = useState<string[] | null>(null)
  const saveModules = useDocMutation<{ modules: string[] | null }, AdminShop>('PATCH', () => `/api/v1/admin/shops/${sel?.id}/modules`)
  const shown = (data ?? []).filter((s) => due === 'all' || (due === 'due' ? s.plan_status === 'due_soon' || s.plan_status === 'expired' : s.plan_status === 'locked'))
  const dueCount = (data ?? []).filter((s) => s.plan_status === 'due_soon' || s.plan_status === 'expired').length
  const lockedCount = (data ?? []).filter((s) => s.plan_status === 'locked').length
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
      <AppLinkCard />
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
                const shop = await create.mutateAsync(f)
                setMade({ shop, password: f.password })
              }}
            />
          </div>
        )}
      </Sheet>
    </div>
  )
}
