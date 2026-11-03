/** Repair sticker (owner 2026-11-03, docs/34): a sticker for the customer's phone with its details.
 *  Before printing the shop picks which fields go on it, the size and the copies; the last choice is
 *  remembered on this device. The barcode is the job number, so a scan opens the job. */

import { Check, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import Help from '@/components/Help'
import { ErrorText, Sheet } from '@/components/ui'
import { openPrintable } from '@/lib/files'

export const REPAIR_FIELDS = ['shop', 'no', 'barcode', 'customer', 'phone', 'device', 'imei', 'fault', 'accessories', 'received', 'promised', 'estimate', 'advance', 'left', 'lab', 'notes'] as const
type Field = (typeof REPAIR_FIELDS)[number]
const SIZES = ['50x30', '58x40', '60x40', '70x40', 'a4'] as const
type Size = (typeof SIZES)[number]
interface Prefs { size: Size; fields: Field[]; copies: number }
const DEFAULT: Prefs = { size: '58x40', fields: ['shop', 'no', 'barcode', 'customer', 'phone', 'device', 'fault', 'promised'], copies: 1 }
const LS = 'mobileshop.repairStickerPrefs'

function load(): Prefs {
  try {
    const p = { ...DEFAULT, ...(JSON.parse(localStorage.getItem(LS) ?? 'null') ?? {}) } as Prefs
    return { ...p, fields: p.fields.filter((f): f is Field => (REPAIR_FIELDS as readonly string[]).includes(f)) }
  } catch {
    return DEFAULT
  }
}

export function stickerPath(ids: string[], p: Prefs): string {
  const q = new URLSearchParams({ ids: ids.join(','), copies: String(p.copies), fields: p.fields.join(','), size: p.size })
  return `/api/v1/labels/repairs?${q}`
}

export default function RepairSticker({ ids, open, onClose }: { ids: string[]; open: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const [p, setP] = useState<Prefs>(load)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { if (open) setP(load()) }, [open])
  const chip = (on: boolean) => `tap h-11 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const toggle = (f: Field) => setP({ ...p, fields: p.fields.includes(f) ? p.fields.filter((x) => x !== f) : [...p.fields, f] })
  const path = stickerPath(ids, p)
  const print = () => {
    setErr(null)
    try { localStorage.setItem(LS, JSON.stringify(p)) } catch { /* private window */ }
    openPrintable(path).catch(setErr)
  }
  return (
    <Sheet open={open} onClose={onClose} title="rlab.sticker">
      <div className="flex flex-col gap-3" data-testid="repair-sticker">
        <span className="flex items-center gap-1"><BiLabel text="rlab.stickerHint" size="sm" tone="text-muted" /><Help term="rlab.sticker" size="sm" /></span>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.fields" size="md" bold /><Help term="rlab.stickerFields" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {REPAIR_FIELDS.map((f) => {
              const on = p.fields.includes(f)
              return (
                <button key={f} type="button" aria-pressed={on} onClick={() => toggle(f)} className={`${chip(on)} inline-flex items-center gap-1`}>
                  {on ? <Check size={14} /> : null}{pick(`rlab.f.${f}`)}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.size" size="md" bold /><Help term="label.size" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((s) => (
              <button key={s} type="button" aria-pressed={p.size === s} onClick={() => setP({ ...p, size: s })} className={chip(p.size === s)}>
                {s === 'a4' ? pick('label.a4') : <span dir="ltr">{s.replace('x', ' × ')} mm</span>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 flex items-center gap-1"><BiLabel text="label.copies" size="md" bold /><Help term="label.copies" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3].map((c) => <button key={c} type="button" aria-pressed={p.copies === c} onClick={() => setP({ ...p, copies: c })} className={`${chip(p.copies === c)} num`}>{c}</button>)}
          </div>
        </div>
        <ErrorText error={err} />
        <BiButton text="label.print" icon={<Printer size={22} />} full disabled={!p.fields.length} onClick={print} />
        <DocActions path={path} name="repair-sticker" title={pick('rlab.sticker')} picker={false} />
      </div>
    </Sheet>
  )
}
