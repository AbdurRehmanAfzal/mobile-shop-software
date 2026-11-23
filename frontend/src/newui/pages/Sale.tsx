/** Sell (F2) in the new product (ADR-134), drawn from `14-sale-pos-full.html` with what only
 *  `15-sale-pos-first-draft.html` has (brand pills, cheque, "paid now"): a full-screen counter —
 *  its own top bar and compact rail, the stock as cards on the left with kind tabs and quick
 *  filters, the bill on the right (customer, lines with the deal price in place, payment, totals,
 *  Hold and Complete).
 *
 *  It posts exactly what the live sale posts (`POST /api/v1/sales`) and keeps the live rules,
 *  drawn here in the file's language: a pending ID check is shown on the card and asked before the
 *  bill (check now, or skip with the reason recorded — ADR-128); a phone flagged as stolen is sold
 *  only by the owner with a reason; a price under the cost only by the owner / manager who says
 *  so; the shop's price rules may ask the owner's PIN; udhaar needs a khata customer; cost and
 *  profit only for a login the server sends cost to, with the file's "hide" switch for when the
 *  customer is looking. The receipt is the server's printed page.
 *
 *  Known differences from the drawing (the server keeps one way of payment per bill): "Split"
 *  is the part paid now (cash or online) with the rest on the khata, not cash and online together;
 *  the trade-in row opens the live exchange, which checks the incoming phone; the rail's Expense is
 *  F8 as everywhere in the app (the file prints F10). */

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import { lookupCode } from '@/components/ScanListener'
import { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { ApiError, api, get, post } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useModules, useTrade } from '@/lib/modules'
import { useDevices, useGet, useInvalidate, useParties } from '@/lib/queries'
import { beep, useScan } from '@/lib/scanner'
import { useTheme } from '@/lib/theme'
import type { Device, DeviceDetail, Invoice, Party } from '@/lib/types'
import { faultText } from '@/features/stock/Faults'
import { hasPta, specLine } from '@/features/stock/StockPage'
import { billTax } from '@/features/sale/SaleWizard'
import { useHeldSales, type HeldSale } from '@/features/sale/HeldSales'
import { ALL_BANKS, POPULAR_BANKS } from '@/lib/pkPayments'

/* ------------------------------------------------------------------ types */

interface Item { id: string; sku: string; name: string; name_ur: string | null; category: string; qty: number; avg_cost: string | null; price: string; brand: string | null; compatible: string | null; variant: string | null; barcode: string | null }
type Acc = Record<string, { state: 'now' | 'later'; date: string }>
interface DevLine { k: 'dev'; d: Device; price: string; warranty: number; acc: Acc }
interface ItemLine { k: 'item'; it: Item; qty: number; price: string; max: number }
type Line = DevLine | ItemLine
type Mode = 'cash' | 'online' | 'udhaar' | 'cheque' | 'split'
type Cat = 'all' | 'phone' | 'tablet' | 'watch' | 'laptop' | 'items'
type Quick = 'all' | 'box' | 'pta' | 'idpending' | 'hidefaulty'
interface Cart { v: 'newui'; lines: Line[]; party: Party | null; walkIn: boolean; buyer: string; mode: Mode; pay: PayState; split: string; splitBy: 'cash' | 'online'; discountOn: boolean; discount: string; taxOn: boolean }

const WARRANTY = [0, 7, 30, 90, 180, 365] as const
const n0 = (v: number | string) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const rs = (v: number | string) => withCur(n0(v))
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
const accOut = (acc: Acc) => {
  const rows = Object.entries(acc)
  return {
    accessories_given: rows.filter(([, v]) => v.state === 'now').map(([k]) => k),
    accessories_pending: rows.filter(([, v]) => v.state === 'later').map(([k, v]) => ({ kind: k, promised_at: v.date || null })),
  }
}
const accFrom = (d: Partial<DeviceDetail>): Acc => Object.fromEntries((d.accessories ?? []).filter((a) => a.came_with && a.kind !== 'other').map((a) => [a.kind, { state: 'now' as const, date: '' }]))

/* ------------------------------------------------------------------ small parts */

function Svg({ d, className = 'w-4 h-4', sw = 2 }: { d: string; className?: string; sw?: number }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={sw} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
}
const P = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2-4.3-4.3',
  scan: 'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8',
  eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  eyeOff: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  plus: 'M12 4v16m8-8H4',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  phone: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zm4 16h.01',
  wrench: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  ret: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  wallet: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z',
  pause: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  warn: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
}

