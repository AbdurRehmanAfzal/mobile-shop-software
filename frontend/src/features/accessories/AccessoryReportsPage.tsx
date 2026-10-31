/** Item reports (owner addendum 5, docs/24 §C): low stock by supplier with a ready order, stock
 *  value at cost and at sale price, fast / slow movers, profit by category or brand, dead stock,
 *  supplier-wise purchases — and the bulk price change. Owner / manager only (they see cost). */

import { Percent } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { KindChooser, kindLabel } from '@/components/ItemKinds'
import { Empty, ErrorText, fmtDate, Loading, MoneyText, PageHeader, Sheet } from '@/components/ui'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

type Tab = 'low' | 'value' | 'movers' | 'profit' | 'dead' | 'suppliers'
interface LowLine { id: string; sku: string; name: string; qty: number; reorder_level: number; suggest_qty: number; last_cost: string | null; unit: string }
interface Low { count: number; groups: { party_id: string | null; party_name: string | null; lines: LowLine[]; estimated_cost: string }[] }
interface Valuation { items: number; units: number; cost: string; retail: string; expected_profit: string; by_category: { category: string; items: number; units: number; cost: string; retail: string }[] }
interface Mover { id: string; sku: string; name: string; category: string; brand: string | null; qty: number; sold: number; revenue: string; profit: string | null; days_of_cover: number | null }
interface Movers { from: string; to: string; fast: Mover[]; slow: Mover[] }
interface ProfitRow { key: string; units: number; revenue: string; cost: string; profit: string }
interface Dead { id: string; sku: string; name: string; category: string; qty: number; value: string; last_sold: string | null; days: number | null }
interface Sup { party_id: string | null; party_name: string | null; bills: number; units: number; amount: string }

const isoDay = (ago: number) => { const d = new Date(); d.setDate(d.getDate() - ago); return d.toISOString().slice(0, 10) }

