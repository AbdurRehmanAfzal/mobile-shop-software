/** "What is my stock worth?" in the new product (ADR-134), drawn from the owner's mock-up
 *  `…pos_stock_ui (4).html` screen 1 and the kind icons of `luxury_stock_cards_preview.html`:
 *  the obsidian hero with its lime glow and three facts, the kinds that hold stock as big cards
 *  with their share bar, the empty kinds as a compact row with "+ Add", and the three export cards.
 *
 *  Every figure is the server's (`GET /reports/stock-summary`) — the averages and the percentages
 *  too (ADR-131). Cost is shown only when the server sent it; `basis` says which price it used.
 *  The tally sheet's permission (owner copy, staff copy, asking the owner) is the live software's
 *  own rule, kept here and only drawn in these cards' language. */

import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/components/Bilingual'
import { post } from '@/lib/api'
import { withDocLang } from '@/lib/docLang'
import { downloadFile, openPrintable } from '@/lib/files'
import { toLakh, withCur } from '@/lib/format'
import { useTrade } from '@/lib/modules'
import { useGet, useInvalidate } from '@/lib/queries'
import type { StockSummary } from '@/lib/types'
import type { TallyAccess } from '@/features/stock/TallySheetCard'
import {
  IconBack, IconChevronRight, IconClipboardCheck, IconDocChart, IconDownload, IconEyeOff,
  IconKindItems, IconKindLaptop, IconKindPhone, IconKindTablet, IconKindWatch, IconList,
  IconPrinter, IconShare,
} from '../icons'
import { Soon } from '../Shell'

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const pct = (v: number | undefined) => (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })

type DeviceKind = 'phone' | 'tablet' | 'watch' | 'laptop'
type CardKind = DeviceKind | 'items'
const ICON: Record<CardKind, (p: { className?: string }) => JSX.Element> = {
  phone: IconKindPhone, tablet: IconKindTablet, watch: IconKindWatch, laptop: IconKindLaptop, items: IconKindItems,
}

const TALLY = '/api/v1/exports/stock-tally'
const CARD = 'smart-card rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 flex flex-col justify-between gap-4'
const BADGE = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded'
const WELL = 'w-8 h-8 rounded-xl flex items-center justify-center'
const FOOT = 'flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800'
const DARKBTN = 'flex-1 py-2 px-3 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5'
const PALEBTN = 'flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-obsidian-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5'
const SIDEBTN = 'p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-obsidian-800 cursor-pointer'

