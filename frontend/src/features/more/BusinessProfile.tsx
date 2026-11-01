/** Settings → business profile (owner 2026-11-01, docs/30): logo and business details, the owner,
 *  tax registrations (NTN / STRN / FBR POS ID), how money is written, and what the printed bill
 *  shows (logo, tax numbers, owner, bank details, terms). Each card saves on its own. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Building2, Check, FileText, ImagePlus, Receipt, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { CnicInput, PhoneInput } from '@/components/FieldInputs'
import { ErrorText } from '@/components/ui'
import { api, get, patch } from '@/lib/api'
import { useAuth, type MeOut } from '@/lib/auth'
import { BASE, authHeaders, fileObjectUrl } from '@/lib/files'
import { setCurrency } from '@/lib/format'

type CardT = (p: { icon: ReactNode; tone: string; title: string; hint?: string; children: ReactNode }) => JSX.Element
type ToggleT = (p: { on: boolean; onChange: (v: boolean) => void; text: string; hint?: string }) => JSX.Element

export interface Profile {
  name: string; logo_path: string | null; address: string | null; whatsapp: string | null; city: string | null
  legal_name: string | null; tagline: string | null; tagline_ur: string | null; business_type: string | null; registration_no: string | null
  established_year: number | null; province: string | null; email: string | null; website: string | null; social: Record<string, string> | null
  opening_hours: string | null; owner_name: string | null; owner_cnic: string | null; ntn: string | null; strn: string | null; fbr_pos_id: string | null
  bank_details: Record<string, string> | null; terms: string | null; terms_ur: string | null
  currency: { symbol: string; position: 'before' | 'after'; decimals: 0 | 2 } | null
  print_prefs: Record<string, boolean> | null
}

const TYPES = ['sole', 'partnership', 'company', 'aop', 'other'] as const
const PROVINCES = ['punjab', 'sindh', 'kpk', 'balochistan', 'islamabad', 'gb', 'ajk'] as const
const SYMBOLS = ['Rs.', 'Rs', 'PKR', '₨', 'روپے'] as const
const PRINT = ['logo', 'tagline', 'ntn', 'owner', 'bank', 'terms', 'social'] as const
const PRINT_DEFAULT: Record<string, boolean> = { logo: true, tagline: true, ntn: true, owner: false, bank: false, terms: true, social: false }

function useSave(after?: () => void) {
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const setMe = useAuth((s) => s.setMe)
  const [ok, setOk] = useState(false)
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<Profile>('/api/v1/shops/current', body),
    onSuccess: async () => {
      setOk(true)
      void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] })
      try { setMe(await get<MeOut>('/api/v1/me')) } catch { /* the next app open refreshes it */ }
      after?.()
    },
  })
  return { m, ok, setOk }
}

const chip = (on: boolean) => `tap h-10 rounded-full border-2 px-3.5 text-[13px] font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`
const nz = (v: string) => (v.trim() ? v.trim() : null)

export default function BusinessProfileCards({ Card, Toggle }: { Card: CardT; Toggle: ToggleT }) {
  const shopKey = useAuth((s) => s.activeShopId)
  const { data } = useQuery({ queryKey: [shopKey, 'shop-full'], queryFn: () => get<Profile>('/api/v1/shops/current') })
  if (!data) return null
  return (
    <>
      <LogoCard Card={Card} p={data} />
      <OwnerCard Card={Card} p={data} />
      <TaxCard Card={Card} p={data} />
      <CurrencyCard Card={Card} p={data} />
      <PrintCard Card={Card} Toggle={Toggle} p={data} />
    </>
  )
}

