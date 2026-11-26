/** What the stock screens gained from the new product's file 23 (owner 2026-11-26, ADR-141):
 *  - `StockTabs`: the four stock screens one tap apart — summary, every item, dealer & customer-wise,
 *    the stock ledger;
 *  - `StockOverviewStrip`: beside the worth at cost, the worth at asking and what is still to pay
 *    suppliers;
 *  - `StockPeoplePage` (`/stock/people`): who the stock came from — brands and models, how many are
 *    still here, sold, the cost, what was billed and their khata balance;
 *  - `StockLedgerPage` (`/stock/ledger`): every piece in and out in a period with its voucher, person,
 *    cost, price and profit when sold, and the stock at cost after each line.
 *  Every figure is the server's (`/stock-hub/overview`, `/parties`, `/ledger`, read-only); the pages
 *  add up nothing and a filter asks the server. Cost, profit and balances only for owner / manager. */

import { ArrowDownLeft, ArrowUpRight, BookOpen, Boxes, LayoutDashboard, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router-dom'
import DownloadButton from '@/components/DownloadButton'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, Loading, PageHeader, fmtDate } from '@/components/ui'
import PeriodPicker, { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useModules } from '@/lib/modules'
import { useGet } from '@/lib/queries'

type M = string
interface Overview {
  brands: { brand_id: string; brand_name: string }[]
  units_in_shop: number; pieces_in_shop: number; units_sold: number; cost: M | null; asking: M; payable: M | null
}
interface PartyRow { party_id: string; name: string; name_ur: string | null; phone: string | null; party_kinds: string[]; kinds: string[]; brands: string[]; models: string[]; models_count: number; in_shop: number; sold: number; returned: number; pieces_in_shop: number; pieces_in: number; cost: M | null; billed: M | null; balance: M | null }
interface LedgerRow { at: string; date: string; kind: string; category: string; label: string; code: string | null; device_id: string | null; item_id: string | null; qty: number; unit_cost: M | null; price: M | null; profit: M | null; worth_after: M | null; no: string | null; party_id: string | null; party_name: string | null; document_type: string | null; document_id: string | null }
interface Ledger { rows: LedgerRow[]; total_rows: number; in_units: number; in_cost: M | null; out_units: number; out_value: M; returned_value: M | null; returned_count: number; profit: M | null }

const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const useCanCost = () => useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')

/* ------------------------------------------------------------------ the stock screens, one tap apart */

const TABS: [string, string, LucideIcon, boolean][] = [
  ['/stock/summary', 'sth.tab.summary', LayoutDashboard, true],
  ['/stock', 'sth.tab.units', Boxes, true],
  ['/stock/people', 'sth.tab.parties', Users, false],
  ['/stock/ledger', 'sth.tab.ledger', BookOpen, false],
]

