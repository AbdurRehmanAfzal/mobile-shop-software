/** Super admin (product owner only): every customer shop, and "Open a new shop" with the owner's
 *  login, which can be sent on WhatsApp. Owner (2026-10-26): shops are not self-service. */

import { CheckCircle2, MessageCircle, Plus, Store } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { BtnText, Empty, ErrorText, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import AppLinkCard, { APP_LINK, SITE } from './AppLinkCard'
import { normalisePhone } from '@/lib/format'
import { useDocMutation, useGet } from '@/lib/queries'

interface AdminShop { id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; created_at: string }
const EMPTY = { shop_name: '', city: '', owner_name: '', phone: '', password: '', locale: 'ur' as 'ur' | 'en' }

export default function AdminPage() {
  const { pick, ur, cls } = useLang()
  const isSuper = useAuth((s) => !!s.me?.user.is_superuser)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [made, setMade] = useState<{ shop: AdminShop; password: string } | null>(null)
  const { data, isLoading } = useGet<AdminShop[]>(['admin-shops', q], isSuper ? `/api/v1/admin/shops${q ? `?q=${encodeURIComponent(q)}` : ''}` : null)
  const create = useDocMutation<typeof EMPTY, AdminShop>('POST', () => '/api/v1/admin/shops', (x) => ({ ...x, city: x.city || null, phone: normalisePhone(x.phone) }))
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const small = ur ? cls('sm') : 'text-sm font-semibold'

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
      <BiLabel text="admin.shops" size="md" bold />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="admin.none" /> : (
        <div className="card divide-y divide-line p-0">
          {data.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="well h-11 w-11 shrink-0 bg-emerald-tint text-emerald-deep"><Store size={20} /></span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">{s.name}{s.city ? <span className="font-medium text-muted"> · {s.city}</span> : null}</span>
                <span className="truncate text-xs text-muted" dir="ltr">{s.owner_name} · {s.owner_phone}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className={small}><span className="num">{s.users}</span> {pick('admin.users')}</span>
                <span className="text-xs text-muted">{pick('admin.opened')} <span dir="ltr">{fmtDate(s.created_at)}</span></span>
              </span>
            </div>
          ))}
        </div>
      )}

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