function LogoCard({ Card, p }: { Card: CardT; p: Profile }) {
  const { pick } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const setMe = useAuth((s) => s.setMe)
  const input = useRef<HTMLInputElement>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [f, setF] = useState(() => ({
    legal_name: p.legal_name ?? '', tagline: p.tagline ?? '', tagline_ur: p.tagline_ur ?? '', address: p.address ?? '', whatsapp: p.whatsapp ?? '',
    business_type: p.business_type ?? '', registration_no: p.registration_no ?? '', established_year: p.established_year ? String(p.established_year) : '',
    province: p.province ?? '', email: p.email ?? '', website: p.website ?? '', opening_hours: p.opening_hours ?? '',
    facebook: p.social?.facebook ?? '', instagram: p.social?.instagram ?? '', tiktok: p.social?.tiktok ?? '',
  }))
  const { m, ok, setOk } = useSave()
  useEffect(() => { let url: string | null = null; if (p.logo_path) void fileObjectUrl(p.logo_path).then((u) => { url = u; setLogo(u) }); else setLogo(null); return () => { if (url) URL.revokeObjectURL(url) } }, [p.logo_path])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setOk(false); setF({ ...f, [k]: e.target.value }) }
  const refresh = async () => { void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }); try { setMe(await get<MeOut>('/api/v1/me')) } catch { /* later */ } }
  async function upload(file: File) {
    setBusy(true); setErr(null)
    try {
      const small = await shrink(file)
      const fd = new FormData()
      fd.append('file', small, 'logo.png')
      const res = await fetch(`${BASE}/api/v1/shops/current/logo`, { method: 'POST', headers: authHeaders(), body: fd })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message_en ?? 'Upload failed')
      await refresh()
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  return (
    <Card icon={<Building2 size={22} />} tone="bg-sell text-sell-fg" title="biz.title" hint="biz.hint">
      <div className="flex items-center gap-3" data-testid="logo-box">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-ground">
          {logo ? <img src={logo} alt="" className="max-h-full max-w-full object-contain" data-testid="logo-img" /> : <ImagePlus size={26} className="text-muted" />}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <BiButton text={p.logo_path ? 'biz.changeLogo' : 'biz.uploadLogo'} icon={<ImagePlus size={18} />} variant="secondary" loading={busy} onClick={() => input.current?.click()} />
          {p.logo_path ? <button type="button" onClick={async () => { await api('DELETE', '/api/v1/shops/current/logo'); await refresh() }} className="tap flex items-center gap-1 self-start text-xs font-bold text-payable"><Trash2 size={14} /> {pick('biz.removeLogo')}</button> : null}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="logo-input" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file) }} />
      </div>
      <BiLabel text="biz.logoHint" size="sm" tone="text-muted" />
      <ErrorText error={err} />
      <BiInput label="biz.legalName" value={f.legal_name} onChange={set('legal_name')} maxLength={200} hint="biz.legalNameHint" />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="biz.tagline" value={f.tagline} onChange={set('tagline')} maxLength={120} />
        <BiInput label="biz.taglineUr" value={f.tagline_ur} onChange={set('tagline_ur')} maxLength={120} dir="rtl" className="ur" />
      </div>
      <BiInput label="biz.address" value={f.address} onChange={set('address')} maxLength={300} />
      <PhoneInput label="biz.whatsapp" value={f.whatsapp} onChange={(whatsapp) => { setOk(false); setF({ ...f, whatsapp }) }} />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="biz.email" type="email" value={f.email} onChange={set('email')} dir="ltr" maxLength={120} />
        <BiInput label="biz.website" value={f.website} onChange={set('website')} dir="ltr" maxLength={160} />
      </div>
      <BiLabel text="biz.type" size="md" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <button key={t} type="button" aria-pressed={f.business_type === t} onClick={() => { setOk(false); setF({ ...f, business_type: f.business_type === t ? '' : t }) }} className={chip(f.business_type === t)}>{pick(`biz.types.${t}`)}</button>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="biz.registration" value={f.registration_no} onChange={set('registration_no')} dir="ltr" maxLength={40} />
        <BiInput label="biz.since" type="number" inputMode="numeric" min={1900} max={2100} value={f.established_year} onChange={set('established_year')} className="num" />
      </div>
      <BiLabel text="biz.province" size="md" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">{PROVINCES.map((t) => <button key={t} type="button" aria-pressed={f.province === t} onClick={() => { setOk(false); setF({ ...f, province: f.province === t ? '' : t }) }} className={chip(f.province === t)}>{pick(`biz.provinces.${t}`)}</button>)}</div>
      <BiInput label="biz.hours" value={f.opening_hours} onChange={set('opening_hours')} maxLength={120} placeholder={pick('biz.hoursPh')} />
      <div className="grid grid-cols-3 gap-2">
        <BiInput label={{ en: 'Facebook', ur: 'فیس بک', roman: 'Facebook' }} value={f.facebook} onChange={set('facebook')} dir="ltr" maxLength={120} />
        <BiInput label={{ en: 'Instagram', ur: 'انسٹاگرام', roman: 'Instagram' }} value={f.instagram} onChange={set('instagram')} dir="ltr" maxLength={120} />
        <BiInput label={{ en: 'TikTok', ur: 'ٹک ٹاک', roman: 'TikTok' }} value={f.tiktok} onChange={set('tiktok')} dir="ltr" maxLength={120} />
      </div>
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} data-testid="save-business" onClick={() => m.mutate({
        legal_name: nz(f.legal_name), tagline: nz(f.tagline), tagline_ur: nz(f.tagline_ur), address: nz(f.address), whatsapp: nz(f.whatsapp),
        business_type: f.business_type || null, registration_no: nz(f.registration_no), established_year: f.established_year ? Number(f.established_year) : null,
        province: f.province || null, email: nz(f.email), website: nz(f.website), opening_hours: nz(f.opening_hours),
        social: { facebook: f.facebook, instagram: f.instagram, tiktok: f.tiktok },
      })} />
    </Card>
  )
}

