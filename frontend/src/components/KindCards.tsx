/** The kinds of thing a shop buys, as cards (accessories Easy Mode, phase B — ADR-124): beside the
 *  purchase's search, for the shopkeeper who would rather tap "Charger" than type. The cards are
 *  the shop's own kinds and the kinds of the built-in list (`/accessories/library/kinds`); the usual
 *  twelve come first, the rest open under "More kinds". A tap filters both the shop's items and
 *  the built-in list to that kind. The search stays where it was — a card is a second way in. */

import { BatteryCharging, BatteryFull, Cable, ChevronDown, HardDrive, Headphones, Keyboard, Mouse, Package, Shield, Smartphone, Speaker, Watch, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import { kindLabel, useItemKinds } from '@/components/ItemKinds'
import { useGet } from '@/lib/queries'

const ICON: Record<string, LucideIcon> = {
  charger: BatteryCharging, car_charger: BatteryCharging, cable: Cable, cover: Smartphone, glass: Shield, earphones: Headphones,
  power_bank: BatteryFull, battery: BatteryFull, watch: Watch, smart_band: Watch, speaker: Speaker, memory: HardDrive, Mouse, Keyboard,
}
const FIRST = ['charger', 'cable', 'cover', 'glass', 'earphones', 'power_bank', 'watch', 'speaker', 'memory', 'holder', 'Mouse', 'Keyboard']

export default function KindCards({ onPick }: { onPick: (kind: string) => void }) {
  const { pick, ur, cls } = useLang()
  const own = useItemKinds()
  const { data: built } = useGet<{ kind: string; lines: number }[]>(['library-kinds'], '/api/v1/accessories/library/kinds')
  const [more, setMore] = useState(false)
  const all = [...new Set([...FIRST, ...own, ...(built ?? []).map((k) => k.kind)])]
  const shown = more ? all : all.slice(0, FIRST.length)
  return (
    <div className="flex flex-col gap-2" data-testid="kind-cards">
      <BiLabel text="buy.kinds" size="md" bold />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((k) => {
          const Icon = ICON[k] ?? Package
          return (
            <button key={k} type="button" onClick={() => onPick(k)} className="tap flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-line bg-surface px-1.5 py-2 text-ink active:translate-y-px" data-testid={`kind-card-${k}`}>
              <Icon size={24} className="shrink-0 text-emerald-deep" />
              <span className={`text-center leading-tight ${ur ? cls('sm') : 'text-[13px] font-bold'}`}>{kindLabel(pick, k)}</span>
            </button>
          )
        })}
      </div>
      {all.length > FIRST.length ? (
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className={`tap flex min-h-11 w-fit items-center gap-1.5 rounded-xl px-2 font-bold text-emerald-deep ${ur ? cls('sm') : 'text-sm'}`} data-testid="kind-cards-more">
          {pick(more ? 'acc.less' : 'buy.moreKinds')}<ChevronDown size={16} className={more ? 'rotate-180' : ''} />
        </button>
      ) : null}
    </div>
  )
}
