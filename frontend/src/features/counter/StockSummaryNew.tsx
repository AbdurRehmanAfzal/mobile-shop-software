/** "What is my stock worth?" — owner 2026-11-22 (ADR-131): a card per kind of stock (mobiles,
 *  tablets, watches, laptops, accessories) with its pieces, worth, brands and models; a card opens
 *  that kind — brand rows that open into their models, a model opens those pieces in the stock
 *  list. Redrawn from the owner's new screens (ADR-132, docs/43 mock-ups 11 and 13): a dark heading
 *  with what a piece comes to, the kinds that hold stock as big cards with their part of the money,
 *  the empty ones small; a kind shows where the money sits brand by brand, and its brands can be
 *  searched and put in another order.
 *  Every figure is the server's (`GET /reports/stock-summary`), the averages and percentages too;
 *  nothing is worked out here except the heading's total of the cards, the order of the rows and
 *  the search. */

import DownloadButton from '@/components/DownloadButton'
import TallySheetCard from '@/features/stock/TallySheetCard'
import { ChevronDown, ChevronLeft, ChevronRight, Headphones, Laptop, List as ListIcon, PackagePlus, Smartphone, Tablet, Watch } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { kindLabel } from '@/components/ItemKinds'
import { Pills } from '@/components/kit'
import { BtnText, Empty, Loading, PageHeader, SearchBox } from '@/components/ui'
import { toLakh, withCur } from '@/lib/format'
import { useTrade } from '@/lib/modules'
import { useGet } from '@/lib/queries'
import type { StockSummary } from '@/lib/types'

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

type DeviceKind = 'phone' | 'tablet' | 'watch' | 'laptop'
type CardKind = DeviceKind | 'items'
type Sort = 'value' | 'units' | 'avg'
const ICON: Record<CardKind, typeof Smartphone> = { phone: Smartphone, tablet: Tablet, watch: Watch, laptop: Laptop, items: Headphones }
/** the parts of the brand bar: the three biggest, then the rest together */
const PART = ['bg-ink', 'bg-emerald', 'bg-receivable', 'bg-muted']

