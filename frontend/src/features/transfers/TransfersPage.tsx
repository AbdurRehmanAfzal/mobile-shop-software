/** Branch transfers (docs/35 §5 item 2, ADR-046): send phones and items to another branch of the same
 *  owner, the list of what went out and came in, and one transfer. Owner / manager only. */

import { ArrowDownLeft, ArrowUpRight, Minus, Plus, Smartphone, Store, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import StockItemPicker, { type StockItem } from '@/components/StockItemPicker'
import { Empty, ErrorText, List, Loading, PageHeader, Row, SearchBox, Section, Sheet, fmtDate } from '@/components/ui'
import { DeviceRow } from '@/features/stock/StockPage'
import { post } from '@/lib/api'
import { withCur } from '@/lib/format'
import { useDevices, useGet, useInvalidate } from '@/lib/queries'
import type { Device } from '@/lib/types'

interface Branch { id: string; name: string; city: string | null }
interface Line { kind: 'device' | 'item'; label: string; qty: number; cost: string; device_id: string | null; item_id: string | null }
interface Transfer { id: string; no: string; direction: 'out' | 'in'; other_shop: string | null; at: string; note: string | null; total_cost: string; lines: Line[] }

const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

/** the list: what was sent to and what came from the other branches */
export function TransfersPage() {
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const { data } = useGet<Transfer[]>(['transfers'], '/api/v1/transfers')
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="transfer.title" help={<Help term="transfer.page" />} right={<BiButton text="transfer.new" size="md" icon={<Plus size={18} />} onClick={() => nav('/transfers/new')} />} />
      {!data ? <Loading /> : !data.length ? <Empty text="transfer.none" /> : (
        <List>
          {data.map((t) => (
            <Row
              key={t.id}
              onClick={() => nav(`/transfers/${t.id}`)}
              icon={t.direction === 'out' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
              iconTone={t.direction === 'out' ? 'bg-stockt text-stockt-fg' : 'bg-emerald-tint text-emerald-deep'}
              title={<span>{pick(t.direction === 'out' ? 'transfer.sentTo' : 'transfer.cameFrom').replace('{{shop}}', t.other_shop ?? '—')}</span>}
              sub={<span className={`text-muted ${small}`}><span dir="ltr">{t.no} · {fmtDate(t.at)}</span> · {pick('transfer.lines').replace('{{n}}', String(t.lines.length))}</span>}
              right={<span className="num" dir="ltr">{withCur(n(t.total_cost))}</span>}
            />
          ))}
        </List>
      )}
    </div>
  )
}

/** one transfer, each line opening the phone or the item in this shop */
export function TransferDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const { data: t } = useGet<Transfer>(['transfer', id], `/api/v1/transfers/${id}`)
  if (!t) return <Loading />
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={{ en: t.no, ur: t.no }} help={<Help term="transfer.page" />} />
      <section className={`flex flex-col gap-1 rounded-3xl px-5 py-4 ${t.direction === 'out' ? 'bg-stockt text-stockt-fg' : 'bg-emerald-tint text-emerald-deep'}`}>
        <span className={ur ? cls('md') : 'text-[15px] font-bold'}>{pick(t.direction === 'out' ? 'transfer.sentTo' : 'transfer.cameFrom').replace('{{shop}}', t.other_shop ?? '—')}</span>
        <span className="num text-[28px] leading-tight" dir="ltr">{withCur(n(t.total_cost))}</span>
        <span className={small} dir="ltr">{fmtDate(t.at)}</span>
      </section>
      {t.note ? <div className="card text-sm">{t.note}</div> : null}
      <List>
        {t.lines.map((ln, i) => (
          <Row
            key={i}
            onClick={() => (ln.device_id ? nav(`/stock/${ln.device_id}`) : ln.item_id ? nav(`/accessories/${ln.item_id}`) : undefined)}
            icon={ln.kind === 'device' ? <Smartphone size={18} /> : <Store size={18} />}
            title={ln.label}
            sub={ln.kind === 'item' ? <span className={`text-muted ${small}`}>{pick('transfer.pieces').replace('{{n}}', String(ln.qty))}</span> : undefined}
            right={<span className="num" dir="ltr">{n(ln.cost)}</span>}
          />
        ))}
      </List>
    </div>
  )
}

