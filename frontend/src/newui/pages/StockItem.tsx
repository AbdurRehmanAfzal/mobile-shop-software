/** One stock item's page in the new product (ADR-134) — an accessory or any counted item — drawn from
 *  the "Accessories" view of `17-item-detail-command-center.html` / `20-item-detail-with-ledger-sheet.html`
 *  in the same frame as a phone's page (`ItemDetail.tsx`): the file's top bar with Accessories lit, the
 *  item with its pieces in stock, the main jobs (Sell, Reserve, Adjust stock, Print stickers, More
 *  actions, WhatsApp pitch), and the cards: identity & shelf, details, cost & margin, the purchase
 *  batches, the item's ledger (every movement with the pieces after it), the 50×30 sticker, warranty.
 *
 *  Everything is the live item page's (`features/accessories/AccessoryDetailPage.tsx`):
 *  `GET /accessories/{id}`, `/batches` (owner / manager), `/timeline`; adjust =
 *  `POST /accessories/{id}/adjust` (a reason, cost for pieces added), an adjustment undone =
 *  `POST /accessories/{id}/movements/{m}/undo` with a reason (ADR-090); edit is the live item form,
 *  reserve the live hold, variants the live variants card, a tablet / watch made a tracked unit with
 *  `POST /devices/from-item/{id}`, delete `DELETE /accessories/{id}`. The figures (average cost, profit
 *  each, stock value, pieces after each movement) are the server's.
 *
 *  Differences from the drawing: an item has no IMEI, PTA, lock or QC checks, so those cards are not
 *  drawn; there is no market range for items; the profit each is shown without the live page's
 *  percentage (the new product works none out). */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, ChevronDown, ChevronUp, Headphones, Languages, Laptop, MessageCircle, Moon, Printer, RefreshCw, ShieldCheck, Smartphone, Sun, Tablet, Tag, Undo2, Watch, Wrench, Zap } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import LabelSheet from '@/components/LabelSheet'
import RemoveSheet from '@/components/RemoveSheet'
import { Sheet, fmtDate } from '@/components/ui'
import { ApiError, api, post } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useModules, useTrade } from '@/lib/modules'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import ItemForm from '@/features/accessories/ItemForm'
import { KindsCard } from '@/features/accessories/ItemVariants'
import type { Batch, Item, TimelineRow } from '@/features/accessories/types'
import { ItemReserve } from '@/features/stock/ReserveCard'
import DeviceLineSheet, { draftToApi, emptyDraft } from '@/features/purchase/DeviceLineSheet'
import { Card, Err, Field, Shell, Spec, Sticker, go, inp, lbl } from './ItemDetail'

const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
type Act = { key: string; label: string; run: () => void; danger?: boolean }

