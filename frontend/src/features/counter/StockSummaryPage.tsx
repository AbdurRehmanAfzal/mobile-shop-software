/** "What is my stock worth?" — owner 2026-11-22 (ADR-131): a card per kind of stock (mobiles,
 *  tablets, watches, laptops, accessories) with its pieces, worth, brands and models; a card opens
 *  that kind — brand rows that open into their models, a model opens those pieces in the stock
 *  list. Every figure is the server's (`GET /reports/stock-summary`); nothing is added up here
 *  except the heading's total of the cards shown. */

import DownloadButton from '@/components/DownloadButton'
import TallySheetCard from '@/features/stock/TallySheetCard'
import { ChevronDown, ChevronLeft, ChevronRight, Headphones, Laptop, List as ListIcon, Smartphone, Tablet, Watch } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { kindLabel } from '@/components/ItemKinds'
import { BtnText, Empty, Loading, PageHeader } from '@/components/ui'
import { toLakh, withCur } from '@/lib/format'
import { useTrade } from '@/lib/modules'
import { useGet } from '@/lib/queries'
import type { StockSummary } from '@/lib/types'

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

type DeviceKind = 'phone' | 'tablet' | 'watch' | 'laptop'
type CardKind = DeviceKind | 'items'
const ICON: Record<CardKind, typeof Smartphone> = { phone: Smartphone, tablet: Tablet, watch: Watch, laptop: Laptop, items: Headphones }

