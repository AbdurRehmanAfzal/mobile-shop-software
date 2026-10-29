/** Shop settings. Owner 2026-10-29: on the v2 look — one card per topic (shop, language, staff login,
 *  tax, receipt) with its own icon well, big switches, a receipt footer preview, a save bar that
 *  stays in reach, and a plain "Saved" message. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Fingerprint, Languages, Percent, Receipt, Store } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { ErrorText, Loading, PageHeader } from '@/components/ui'
import { get, patch } from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface ShopFull {
  id: string
  name: string
  name_ur: string | null
  city: string | null
  phone: string | null
  default_locale: 'en' | 'ur'
  tax_enabled: boolean
  is_active: boolean
  ntn: string | null
  strn: string | null
  tax_rate: string
  tax_inclusive: boolean
  receipt_footer: string | null
  receipt_footer_ur: string | null
  invoice_prefix: string
  fingerprint_staff: boolean
}

type Form = { name: string; city: string; phone: string; default_locale: 'en' | 'ur'; tax_enabled: boolean; tax_rate: string; tax_inclusive: boolean; ntn: string; strn: string; receipt_footer: string; receipt_footer_ur: string; invoice_prefix: string; fingerprint_staff: boolean }

function Card({ icon, tone, title, hint, children }: { icon: ReactNode; tone: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`well h-11 w-11 shrink-0 rounded-2xl ${tone}`}>{icon}</span>
        <span className="flex min-w-0 flex-col">
          <BiLabel text={title} size="md" bold />
          {hint ? <BiLabel text={hint} size="sm" tone="text-muted" /> : null}
        </span>
      </div>
      {children}
    </section>
  )
}

/** a big on/off row instead of a tiny checkbox */
function Toggle({ on, onChange, text, hint }: { on: boolean; onChange: (v: boolean) => void; text: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="tap flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-ground px-4 py-2 text-start">
      <span className="flex min-w-0 flex-1 flex-col">
        <BiLabel text={text} size="md" bold />
        {hint ? <BiLabel text={hint} size="sm" tone="text-muted" /> : null}
      </span>
      <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${on ? 'bg-emerald' : 'bg-line'}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

export default function SettingsPage() {
  const shopKey = useAuth((s) => s.activeShopId)
  const qc = useQueryClient()
  const { pick, ur, cls } = useLang()
  const { data } = useQuery({ queryKey: [shopKey, 'shop-full'], queryFn: () => get<ShopFull>('/api/v1/shops/current') })
  const [f, setF] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (data)
      setF({
        name: data.name, city: data.city ?? '', phone: data.phone ?? '', default_locale: data.default_locale,
        tax_enabled: data.tax_enabled, tax_rate: Number(data.tax_rate) ? String(Number(data.tax_rate)) : '', tax_inclusive: data.tax_inclusive,
        ntn: data.ntn ?? '', strn: data.strn ?? '', receipt_footer: data.receipt_footer ?? '', receipt_footer_ur: data.receipt_footer_ur ?? '', invoice_prefix: data.invoice_prefix ?? 'INV', fingerprint_staff: !!data.fingerprint_staff,
      })
  }, [data])
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<ShopFull>('/api/v1/shops/current', body),
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] })
      void qc.invalidateQueries({ queryKey: [shopKey, 'me'] })
    },
  })
  if (!f) return <><PageHeader title="settings.title" /><Loading /></>
  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setSaved(false); setF({ ...f, [k]: e.target.value }) }
  const flag = (k: 'tax_enabled' | 'tax_inclusive' | 'fingerprint_staff') => (v: boolean) => { setSaved(false); setF({ ...f, [k]: v }) }
  const dirty = !!data && JSON.stringify(f) !== JSON.stringify({
    name: data.name, city: data.city ?? '', phone: data.phone ?? '', default_locale: data.default_locale,
    tax_enabled: data.tax_enabled, tax_rate: Number(data.tax_rate) ? String(Number(data.tax_rate)) : '', tax_inclusive: data.tax_inclusive,
    ntn: data.ntn ?? '', strn: data.strn ?? '', receipt_footer: data.receipt_footer ?? '', receipt_footer_ur: data.receipt_footer_ur ?? '', invoice_prefix: data.invoice_prefix ?? 'INV', fingerprint_staff: !!data.fingerprint_staff,
  })

  function submit() {
    m.mutate({
      name: f!.name, name_ur: null, city: f!.city || null, phone: f!.phone || null, default_locale: f!.default_locale,
      tax_enabled: f!.tax_enabled, tax_inclusive: f!.tax_inclusive, tax_rate: Number(f!.tax_rate || 0),
      ntn: f!.ntn || null, strn: f!.strn || null, receipt_footer: f!.receipt_footer || null, receipt_footer_ur: f!.receipt_footer_ur || null,
      invoice_prefix: f!.invoice_prefix || 'INV',
      fingerprint_staff: f!.fingerprint_staff,
    })
  }

  const footer = f.default_locale === 'ur' ? f.receipt_footer_ur || f.receipt_footer : f.receipt_footer || f.receipt_footer_ur

  return (
    <div className="flex flex-col gap-3 pb-24">
      <PageHeader title="settings.title" />
      <Card icon={<Store size={22} />} tone="bg-sell text-sell-fg" title="settings.shop" hint="settings.shopHint">
        <BiInput label="settings.name" value={f.name} onChange={set('name')} />
        <div className="grid grid-cols-2 gap-2">
          <BiInput label="settings.city" value={f.city} onChange={set('city')} />
          <PhoneInput label="settings.phone" value={f.phone} onChange={(phone) => { setSaved(false); setF({ ...f, phone }) }} />
        </div>
      </Card>

      <Card icon={<Languages size={22} />} tone="bg-khata text-khata-fg" title="settings.language" hint="settings.languageHint">
        <BiSegmented value={f.default_locale} onChange={(v) => { setSaved(false); setF({ ...f, default_locale: v }) }} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو', roman: 'Urdu' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی', roman: 'English' } }]} />
      </Card>

      <Card icon={<Fingerprint size={22} />} tone="bg-stockt text-stockt-fg" title="settings.staffLogin">
        <Toggle on={f.fingerprint_staff} onChange={flag('fingerprint_staff')} text="fp.staffAllowed" hint="settings.fingerprintHint" />
      </Card>

      <Card icon={<Percent size={22} />} tone="bg-expense text-expense-fg" title="settings.tax" hint="settings.taxHint">
        <Toggle on={f.tax_enabled} onChange={flag('tax_enabled')} text="settings.taxEnabled" />
        {f.tax_enabled ? (
          <>
            <BiInput label="settings.taxRate" type="number" inputMode="decimal" min={0} max={100} value={f.tax_rate} onChange={set('tax_rate')} placeholder="18" className="num" />
            <Toggle on={f.tax_inclusive} onChange={flag('tax_inclusive')} text="settings.taxInclusive" />
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="settings.ntn" value={f.ntn} onChange={set('ntn')} dir="ltr" />
              <BiInput label="settings.strn" value={f.strn} onChange={set('strn')} dir="ltr" />
            </div>
          </>
        ) : null}
      </Card>

      <Card icon={<Receipt size={22} />} tone="bg-buy text-buy-fg" title="sale.receipt" hint="settings.receiptHint">
        <BiInput label="settings.invoicePrefix" value={f.invoice_prefix} onChange={set('invoice_prefix')} placeholder="INV" maxLength={10} dir="ltr" hint={{ en: `${pick('settings.example')}: ${(f.invoice_prefix || 'INV').toUpperCase()}-000123`, ur: `${pick('settings.example')}: ${(f.invoice_prefix || 'INV').toUpperCase()}-000123`, roman: `${pick('settings.example')}: ${(f.invoice_prefix || 'INV').toUpperCase()}-000123` }} />
        <BiInput label="settings.footer" value={f.receipt_footer} onChange={set('receipt_footer')} dir="ltr" />
        <BiInput label="settings.footerUr" value={f.receipt_footer_ur} onChange={set('receipt_footer_ur')} dir="rtl" className="ur" />
        {footer ? (
          <div className="rounded-2xl border border-dashed border-line bg-ground px-4 py-3 text-center">
            <BiLabel text="settings.footerPreview" size="sm" tone="text-muted" align="center" />
            <div className={`mt-1 text-sm font-semibold ${f.default_locale === 'ur' && f.receipt_footer_ur ? 'ur' : ''}`} dir={f.default_locale === 'ur' && f.receipt_footer_ur ? 'rtl' : 'ltr'}>{footer}</div>
          </div>
        ) : null}
      </Card>

      <ErrorText error={m.error} />
      {saved ? <BiAlert text="settings.saved" kind="success" /> : null}

      {dirty || m.isPending || m.isError ? (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-xl px-4 lg:bottom-4">
          <BiButton text="common.save" icon={<Check size={22} />} full loading={m.isPending} onClick={submit} className="shadow-hero" />
          <div className={`mt-1 text-center text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('settings.unsaved')}</div>
        </div>
      ) : null}
    </div>
  )
}