export function StockTabs() {
  const { pick, ur, cls } = useLang()
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label={pick('stock.title')} data-testid="stock-tabs">
      {TABS.map(([to, label, Icon, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 font-bold ${isActive ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`} data-testid={`stock-tab-${to.split('/').pop()}`}>
          <Icon size={16} />{pick(label)}
        </NavLink>
      ))}
    </nav>
  )
}

/** beside the worth at cost: the same stock at asking price, and what is still owed to suppliers */
export function StockOverviewStrip() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const canCost = useCanCost()
  const { data } = useGet<Overview>(['stock-hub', 'overview'], '/api/v1/stock-hub/overview')
  if (!data) return null
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className={`grid gap-2 ${canCost ? 'grid-cols-2' : 'grid-cols-1'}`} data-testid="sth-strip">
      <div className="card flex flex-col gap-0.5 p-3" data-testid="sth-asking">
        <span className={`text-muted ${tiny}`}>{pick('sth.askingWorth')}</span>
        <span className="num text-lg text-ink" dir="ltr">{rs(data.asking)}</span>
        <span className={`text-muted ${tiny}`}>{t('sth.unitsN', { n: data.units_in_shop })}{data.pieces_in_shop ? ` · ${t('sth.pieces', { n: data.pieces_in_shop })}` : ''}</span>
      </div>
      {canCost ? (
        <button type="button" onClick={() => nav('/stock/people')} className="card tap flex flex-col gap-0.5 p-3 text-start" data-testid="sth-payable">
          <span className={`text-muted ${tiny}`}>{pick('sth.payable')}</span>
          <span className="num text-lg text-payable" dir="ltr">{rs(data.payable)}</span>
          <span className={`text-muted ${tiny}`}>{pick('sth.payableSub')}</span>
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ dealer & customer-wise stock */

export function StockPeoplePage() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const canCost = useCanCost()
  const [who, setWho] = useState<'all' | 'supplier' | 'customer'>('all')
  const { data } = useGet<PartyRow[]>(['stock-hub', 'parties'], '/api/v1/stock-hub/parties')
  const rows = (data ?? []).filter((r) => who === 'all' || r.party_kinds.includes(who))
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const cell = (label: string, value: string, tone = 'text-ink') => <span className="flex flex-col rounded-xl bg-ground px-2 py-1.5"><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-sm leading-tight ${tone}`} dir="ltr">{value}</span></span>
  return (
    <div className="flex flex-col gap-3" data-testid="sth-people">
      <PageHeader title="sth.tab.parties" back={false} />
      <StockTabs />
      <BiLabel text="sth.partiesSub" size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5" role="group">
        {(['all', 'supplier', 'customer'] as const).map((w) => <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)} className={chip(who === w)} data-testid={`sth-who-${w}`}>{pick(w === 'all' ? 'common.all' : `party.${w}`)}</button>)}
      </div>
      {!data ? <Loading /> : !rows.length ? <Empty text="sth.empty" /> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const bal = num(r.balance)
            return (
              <section key={r.party_id} className="card flex flex-col gap-2" data-testid="sth-party">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap gap-1">{r.party_kinds.map((k) => <Chip key={k} text={`party.${k}`} tone="muted" />)}</span>
                    <span className="truncate text-base font-extrabold text-ink" dir="auto">{ur ? r.name_ur || r.name : r.name}</span>
                    <span className={`text-muted ${tiny}`}>{pick('sth.brands')}: <span className="font-bold text-ink">{r.brands.join(', ') || '—'}</span> ({t('sth.modelsN', { n: r.models_count })})</span>
                  </div>
                  {canCost && r.balance != null ? (
                    <span className="flex shrink-0 flex-col items-end" data-testid="sth-party-balance">
                      <span className={`text-muted ${tiny}`}>{pick(bal < 0 ? 'sth.dene' : bal > 0 ? 'sth.lene' : 'sth.clear')}</span>
                      <span className={`num text-base ${bal < 0 ? 'text-payable' : bal > 0 ? 'text-receivable' : 'text-muted'}`} dir="ltr">{rs(r.balance)}</span>
                    </span>
                  ) : null}
                </div>
                <div className={`grid gap-1.5 ${canCost ? 'grid-cols-4' : 'grid-cols-2'}`}>
                  {cell('sth.inShop', `${r.in_shop}${r.pieces_in_shop ? ` + ${r.pieces_in_shop}` : ''}`, 'text-receivable')}
                  {cell('sth.soldOut', String(r.sold), 'text-emerald-deep')}
                  {canCost ? cell('sth.stockCost', rs(r.cost)) : null}
                  {canCost ? cell('sth.billed', rs(r.billed)) : null}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`min-w-0 truncate text-muted ${tiny}`} dir="auto">{r.models.join(' · ')}</span>
                  <button type="button" onClick={() => nav(`/parties/${r.party_id}?tab=phones`)} className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 font-bold text-ground" data-testid="sth-party-open"><BookOpen size={15} /><span className={tiny}>{pick('sth.partyStock')}</span></button>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ the stock ledger */

const MOVES = ['in', 'out', 'return', 'transfer', 'adjust', 'parts'] as const
const MOVE_TONE = (k: string): 'ok' | 'warn' | 'bad' | 'muted' | 'ink' => (k === 'in' ? 'ok' : k === 'out' ? 'ink' : k.startsWith('return') ? 'warn' : 'muted')

export function StockLedgerPage() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const canCost = useCanCost()
  const has = useModules()
  const [period, setPeriod] = useState<Period>(periodOf('month'))
  const [cat, setCat] = useState('')
  const [move, setMove] = useState('')
  const [brand, setBrand] = useState('')
  const [party, setParty] = useState('')
  const { data: ov } = useGet<Overview>(['stock-hub', 'overview'], '/api/v1/stock-hub/overview')
  const { data: parties } = useGet<PartyRow[]>(['stock-hub', 'parties'], '/api/v1/stock-hub/parties')
  const qs = new URLSearchParams(periodQuery(period))
  if (cat) qs.set('category', cat)
  if (move) qs.set('move', move)
  if (brand) qs.set('brand_id', brand)
  if (party) qs.set('party_id', party)
  const { data } = useGet<Ledger>(['stock-hub', 'ledger', qs.toString()], `/api/v1/stock-hub/ledger?${qs}`)
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const small = ur ? cls('sm') : 'text-[13px]'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${small}`
  const sel = `tap h-10 rounded-full border-2 border-line bg-surface px-3 font-bold text-ink ${small}`
  const cats = ['', 'phone', ...(has('laptops') ? ['laptop'] : []), 'watch', 'tablet', ...(has('accessories') ? ['items'] : [])]
  const open = (r: LedgerRow) => {
    if (r.document_type === 'invoice' && r.document_id) nav(`/sales/${r.document_id}`)
    else if (r.document_type === 'purchase' && r.document_id) nav(`/purchases/${r.document_id}`)
    else if (r.device_id) nav(`/stock/${r.device_id}`)
    else if (r.item_id) nav(`/accessories/${r.item_id}`)
  }
  const figure = (label: string, value: string, sub: string, tone: string, testid: string) => (
    <div className="card flex flex-col gap-0.5 p-3" data-testid={testid}><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-lg ${tone}`} dir="ltr">{value}</span><span className={`text-muted ${tiny}`}>{sub}</span></div>
  )
  return (
    <div className="flex flex-col gap-3" data-testid="sth-ledger-page">
      <PageHeader title="sth.tab.ledger" back={false} right={<DownloadButton path="/api/v1/exports/stock-cost" name="stock-item-wise" />} />
      <StockTabs />
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      <div className="flex flex-wrap items-center gap-1.5">
        {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)} data-testid={`sth-cat-${c || 'all'}`}>{pick(c ? (c === 'items' ? 'ihub.items' : `devcat.${c}`) : 'common.all')}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={move} onChange={(e) => setMove(e.target.value)} aria-label={pick('sth.l.allMoves')} className={sel} data-testid="sth-move"><option value="">{pick('sth.l.allMoves')}</option>{MOVES.map((m) => <option key={m} value={m}>{pick(`sth.l.k.${m}`)}</option>)}</select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={pick('sth.l.allBrands')} className={sel} data-testid="sth-brand"><option value="">{pick('sth.l.allBrands')}</option>{(ov?.brands ?? []).map((b) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}</select>
        <select value={party} onChange={(e) => setParty(e.target.value)} aria-label={pick('sth.l.allParties')} className={sel} data-testid="sth-party-filter"><option value="">{pick('sth.l.allParties')}</option>{(parties ?? []).map((p) => <option key={p.party_id} value={p.party_id}>{p.name}</option>)}</select>
      </div>

      {!data ? <Loading /> : (
        <>
          <div className={`grid grid-cols-2 gap-2 ${canCost ? 'lg:grid-cols-4' : ''}`} data-testid="sth-l-figures">
            {figure('sth.l.in', `+${data.in_units}`, canCost ? rs(data.in_cost) : pick('sth.unitsWord'), 'text-emerald-deep', 'sth-l-in')}
            {figure('sth.l.out', `−${data.out_units}`, rs(data.out_value), 'text-ink', 'sth-l-out')}
            {canCost ? figure('sth.l.returns', rs(data.returned_value), t('sth.l.returnsN', { n: data.returned_count }), 'text-receivable', 'sth-l-ret') : null}
            {canCost ? figure('sth.l.profit', `${num(data.profit) < 0 ? '−' : '+'}${rs(data.profit)}`, pick('sth.l.profitSub'), num(data.profit) < 0 ? 'text-payable' : 'text-emerald-deep', 'sth-l-profit') : null}
          </div>
          <BiLabel text={{ en: t('sth.l.title', { n: data.total_rows }), ur: t('sth.l.title', { n: data.total_rows }) }} size="sm" tone="text-muted" bold />
          {!data.rows.length ? <Empty text="sth.l.none" /> : (
            <div className="card overflow-x-auto p-0" data-testid="sth-ledger">
              <table className="w-full border-collapse text-sm">
                <thead><tr className={`border-b border-line text-muted ${tiny}`}>
                  <th className="px-3 py-2 text-start">{pick('sth.l.date')}</th><th className="px-3 py-2 text-start">{pick('sth.l.type')}</th><th className="px-3 py-2 text-start">{pick('sth.l.item')}</th><th className="px-3 py-2 text-start">{pick('sth.l.party')}</th><th className="px-3 py-2 text-end">{pick('sth.l.qty')}</th>
                  {canCost ? <th className="px-3 py-2 text-end">{pick('sth.l.unitCost')}</th> : null}<th className="px-3 py-2 text-end">{pick('sth.l.price')}</th>{canCost ? <><th className="px-3 py-2 text-end">{pick('sth.l.profitCol')}</th><th className="px-3 py-2 text-end">{pick('sth.l.worth')}</th></> : null}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((r, i) => (
                    <tr key={i} onClick={() => open(r)} className="tap cursor-pointer" data-testid="sth-l-row">
                      <td className="whitespace-nowrap px-3 py-2.5"><div className="num text-sm" dir="ltr">{r.no ?? '—'}</div><div className={`text-muted ${tiny}`} dir="ltr">{fmtDate(r.date)}</div></td>
                      <td className="px-3 py-2.5"><Chip text={`sth.l.k.${r.kind}`} tone={MOVE_TONE(r.kind)} /></td>
                      <td className="px-3 py-2.5"><div className="font-bold text-ink" dir="auto">{r.label}</div><div className={`text-muted ${tiny}`}><span>{pick(r.category === 'items' ? 'ihub.items' : `devcat.${r.category}`)}</span>{r.code ? <span dir="ltr"> · {r.code}</span> : null}</div></td>
                      <td className="px-3 py-2.5 text-ink" dir="auto">{r.party_name ?? '—'}</td>
                      <td className={`num whitespace-nowrap px-3 py-2.5 text-end ${r.qty > 0 ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{r.qty > 0 ? <ArrowDownLeft size={13} className="inline" /> : <ArrowUpRight size={13} className="inline" />}{r.qty > 0 ? '+' : ''}{r.qty}</td>
                      {canCost ? <td className="num px-3 py-2.5 text-end" dir="ltr">{r.unit_cost == null ? '—' : rs(r.unit_cost)}</td> : null}
                      <td className="num px-3 py-2.5 text-end" dir="ltr">{r.price == null ? '—' : rs(r.price)}</td>
                      {canCost ? <><td className={`num px-3 py-2.5 text-end ${num(r.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{r.profit == null ? '—' : `${num(r.profit) < 0 ? '−' : '+'}${rs(r.profit)}`}</td><td className="num px-3 py-2.5 text-end text-ink" dir="ltr">{rs(r.worth_after)}</td></> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.total_rows > data.rows.length ? <span className={`font-bold text-receivable ${tiny}`}>{t('sth.partial', { n: data.rows.length, t: data.total_rows })}</span> : null}
        </>
      )}
    </div>
  )
}