export default function StockSummaryPage() {
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
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const basis = data ? `(${pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})` : ''
  const of = (k: DeviceKind) => data?.kinds?.find((x) => x.key === k) ?? { key: k, count: 0, value: '0', brands: 0, models: 0 }
  const items = data?.items
  const Next = ur ? ChevronLeft : ChevronRight
  const units = (k: DeviceKind, c: number) => t(`stock.countBy.${k}`, { n: c })

  const hero = (label: string, value: string | number, sub: React.ReactNode) => (
    <section className="flex flex-col rounded-3xl bg-stockt px-5 py-4 text-stockt-fg" data-testid="stock-hero">
      <span className="flex items-center gap-1"><BiLabel text={{ en: `${label} ${basis}`, ur: `${label} ${basis}` }} size="sm" bold tone="text-current" /><span className="[&_button]:text-current"><Help term="counter.stockValue" size="sm" /></span></span>
      <span className="num text-[34px] leading-tight" dir="ltr" data-testid="stock-hero-value">{withCur(n(value))}</span>
      <span className={ur ? cls('sm') : 'text-sm font-semibold'}>
        {sub}
        {Number(value) >= 100_000 ? <> · <span className="num">{toLakh(value)}</span> {pick('counter.lakh')}</> : null}
      </span>
    </section>
  )

  return (
    <div className="flex flex-col gap-3">
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
            cards.reduce((s, k) => s + Number(k === 'items' ? items?.value ?? 0 : of(k).value), 0),
            <><span className="num">{data.count}</span> {pick('counter.phones')}{trade.accessories && items ? <> · {pick('ssum.accPieces').replace('{{n}}', String(items.pieces))}</> : null}</>,
          )}
          <span className="flex items-center gap-1"><BiLabel text="ssum.pick" size="sm" tone="text-muted" /><Help term="counter.stockBrands" size="sm" /></span>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="kind-cards">
            {cards.map((k) => {
              const Icon = ICON[k]
              const d = k === 'items' ? null : of(k)
              const count = d ? d.count : items?.pieces ?? 0
              const value = d ? d.value : items?.value ?? 0
              return (
                <Link key={k} to={`/stock/summary?kind=${k}`} className={`tap card flex min-w-0 flex-col gap-1 border-2 border-line p-3 text-start ${count ? '' : 'opacity-60'}`} data-testid={`kind-card-${k}`}>
                  {/* the name on its own line: "Smartwatches" does not fit beside the icon on a phone */}
                  <span className="flex items-center justify-between gap-2">
                    <span className="well h-10 w-10 shrink-0 rounded-2xl bg-stockt text-stockt-fg"><Icon size={20} strokeWidth={1.75} /></span>
                    <Next size={18} className="shrink-0 text-muted" />
                  </span>
                  <span className={`min-w-0 break-words ${ur ? cls('md') : 'text-[15px] font-extrabold'}`}>{pick(`stock.kind.${k}`)}</span>
                  <span className={`min-w-0 break-words ${ur ? cls('md') : 'text-base font-extrabold'}`} data-testid={`kind-card-count-${k}`}>{d ? units(k as DeviceKind, count) : pick('ssum.pieces').replace('{{n}}', String(count))}</span>
                  <span className="num min-w-0 break-words text-lg leading-tight" dir="ltr" data-testid={`kind-card-value-${k}`}>{withCur(n(value))}</span>
                  <span className={`min-w-0 break-words text-muted ${small}`} data-testid={`kind-card-facts-${k}`}>
                    {d ? pick('ssum.brandsModels').replace('{{b}}', String(d.brands)).replace('{{m}}', String(d.models)) : pick('ssum.itemsLine').replace('{{n}}', String(items?.items ?? 0)).replace('{{low}}', String(items?.low ?? 0)).replace('{{out}}', String(items?.out ?? 0))}
                  </span>
                </Link>
              )
            })}
          </div>
        </>
      ) : kind === 'items' ? (
        <>
          {hero(pick('stock.kind.items'), items?.value ?? 0, <>{pick('ssum.pieces').replace('{{n}}', String(items?.pieces ?? 0))} · {pick('ssum.itemsLine').replace('{{n}}', String(items?.items ?? 0)).replace('{{low}}', String(items?.low ?? 0)).replace('{{out}}', String(items?.out ?? 0))}</>)}
          {!items?.kinds.length ? <Empty text="ssum.none" /> : (
            <>
              <BiLabel text="ssum.tapItemKind" size="sm" tone="text-muted" />
              <div className="card divide-y divide-line p-0" data-testid="item-kinds">
                {items.kinds.map((g) => (
                  <Link key={g.key} to={`/accessories?category=${encodeURIComponent(g.key)}`} className="tap flex w-full items-center gap-3 px-4 py-3 text-start" data-testid="item-kind-row">
                    <span className="well h-11 w-11 shrink-0 bg-stockt text-sm font-extrabold text-stockt-fg"><Headphones size={18} /></span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`min-w-0 break-words ${ur ? cls('md') : 'text-base font-extrabold'}`} dir="auto">{kindLabel(pick, g.key)}</span>
                      <span className={`text-muted ${small}`}>{pick('ssum.pieces').replace('{{n}}', String(g.pieces))} · {pick('ssum.itemsN').replace('{{n}}', String(g.items))}</span>
                    </span>
                    <span className="num text-lg" dir="ltr">{n(g.value)}</span>
                    <Next size={18} className="shrink-0 text-muted" />
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {hero(pick(cards.length > 1 ? `stock.kind.${kind}` : 'counter.stockWorth'), data.value, <>{units(kind as DeviceKind, data.count)}{cards.length > 1 ? <> · {pick('ssum.brandsModels').replace('{{b}}', String(of(kind as DeviceKind).brands)).replace('{{m}}', String(of(kind as DeviceKind).models))}</> : null}</>)}
          {!data.brands.length ? <Empty text={cards.length > 1 ? 'ssum.none' : 'counter.noStock'} /> : (
            <>
              <span className="flex items-center gap-1"><BiLabel text="counter.tapBrand" size="sm" tone="text-muted" /><Help term="counter.stockBrands" size="sm" /></span>
              <div className="card divide-y divide-line p-0" data-testid="summary-brands">
                {data.brands.map((b) => {
                  const isOpen = open === b.brand_id
                  return (
                    <div key={b.brand_id}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.brand_id)} className={`tap flex w-full items-center gap-3 px-4 py-3 text-start ${isOpen ? 'bg-stockt/40' : ''}`}>
                        <span className="well h-11 w-11 shrink-0 bg-stockt text-sm font-extrabold text-stockt-fg">{b.name.slice(0, 2).toUpperCase()}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-extrabold">{b.name}</span>
                          <span className={`text-muted ${small}`}>{units(kind as DeviceKind, b.count)}</span>
                        </span>
                        <span className="num text-lg" dir="ltr">{n(b.value)}</span>
                        <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen ? (
                        <div className="bg-stockt/20 px-4 pb-2">
                          {b.models.map((m) => (
                            <Link key={m.model_id} to={`/stock?model_id=${m.model_id}&model=${encodeURIComponent(m.name)}&category=${kind}`} className="flex items-center gap-3 border-t border-dashed border-line py-2.5">
                              <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.name}</span>
                              <span className={`text-muted ${small}`}>{units(kind as DeviceKind, m.count)}</span>
                              <span className="num min-w-[84px] text-end text-[15px]" dir="ltr">{n(m.value)}</span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
      {!kind || cards.length === 1 ? (
        <>
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
