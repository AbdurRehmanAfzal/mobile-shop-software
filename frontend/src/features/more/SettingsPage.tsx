import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented } from '@/components/Bilingual'
import { ErrorText, PageHeader, Section } from '@/components/ui'
import { get, patch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useMutation, useQuery } from '@tanstack/react-query'

interface ShopFull {
  id: string
  name: string
  name_ur: string | null
  city: string | null
  phone: string | null
  default_locale: 'en' | 'ur'
  tax_enabled: boolean
  is_active: boolean
}

export default function SettingsPage() {
  const shopKey = useAuth((s) => s.activeShopId)
  const { data } = useQuery({ queryKey: [shopKey, 'shop-full'], queryFn: () => get<ShopFull>('/api/v1/shops/current') })
  const [f, setF] = useState<Record<string, string | boolean>>({})
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (data) setF({ name: data.name, name_ur: data.name_ur ?? '', city: data.city ?? '', phone: data.phone ?? '', default_locale: data.default_locale, tax_enabled: data.tax_enabled, tax_rate: '', tax_inclusive: true, ntn: '', strn: '', receipt_footer: '', receipt_footer_ur: '', invoice_prefix: '' })
  }, [data])
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<ShopFull>('/api/v1/shops/current', body),
    onSuccess: () => setSaved(true),
  })
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const text = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : '')

  function submit() {
    const body: Record<string, unknown> = { name: f.name, name_ur: f.name_ur || null, city: f.city || null, phone: f.phone || null, default_locale: f.default_locale, tax_enabled: !!f.tax_enabled, tax_inclusive: !!f.tax_inclusive }
    for (const k of ['tax_rate', 'ntn', 'strn', 'receipt_footer', 'receipt_footer_ur', 'invoice_prefix']) if (text(k)) body[k] = k === 'tax_rate' ? Number(text(k)) : text(k)
    m.mutate(body)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="settings.title" />
      <Section title="settings.name">
        <BiInput label="settings.name" value={text('name')} onChange={set('name')} />
        <BiInput label="settings.nameUr" value={text('name_ur')} onChange={set('name_ur')} dir="rtl" className="ur" />
        <BiInput label="settings.city" value={text('city')} onChange={set('city')} />
        <BiInput label="settings.phone" value={text('phone')} onChange={set('phone')} />
        <BiLabel text="settings.defaultLocale" size="md" tone="text-muted" />
        <BiSegmented value={(f.default_locale as 'en' | 'ur') ?? 'ur'} onChange={(v) => setF({ ...f, default_locale: v })} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی' } }]} />
      </Section>
      <Section title="settings.tax">
        <label className="card flex items-center gap-3">
          <input type="checkbox" checked={!!f.tax_enabled} onChange={(e) => setF({ ...f, tax_enabled: e.target.checked })} className="h-6 w-6 accent-[#136F56]" />
          <BiLabel text="settings.taxEnabled" size="md" className="flex-1" />
        </label>
        {f.tax_enabled ? (
          <>
            <BiInput label="settings.taxRate" type="number" inputMode="decimal" min={0} max={100} value={text('tax_rate')} onChange={set('tax_rate')} placeholder="18" />
            <label className="card flex items-center gap-3">
              <input type="checkbox" checked={!!f.tax_inclusive} onChange={(e) => setF({ ...f, tax_inclusive: e.target.checked })} className="h-6 w-6 accent-[#136F56]" />
              <BiLabel text="settings.taxInclusive" size="md" className="flex-1" />
            </label>
            <BiInput label="settings.ntn" value={text('ntn')} onChange={set('ntn')} />
            <BiInput label="settings.strn" value={text('strn')} onChange={set('strn')} />
          </>
        ) : null}
      </Section>
      <Section title="sale.receipt">
        <BiInput label="settings.invoicePrefix" value={text('invoice_prefix')} onChange={set('invoice_prefix')} placeholder="INV" />
        <BiInput label="settings.footer" value={text('receipt_footer')} onChange={set('receipt_footer')} />
        <BiInput label="settings.footerUr" value={text('receipt_footer_ur')} onChange={set('receipt_footer_ur')} dir="rtl" className="ur" />
      </Section>
      <ErrorText error={m.error} />
      {saved ? <BiLabel text="settings.saved" size="md" tone="text-emerald-deep" bold align="center" /> : null}
      <BiButton text="common.save" full loading={m.isPending} onClick={submit} />
    </div>
  )
}
