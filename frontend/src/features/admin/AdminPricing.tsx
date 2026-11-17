/** Website prices (owner 2026-11-16, ADR-092): what the landing page shows — the monthly price and
 *  one-time setup fee of each plan, how many months a year paid at once costs, the trial days, and
 *  add-ons sold separately. A shop's own fee is still set on that shop. */

import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { MODULE_KEYS } from '@/lib/modules'
import { useGet, useInvalidate } from '@/lib/queries'

interface Addon { en: string; ur: string; roman: string; price: number | string; per: 'month' | 'year' | 'once' }
interface Pricing { prices: Record<string, number | string>; setup_fee: Record<string, number | string>; yearly_paid_months: number | string; trial_days: number | string; addons: Addon[]; module_prices?: Record<string, number | string>; discount_per_year?: number | string; max_years?: number | string; sale_pct?: number | string; sale_until?: string }
const PLANS = ['basic', 'pro', 'chain'] as const

export default function AdminPricing() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [open, setOpen] = useState(false)
  const { data } = useGet<Pricing>(['admin-pricing'], open ? '/api/v1/admin/pricing' : null)
  const [p, setP] = useState<Pricing | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { if (data && open) setP(JSON.parse(JSON.stringify(data))) }, [data, open])
  const num = (v: number | string) => Number(v || 0)

  async function save() {
    if (!p) return
    setBusy(true)
    setErr(null)
    try {
      await api('PUT', '/api/v1/admin/pricing', {
        prices: Object.fromEntries(PLANS.map((k) => [k, num(p.prices[k])])),
        setup_fee: Object.fromEntries(PLANS.map((k) => [k, num(p.setup_fee[k])])),
        yearly_paid_months: num(p.yearly_paid_months),
        trial_days: num(p.trial_days),
        module_prices: Object.fromEntries(MODULE_KEYS.map((k) => [k, num(p.module_prices?.[k] ?? 0)])),
        discount_per_year: num(p.discount_per_year ?? 5),
        max_years: num(p.max_years ?? 5),
        sale_pct: num(p.sale_pct ?? 0),
        sale_until: p.sale_until || null,
        addons: p.addons.filter((a) => a.en.trim()).map((a) => ({ ...a, price: num(a.price) })),
      })
      await inv('admin-pricing')
      setOpen(false)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`tap rounded-full border border-line px-3 py-1.5 text-xs font-bold ${ur ? cls('sm') : ''}`} data-testid="pricing-open">{pick('admin.pricing')}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="admin.pricing">
        {p ? (
          <div className="flex flex-col gap-3" data-testid="pricing-sheet">
            <span className="flex items-center gap-1"><BiLabel text="admin.pricingHint" size="sm" tone="text-muted" /><Help term="admin.pricing" size="sm" /></span>
            {PLANS.map((k) => (
              <div key={k} className="grid grid-cols-2 gap-2 rounded-2xl border border-line p-3">
                <span className="col-span-2 text-sm font-extrabold capitalize">{k}</span>
                <BiInput label="admin.priceMonth" type="number" inputMode="numeric" min={0} value={p.prices[k]} onChange={(e) => setP({ ...p, prices: { ...p.prices, [k]: e.target.value } })} className="num" data-testid={`price-${k}`} />
                <BiInput label="admin.priceSetup" type="number" inputMode="numeric" min={0} value={p.setup_fee[k]} onChange={(e) => setP({ ...p, setup_fee: { ...p.setup_fee, [k]: e.target.value } })} className="num" data-testid={`setup-${k}`} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="admin.yearMonths" type="number" inputMode="numeric" min={1} max={12} value={p.yearly_paid_months} onChange={(e) => setP({ ...p, yearly_paid_months: e.target.value })} className="num" />
              <BiInput label="admin.trialDays" type="number" inputMode="numeric" min={0} max={90} value={p.trial_days} onChange={(e) => setP({ ...p, trial_days: e.target.value })} className="num" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="admin.discountYear" type="number" inputMode="numeric" min={0} max={15} value={p.discount_per_year ?? 5} onChange={(e) => setP({ ...p, discount_per_year: e.target.value })} className="num" data-testid="discount-year" />
              <BiInput label="admin.maxYears" type="number" inputMode="numeric" min={1} max={5} value={p.max_years ?? 5} onChange={(e) => setP({ ...p, max_years: e.target.value })} className="num" data-testid="max-years" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="admin.salePct" type="number" inputMode="numeric" min={0} max={90} value={p.sale_pct ?? 0} onChange={(e) => setP({ ...p, sale_pct: e.target.value })} className="num" data-testid="sale-pct" />
              <BiInput label="admin.saleUntil" type="date" value={p.sale_until ?? ''} onChange={(e) => setP({ ...p, sale_until: e.target.value })} dir="ltr" data-testid="sale-until" />
            </div>
            <BiLabel text="admin.modulePrices" size="md" bold />
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line p-3">
              {MODULE_KEYS.map((k) => (
                <BiInput key={k} label={`modules.${k}`} type="number" inputMode="numeric" min={0} value={p.module_prices?.[k] ?? 0} onChange={(e) => setP({ ...p, module_prices: { ...(p.module_prices ?? {}), [k]: e.target.value } })} className="num" data-testid={`module-price-${k}`} />
              ))}
            </div>
            <BiLabel text="admin.addons" size="md" bold />
            {p.addons.map((a, i) => {
              const set = (patch: Partial<Addon>) => setP({ ...p, addons: p.addons.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl border border-line p-3">
                  <div className="col-span-2"><BiInput label="admin.addonEn" value={a.en} onChange={(e) => set({ en: e.target.value })} /></div>
                  <BiInput label="admin.addonUr" value={a.ur} onChange={(e) => set({ ur: e.target.value })} />
                  <BiInput label="admin.addonRoman" value={a.roman} onChange={(e) => set({ roman: e.target.value })} />
                  <BiInput label="admin.addonPrice" type="number" inputMode="numeric" min={0} value={a.price} onChange={(e) => set({ price: e.target.value })} className="num" />
                  <label className="flex flex-col gap-1"><BiLabel text="admin.addonPer" size="sm" tone="text-muted" /><select value={a.per} onChange={(e) => set({ per: e.target.value as Addon['per'] })} className="min-h-12 rounded-2xl border border-line bg-surface px-3 text-sm font-bold">{(['month', 'year', 'once'] as const).map((x) => <option key={x} value={x}>{pick(`landing.per.${x}`)}</option>)}</select></label>
                  <button type="button" onClick={() => setP({ ...p, addons: p.addons.filter((_, j) => j !== i) })} className="tap col-span-2 flex min-h-10 items-center justify-center gap-1 rounded-xl text-sm font-bold text-payable"><Trash2 size={15} />{pick('crud.delete')}</button>
                </div>
              )
            })}
            <button type="button" onClick={() => setP({ ...p, addons: [...p.addons, { en: '', ur: '', roman: '', price: '', per: 'once' }] })} className="tap flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-sm font-bold" data-testid="addon-add"><Plus size={16} />{pick('admin.addonAdd')}</button>
            <ErrorText error={err} />
            <BiButton text="common.save" full loading={busy} onClick={() => void save()} data-testid="pricing-save" />
          </div>
        ) : null}
      </Sheet>
    </>
  )
}
