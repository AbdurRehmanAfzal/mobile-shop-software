/** An Apple unit's region code (LL/A, ZA/A, CH/A ...) and SIM setup (physical + eSIM, dual eSIM ...)
 *  (owner 2026-11-09, ADR-055). Shopkeepers buy and sell an iPhone by them. The shop can add its own
 *  with "+ New"; once used, the form offers it again (the server lists what this shop has used). */

import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import QuickAdd from '@/features/catalogue/QuickAdd'

export const SIM_TYPES = ['physical_esim', 'dual_esim', 'dual_physical', 'physical'] as const

/** an Apple device: by brand, or by model name when the shop typed its own brand */
export const isApple = (brand?: string | null, model?: string | null) => /apple/i.test(brand ?? '') || /^(iphone|ipad|apple watch)/i.test(model ?? '')

/** "Physical + eSIM" for a known key, the shop's own words otherwise */
export function simTypeText(v: string | null | undefined, pick: (k: string) => string): string | null {
  if (!v) return null
  return (SIM_TYPES as readonly string[]).includes(v) ? pick(`devx.simType.${v}`) : v
}

function Chips({ value, options, label, onChange, testid }: { value: string; options: string[]; label: (v: string) => string; onChange: (v: string) => void; testid: string }) {
  return (
    <div className="contents" data-testid={testid}>
      {options.map((o) => {
        const on = value === o
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? '' : o)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-muted'}`}>
            <span dir="ltr">{label(o)}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function AppleVariant({ region, sim, showSim, regionOptions, simOptions, onRegion, onSim }: {
  region: string
  sim: string
  showSim: boolean
  regionOptions?: string[]
  simOptions?: string[]
  onRegion: (v: string) => void
  onSim: (v: string) => void
}) {
  const { pick } = useLang()
  const regions = [...(regionOptions ?? []), ...(region && !regionOptions?.includes(region) ? [region] : [])]
  const simBase: string[] = simOptions ?? [...SIM_TYPES]
  const sims = [...simBase, ...(sim && !simBase.includes(sim) ? [sim] : [])]
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-line p-3" data-testid="apple-variant">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1"><BiLabel text="devx.region" size="md" tone="text-muted" /><Help term="device.region" size="sm" /></span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chips value={region} options={regions} label={(v) => v} onChange={onRegion} testid="region-chips" />
          <QuickAdd label="devx.newOption" placeholder="devx.regionPh" valid={(v) => v.trim().length >= 1 && v.trim().length <= 12} onAdd={async (v) => onRegion(v.trim().toUpperCase())} />
        </div>
      </div>
      {showSim ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1"><BiLabel text="devx.simTypeLabel" size="md" tone="text-muted" /><Help term="device.simType" size="sm" /></span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chips value={sim} options={sims} label={(v) => simTypeText(v, pick) ?? v} onChange={onSim} testid="sim-chips" />
            <QuickAdd label="devx.newOption" placeholder="devx.simTypePh" valid={(v) => v.trim().length >= 1 && v.trim().length <= 30} onAdd={async (v) => onSim(v.trim())} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