export default function NewStockSummary() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const trade = useTrade()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [sp] = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const { data } = useGet<StockSummary>(['stock-summary', ''], '/api/v1/reports/stock-summary')
  const { data: acc } = useGet<TallyAccess>(['tally-access'], '/api/v1/staff-access/stock_tally')

  // screen 2 (the brand drill-down) is drawn next; until then a kind opens the one that works
  if (sp.get('kind')) return <Soon />
  if (!data) return <div className="py-20 flex justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-obsidian-900 dark:border-slate-700 dark:border-t-[#B4F000]" /></div>

  const kinds: CardKind[] = [...(trade.mobiles ? (['phone', 'tablet', 'watch'] as const) : []), ...(trade.laptops ? (['laptop'] as const) : []), ...(trade.accessories ? (['items'] as const) : [])]
  const of = (k: DeviceKind) => data.kinds?.find((x) => x.key === k) ?? { key: k, count: 0, value: '0', brands: 0, models: 0 }
  const items = data.items
  const has = (k: CardKind) => (k === 'items' ? (items?.pieces ?? 0) > 0 : of(k as DeviceKind).count > 0)
  const live = kinds.filter(has)
  const bare = kinds.filter((k) => !has(k))
  const models = data.brands.reduce((s, b) => s + b.models.length, 0)
  const total = data.total ?? data.value
  const topKind = data.top_kind && kinds.includes(data.top_kind as CardKind) ? (data.top_kind as CardKind) : null
  const topShare = topKind ? (topKind === 'items' ? items?.share : of(topKind as DeviceKind).share) : undefined
  const topBrand = topKind && topKind !== 'items' ? of(topKind as DeviceKind).top_brand : null
  const low = items?.low ?? 0
  const units = (k: CardKind, c: number) => (k === 'items' ? t('ssum.pieces', { n: c }).replace('{{n}}', String(c)) : t(`stock.countBy.${k}`, { n: c }))
  const small = ur ? cls('sm') : 'text-xs'

  async function ask(path: string, key: string) {
    setBusy(key)
    try { await post(path, {}); await inv('tally-access') } finally { setBusy(null) }
  }
  const full = !!acc?.allowed && acc.status === null // owner / manager
  const print = (staff: boolean) => openPrintable(withDocLang(`${TALLY}${staff ? '?staff=true&' : '?'}format=pdf`))
  const grab = (staff: boolean) => downloadFile(withDocLang(`${TALLY}${staff ? '?staff=true&' : '?'}format=xlsx`), staff ? 'stock-tally-staff.xlsx' : 'stock-tally.xlsx')

  return (
    <section className="space-y-6" data-testid="nsum">
      {/* Top breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => nav('/new')} className="px-3 py-1.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-800 flex items-center gap-1.5 cursor-pointer shrink-0">
            <IconBack className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{pick('common.back')}</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={ur ? `ur font-bold ${cls('lg')}` : 'font-display font-bold text-lg sm:text-xl tracking-tight'}>{pick('counter.stockTitle')}</h1>
              <span className="w-4 h-4 rounded-full border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold inline-flex items-center justify-center" title={pick('nsum.basisHint')}>?</span>
            </div>
            <p className={`text-slate-500 dark:text-slate-400 ${small}`}>{pick('nsum.tapCategory')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/new/stock" className="px-3.5 py-2 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="nsum-list">
            <IconList className="w-3.5 h-3.5" />
            <span>{pick('counter.seeList')}</span>
          </Link>
        </div>
      </div>

      {/* Hero valuation banner */}
      <div className="rounded-2xl bg-obsidian-900 dark:bg-obsidian-900 border border-slate-800 text-white p-5 sm:p-7 relative overflow-hidden shadow-lg" data-testid="nsum-hero">
        <div className="absolute -end-16 -top-16 w-64 h-64 rounded-full bg-[#B4F000]/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span>{pick('counter.stockWorth')} ({pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})</span>
              {Number(total) >= 100_000 ? <span className="px-2 py-0.5 rounded-full bg-[#B4F000]/15 text-[#B4F000] border border-[#B4F000]/30 font-bold text-[11px]"><span className="num" dir="ltr">{toLakh(total)}</span> {pick('counter.lakh')}</span> : null}
            </div>
            <div className="num font-display font-extrabold text-3xl sm:text-4xl lg:text-[42px] tracking-tight text-white mt-1.5" dir="ltr" data-testid="nsum-worth">{withCur(n(total))}</div>
            <div className={`mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300 ${ur ? cls('sm') : 'text-xs sm:text-sm'}`} data-testid="nsum-sub">
              <span className="font-semibold text-white">{units('phone', data.count)}</span>
              <span className="text-slate-600">•</span>
              <span>{t('nsum.brandsN', { n: data.brands.length })}</span>
              <span className="text-slate-600">•</span>
              <span>{t('nsum.modelsN', { n: models })}</span>
              {trade.accessories && items ? (<><span className="text-slate-600">•</span><span>{t('nsum.accPiecesN', { n: items.pieces })}</span></>) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:min-w-[410px]">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10" data-testid="nsum-avg">
              <div className="text-[11px] text-slate-400">{pick('nsum.avgUnit')}</div>
              <div className="num font-display font-bold text-base sm:text-lg text-white mt-0.5" dir="ltr">{withCur(n(data.avg ?? 0))}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">{pick('nsum.perUnit')}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10" data-testid="nsum-top">
              <div className="text-[11px] text-slate-400">{pick('nsum.topCategory')}</div>
              <div className="font-display font-bold text-base sm:text-lg text-[#B4F000] mt-0.5">{topKind ? `${pick(`stock.kind.${topKind}`)} (${pct(topShare)}%)` : '—'}</div>
              <div className="text-[10px] text-slate-300 mt-0.5">{topBrand ? `${topBrand.name}: ${pct(topBrand.share)}% ${pick('nsum.shareWord')}` : '—'}</div>
            </div>
            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-white/5 border border-white/10" data-testid="nsum-health">
              <div className="text-[11px] text-slate-400">{pick('nsum.health')}</div>
              <div className={`font-display font-bold text-base sm:text-lg mt-0.5 ${low ? 'text-amber-400' : 'text-emerald-400'}`}>{pick(low ? 'nsum.watch' : 'nsum.healthy')}</div>
              <div className="text-[10px] text-slate-300 mt-0.5">{t('nsum.lowN', { n: low })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active stock categories */}
      {live.length ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${small}`}>{pick('nsum.activeKinds')}</h2>
            <span className={`text-slate-500 ${small}`}>{pick('nsum.clickCard')}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="nsum-cards">
            {live.map((k) => {
              const d = k === 'items' ? null : of(k as DeviceKind)
              const count = d ? d.count : items?.pieces ?? 0
              const value = d ? d.value : items?.value ?? 0
              const share = d ? d.share : items?.share
              const Icon = ICON[k]
              return (
                <Link key={k} to={`/new/stock/summary?kind=${k}`} className="smart-card rounded-2xl bg-white dark:bg-obsidian-900 border-2 border-obsidian-900/90 dark:border-[#B4F000]/70 p-5 sm:p-6 cursor-pointer shadow-sm group block" data-testid={`nsum-card-${k}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 shrink-0 rounded-2xl bg-obsidian-900 dark:bg-[#B4F000] text-[#B4F000] dark:text-obsidian-950 flex items-center justify-center shadow-xs"><Icon className="w-6 h-6" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={ur ? `font-extrabold ${cls('md')}` : 'font-display font-extrabold text-lg'}>{pick(`stock.kind.${k}`)}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-obsidian-800 text-slate-800 dark:text-slate-200">{units(k, count)}</span>
                          {k === 'items' && low ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">{t('nsum.lowN', { n: low })}</span> : null}
                        </div>
                        <p className={`text-slate-500 dark:text-slate-400 mt-0.5 ${small}`}>
                          {d ? `${t('nsum.brandsN', { n: d.brands })} · ${t('nsum.modelsN', { n: d.models })}` : `${t('nsum.itemsN', { n: items?.items ?? 0 })} · ${t('nsum.outN', { n: items?.out ?? 0 })}`}
                        </p>
                      </div>
                    </div>
                    <div className="w-9 h-9 shrink-0 rounded-full bg-slate-100 dark:bg-obsidian-800 group-hover:bg-obsidian-900 group-hover:text-white dark:group-hover:bg-[#B4F000] dark:group-hover:text-obsidian-950 flex items-center justify-center transition-colors">
                      <IconChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={2.4} />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="num font-display font-extrabold text-2xl sm:text-3xl tracking-tight" dir="ltr">{withCur(n(value))}</div>
                    {d?.top_brand ? <span className="text-xs font-semibold text-emerald-700 dark:text-[#B4F000]" dir="auto">{t('nsum.topN', { name: d.top_brand.name, n: d.top_brand.count })}</span> : null}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span>{pick('nsum.shareOfStock')}</span>
                      <span className="num font-bold text-slate-800 dark:text-slate-200" dir="ltr">{pct(share)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-obsidian-800 overflow-hidden">
                      <div className="h-full bg-obsidian-900 dark:bg-[#B4F000] rounded-full bar-fill" style={{ width: `${Math.min(100, share ?? 0)}%` }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Empty categories */}
      {bare.length ? (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className={`font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${small}`}>{pick('nsum.emptyKinds')}</h2>
            <span className="text-[11px] text-slate-400">{pick('nsum.quickAdd')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="nsum-empty">
            {bare.map((k) => (
              <Link key={k} to="/new/purchase/new" className="rounded-xl bg-white/70 dark:bg-obsidian-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-400 dark:hover:border-slate-600 p-3 flex items-center justify-between cursor-pointer transition-all group" data-testid={`nsum-empty-${k}`}>
                <div className="min-w-0">
                  <div className={`font-semibold text-slate-700 dark:text-slate-300 ${small}`}>{pick(`stock.kind.${k}`)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{units(k, 0)} · <span className="num" dir="ltr">{withCur(n(0))}</span></div>
                </div>
                <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 group-hover:bg-[#B4F000] group-hover:text-slate-950 transition-colors shrink-0">
                  {pick('nsum.add')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Stock tally & export sheets */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className={`font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${small}`}>{pick('nsum.sheets')}</h2>
            <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300" dir="ltr">A4 / PDF / Excel</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="nsum-sheets">
          {/* Owner copy */}
          <div className={CARD}>
            <div>
              <div className="flex items-center justify-between">
                <span className={`${WELL} bg-slate-100 dark:bg-obsidian-800 text-slate-700 dark:text-slate-200`}><IconClipboardCheck className="w-4 h-4" /></span>
                <span className={`${BADGE} bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300`}>{pick('nsum.ownerCopy')}</span>
              </div>
              <h3 className={`font-bold mt-3 ${ur ? cls('md') : 'text-sm'}`}>{pick('tally.title')}</h3>
              <p className={`text-slate-500 dark:text-slate-400 mt-1 leading-relaxed ${small}`}>{pick('tally.hint')}</p>
            </div>
            <div className={FOOT}>
              {full ? (
                <>
                  <button type="button" onClick={() => print(false)} className={DARKBTN} data-testid="nsum-print-owner"><IconPrinter className="w-3.5 h-3.5" />{pick('tally.print')}</button>
                  <button type="button" onClick={() => grab(false)} aria-label={pick('common.download')} className={SIDEBTN}><IconDownload className="w-4 h-4" /></button>
                </>
              ) : acc?.status === 'pending' ? (
                <span className={`flex-1 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold text-center ${small}`} data-testid="nsum-waiting">{pick('tally.waiting')}</span>
              ) : (
                <button type="button" disabled={busy === 'ask'} onClick={() => ask('/api/v1/staff-access/stock_tally/request', 'ask')} className={PALEBTN} data-testid="nsum-ask">{pick('tally.ask')}</button>
              )}
            </div>
          </div>

          {/* Staff copy */}
          <div className={CARD}>
            <div>
              <div className="flex items-center justify-between">
                <span className={`${WELL} bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400`}><IconEyeOff className="w-4 h-4" /></span>
                <span className={`${BADGE} bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300`}>{pick('nsum.noPrices')}</span>
              </div>
              <h3 className={`font-bold mt-3 ${ur ? cls('md') : 'text-sm'}`}>{pick('tally.staffCopy')}</h3>
              <p className={`text-slate-500 dark:text-slate-400 mt-1 leading-relaxed ${small}`}>{pick('tally.staffCopyHint')}</p>
            </div>
            <div className={FOOT}>
              {acc?.allowed ? (
                <>
                  <button type="button" onClick={() => print(true)} className={PALEBTN} data-testid="nsum-print-staff"><IconPrinter className="w-3.5 h-3.5" />{pick('tally.print')}</button>
                  <button type="button" onClick={() => grab(true)} aria-label={pick('common.download')} className={SIDEBTN}><IconDownload className="w-4 h-4" /></button>
                </>
              ) : (
                <span className={`flex-1 py-2 px-3 text-slate-400 text-center ${small}`}>{pick('nsum.needOwner')}</span>
              )}
            </div>
          </div>

          {/* Item-wise */}
          <div className={CARD}>
            <div>
              <div className="flex items-center justify-between">
                <span className={`${WELL} bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400`}><IconDocChart className="w-4 h-4" /></span>
                <span className={`${BADGE} bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300`}>{pick('nsum.detailed')}</span>
              </div>
              <h3 className={`font-bold mt-3 ${ur ? cls('md') : 'text-sm'}`}>{pick('ledgerRep.stockTitle')}</h3>
              <p className={`text-slate-500 dark:text-slate-400 mt-1 leading-relaxed ${small}`}>{pick('ledgerRep.stockHint')}</p>
            </div>
            <div className={FOOT}>
              <button type="button" onClick={() => downloadFile(withDocLang('/api/v1/exports/stock-cost?format=xlsx'), 'stock-item-wise.xlsx')} className={PALEBTN} data-testid="nsum-item-wise"><IconDownload className="w-3.5 h-3.5" />{pick('nsum.downloadExcel')}</button>
              <button type="button" onClick={() => downloadFile(withDocLang('/api/v1/exports/stock-cost?format=pdf'), 'stock-item-wise.pdf')} aria-label={pick('common.download')} className={SIDEBTN}><IconShare className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* who asked for the staff copy — the live software's rule, drawn in these cards' language */}
        {full && acc?.requests?.length ? (
          <div className="mt-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4" data-testid="nsum-requests">
            <h3 className={`font-bold ${ur ? cls('md') : 'text-sm'}`}>{pick('tally.requests')}</h3>
            <div className="mt-2 space-y-2">
              {acc.requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <span className={`min-w-0 flex-1 truncate font-semibold ${small}`}>{r.name ?? '—'}</span>
                  {r.status === 'pending' ? (
                    <>
                      <button type="button" disabled={busy === `a${r.id}`} onClick={() => ask(`/api/v1/staff-access/requests/${r.id}/approve`, `a${r.id}`)} className="px-3 py-1.5 rounded-lg bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 text-xs font-bold">{pick('tally.approve')}</button>
                      <button type="button" disabled={busy === `r${r.id}`} onClick={() => ask(`/api/v1/staff-access/requests/${r.id}/reject`, `r${r.id}`)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-800 text-xs font-bold">{pick('tally.reject')}</button>
                    </>
                  ) : (
                    <button type="button" disabled={busy === `v${r.id}`} onClick={() => ask(`/api/v1/staff-access/requests/${r.id}/revoke`, `v${r.id}`)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-800 text-xs font-bold">{pick('tally.revoke')}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