/** send: pick the branch, add phones (search or scan) and items with a count, then send */
export function TransferNewPage() {
  const nav = useNavigate()
  const inv = useInvalidate()
  const { pick, ur, cls } = useLang()
  const [params] = useSearchParams()
  const { data: branches } = useGet<Branch[]>(['transfer-branches'], '/api/v1/transfers/branches')
  const [to, setTo] = useState<string | null>(null)
  const [deviceIds, setDeviceIds] = useState<string[]>(() => (params.get('device') ? [params.get('device')!] : []))
  const [items, setItems] = useState<{ item: StockItem; qty: number }[]>([])
  const pendingItem = params.get('item')
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState<'device' | 'item' | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined, limit: 50 })
  const { data: chosen } = useDevices({ status: 'in_stock', limit: 500 })
  // opened from an item's page: that item is on the list already
  const { data: preItem } = useGet<StockItem>(['transfer-item', pendingItem], pendingItem ? `/api/v1/accessories/${pendingItem}` : null)
  useEffect(() => {
    if (preItem && preItem.qty > 0) setItems((xs) => (xs.some((x) => x.item.id === preItem.id) ? xs : [...xs, { item: preItem, qty: 1 }]))
  }, [preItem])
  const devices = deviceIds.map((id) => chosen?.find((d) => d.id === id)).filter(Boolean) as Device[]
  const cost = devices.reduce((s, d) => s + Number(d.cost_price ?? 0), 0) + items.reduce((s, x) => s + Number(x.item.avg_cost ?? 0) * x.qty, 0)
  const chip = (on: boolean) => `tap flex min-h-12 items-center gap-2 rounded-2xl border-2 px-4 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`

  async function send() {
    if (!to) return
    setBusy(true)
    setError(null)
    try {
      const t = await post<Transfer>('/api/v1/transfers', { to_shop_id: to, devices: deviceIds, items: items.map((x) => ({ id: x.item.id, qty: x.qty })), note: note.trim() || null })
      inv('devices', 'device', 'history', 'unit-money', 'stock-items', 'transfers', 'dashboard')
      nav(`/transfers/${t.id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (branches && !branches.length) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="transfer.new" help={<Help term="transfer.page" />} />
        <Empty text="transfer.noBranch" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3" data-testid="transfer-new">
      <PageHeader title="transfer.new" help={<Help term="transfer.page" />} />
      <Section title="transfer.to" help="transfer.to">
        {!branches ? <Loading /> : (
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <button key={b.id} type="button" aria-pressed={to === b.id} onClick={() => setTo(b.id)} className={chip(to === b.id)}>
                <Store size={18} />{b.name}{b.city ? <span className="font-medium opacity-70"> · {b.city}</span> : null}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="transfer.phones" help="transfer.phones" right={<BiButton text="transfer.addPhone" size="md" variant="secondary" icon={<Plus size={18} />} onClick={() => { setQ(''); setPicking('device') }} />}>
        {devices.length ? (
          <List>
            {devices.map((d) => (
              <div key={d.id} className="flex items-center">
                <div className="min-w-0 flex-1"><DeviceRow d={d} /></div>
                <button type="button" aria-label={pick('transfer.remove')} onClick={() => setDeviceIds(deviceIds.filter((x) => x !== d.id))} className="tap me-3 flex h-10 w-10 items-center justify-center rounded-full border border-line text-payable"><Trash2 size={16} /></button>
              </div>
            ))}
          </List>
        ) : <BiLabel text="transfer.noPhones" size="sm" tone="text-muted" />}
      </Section>

      <Section title="transfer.items" help="transfer.items" right={<BiButton text="transfer.addItem" size="md" variant="secondary" icon={<Plus size={18} />} onClick={() => setPicking('item')} />}>
        {items.length ? (
          <List>
            {items.map((x) => (
              <div key={x.item.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{ur && x.item.name_ur ? x.item.name_ur : x.item.name}</span>
                  <span className={`text-muted ${ur ? cls('sm') : 'text-xs'}`}>{pick('transfer.inStock').replace('{{n}}', String(x.item.qty))}</span>
                </span>
                <button type="button" aria-label="−" onClick={() => setItems(items.map((y) => (y.item.id === x.item.id ? { ...y, qty: Math.max(1, y.qty - 1) } : y)))} className="tap flex h-10 w-10 items-center justify-center rounded-full border border-line"><Minus size={16} /></button>
                <input aria-label={pick('transfer.qty')} inputMode="numeric" value={x.qty} onChange={(e) => { const v = Math.max(1, Math.min(x.item.qty, Number(e.target.value.replace(/\D/g, '')) || 1)); setItems(items.map((y) => (y.item.id === x.item.id ? { ...y, qty: v } : y))) }} className="num h-10 w-14 rounded-xl border border-line bg-surface text-center font-bold" dir="ltr" />
                <button type="button" aria-label="+" onClick={() => setItems(items.map((y) => (y.item.id === x.item.id ? { ...y, qty: Math.min(x.item.qty, y.qty + 1) } : y)))} className="tap flex h-10 w-10 items-center justify-center rounded-full border border-line"><Plus size={16} /></button>
                <button type="button" aria-label={pick('transfer.remove')} onClick={() => setItems(items.filter((y) => y.item.id !== x.item.id))} className="tap flex h-10 w-10 items-center justify-center rounded-full border border-line text-payable"><Trash2 size={16} /></button>
              </div>
            ))}
          </List>
        ) : <BiLabel text="transfer.noItems" size="sm" tone="text-muted" />}
      </Section>

      <BiInput label="transfer.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <div className="card flex items-center justify-between">
        <span className="flex items-center gap-1"><BiLabel text="transfer.cost" size="md" bold /><Help term="transfer.cost" size="sm" /></span>
        <span className="num text-xl" dir="ltr">{withCur(n(cost))}</span>
      </div>
      <ErrorText error={error} />
      <BiButton text="transfer.send" full loading={busy} disabled={!to || (!deviceIds.length && !items.length)} onClick={() => void send()} data-testid="transfer-send" />

      <Sheet open={picking === 'device'} onClose={() => setPicking(null)} title="transfer.addPhone">
        <div className="flex flex-col gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />
          <div className="max-h-[60vh] overflow-y-auto">
            <List>{stock?.filter((d) => !deviceIds.includes(d.id)).slice(0, 30).map((d) => <DeviceRow key={d.id} d={d} onClick={() => { setDeviceIds([...deviceIds, d.id]); setPicking(null) }} />)}</List>
          </div>
        </div>
      </Sheet>
      <Sheet open={picking === 'item'} onClose={() => setPicking(null)} title="transfer.addItem">
        <StockItemPicker mode="sell" onPick={(it) => { if (!items.some((x) => x.item.id === it.id) && it.qty > 0) setItems([...items, { item: it, qty: 1 }]); setPicking(null) }} />
      </Sheet>
    </div>
  )
}