/** a thin bar filled to a percentage (the server's) */
function ShareBar({ pct, tone = 'bg-ink' }: { pct: number; tone?: string }) {
  return <span className="block h-1.5 w-full overflow-hidden rounded-full bg-line"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(pct ? 2 : 0, pct))}%` }} /></span>
}

export default function StockSummaryNew() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const trade = useTrade()
  const [sp] = useSearchParams()
  // only the kinds this shop trades (ADR-109); a shop with one kind has no cards to choose from
  const cards: CardKind[] = [...(trade.mobiles ? (['phone', 'tablet', 'watch'] as const) : []), ...(trade.laptops ? (['laptop'] as const) : []), ...(trade.accessories ? (['items'] as const) : [])]
  const asked = sp.get('kind') as CardKind | null
  const kind: CardKind | null = asked && cards.includes(asked) ? asked : cards.length === 1 ? cards[0] : null
  const device = kind && kind !== 'items' ? kind : null
  const { data, isLoading } = useGet<StockSummary>(['stock-summary', device ?? ''], `/api/v1/reports/stock-summary${device ? `?category=${device}` : ''}`)
  const [open, setOpen] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('value')
  const [q, setQ] = useState('')
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const cap = ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'
  const basis = data ? `(${pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})` : ''
  const of = (k: DeviceKind) => data?.kinds?.find((x) => x.key === k) ?? { key: k, count: 0, value: '0', brands: 0, models: 0 }
  const items = data?.items
  const Next = ur ? ChevronLeft : ChevronRight
  const units = (k: DeviceKind, c: number) => t(`stock.countBy.${k}`, { n: c })
  const pct = (v: number | undefined) => `${(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

  // the brands as asked: searched by brand or model, in the order chosen (the server sends highest value first)
  const brands = useMemo(() => {
    const word = q.trim().toLowerCase()
    const hit = (data?.brands ?? []).flatMap((b) => {
      if (!word || b.name.toLowerCase().includes(word)) return [b]
      const models = b.models.filter((m) => m.name.toLowerCase().includes(word))
      return models.length ? [{ ...b, models }] : []
    })
    const key = (x: { count: number; avg?: string | number }) => (sort === 'units' ? x.count : Number(x.avg ?? 0))
    return sort === 'value' ? hit : [...hit].sort((a, b) => key(b) - key(a)).map((b) => ({ ...b, models: [...b.models].sort((a, c) => key(c) - key(a)) }))
  }, [data, q, sort])

  /** a small box inside the dark heading */
  const fact = (label: string, value: React.ReactNode, note?: React.ReactNode, testid?: string) => (
    <span className="flex min-w-0 flex-col gap-0.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5" data-testid={testid}>
      <span className={`opacity-70 ${cap}`}>{label}</span>
      <span className={`min-w-0 break-words leading-tight ${ur ? cls('md') : 'font-display text-lg font-extrabold'}`}>{value}</span>
      {note ? <span className={`opacity-70 ${small}`}>{note}</span> : null}
    </span>
  )

  const hero = (label: string, value: string | number, sub: React.ReactNode, facts: React.ReactNode) => (
    <section className="flex flex-col gap-4 rounded-3xl bg-hero p-5 text-hero-text shadow-hero lg:flex-row lg:items-center lg:justify-between lg:p-6" data-testid="stock-hero">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <BiLabel text={{ en: `${label} ${basis}`, ur: `${label} ${basis}` }} size="sm" bold tone="text-current" />
          <span className="[&_button]:text-current"><Help term="counter.stockValue" size="sm" /></span>
          {Number(value) >= 100_000 ? <span className={`rounded-full bg-white/15 px-2 py-0.5 ${small}`}><span className="num" dir="ltr">{toLakh(value)}</span> {pick('counter.lakh')}</span> : null}
        </span>
        <span className="num font-display text-[34px] font-extrabold leading-tight tracking-[-0.02em] lg:text-[42px]" dir="ltr" data-testid="stock-hero-value">{withCur(n(value))}</span>
        <span className={ur ? cls('sm') : 'text-sm font-semibold opacity-90'}>{sub}</span>
      </div>
      {facts ? <div className="grid shrink-0 grid-cols-2 gap-2 lg:flex lg:max-w-[58%] lg:[&>span]:min-w-[150px]" data-testid="stock-hero-facts">{facts}</div> : null}
    </section>
  )

  const allValue = cards.reduce((s, k) => s + Number(k === 'items' ? items?.value ?? 0 : of(k).value), 0)
  const topKind = data?.top_kind && cards.includes(data.top_kind as CardKind) ? (data.top_kind as CardKind) : null
  const topShare = topKind ? (topKind === 'items' ? items?.share : of(topKind as DeviceKind).share) : undefined
  const held = cards.filter((k) => (k === 'items' ? items?.pieces ?? 0 : of(k).count) > 0)
  const bare = cards.filter((k) => !held.includes(k))

  const kindCard = (k: CardKind, big: boolean) => {
    const Icon = ICON[k]
    const d = k === 'items' ? null : of(k)
    const count = d ? d.count : items?.pieces ?? 0
    const value = d ? d.value : items?.value ?? 0
    const share = d ? d.share : items?.share
    const countText = d ? units(k as DeviceKind, count) : pick('ssum.pieces').replace('{{n}}', String(count))
    const facts = d ? pick('ssum.brandsModels').replace('{{b}}', String(d.brands)).replace('{{m}}', String(d.models)) : pick('ssum.itemsLine').replace('{{n}}', String(items?.items ?? 0)).replace('{{low}}', String(items?.low ?? 0)).replace('{{out}}', String(items?.out ?? 0))
    if (!big) {
      return (
        <Link key={k} to={`/stock/summary?kind=${k}`} className="tap flex min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-surface p-3 text-start text-muted transition-colors hover:border-ink/40 hover:text-ink" data-testid={`kind-card-${k}`}>
          <span className="well h-9 w-9 shrink-0 rounded-xl bg-ground"><Icon size={17} strokeWidth={1.75} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`min-w-0 break-words text-ink ${ur ? cls('md') : 'text-sm font-extrabold'}`}>{pick(`stock.kind.${k}`)}</span>
            <span className={`min-w-0 break-words ${small}`}><span data-testid={`kind-card-count-${k}`}>{countText}</span> · <span className="num" dir="ltr" data-testid={`kind-card-value-${k}`}>{withCur(n(value))}</span></span>
            <span className="sr-only" data-testid={`kind-card-facts-${k}`}>{facts}</span>
          </span>
          <Next size={16} className="shrink-0" />
        </Link>
      )
    }
    return (
      <Link key={k} to={`/stock/summary?kind=${k}`} className="tap card flex min-w-0 flex-col gap-3 border-2 border-line p-4 text-start transition-colors hover:border-ink lg:p-5" data-testid={`kind-card-${k}`}>
        <span className="flex items-start gap-3">
          <span className="well h-12 w-12 shrink-0 rounded-2xl bg-hero text-hero-text"><Icon size={22} strokeWidth={1.75} /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`min-w-0 break-words ${ur ? cls('lg') : 'font-display text-xl font-extrabold tracking-[-0.01em]'}`}>{pick(`stock.kind.${k}`)}</span>
              <span className={`rounded-full bg-ground px-2 py-0.5 ${ur ? cls('sm') : 'text-xs font-bold'}`} data-testid={`kind-card-count-${k}`}>{countText}</span>
            </span>
            <span className={`min-w-0 break-words text-muted ${small}`} data-testid={`kind-card-facts-${k}`}>{facts}</span>
          </span>
          <span className="well h-9 w-9 shrink-0 rounded-full bg-ground text-ink"><Next size={18} /></span>
        </span>
        <span className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <span className="num font-display text-[28px] font-extrabold leading-none tracking-[-0.02em]" dir="ltr" data-testid={`kind-card-value-${k}`}>{withCur(n(value))}</span>
          {d?.top_brand ? <span className={`text-emerald-deep ${small}`} dir="auto">{t('ssum.top', { name: d.top_brand.name, n: d.top_brand.count })}</span> : null}
        </span>
        {share != null && cards.length > 1 ? (
          <span className="flex flex-col gap-1.5">
            <span className={`flex items-center justify-between text-muted ${small}`}><span>{pick('ssum.shareOfStock')}</span><span className="num text-ink" dir="ltr">{pct(share)}</span></span>
            <ShareBar pct={share} />
          </span>
        ) : null}
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={kind && cards.length > 1 ? `stock.kind.${kind}` : 'counter.stockTitle'}
        back={kind !== null && cards.length > 1 ? true : undefined}
        help={<Help term="counter.stockPage" />}
        right={
          <div className="flex gap-2">
            {!kind || cards.length === 1 ? <DownloadButton path="/api/v1/exports/stock-summary" name="stock-worth" /> : null}
            <Link to={kind === 'items' ? '/accessories' : device ? `/stock?category=${device}` : '/stock'} aria-label={pick('counter.seeList')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface" data-testid="summary-list">
              <ListIcon size={20} strokeWidth={1.75} />
              <BtnText k={kind ? 'ssum.seeList' : 'counter.seeList'} /></Link>
          </div>
        }
      />
      {isLoading || !data ? <Loading /> : !kind ? (
        <>
          {hero(
            pick('counter.stockWorth'),
            allValue,
            <><span className="num">{data.count}</span> {pick('counter.phones')}{trade.accessories && items ? <> · {pick('ssum.accPieces').replace('{{n}}', String(items.pieces))}</> : null}</>,
            data.count || items?.items ? (
              <>
                {data.count ? fact(pick('ssum.avgPiece'), <span className="num" dir="ltr">{withCur(n(data.avg ?? 0))}</span>, <><span className="num">{data.count}</span> {pick('counter.phones')}</>, 'hero-avg') : null}
                {topKind ? fact(pick('ssum.topKind'), pick(`stock.kind.${topKind}`), <span className="num" dir="ltr">{pct(topShare)}</span>, 'hero-top') : null}
                {trade.accessories && items?.items ? fact(pick('ssum.health'), items.low ? t('ssum.lowN', { n: items.low }) : pick('ssum.healthy'), pick('ssum.itemsN').replace('{{n}}', String(items.items)), 'hero-health') : null}
              </>
            ) : null,
          )}
          <span className="flex items-center gap-1"><BiLabel text="ssum.pick" size="sm" tone="text-muted" /><Help term="counter.stockBrands" size="sm" /></span>
          <div className="flex flex-col gap-3" data-testid="kind-cards">
            {held.length ? <div className="grid gap-3 lg:grid-cols-2">{held.map((k) => kindCard(k, true))}</div> : null}
            {bare.length ? (
              <>
                {held.length ? <span className={`text-muted ${cap}`}>{pick('ssum.emptyKinds')}</span> : null}
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">{bare.map((k) => kindCard(k, false))}</div>
              </>
            ) : null}
          </div>
        </>
      ) : kind === 'items' ? (
        <>
          {hero(pick('stock.kind.items'), items?.value ?? 0, <>{pick('ssum.pieces').replace('{{n}}', String(items?.pieces ?? 0))} · {pick('ssum.itemsLine').replace('{{n}}', String(items?.items ?? 0)).replace('{{low}}', String(items?.low ?? 0)).replace('{{out}}', String(items?.out ?? 0))}</>, null)}
          {!items?.kinds.length ? <NoStock text="ssum.none" /> : (
            <>
              <BiLabel text="ssum.tapItemKind" size="sm" tone="text-muted" />
              <div className="grid gap-2 lg:grid-cols-2" data-testid="item-kinds">
                {items.kinds.map((g) => (
                  <Link key={g.key} to={`/accessories?category=${encodeURIComponent(g.key)}`} className="tap card flex w-full flex-col gap-2 p-3.5 text-start transition-colors hover:border-ink" data-testid="item-kind-row">
                    <span className="flex items-center gap-3">
                      <span className="well h-11 w-11 shrink-0 rounded-2xl bg-ground text-ink"><Headphones size={18} /></span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={`min-w-0 break-words ${ur ? cls('md') : 'text-base font-extrabold'}`} dir="auto">{kindLabel(pick, g.key)}</span>
                        <span className={`text-muted ${small}`}>{pick('ssum.pieces').replace('{{n}}', String(g.pieces))} · {pick('ssum.itemsN').replace('{{n}}', String(g.items))}</span>
                      </span>
                      <span className="num font-display text-lg font-extrabold" dir="ltr">{n(g.value)}</span>
                      <Next size={18} className="shrink-0 text-muted" />
                    </span>
                    {g.share != null ? <ShareBar pct={g.share} tone="bg-emerald" /> : null}
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {hero(
            pick(cards.length > 1 ? `stock.kind.${kind}` : 'counter.stockWorth'),
            data.value,
            <>{units(kind as DeviceKind, data.count)}{cards.length > 1 ? <> · {pick('ssum.brandsModels').replace('{{b}}', String(of(kind as DeviceKind).brands)).replace('{{m}}', String(of(kind as DeviceKind).models))}</> : null}</>,
            data.count ? (
              <>
                {fact(pick('ssum.avgPiece'), <span className="num" dir="ltr">{withCur(n(data.avg ?? 0))}</span>, undefined, 'hero-avg')}
                {data.brands[0] ? fact(pick('ssum.topBrand'), <span dir="auto">{data.brands[0].name}</span>, <span className="num" dir="ltr">{pct(data.brands[0].share)}</span>, 'hero-top') : null}
              </>
            ) : null,
          )}
          {!data.brands.length ? <NoStock text={cards.length > 1 ? 'ssum.none' : 'counter.noStock'} /> : (
            <>
              {data.brands.length > 1 && data.brands[0].share != null ? (
                <section className="card flex flex-col gap-2.5" data-testid="brand-parts">
                  <span className={ur ? cls('md') : 'text-sm font-extrabold'}>{pick('ssum.capital')}</span>
                  <span className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                    {data.brands.slice(0, 3).map((b, i) => <span key={b.brand_id} className={`h-full ${PART[i]}`} style={{ width: `${b.share ?? 0}%` }} />)}
                    {data.brands.length > 3 ? <span className={`h-full flex-1 ${PART[3]}`} /> : null}
                  </span>
                  <span className={`flex flex-wrap gap-x-4 gap-y-1 text-muted ${small}`}>
                    {data.brands.slice(0, 3).map((b, i) => <span key={b.brand_id} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${PART[i]}`} /><span dir="auto">{b.name}</span> <span className="num text-ink" dir="ltr">{pct(b.share)}</span></span>)}
                    {data.brands.length > 3 ? <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${PART[3]}`} />{t('ssum.others', { n: data.brands.length - 3 })}</span> : null}
                  </span>
                </section>
              ) : null}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="ssum.search" /></div>
                <Pills segmented label="ssum.sortBy" value={sort} onChange={setSort} testid="brand-sort" options={[{ value: 'value', label: 'ssum.sort.value', testid: 'sort-value' }, { value: 'units', label: 'ssum.sort.units', testid: 'sort-units' }, { value: 'avg', label: 'ssum.sort.avg', testid: 'sort-avg' }]} />
              </div>
              <span className="flex items-center gap-1"><BiLabel text="counter.tapBrand" size="sm" tone="text-muted" /><Help term="counter.stockBrands" size="sm" /></span>
              {!brands.length ? <Empty text="ssum.noMatch" /> : (
                <div className="flex flex-col gap-2" data-testid="summary-brands">
                  {brands.map((b) => {
                    const isOpen = open === b.brand_id || (!!q.trim() && brands.length <= 3)
                    return (
                      <div key={b.brand_id} className={`card overflow-hidden p-0 ${isOpen ? 'border-ink' : ''}`}>
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(open === b.brand_id ? null : b.brand_id)} className="tap flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-start">
                          <span className="well h-11 w-11 shrink-0 rounded-2xl bg-ground text-sm font-extrabold text-ink" dir="ltr">{b.name.slice(0, 2).toUpperCase()}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={`truncate ${ur ? 'text-base font-extrabold' : 'font-display text-base font-extrabold'}`} dir="auto">{b.name}</span>
                            <span className={`text-muted ${small}`}>{units(kind as DeviceKind, b.count)}{b.avg != null ? <> · {t('ssum.avg', { v: withCur(n(b.avg)) })}</> : null}</span>
                          </span>
                          {b.share != null ? (
                            <span className="hidden w-[30%] flex-col gap-1 lg:flex">
                              <span className={`flex justify-between text-muted ${small}`}><span>{pick('ssum.shareOfKind')}</span><span className="num text-ink" dir="ltr">{pct(b.share)}</span></span>
                              <ShareBar pct={b.share} />
                            </span>
                          ) : null}
                          <span className="num font-display text-lg font-extrabold" dir="ltr">{n(b.value)}</span>
                          <span className="well h-8 w-8 shrink-0 rounded-full bg-ground text-muted"><ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /></span>
                        </button>
                        {isOpen ? (
                          <div className="grid gap-2 border-t border-line bg-ground/60 p-3 lg:grid-cols-2">
                            {b.models.map((m) => (
                              <Link key={m.model_id} to={`/stock?model_id=${m.model_id}&model=${encodeURIComponent(m.name)}&category=${kind}`} className="tap flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-ink">
                                <span className="flex items-start gap-3">
                                  <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="min-w-0 break-words text-sm font-bold" dir="auto">{m.name}</span>
                                    <span className={`text-muted ${small}`}>{units(kind as DeviceKind, m.count)}{m.avg != null ? <> · {t('ssum.avg', { v: withCur(n(m.avg)) })}</> : null}</span>
                                  </span>
                                  <span className="flex shrink-0 flex-col items-end">
                                    <span className="num text-[15px] font-extrabold" dir="ltr">{n(m.value)}</span>
                                    {m.share != null ? <span className={`text-muted ${small}`}>{t('ssum.ofBrand', { p: (m.share ?? 0).toLocaleString('en-US', { maximumFractionDigits: 1 }), name: b.name })}</span> : null}
                                  </span>
                                </span>
                                {m.share != null ? <ShareBar pct={m.share} tone="bg-emerald" /> : null}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
      {!kind || cards.length === 1 ? (
        <>
          <span className={`mt-1 text-muted ${cap}`}>{pick('ssum.sheets')}</span>
          {/* owner 2026-11-14 (ADR-075): print every phone to count the stock by hand */}
          <TallySheetCard />
          {/* owner 2026-11-18 (ADR-103): the stock in hand item wise — quantity, price of one, cost */}
          <section className="card flex items-center justify-between gap-3" data-testid="stock-items-card">
            <span className="flex min-w-0 flex-col"><BiLabel text="ledgerRep.stockTitle" size="md" bold /><BiLabel text="ledgerRep.stockHint" size="sm" tone="text-muted" /></span>
            <DownloadButton path="/api/v1/exports/stock-cost" name="stock-item-wise" />
          </section>
        </>
      ) : null}
    </div>
  )
}

/** nothing of this kind: say so, and offer the way to put some in */
function NoStock({ text }: { text: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className="flex flex-col items-center gap-3">
      <Empty text={text} />
      <Link to="/purchase/new" className={`tap flex min-h-12 items-center gap-2 rounded-2xl bg-ink px-5 font-bold text-ground ${ur ? cls('md') : 'text-sm'}`} data-testid="summary-add">
        <PackagePlus size={18} /> {pick('ssum.addStock')}
      </Link>
    </div>
  )
}
