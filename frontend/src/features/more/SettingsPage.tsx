/** Shop settings. Owner 2026-10-29: on the v2 look — one card per topic (shop, language, staff login,
 *  tax, receipt) with its own icon well, big switches, a receipt footer preview, a save bar that
 *  stays in reach, and a plain "Saved" message. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Check, Tablet, Fingerprint, Gauge, Languages, Percent, Receipt, ShieldCheck, Store, Tag } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { ErrorText, Loading, PageHeader } from '@/components/ui'
import { get, patch } from '@/lib/api'
import BarcodeCard from './BarcodeCard'
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
  label_code_word: string | null
  sale_rules: { below_asking: Rule; asking_change: Rule } | null
  audit_prefs: AuditPrefs | null
  item_prefs: ItemPrefs | null
  device_prefs: { grades?: string[]; require_lock_check?: boolean } | null
}
interface ItemPrefs { valuation?: 'avg' | 'fifo'; allow_negative_stock?: boolean; units?: Record<string, number> }
interface AuditPrefs { age_bands: number[]; high_value: number; low_margin_pct: number; top_share: number; low_units: number; bypass_share: number; bypass_min: number }
const DEFAULT_AUDIT_PREFS: AuditPrefs = { age_bands: [15, 30, 60, 90], high_value: 50000, low_margin_pct: 5, top_share: 20, low_units: 1, bypass_share: 50, bypass_min: 3 }
type Rule = 'allow' | 'manager' | 'pin'

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

      <BarcodeCard Card={Card} />
      <CodeWordCard current={data?.label_code_word ?? null} />
      <SaleRulesCard current={data?.sale_rules ?? null} />
      <AuditPrefsCard current={data?.audit_prefs ?? null} />
      <ItemPrefsCard current={data?.item_prefs ?? null} />
      <DevicePrefsCard current={data?.device_prefs ?? null} />

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

/** the 10 different letters that spell the buying price on a sticker (BLACKHORSE: 4 = K, 5 = H…) */
function CodeWordCard({ current }: { current: string | null }) {
  const { pick } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [w, setW] = useState(current ?? '')
  const [ok, setOk] = useState(false)
  useEffect(() => setW(current ?? ''), [current])
  const word = w.toUpperCase().replace(/[^A-Z]/g, '')
  const valid = word.length === 10 && new Set(word).size === 10
  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { label_code_word: valid ? word : null }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }) },
  })
  const sample = (word.length === 10 ? word : 'BLACKHORSE')
  const demo = '45000'.split('').map((d) => sample[Number(d)]).join('')
  return (
    <Card icon={<Tag size={22} />} tone="bg-stockt text-stockt-fg" title="settings.codeWord" hint="settings.codeWordHint">
      <BiInput label="settings.codeWordLabel" value={w} onChange={(e) => { setOk(false); setW(e.target.value.toUpperCase()) }} maxLength={10} dir="ltr" className="num tracking-[.2em]" error={w && !valid ? 'settings.codeWordBad' : null} hint={{ en: `${pick('settings.codeWordExample')}: 45000 = ${demo}`, ur: `${pick('settings.codeWordExample')}: 45000 = ${demo}`, roman: `${pick('settings.codeWordExample')}: 45000 = ${demo}` }} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full disabled={(!!w && !valid) || (word === (current ?? '') && !ok)} loading={m.isPending} onClick={() => m.mutate()} />
    </Card>
  )
}