/** the file's modal: dark veil, a white card that pops in */
function Modal({ open, title, onClose, children, wide = false, testid }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; testid?: string }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-2xl w-full shadow-2xl overflow-hidden animate-pop ${wide ? 'max-w-md' : 'max-w-sm'}`} onClick={(e) => e.stopPropagation()} data-testid={testid}>
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-obsidian-800 flex items-center justify-between">
          <h3 className="font-extrabold text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer" aria-label="close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the page */

export default function NewSale() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const has = useModules()
  const trade = useTrade()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const searchRef = useRef<HTMLInputElement>(null)

  /* the stock */
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat>('all')
  const [quick, setQuick] = useState<Quick>('all')
  const [brand, setBrand] = useState<string>('')
  const { data: devices } = useDevices({ status: 'in_stock', with_faulty: true, q: q || undefined })
  const { data: itemsRaw } = useGet<Item[]>(['accessories', 'all'], has('accessories') ? '/api/v1/accessories' : null)
  const { data: itemOpts } = useGet<{ allow_negative_stock: boolean }>(['item-options'], has('accessories') ? '/api/v1/accessories/options' : null)
  const negativeOk = !!itemOpts?.allow_negative_stock
  const { data: shopSet } = useGet<{ tax_rate: string; phones_tax_at_import?: boolean }>(['shop-full'], '/api/v1/shops/current')
  const taxRate = Number(shopSet?.tax_rate) || 18

  /* the bill */
  const [lines, setLines] = useState<Line[]>([])
  const [walkIn, setWalkIn] = useState(true)
  const [party, setParty] = useState<Party | null>(null)
  const [buyer, setBuyer] = useState('')
  const [pq, setPq] = useState('')
  const [pOpen, setPOpen] = useState(false)
  const { data: parties } = useParties({ q: pq || undefined, kind: 'customer' })
  const [mode, setMode] = useState<Mode>('cash')
  const [pay, setPay] = useState<PayState>(() => newPay('cash'))
  const [split, setSplit] = useState('')
  const [splitBy, setSplitBy] = useState<'cash' | 'online'>('cash')
  const [discountOn, setDiscountOn] = useState(false)
  const [discount, setDiscount] = useState('')
  const [taxOn, setTaxOn] = useState(false)
  const [showCost, setShowCost] = useState(true)
  const [tradeOpen, setTradeOpen] = useState(false)

  /* modals */
  const [confirming, setConfirming] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [newCust, setNewCust] = useState(false)
  const [result, setResult] = useState<Invoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [pin, setPin] = useState('')
  const [override, setOverride] = useState('')
  const [lossOk, setLossOk] = useState(false)
  const [toast, setToast] = useState('')
  const { data: held } = useHeldSales<Cart>()

  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2400); return () => clearTimeout(x) }, [toast])

  /* keys: "/" finds, the counter's F-keys go where the panel's do, Esc is the dashboard */
  useEffect(() => {
    const go: Record<string, string> = { F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT'
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === 'Escape' && !typing && !confirming && !heldOpen && !newCust && !result) { nav('/new'); return }
      if (go[e.key]) { e.preventDefault(); nav(go[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, confirming, heldOpen, newCust, result])

  /* what the grid shows */
  const items = useMemo(() => (itemsRaw ?? []).filter((x) => (x.qty > 0 || negativeOk) && (!q || `${x.name} ${x.sku} ${x.brand ?? ''} ${x.barcode ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [itemsRaw, q, negativeOk])
  const devCat = (d: Device) => (d.category ?? 'phone') as Cat
  const kinds: Cat[] = ['all', ...(trade.mobiles ? (['phone', 'tablet', 'watch'] as const) : []), ...(has('laptops') ? (['laptop'] as const) : []), ...(has('accessories') ? (['items'] as const) : [])]
  const count = (c: Cat) => (c === 'all' ? (devices?.length ?? 0) + items.length : c === 'items' ? items.length : (devices ?? []).filter((d) => devCat(d) === c).length)
  const brands = useMemo(() => [...new Set((devices ?? []).filter((d) => cat === 'all' || devCat(d) === cat).map((d) => d.brand_name))].sort(), [devices, cat])
  const shownDevs = (devices ?? []).filter((d) => {
    if (cat === 'items' || (cat !== 'all' && devCat(d) !== cat)) return false
    if (brand && d.brand_name !== brand) return false
    if (quick === 'box' && d.condition !== 'box_pack') return false
    if (quick === 'pta' && d.pta_status !== 'pta_approved') return false
    if (quick === 'idpending' && d.verification_status !== 'pending') return false
    if (quick === 'hidefaulty' && (d.status === 'faulty' || !!d.faults?.length)) return false
    return true
  })
  const shownItems = cat === 'all' || cat === 'items' ? (brand || quick === 'pta' || quick === 'idpending' ? [] : items) : []
  const shown = shownDevs.length + shownItems.length

  /* the bill's lines */
  const devOn = (id: string) => lines.some((l) => l.k === 'dev' && l.d.id === id)
  const itemOn = (id: string) => lines.find((l): l is ItemLine => l.k === 'item' && l.it.id === id)
  async function addDevice(d: Device) {
    if (devOn(d.id)) { setLines((ls) => ls.filter((l) => !(l.k === 'dev' && l.d.id === d.id))); return }
    setLines((ls) => [...ls, { k: 'dev', d, price: d.asking_price ? String(Number(d.asking_price)) : '', warranty: 0, acc: {} }])
    // what came with the phone goes with it unless the seller changes it (the live sale's rule)
    get<DeviceDetail>(`/api/v1/devices/${d.id}`).then((full) => setLines((ls) => ls.map((l) => (l.k === 'dev' && l.d.id === d.id ? { ...l, d: { ...l.d, ...(full as unknown as Device) }, acc: accFrom(full) } : l)))).catch(() => undefined)
  }
  async function addItem(it: Item) {
    const on = itemOn(it.id)
    if (on) { setLines((ls) => ls.map((l) => (l === on ? { ...on, qty: negativeOk ? on.qty + 1 : Math.min(on.qty + 1, on.max) } : l))); return }
    // the price for this customer (dealer → wholesale, a running promo → promo), as the live sale
    let price = it.price
    try { price = (await get<{ price: string }>(`/api/v1/accessories/${it.id}/price${party ? `?party_id=${party.id}` : ''}`)).price } catch { /* the item's own */ }
    setLines((ls) => [...ls, { k: 'item', it, qty: 1, price: String(Number(price) || ''), max: it.qty }])
  }
  const setLine = (l: Line, patch: Partial<DevLine> | Partial<ItemLine>) => setLines((ls) => ls.map((x) => (x === l ? ({ ...x, ...patch } as Line) : x)))

  /* a scanner puts a phone or an item on the bill */
  useScan(result || confirming ? null : async (code) => {
    try {
      const r = await lookupCode(code)
      if (r.kind === 'device' && r.device && r.sellable) { beep('ok'); const full = await get<Device>(`/api/v1/devices/${r.device.id}`); if (!devOn(full.id)) await addDevice(full); return }
      if (r.kind === 'item' && r.item && r.sellable) { beep('ok'); const it = (itemsRaw ?? []).find((x) => x.id === r.item!.id); if (it) await addItem(it); return }
      beep('error'); setToast(t('npos.scanNo', { code }))
    } catch { beep('error'); setToast(t('npos.scanNo', { code })) }
  })

  /* money */
  const devLines = lines.filter((l): l is DevLine => l.k === 'dev')
  const itemLines = lines.filter((l): l is ItemLine => l.k === 'item')
  const subtotal = r2(devLines.reduce((s, l) => s + Number(l.price || 0), 0) + itemLines.reduce((s, l) => s + l.qty * Number(l.price || 0), 0))
  const disc = discountOn ? Math.max(0, Number(discount || 0)) : 0
  const base = Math.max(0, subtotal - disc)
  const phoneRates = devLines.map((l) => (shopSet?.phones_tax_at_import && (l.d.category ?? 'phone') === 'phone' ? 0 : null))
  const tax = taxOn && has('tax') ? billTax(devLines.map((l) => Number(l.price || 0)), itemLines.map((l) => ({ qty: String(l.qty), unit_price: l.price })), disc, taxRate, phoneRates) : 0
  const net = r2(base + tax)
  const paidNow = mode === 'udhaar' ? 0 : mode === 'split' ? Math.min(Math.max(0, Number(split || 0)), net) : net
  const rest = r2(net - paidNow)
  const costKnown = lines.length > 0 && devLines.every((l) => l.d.cost_price != null) && itemLines.every((l) => l.it.avg_cost != null)
  const cost = devLines.reduce((s, l) => s + Number(l.d.cost_price || 0), 0) + itemLines.reduce((s, l) => s + l.qty * Number(l.it.avg_cost || 0), 0)
  const profit = r2(subtotal - disc - cost)
  const canCost = manager && costKnown

  /* rules before the bill */
  const pending = devLines.filter((l) => l.d.verification_status === 'pending')
  const flagged = devLines.filter((l) => l.d.verification_status === 'flagged')
  const loss = devLines.filter((l) => l.d.cost_price != null && l.price !== '' && Number(l.price) < Number(l.d.cost_price))
  const payOk = mode === 'online' || mode === 'cheque' ? payReady({ ...pay, method: mode }) : mode === 'split' && splitBy === 'online' && paidNow > 0 ? payReady({ ...pay, method: 'online' }) : true
  const whoOk = rest > 0 ? !!party : walkIn || !!party
  const linesOk = lines.length > 0 && devLines.every((l) => Number(l.price) > 0) && itemLines.every((l) => Number(l.price) > 0 && l.qty >= 1 && (negativeOk || l.qty <= l.max))
  const ruleOk = (!pending.length || !!override) && (!flagged.length || (role === 'owner' && override.trim().length >= 3)) && (!loss.length || (manager && lossOk))
  const ready = linesOk && whoOk && payOk && net > 0

  function chooseMode(m: Mode) {
    setMode(m)
    if (m === 'online' || m === 'cheque') setPay((p) => ({ ...p, method: m }))
    // udhaar is written in a khata: the customer has to be named
    if (m === 'udhaar' || m === 'split') setWalkIn(false)
  }
  function reset() {
    setLines([]); setParty(null); setWalkIn(true); setBuyer(''); setMode('cash'); setPay(newPay('cash')); setSplit(''); setSplitBy('cash')
    setDiscountOn(false); setDiscount(''); setTaxOn(false); setOverride(''); setLossOk(false); setPin(''); setErr(null); setTradeOpen(false)
  }

  async function submit() {
    setBusy(true); setErr(null)
    const payment = mode === 'online' || mode === 'cheque' ? payInfo({ ...pay, method: mode }) : mode === 'split' && splitBy === 'online' && paidNow > 0 ? payInfo({ ...pay, method: 'online' }) : undefined
    const body = {
      party_id: party?.id ?? null,
      notes: walkIn && buyer.trim() ? `${pick('npos.buyer')}: ${buyer.trim()}` : undefined,
      devices: devLines.map((l) => ({ device_id: l.d.id, price: Number(l.price || 0), warranty_days: l.warranty, ...accOut(l.acc) })),
      misc: itemLines.map((l) => ({ description: ur && l.it.name_ur ? l.it.name_ur : l.it.name, qty: l.qty, unit_price: Number(l.price || 0), accessory_id: l.it.id })),
      discount: disc,
      tax_rate: taxOn && has('tax') ? taxRate : 0,
      paid: paidNow,
      payment,
      override_reason: override || undefined,
      below_cost_ok: loss.length > 0 && lossOk,
      approval_pin: pin || undefined,
    }
    try {
      const res = await post<Invoice>('/api/v1/sales', body)
      setConfirming(false); setResult(res)
      await inv('devices'); await inv('stock-summary'); await inv('accessories')
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  async function hold() {
    if (!lines.length) return
    const cart: Cart = { v: 'newui', lines, party, walkIn, buyer, mode, pay, split, splitBy, discountOn, discount, taxOn }
    try {
      await post('/api/v1/sales/held', { label: party?.name || buyer.trim() || null, total: net, items: lines.length, cart })
      await inv('held-sales'); reset(); setToast(pick('npos.held'))
    } catch (e) { setErr(e) }
  }
  async function resume(h: HeldSale<Cart>) {
    const c = h.cart
    // a phone may have been sold while the bill was held: it comes off
    const now = await Promise.all(c.lines.map((l) => (l.k === 'dev' ? get<Device>(`/api/v1/devices/${l.d.id}`).catch(() => null) : Promise.resolve(null))))
    const still = c.lines.filter((l, i) => l.k !== 'dev' || now[i]?.status === 'in_stock' || now[i]?.status === 'faulty')
    await api('DELETE', `/api/v1/sales/held/${h.id}`).catch(() => undefined)
    setLines(still); setParty(c.party); setWalkIn(c.walkIn); setBuyer(c.buyer); setMode(c.mode); setPay(c.pay); setSplit(c.split); setSplitBy(c.splitBy); setDiscountOn(c.discountOn); setDiscount(c.discount); setTaxOn(c.taxOn)
    setHeldOpen(false); await inv('held-sales')
    if (still.length < c.lines.length) setToast(t('npos.soldMeanwhile', { n: c.lines.length - still.length }))
  }

  /* ------------------------------------------------------------ drawing */

  const code = err instanceof ApiError ? err.code : null
  const needPin = code === 'pin_required' || code === 'pin_wrong'
  const shopName = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const railTile = 'p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/80 dark:border-obsidian-700/70 text-start transition cursor-pointer block'
  const RAIL: { to: string; label: string; key: string; d: string; tone: string }[] = [
    { to: '/new/purchase/new', label: 'counter.addStock', key: 'F3', d: P.plus, tone: 'dark' },
    { to: '/new/khata', label: 'counter.khata', key: 'F4', d: P.book, tone: 'text-amber-500' },
    { to: '/new/stock/summary', label: 'counter.stock', key: 'F6', d: P.phone, tone: 'text-emerald-500' },
    ...(has('repairs') ? [{ to: '/new/repairs', label: 'counter.repair', key: 'F7', d: P.wrench, tone: 'text-sky-400' }] : []),
    { to: '/new/return/new', label: 'counter.returnJob', key: 'F9', d: P.ret, tone: 'text-rose-400' },
    ...(has('expenses') ? [{ to: '/new/expenses', label: 'counter.expense', key: 'F8', d: P.wallet, tone: 'text-purple-400' }] : []),
  ]
  const ACCOUNTS: [string, string][] = [['/new/parties', 'party.title'], ['/new/audit', 'audit.title'], ['/new/hisaab', 'counter.dayTitle'], ['/new/reports', 'more.reports'], ['/new/more/cash', 'more.cashAccounts']]
  const MODES: { m: Mode; label: string }[] = [
    { m: 'cash', label: 'counter.cash' }, { m: 'online', label: 'npos.onlineBank' }, { m: 'udhaar', label: 'npos.udhaarKhata' }, { m: 'cheque', label: 'paym.cheque' }, { m: 'split', label: 'npos.split' },
  ]
  const QUICK: { q: Quick; label: string; dot?: string }[] = [
    { q: 'all', label: 'npos.qAll' }, { q: 'box', label: 'npos.qBox' }, { q: 'pta', label: 'npos.qPta', dot: 'bg-emerald-500' }, { q: 'idpending', label: 'npos.qIdPending', dot: 'bg-amber-500' }, { q: 'hidefaulty', label: 'npos.qHideFaulty', dot: 'bg-rose-500' },
  ]
  const bankRow = (label: string, chequeNo = false) => (
    <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 space-y-2" data-testid="npos-bank">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase text-slate-400 me-1">{pick(label)}</span>
        {POPULAR_BANKS.slice(0, 5).map((b) => (
          <button key={b} type="button" onClick={() => setPay({ ...pay, bank: b })} className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer ${pay.bank === b ? 'bg-slate-950 text-white border-slate-950 dark:bg-limebrand-400 dark:text-slate-950 dark:border-limebrand-400' : 'bg-slate-50 dark:bg-obsidian-900 border-slate-200 dark:border-obsidian-700'}`}>{b}</button>
        ))}
        <select aria-label={pick('paym.otherBank')} value={pay.bank && !POPULAR_BANKS.slice(0, 5).includes(pay.bank) ? pay.bank : ''} onChange={(e) => setPay({ ...pay, bank: e.target.value })} className="px-2 py-0.5 rounded-lg text-[11px] bg-slate-50 dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700">
          <option value="">{pick('paym.otherBank')}</option>
          {ALL_BANKS.filter((b) => !POPULAR_BANKS.slice(0, 5).includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pick(chequeNo ? 'paym.chequeNo' : 'paym.tid')} className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-50 dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-1 focus:ring-limebrand-400" data-testid="npos-ref" />
        {chequeNo ? <input type="date" value={pay.chequeDate} onChange={(e) => setPay({ ...pay, chequeDate: e.target.value })} className="px-2.5 py-1 rounded-lg text-xs bg-slate-50 dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700" /> : null}
      </div>
    </div>
  )

  return (
    <div className="font-display bg-slate-100 text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased lg:h-screen lg:overflow-hidden flex flex-col min-h-dvh" data-testid="npos" data-newui="1">
      {/* ===== TOP BAR ===== */}
      <header className="h-14 shrink-0 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-obsidian-700/80 px-3 sm:px-5 flex items-center justify-between gap-2.5 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <NavLink to="/new" className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-obsidian-800 text-slate-700 dark:text-slate-200" aria-label={pick('nav.dashboard')}><Svg d={P.menu} className="w-5 h-5" /></NavLink>
          <NavLink to="/new" className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-950 dark:bg-limebrand-400 text-limebrand-400 dark:text-slate-950 font-extrabold text-sm flex items-center justify-center shadow-sm tracking-tight" dir="ltr">{mark}</div>
            <div className="hidden sm:block leading-tight min-w-0">
              <div className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                <span className="truncate">{shopName}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-limebrand-400/20 text-limebrand-600 dark:text-limebrand-400 border border-limebrand-500/30" dir="ltr">POS F2</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{kinds.filter((k) => k !== 'all').map((k) => pick(`stock.kind.${k}`)).join(' · ')}</div>
            </div>
          </NavLink>
          {has('held_sales') ? (
            <button type="button" onClick={() => setHeldOpen(true)} className="ms-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-500/20 transition cursor-pointer shrink-0" data-testid="npos-held-open">
              <span className={`w-2 h-2 rounded-full bg-amber-500 ${held?.length ? 'animate-pulse' : ''}`} />
              <span>{pick('npos.heldBills')}</span>
              <span className="px-1.5 rounded-md bg-amber-500 text-slate-950 font-mono text-[11px] font-extrabold" data-testid="npos-held-count">{held?.length ?? 0}</span>
            </button>
          ) : null}
        </div>

        <div className="flex-1 max-w-xl hidden md:flex items-center gap-2">
          <div className="relative flex-1">
            <Svg d={P.search} sw={2.2} className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('npos.searchPh')} className="w-full ps-10 pe-8 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400 focus:bg-white dark:focus:bg-obsidian-800 transition" data-testid="npos-search" />
            {q ? <button type="button" onClick={() => setQ('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold px-1 cursor-pointer" aria-label={pick('common.clearSearch')}>✕</button> : null}
          </div>
          <button type="button" onClick={() => searchRef.current?.focus()} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-obsidian-800 hover:bg-slate-800 dark:hover:bg-obsidian-700 text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0">
            <Svg d={P.scan} className="w-4 h-4 text-limebrand-400" /><span>{pick('common.scan')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {manager ? (
            <button type="button" onClick={() => setShowCost(!showCost)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${showCost ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-obsidian-800 border-slate-200 dark:border-obsidian-700 text-slate-500'}`} data-testid="npos-cost-toggle" title={pick('npos.costHint')}>
              <Svg d={showCost ? P.eye : P.eyeOff} className="w-4 h-4" />
              <span className="hidden sm:inline">{pick(showCost ? 'npos.costShown' : 'npos.costHidden')}</span>
            </button>
          ) : null}
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="p-2 rounded-xl bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-obsidian-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-obsidian-700 transition cursor-pointer" aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')}>
            <Svg d={P.moon} className={`w-4 h-4 ${dark ? 'text-amber-400' : 'text-slate-700'}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* ===== COMPACT RAIL ===== */}
        <aside className="hidden lg:flex flex-col w-48 shrink-0 bg-white dark:bg-obsidian-900 border-e border-slate-200 dark:border-obsidian-700/80 p-2.5 overflow-y-auto pos-scroll z-20" data-testid="npos-rail">
          <div className={`font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 ${ur ? cls('sm') : 'text-[10px]'}`}>{pick('npos.quickCounter')}</div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <NavLink to="/new" className={railTile}>
              <div className="flex items-center justify-between text-slate-400"><Svg d={P.home} className="w-3.5 h-3.5" /><span className="text-[9px] font-mono" dir="ltr">ESC</span></div>
              <div className="text-[11px] font-bold mt-1.5">{pick('nav.dashboard')}</div>
            </NavLink>
            <div className="p-2 rounded-xl bg-limebrand-400 text-slate-950 border border-limebrand-500 shadow-sm shadow-limebrand-400/20">
              <div className="flex items-center justify-between"><Svg d={P.tag} sw={2.4} className="w-3.5 h-3.5" /><span className="text-[9px] font-mono font-extrabold bg-slate-950/15 px-1 rounded" dir="ltr">F2</span></div>
              <div className="text-[11px] font-extrabold mt-1.5">{pick('counter.sell')}</div>
            </div>
            {RAIL.map((r) => r.tone === 'dark' ? (
              <NavLink key={r.to} to={r.to} className="p-2 rounded-xl bg-slate-900 dark:bg-obsidian-850 text-white hover:bg-slate-800 border border-slate-800 dark:border-obsidian-700 text-start transition cursor-pointer block">
                <div className="flex items-center justify-between text-limebrand-400"><Svg d={r.d} sw={2.2} className="w-3.5 h-3.5" /><span className="text-[9px] font-mono text-slate-400" dir="ltr">{r.key}</span></div>
                <div className="text-[11px] font-bold mt-1.5">{pick(r.label)}</div>
              </NavLink>
            ) : (
              <NavLink key={r.to} to={r.to} className={railTile}>
                <div className={`flex items-center justify-between ${r.tone}`}><Svg d={r.d} className="w-3.5 h-3.5" /><span className="text-[9px] font-mono text-slate-400" dir="ltr">{r.key}</span></div>
                <div className="text-[11px] font-bold mt-1.5">{pick(r.label)}</div>
              </NavLink>
            ))}
          </div>
          <div className={`font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 border-t border-slate-200 dark:border-obsidian-800 pt-2 ${ur ? cls('sm') : 'text-[10px]'}`}>{pick('nav.accountsSection')}</div>
          <nav className="space-y-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
            {ACCOUNTS.map(([to, label]) => <NavLink key={to} to={to} className="block w-full text-start px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-obsidian-850 hover:text-slate-900 dark:hover:text-white transition cursor-pointer">{pick(label)}</NavLink>)}
          </nav>
        </aside>

        <main className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0">
          {/* ===== LEFT: THE STOCK ===== */}
          <section className="w-full lg:w-[61%] flex flex-col min-h-0 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-obsidian-700/80 bg-slate-50 dark:bg-obsidian-950">
            <div className="shrink-0 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-obsidian-800 px-3.5 sm:px-5 py-3 space-y-2.5">
              <div className="flex md:hidden items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('npos.searchPhShort')} className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400" />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" data-testid="npos-cats">
                {kinds.map((k) => {
                  const on = cat === k
                  return (
                    <button key={k} type="button" onClick={() => { setCat(k); setBrand('') }} aria-pressed={on} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${on ? 'bg-slate-950 text-white dark:bg-limebrand-400 dark:text-slate-950 shadow-sm' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-obsidian-800'}`} data-testid={`npos-cat-${k}`}>
                      <span>{pick(k === 'all' ? 'common.all' : `stock.kind.${k}`)}</span>
                      <span className={`font-mono text-[10px] px-1.5 rounded-md ${on ? 'bg-white/20 dark:bg-slate-950/15' : 'bg-slate-200/80 dark:bg-obsidian-800 text-slate-500 dark:text-slate-400'}`} dir="ltr">{count(k)}</span>
                    </button>
                  )
                })}
              </div>
              {brands.length > 1 && cat !== 'items' ? (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" data-testid="npos-brands">
                  {['', ...brands].map((b) => (
                    <button key={b || 'all'} type="button" onClick={() => setBrand(b)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition cursor-pointer ${brand === b ? 'bg-slate-950 text-white border-slate-950 dark:bg-limebrand-400 dark:text-slate-950 dark:border-limebrand-400' : 'bg-white dark:bg-obsidian-850 border-slate-200 dark:border-obsidian-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'}`} dir="auto">{b || pick('npos.allBrands')}</button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" data-testid="npos-quick">
                  {QUICK.map((f) => {
                    const on = quick === f.q
                    return (
                      <button key={f.q} type="button" onClick={() => setQuick(f.q)} aria-pressed={on} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap border transition cursor-pointer ${on ? 'bg-limebrand-400/20 border-limebrand-500 text-slate-900 dark:text-limebrand-400 font-bold' : 'font-semibold bg-white dark:bg-obsidian-850 border-slate-200 dark:border-obsidian-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'}`} data-testid={`npos-quick-${f.q}`}>
                        {f.dot ? <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} /> : null}{pick(f.label)}
                      </button>
                    )
                  })}
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                  <span className="font-mono font-bold text-slate-900 dark:text-white" data-testid="npos-shown">{shown}</span> {pick('npos.itemsTap')}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pos-scroll p-3.5 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5" data-testid="npos-grid">
                {!shown ? (
                  <div className="col-span-full py-14 text-center rounded-2xl border border-dashed border-slate-300 dark:border-obsidian-700">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{pick('npos.noMatch')}</p>
                    <button type="button" onClick={() => { setQ(''); setCat('all'); setQuick('all'); setBrand('') }} className="mt-3 px-4 py-1.5 rounded-xl bg-limebrand-400 text-slate-950 text-xs font-extrabold cursor-pointer">{pick('npos.resetFilters')}</button>
                  </div>
                ) : null}
                {shownDevs.map((d) => {
                  const on = devOn(d.id)
                  const faulty = d.status === 'faulty' || !!d.faults?.length
                  const official = d.pta_status === 'pta_approved' || d.pta_status === 'cpid'
                  const border = on ? 'border-limebrand-400 ring-2 ring-limebrand-400/35 bg-limebrand-400/[0.04] dark:bg-limebrand-400/[0.05]' : faulty ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50/30 dark:bg-rose-500/[0.03]' : 'border-slate-200 dark:border-obsidian-700/80 hover:border-slate-400 dark:hover:border-slate-500'
                  const spec = specLine(d, pick)
                  return (
                    <button type="button" key={d.id} onClick={() => addDevice(d)} aria-pressed={on} className={`group text-start rounded-2xl bg-white dark:bg-obsidian-850 border ${border} p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between`} data-testid="npos-card">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400" dir="auto">{d.brand_name} · {pick(`stock.kind.${devCat(d)}`)}</div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug mt-0.5 group-hover:text-emerald-700 dark:group-hover:text-limebrand-400 transition" dir="auto">{d.brand_name} {d.model_name}</h3>
                            {spec ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" dir="auto">{spec}</p> : null}
                          </div>
                          {on ? <span className="shrink-0 px-2 py-1 rounded-xl bg-limebrand-400 text-slate-950 font-extrabold text-[11px] shadow-sm">✓</span>
                            : <span className="shrink-0 w-7 h-7 rounded-xl bg-slate-100 dark:bg-obsidian-800 text-slate-500 dark:text-slate-400 group-hover:bg-limebrand-400 group-hover:text-slate-950 flex items-center justify-center font-bold text-sm transition">+</span>}
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                          {d.condition === 'box_pack'
                            ? <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">{pick('stock.condition.box_pack')}</span>
                            : <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300">{pick(`stock.condition.${d.condition}`)}</span>}
                          {hasPta(d) ? <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${official ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25'}`}>{pick(`stock.pta.${d.pta_status}`)}</span> : null}
                          {d.battery_health ? <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300" dir="ltr">{d.battery_health}% BH</span> : null}
                          {d.lock_type ? <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">{pick(`locked.type.${d.lock_type}`)}</span> : null}
                          {d.verification_status === 'clear' ? <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ {pick('npos.idChecked')}</span> : null}
                          {d.verification_status === 'pending' ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[10px] font-bold" data-testid="npos-card-idpending"><Svg d={P.warn} className="w-3 h-3" />{pick('npos.idPending')}</span> : null}
                          {d.verification_status === 'flagged' ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-rose-300 text-[10px] font-bold"><Svg d={P.warn} className="w-3 h-3" />{pick('stock.verification.flagged')}</span> : null}
                        </div>
                        {faulty ? <div className="mt-2 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1.5"><Svg d={P.warn} className="w-3.5 h-3.5" /><span>{pick('npos.faulty')}{d.faults?.length ? `: ${faultText(d.faults, pick)}` : ''}</span></div> : null}
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-obsidian-800 flex items-end justify-between gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-900 text-slate-600 dark:text-slate-300 font-mono text-[10px] font-semibold" dir="ltr">
                          <span className="opacity-60">{d.imei1 ? 'IMEI' : pick('devcat.serial')}:</span><span>{d.imei1 || d.serial}</span>
                        </span>
                        <div className="text-end">
                          <div className="font-mono font-extrabold text-base text-slate-900 dark:text-white leading-none" dir="ltr">{d.asking_price ? rs(d.asking_price) : '—'}</div>
                          {showCost && d.cost_price != null ? <div className="font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1" dir="ltr" data-testid="npos-card-cost">{pick('npos.cost')}: {rs(d.cost_price)}</div> : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {shownItems.map((it) => {
                  const on = itemOn(it.id)
                  return (
                    <button type="button" key={it.id} onClick={() => addItem(it)} className={`group text-start rounded-2xl bg-white dark:bg-obsidian-850 border ${on ? 'border-limebrand-400 ring-2 ring-limebrand-400/35 bg-limebrand-400/[0.04]' : 'border-slate-200 dark:border-obsidian-700/80 hover:border-slate-400'} p-3.5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between`} data-testid="npos-item-card">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400" dir="auto">{it.brand ? `${it.brand} · ` : ''}{pick('stock.kind.items')}</div>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug mt-0.5 group-hover:text-emerald-700 dark:group-hover:text-limebrand-400 transition" dir="auto">{ur && it.name_ur ? it.name_ur : it.name}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" dir="auto">{[kindLabel(pick, it.category), it.variant, it.compatible].filter(Boolean).join(' · ')}</p>
                          </div>
                          {on ? <span className="shrink-0 px-2 py-1 rounded-xl bg-limebrand-400 text-slate-950 font-extrabold text-[11px] shadow-sm">✓{on.qty > 1 ? ` ×${on.qty}` : ''}</span>
                            : <span className="shrink-0 w-7 h-7 rounded-xl bg-slate-100 dark:bg-obsidian-800 text-slate-500 dark:text-slate-400 group-hover:bg-limebrand-400 group-hover:text-slate-950 flex items-center justify-center font-bold text-sm transition">+</span>}
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25">{kindLabel(pick, it.category)}</span>
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold ${it.qty > 0 ? 'bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300' : 'bg-rose-500/15 text-rose-700'}`}>{t('npos.inStock', { n: it.qty })}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-obsidian-800 flex items-end justify-between gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-900 text-slate-600 dark:text-slate-300 font-mono text-[10px] font-semibold" dir="ltr"><span className="opacity-60">SKU:</span><span>{it.sku}</span></span>
                        <div className="text-end">
                          <div className="font-mono font-extrabold text-base text-slate-900 dark:text-white leading-none" dir="ltr">{rs(it.price)}</div>
                          {showCost && it.avg_cost != null ? <div className="font-mono text-[10px] font-semibold text-slate-400 mt-1" dir="ltr">{pick('npos.cost')}: {rs(it.avg_cost)}</div> : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ===== RIGHT: THE BILL ===== */}
          <section className="w-full lg:w-[39%] flex flex-col min-h-0 bg-white dark:bg-obsidian-900 z-10" data-testid="npos-bill">
            <div className="shrink-0 p-3.5 sm:px-4 sm:py-3 border-b border-slate-200 dark:border-obsidian-800 bg-slate-50/70 dark:bg-obsidian-900">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${ur ? cls('sm') : 'text-[11px]'}`}>{pick('npos.customerKhata')}</span>
                <div className="inline-flex p-0.5 rounded-xl bg-slate-200/80 dark:bg-obsidian-850 border border-slate-300/60 dark:border-obsidian-700">
                  <button type="button" onClick={() => { setWalkIn(true); setParty(null); if (mode === 'udhaar' || mode === 'split') setMode('cash') }} aria-pressed={walkIn} className={`px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer ${walkIn ? 'font-bold bg-white dark:bg-obsidian-700 text-slate-900 dark:text-white shadow-sm' : 'font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`} data-testid="npos-walkin">{pick('npos.walkIn')}</button>
                  <button type="button" onClick={() => setWalkIn(false)} aria-pressed={!walkIn} className={`px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer ${!walkIn ? 'font-bold bg-white dark:bg-obsidian-700 text-slate-900 dark:text-white shadow-sm' : 'font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`} data-testid="npos-khata">{pick('npos.khataRegular')}</button>
                </div>
              </div>
              {walkIn ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{pick('npos.walkInTitle')}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{pick('npos.walkInHint')}</div>
                  </div>
                  <input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder={pick('npos.namePhone')} maxLength={80} className="w-36 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-obsidian-700 focus:outline-none focus:ring-1 focus:ring-limebrand-400" data-testid="npos-buyer" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input value={party ? party.name : pq} onChange={(e) => { setParty(null); setPq(e.target.value); setPOpen(true) }} onFocus={() => setPOpen(true)} placeholder={pick('npos.khataSearch')} className="w-full ps-3 pe-7 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-850 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400" data-testid="npos-party-search" />
                      <button type="button" onClick={() => setPOpen(!pOpen)} className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] cursor-pointer" aria-label="open">▼</button>
                      {pOpen && !party ? (
                        <div className="absolute start-0 end-0 mt-1 max-h-48 overflow-y-auto pos-scroll rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 shadow-2xl z-30 divide-y divide-slate-100 dark:divide-obsidian-800" data-testid="npos-party-list">
                          {(parties ?? []).slice(0, 30).map((p) => (
                            <button key={p.id} type="button" onClick={() => { setParty(p); setPOpen(false); setPq('') }} className="w-full text-start px-3 py-2 hover:bg-slate-50 dark:hover:bg-obsidian-800 flex items-center justify-between gap-2 cursor-pointer">
                              <span className="min-w-0"><span className="block text-xs font-bold truncate" dir="auto">{ur && p.name_ur ? p.name_ur : p.name}</span><span className="block text-[10px] font-mono text-slate-400" dir="ltr">{p.phone}</span></span>
                              {Number((p as unknown as { balance?: string }).balance) ? <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-300" dir="ltr">{rs((p as unknown as { balance: string }).balance)}</span> : null}
                            </button>
                          ))}
                          {!(parties ?? []).length ? <div className="px-3 py-2 text-[11px] text-slate-400">{pick('npos.noCustomer')}</div> : null}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => setNewCust(true)} className="px-2.5 py-1.5 rounded-xl bg-limebrand-400/20 border border-limebrand-500/40 text-limebrand-600 dark:text-limebrand-400 text-[11px] font-extrabold hover:bg-limebrand-400/30 transition cursor-pointer shrink-0" data-testid="npos-new-customer">{pick('npos.new')}</button>
                  </div>
                  {party ? (() => {
                    const before = Number((party as unknown as { balance?: string }).balance || 0)
                    return (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30" data-testid="npos-khata-box">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate" dir="auto">{party.name} <span className="font-mono" dir="ltr">({party.phone})</span></span>
                          <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-300">{pick('npos.khataLedger')}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center bg-white/80 dark:bg-obsidian-950/80 rounded-lg p-1.5 border border-amber-500/20 font-mono">
                          <div><div className="text-[9px] text-slate-400 uppercase">{pick('npos.prevKhata')}</div><div className="text-[11px] font-bold text-slate-700 dark:text-slate-300" dir="ltr">{rs(before)}</div></div>
                          <div><div className="text-[9px] text-slate-400 uppercase">{pick('npos.thisUdhaar')}</div><div className="text-[11px] font-bold text-amber-600 dark:text-amber-400" dir="ltr">{rs(rest)}</div></div>
                          <div className="bg-amber-500/15 rounded"><div className="text-[9px] text-amber-700 dark:text-amber-300 uppercase font-bold">{pick('npos.newKhata')}</div><div className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300" dir="ltr" data-testid="npos-khata-new">{rs(before + rest)}</div></div>
                        </div>
                      </div>
                    )
                  })() : null}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pos-scroll p-3.5 sm:px-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={`font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${ur ? cls('sm') : 'text-[11px]'}`}>{pick('npos.billItems')} (<span className="font-mono text-slate-900 dark:text-white" data-testid="npos-count">{devLines.length + itemLines.reduce((s, l) => s + l.qty, 0)}</span>)</span>
                {lines.length ? <button type="button" onClick={() => setLines([])} className="text-[11px] font-bold text-rose-500 hover:underline cursor-pointer" data-testid="npos-clear">{pick('npos.clearBill')}</button> : null}
              </div>
              {!lines.length ? (
                <div className="py-8 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-obsidian-800 text-center">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{pick('npos.emptyTitle')}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{pick('npos.emptyHint')}</p>
                </div>
              ) : null}
              <div className="space-y-2" data-testid="npos-lines">
                {lines.map((l) => {
                  const title = l.k === 'dev' ? `${l.d.brand_name} ${l.d.model_name}` : ur && l.it.name_ur ? l.it.name_ur : l.it.name
                  const unitCost = l.k === 'dev' ? l.d.cost_price : l.it.avg_cost
                  const margin = unitCost != null && l.price !== '' ? r2(Number(l.price) - Number(unitCost)) : null
                  return (
                    <div key={l.k === 'dev' ? l.d.id : l.it.id} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700/80 animate-pop space-y-2" data-testid="npos-line">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate" dir="auto">{title}</div>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-slate-500" dir="ltr">{l.k === 'dev' ? `${l.d.imei1 ? 'IMEI' : 'S/N'}: ${l.d.imei1 || l.d.serial}` : `SKU: ${l.it.sku}`}</span>
                            {l.k === 'dev' ? (
                              <select value={l.warranty} onChange={(e) => setLine(l, { warranty: Number(e.target.value) })} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer" aria-label={pick('accx.warranty')} data-testid="npos-warranty">
                                {WARRANTY.map((w) => <option key={w} value={w}>{pick(`accx.w${w}`)}</option>)}
                              </select>
                            ) : null}
                          </div>
                        </div>
                        <button type="button" onClick={() => setLines(lines.filter((x) => x !== l))} className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer" aria-label={pick('crud.delete')} data-testid="npos-remove">✕</button>
                      </div>
                      <div className="pt-2 border-t border-slate-200/70 dark:border-obsidian-800 flex items-center justify-between gap-2">
                        <div>
                          {l.k === 'item' ? (
                            <div className="inline-flex items-center gap-1.5 bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-lg px-1.5 py-0.5" dir="ltr">
                              <button type="button" onClick={() => setLine(l, { qty: Math.max(1, l.qty - 1) })} className="w-5 h-5 font-bold cursor-pointer" aria-label="−">−</button>
                              <span className="font-mono text-xs font-extrabold px-1" data-testid="npos-qty">{l.qty}</span>
                              <button type="button" onClick={() => setLine(l, { qty: negativeOk ? l.qty + 1 : Math.min(l.qty + 1, l.max) })} className="w-5 h-5 font-bold cursor-pointer" aria-label="+">+</button>
                            </div>
                          ) : showCost && margin != null ? (
                            <span className={`font-mono text-[10px] font-semibold ${margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`} dir="ltr" data-testid="npos-margin">{pick('npos.cost')}: {rs(unitCost!)} ({margin >= 0 ? '+' : ''}{n0(margin)})</span>
                          ) : <span />}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400">{pick('npos.deal')}</span>
                          <input type="number" inputMode="numeric" min={0} value={l.price} onChange={(e) => setLine(l, { price: e.target.value })} className="w-28 text-end px-2.5 py-1 rounded-lg font-mono text-xs font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400 text-slate-900 dark:text-limebrand-400" dir="ltr" data-testid="npos-deal" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {has('exchange') && trade.mobiles ? (
                <div className="rounded-xl border border-slate-200 dark:border-obsidian-700/80 bg-slate-50/70 dark:bg-obsidian-850 overflow-hidden">
                  <button type="button" onClick={() => setTradeOpen(!tradeOpen)} className="w-full px-3 py-2 flex items-center justify-between text-start hover:bg-slate-100 dark:hover:bg-obsidian-800 transition cursor-pointer" data-testid="npos-trade">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-sky-500/15 text-sky-500 flex items-center justify-center text-xs font-bold">⇄</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{pick('npos.tradeIn')}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-bold">{pick(tradeOpen ? 'common.close' : 'npos.add')}</span>
                  </button>
                  {tradeOpen ? (
                    <div className="p-3 pt-2 border-t border-slate-200 dark:border-obsidian-800 space-y-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{pick('npos.tradeHint')}</p>
                      <button type="button" onClick={() => nav('/exchange/new')} className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-extrabold cursor-pointer" data-testid="npos-trade-open">{pick('npos.tradeOpen')}</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* ===== PAYMENT, TOTALS, BUTTONS ===== */}
            <div className="shrink-0 border-t border-slate-200 dark:border-obsidian-800 bg-slate-50 dark:bg-obsidian-950 p-3.5 sm:px-4 sm:py-3 space-y-2.5" data-testid="npos-foot">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${ur ? cls('sm') : 'text-[10px]'}`}>{pick('npos.payMode')}</span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <label className="inline-flex items-center gap-1 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold"><input type="checkbox" checked={discountOn} onChange={(e) => setDiscountOn(e.target.checked)} className="rounded accent-limebrand-400" data-testid="npos-discount-on" /><span>{pick('common.discount')}</span></label>
                    {has('tax') ? <label className="inline-flex items-center gap-1 cursor-pointer text-slate-600 dark:text-slate-300 font-semibold"><input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} className="rounded accent-limebrand-400" data-testid="npos-tax-on" /><span>{t('npos.tax', { r: taxRate })}</span></label> : null}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5" data-testid="npos-modes">
                  {MODES.map(({ m, label }) => (
                    <button key={m} type="button" onClick={() => chooseMode(m)} aria-pressed={mode === m} className={`py-1.5 px-1 rounded-lg text-[10px] sm:text-[11px] font-bold border transition cursor-pointer truncate ${mode === m ? 'bg-slate-950 text-white border-slate-950 dark:bg-limebrand-400 dark:text-slate-950 dark:border-limebrand-400 shadow-sm' : 'bg-white dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-obsidian-700 hover:border-slate-400'}`} data-testid={`npos-mode-${m}`}>{pick(label)}</button>
                  ))}
                </div>
              </div>

              {mode === 'online' ? bankRow('paym.whichBank') : null}
              {mode === 'cheque' ? bankRow('paym.chequeBank', true) : null}
              {mode === 'split' ? (
                <div className="p-2.5 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 space-y-2" data-testid="npos-split">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">{pick('npos.paidNow')}</label>
                      <div className="flex gap-1">
                        <input type="number" inputMode="numeric" min={0} value={split} onChange={(e) => setSplit(e.target.value)} className="w-full px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-50 dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-1 focus:ring-limebrand-400" dir="ltr" data-testid="npos-split-paid" />
                        <button type="button" onClick={() => setSplit(String(net))} className="px-2 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-obsidian-800 whitespace-nowrap">{pick('npos.fullPaid')}</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">{pick('npos.paidBy')}</label>
                      <div className="grid grid-cols-2 gap-1">
                        {(['cash', 'online'] as const).map((b) => <button key={b} type="button" onClick={() => setSplitBy(b)} className={`py-1 rounded-lg text-[11px] font-bold border ${splitBy === b ? 'bg-slate-950 text-white border-slate-950 dark:bg-limebrand-400 dark:text-slate-950' : 'bg-slate-50 dark:bg-obsidian-900 border-slate-300 dark:border-obsidian-700'}`}>{pick(b === 'cash' ? 'counter.cash' : 'paym.online')}</button>)}
                      </div>
                    </div>
                  </div>
                  {splitBy === 'online' && paidNow > 0 ? bankRow('paym.whichBank') : null}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-obsidian-800">
                    <span className="text-slate-500">{pick('npos.restUdhaar')}</span>
                    <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400" dir="ltr" data-testid="npos-split-rest">{rs(rest)}</span>
                  </div>
                </div>
              ) : null}

              {discountOn ? (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{pick('npos.extraDiscount')}</label>
                  <input type="number" inputMode="numeric" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 text-end px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-1 focus:ring-limebrand-400" dir="ltr" data-testid="npos-discount" />
                </div>
              ) : null}

              <div className="space-y-1 text-[11px] pt-1 border-t border-slate-200/80 dark:border-obsidian-800">
                <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>{pick('npos.subtotal')}</span><span className="font-mono font-semibold text-slate-800 dark:text-slate-200" dir="ltr" data-testid="npos-subtotal">{rs(subtotal)}</span></div>
                {disc > 0 ? <div className="flex justify-between text-rose-500 font-semibold"><span>{pick('npos.billDiscount')}</span><span className="font-mono" dir="ltr">−{rs(disc)}</span></div> : null}
                {tax > 0 ? <div className="flex justify-between text-slate-500 font-semibold"><span>{t('npos.tax', { r: taxRate })}</span><span className="font-mono" dir="ltr">+{rs(tax)}</span></div> : null}
              </div>

              <div className="flex items-end justify-between pt-1">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('npos.netPayable')}</div>
                  <div className="text-2xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white leading-none mt-0.5" dir="ltr" data-testid="npos-net">{rs(net)}</div>
                </div>
                {showCost && canCost ? (
                  <div className="text-end" data-testid="npos-profit">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{pick('npos.estProfit')}</div>
                    <div className={`text-xs font-extrabold font-mono px-2.5 py-1 rounded-lg mt-0.5 border ${profit >= 0 ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25'}`} dir="ltr">{profit >= 0 ? '+' : '−'}{rs(Math.abs(profit))}</div>
                  </div>
                ) : null}
              </div>

              {!whoOk && lines.length ? <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400" data-testid="npos-need-khata">{pick('npos.needKhata')}</div> : null}
              <div className="grid grid-cols-3 gap-2 pt-0.5">
                {has('held_sales') ? (
                  <button type="button" onClick={hold} disabled={!lines.length} className="col-span-1 py-2.5 px-2.5 rounded-xl bg-white dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-obsidian-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50" data-testid="npos-hold">
                    <Svg d={P.pause} sw={2.2} className="w-3.5 h-3.5 text-amber-500" /><span>{pick('npos.holdBill')}</span>
                  </button>
                ) : <span />}
                <button type="button" onClick={() => { setErr(null); setConfirming(true) }} disabled={!ready} className="col-span-2 py-2.5 px-3 rounded-xl bg-limebrand-400 hover:bg-limebrand-500 active:scale-[0.99] text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-limebrand-400/25 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="npos-complete">
                  <span>✓ {pick('npos.complete')}</span>
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* ===== CONFIRM: the rules before the bill, in the file's modal ===== */}
      <Modal open={confirming} title={pick('npos.confirmTitle')} onClose={() => setConfirming(false)} wide testid="npos-confirm">
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto pos-scroll">
          <div className="space-y-1 text-xs">
            {lines.map((l) => (
              <div key={l.k === 'dev' ? l.d.id : l.it.id} className="flex justify-between gap-2">
                <span className="truncate" dir="auto">{l.k === 'dev' ? `${l.d.brand_name} ${l.d.model_name}` : `${l.it.name} ×${l.qty}`}</span>
                <span className="font-mono font-bold shrink-0" dir="ltr">{rs(l.k === 'dev' ? l.price : l.qty * Number(l.price))}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-obsidian-800 space-y-1 text-xs">
            <div className="flex justify-between font-extrabold"><span>{pick('npos.netPayable')}</span><span className="font-mono" dir="ltr">{rs(net)}</span></div>
            <div className="flex justify-between"><span>{pick('npos.paidNow')}</span><span className="font-mono" dir="ltr">{rs(paidNow)}</span></div>
            {rest > 0 ? <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold"><span>{pick('npos.restUdhaar')} — {party?.name}</span><span className="font-mono" dir="ltr">{rs(rest)}</span></div> : null}
          </div>
          {flagged.length ? (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2" data-testid="npos-flagged">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5"><Svg d={P.warn} className="w-4 h-4" />{pick('counter.flaggedSale')}</div>
              {role === 'owner' ? <input value={override} onChange={(e) => setOverride(e.target.value)} placeholder={pick('sale.override')} className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700" /> : <div className="text-[11px] text-rose-600">{pick('npos.ownerOnly')}</div>}
            </div>
          ) : pending.length ? (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2" data-testid="npos-pending">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><Svg d={P.warn} className="w-4 h-4" />{pick('counter.pendingSale')}</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => nav(`/stock/${pending[0].d.id}/verify`)} className="py-2 rounded-lg bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-obsidian-700 text-xs font-bold">{pick('counter.checkNow')}</button>
                <button type="button" onClick={() => setOverride(override ? '' : pick('purchase.skipReason'))} aria-pressed={!!override} className={`py-2 rounded-lg text-xs font-bold border ${override ? 'bg-slate-950 text-white border-slate-950 dark:bg-limebrand-400 dark:text-slate-950' : 'bg-white dark:bg-obsidian-900 border-slate-300 dark:border-obsidian-700'}`} data-testid="npos-skip">{pick('counter.skipAndSell')}</button>
              </div>
            </div>
          ) : null}
          {loss.length ? (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2" data-testid="npos-loss">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">{t('npos.belowCost', { n: loss.length })}</div>
              {manager ? <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={lossOk} onChange={(e) => setLossOk(e.target.checked)} className="accent-rose-500" data-testid="npos-loss-ok" />{pick('field.belowCostOk')}</label> : <div className="text-[11px] text-rose-600">{pick('field.belowCostBlocked')}</div>}
            </div>
          ) : null}
          {needPin ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-500">{pick(code === 'pin_wrong' ? 'confirm.pinWrong' : 'confirm.pinNeeded')}</label>
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} className="w-full px-3 py-2 rounded-xl text-sm font-mono bg-slate-100 dark:bg-obsidian-850 border border-slate-300 dark:border-obsidian-700" data-testid="npos-pin" />
            </div>
          ) : null}
          {err && !needPin ? <div className="text-xs font-bold text-rose-600" data-testid="npos-error">{err instanceof ApiError ? (ur ? err.messageUr || err.messageEn : err.messageEn) : String(err)}</div> : null}
          <button type="button" onClick={submit} disabled={busy || !ruleOk || (needPin && pin.length < 4)} className="w-full py-2.5 rounded-xl bg-limebrand-400 hover:bg-limebrand-500 text-slate-950 font-extrabold text-sm disabled:opacity-50" data-testid="npos-confirm-go">
            {busy ? '…' : `✓ ${pick('npos.confirmGo')}`}
          </button>
        </div>
      </Modal>

      {/* ===== RECEIPT ===== */}
      {result ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" data-testid="npos-receipt">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-obsidian-700 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-pop">
            <div className="bg-limebrand-400 text-slate-950 px-5 py-3.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">{pick('npos.recorded')}</div>
                <h3 className="text-base font-extrabold truncate">{shopName}{shop?.city ? ` — ${shop.city}` : ''}</h3>
              </div>
              <span className="font-mono text-xs font-extrabold bg-slate-950/15 px-2.5 py-1 rounded-lg shrink-0" dir="ltr" data-testid="npos-invoice-no">#{result.no}</span>
            </div>
            <div className="p-5 space-y-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 max-h-[55vh] overflow-y-auto pos-scroll">
              {result.lines.map((l) => (
                <div key={l.id} className="flex justify-between gap-2"><span className="truncate" dir="auto">{l.device_label || l.description}{l.qty > 1 ? ` ×${l.qty}` : ''}</span><span dir="ltr">{rs(l.line_total)}</span></div>
              ))}
              <div className="pt-2 mt-2 border-t border-dashed border-slate-300 dark:border-obsidian-700 flex justify-between font-extrabold"><span>{pick('npos.netPayable')}</span><span dir="ltr">{rs(result.total)}</span></div>
              <div className="flex justify-between"><span>{pick('npos.paidNow')}</span><span dir="ltr">{rs(result.paid)}</span></div>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-obsidian-950 border-t border-slate-200 dark:border-obsidian-800 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${shopName}\n#${result.no}\n${result.lines.map((l) => `${l.device_label || l.description} — ${rs(l.line_total)}`).join('\n')}\n${pick('npos.netPayable')}: ${rs(result.total)}`); setToast(pick('npos.copied')) }} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
                <Svg d={P.copy} className="w-3.5 h-3.5" /><span>{pick('npos.copyWa')}</span>
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openPrintable(`/api/v1/sales/${result.id}/receipt?format=thermal`)} className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-obsidian-800 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5" data-testid="npos-print">
                  <Svg d={P.print} className="w-3.5 h-3.5" />{pick('common.print')}
                </button>
                <button type="button" onClick={() => { setResult(null); reset(); searchRef.current?.focus() }} className="px-3.5 py-2 rounded-xl bg-limebrand-400 hover:bg-limebrand-500 text-slate-950 text-xs font-extrabold transition cursor-pointer" data-testid="npos-new-sale">{pick('npos.newSale')}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== HELD BILLS ===== */}
      <Modal open={heldOpen} title={pick('npos.heldTitle')} onClose={() => setHeldOpen(false)} wide testid="npos-held">
        <div className="p-4 space-y-2.5 max-h-80 overflow-y-auto pos-scroll">
          {!(held ?? []).length ? <p className="text-xs text-slate-400 text-center py-4">{pick('npos.noHeld')}</p> : null}
          {(held ?? []).map((h) => {
            const ours = (h.cart as Cart | undefined)?.v === 'newui'
            return (
              <div key={h.id} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-obsidian-700 flex items-center justify-between gap-2" data-testid="npos-held-row">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" dir="auto">{h.label || pick('npos.walkInTitle')}</div>
                  <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{t('npos.heldMeta', { n: h.items })} · {rs(h.total)}</div>
                </div>
                {ours
                  ? <button type="button" onClick={() => resume(h)} className="px-3 py-1.5 rounded-lg bg-limebrand-400 text-slate-950 text-xs font-extrabold shrink-0" data-testid="npos-resume">{pick('npos.resume')}</button>
                  : <a href="/sale/new" className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-obsidian-800 text-xs font-bold shrink-0">{pick('newui.openOld')}</a>}
              </div>
            )
          })}
        </div>
      </Modal>

      {/* ===== NEW KHATA CUSTOMER ===== */}
      <NewCustomer open={newCust} onClose={() => setNewCust(false)} onMade={(p) => { setParty(p); setWalkIn(false); setNewCust(false) }} />

      {toast ? <div className="fixed bottom-4 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xl" role="status" data-testid="npos-toast">{toast}</div> : null}
    </div>
  )
}

function NewCustomer({ open, onClose, onMade }: { open: boolean; onClose: () => void; onMade: (p: Party) => void }) {
  const { pick } = useLang()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inv = useInvalidate()
  useEffect(() => { if (open) { setName(''); setPhone(''); setErr('') } }, [open])
  async function save() {
    setBusy(true); setErr('')
    try {
      const p = await post<Party>('/api/v1/parties', { name: name.trim(), phone: phone.trim() || null, kinds: ['customer'] })
      await inv('parties'); onMade(p)
    } catch (e) { setErr(e instanceof ApiError ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} title={pick('npos.newCustomerTitle')} onClose={onClose} testid="npos-new-customer-modal">
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1">{pick('npos.custName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-obsidian-850 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400" data-testid="npos-cust-name" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 mb-1">{pick('npos.custPhone')}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-100 dark:bg-obsidian-850 border border-slate-300 dark:border-obsidian-700 focus:outline-none focus:ring-2 focus:ring-limebrand-400" dir="ltr" data-testid="npos-cust-phone" />
        </div>
        {err ? <div className="text-xs font-bold text-rose-600">{err}</div> : null}
        <button type="button" onClick={save} disabled={busy || name.trim().length < 2} className="w-full py-2.5 rounded-xl bg-limebrand-400 text-slate-950 text-sm font-extrabold disabled:opacity-50" data-testid="npos-cust-save">{pick('common.save')}</button>
      </div>
    </Modal>
  )
}
