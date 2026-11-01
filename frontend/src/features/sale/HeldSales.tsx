/** Held sales (POS hold, owner 2026-10-28): a customer steps away, the bill is parked and the next
 *  customer is served; later it is resumed from this list. Kept on the server, so any counter phone
 *  of the shop can resume it. Nothing is sold, and no stock moves, until it is completed. */

import { CirclePause, Play, Trash2 } from 'lucide-react'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Loading, Sheet, fmtDateTime } from '@/components/ui'
import { api } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import {withCur } from '@/lib/format'

export interface HeldSale<C = unknown> {
  id: string
  label: string | null
  total: string
  items: number
  cart: C
  created_at: string
  created_by_name: string | null
}

export function useHeldSales<C>() {
  return useGet<HeldSale<C>[]>(['held-sales'], '/api/v1/sales/held')
}

/** the "Held sales (n)" button for the top of the sale screen; nothing when none is held */
export function HeldButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { pick, ur, cls } = useLang()
  if (!count) return null
  return (
    <button type="button" onClick={onClick} className={`tap flex min-h-14 w-full items-center gap-3 rounded-2xl bg-khata px-4 font-bold text-khata-fg ${ur ? cls('md') : 'text-[15px]'}`}>
      <CirclePause size={22} className="shrink-0 text-khata-icon" />
      <span className="flex-1 text-start">{pick('hold.list')}</span>
      <span className="num rounded-full bg-ink px-2.5 py-0.5 text-sm text-ground">{count}</span>
    </button>
  )
}

export function HeldSalesSheet<C>({ open, onClose, onResume }: { open: boolean; onClose: () => void; onResume: (h: HeldSale<C>) => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data, isLoading } = useHeldSales<C>()

  async function remove(h: HeldSale<C>) {
    if (!window.confirm(pick('hold.removeAsk'))) return
    await api('DELETE', `/api/v1/sales/held/${h.id}`)
    inv('held-sales')
  }

  return (
    <Sheet open={open} onClose={onClose} title="hold.list">
      {isLoading ? <Loading /> : !data?.length ? <Empty text="hold.none" /> : (
        <div className="flex flex-col gap-2">
          {data.map((h) => (
            <div key={h.id} className="card flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-extrabold">{h.label || pick('hold.noName')}</span>
                  <span className="text-xs text-muted" dir="ltr">{fmtDateTime(h.created_at)}{h.created_by_name ? ` · ${h.created_by_name}` : ''}</span>
                  <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('hold.items').replace('{{n}}', String(h.items))}</span>
                </div>
                <span className="num shrink-0 text-xl" dir="ltr">{withCur(Number(h.total).toLocaleString('en-US'))}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button type="button" onClick={() => onResume(h)} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-ground ${ur ? cls('md') : ''}`}>
                  <Play size={18} /> {pick('hold.resume')}
                </button>
                <button type="button" aria-label={pick('crud.delete')} onClick={() => remove(h)} className={`tap flex min-h-12 items-center justify-center gap-1 rounded-2xl border border-line px-3 font-bold text-payable ${ur ? cls('sm') : 'text-sm'}`}>
                  <Trash2 size={16} /> {pick('crud.delete')}
                </button>
              </div>
            </div>
          ))}
          <BiLabel text="hold.hint" size="sm" tone="text-muted" />
        </div>
      )}
    </Sheet>
  )
}