/** a logo bigger than 512 px is scaled down in the browser before upload (bills stay small) */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), 'image/png'))
  } catch { return file }
}

function OwnerCard({ Card, p }: { Card: CardT; p: Profile }) {
  const [f, setF] = useState({ owner_name: p.owner_name ?? '', owner_cnic: p.owner_cnic ?? '' })
  const { m, ok, setOk } = useSave()
  return (
    <Card icon={<UserRound size={22} />} tone="bg-khata text-khata-fg" title="biz.owner" hint="biz.ownerHint">
      <BiInput label="biz.ownerName" value={f.owner_name} onChange={(e) => { setOk(false); setF({ ...f, owner_name: e.target.value }) }} maxLength={120} />
      <CnicInput label="biz.ownerCnic" value={f.owner_cnic} onChange={(owner_cnic) => { setOk(false); setF({ ...f, owner_cnic }) }} />
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} onClick={() => m.mutate({ owner_name: nz(f.owner_name), owner_cnic: nz(f.owner_cnic) })} />
    </Card>
  )
}

function TaxCard({ Card, p }: { Card: CardT; p: Profile }) {
  const [f, setF] = useState({ ntn: p.ntn ?? '', strn: p.strn ?? '', fbr_pos_id: p.fbr_pos_id ?? '' })
  const { m, ok, setOk } = useSave()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setOk(false); setF({ ...f, [k]: e.target.value }) }
  return (
    <Card icon={<FileText size={22} />} tone="bg-expense text-expense-fg" title="biz.taxTitle" hint="biz.taxHint">
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="settings.ntn" value={f.ntn} onChange={set('ntn')} dir="ltr" placeholder="1234567-8" className="num" />
        <BiInput label="settings.strn" value={f.strn} onChange={set('strn')} dir="ltr" placeholder="13 digits" className="num" />
      </div>
      <BiInput label="biz.fbrPos" value={f.fbr_pos_id} onChange={set('fbr_pos_id')} dir="ltr" maxLength={40} hint="biz.fbrPosHint" />
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} data-testid="save-tax" onClick={() => m.mutate({ ntn: nz(f.ntn), strn: nz(f.strn), fbr_pos_id: nz(f.fbr_pos_id) })} />
    </Card>
  )
}