export default function NewStockItem() {
  const { id } = useParams()
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const canAdd = !!role && role !== 'technician'
  const multiShop = useAuth((s) => (s.me?.shops.length ?? 0) > 1)
  const trade = useTrade()
  const has = useModules()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { data: it, error } = useGet<Item>(['item', id], id ? `/api/v1/accessories/${id}` : null)
  const { data: batches } = useGet<Batch[]>(['item-batches', id], id && canCost ? `/api/v1/accessories/${id}/batches` : null)
  const { data: tl } = useGet<TimelineRow[]>(['item-timeline', id], id ? `/api/v1/accessories/${id}/timeline` : null)
  const [showCost, setShowCost] = useState(true)
  const [more, setMore] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [labels, setLabels] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [making, setMaking] = useState(false)
  const [holding, setHolding] = useState(false)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2600); return () => clearTimeout(x) }, [toast])
  useEffect(() => {
    const goKeys: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (goKeys[e.key]) { e.preventDefault(); nav(goKeys[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  if (error) return <div className="min-h-dvh flex items-center justify-center text-sm text-rose-600" data-newui="1">{errText(error, ur)}</div>
  if (!it) return <div className="min-h-dvh flex items-center justify-center bg-[#F4F6F9] dark:bg-obsidian-950" data-newui="1" data-file="17"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-obsidian-900 dark:border-t-[#A3E635]" /></div>

  const costOk = canCost && showCost
  const hide = (v: string | number | null | undefined) => (costOk ? rs(v) : '••••••')
  const name = ur ? it.name_ur || it.name : it.name
  const variant = [it.color, it.size, it.capacity, it.connector, it.wattage].filter(Boolean).join(' · ')
  const chips = [kindLabel(pick, it.category), it.brand, it.variant, it.compatible ? `${pick('nsi.for')} ${it.compatible}` : null, it.grade && it.grade !== 'unspecified' ? it.grade : null].filter(Boolean) as string[]
  const out = it.qty <= 0
  const statusTone = out ? 'bg-rose-50 text-rose-700 border-rose-200' : it.low_stock ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  const refresh = () => inv('item', 'item-batches', 'item-timeline', 'accessories')
  const moreActs: Act[] = [
    ...(canCost ? [{ key: 'edit', label: 'crud.editItem', run: () => setEditing(true) }] : []),
    ...(canCost && multiShop && it.qty > 0 ? [{ key: 'transfer', label: 'transfer.sendBranch', run: () => nav(`/transfers/new?item=${it.id}`) }] : []),
    ...(canCost && it.qty > 0 && (it.category === 'watch' || it.category === 'tablet') ? [{ key: 'makeUnit', label: 'devx.makeUnit', run: () => setMaking(true) }] : []),
    { key: 'classic', label: 'nsi.classic', run: () => nav(`/accessories/${it.id}`) },
    ...(canCost ? [{ key: 'delete', label: 'crud.delete', run: () => setRemoving(true), danger: true }] : []),
  ]
  const pitch = () => {
    const text = [
      `*${shop?.name ?? ''}*`, `*${it.name}*`, variant || null, it.compatible ? `${pick('nsi.for')}: ${it.compatible}` : null,
      it.warranty_days ? `${pick('nitem.pWarranty')}: ${t('nsi.days', { n: it.warranty_days })}` : null,
      `*${pick('nitem.pDemand')}: ${rs(it.promo_price || it.price)}*`, pick('nitem.pVisit'),
    ].filter(Boolean).join('\n')
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setToast(pick('nitem.pitchCopied'))
  }
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).catch(() => undefined); setToast(t('nlist.copied', { what: v })) }
  const kinds = [
    ...(trade.mobiles ? [['phone', Smartphone, 'devcat.phone'], ['tablet', Tablet, 'devcat.tablet'], ['watch', Watch, 'devcat.watch']] as const : []),
    ...(has('laptops') ? [['laptop', Laptop, 'devcat.laptop']] as const : []),
    ...(has('accessories') ? [['items', Headphones, 'nitem.items']] as const : []),
  ]
  const mark = it.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const btn = 'px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:border-slate-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer'

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh" data-testid="nsi" data-newui="1" data-file="17">
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/new" className="flex items-center gap-2.5 min-w-0"><span className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs" dir="ltr">{(shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span><span className="hidden sm:block min-w-0"><span className="block font-display font-extrabold text-sm truncate">{ur ? shop?.name_ur || shop?.name : shop?.name}</span><span className="block text-[10px] text-slate-500 truncate">{shop?.city ?? ''}</span></span></Link>
          <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/new/stock/summary?kind=items'))} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1 cursor-pointer" data-testid="nsi-back"><ArrowLeft className="w-3.5 h-3.5 rtl:-scale-x-100" />{pick('nitem.back')}</button>
        </div>
        <nav className="order-3 lg:order-none w-full lg:w-auto overflow-x-auto flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800">
          {kinds.map(([k, Icon, l]) => <Link key={k} to={`/new/stock/summary?kind=${k}`} aria-current={k === 'items' ? 'page' : undefined} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${k === 'items' ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-obsidian-800'}`}><Icon className="w-3.5 h-3.5" />{pick(l)}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold cursor-pointer" data-testid="nsi-eye">{pick(showCost ? 'nrep.costVisible' : 'nrep.costHidden')}</button> : null}
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nsi-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl bg-obsidian-900 dark:bg-white text-white dark:text-obsidian-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
        </div>
      </header>

      <section className="bg-white dark:bg-obsidian-900 border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="w-12 h-12 shrink-0 rounded-2xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-sm" dir="ltr">{mark}</span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2"><h1 className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="auto" data-testid="nsi-title">{name}</h1><span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${statusTone}`} data-testid="nsi-status">{out ? pick('acc.outOfStock') : t('nsi.inStock', { n: it.qty })}{it.low_stock && !out ? ` · ${pick('acc.low')}` : ''}</span></div>
            <div className="flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-[11px] font-semibold text-slate-700 dark:text-slate-300" dir="auto">{c}</span>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 relative">
          {it.qty > 0 ? <button type="button" onClick={() => nav(`/new/sale/new?item=${it.id}`)} className="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-sm flex items-center gap-1.5 cursor-pointer" data-testid="nsi-sell"><Banknote className="w-4 h-4" />{pick('stock.sell')}</button> : null}
          {it.qty > 0 ? <button type="button" onClick={() => setHolding(true)} className={btn} data-testid="nsi-reserve"><Tag className="w-4 h-4 text-rose-500" />{pick('reserve.title')}</button> : null}
          {canCost ? <button type="button" onClick={() => setAdjusting(true)} className={btn} data-testid="nsi-adjust"><RefreshCw className="w-4 h-4 text-amber-500" />{pick('acc.adjust')}</button> : null}
          <button type="button" onClick={() => setLabels(true)} className={btn} data-testid="nsi-labels"><Printer className="w-4 h-4 text-slate-500" />{pick('label.button')}</button>
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="px-3.5 py-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nsi-more"><Zap className="w-4 h-4 text-amber-400" />{pick('nitem.more')}<span className="px-1.5 rounded-full bg-[#A3E635] text-slate-950 text-[10px] font-extrabold" dir="ltr">{moreActs.length}</span>{more ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
          <button type="button" onClick={pitch} className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer" data-testid="nsi-pitch"><MessageCircle className="w-4 h-4" />{pick('nitem.pitch')}</button>
          {more ? <div className="absolute end-0 top-full mt-2 z-40 w-64 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-2" data-testid="nsi-more-list">{moreActs.map((a) => <button key={a.key} type="button" onClick={() => { setMore(false); a.run() }} className={`w-full px-3 py-2 rounded-xl text-start text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-obsidian-850 ${a.danger ? 'text-rose-600' : ''}`} data-testid={`nsi-act-${a.key}`}>{pick(a.label)}</button>)}</div> : null}
        </div>
      </section>

      <main className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1fr_1.15fr_0.85fr] gap-5 items-start">
        <div className="space-y-5">
          <Card title="nitem.identity" dot chip={it.sku} testid="nsi-identity">
            <div className="space-y-2.5">
              <Field k="nsi.sku" v={it.sku} onCopy={copy} />
              {it.barcode && it.barcode !== it.sku ? <Field k="nitem.barcode" v={it.barcode} onCopy={copy} /> : null}
              {it.manufacturer_code ? <Field k="nsi.mfr" v={it.manufacturer_code} onCopy={copy} /> : null}
              <Field k="nitem.shelf" v={it.location || '—'} />
              {it.supplier_skus?.length ? <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{pick('acc.supplierSkus')}</div>{it.supplier_skus.map((x, i) => <div key={i} className="text-xs" dir="ltr">{x.sku}{x.party_name ? ` · ${x.party_name}` : ''}</div>)}</div> : null}
            </div>
          </Card>
          <Card title="nsi.details" testid="nsi-details" action={canCost ? <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer" data-testid="nsi-edit">{pick('crud.editDetails')}</button> : undefined}>
            <div className="grid grid-cols-2 gap-2.5">
              <Spec k="nsi.kind" v={kindLabel(pick, it.category)} />
              {it.brand ? <Spec k="nsi.brand" v={it.brand} /> : null}
              {variant ? <Spec k="acc.size" v={variant} /> : null}
              {it.compatible ? <Spec k="acc.compatible" v={it.compatible} /> : null}
              <Spec k="acc.reorder" v={`${it.reorder_level}${it.max_stock ? ` – ${it.max_stock}` : ''}`} />
              {it.unit && it.unit !== 'piece' ? <Spec k="nsi.unit" v={it.unit} /> : null}
            </div>
            {it.description ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300" dir="auto">{it.description}</p> : null}
          </Card>
          <div className="[&_section]:rounded-3xl" data-testid="nsi-variants"><KindsCard item={it} canAdd={canAdd} /></div>
        </div>

        <div className="space-y-5">
          <Card title="nitem.cost" dot testid="nsi-cost">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="text-[11px] text-slate-500">{pick('nsi.inStockTile')}</div><div className="font-display font-extrabold text-base mt-1" dir="ltr" data-testid="nsi-qty">{it.qty}</div></div>
              {canCost ? <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"><div className="text-[11px] text-slate-500">{pick('acc.avgCost')}</div><div className="font-display font-extrabold text-base mt-1" dir="ltr" data-testid="nsi-avg">{hide(it.avg_cost)}</div></div> : null}
              {canCost ? <div className="p-3 rounded-xl bg-obsidian-900 text-white dark:bg-obsidian-800"><div className="text-[11px] text-slate-300">{pick('acc.stockValue')}</div><div className="font-display font-extrabold text-base mt-1 text-[#A3E635]" dir="ltr" data-testid="nsi-value">{hide(it.stock_value)}</div></div> : null}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button type="button" onClick={() => (canCost ? setEditing(true) : undefined)} className="p-4 rounded-xl text-start bg-[#A3E635]/15 border border-[#A3E635]/70 cursor-pointer" data-testid="nsi-price"><div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">{pick('acc.price')}{canCost ? <span className="underline">{pick('nitem.edit')}</span> : null}</div><div className="font-display font-extrabold text-2xl mt-1" dir="ltr">{rs(it.price)}</div>{it.promo_price ? <div className="text-[10px] text-slate-500 mt-0.5">{pick('acc.promo')}: <span dir="ltr">{rs(it.promo_price)}{it.promo_to ? ` → ${fmtDate(it.promo_to)}` : ''}</span></div> : null}</button>
              {canCost ? <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800" data-testid="nsi-profit"><div className="text-[11px] font-bold text-slate-500">{pick('acc.profitEach')}</div><div className={`font-display font-extrabold text-2xl mt-1 ${num(it.profit) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-[#A3E635]'}`} dir="ltr">{it.profit == null ? '—' : costOk ? `${num(it.profit) < 0 ? '−' : '+'}${rs(it.profit)}` : '••••••'}</div></div> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {it.wholesale_price ? <span>{pick('acc.wholesale')}: <strong className="text-slate-800 dark:text-slate-200" dir="ltr">{rs(it.wholesale_price)}</strong></span> : null}
              {canCost && it.min_price ? <span>{pick('acc.minPrice')}: <strong className="text-slate-800 dark:text-slate-200" dir="ltr">{hide(it.min_price)}</strong></span> : null}
            </div>
          </Card>

          {canCost ? (
            <Card title="nsi.batches" testid="nsi-batches">
              {!batches?.length ? <p className="text-[11px] text-slate-400">{pick('acc.none')}</p> : (
                <div className="space-y-2">
                  {batches.map((b) => (
                    <div key={b.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs" data-testid="nsi-batch">
                      <div className="min-w-0"><div className="font-bold truncate" dir="auto">{b.party_name ?? b.batch_ref ?? pick(b.source === 'opening' ? 'acc.openingQty' : b.source === 'purchase' ? 'acc.cost' : 'acc.adjust')}</div><div className="text-[10px] text-slate-400" dir="ltr">{fmtDate(b.date)}{b.batch_ref && b.party_name ? ` · ${b.batch_ref}` : ''}</div></div>
                      <div className="text-end shrink-0"><div className="font-mono font-bold" dir="ltr">{b.qty_left} / {b.qty_in} <span className="font-sans text-slate-400">{pick('acc.left')}</span></div><div className="font-mono text-[10px] text-slate-500" dir="ltr">{hide(b.unit_cost)}</div></div>
                      {b.document_type === 'purchase' && b.document_id ? <button type="button" onClick={() => nav(`/purchases/${b.document_id}`)} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold cursor-pointer">{pick('nitem.bill')}</button> : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}

          <Card title="nsi.ledger" testid="nsi-ledger">
            <p className="-mt-3 mb-3 text-[11px] text-slate-500">{pick('nsi.ledgerSub')}</p>
            {!tl?.length ? <p className="text-[11px] text-slate-400">{pick('acc.none')}</p> : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase tracking-wider text-slate-500"><th className="py-2 px-2.5 text-start">{pick('nitem.lg.date')}</th><th className="py-2 px-2.5 text-start">{pick('nitem.lg.what')}</th><th className="py-2 px-2.5 text-end">{pick('nsi.pieces')}</th><th className="py-2 px-2.5 text-end">{pick('nsi.after')}</th><th className="py-2 px-2.5 text-end">{pick('nsi.amount')}</th><th className="py-2 px-2.5" /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tl.map((r, i) => r.kind === 'price' ? (
                      <tr key={i} data-testid="nsi-row"><td className="py-2 px-2.5 whitespace-nowrap" dir="ltr">{fmtDate(r.at)}</td><td className="py-2 px-2.5 font-semibold" colSpan={3}>{pick('acc.priceChange')} · {pick(r.field === 'avg_cost' ? 'acc.avgCost' : r.field === 'wholesale_price' ? 'acc.wholesale' : r.field === 'min_price' ? 'acc.minPrice' : r.field === 'promo_price' ? 'acc.promo' : 'acc.price')}</td><td className="py-2 px-2.5 text-end font-mono" dir="ltr">{r.field === 'avg_cost' || r.field === 'min_price' ? (costOk ? `${r.old != null ? num(r.old).toLocaleString('en-US') : '—'} → ${r.new != null ? num(r.new).toLocaleString('en-US') : '—'}` : '••••') : `${r.old != null ? num(r.old).toLocaleString('en-US') : '—'} → ${r.new != null ? num(r.new).toLocaleString('en-US') : '—'}`}</td><td /></tr>
                    ) : (
                      <tr key={i} data-testid="nsi-row">
                        <td className="py-2 px-2.5 whitespace-nowrap"><div className="font-semibold" dir="ltr">{fmtDate(r.at)}</div>{r.doc_no && r.doc_no !== 'Opening stock' ? <div className="font-mono text-[10px] text-slate-400" dir="ltr">{r.doc_no}</div> : null}</td>
                        <td className="py-2 px-2.5"><button type="button" disabled={!r.document_id || !(r.document_type === 'purchase' || r.document_type === 'invoice')} onClick={() => nav(r.document_type === 'purchase' ? `/purchases/${r.document_id}` : `/sales/${r.document_id}`)} className="text-start disabled:cursor-default cursor-pointer"><span className="flex items-center gap-1 font-semibold">{r.reason === 'adjust' ? <Wrench className="w-3 h-3 text-amber-500" /> : r.qty_delta > 0 ? <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> : <ArrowUpRight className="w-3 h-3 text-rose-500" />}{pick(`acc.move.${r.reason}`)}</span>{r.party_name ? <span className="block text-[10px] text-slate-400" dir="auto">{r.party_name}</span> : null}</button></td>
                        <td className={`py-2 px-2.5 text-end font-mono font-bold ${r.qty_delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{r.qty_delta > 0 ? '+' : ''}{r.qty_delta}</td>
                        <td className="py-2 px-2.5 text-end font-mono" dir="ltr">{r.qty_after}</td>
                        <td className="py-2 px-2.5 text-end font-mono" dir="ltr">{r.amount != null ? rs(r.amount) : canCost && r.unit_cost ? <span className="text-slate-500">@ {hide(r.unit_cost)}</span> : '—'}{r.remaining != null && num(r.remaining) > 0 ? <span className="block text-[10px] text-amber-700">{pick('common.due')} {rs(r.remaining)}</span> : null}</td>
                        <td className="py-2 px-1.5 text-end">{canCost && r.id && r.reason === 'adjust' && r.document_type !== 'adjust_undo' && !tl.some((x) => x.kind === 'move' && x.document_type === 'adjust_undo' && x.document_id === r.id) ? <button type="button" onClick={() => setUndoing(r.id!)} aria-label={pick('del.undoAdjust')} className="p-1 rounded-md text-rose-500 hover:bg-rose-50 cursor-pointer" data-testid="nsi-undo"><Undo2 className="w-3.5 h-3.5" /></button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2 xl:col-span-1">
          <Card title="nitem.sticker" icon={<Tag className="w-4 h-4 text-amber-500" />} chip={pick('nitem.livePreview')} testid="nsi-sticker">
            <Sticker deviceId={it.id} kind="items" canSeeCost={canCost} onMore={() => setLabels(true)} />
          </Card>
          <Card title="nitem.warranty" icon={<ShieldCheck className="w-4 h-4 text-blue-500" />} testid="nsi-warranty">
            {it.warranty_days ? <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{pick(it.warranty_by === 'supplier' ? 'acc.bySupplier' : 'acc.byShop')}</span><span className="text-sm font-extrabold text-emerald-600">{t('nsi.days', { n: it.warranty_days })}</span></div>{it.warranty_terms ? <div className="text-[11px] text-slate-500 mt-1" dir="auto">{it.warranty_terms}</div> : <div className="text-[11px] text-slate-500 mt-1">{pick('nitem.startsOnSale')}</div>}</div> : <p className="text-xs text-slate-500">{pick('nitem.noWarranty')}</p>}
          </Card>
        </div>
      </main>

      {adjusting ? <AdjustDrawer item={it} onClose={() => setAdjusting(false)} onDone={() => { setAdjusting(false); setToast(pick('nsi.adjusted')); void refresh() }} /> : null}
      {undoing ? <UndoAdjust itemId={it.id} moveId={undoing} onClose={() => setUndoing(null)} onDone={() => { setUndoing(null); setToast(pick('nsi.undone')); void refresh() }} /> : null}
      {holding ? <Shell title="reserve.title" sub="reserve.hint" onClose={() => setHolding(false)} testid="nsi-hold" foot={<button type="button" onClick={() => setHolding(false)} className={go}>{pick('common.close')}</button>}><ItemReserve itemId={it.id} qty={it.qty} /></Shell> : null}
      <Sheet open={editing} onClose={() => setEditing(false)} title="crud.editItem">{editing ? <ItemForm item={it} onDone={async () => { setEditing(false); await refresh() }} /> : null}</Sheet>
      <Sheet open={making} onClose={() => setMaking(false)} title="devx.makeUnit">
        {making ? <DeviceLineSheet initial={{ ...emptyDraft(), category: it.category as 'watch' | 'tablet', condition: 'box_pack', cost: it.avg_cost ? String(num(it.avg_cost)) : '', asking_price: String(num(it.price) || '') }} onSave={async (x) => { const a = draftToApi(x); const unit = await post<{ id: string }>(`/api/v1/devices/from-item/${it.id}`, { identity: { ...a.device, cost_price: a.cost, asking_price: a.asking_price, accessories: a.accessories }, cost: a.cost || null }); setMaking(false); await inv('accessories', 'item', 'item-timeline', 'devices'); nav(`/new/item/${unit.id}`) }} /> : null}
      </Sheet>
      <LabelSheet kind="items" ids={[it.id]} open={labels} onClose={() => setLabels(false)} />
      <RemoveSheet open={removing} onClose={() => setRemoving(false)} warn="accessory" name={it.name} onConfirm={async () => { await api('DELETE', `/api/v1/accessories/${it.id}`); await inv('accessories'); nav('/new/stock/summary?kind=items') }} />
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nsi-toast">{toast}</span></div></div>
    </div>
  )
}

/** "Adjust stock": pieces found / lost / damaged with a reason; pieces added carry their cost (the live adjust) */
function AdjustDrawer({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [delta, setDelta] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const d = Number(delta)
  async function save() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/accessories/${item.id}/adjust`, { qty_delta: d, unit_cost: cost ? Number(cost) : undefined, note: note.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Shell title="acc.adjust" sub="nsi.adjustSub" onClose={onClose} testid="nsi-adjust-drawer" foot={<button type="button" disabled={busy || !d || note.trim().length < 2} onClick={() => void save()} className={go} data-testid="nsi-adjust-save">{pick('common.save')}</button>}>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between text-xs"><span>{pick('nsi.inStockTile')}</span><strong className="font-mono" dir="ltr">{item.qty}{d ? ` → ${item.qty + d}` : ''}</strong></div>
      <div><label className={lbl}>{pick('acc.delta')}</label><div className="flex items-center gap-2"><button type="button" onClick={() => setDelta(String((Number(delta) || 0) - 1))} className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-obsidian-850 font-bold cursor-pointer">−</button><input type="number" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" className={`${inp} font-mono font-extrabold text-center`} dir="ltr" data-testid="nsi-delta" /><button type="button" onClick={() => setDelta(String((Number(delta) || 0) + 1))} className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-obsidian-850 font-bold cursor-pointer">+</button></div></div>
      {d > 0 ? <div><label className={lbl}>{pick('acc.cost')}</label><input type="number" min={0} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inp} font-mono`} dir="ltr" data-testid="nsi-adjust-cost" /></div> : null}
      <div><label className={lbl}>{pick('acc.reason')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={pick('acc.reasonPh')} maxLength={200} className={inp} dir="auto" data-testid="nsi-adjust-note" /></div>
      <Err e={err} />
    </Shell>
  )
}

function UndoAdjust({ itemId, moveId, onClose, onDone }: { itemId: string; moveId: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Shell title="del.undoAdjust" sub="nsi.undoSub" onClose={onClose} testid="nsi-undo-window" foot={<button type="button" disabled={busy || why.trim().length < 3} onClick={async () => { setBusy(true); setErr(''); try { await post(`/api/v1/accessories/${itemId}/movements/${moveId}/undo`, { reason: why.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-display font-extrabold text-sm cursor-pointer" data-testid="nsi-undo-yes">{pick('crud.delete')}</button>}>
      <div><label className={lbl}>{pick('common.reason')}</label><input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} className={inp} dir="auto" data-testid="nsi-undo-why" /></div>
      <Err e={err} />
    </Shell>
  )
}
