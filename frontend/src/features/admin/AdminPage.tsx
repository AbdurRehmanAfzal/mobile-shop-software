/** Super admin (product owner only): every customer shop, and "Open a new shop" with the owner's
 *  login, which can be sent on WhatsApp. Owner (2026-10-26): shops are not self-service. */

import { CalendarClock, CheckCircle2, GitBranch, MessageCircle, Plus, Store } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { BtnText, Empty, ErrorText, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import AppLinkCard, { APP_LINK, SITE } from './AppLinkCard'
import { normalisePhone } from '@/lib/format'
import { useDocMutation, useGet } from '@/lib/queries'

interface AdminShop { id: string; organisation_id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; branches: number; created_at: string; plan: string; plan_expires_at: string | null; days_left: number | null; monthly_fee: string; fee_note: string | null; plan_status: 'unlimited' | 'ok' | 'due_soon' | 'expired' | 'locked' }
const PLANS = ['trial', 'basic', 'pro', 'chain'] as const
type DueFilter = 'all' | 'due' | 'locked'
const EMPTY = { shop_name: '', city: '', owner_name: '', phone: '', password: '', locale: 'ur' as 'ur' | 'en' }

function PlanChip({ s }: { s: AdminShop }) {
  const { pick } = useLang()
  const tone = s.plan_status === 'locked' ? 'bg-payable-tint text-payable' : s.plan_status === 'expired' ? 'bg-payable-tint text-payable' : s.plan_status === 'due_soon' ? 'bg-[#F59E0B]/15 text-[#92400E]' : 'bg-emerald-tint text-emerald-deep'
  const text = s.plan_status === 'unlimited' ? pick('admin.unlimited') : s.plan_status === 'locked' ? pick('admin.locked') : s.days_left != null && s.days_left < 0 ? pick('admin.expiredDays').replace('{{n}}', String(-s.days_left)) : pick('admin.daysLeft').replace('{{n}}', String(s.days_left ?? 0))
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{s.plan} · {text}</span>
}

export default function AdminPage() {
  const { pick, ur, cls } = useLang()
  const isSuper = useAuth((s) => !!s.me?.user.is_superuser)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [made, setMade] = useState<{ shop: AdminShop; password: string } | null>(null)
  const [due, setDue] = useState<DueFilter>('all')
  const [sel, setSel] = useState<AdminShop | null>(null)
  const [plan, setPlan] = useState({ plan: 'basic', monthly_fee: '', expires_on: '', note: '' })
  const [branch, setBranch] = useState({ name: '', city: '' })
  const savePlan = useDocMutation<Record<string, unknown>, AdminShop>('PATCH', () => `/api/v1/admin/shops/${sel?.id}/plan`)
  const addBranch = useDocMutation<typeof branch, AdminShop>('POST', () => `/api/v1/admin/shops/${sel?.id}/branches`, (b) => ({ name: b.name, city: b.city || null }))
  const openShop = (s: AdminShop) => { setSel(s); setPlan({ plan: s.plan, monthly_fee: Number(s.monthly_fee) ? String(Number(s.monthly_fee)) : '', expires_on: s.plan_expires_at ? s.plan_expires_at.slice(0, 10) : '', note: s.fee_note ?? '' }); setBranch({ name: '', city: '' }); savePlan.reset(); addBranch.reset() }
  const { data, isLoading } = useGet<AdminShop[]>(['admin-shops', q], isSuper ? `/api/v1/admin/shops${q ? `?q=${encodeURIComponent(q)}` : ''}` : null)
  const create = useDocMutation<typeof EMPTY, AdminShop>('POST', () => '/api/v1/admin/shops', (x) => ({ ...x, city: x.city || null, phone: normalisePhone(x.phone) }))
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
            <BiLabel text="admin.planTitle" size="md" bold />
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
              <BiButton text="common.save" full loading={savePlan.isPending} onClick={async () => { const r = await savePlan.mutateAsync({ plan: plan.plan, monthly_fee: plan.monthly_fee === '' ? null : Number(plan.monthly_fee), note: plan.note, expires_on: plan.expires_on || null, clear_expiry: !plan.expires_on }); setSel(r) }} />
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
