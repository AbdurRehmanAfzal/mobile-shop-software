/** Choosing what to pay for (owner 2026-11-17, ADR-095): the packages with their fee, the modules a
 *  shop can add, extra services, and for how long — 1 month or 1 to 5 years, cheaper by the year.
 *  Every figure comes from the server's quote; the package itself changes only when the provider
 *  confirms the payment. */

import { BadgePercent, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, Section, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'

interface Pack { key: string; price: string; list_price?: string; deal?: boolean; deal_months_left?: number | null; modules: string[]; current: boolean }
interface Mod { key: string; en: string; ur: string; price: string; list_price?: string }
interface Addon { i: number; en: string; ur: string; roman: string; price: number; per: 'month' | 'year' | 'once' }
interface Term { months: number; years: number; discount_pct: number }
interface Catalog { current: { plan: string; modules: string[]; monthly_fee: string }; packages: Pack[]; modules: Mod[]; addons: Addon[]; durations: Term[]; sale?: { pct: number; until: string | null } | null; deal?: { plan: string; price: string; months_left: number | null; note: string | null } | null }
export interface OrderIn { plan: string; modules: string[]; addons: number[]; months: number }
export interface Quote { plan: string; months: number; years: number; discount_pct: number; monthly: string; per_month?: string; saved?: string; deal_months?: number; recurring: string; discount: string; once: string; total: string; extras: string[]; modules: string[] }

const rs = (v: string | number) => withCur(Number(v).toLocaleString('en-US'))

export default function PackagePicker({ owed, onChange }: { owed: number; onChange: (order: OrderIn | null, quote: Quote | null) => void }) {
  const { pick, ur, roman, cls } = useLang()
  const { data: cat } = useGet<Catalog>(['fee-catalog'], '/api/v1/fees/catalog')
  const [plan, setPlan] = useState<string | null>(null)
  const [extras, setExtras] = useState<string[]>([])
  const [addons, setAddons] = useState<number[]>([])
  const [months, setMonths] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  // a shop with a special price opens on that package (ADR-098)
  const chosen = plan ?? cat?.deal?.plan ?? cat?.packages.find((p) => p.current)?.key ?? cat?.packages[0]?.key ?? null
  const pack = cat?.packages.find((p) => p.key === chosen)
  const picked = extras.filter((k) => !pack?.modules.includes(k))
  const key = chosen ? `${chosen}|${picked.join(',')}|${addons.join(',')}|${months}` : ''

  useEffect(() => {
    if (!chosen) return
    let stale = false
    const order: OrderIn = { plan: chosen, modules: picked, addons, months }
    api<Quote>('POST', '/api/v1/fees/quote', order)
      .then((q) => { if (!stale) { setQuote(q); onChange(order, q) } })
      .catch(() => { if (!stale) { setQuote(null); onChange(null, null) } })
    return () => { stale = true }
    // the selection as one string: a new quote only when it really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!cat || !pack) return null
  const modName = (m: Mod) => { const t = pick(`modules.${m.key}`); return t === `modules.${m.key}` ? (ur ? m.ur : m.en) : t }
  const addName = (a: Addon) => (ur ? a.ur : roman ? a.roman : '') || a.en
  const buyable = cat.modules.filter((m) => !pack.modules.includes(m.key) && Number(m.price) > 0)
  const term = (d: Term) => (d.years ? pick(d.years === 1 ? 'fees.pick.year' : 'fees.pick.years').replace('{{n}}', String(d.years)) : pick('fees.pick.month1'))
  const tick = (on: boolean) => <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-emerald bg-emerald text-white' : 'border-line bg-surface'}`}>{on ? <Check size={15} /> : null}</span>
  const row = (id: string, on: boolean, name: string, price: string, toggle: () => void) => (
    <button key={id} type="button" role="checkbox" aria-checked={on} onClick={toggle} className="tap flex min-h-12 items-center gap-3 px-4 py-2 text-start" data-testid={`pick-${id}`}>
      {tick(on)}
      <span className={`min-w-0 flex-1 ${ur ? cls('md') : 'text-[15px] font-semibold'}`}>{name}</span>
      <span className="num shrink-0 text-sm font-bold text-muted" dir="ltr">{price}</span>
    </button>
  )

  return (
    <Section title="fees.pick.title" help="fees.pick">
      {cat.deal ? (() => { const dp = cat.packages.find((p) => p.key === cat.deal!.plan); return (
        <div className="flex flex-col gap-1 rounded-3xl bg-emerald-tint p-4 text-emerald-deep" data-testid="pick-deal">
          <span className="flex items-center gap-2"><BadgePercent size={20} /><BiLabel text="fees.pick.deal.title" size="md" bold tone="text-current" /></span>
          <span className={ur ? cls('sm') : 'text-sm font-semibold'}>{pick('fees.pick.deal.text').replace('{{pkg}}', pick(`fees.pick.pkg.${cat.deal.plan}`)).replace('{{price}}', rs(cat.deal.price)).replace('{{list}}', rs(dp?.list_price ?? 0))} {cat.deal.months_left == null ? pick('fees.pick.deal.noEnd') : pick('fees.pick.deal.months').replace('{{n}}', String(cat.deal.months_left))}</span>
          {cat.deal.note ? <span className={ur ? cls('sm') : 'text-sm'}>{cat.deal.note}</span> : null}
        </div>
      ) })() : null}
      {cat.sale ? <div className={`rounded-2xl bg-gold/15 px-4 py-2.5 font-bold text-gold-text ${ur ? cls('sm') : 'text-sm'}`} data-testid="pick-sale">{pick('fees.pick.sale').replace('{{n}}', String(cat.sale.pct))}{cat.sale.until ? ` · ${pick('fees.pick.saleUntil').replace('{{date}}', fmtDate(cat.sale.until))}` : ''}</div> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="pick-packages">
        {cat.packages.map((p) => {
          const on = p.key === chosen
          return (
            <button key={p.key} type="button" aria-pressed={on} onClick={() => setPlan(p.key)} data-testid={`pick-pkg-${p.key}`}
              className={`tap flex flex-col gap-1 rounded-3xl border-2 p-4 text-start ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={ur ? cls('lg') : 'text-lg font-extrabold'}>{pick(`fees.pick.pkg.${p.key}`)}</span>
                {p.current ? <span className={`rounded-full px-2 py-0.5 ${on ? 'bg-ground/20' : 'bg-emerald-tint text-emerald-deep'} ${small}`}>{pick('fees.pick.yours')}</span> : null}
              </span>
              {p.list_price && Number(p.list_price) > Number(p.price) ? <span className="num text-sm line-through opacity-60" dir="ltr" data-testid={`pick-list-${p.key}`}>{rs(p.list_price)}</span> : null}
              <span className="flex items-baseline gap-1"><span className="num text-2xl font-extrabold" dir="ltr">{rs(p.price)}</span><span className={`opacity-70 ${small}`}>{pick('fees.pick.perMonth')}</span></span>
              <span className={`opacity-70 ${small}`}>{pick('fees.pick.modCount').replace('{{n}}', String(p.modules.length))}</span>
            </button>
          )
        })}
      </div>

      <div className="card flex flex-col gap-2" data-testid="pick-included">
        <BiLabel text="fees.pick.included" size="sm" bold tone="text-muted" />
        <BiLabel text="fees.pick.basics" size="sm" tone="text-muted" />
        <div className="flex flex-wrap gap-1.5">
          {cat.modules.filter((m) => pack.modules.includes(m.key)).map((m) => (
            <span key={m.key} className={`flex items-center gap-1 rounded-full bg-emerald-tint px-2.5 py-1 text-emerald-deep ${small}`}><Check size={13} />{modName(m)}</span>
          ))}
        </div>
      </div>

      {buyable.length ? (
        <>
          <BiLabel text="fees.pick.addModules" size="sm" bold tone="text-muted" />
          <div className="card flex flex-col divide-y divide-line p-0">
            {buyable.map((m) => row(`mod-${m.key}`, extras.includes(m.key), modName(m), `+ ${rs(m.price)} ${pick('fees.pick.perMonth')}`, () => setExtras((x) => (x.includes(m.key) ? x.filter((k) => k !== m.key) : [...x, m.key]))))}
          </div>
        </>
      ) : null}

      {cat.addons.length ? (
        <>
          <BiLabel text="fees.pick.services" size="sm" bold tone="text-muted" />
          <div className="card flex flex-col divide-y divide-line p-0">
            {cat.addons.map((a) => row(`addon-${a.i}`, addons.includes(a.i), addName(a), `+ ${rs(a.price)} / ${pick(`landing.per.${a.per}`)}`, () => setAddons((x) => (x.includes(a.i) ? x.filter((k) => k !== a.i) : [...x, a.i].sort((p, q) => p - q)))))}
          </div>
        </>
      ) : null}

      <span className="flex items-center gap-1"><BiLabel text="fees.pick.duration" size="sm" bold tone="text-muted" /><Help term="fees.pick.duration" size="sm" /></span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="pick-durations">
        {cat.durations.map((d) => {
          const on = d.months === months
          return (
            <button key={d.months} type="button" aria-pressed={on} onClick={() => setMonths(d.months)} data-testid={`pick-term-${d.months}`}
              className={`tap flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 px-2 ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
              <span className={ur ? cls('md') : 'text-[15px] font-bold'}>{term(d)}</span>
              {d.discount_pct ? <span className={`${on ? 'text-ground/80' : 'text-emerald-deep'} ${small}`}>{pick('fees.pick.off').replace('{{n}}', String(d.discount_pct))}</span> : null}
            </button>
          )
        })}
      </div>

      {quote ? (
        <div className="card flex flex-col gap-1.5" data-testid="pick-summary">
          <Line k={pick('fees.pick.sum.monthly')} v={rs(quote.per_month ?? quote.monthly)} />
          <Line k={`${term({ months: quote.months, years: quote.years, discount_pct: 0 })}`} v={rs(quote.recurring)} />
          {Number(quote.discount) ? <Line k={pick('fees.pick.sum.discount').replace('{{n}}', String(quote.discount_pct))} v={`− ${rs(quote.discount)}`} tone="text-emerald-deep" testid="pick-discount" /> : null}
          {Number(quote.saved ?? 0) ? <Line k={pick('fees.pick.sum.saved')} v={rs(quote.saved ?? 0)} tone="text-emerald-deep" testid="pick-saved" /> : null}
          {quote.deal_months && quote.deal_months < quote.months ? <span className={`text-muted ${small}`}>{pick('fees.pick.sum.dealPart').replace('{{n}}', String(quote.deal_months))}</span> : null}
          {Number(quote.once) ? <Line k={pick('fees.pick.sum.once')} v={rs(quote.once)} /> : null}
          {owed > 0 ? <Line k={pick('fees.pick.sum.owed')} v={rs(owed)} tone="text-payable" /> : null}
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-2">
            <BiLabel text="fees.pick.sum.total" size="md" bold />
            <span className="num text-2xl font-extrabold" dir="ltr" data-testid="pick-total">{rs(Number(quote.total) + owed)}</span>
          </div>
          {quote.plan !== cat.current.plan || quote.extras.length ? <Chip text="fees.pick.onConfirm" tone="muted" /> : null}
        </div>
      ) : null}
    </Section>
  )
}

function Line({ k, v, tone = 'text-ink', testid }: { k: string; v: string; tone?: string; testid?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{k}</span>
      <span className={`num font-bold ${tone}`} dir="ltr" data-testid={testid}>{v}</span>
    </div>
  )
}
