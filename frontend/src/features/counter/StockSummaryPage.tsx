/** "What is my stock worth?" — total, then brand rows that open into their models. */

import { ChevronDown, List as ListIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { BtnText, Empty, Loading, PageHeader } from '@/components/ui'
import { toLakh } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { StockSummary } from '@/lib/types'

const n = (v: string | number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function StockSummaryPage() {
  const { pick, ur, cls } = useLang()
  const { data, isLoading } = useGet<StockSummary>(['stock-summary'], '/api/v1/reports/stock-summary')
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="counter.stockTitle"
        right={
          <Link to="/stock" aria-label={pick('counter.seeList')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
            <ListIcon size={20} strokeWidth={1.75} />
          <BtnText k={'counter.seeList'} /></Link>
        }
      />
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="flex flex-col rounded-3xl bg-stockt px-5 py-4 text-stockt-fg">
            <BiLabel text={{ en: `${pick('counter.stockWorth')} (${pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})`, ur: `${pick('counter.stockWorth')} (${pick(data.basis === 'cost' ? 'counter.worthCost' : 'counter.worthAsking')})` }} size="sm" bold tone="text-current" />
            <span className="num text-[34px] leading-tight" dir="ltr">Rs. {n(data.value)}</span>
            <span className={ur ? cls('sm') : 'text-sm font-semibold'}>
              <span className="num">{data.count}</span> {pick('counter.phones')}
              {Number(data.value) >= 100_000 ? <> · <span className="num">{toLakh(data.value)}</span> {pick('counter.lakh')}</> : null}
            </span>
          </section>

          {!data.brands.length ? <Empty text="counter.noStock" /> : (
            <>
              <BiLabel text="counter.tapBrand" size="sm" tone="text-muted" />
              <div className="card divide-y divide-line p-0">
                {data.brands.map((b) => {
                  const isOpen = open === b.brand_id
                  return (
                    <div key={b.brand_id}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.brand_id)} className={`tap flex w-full items-center gap-3 px-4 py-3 text-start ${isOpen ? 'bg-stockt/40' : ''}`}>
                        <span className="well h-11 w-11 shrink-0 bg-stockt text-sm font-extrabold text-stockt-fg">{b.name.slice(0, 2).toUpperCase()}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-extrabold">{b.name}</span>
                          <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}><span className="num">{b.count}</span> {pick('counter.phones')}</span>
                        </span>
                        <span className="num text-lg" dir="ltr">{n(b.value)}</span>
                        <ChevronDown size={18} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen ? (
                        <div className="bg-stockt/20 px-4 pb-2">
                          {b.models.map((m) => (
                            <Link key={m.model_id} to={`/stock?q=${encodeURIComponent(m.name)}`} className="flex items-center gap-3 border-t border-dashed border-line py-2.5">
                              <span className="min-w-0 flex-1 truncate text-sm font-bold">{m.name}</span>
                              <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}><span className="num">{m.count}</span> {pick('counter.phones')}</span>
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
    </div>
  )
}
