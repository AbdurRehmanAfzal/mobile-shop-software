/** Add stock / New purchase (F3) in the new product (ADR-134), drawn from
 *  `01-add-stock-and-purchase.html`: a full-screen counter with the file's own sidebar and bar, the
 *  builder on the left (where the stock comes from, then a device / locked phone / accessory lot /
 *  custom line) and the bill on the right (lines, dealer's bill no., discount, when, payment, the
 *  total and "Put in stock").
 *
 *  It fills the live purchase's own line (`DeviceLineDraft` → `draftToApi`) and posts what the live
 *  purchase posts (`POST /api/v1/purchases`), so the server's rules are the same; the live form's
 *  checks are kept: a 15-digit IMEI (a serial for a Wi-Fi tablet, a GPS watch or a laptop), a phone
 *  already in stock is refused, the asking price is not under the cost, a patched phone says what
 *  was patched, a used tablet / watch (a phone when the shop says so) has its locks checked, and the
 *  bill is shown once more and ticked before it is saved (owner 2026-11-09). An accessory is first
 *  looked for among the shop's items, so the same charger is not made twice (designed here).
 *
 *  Differences from the drawing: the bill's number is the server's (shown once saved); a locked
 *  phone picks its brand and model from the catalogue and its lock as iCloud / Google / other; the
 *  locked phone's free note is not stored (the server has no place for it); "Auto-gen test IMEI" is
 *  sample and not built; the warranty choices are the live software's months and who gives it. */

import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle, ArrowLeft, Banknote, BarChart3, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, FileCheck, FileText, Headphones, Home,
  Landmark, Languages, Lock, Moon, PackageCheck, PackagePlus, Plus, PlusCircle, PlusSquare, Printer, ScanLine, ShieldAlert, ShieldCheck, ShoppingBag, Smartphone,
  Store, Sun, Tag, Undo2, UserCheck, Users, Wallet, Wrench, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import { ACC_FOR, type AccKind } from '@/components/AccessoryPicker'
import { labelPath, loadLabelPrefs } from '@/components/LabelSheet'
import { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { ApiError, api, post } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useModules, useTrade } from '@/lib/modules'
import { useBrands, useColours, useGet, useImeiLookup, useInvalidate, useModels, useParties, useSerialLookup, useStorages } from '@/lib/queries'
import { beep, useScan } from '@/lib/scanner'
import { useTheme } from '@/lib/theme'
import type { AccessoryItem, DeviceCategory, Party } from '@/lib/types'
import { FAULT_KEYS, faultName } from '@/features/stock/Faults'
import { draftToApi, emptyDraft, expandDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import { isApple } from '@/features/purchase/AppleVariant'
import { ALL_BANKS, POPULAR_BANKS } from '@/lib/pkPayments'

type Source = 'supplier' | 'walk_in'
type Tab = 'device' | 'locked' | 'accessory' | 'custom'
type Mode = 'cash' | 'online' | 'cheque' | 'udhaar'
interface Item { id: string; name: string; name_ur: string | null; category: string; qty: number; price: string; sku: string }
interface MiscLine { key: string; description: string; qty: number; unit_cost: string; accessory_id?: string; newItem?: { name: string; category: string; price: string; reorder_level: number; grade: string; compatible: string } }
interface Purchase { id: string; no: string; total: string; paid: string; lines: { device_id: string | null; accessory_id?: string | null }[] }

const n0 = (v: number | string) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const rs = (v: number | string) => withCur(n0(v))
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const digits = (s: string) => s.replace(/[^\d]/g, '')
const OFF = (x: string) => `px-2 py-1 rounded-lg ${x} font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 cursor-pointer`
const ON = (x: string) => `px-2 py-1 rounded-lg ${x} font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 cursor-pointer`
const INPUT = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]'
const LABEL = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1'
/** the file's warranty choices, as the live software stores them (months + who gives it) */
const WARRANTY: { key: string; months: string; by: DeviceLineDraft['warranty_by'] }[] = [
  { key: 'w12co', months: '12', by: 'brand' }, { key: 'wshop', months: '0', by: 'shop' }, { key: 'wsupplier', months: '0', by: 'supplier' }, { key: 'wnone', months: '0', by: '' },
]
const ACC_KINDS = ['charger', 'cable', 'cover', 'glass', 'watch', 'earphones', 'power_bank']
const GRADES = ['original', 'oem', 'a_grade', 'copy']

