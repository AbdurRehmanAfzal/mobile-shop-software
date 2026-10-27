/** Shop settings in three cards (shop, tax, receipt), each with an icon. Opens with what was saved. */

import { Percent, Receipt, Store } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented } from '@/components/Bilingual'
import { ErrorText, PageHeader } from '@/components/ui'
import { get, patch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'

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
}

type Form = { name: string; city: string; phone: string; default_locale: 'en' | 'ur'; tax_enabled: boolean; tax_rate: string; tax_inclusive: boolean; ntn: string; strn: string; receipt_footer: string; receipt_footer_ur: string; invoice_prefix: string }

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep">{icon}</span>
        <BiLabel text={title} size="lg" bold />
      </div>
      {children}
    </section>
  )
}

/** a big on/off row instead of a tiny checkbox */
function Toggle({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="tap flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-ground px-4 text-start">
      <BiLabel text={text} size="md" className="flex-1" />
      <span className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${on ? 'bg-emerald' : 'bg-line'}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

export default function SettingsPage() {
  const shopKey = useAuth((s) => s.activeShopId)
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: [shopKey, 'shop-full'], queryFn: () => get<ShopFull>('/api/v1/shops/current') })
  const [f, setF] = useState<Form | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (data)
      setF({
        name: data.name, city: data.city ?? '', phone: data.phone ?? '', default_locale: data.default_locale,
        tax_enabled: data.tax_enabled, tax_rate: Number(data.tax_rate) ? String(Number(data.tax_rate)) : '', tax_inclusive: data.tax_inclusive,
        ntn: data.ntn ?? '', strn: data.strn ?? '', receipt_footer: data.receipt_footer ?? '', receipt_footer_ur: data.receipt_footer_ur ?? '', invoice_prefix: data.invoice_prefix ?? 'INV',
      })
  }, [data])
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<ShopFull>('/api/v1/shops/current', body),
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] })
    },
  })
  if (!f) return <PageHeader title="settings.title" />
  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setSaved(false); setF({ ...f, [k]: e.target.value }) }
  const flag = (k: 'tax_enabled' | 'tax_inclusive') => (v: boolean) => { setSaved(false); setF({ ...f, [k]: v }) }

  function submit() {
    m.mutate({
      name: f!.name, name_ur: null, city: f!.city || null, phone: f!.phone || null, default_locale: f!.default_locale,
      tax_enabled: f!.tax_enabled, tax_inclusive: f!.tax_inclusive, tax_rate: Number(f!.tax_rate || 0),
      ntn: f!.ntn || null, strn: f!.strn || null, receipt_footer: f!.receipt_footer || null, receipt_footer_ur: f!.receipt_footer_ur || null,
      invoice_prefix: f!.invoice_prefix || 'INV',
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="settings.title" />
      <Card icon={<Store size={20} />} title="settings.shop">
        <BiInput label="settings.name" value={f.name} onChange={set('name')} />
        <BiInput label="settings.city" value={f.city} onChange={set('city')} />
        <BiInput label="settings.phone" type="tel" inputMode="numeric" value={f.phone} onChange={set('phone')} />
        <BiLabel text="settings.defaultLocale" size="md" tone="text-muted" />
        <BiSegmented value={f.default_locale} onChange={(v) => { setSaved(false); setF({ ...f, default_locale: v }) }} options={[{ value: 'ur', text: { en: 'Urdu', ur: 'اردو', roman: 'Urdu' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی', roman: 'English' } }]} />
      </Card>
      <Card icon={<Percent size={20} />} title="settings.tax">
        <Toggle on={f.tax_enabled} onChange={flag('tax_enabled')} text="settings.taxEnabled" />
        {f.tax_enabled ? (
          <>
            <BiInput label="settings.taxRate" type="number" inputMode="decimal" min={0} max={100} value={f.tax_rate} onChange={set('tax_rate')} placeholder="18" />
            <Toggle on={f.tax_inclusive} onChange={flag('tax_inclusive')} text="settings.taxInclusive" />
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="settings.ntn" value={f.ntn} onChange={set('ntn')} />
              <BiInput label="settings.strn" value={f.strn} onChange={set('strn')} />
            </div>
          </>
        ) : null}
      </Card>
      <Card icon={<Receipt size={20} />} title="sale.receipt">
        <BiInput label="settings.invoicePrefix" value={f.invoice_prefix} onChange={set('invoice_prefix')} placeholder="INV" maxLength={10} />
        <BiInput label="settings.footer" value={f.receipt_footer} onChange={set('receipt_footer')} />
        <BiInput label="settings.footerUr" value={f.receipt_footer_ur} onChange={set('receipt_footer_ur')} dir="rtl" className="ur" />
      </Card>
      <ErrorText error={m.error} />
      {saved ? (
        <div className="flex items-center justify-center gap-2 text-emerald-deep">
          <Check size={20} />
          <BiLabel text="settings.saved" size="md" bold tone="text-current" />
        </div>
      ) : null}
      <BiButton text="common.save" icon={<Check size={20} />} full loading={m.isPending} onClick={submit} />
    </div>
  )
}
