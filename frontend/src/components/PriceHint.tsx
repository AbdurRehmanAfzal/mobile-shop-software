/** Rate suggestion (owner 2026-10-30): what this shop sold the same model for lately, next to the
 *  price box, with one tap to take it. Reads only the shop's own sales. */

import { TrendingUp } from 'lucide-react'
import { BiLabel, useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useGet } from '@/lib/queries'

export interface PriceHintData {
  basis: 'exact' | 'condition' | 'model' | 'none'
  samples: number
  in_stock_same: number
  stock_asking_low: string | null
  stock_asking_high: string | null
  last: { price: string; date: string; days_to_sell: number | null } | null
  median: string | null
  low: string | null
  high: string | null
  suggested: string | null
  avg_days_to_sell: number | null
  cost_median: string | null
}
const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function PriceHint({ modelId, storageId, condition, excludeDeviceId, onUse }: { modelId: string | null | undefined; storageId?: string | null; condition?: string | null; excludeDeviceId?: string; onUse?: (price: number) => void }) {
  const { pick, ur, cls } = useLang()
  const q = new URLSearchParams()
  if (modelId) q.set('model_id', modelId)
  if (storageId) q.set('storage_id', storageId)
  if (condition) q.set('condition', condition)
  if (excludeDeviceId) q.set('exclude_device_id', excludeDeviceId)
  const { data } = useGet<PriceHintData>(['price-hint', q.toString()], modelId ? `/api/v1/devices/price-hint?${q}` : null)
  if (!modelId || !data || (data.samples === 0 && data.in_stock_same === 0)) return null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const lines: string[] = []
  if (data.last) lines.push(`${pick('hint.last').replace('{{p}}', n(data.last.price)).replace('{{d}}', fmtDate(data.last.date))}${data.last.days_to_sell != null ? ` · ${pick('hint.soldIn').replace('{{n}}', String(data.last.days_to_sell))}` : ''}`)
  if (data.samples > 1) lines.push(pick('hint.range').replace('{{n}}', String(data.samples)).replace('{{a}}', n(data.low)).replace('{{b}}', n(data.high)))
  if (data.cost_median) lines.push(pick('hint.cost').replace('{{p}}', n(data.cost_median)))
  if (data.in_stock_same) lines.push(pick('hint.inStock').replace('{{n}}', String(data.in_stock_same)).replace('{{a}}', n(data.stock_asking_low)).replace('{{b}}', n(data.stock_asking_high)))
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald/30 bg-emerald-tint/50 px-3 py-2.5" data-testid="price-hint">
      <span className="well mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-surface text-emerald-deep"><TrendingUp size={18} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <BiLabel text={data.basis === 'exact' ? 'hint.titleExact' : data.basis === 'condition' ? 'hint.titleCondition' : data.basis === 'model' ? 'hint.titleModel' : 'hint.titleStock'} size="sm" bold tone="text-emerald-deep" />
        {lines.map((l) => <span key={l} className={`text-ink ${small}`} dir="auto">{l}</span>)}
      </span>
      {data.suggested && onUse ? (
        <button type="button" onClick={() => onUse(Number(data.suggested))} className={`tap shrink-0 rounded-full bg-emerald px-3 py-2 font-bold text-white ${ur ? cls('sm') : 'text-sm'}`}>
          {pick('hint.use').replace('{{p}}', n(data.suggested))}
        </button>
      ) : null}
    </div>
  )
}
