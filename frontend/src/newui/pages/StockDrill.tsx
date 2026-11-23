/** One kind of stock, brand by brand (ADR-134), drawn from `11-frame-stock-summary-and-dashboard.html`
 *  screen 2: the breadcrumb heading with the kind's worth and counts, the search and the three
 *  orders, the "capital concentration" bar of the three biggest brands and the rest, and the brands
 *  as cards that open into their models.
 *
 *  Every figure is the server's (`GET /reports/stock-summary?category=`) — the averages and every
 *  percentage too (ADR-131); the page only orders and searches. A model opens its pieces in the
 *  stock list. Accessories have no brands: the file draws no screen for them, so their kinds are
 *  shown here in the same cards (designed here, owner 2026-11-23). The file's "✓ audited" mark is
 *  sample decoration and is not built. */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { StockSummary } from '@/lib/types'
import { IconBack, IconSearch } from '../icons'

type Sort = 'value' | 'units' | 'avg'
type Kind = 'phone' | 'tablet' | 'watch' | 'laptop' | 'items'

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const pct = (v: number | undefined) => (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })
const rs = (v: string | number) => withCur(n(v))
/** the bar's parts, as the file colours them: the biggest brand, then blue, emerald, the rest amber */
const PART = ['bg-obsidian-900 dark:bg-[#B4F000]', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-400']

function Chevron({ open }: { open: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-180 bg-obsidian-900 text-white dark:bg-[#B4F000] dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-800'}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
    </div>
  )
}

export default function NewStockDrill({ kind }: { kind: Kind }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('value')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const device = kind === 'items' ? '' : kind
  const { data } = useGet<StockSummary>(['stock-summary', device], `/api/v1/reports/stock-summary${device ? `?category=${device}` : ''}`)
  const small = ur ? cls('sm') : 'text-xs'
  const units = (c: number) => (kind === 'items' ? t('ssum.pieces', { n: c }) : t(`stock.countBy.${kind}`, { n: c }))

  const brands = useMemo(() => {
    const word = q.trim().toLowerCase()
    const key = (x: { count: number; value: string | number; avg?: string | number }) => (sort === 'units' ? x.count : sort === 'avg' ? Number(x.avg ?? 0) : Number(x.value))
    return (data?.brands ?? [])
      .map((b) => {
        const hit = !word || b.name.toLowerCase().includes(word)
        const models = hit ? b.models : b.models.filter((m) => m.name.toLowerCase().includes(word))
        return { ...b, models: [...models].sort((a, c) => key(c) - key(a)), show: hit || models.length > 0, auto: !!word && models.length > 0 }
      })
      .filter((b) => b.show)
      .sort((a, c) => key(c) - key(a))
  }, [data, q, sort])

  if (!data) return <div className="py-20 flex justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-obsidian-900 dark:border-slate-700 dark:border-t-[#B4F000]" /></div>

  const kindOf = data.kinds?.find((k) => k.key === kind)
  const items = data.items
  const worth = kind === 'items' ? items?.value ?? 0 : data.value
  const counts = kind === 'items'
    ? `${t('ssum.pieces', { n: items?.pieces ?? 0 })} · ${t('nsum.itemsN', { n: items?.items ?? 0 })}`
    : `${units(data.count)} · ${t('nsum.brandsN', { n: kindOf?.brands ?? data.brands.length })} · ${t('nsum.modelsN', { n: kindOf?.models ?? 0 })}`
  const top = data.brands.slice(0, 3)
  const rest = data.brands.length - top.length
  const sortBtn = (s: Sort, label: string) => (
    <button type="button" onClick={() => setSort(s)} aria-pressed={sort === s} className={`px-2.5 py-1.5 rounded-lg cursor-pointer ${sort === s ? 'font-bold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-400'}`} data-testid={`ndrill-sort-${s}`}>{pick(label)}</button>
  )

  return (
    <section className="space-y-5" data-testid="ndrill">
      {/* Breadcrumb & header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className={`flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1.5 ${small}`}>
            <button type="button" onClick={() => nav('/new/stock/summary')} className="hover:text-slate-900 dark:hover:text-white font-semibold flex items-center gap-1 cursor-pointer" data-testid="ndrill-back">
              <IconBack className="w-3.5 h-3.5 rtl:rotate-180" />
              {pick('ndrill.backToStock')}
            </button>
            <span>/</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{pick(`stock.kind.${kind}`)}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className={ur ? `ur font-extrabold ${cls('lg')}` : 'font-display font-extrabold text-2xl sm:text-3xl tracking-tight'}>{pick(`stock.kind.${kind}`)}</h1>
            <span className={`font-medium text-slate-500 dark:text-slate-400 ${small}`}>({pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})</span>
            <span className="num font-display font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-[#B4F000]" dir="ltr" data-testid="ndrill-worth">{rs(worth)}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200/80 dark:bg-obsidian-800 text-slate-700 dark:text-slate-300" data-testid="ndrill-counts">{counts}</span>
          </div>
        </div>

        {kind !== 'items' ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative min-w-[240px]">
              <IconSearch className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('ndrill.search')} className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#B4F000]" data-testid="ndrill-search" />
            </div>
            <div className="inline-flex p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-xs">
              {sortBtn('value', 'ndrill.sortValue')}
              {sortBtn('units', 'ndrill.sortUnits')}
              {sortBtn('avg', 'ndrill.sortAvg')}
            </div>
          </div>
        ) : null}
      </div>

      {/* Capital concentration by brand */}
      {kind !== 'items' && data.brands.length ? (
        <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4" data-testid="ndrill-bar">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
            <span className="font-bold text-slate-700 dark:text-slate-200">{pick('ndrill.capital')}</span>
            <span className="text-slate-500">{t('ndrill.topHold', { n: top.length, p: pct(data.top3_share), kind: pick(`stock.kind.${kind}`) })}</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-obsidian-800 overflow-hidden flex gap-0.5">
            {top.map((b, i) => <div key={b.brand_id} style={{ width: `${b.share ?? 0}%` }} className={`${PART[i]} h-full`} title={`${b.name}: ${pct(b.share)}%`} />)}
            {rest > 0 ? <div style={{ width: `${data.others_share ?? 0}%` }} className={`${PART[3]} h-full`} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px] text-slate-600 dark:text-slate-400">
            {top.map((b, i) => <span key={b.brand_id} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${PART[i]}`} /><span dir="auto">{b.name}</span> ({pct(b.share)}%)</span>)}
            {rest > 0 ? <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${PART[3]}`} />{t('ndrill.others', { n: rest, p: pct(data.others_share) })}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Brands (or, for accessories, their kinds) */}
      <div className="space-y-3" data-testid="ndrill-list">
        {kind === 'items' ? (
          (items?.kinds ?? []).map((g) => (
            <Link key={g.key} to={`/new/accessories?category=${encodeURIComponent(g.key)}`} className="block rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:px-5 hover:bg-slate-50/70 dark:hover:bg-obsidian-850/60 transition-colors" data-testid="ndrill-item-kind">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-[200px]">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-obsidian-800 border border-slate-200/80 dark:border-slate-700 font-display font-extrabold text-xs flex items-center justify-center text-slate-800 dark:text-[#B4F000]" dir="ltr">{kindLabel(pick, g.key).slice(0, 2).toUpperCase()}</div>
                  <div>
                    <span className="font-display font-bold text-base" dir="auto">{kindLabel(pick, g.key)}</span>
                    <div className={`text-slate-500 dark:text-slate-400 ${small}`}><strong className="text-slate-700 dark:text-slate-300">{t('ssum.pieces', { n: g.pieces })}</strong> · {t('nsum.itemsN', { n: g.items })}</div>
                  </div>
                </div>
                <div className="hidden md:block flex-1 max-w-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1"><span>{pick('ndrill.capitalShare')}</span><span className="font-bold text-slate-700 dark:text-slate-300">{pct(g.share)}%</span></div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-obsidian-800 overflow-hidden"><div className="h-full bg-obsidian-900 dark:bg-[#B4F000] rounded-full" style={{ width: `${Math.max(3, g.share ?? 0)}%` }} /></div>
                </div>
                <div className="num font-display font-extrabold text-base sm:text-lg ms-auto" dir="ltr">{rs(g.value)}</div>
              </div>
            </Link>
          ))
        ) : !brands.length ? (
          <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8 text-center" data-testid="ndrill-none">
            <p className="font-bold text-sm">{q.trim() ? t('ndrill.noMatch', { q: q.trim() }) : pick('ssum.none')}</p>
            {q.trim() ? <p className="text-xs text-slate-500 mt-1">{pick('ndrill.tryAnother')}</p> : null}
          </div>
        ) : (
          brands.map((b) => {
            const isOpen = !!open[b.brand_id] || b.auto
            return (
              <div key={b.brand_id} className={`rounded-2xl bg-white dark:bg-obsidian-900 border overflow-hidden transition-all ${isOpen ? 'border-obsidian-900/40 dark:border-[#B4F000]/50 shadow-sm' : 'border-slate-200/90 dark:border-slate-800'}`} data-testid="ndrill-brand">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [b.brand_id]: !open[b.brand_id] })} className="w-full text-start p-4 sm:px-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-obsidian-850/60 transition-colors">
                  <div className="flex items-center gap-3.5 min-w-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-obsidian-800 border border-slate-200/80 dark:border-slate-700 font-display font-extrabold text-xs flex items-center justify-center text-slate-800 dark:text-[#B4F000]" dir="ltr">{b.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <span className="font-display font-bold text-base" dir="auto">{b.name}</span>
                      <div className={`text-slate-500 dark:text-slate-400 ${small}`}><strong className="text-slate-700 dark:text-slate-300">{units(b.count)}</strong> · {t('ndrill.avg', { v: rs(b.avg ?? 0) })}</div>
                    </div>
                  </div>
                  <div className="hidden md:block flex-1 max-w-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1"><span>{pick('ndrill.capitalShare')}</span><span className="font-bold text-slate-700 dark:text-slate-300">{pct(b.share)}%</span></div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-obsidian-800 overflow-hidden"><div className="h-full bg-obsidian-900 dark:bg-[#B4F000] rounded-full" style={{ width: `${Math.max(3, b.share ?? 0)}%` }} /></div>
                  </div>
                  <div className="flex items-center gap-3 ms-auto">
                    <div className="text-end">
                      <div className="num font-display font-extrabold text-base sm:text-lg" dir="ltr">{rs(b.value)}</div>
                      <div className="text-[11px] text-slate-400 md:hidden">{t('ndrill.shareShort', { p: pct(b.share) })}</div>
                    </div>
                    <Chevron open={isOpen} />
                  </div>
                </button>
                {isOpen ? (
                  <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-obsidian-950/60 p-3 sm:p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {b.models.map((m) => (
                        <Link key={m.model_id} to={`/new/stock?model_id=${m.model_id}&model=${encodeURIComponent(m.name)}&category=${kind}`} className="rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200/80 dark:border-slate-800 hover:border-obsidian-900 dark:hover:border-[#B4F000] p-3 flex items-center justify-between gap-3 cursor-pointer transition-all" data-testid="ndrill-model">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs sm:text-sm truncate block" dir="auto">{m.name}</span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{units(m.count)}</span>
                              <span>•</span>
                              <span>{t('ndrill.avg', { v: rs(m.avg ?? 0) })}</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-slate-100 dark:bg-obsidian-800 mt-2 overflow-hidden"><div className="h-full bg-emerald-500 dark:bg-[#B4F000] rounded-full" style={{ width: `${Math.max(6, m.share ?? 0)}%` }} /></div>
                          </div>
                          <div className="text-end shrink-0">
                            <div className="num font-display font-extrabold text-xs sm:text-sm" dir="ltr">{rs(m.value)}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{t('ndrill.ofBrand', { p: pct(m.share), name: b.name })}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
