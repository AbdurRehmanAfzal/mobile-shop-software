/** Ways to see one phone (shopkeepers 2026-11-20, ADR-114): **Details** — the table of everything
 *  about the phone, each line with its action — and two previews of its printed details, an
 *  **80 mm slip** and an **A4 page**, with the lines ticked like a sticker, to print, download or
 *  share. (The Smart / Tabs / Tiles / Compact styles of 2026-11-10 are gone: nobody could tell them
 *  apart.) The choice is kept on this device. */

import { FileText, ReceiptText, Rows3 } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import Help from '@/components/Help'

export type DeviceStyle = 'classic' | 'thermal' | 'a4'
const STYLES: { s: DeviceStyle; icon: typeof Rows3 }[] = [
  { s: 'classic', icon: Rows3 },
  { s: 'thermal', icon: ReceiptText },
  { s: 'a4', icon: FileText },
]
const KEY = 'device.style'
/** a style saved before ADR-114 (smart, tabs, tiles, compact) opens as Details */
export function loadStyle(): DeviceStyle {
  try {
    const v = localStorage.getItem(KEY)
    return STYLES.some((x) => x.s === v) ? (v as DeviceStyle) : 'classic'
  } catch {
    return 'classic'
  }
}
export function saveStyle(s: DeviceStyle) {
  try { localStorage.setItem(KEY, s) } catch { /* private mode */ }
}

export function StyleSwitch({ value, onChange }: { value: DeviceStyle; onChange: (s: DeviceStyle) => void }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="flex items-center gap-1" data-testid="device-styles">
      <div role="radiogroup" aria-label={pick('dl.title')} className="flex flex-1 rounded-2xl border border-line bg-surface p-1">
        {STYLES.map(({ s, icon: Icon }) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} className={`tap flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-2 font-bold ${ur ? cls('sm') : 'text-[13px]'} ${value === s ? 'bg-ink text-ground shadow-sm' : 'text-muted'}`} data-testid={`dstyle-${s}`}>
            <Icon size={18} className="shrink-0" />
            <span className="leading-tight">{pick(`dl.styles.${s}`)}</span>
          </button>
        ))}
      </div>
      <Help term="dl.styles" size="sm" />
    </div>
  )
}

/** one action the page can do */
export interface Act { key: string; label: string; run: () => void; tone?: 'primary' | 'gold' | 'secondary'; testid?: string }