/** who may sell under the asking price and who may change it (owner 2026-10-30, anti-fraud) */
function SaleRulesCard({ current }: { current: { below_asking: Rule; asking_change: Rule } | null }) {
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [r, setR] = useState<{ below_asking: Rule; asking_change: Rule }>(current ?? { below_asking: 'manager', asking_change: 'manager' })
  const [ok, setOk] = useState(false)
  useEffect(() => { if (current) setR(current) }, [current])
  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { sale_rules: r }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }) },
  })
  const opts = [{ value: 'allow' as Rule, text: 'rules.allow' }, { value: 'manager' as Rule, text: 'rules.manager' }, { value: 'pin' as Rule, text: 'rules.pin' }]
  return (
    <Card icon={<ShieldCheck size={22} />} tone="bg-expense text-expense-fg" title="rules.title" hint="rules.hint">
      <BiLabel text="rules.belowAsking" size="md" bold />
      <BiSegmented<Rule> value={r.below_asking} onChange={(v) => { setOk(false); setR({ ...r, below_asking: v }) }} options={opts} />
      <BiLabel text="rules.askingChange" size="md" bold />
      <BiSegmented<Rule> value={r.asking_change} onChange={(v) => { setOk(false); setR({ ...r, asking_change: v }) }} options={opts} />
      <BiLabel text="rules.pinNote" size="sm" tone="text-muted" />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} onClick={() => m.mutate()} />
    </Card>
  )
}

/** the shop's own thresholds for the stock audit (docs/16 §9: never hard-coded) */
function AuditPrefsCard({ current }: { current: AuditPrefs | null }) {
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [p, setP] = useState<AuditPrefs>(current ?? DEFAULT_AUDIT_PREFS)
  const [ok, setOk] = useState(false)
  useEffect(() => { if (current) setP({ ...DEFAULT_AUDIT_PREFS, ...current }) }, [current])
  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { audit_prefs: p }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }) },
  })
  const band = (i: number, v: string) => { setOk(false); const b = [...p.age_bands]; b[i] = Number(v); setP({ ...p, age_bands: b }) }
  const num = (k: keyof AuditPrefs, v: string) => { setOk(false); setP({ ...p, [k]: Number(v) }) }
  const valid = p.age_bands.every((b, i) => b > 0 && (i === 0 || b > p.age_bands[i - 1]))
  return (
    <Card icon={<Gauge size={22} />} tone="bg-stockt text-stockt-fg" title="audit.prefs.title" hint="audit.prefs.hint">
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="audit.prefs.fresh" type="number" inputMode="numeric" min={1} value={String(p.age_bands[0])} onChange={(e) => band(0, e.target.value)} className="num" />
        <BiInput label="audit.prefs.normal" type="number" inputMode="numeric" min={1} value={String(p.age_bands[1])} onChange={(e) => band(1, e.target.value)} className="num" />
        <BiInput label="audit.prefs.slow" type="number" inputMode="numeric" min={1} value={String(p.age_bands[2])} onChange={(e) => band(2, e.target.value)} className="num" />
        <BiInput label="audit.prefs.attention" type="number" inputMode="numeric" min={1} value={String(p.age_bands[3])} onChange={(e) => band(3, e.target.value)} className="num" />
        <BiInput label="audit.prefs.highValue" type="number" inputMode="numeric" min={0} value={String(p.high_value)} onChange={(e) => num('high_value', e.target.value)} className="num" />
        <BiInput label="audit.prefs.lowMargin" type="number" inputMode="decimal" min={0} value={String(p.low_margin_pct)} onChange={(e) => num('low_margin_pct', e.target.value)} className="num" />
        <BiInput label="audit.prefs.bypassMin" type="number" inputMode="numeric" min={0} value={String(p.bypass_min)} onChange={(e) => num('bypass_min', e.target.value)} className="num" />
        <BiInput label="audit.prefs.bypassShare" type="number" inputMode="numeric" min={0} max={100} value={String(p.bypass_share)} onChange={(e) => num('bypass_share', e.target.value)} className="num" />
      </div>
      {!valid ? <BiAlert text="audit.prefs.bandsOrder" /> : null}
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} disabled={!valid} onClick={() => m.mutate()} />
    </Card>
  )
}

/** how counted items are valued, whether the count may go below zero, and the shop's units
 *  (owner addendum 5, docs/24 §A) */
