/** Reserve stock for a customer (owner 2026-11-10, ADR-060). A phone is held for one customer
 *  until released or sold to them; some pieces of an item can be held the same way. Nothing is
 *  posted; the phone stays in stock but is not counted as available, and only that customer can
 *  buy it. */

import { Bookmark, BookmarkX } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, Sheet, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

interface Held { reserved_party_id?: string | null; reserved_party_name?: string | null; reserved_until?: string | null; reserved_note?: string | null }

function ReserveSheet({ open, onClose, withQty, max, onSave }: { open: boolean; onClose: () => void; withQty?: boolean; max?: number; onSave: (b: { party_id: string; until: string | null; note: string | null; qty?: number }) => Promise<void> }) {
  const [who, setWho] = useState<Party | null>(null)
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [qty, setQty] = useState('1')
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open={open} onClose={onClose} title="reserve.title">
      <div className="flex flex-col gap-3">
        <BiLabel text="reserve.hint" size="sm" tone="text-muted" />
        <PartyPicker value={who} onChange={setWho} kind="customer" label="reserve.for" />
        {withQty ? <BiInput label="reserve.qty" help={<Help term="reserve.qty" size="sm" />} type="number" inputMode="numeric" min={1} max={max} value={qty} onChange={(e) => setQty(e.target.value)} className="num" data-testid="reserve-qty" /> : null}
        <BiInput label="reserve.until" help={<Help term="reserve.until" size="sm" />} type="date" value={until} onChange={(e) => setUntil(e.target.value)} dir="ltr" />
        <BiInput label="reserve.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <ErrorText error={err} />
        <BiButton
          text="reserve.save"
          icon={<Bookmark size={20} />}
          full
          loading={busy}
          disabled={!who || (withQty && !(Number(qty) >= 1))}
          onClick={async () => {
            setBusy(true)
            setErr(null)
            try {
              await onSave({ party_id: who!.id, until: until || null, note: note || null, ...(withQty ? { qty: Number(qty) } : {}) })
              setWho(null); setUntil(''); setNote(''); setQty('1')
              onClose()
            } catch (e) { setErr(e) } finally { setBusy(false) }
          }}
          data-testid="reserve-save"
        />
      </div>
    </Sheet>
  )
}

/** on a phone's page: who it is held for, or a button to hold it */
export function DeviceReserve({ deviceId, d, inStock }: { deviceId: string; d: Held; inStock: boolean }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const refresh = () => inv('device', 'devices', 'history', 'stock-status', 'unit-money')
  if (d.reserved_party_id) {
    return (
      <div className="flex flex-col gap-2 rounded-3xl border-2 border-gold bg-gold-tint/50 p-4" data-testid="device-reserved">
        <span className="flex items-center gap-1.5"><Bookmark size={18} /><BiLabel text="reserve.heldFor" size="md" bold /><Help term="reserve.page" size="sm" /></span>
        <span className="text-lg font-extrabold">{d.reserved_party_name}</span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{d.reserved_until ? <>{pick('reserve.until')}: <span className="num" dir="ltr">{fmtDate(d.reserved_until)}</span></> : null}{d.reserved_note ? ` · ${d.reserved_note}` : ''}</span>
        <ErrorText error={err} />
        <BiButton text="reserve.release" icon={<BookmarkX size={18} />} variant="secondary" size="md" onClick={async () => { try { await api('POST', `/api/v1/devices/${deviceId}/release`, {}); await refresh() } catch (e) { setErr(e) } }} data-testid="reserve-release" />
      </div>
    )
  }
  if (!inStock) return null
  return (
    <>
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><BiButton text="reserve.button" icon={<Bookmark size={18} />} variant="secondary" size="md" full onClick={() => setOpen(true)} data-testid="reserve-open" /></div><Help term="reserve.page" size="sm" /></div>
      <ReserveSheet open={open} onClose={() => setOpen(false)} onSave={async (b) => { await api('POST', `/api/v1/devices/${deviceId}/reserve`, b); await refresh() }} />
    </>
  )
}

interface ItemHold { id: string; party_name: string | null; qty: number; left: number; status: 'open' | 'done' | 'released'; until: string | null; note: string | null }

/** on an item's page: pieces held for customers */
export function ItemReserve({ itemId, qty }: { itemId: string; qty: number }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const { data } = useGet<ItemHold[]>(['item-holds', itemId], `/api/v1/accessories/${itemId}/reservations`)
  const openOnes = (data ?? []).filter((h) => h.status === 'open')
  const held = openOnes.reduce((s, h) => s + h.left, 0)
  const refresh = () => inv('item-holds', 'stock-status', 'accessories', 'accessory')
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-2" data-testid="item-reserve">
      {openOnes.length ? (
        <div className="card flex flex-col gap-2">
          <span className="flex items-center justify-between"><BiLabel text="reserve.itemHeld" size="md" bold /><span className="num font-extrabold" dir="ltr">{held} / {qty}</span></span>
          {openOnes.map((h) => (
            <div key={h.id} className="flex items-center gap-2 border-t border-line pt-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold">{h.party_name} · <span className="num" dir="ltr">{h.left}</span></span>
                <span className={`text-muted ${small}`}>{h.until ? <>{pick('reserve.until')}: <span className="num" dir="ltr">{fmtDate(h.until)}</span></> : null}{h.note ? ` · ${h.note}` : ''}</span>
              </span>
              <button type="button" onClick={async () => { try { await api('POST', `/api/v1/accessories/reservations/${h.id}/release`, {}); await refresh() } catch (e) { setErr(e) } }} className="tap min-h-10 shrink-0 rounded-xl border border-line px-3 font-bold">{pick('reserve.release')}</button>
            </div>
          ))}
          <span className={`text-muted ${small}`}>{pick('reserve.free').replace('{{n}}', String(Math.max(qty - held, 0)))}</span>
        </div>
      ) : null}
      <ErrorText error={err} />
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><BiButton text="reserve.button" icon={<Bookmark size={18} />} variant="secondary" full disabled={qty - held <= 0} onClick={() => setOpen(true)} data-testid="item-reserve-open" /></div><Help term="reserve.page" size="sm" /></div>
      <ReserveSheet open={open} onClose={() => setOpen(false)} withQty max={Math.max(qty - held, 0)} onSave={async (b) => { await api('POST', `/api/v1/accessories/${itemId}/reserve`, b); await refresh() }} />
    </div>
  )
}