export default function NewPurchase() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const has = useModules()
  const trade = useTrade()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const canCost = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  /* the source and the person */
  const [source, setSource] = useState<Source>(trade.devices ? 'supplier' : 'supplier')
  const partyKind = source === 'supplier' ? 'supplier' : 'customer'
  const { data: parties } = useParties({ kind: partyKind })
  const [party, setParty] = useState<Party | null>(null)
  const [idChecked, setIdChecked] = useState(false)
  const [cnic, setCnic] = useState('')
  const [newParty, setNewParty] = useState(false)

  /* the builder */
  const kinds: DeviceCategory[] = [...(trade.mobiles ? (['phone', 'tablet', 'watch'] as const) : []), ...(trade.laptops ? (['laptop'] as const) : [])]
  const [tab, setTab] = useState<Tab>(trade.devices ? 'device' : 'accessory')
  const [d, setD] = useState<DeviceLineDraft>(() => emptyDraft('', 'supplier'))
  const [editing, setEditing] = useState<string | null>(null)
  const set = <K extends keyof DeviceLineDraft>(k: K, v: DeviceLineDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const [modelQ, setModelQ] = useState('')
  const [bulk, setBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [faultsOpen, setFaultsOpen] = useState(false)
  const [otherFault, setOtherFault] = useState('')

  /* the bill */
  const [devices, setDevices] = useState<DeviceLineDraft[]>([])
  const [misc, setMisc] = useState<MiscLine[]>([])
  const [billNo, setBillNo] = useState('')
  const [discount, setDiscount] = useState('')
  const [earlier, setEarlier] = useState(false)
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<Mode>('cash')
  const [pay, setPay] = useState<PayState>(() => newPay('cash'))
  const [paidNow, setPaidNow] = useState('')
  const [showCost, setShowCost] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Purchase | null>(null)
  const [withCode, setWithCode] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2400); return () => clearTimeout(x) }, [toast])

  /* catalogue and checks (the live sheet's own sources) */
  const category: DeviceCategory = tab === 'locked' ? 'phone' : d.category ?? 'phone'
  const { data: brands } = useBrands(category)
  const { data: models } = useModels(d.brand_id || undefined, modelQ || undefined, category)
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const { data: dopts } = useGet<{ require_lock_check: boolean; region_codes?: string[]; sim_types?: string[] }>(['device-options'], '/api/v1/devices/options')
  const phone = category === 'phone'
  const laptop = category === 'laptop'
  const sim = phone || (!laptop && !!d.cellular)
  const imei = digits(d.imei1)
  const { data: lookup } = useImeiLookup(tab === 'device' || tab === 'locked' ? imei : '')
  const { data: serialLookup } = useSerialLookup(tab === 'device' && !sim ? d.serial : '')
  const gone = (s?: string) => !!s && !['sold', 'returned_to_supplier', 'transferred'].includes(s)
  const inStock = (lookup?.found && gone(lookup.device?.status)) || (serialLookup?.found && gone(serialLookup.device?.status))
  const serialOk = /^[A-Za-z0-9-]{4,24}$/.test(d.serial.trim())
  const used = d.condition !== 'box_pack'
  const lockNeeded = tab === 'device' && used && (category === 'tablet' || category === 'watch' || !!dopts?.require_lock_check)
  const askingLow = d.asking_price !== '' && d.cost !== '' && Number(d.asking_price) < Number(d.cost)
  const extra = bulk ? bulkText.split(/[\s,]+/).map((x) => (sim ? digits(x) : x.trim().toUpperCase())).filter(Boolean) : []
  const extraOk = extra.every((x) => (sim ? /^\d{15}$/.test(x) : /^[A-Z0-9-]{4,24}$/.test(x))) && new Set(extra).size === extra.length
  const identityOk = tab === 'locked' ? (imei === '' || imei.length === 15) && (!d.serial.trim() || serialOk) && (!!imei || !!d.serial.trim()) : sim ? imei.length === 15 : laptop ? !d.serial.trim() || serialOk : serialOk
  const batteryOk = d.battery_health === '' || (Number(d.battery_health) >= 1 && Number(d.battery_health) <= 100)
  const lineOk = identityOk && !!d.brand_id && !!d.model_id && d.cost !== '' && Number(d.cost) >= 0 && !askingLow && !inStock && batteryOk
    && (tab === 'locked' || ((d.condition !== 'patched' || !!d.patch_details?.trim()) && (!lockNeeded || !!d.lock_checked) && extraOk))

  /* the shop's items, for the accessory lot */
  const { data: items } = useGet<Item[]>(['accessories', 'all'], has('accessories') ? '/api/v1/accessories' : null)
  const [acc, setAcc] = useState({ name: '', fits: '', kind: 'charger', grade: 'original', qty: '10', cost: '', price: '', reorder: '3', itemId: '' as string })
  const accHits = useMemo(() => (acc.name.trim().length >= 2 && !acc.itemId ? (items ?? []).filter((i) => i.name.toLowerCase().includes(acc.name.trim().toLowerCase())).slice(0, 6) : []), [items, acc.name, acc.itemId])
  const [custom, setCustom] = useState({ desc: '', cost: '' })

  /* a scanner fills IMEI 1, then IMEI 2 */
  useScan(result || reviewing ? null : (code) => {
    const v = digits(code)
    if (v.length === 15) {
      if (!imei) set('imei1', v); else if (bulk) setBulkText((x) => `${x}${x ? '\n' : ''}${v}`); else if (!d.imei2 && v !== imei) set('imei2', v)
      beep('ok'); return
    }
    set('manufacturer_code', code); beep('ok')
  })

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  function chooseSource(s: Source) {
    setSource(s); setParty(null); setIdChecked(false); setCnic('')
    setD((x) => ({ ...x, condition: s === 'supplier' ? 'box_pack' : 'used', warranty_months: s === 'supplier' ? '12' : '0', warranty_by: s === 'supplier' ? 'brand' : '' }))
  }
  function freshDraft(cat: DeviceCategory = d.category ?? 'phone'): DeviceLineDraft {
    const x = emptyDraft('', source === 'supplier' ? 'supplier' : 'walk_in')
    return { ...x, category: cat, warranty_by: source === 'supplier' ? 'brand' : '' }
  }
  function addDevice() {
    if (!lineOk) return
    const line: DeviceLineDraft = { ...d, imei1: tab === 'locked' || sim ? imei : '', serial: d.serial.trim().toUpperCase(), faults: [...(d.faults ?? []), ...(otherFault.trim() ? [otherFault.trim()] : [])], extra_ids: tab === 'device' ? extra : [] }
    const lines = expandDraft(line)
    setDevices((xs) => (editing ? xs.map((x) => (x.key === editing ? line : x)) : [...xs, ...lines]))
    setEditing(null); setBulk(false); setBulkText(''); setOtherFault(''); setFaultsOpen(false); setModelQ('')
    setD({ ...freshDraft(), brand_id: line.brand_id, brand_name: line.brand_name })
    setToast(t('nbuy.added', { n: lines.length }))
  }
  function editLine(x: DeviceLineDraft) {
    setTab(x.lock_type ? 'locked' : 'device'); setD(x); setEditing(x.key); setModelQ('')
  }
  async function addAccessory() {
    const qty = Math.max(1, Number(acc.qty || 1))
    if (!acc.name.trim() || acc.cost === '') return
    if (acc.itemId) setMisc((m) => [...m, { key: uid(), description: acc.name.trim(), qty, unit_cost: acc.cost, accessory_id: acc.itemId }])
    else setMisc((m) => [...m, { key: uid(), description: acc.name.trim(), qty, unit_cost: acc.cost, newItem: { name: acc.name.trim(), category: acc.kind, price: acc.price || acc.cost, reorder_level: Number(acc.reorder || 0), grade: acc.grade, compatible: acc.fits.trim() } }])
    setAcc({ name: '', fits: '', kind: acc.kind, grade: acc.grade, qty: '10', cost: '', price: '', reorder: '3', itemId: '' })
  }
  function addCustom() {
    if (!custom.desc.trim() || custom.cost === '') return
    setMisc((m) => [...m, { key: uid(), description: custom.desc.trim(), qty: 1, unit_cost: custom.cost }])
    setCustom({ desc: '', cost: '' })
  }

  /* money */
  const subtotal = devices.reduce((s, x) => s + Number(x.cost || 0), 0) + misc.reduce((s, x) => s + x.qty * Number(x.unit_cost || 0), 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const paid = mode === 'udhaar' ? Math.min(Math.max(0, Number(paidNow || 0)), total) : total
  const rest = Math.round((total - paid) * 100) / 100
  const payOk = mode === 'online' || mode === 'cheque' ? payReady({ ...pay, method: mode }) : true
  const count = devices.length + misc.length
  const ready = !!party && count > 0 && total > 0 && payOk

  async function save() {
    setBusy(true); setErr('')
    try {
      // a new item is made first, with no stock: the bill brings its pieces (ADR-121)
      const lines = await Promise.all(misc.map(async (x) => {
        if (!x.newItem) return x
        const made = await post<{ id: string }>('/api/v1/accessories', { name: x.newItem.name, category: x.newItem.category, price: Number(x.newItem.price || 0), reorder_level: x.newItem.reorder_level, grade: x.newItem.grade, compatible: x.newItem.compatible || undefined, opening_qty: 0 })
        return { ...x, accessory_id: made.id, newItem: undefined }
      }))
      setMisc(lines)
      const body = {
        kind: source,
        party_id: party!.id,
        devices: devices.map(draftToApi),
        misc: lines.map((x) => ({ description: x.description, qty: x.qty, unit_cost: Number(x.unit_cost || 0), accessory_id: x.accessory_id, unit: 'piece' })),
        discount: Number(discount || 0),
        supplier_invoice_no: source === 'supplier' && billNo.trim() ? billNo.trim() : undefined,
        extra_costs: 0,
        paid,
        payment: mode === 'online' || mode === 'cheque' ? payInfo({ ...pay, method: mode }) : undefined,
        purchased_at: earlier && when ? new Date(`${when}T12:00:00`).toISOString() : undefined,
      }
      const res = await post<Purchase>('/api/v1/purchases', body)
      // "ID checked" for a customer's phone: each phone is marked checked now, with the reason (the live rule)
      if (source === 'walk_in' && idChecked) {
        for (const l of res.lines.filter((x) => x.device_id)) await api('POST', `/api/v1/devices/${l.device_id}/verification/override`, { reason: pick('purchase.skipReason') }).catch(() => undefined)
      }
      if (source === 'walk_in' && cnic.trim() && party && !party.cnic) await api('PATCH', `/api/v1/parties/${party.id}`, { cnic: cnic.trim() }).catch(() => undefined)
      setReviewing(false); setResult(res)
      await inv('devices'); await inv('stock-summary'); await inv('accessories'); await inv('parties')
    } catch (e) { setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e)) } finally { setBusy(false) }
  }
  function startNext() {
    setResult(null); setDevices([]); setMisc([]); setBillNo(''); setDiscount(''); setEarlier(false); setMode('cash'); setPay(newPay('cash')); setPaidNow(''); setTicked(false)
    setD(freshDraft()); setParty(null); setIdChecked(false); setCnic(''); setEditing(null)
    setTab(trade.devices ? 'device' : 'accessory')
  }

  /* ------------------------------------------------------------------ drawing */

  const shopName = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const bal = Number((party as unknown as { balance?: string } | null)?.balance || 0)
  const navBtn = 'w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-obsidian-850 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-between cursor-pointer transition-colors'
  const NAV: { to: string; label: string; key: string; Icon: typeof Tag }[] = [
    { to: '/new/khata', label: 'counter.khata', key: 'F4', Icon: BookOpen },
    { to: '/new/stock/summary', label: 'counter.stock', key: 'F6', Icon: Smartphone },
    ...(has('repairs') ? [{ to: '/new/repairs', label: 'counter.repair', key: 'F7', Icon: Wrench }] : []),
    { to: '/new/return/new', label: 'counter.returnJob', key: 'F9', Icon: Undo2 },
    { to: '/new/invoices', label: 'inv.short', key: 'F10', Icon: FileText },
    ...(has('expenses') ? [{ to: '/new/expenses', label: 'counter.expense', key: 'F8', Icon: Wallet }] : []),
  ]
  const SHOP: [string, string, typeof Tag][] = [['/new/parties', 'party.title', Users], ['/new/audit', 'audit.title', ShieldCheck], ['/new/hisaab', 'counter.dayTitle', CalendarCheck], ['/new/reports', 'more.reports', BarChart3], ['/new/more/cash', 'more.cashAccounts', Landmark], ['/new/purchases', 'nav.purchases', ShoppingBag]]
  const tabBtn = (k: Tab, label: string, Icon: typeof Tag, tone: string) => (
    <button type="button" onClick={() => { setTab(k); if (k === 'locked') setD({ ...freshDraft('phone'), lock_type: 'icloud', condition: 'used', pta_status: 'unknown' }); else if (k === 'device' && d.lock_type) setD(freshDraft('phone')); setEditing(null) }} aria-pressed={tab === k}
      className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`} data-testid={`nbuy-tab-${k}`}>
      <Icon className={`w-3.5 h-3.5 ${tab === k ? '' : tone}`} /><span>{pick(label)}</span>
    </button>
  )
  const accFor = ACC_FOR[category] ?? ACC_FOR.phone
  const accState = (k: AccKind): 'no' | 'now' | 'later' => { const a = d.accessories.find((x) => x.kind === k); return !a ? 'no' : a.came_with ? 'now' : 'later' }
  const setAccState = (k: AccKind, s: 'no' | 'now' | 'later') => set('accessories', [...d.accessories.filter((x) => x.kind !== k), ...(s === 'now' ? [{ kind: k, came_with: true, pending_from: 'none' } as AccessoryItem] : s === 'later' ? [{ kind: k, came_with: false, pending_from: 'vendor', expected_at: null } as AccessoryItem] : [])])
  const apple = isApple(d.brand_name, d.model_name)
  const brandModel = (testPrefix: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{pick('nbuy.brandModel')} *</label>
        {d.brand_name ? <span className="text-[11px] font-extrabold text-emerald-700 dark:text-[#9AE600]" dir="auto" data-testid={`${testPrefix}-preview`}>{d.brand_name}{d.model_name ? ` • ${d.model_name}` : ''}</span> : null}
      </div>
      <div className="flex flex-wrap gap-1.5" data-testid={`${testPrefix}-brands`}>
        {(brands ?? []).slice(0, 14).map((b) => (
          <button key={b.id} type="button" onClick={() => { setD((x) => ({ ...x, brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' })); setModelQ('') }} className={d.brand_id === b.id ? ON('text-xs') : OFF('text-xs')} dir="auto">{b.name}</button>
        ))}
        {(brands ?? []).length > 14 ? (
          <select value={(brands ?? []).slice(14).some((b) => b.id === d.brand_id) ? d.brand_id : ''} onChange={(e) => { const b = brands?.find((x) => x.id === e.target.value); if (b) setD((x) => ({ ...x, brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' })) }} className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-obsidian-850 border-0">
            <option value="">{pick('nbuy.moreBrands')}</option>
            {(brands ?? []).slice(14).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : null}
      </div>
      {d.brand_id ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start pt-0.5">
          <div className="sm:col-span-7 flex flex-wrap gap-1.5" data-testid={`${testPrefix}-models`}>
            {(models ?? []).slice(0, 10).map((m) => (
              <button key={m.id} type="button" onClick={() => { setD((x) => ({ ...x, model_id: m.id, model_name: m.name })); setModelQ('') }} className={`px-2 py-1 rounded-lg text-[11px] cursor-pointer ${d.model_id === m.id ? 'font-extrabold bg-blue-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`} dir="auto">{m.name}</button>
            ))}
          </div>
          <div className="sm:col-span-5 space-y-1">
            <input value={modelQ} onChange={(e) => setModelQ(e.target.value)} placeholder={pick('nbuy.typeModel')} className="w-full px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]" data-testid={`${testPrefix}-model-q`} />
            {modelQ.trim().length >= 2 && !(models ?? []).some((m) => m.name.toLowerCase() === modelQ.trim().toLowerCase()) ? (
              <button type="button" onClick={async () => { try { const m = await post<{ id: string; name: string }>('/api/v1/catalogue/models', { brand_id: d.brand_id, name: modelQ.trim(), category }); setD((x) => ({ ...x, model_id: m.id, model_name: m.name })); setModelQ(''); await inv('models') } catch (e) { setToast(e instanceof ApiError ? e.messageEn : String(e)) } }} className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{t('nbuy.newModel', { name: modelQ.trim() })}</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased lg:h-screen lg:overflow-hidden flex flex-col min-h-dvh" data-testid="nbuy" data-newui="1" data-file="01">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ===== SIDEBAR ===== */}
        <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200/90 dark:border-slate-800 z-20" data-testid="nbuy-side">
          <NavLink to="/new" className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-[#9AE600] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
            <div className="min-w-0">
              <div className="font-display font-extrabold text-sm tracking-tight truncate">{shopName}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{shop?.city || pick(`staff.roles.${role ?? 'owner'}`)}</div>
            </div>
          </NavLink>
          <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
            <div>
              <NavLink to="/new" className={`${navBtn} mb-1`}><span className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-slate-400" /> {pick('nav.dashboard')}</span><ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" /></NavLink>
              <div className="px-2.5 mt-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nav.counterSection')}</div>
              <div className="space-y-1">
                <NavLink to="/new/sale/new" className="w-full px-2.5 py-2 rounded-xl bg-[#9AE600]/20 hover:bg-[#9AE600]/30 text-slate-900 dark:text-[#9AE600] font-display font-extrabold text-xs flex items-center justify-between cursor-pointer transition-colors"><span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> {pick('counter.sell')}</span><span className="font-mono text-[10px] opacity-75" dir="ltr">F2</span></NavLink>
                <div className="w-full px-2.5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-between shadow-xs"><span className="flex items-center gap-2"><PackagePlus className="w-3.5 h-3.5 text-[#9AE600] dark:text-obsidian-950" /> {pick('counter.addStock')}</span><span className="font-mono text-[10px] opacity-85" dir="ltr">F3</span></div>
                {NAV.map(({ to, label, key, Icon }) => <NavLink key={to} to={to} className={navBtn}><span className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /> {pick(label)}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{key}</span></NavLink>)}
              </div>
            </div>
            <div>
              <div className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nbuy.shopAudit')}</div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {SHOP.map(([to, label, Icon]) => <NavLink key={to} to={to} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-start flex items-center gap-1.5 cursor-pointer"><Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="truncate">{pick(label)}</span></NavLink>)}
              </div>
            </div>
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center" dir="ltr">{initials}</div>
            <div className="min-w-0"><div className="text-xs font-bold truncate">{userName}</div><div className="text-[10px] text-slate-400">{pick(`staff.roles.${role ?? 'owner'}`)} • F3</div></div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* ===== TOP BAR ===== */}
          <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <button type="button" onClick={() => nav('/new/purchases')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" /><span>{pick('common.back')}</span></button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-sm sm:text-base tracking-tight'}>{pick('nbuy.title')}</h1>
                  <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-extrabold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{pick('nbuy.newBill')}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nbuy.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nbuy-cost-toggle"><span className={`w-2 h-2 rounded-full ${showCost ? 'bg-emerald-500' : 'bg-slate-400'}`} /><span className="hidden sm:inline">{pick(showCost ? 'nbuy.costVisible' : 'nbuy.costHidden')}</span></button> : null}
              <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"><Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /><span>{ur ? 'English' : 'اردو'}</span></button>
              <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[#9AE600]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
            </div>
          </header>

          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
            {/* ===== LEFT: THE BUILDER ===== */}
            <div className="w-full lg:w-[62%] lg:h-full lg:overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* A. source and person */}
              <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 shadow-2xs space-y-3" data-testid="nbuy-source">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">{pick('nbuy.whereFrom')}</span>
                  {trade.devices ? (
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">
                      {(['supplier', 'walk_in'] as const).map((s) => (
                        <button key={s} type="button" onClick={() => chooseSource(s)} aria-pressed={source === s} className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all ${source === s ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900'}`} data-testid={`nbuy-src-${s}`}>
                          {s === 'supplier' ? <Store className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}<span>{pick(s === 'supplier' ? 'nbuy.fromDealer' : 'nbuy.fromCustomer')}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-8">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick(source === 'supplier' ? 'nbuy.selectDealer' : 'nbuy.selectSeller')}</label>
                    <div className="flex items-center gap-1.5">
                      <select value={party?.id ?? ''} onChange={(e) => setParty((parties ?? []).find((p) => p.id === e.target.value) ?? null)} className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600] cursor-pointer" data-testid="nbuy-party">
                        <option value="">{pick('nbuy.choose')}</option>
                        {(parties ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` • ${p.phone}` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => setNewParty(true)} className="px-3 py-2 rounded-xl bg-[#9AE600] hover:bg-[#84CC16] text-slate-950 font-extrabold text-xs shrink-0 flex items-center gap-1 cursor-pointer" data-testid="nbuy-new-party"><Plus className="w-3.5 h-3.5" strokeWidth={2.5} /><span className="hidden sm:inline">{pick('nbuy.new')}</span></button>
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.khataStatus')}</div>
                    <div className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between ${!bal ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : bal < 0 ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`} data-testid="nbuy-khata">
                      <span>{pick(!bal ? 'nbuy.clear' : bal < 0 ? 'nbuy.toGive' : 'nbuy.toGet')}</span><span className="font-mono" dir="ltr">{rs(Math.abs(bal))}</span>
                    </div>
                  </div>
                </div>
                {source === 'walk_in' ? (
                  <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/70 space-y-2.5" data-testid="nbuy-cnic">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900 dark:text-amber-300"><ShieldAlert className="w-4 h-4 text-amber-600" /><span>{pick('nbuy.antiTheft')}</span></div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setIdChecked(true)} aria-pressed={idChecked} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${idChecked ? 'font-extrabold bg-emerald-600 text-white' : 'font-bold bg-white dark:bg-obsidian-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'}`} data-testid="nbuy-id-checked">{pick('nbuy.idChecked')} ✓</button>
                        <button type="button" onClick={() => setIdChecked(false)} aria-pressed={!idChecked} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${!idChecked ? 'font-extrabold bg-amber-500 text-slate-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'}`}>{pick('nbuy.idPending')}</button>
                      </div>
                    </div>
                    <input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder={pick('nbuy.sellerCnic')} className="w-full px-3 py-1.5 rounded-lg font-mono text-xs bg-white dark:bg-obsidian-900 border border-amber-200 dark:border-amber-800 focus:outline-none" dir="ltr" />
                    <p className="text-[11px] text-amber-800 dark:text-amber-300">{pick(idChecked ? 'nbuy.idCheckedHint' : 'nbuy.idPendingHint')}</p>
                  </div>
                ) : null}
              </section>

              {/* B. what is bought */}
              <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden" data-testid="nbuy-builder">
                <div className="p-3 bg-slate-50/90 dark:bg-obsidian-850/80 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {trade.devices ? tabBtn('device', 'nbuy.tabDevice', Smartphone, '') : null}
                    {trade.mobiles ? tabBtn('locked', 'nbuy.tabLocked', Lock, 'text-rose-500') : null}
                    {has('accessories') ? tabBtn('accessory', 'nbuy.tabAccessory', Headphones, 'text-blue-500') : null}
                    {tabBtn('custom', 'nbuy.tabCustom', PlusSquare, 'text-slate-400')}
                  </div>
                  {editing ? <span className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">{pick('nbuy.editing')}</span> : null}
                </div>

                {tab === 'device' ? (
                  <div className="p-4 space-y-3.5" data-testid="nbuy-device">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {kinds.map((c) => <button key={c} type="button" onClick={() => setD({ ...freshDraft(c), condition: d.condition, warranty_months: d.warranty_months, warranty_by: d.warranty_by })} className={category === c ? ON('text-xs') : OFF('text-xs')} data-testid={`nbuy-cat-${c}`}>{pick(`devcat.${c === 'laptop' ? 'laptop' : c}`)}</button>)}
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                        <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} className="rounded w-3.5 h-3.5" data-testid="nbuy-bulk" /><span>{pick('nbuy.bulk')}</span>
                        {bulk ? <span className="px-2 py-0.5 rounded-lg font-mono text-[11px] font-extrabold bg-slate-100 dark:bg-obsidian-850" dir="ltr">{extra.length + 1} pcs</span> : null}
                      </label>
                    </div>
                    {category === 'tablet' || category === 'watch' ? (
                      <div className="flex items-center gap-1.5">
                        {[false, true].map((c) => <button key={String(c)} type="button" onClick={() => set('cellular', c)} className={d.cellular === c ? ON('text-[11px]') : OFF('text-[11px]')}>{pick(category === 'tablet' ? (c ? 'devx.wifiSim' : 'devx.wifi') : (c ? 'devx.cellular' : 'devx.gps'))}</button>)}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-7">
                        <label className={LABEL}>{pick(sim ? 'nbuy.imei1' : 'devcat.serial')} *</label>
                        <div className="flex items-center gap-1.5">
                          {sim
                            ? <input value={d.imei1} onChange={(e) => set('imei1', digits(e.target.value).slice(0, 15))} inputMode="numeric" maxLength={15} placeholder={pick('nbuy.imeiPh')} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nbuy-imei" />
                            : <input value={d.serial} onChange={(e) => set('serial', e.target.value.toUpperCase())} maxLength={24} placeholder={pick('devcat.serial')} className={`${INPUT} font-mono font-bold`} dir="ltr" data-testid="nbuy-serial" />}
                          <span className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 shrink-0"><ScanLine className="w-3.5 h-3.5 text-emerald-600" /><span>{pick('common.scan')}</span></span>
                        </div>
                        {sim && imei && imei.length !== 15 ? <p className="text-[11px] text-rose-600 mt-1">{pick('field.badImei')}</p> : null}
                        {inStock ? <p className="text-[11px] font-bold text-rose-600 mt-1" data-testid="nbuy-in-stock">{pick('nbuy.alreadyInStock')}</p> : null}
                      </div>
                      {phone ? (
                        <div className="sm:col-span-5">
                          <label className={LABEL}>{pick('nbuy.imei2')}</label>
                          <input value={d.imei2} onChange={(e) => set('imei2', digits(e.target.value).slice(0, 15))} inputMode="numeric" maxLength={15} placeholder={pick('nbuy.imei2Ph')} className={`${INPUT} font-mono`} dir="ltr" />
                        </div>
                      ) : null}
                    </div>
                    {bulk ? (
                      <div>
                        <label className={LABEL}>{pick(sim ? 'nbuy.moreImeis' : 'nbuy.moreSerials')}</label>
                        <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={3} className={`${INPUT} font-mono`} dir="ltr" data-testid="nbuy-bulk-ids" />
                        {!extraOk ? <p className="text-[11px] text-rose-600 mt-1">{pick('nbuy.bulkBad')}</p> : null}
                      </div>
                    ) : null}
                    {brandModel('nbuy')}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      {category !== 'watch' ? (
                        <div className="md:col-span-5">
                          <label className={LABEL}>{pick('stock.storage')}</label>
                          <div className="flex flex-wrap gap-1" data-testid="nbuy-storage">
                            {(storages ?? []).filter((s) => s.gigabytes >= 16).slice(0, 7).map((s) => <button key={s.id} type="button" onClick={() => set('storage_id', d.storage_id === s.id ? '' : s.id)} className={`${d.storage_id === s.id ? ON('text-[11px]') : OFF('text-[11px]')} font-mono`} dir="ltr">{s.name}</button>)}
                          </div>
                        </div>
                      ) : null}
                      {category !== 'watch' ? (
                        <div className="md:col-span-2">
                          <label className={LABEL}>{pick('nbuy.ramGb')}</label>
                          <input value={d.ram_gb ?? ''} onChange={(e) => set('ram_gb', digits(e.target.value).slice(0, 3))} inputMode="numeric" placeholder="8" className="w-full px-2.5 py-1 rounded-lg font-mono text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" dir="ltr" />
                        </div>
                      ) : null}
                      <div className={category === 'watch' ? 'md:col-span-12' : 'md:col-span-5'}>
                        <label className={LABEL}>{pick('stock.colour')}</label>
                        <div className="flex flex-wrap gap-1" data-testid="nbuy-colours">
                          {(colours ?? []).slice(0, 10).map((c) => <button key={c.id} type="button" onClick={() => set('colour_id', d.colour_id === c.id ? '' : c.id)} className={`px-2 py-0.5 rounded-md text-[10px] cursor-pointer ${d.colour_id === c.id ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{ur && c.name_ur ? c.name_ur : c.name}</button>)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      {apple ? (
                        <div className="md:col-span-6">
                          <label className={LABEL}>{pick('nbuy.region')}</label>
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {(dopts?.region_codes ?? []).slice(0, 8).map((r) => <button key={r} type="button" onClick={() => set('region_code', d.region_code === r ? '' : r)} className={`px-2 py-0.5 rounded font-mono text-[10px] cursor-pointer ${d.region_code === r ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`} dir="ltr">{r}</button>)}
                          </div>
                          {sim ? <div className="flex flex-wrap gap-1">{(dopts?.sim_types ?? []).map((s) => <button key={s} type="button" onClick={() => set('sim_type', d.sim_type === s ? '' : s)} className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${d.sim_type === s ? 'font-extrabold bg-blue-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(`devx.simType.${s}`)}</button>)}</div> : null}
                        </div>
                      ) : null}
                      <div className={apple ? 'md:col-span-6' : 'md:col-span-12'}>
                        <label className={LABEL}>{pick(sim ? 'nbuy.ptaCondition' : 'nbuy.condition')}</label>
                        {sim ? (
                          <div className="flex flex-wrap gap-1 mb-1.5" data-testid="nbuy-pta">
                            {(['pta_approved', 'non_pta', 'jv', 'cpid'] as const).map((p) => <button key={p} type="button" onClick={() => set('pta_status', p)} className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${d.pta_status === p ? 'font-extrabold bg-emerald-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(`stock.pta.${p}`)}</button>)}
                            <button type="button" onClick={() => set('sim_lock', d.sim_lock === 'locked' ? 'unlocked' : 'locked')} className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${d.sim_lock === 'locked' ? 'font-extrabold bg-rose-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(d.sim_lock === 'locked' ? 'nbuy.simLocked' : 'nbuy.unlocked')}</button>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-1" data-testid="nbuy-condition">
                          {(['box_pack', 'open_box', 'used', 'patched'] as const).map((c) => <button key={c} type="button" onClick={() => set('condition', c)} className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${d.condition === c ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(`stock.condition.${c}`)}</button>)}
                        </div>
                        {d.condition === 'patched' ? <input value={d.patch_details} onChange={(e) => set('patch_details', e.target.value)} placeholder={pick('nbuy.patchWhat')} className={`${INPUT} mt-1.5`} data-testid="nbuy-patch" /> : null}
                      </div>
                    </div>
                    {lockNeeded ? (
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-300 cursor-pointer" data-testid="nbuy-lock-check">
                        <input type="checkbox" checked={!!d.lock_checked} onChange={(e) => set('lock_checked', e.target.checked)} className="w-3.5 h-3.5" />{pick('nbuy.locksCleared')}
                      </label>
                    ) : null}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 items-end">
                      <div className="sm:col-span-3">
                        <label className={LABEL}>{pick('nbuy.costPrice')} *</label>
                        <input type="number" inputMode="numeric" min={0} value={d.cost} onChange={(e) => set('cost', e.target.value)} placeholder="332000" className="w-full px-3 py-2 rounded-xl font-mono text-xs font-extrabold bg-slate-50 dark:bg-obsidian-850 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]" dir="ltr" data-testid="nbuy-cost" />
                      </div>
                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{pick('nbuy.askingOpt')}</label>
                          <span className={`text-[10px] font-mono font-extrabold ${askingLow ? 'text-rose-600' : d.asking_price && d.cost ? 'text-emerald-600 dark:text-[#9AE600]' : 'text-slate-400'}`} dir="ltr" data-testid="nbuy-margin">{pick('nbuy.margin')}: {d.asking_price && d.cost ? `${Number(d.asking_price) - Number(d.cost) >= 0 ? '+' : ''}${n0(Number(d.asking_price) - Number(d.cost))}` : '—'}</span>
                        </div>
                        <input type="number" inputMode="numeric" min={0} value={d.asking_price} onChange={(e) => set('asking_price', e.target.value)} placeholder={pick('nbuy.retailPh')} className="w-full px-3 py-2 rounded-xl font-mono text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500" dir="ltr" data-testid="nbuy-asking" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className={LABEL}>{pick('nbuy.shelf')}</label>
                        <input value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} maxLength={60} placeholder="Rack A2" className="w-full px-2.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={LABEL}>{pick('accx.warranty')}</label>
                        <select value={WARRANTY.find((w) => w.months === d.warranty_months && w.by === (d.warranty_by || ''))?.key ?? 'wnone'} onChange={(e) => { const w = WARRANTY.find((x) => x.key === e.target.value)!; setD((x) => ({ ...x, warranty_months: w.months, warranty_by: w.by })) }} className="w-full px-2 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none cursor-pointer">
                          {WARRANTY.map((w) => <option key={w.key} value={w.key}>{pick(`nbuy.${w.key}`)}</option>)}
                        </select>
                      </div>
                    </div>
                    {askingLow ? <p className="text-[11px] font-bold text-rose-600" data-testid="nbuy-asking-low">{pick('nbuy.askingLow')}</p> : null}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{pick('nbuy.cameWith')}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="nbuy-came-with">
                        {accFor.map((k) => (
                          <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800">
                            <div className="text-[11px] font-bold mb-1">{pick(`stock.acc.${k}`)}</div>
                            <div className="grid grid-cols-3 gap-0.5">
                              {(['no', 'now', 'later'] as const).map((s) => <button key={s} type="button" onClick={() => setAccState(k, s)} className={`py-0.5 rounded text-[10px] font-bold cursor-pointer ${accState(k) === s ? (s === 'no' ? 'bg-obsidian-900 text-white dark:bg-slate-200 dark:text-obsidian-950' : s === 'now' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950') : 'bg-white dark:bg-obsidian-900 text-slate-500'}`} data-testid={`nbuy-acc-${k}-${s}`}>{pick(`nbuy.acc_${s}`)}</button>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden">
                      <button type="button" onClick={() => setFaultsOpen(!faultsOpen)} className="w-full px-3.5 py-2.5 bg-slate-50/90 dark:bg-obsidian-850/70 hover:bg-slate-100 dark:hover:bg-obsidian-800 flex items-center justify-between text-xs font-bold cursor-pointer" data-testid="nbuy-faults-open">
                        <span className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5 text-rose-500" /><span>{pick('nbuy.faultyAdvanced')}</span>{d.faults?.length ? <span className="px-2 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">{t('nbuy.faultsN', { n: d.faults.length })}</span> : null}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${faultsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {faultsOpen ? (
                        <div className="p-3.5 bg-white dark:bg-obsidian-900 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 mb-1.5">{pick('nbuy.tapFault')}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {FAULT_KEYS.map((f) => { const on = (d.faults ?? []).includes(f); return <button key={f} type="button" onClick={() => set('faults', on ? (d.faults ?? []).filter((x) => x !== f) : [...(d.faults ?? []), f])} className={`px-2 py-1 rounded-lg text-[11px] cursor-pointer ${on ? 'font-extrabold bg-rose-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{faultName(f, pick)}</button> })}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <input value={d.battery_health} onChange={(e) => set('battery_health', digits(e.target.value).slice(0, 3))} inputMode="numeric" disabled={!used} placeholder={pick('nbuy.batteryPh')} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none disabled:opacity-50" dir="ltr" />
                            <input value={d.battery_cycles ?? ''} onChange={(e) => set('battery_cycles', digits(e.target.value).slice(0, 4))} inputMode="numeric" disabled={!used || !apple} placeholder={pick('nbuy.cyclesPh')} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none disabled:opacity-50" dir="ltr" />
                            <input value={otherFault} onChange={(e) => setOtherFault(e.target.value)} maxLength={60} placeholder={pick('nbuy.otherFault')} className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" />
                          </div>
                          {!batteryOk ? <p className="text-[11px] text-rose-600">{pick('nbuy.batteryBad')}</p> : null}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={addDevice} disabled={!lineOk} className="w-full py-3 px-4 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] hover:opacity-95 active:scale-[0.99] text-white dark:text-obsidian-950 font-display font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed" data-testid="nbuy-add-device">
                      <PlusCircle className="w-4 h-4" /><span>{pick(editing ? 'nbuy.saveLine' : 'nbuy.addDevice')}</span>
                    </button>
                  </div>
                ) : null}

                {tab === 'locked' ? (
                  <div className="p-4 space-y-3.5" data-testid="nbuy-locked">
                    <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 font-medium">{pick('nbuy.lockedHint')}</div>
                    {brandModel('nbuy-l')}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>{pick('nbuy.lockedImei')} *</label>
                        <input value={d.imei1 || d.serial} onChange={(e) => { const v = e.target.value; if (/^\d*$/.test(v.replace(/\s/g, ''))) { set('imei1', digits(v).slice(0, 15)); set('serial', '') } else { set('serial', v.toUpperCase()); set('imei1', '') } }} placeholder="354017…" className={`${INPUT} font-mono`} dir="ltr" data-testid="nbuy-l-imei" />
                      </div>
                      <div>
                        <label className={LABEL}>{pick('nbuy.costPrice')} *</label>
                        <input type="number" inputMode="numeric" min={0} value={d.cost} onChange={(e) => set('cost', e.target.value)} placeholder="65000" className={`${INPUT} font-mono font-extrabold`} dir="ltr" data-testid="nbuy-l-cost" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">{pick('nbuy.lockType')}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(['icloud', 'google', 'other'] as const).map((l) => <button key={l} type="button" onClick={() => set('lock_type', l)} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${d.lock_type === l ? 'font-extrabold bg-rose-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300'}`}>{pick(`locked.type.${l}`)}</button>)}
                      </div>
                    </div>
                    <button type="button" onClick={addDevice} disabled={!lineOk} className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40" data-testid="nbuy-add-locked"><Lock className="w-4 h-4" /><span>{pick('nbuy.addLocked')}</span></button>
                  </div>
                ) : null}

                {tab === 'accessory' ? (
                  <div className="p-4 space-y-3.5" data-testid="nbuy-accessory">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-8 relative">
                        <label className={LABEL}>{pick('nbuy.accName')} *</label>
                        <input value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value, itemId: '' })} placeholder={pick('nbuy.accNamePh')} className={`${INPUT} font-bold`} data-testid="nbuy-acc-name" />
                        {acc.itemId ? <p className="text-[11px] font-bold text-emerald-700 dark:text-[#9AE600] mt-1">{pick('nbuy.accExisting')}</p> : null}
                        {accHits.length ? (
                          <div className="absolute start-0 end-0 mt-1 rounded-xl bg-white dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 shadow-2xl z-20 divide-y divide-slate-100 dark:divide-slate-800" data-testid="nbuy-acc-hits">
                            {accHits.map((i) => <button key={i.id} type="button" onClick={() => setAcc({ ...acc, name: i.name, itemId: i.id, kind: i.category, price: String(Number(i.price) || '') })} className="w-full text-start px-3 py-2 hover:bg-slate-50 dark:hover:bg-obsidian-800 flex items-center justify-between gap-2 text-xs"><span className="font-bold truncate" dir="auto">{ur && i.name_ur ? i.name_ur : i.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{i.sku} · {t('npos.inStock', { n: i.qty })}</span></button>)}
                          </div>
                        ) : null}
                      </div>
                      <div className="sm:col-span-4">
                        <label className={LABEL}>{pick('nbuy.fits')}</label>
                        <input value={acc.fits} onChange={(e) => setAcc({ ...acc, fits: e.target.value })} disabled={!!acc.itemId} placeholder="iPhone 16 / Type-C" className={`${INPUT} disabled:opacity-50`} />
                      </div>
                    </div>
                    {!acc.itemId ? (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">{pick('nbuy.kindQuality')}</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">{ACC_KINDS.map((k) => <button key={k} type="button" onClick={() => setAcc({ ...acc, kind: k })} className={acc.kind === k ? ON('text-xs') : OFF('text-xs')}>{kindLabel(pick, k)}</button>)}</div>
                        <div className="flex flex-wrap gap-1.5">{GRADES.map((g) => <button key={g} type="button" onClick={() => setAcc({ ...acc, grade: g })} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${acc.grade === g ? 'font-extrabold bg-blue-600 text-white' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(`acc.grades.${g}`)}</button>)}</div>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div><label className={LABEL}>{pick('nbuy.qtyPcs')} *</label><input type="number" min={1} value={acc.qty} onChange={(e) => setAcc({ ...acc, qty: e.target.value })} className={`${INPUT} font-mono font-extrabold`} dir="ltr" data-testid="nbuy-acc-qty" /></div>
                      <div><label className={LABEL}>{pick('nbuy.unitCost')} *</label><input type="number" min={0} value={acc.cost} onChange={(e) => setAcc({ ...acc, cost: e.target.value })} placeholder="1200" className={`${INPUT} font-mono font-extrabold`} dir="ltr" data-testid="nbuy-acc-cost" /></div>
                      <div><label className={LABEL}>{pick('nbuy.retailEach')}</label><input type="number" min={0} value={acc.price} onChange={(e) => setAcc({ ...acc, price: e.target.value })} disabled={!!acc.itemId} placeholder="2200" className={`${INPUT} font-mono disabled:opacity-50`} dir="ltr" data-testid="nbuy-acc-price" /></div>
                      <div><label className={LABEL}>{pick('nbuy.lowAlert')}</label><input type="number" min={0} value={acc.reorder} onChange={(e) => setAcc({ ...acc, reorder: e.target.value })} disabled={!!acc.itemId} className={`${INPUT} font-mono disabled:opacity-50`} dir="ltr" /></div>
                    </div>
                    <button type="button" onClick={addAccessory} disabled={!acc.name.trim() || acc.cost === ''} className="w-full py-3 px-4 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-display font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40" data-testid="nbuy-add-acc"><PlusCircle className="w-4 h-4" /><span>{pick('nbuy.addAcc')}</span></button>
                  </div>
                ) : null}

                {tab === 'custom' ? (
                  <div className="p-4 space-y-3" data-testid="nbuy-custom">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{pick('nbuy.customHint')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-8"><label className={LABEL}>{pick('nbuy.description')} *</label><input value={custom.desc} onChange={(e) => setCustom({ ...custom, desc: e.target.value })} maxLength={200} placeholder={pick('nbuy.customPh')} className={`${INPUT} font-bold`} data-testid="nbuy-custom-desc" /></div>
                      <div className="sm:col-span-4"><label className={LABEL}>{pick('nbuy.amount')} *</label><input type="number" min={0} value={custom.cost} onChange={(e) => setCustom({ ...custom, cost: e.target.value })} placeholder="1500" className={`${INPUT} font-mono font-extrabold`} dir="ltr" data-testid="nbuy-custom-cost" /></div>
                    </div>
                    <button type="button" onClick={addCustom} disabled={!custom.desc.trim() || custom.cost === ''} className="w-full py-3 px-4 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-display font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40" data-testid="nbuy-add-custom"><PlusCircle className="w-4 h-4" /><span>{pick('nbuy.addLine')}</span></button>
                  </div>
                ) : null}
              </section>
            </div>

            {/* ===== RIGHT: THE BILL ===== */}
            <aside className="w-full lg:w-[38%] lg:h-full bg-white dark:bg-obsidian-900 border-t lg:border-t-0 lg:border-s border-slate-200/90 dark:border-slate-800 flex flex-col justify-between z-10" data-testid="nbuy-bill">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><h2 className="font-display font-extrabold text-sm">{pick('nbuy.cart')}</h2><span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-extrabold bg-[#9AE600]/25 text-slate-900 dark:text-[#9AE600]" data-testid="nbuy-count">{t('nbuy.itemsN', { n: count })}</span></div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{party ? `${pick('nbuy.from')}: ${party.name} • ${pick(source === 'supplier' ? 'nbuy.fromDealer' : 'nbuy.fromCustomer')}` : pick('nbuy.chooseFirst')}</div>
                </div>
                {count ? <button type="button" onClick={() => { setDevices([]); setMisc([]) }} className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">{pick('nbuy.clearAll')}</button> : null}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                <div className="space-y-2.5" data-testid="nbuy-lines">
                  {!count ? <div className="py-6 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center text-xs font-bold text-slate-500">{pick('nbuy.empty')}</div> : null}
                  {devices.map((x, i) => (
                    <div key={x.key} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 space-y-1.5" data-testid="nbuy-line">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 text-[10px] font-extrabold flex items-center justify-center" dir="ltr">{i + 1}</span><span className="text-xs font-extrabold truncate" dir="auto">{x.brand_name} {x.model_name}</span></div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5" dir="ltr">{x.imei1 || x.serial}</div>
                        </div>
                        {showCost ? <span className="font-mono text-xs font-extrabold shrink-0" dir="ltr">{rs(x.cost)}</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {x.lock_type ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">{pick(`locked.type.${x.lock_type}`)}</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">{pick(`stock.condition.${x.condition}`)}</span>}
                        {!x.lock_type && (x.category ?? 'phone') === 'phone' ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">{pick(`stock.pta.${x.pta_status}`)}</span> : null}
                        {x.faults?.length ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">{pick('npos.faulty')}: {x.faults.map((f) => faultName(f, pick)).join(', ')}</span> : null}
                      </div>
                      <div className="flex justify-end gap-3 text-[11px] font-bold">
                        <button type="button" onClick={() => editLine(x)} className="text-emerald-700 dark:text-[#9AE600] hover:underline cursor-pointer" data-testid="nbuy-edit">{pick('common.edit')}</button>
                        <button type="button" onClick={() => setDevices(devices.filter((y) => y.key !== x.key))} className="text-rose-600 hover:underline cursor-pointer" data-testid="nbuy-remove">{pick('purchase.remove')}</button>
                      </div>
                    </div>
                  ))}
                  {misc.map((x) => (
                    <div key={x.key} className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2" data-testid="nbuy-line">
                      <div className="min-w-0"><div className="text-xs font-extrabold truncate" dir="auto">{x.description}</div><div className="text-[10px] text-slate-500 font-mono" dir="ltr">{x.qty} × {rs(x.unit_cost)}{x.newItem ? ` · ${pick('nbuy.newItem')}` : ''}</div></div>
                      <div className="flex items-center gap-2 shrink-0">{showCost ? <span className="font-mono text-xs font-extrabold" dir="ltr">{rs(x.qty * Number(x.unit_cost))}</span> : null}<button type="button" onClick={() => setMisc(misc.filter((y) => y.key !== x.key))} className="text-rose-600 text-xs font-bold cursor-pointer" aria-label={pick('purchase.remove')}><X className="w-3.5 h-3.5" /></button></div>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    {source === 'supplier' ? <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.dealerBillNo')}</label><input value={billNo} onChange={(e) => setBillNo(e.target.value)} maxLength={60} placeholder="INV-8821" className="w-full px-2.5 py-1.5 rounded-lg font-mono text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none" dir="ltr" /></div> : <div />}
                    <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.billDiscount')}</label><input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="w-full px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none" dir="ltr" data-testid="nbuy-discount" /></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-500">{pick('nbuy.whenBought')}:</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setEarlier(false)} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${!earlier ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{pick('nbuy.justNow')}</button>
                      <button type="button" onClick={() => setEarlier(true)} className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${earlier ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{pick('nbuy.earlier')}</button>
                      {earlier ? <input type="date" value={when} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setWhen(e.target.value)} className="px-2 py-0.5 rounded-lg font-mono text-[11px] bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" /> : null}
                    </div>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/90 dark:border-slate-800 space-y-3" data-testid="nbuy-pay">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{pick('nbuy.howPaid')}</span>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-[#9AE600]">{pick(rest > 0 ? 'nbuy.partUdhaar' : 'nbuy.fullPaid')}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([['cash', Banknote, 'counter.cash'], ['online', Landmark, 'paym.online'], ['cheque', FileCheck, 'paym.cheque'], ['udhaar', BookOpen, 'counter.udhaar']] as const).map(([m, Icon, label]) => (
                      <button key={m} type="button" onClick={() => { setMode(m); if (m === 'online' || m === 'cheque') setPay({ ...pay, method: m }) }} aria-pressed={mode === m} className={`py-2 px-1.5 rounded-xl text-[11px] flex flex-col items-center gap-1 cursor-pointer transition-all ${mode === m ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`} data-testid={`nbuy-mode-${m}`}><Icon className="w-4 h-4" /><span>{pick(label)}</span></button>
                    ))}
                  </div>
                  {mode === 'online' || mode === 'cheque' ? (
                    <div className="space-y-2" data-testid="nbuy-bank">
                      <div className="flex flex-wrap gap-1">
                        {POPULAR_BANKS.slice(0, 5).map((b) => <button key={b} type="button" onClick={() => setPay({ ...pay, bank: b })} className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer ${pay.bank === b ? 'bg-obsidian-900 text-white dark:bg-[#9AE600] dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-700'}`}>{b}</button>)}
                        <select value={pay.bank && !POPULAR_BANKS.slice(0, 5).includes(pay.bank) ? pay.bank : ''} onChange={(e) => setPay({ ...pay, bank: e.target.value })} className="px-2 py-0.5 rounded-lg text-[11px] bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700"><option value="">{pick('paym.otherBank')}</option>{ALL_BANKS.filter((b) => !POPULAR_BANKS.slice(0, 5).includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}</select>
                      </div>
                      <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pick(mode === 'cheque' ? 'paym.chequeNo' : 'paym.tid')} className="w-full px-2.5 py-1.5 rounded-lg font-mono text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr" />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.paidNow')}</label><input type="number" min={0} value={mode === 'udhaar' ? paidNow : String(total)} disabled={mode !== 'udhaar'} onChange={(e) => setPaidNow(e.target.value)} className="w-full px-3 py-2 rounded-xl font-mono text-xs font-extrabold bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-emerald-500 disabled:opacity-70" dir="ltr" data-testid="nbuy-paid-now" /></div>
                    <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.remaining')}</label><div className={`px-3 py-2 rounded-xl font-mono text-xs font-extrabold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 ${rest > 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#9AE600]'}`} dir="ltr" data-testid="nbuy-rest">{rs(rest)}</div></div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-200/90 dark:border-slate-800 bg-white dark:bg-obsidian-900 space-y-2.5 shrink-0">
                <div className="p-3.5 rounded-2xl bg-obsidian-900 dark:bg-obsidian-950 border border-slate-800 text-white flex items-center justify-between gap-2">
                  <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nbuy.netTotal')}</div><div className="text-[11px] text-slate-300 mt-0.5 truncate" dir="auto">{pick('nbuy.paid')}: {rs(paid)} • {pick('nbuy.deneBaqi')}: {rs(rest)}</div></div>
                  <div className="font-display font-extrabold text-xl sm:text-2xl text-[#9AE600] shrink-0" dir="ltr" data-testid="nbuy-total">{rs(total)}</div>
                </div>
                <button type="button" onClick={() => { setTicked(false); setErr(''); setReviewing(true) }} disabled={!ready} className="w-full py-3.5 px-4 rounded-2xl bg-[#9AE600] hover:bg-[#84CC16] active:scale-[0.99] text-slate-950 font-display font-extrabold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed" data-testid="nbuy-put">
                  <PackageCheck className="w-5 h-5" strokeWidth={2.5} /><span>{pick('nbuy.putInStock')}</span>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* ===== REVIEW: shown once more and ticked (owner 2026-11-09) ===== */}
      {reviewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setReviewing(false)}>
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="nbuy-review">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5"><h3 className="font-display font-extrabold text-sm">{pick('nbuy.reviewTitle')}</h3><button type="button" onClick={() => setReviewing(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer" aria-label="close"><X className="w-4 h-4" /></button></div>
            <div className="text-xs space-y-1"><div className="font-bold" dir="auto">{party?.name}</div>{devices.map((x) => <div key={x.key} className="flex justify-between gap-2"><span className="truncate" dir="auto">{x.brand_name} {x.model_name} <span className="font-mono text-slate-400" dir="ltr">{x.imei1 || x.serial}</span></span><span className="font-mono" dir="ltr">{rs(x.cost)}</span></div>)}{misc.map((x) => <div key={x.key} className="flex justify-between gap-2"><span className="truncate" dir="auto">{x.description} ×{x.qty}</span><span className="font-mono" dir="ltr">{rs(x.qty * Number(x.unit_cost))}</span></div>)}</div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1"><div className="flex justify-between font-extrabold"><span>{pick('nbuy.netTotal')}</span><span className="font-mono" dir="ltr">{rs(total)}</span></div><div className="flex justify-between"><span>{pick('nbuy.paid')}</span><span className="font-mono" dir="ltr">{rs(paid)}</span></div>{rest > 0 ? <div className="flex justify-between text-rose-600 font-bold"><span>{pick('nbuy.deneBaqi')}</span><span className="font-mono" dir="ltr">{rs(rest)}</span></div> : null}</div>
            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="w-4 h-4" data-testid="nbuy-review-ok" />{pick('nbuy.allRight')}</label>
            {err ? <div className="text-xs font-bold text-rose-600" data-testid="nbuy-error">{err}</div> : null}
            <button type="button" onClick={save} disabled={!ticked || busy} className="w-full py-3 rounded-xl bg-[#9AE600] text-slate-950 font-display font-extrabold text-sm disabled:opacity-40" data-testid="nbuy-save">{busy ? '…' : pick('nbuy.putInStock')}</button>
          </div>
        </div>
      ) : null}

      {/* ===== SAVED: stickers ===== */}
      {result ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" data-testid="nbuy-saved">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#9AE600] text-slate-950 flex items-center justify-center shrink-0"><CheckCircle2 className="w-6 h-6" strokeWidth={2.5} /></div>
                <div><div className="flex items-center gap-2 flex-wrap"><h3 className="font-display font-extrabold text-base sm:text-lg">{pick('nbuy.savedTitle')}</h3><span className="px-2 py-0.5 rounded-md font-mono text-xs font-extrabold bg-obsidian-900 text-[#9AE600]" dir="ltr" data-testid="nbuy-bill-no">{result.no}</span></div><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{pick('nbuy.savedHint')}</p></div>
              </div>
              <button type="button" onClick={startNext} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer" aria-label="close"><X className="w-5 h-5" /></button>
            </div>
            {result.lines.some((l) => l.device_id) ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{pick('nbuy.stickersReady')}</span>
                  {canCost ? <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"><input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} className="rounded" /><span>{pick('nbuy.withCode')}</span></label> : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-100 dark:bg-obsidian-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  {devices.slice(0, 6).map((x) => (
                    <div key={x.key} className="bg-white text-black rounded-lg p-2.5 border border-slate-300 font-mono text-[10px] space-y-0.5">
                      <div className="font-bold text-[11px] font-sans truncate">{shopName}</div>
                      <div className="font-sans font-bold truncate">{x.brand_name} {x.model_name}</div>
                      <div className="h-6 bg-[repeating-linear-gradient(90deg,#000_0_1px,transparent_1px_3px)]" aria-hidden />
                      <div dir="ltr">{x.imei1 || x.serial}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={startNext} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer" data-testid="nbuy-next"><Plus className="w-4 h-4" /><span>{pick('nbuy.startNext')}</span></button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => nav(`/purchases/${result.id}`)} className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><FileText className="w-4 h-4 text-blue-600" /><span>{pick('nbuy.viewBill')}</span></button>
                {result.lines.some((l) => l.device_id) ? (
                  <button type="button" onClick={() => { const p = loadLabelPrefs(null); const fields = withCode && canCost ? [...p.fields.filter((f) => f !== 'code'), 'code' as const] : p.fields.filter((f) => f !== 'code' && f !== 'pcode'); void openPrintable(labelPath('devices', result.lines.filter((l) => l.device_id).map((l) => l.device_id!), { ...p, fields })) }} className="px-5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer" data-testid="nbuy-print"><Printer className="w-4 h-4" /><span>{pick('nbuy.printStickers')}</span></button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {newParty ? <NewParty kind={partyKind} onClose={() => setNewParty(false)} onMade={(p) => { setParty(p); setNewParty(false) }} /> : null}
      {toast ? <div className="fixed bottom-5 end-5 z-50"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold" role="status" data-testid="nbuy-toast"><span className="w-2 h-2 rounded-full bg-[#9AE600]" /><span>{toast}</span></div></div> : null}
    </div>
  )
}

function NewParty({ kind, onClose, onMade }: { kind: 'supplier' | 'customer'; onClose: () => void; onMade: (p: Party) => void }) {
  const { pick } = useLang()
  const inv = useInvalidate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  async function save() {
    try { const p = await post<Party>('/api/v1/parties', { name: name.trim(), phone: phone.trim() || null, kinds: [kind] }); await inv('parties'); onMade(p) } catch (e) { setErr(e instanceof ApiError ? e.messageEn : String(e)) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3.5" onClick={(e) => e.stopPropagation()} data-testid="nbuy-party-modal">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5"><h3 className="font-display font-extrabold text-sm">{pick(kind === 'supplier' ? 'nbuy.newDealer' : 'nbuy.newSeller')}</h3><button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer" aria-label="close"><X className="w-4 h-4" /></button></div>
        <div className="space-y-2.5">
          <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nbuy.fullName')} *</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" data-testid="nbuy-np-name" /></div>
          <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('npos.custPhone')}</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="w-full px-3 py-2 rounded-xl font-mono text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none" dir="ltr" data-testid="nbuy-np-phone" /></div>
        </div>
        {err ? <div className="text-xs font-bold text-rose-600">{err}</div> : null}
        <div className="flex items-center justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" onClick={save} disabled={name.trim().length < 2} className="px-4 py-2 rounded-xl bg-[#9AE600] text-slate-950 font-display font-extrabold text-xs cursor-pointer disabled:opacity-40" data-testid="nbuy-np-save">{pick('nbuy.saveSelect')}</button></div>
      </div>
    </div>
  )
}