export default function AccessoryReportsPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('low')
  const [from, setFrom] = useState(isoDay(29))
  const [to, setTo] = useState(isoDay(0))
  const [group, setGroup] = useState<'category' | 'brand'>('category')
  const [days, setDays] = useState('60')
  const qs = `?date_from=${from}&date_to=${to}`
  const { data: low } = useGet<Low>(['r-item-low'], tab === 'low' ? '/api/v1/accessories/reports/low-stock' : null)
  const { data: val } = useGet<Valuation>(['r-item-val'], tab === 'value' ? '/api/v1/accessories/reports/valuation' : null)
  const { data: mov } = useGet<Movers>(['r-item-mov', from, to], tab === 'movers' ? `/api/v1/accessories/reports/movers${qs}` : null)
  const { data: prof } = useGet<ProfitRow[]>(['r-item-prof', from, to, group], tab === 'profit' ? `/api/v1/accessories/reports/profit${qs}&group=${group}` : null)
  const { data: dead } = useGet<Dead[]>(['r-item-dead', days], tab === 'dead' ? `/api/v1/accessories/reports/dead-stock?days=${Number(days) || 60}` : null)
  const { data: sup } = useGet<Sup[]>(['r-item-sup', from, to], tab === 'suppliers' ? `/api/v1/accessories/reports/suppliers${qs}` : null)
  const [bulk, setBulk] = useState(false)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const dated = tab === 'movers' || tab === 'profit' || tab === 'suppliers'
  const open = (id: string) => nav(`/accessories/${id}`)

  const Line = ({ title, sub, right, onClick }: { title: string; sub?: string; right: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 py-2 text-start first:pt-0 last:pb-0 disabled:cursor-default">
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{title}</div>{sub ? <div className={`text-muted ${small}`} dir="ltr">{sub}</div> : null}</div>
      <div className="flex shrink-0 flex-col items-end">{right}</div>
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="acc.reports" right={<button type="button" onClick={() => setBulk(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1" data-testid="bulk-price"><Percent size={20} /><span className={small}>{pick('acc.bulkPrice')}</span></button>} />
      <BiSegmented<Tab> value={tab} onChange={setTab} options={[{ value: 'low', text: 'acc.r.low' }, { value: 'value', text: 'acc.r.valuation' }, { value: 'movers', text: 'acc.r.movers' }, { value: 'profit', text: 'acc.r.profit' }, { value: 'dead', text: 'acc.r.dead' }, { value: 'suppliers', text: 'acc.r.suppliers' }]} />
      {dated ? (
        <div className="grid grid-cols-2 gap-2">
          <BiInput label="report.from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
          <BiInput label="report.to" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </div>
      ) : null}

      {tab === 'low' ? (
        !low ? <Loading /> : !low.count ? <Empty text="acc.none" /> : (
          <div className="flex flex-col gap-3" data-testid="r-low">
            <BiLabel text="acc.r.lowHint" size="sm" tone="text-muted" />
            {low.groups.map((g) => (
              <section key={g.party_id ?? 'none'} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" disabled={!g.party_id} onClick={() => nav(`/parties/${g.party_id}`)} className="truncate text-start text-base font-extrabold">{g.party_name ?? pick('acc.r.noSupplier')}</button>
                  <span className="flex flex-col items-end"><span className={`text-muted ${small}`}>{pick('acc.r.estimate')}</span><MoneyText value={g.estimated_cost} tone="ink" /></span>
                </div>
                <div className="flex flex-col divide-y divide-line">
                  {g.lines.map((l) => <Line key={l.id} title={l.name} sub={`${l.sku} · ${pick('acc.qty')} ${l.qty} / ${l.reorder_level}`} right={<><span className="num text-sm" dir="ltr">{pick('acc.r.suggest')} {l.suggest_qty}</span><MoneyText value={l.last_cost} tone="muted" size="sm" /></>} onClick={() => open(l.id)} />)}
                </div>
              </section>
            ))}
          </div>
        )
      ) : null}

      {tab === 'value' ? (
        !val ? <Loading /> : (
          <div className="flex flex-col gap-3" data-testid="r-value">
            <div className="hero grid grid-cols-3 gap-2 px-5 py-4">
              <div className="flex flex-col"><span className={`opacity-80 ${small}`}>{pick('acc.r.atCost')}</span><span className="num text-lg" dir="ltr">{Number(val.cost).toLocaleString('en-US')}</span></div>
              <div className="flex flex-col"><span className={`opacity-80 ${small}`}>{pick('acc.r.atRetail')}</span><span className="num text-lg" dir="ltr">{Number(val.retail).toLocaleString('en-US')}</span></div>
              <div className="flex flex-col"><span className={`opacity-80 ${small}`}>{pick('acc.r.expected')}</span><span className="num text-lg text-gold-text" dir="ltr">{Number(val.expected_profit).toLocaleString('en-US')}</span></div>
            </div>
            <div className={`text-muted ${small}`} dir="ltr">{val.items} {pick('acc.r.items')} · {val.units} {pick('acc.r.units')}</div>
            <div className="card flex flex-col divide-y divide-line">
              {val.by_category.map((c) => <Line key={c.category} title={kindLabel(pick, c.category)} sub={`${c.items} ${pick('acc.r.items')} · ${c.units} ${pick('acc.r.units')}`} right={<><MoneyText value={c.cost} tone="ink" /><MoneyText value={c.retail} tone="muted" size="sm" /></>} />)}
            </div>
          </div>
        )
      ) : null}

      {tab === 'movers' ? (
        !mov ? <Loading /> : (
          <div className="flex flex-col gap-3" data-testid="r-movers">
            <BiLabel text="acc.r.fast" size="sm" tone="text-muted" bold />
            {!mov.fast.length ? <Empty text="acc.none" /> : <div className="card flex flex-col divide-y divide-line">{mov.fast.map((m) => <Line key={m.id} title={m.name} sub={`${m.sku} · ${pick('acc.qty')} ${m.qty}${m.days_of_cover != null ? ` · ${m.days_of_cover} ${pick('acc.daysCover')}` : ''}`} right={<><span className="num text-sm" dir="ltr">{pick('acc.sold')} {m.sold}</span>{m.profit != null ? <MoneyText value={m.profit} size="sm" /> : null}</>} onClick={() => open(m.id)} />)}</div>}
            <BiLabel text="acc.r.slow" size="sm" tone="text-muted" bold />
            {!mov.slow.length ? <Empty text="acc.none" /> : <div className="card flex flex-col divide-y divide-line">{mov.slow.map((m) => <Line key={m.id} title={m.name} sub={`${m.sku} · ${pick('acc.qty')} ${m.qty}`} right={<span className="num text-sm" dir="ltr">{pick('acc.sold')} {m.sold}</span>} onClick={() => open(m.id)} />)}</div>}
          </div>
        )
      ) : null}

      {tab === 'profit' ? (
        <div className="flex flex-col gap-3" data-testid="r-profit">
          <BiSegmented<'category' | 'brand'> value={group} onChange={setGroup} options={[{ value: 'category', text: 'acc.r.byCategory' }, { value: 'brand', text: 'acc.r.byBrand' }]} />
          {!prof ? <Loading /> : !prof.length ? <Empty text="acc.none" /> : (
            <div className="card flex flex-col divide-y divide-line">
              {prof.map((p) => <Line key={p.key} title={group === 'category' ? kindLabel(pick, p.key) : p.key} sub={`${p.units} ${pick('acc.r.units')} · ${pick('report.sales')} ${Number(p.revenue).toLocaleString('en-US')}`} right={<MoneyText value={p.profit} />} />)}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'dead' ? (
        <div className="flex flex-col gap-3" data-testid="r-dead">
          <BiInput label="acc.r.notSoldFor" type="number" inputMode="numeric" min={7} max={730} value={days} onChange={(e) => setDays(e.target.value)} className="num" hint="acc.r.days" />
          {!dead ? <Loading /> : !dead.length ? <Empty text="acc.none" /> : (
            <div className="card flex flex-col divide-y divide-line">
              {dead.map((d) => <Line key={d.id} title={d.name} sub={`${d.sku} · ${pick('acc.qty')} ${d.qty} · ${pick('acc.r.lastSold')} ${d.last_sold ? fmtDate(d.last_sold) : pick('acc.r.never')}`} right={<MoneyText value={d.value} tone="ink" />} onClick={() => open(d.id)} />)}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'suppliers' ? (
        !sup ? <Loading /> : !sup.length ? <Empty text="acc.none" /> : (
          <div className="card flex flex-col divide-y divide-line" data-testid="r-suppliers">
            {sup.map((s) => <Line key={s.party_id ?? 'none'} title={s.party_name ?? '—'} sub={`${s.bills} ${pick('acc.r.bills')} · ${s.units} ${pick('acc.r.units')}`} right={<MoneyText value={s.amount} tone="ink" />} onClick={s.party_id ? () => nav(`/parties/${s.party_id}`) : undefined} />)}
          </div>
        )
      ) : null}

      <BulkPriceSheet open={bulk} onClose={() => setBulk(false)} />
    </div>
  )
}

function BulkPriceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pick } = useLang()
  const [field, setField] = useState<'price' | 'wholesale_price' | 'min_price'>('price')
  const [pct, setPct] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const inv = useInvalidate()
  const m = useDocMutation<Record<string, unknown>, { updated: number }>('POST', () => '/api/v1/accessories/bulk-price')
  return (
    <Sheet open={open} onClose={() => { setDone(null); onClose() }} title="acc.bulkPrice">
      <div className="flex flex-col gap-3">
        <BiLabel text="acc.bulkField" size="md" tone="text-muted" />
        <BiSegmented<'price' | 'wholesale_price' | 'min_price'> value={field} onChange={setField} options={[{ value: 'price', text: 'acc.price' }, { value: 'wholesale_price', text: 'acc.wholesale' }, { value: 'min_price', text: 'acc.minPrice' }]} />
        <div className="grid grid-cols-2 gap-2">
          <BiInput label="acc.bulkPct" type="number" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="num" placeholder="10" />
          <BiInput label="acc.bulkAmount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
        </div>
        <BiLabel text="acc.bulkScope" size="md" tone="text-muted" />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')} className={`tap h-10 rounded-full border-2 px-3.5 text-[13px] font-bold ${!category ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{pick('common.all')}</button>
        </div>
        <KindChooser value={category} onChange={setCategory} />
        <BiLabel text="acc.bulkHint" size="sm" tone="text-muted" />
        <ErrorText error={m.error} />
        {done != null ? <BiAlert text={{ en: `${pick('acc.bulkDone')}: ${done}`, ur: `${pick('acc.bulkDone')}: ${done}`, roman: `${pick('acc.bulkDone')}: ${done}` }} kind="success" /> : null}
        <BiButton text="common.confirm" full loading={m.isPending} disabled={!pct && !amount} onClick={async () => { const r = await m.mutateAsync({ field, pct: pct ? Number(pct) : null, amount: amount ? Number(amount) : null, category: category || null }); setDone(r.updated); await inv('accessories', 'item') }} />
      </div>
    </Sheet>
  )
}