function ItemPrefsCard({ current }: { current: ItemPrefs | null }) {
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [p, setP] = useState<{ valuation: 'avg' | 'fifo'; allow_negative_stock: boolean; dozen: string; box: string; carton: string }>({ valuation: 'avg', allow_negative_stock: false, dozen: '12', box: '10', carton: '120' })
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (current) setP({ valuation: current.valuation ?? 'avg', allow_negative_stock: !!current.allow_negative_stock, dozen: String(current.units?.dozen ?? 12), box: String(current.units?.box ?? 10), carton: String(current.units?.carton ?? 120) })
  }, [current])
  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { item_prefs: { valuation: p.valuation, allow_negative_stock: p.allow_negative_stock, units: { piece: 1, dozen: Number(p.dozen) || 12, box: Number(p.box) || 10, carton: Number(p.carton) || 120 } } }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }); void qc.invalidateQueries({ queryKey: [shopKey, 'item-options'] }) },
  })
  return (
    <Card icon={<Boxes size={22} />} tone="bg-stockt text-stockt-fg" title="acc.prefs.title" hint="acc.prefs.hint">
      <BiLabel text="acc.prefs.valuation" size="md" bold />
      <BiSegmented<'avg' | 'fifo'> value={p.valuation} onChange={(v) => { setOk(false); setP({ ...p, valuation: v }) }} options={[{ value: 'avg', text: 'acc.prefs.avg' }, { value: 'fifo', text: 'acc.prefs.fifo' }]} />
      <Toggle on={p.allow_negative_stock} onChange={(v) => { setOk(false); setP({ ...p, allow_negative_stock: v }) }} text="acc.prefs.negative" hint="acc.prefs.negativeHint" />
      <BiLabel text="acc.prefs.units" size="md" bold />
      <div className="grid grid-cols-3 gap-2">
        <BiInput label="acc.units.dozen" type="number" inputMode="numeric" min={1} value={p.dozen} onChange={(e) => { setOk(false); setP({ ...p, dozen: e.target.value }) }} className="num" />
        <BiInput label="acc.units.box" type="number" inputMode="numeric" min={1} value={p.box} onChange={(e) => { setOk(false); setP({ ...p, box: e.target.value }) }} className="num" />
        <BiInput label="acc.units.carton" type="number" inputMode="numeric" min={1} value={p.carton} onChange={(e) => { setOk(false); setP({ ...p, carton: e.target.value }) }} className="num" />
      </div>
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} onClick={() => m.mutate()} />
    </Card>
  )
}

/** lock check for used mobiles, grades of used units (owner addendum 6, docs/26 §A) */
function DevicePrefsCard({ current }: { current: { grades?: string[]; require_lock_check?: boolean } | null }) {
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [p, setP] = useState({ require_lock_check: false, grades: 'a, b, refurbished, copy' })
  const [ok, setOk] = useState(false)
  useEffect(() => { if (current) setP({ require_lock_check: !!current.require_lock_check, grades: (current.grades ?? ['a', 'b', 'refurbished', 'copy']).join(', ') }) }, [current])
  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { device_prefs: { require_lock_check: p.require_lock_check, grades: p.grades.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean) } }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }); void qc.invalidateQueries({ queryKey: [shopKey, 'device-options'] }) },
  })
  return (
    <Card icon={<Tablet size={22} />} tone="bg-stockt text-stockt-fg" title="devx.prefs.title" hint="devx.prefs.hint">
      <Toggle on={p.require_lock_check} onChange={(v) => { setOk(false); setP({ ...p, require_lock_check: v }) }} text="devx.prefs.requireLock" hint="devx.prefs.requireLockHint" />
      <BiInput label="devx.prefs.grades" value={p.grades} onChange={(e) => { setOk(false); setP({ ...p, grades: e.target.value }) }} dir="ltr" />
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} onClick={() => m.mutate()} />
    </Card>
  )
}