function CurrencyCard({ Card, p }: { Card: CardT; p: Profile }) {
  const { pick } = useLang()
  const [c, setC] = useState(p.currency ?? { symbol: 'Rs.', position: 'before' as const, decimals: 0 as const })
  const { m, ok, setOk } = useSave(() => setCurrency(c))
  const sample = `45,000${c.decimals === 2 ? '.00' : ''}`
  const preview = c.position === 'after' ? `${sample} ${c.symbol}` : `${c.symbol} ${sample}`
  return (
    <Card icon={<Banknote size={22} />} tone="bg-stockt text-stockt-fg" title="biz.currency" hint="biz.currencyHint">
      <BiLabel text="biz.symbol" size="md" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5" data-testid="currency-symbols">{SYMBOLS.map((s) => <button key={s} type="button" aria-pressed={c.symbol === s} onClick={() => { setOk(false); setC({ ...c, symbol: s }) }} className={chip(c.symbol === s)}>{s}</button>)}</div>
      <BiLabel text="biz.position" size="md" tone="text-muted" />
      <BiSegmented<'before' | 'after'> value={c.position} onChange={(v) => { setOk(false); setC({ ...c, position: v }) }} options={[{ value: 'before', text: 'biz.before' }, { value: 'after', text: 'biz.after' }]} />
      <BiSegmented<'0' | '2'> value={String(c.decimals) as '0' | '2'} onChange={(v) => { setOk(false); setC({ ...c, decimals: v === '2' ? 2 : 0 }) }} options={[{ value: '0', text: 'biz.noPaisa' }, { value: '2', text: 'biz.paisa' }]} />
      <div className="flex items-center justify-between rounded-2xl bg-ground px-4 py-3"><span className="text-sm text-muted">{pick('biz.preview')}</span><span className="num text-lg" dir="ltr" data-testid="currency-preview">{preview}</span></div>
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} data-testid="save-currency" onClick={() => m.mutate({ currency: { symbol: c.symbol, position: c.position, decimals: c.decimals } })} />
    </Card>
  )
}

function PrintCard({ Card, Toggle, p }: { Card: CardT; Toggle: ToggleT; p: Profile }) {
  const [pp, setPp] = useState<Record<string, boolean>>({ ...PRINT_DEFAULT, ...(p.print_prefs ?? {}) })
  const [t, setT] = useState({ terms: p.terms ?? '', terms_ur: p.terms_ur ?? '', bank: p.bank_details?.bank ?? '', title: p.bank_details?.title ?? '', account: p.bank_details?.account ?? '', iban: p.bank_details?.iban ?? '', wallet: p.bank_details?.wallet ?? '' })
  const { m, ok, setOk } = useSave()
  const set = (k: keyof typeof t) => (e: { target: { value: string } }) => { setOk(false); setT({ ...t, [k]: e.target.value }) }
  return (
    <Card icon={<Receipt size={22} />} tone="bg-expense text-expense-fg" title="biz.printTitle" hint="biz.printHint">
      {PRINT.map((k) => <Toggle key={k} on={!!pp[k]} onChange={(v) => { setOk(false); setPp({ ...pp, [k]: v }) }} text={`biz.print.${k}`} />)}
      <BiInput label="biz.terms" value={t.terms} onChange={set('terms')} maxLength={1000} placeholder="No return after 7 days. Warranty by the company." />
      <BiInput label="biz.termsUr" value={t.terms_ur} onChange={set('terms_ur')} maxLength={1000} dir="rtl" className="ur" />
      <BiLabel text="biz.bank" size="md" bold />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="admin.bankName" value={t.bank} onChange={set('bank')} />
        <BiInput label="admin.accountTitle" value={t.title} onChange={set('title')} />
        <BiInput label="admin.accountNumber" value={t.account} onChange={set('account')} dir="ltr" />
        <BiInput label="admin.iban" value={t.iban} onChange={set('iban')} dir="ltr" />
      </div>
      <BiInput label="biz.wallet" value={t.wallet} onChange={set('wallet')} dir="ltr" placeholder="Easypaisa 0300 1234567" />
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} data-testid="save-print" onClick={() => m.mutate({ print_prefs: pp, terms: nz(t.terms), terms_ur: nz(t.terms_ur), bank_details: { bank: t.bank, title: t.title, account: t.account, iban: t.iban, wallet: t.wallet } })} />
    </Card>
  )
}
