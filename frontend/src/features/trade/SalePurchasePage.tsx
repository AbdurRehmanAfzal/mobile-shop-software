/** Sale & purchase (owner 2026-11-26, from the new product's file 25, ADR-139): one page with two
 *  sides — what the shop sold and what it bought in a period — each with its figures and five views:
 *  kinds and brands, models (every phone or item with its bill), people, the bills (several can be
 *  settled / paid at once, one payment per bill) and the full ledger; a search with Scan, filters by
 *  kind of stock, deal (udhaar, paid, loss), brand and payment mode; the A4 / Excel ledger report.
 *
 *  Every figure is the server's (`/bills-hub/sales`, `/bills-hub/purchases`, read-only): the page
 *  adds up nothing and a filter asks the server. The purchases side is all cost, so it is for the
 *  owner and the manager; cost and profit on the sales side likewise. A bill is never edited in place
 *  or deleted from a list — correct and delete hand over to the live screens (ADR-090 / ADR-099). */

import { BarChart3, BookOpen, Boxes, Eye, EyeOff, FileText, PackagePlus, Pencil, Plus, RotateCcw, Tag, Trash2, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { BtnText, Chip, Empty, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import PeriodPicker, { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { DeleteSheet, FixSheet, ReportSheet, SettleSheet, kindKey, num, rs, signed, type BillRef } from '@/features/invoices/InvoiceHub'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useModules } from '@/lib/modules'
import { useGet, useInvalidate } from '@/lib/queries'

type M = string
type Side = 'sales' | 'purchases'
type Tab = 'overview' | 'models' | 'parties' | 'bills' | 'ledger'
const TABS: [Tab, LucideIcon][] = [['overview', BarChart3], ['models', Boxes], ['parties', Users], ['bills', FileText], ['ledger', BookOpen]]
const MODES = ['cash', 'bank', 'online', 'cheque', 'remittance', 'udhaar'] as const

/** one sold or bought line; the money words differ by side, so both sides are read into one shape */
interface Line {
  bill_id: string; no: string; date: string; party_id: string | null; party_name: string | null; role: 'customer' | 'dealer'
  kind: string; brand: string | null; model: string; code: string | null; qty: number
  amount: M; cost: M | null; profit: M | null; unit_cost: M | null; paid: M; due: M; mode: string | null
  other: string | null; otherNo: string | null; state: string | null; inShop: number; sold: number
}
interface Agg { key?: string; units: number; bills: number; amount: M; cost: M | null; paid: M; due: M; profit: M | null; gain: M | null; loss: M | null; avg: M | null; inShop: number; sold: number }
interface Bill extends BillRef { date: string; party_name: string | null; party_phone: string | null; role: string; total: M; paid: M; mode: string | null; profit: M | null; edited: boolean; supplier_no: string | null }
interface Data {
  figures: Agg; kinds: (Agg & { key: string })[]; brands: (Agg & { key: string; brand: string | null; models: number })[]
  models: (Agg & { key: string; kind: string; brand: string | null; model: string; lines: Line[] })[]
  parties: (Agg & { party_id: string | null; name: string | null; phone: string | null; role: string; ids: string[] })[]
  bills: Bill[]; lines: Line[]; brand_options: { key: string; name: string }[]
}

/* the server's two answers, read into the one shape above (names only; no figure is worked out here) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any
const agg = (a: Raw, side: Side): Agg => ({ key: a.key, units: a.units, bills: a.bills, amount: side === 'sales' ? a.sale : a.amount, cost: a.cost ?? null, paid: side === 'sales' ? a.received : a.paid, due: side === 'sales' ? a.udhaar : a.due, profit: a.profit ?? null, gain: a.gain ?? null, loss: a.loss ?? null, avg: a.avg ?? null, inShop: a.in_shop ?? 0, sold: a.sold ?? 0 })
const line = (l: Raw, side: Side): Line => ({ bill_id: side === 'sales' ? l.invoice_id : l.purchase_id, no: l.no, date: l.date, party_id: l.party_id, party_name: l.party_name, role: l.role, kind: l.kind, brand: l.brand, model: l.model, code: l.code, qty: l.qty, amount: side === 'sales' ? l.sale : l.amount, cost: l.cost ?? null, profit: l.profit ?? null, unit_cost: l.unit_cost ?? null, paid: side === 'sales' ? l.received : l.paid, due: side === 'sales' ? l.udhaar : l.due, mode: l.mode, other: side === 'sales' ? l.bought_from : l.sold_to, otherNo: side === 'sales' ? l.bought_no : l.sold_no, state: l.state ?? null, inShop: l.in_shop ?? 0, sold: l.sold ?? 0 })
const read = (d: Raw, side: Side): Data => ({
  figures: agg(d.figures, side),
  kinds: d.kinds.map((k: Raw) => ({ ...agg(k, side), key: k.key })),
  brands: d.brands.map((b: Raw) => ({ ...agg(b, side), key: b.key, brand: b.brand, models: b.models })),
  models: d.models.map((m: Raw) => ({ ...agg(m, side), key: m.key, kind: m.kind, brand: m.brand, model: m.model, lines: m.lines.map((l: Raw) => line(l, side)) })),
  parties: d.parties.map((p: Raw) => ({ ...agg(p, side), party_id: p.party_id, name: p.name, phone: p.phone, role: p.role, ids: p.ids })),
  bills: d.bills.map((b: Raw) => ({ kind: side === 'sales' ? 'sale' : 'purchase', id: b.id, no: b.no, party_id: b.party_id, due: b.due, date: b.date, party_name: b.party_name, party_phone: b.party_phone, role: b.role, total: b.total, paid: b.paid, mode: b.mode, profit: b.profit ?? null, edited: b.edited, supplier_no: b.supplier_no ?? null })),
  lines: d.lines.map((l: Raw) => line(l, side)),
  brand_options: d.brand_options,
})

export default function SalePurchasePage() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const has = useModules()
  const [sp, setSp] = useSearchParams()
  const side: Side = sp.get('side') === 'purchases' && canCost ? 'purchases' : 'sales'
  const tab = (TABS.find((x) => x[0] === sp.get('tab'))?.[0] ?? 'overview') as Tab
  const put = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) } setSp(n, { replace: true }) }
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<Period>(periodOf('month'))
  const [cat, setCat] = useState('')
  const [deal, setDeal] = useState('')
  const [brand, setBrand] = useState('')
  const [mode, setMode] = useState('')
  const [showCost, setShowCost] = useState(true)
  const [settling, setSettling] = useState<BillRef | null>(null)
  const [fixing, setFixing] = useState<BillRef | null>(null)
  const [deleting, setDeleting] = useState<BillRef | null>(null)
  const [report, setReport] = useState(false)
  const S = side === 'sales'
  const k = (key: string) => `stp.${S ? 's' : 'p'}.${key}`

  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  else for (const [a, b] of new URLSearchParams(periodQuery(period))) params.set(a, b)
  if (cat) params.set('kind', cat)
  if (deal) params.set('deal', deal)
  if (brand) params.set('brand', brand)
  if (mode) params.set('mode', mode)
  const { data: raw, isLoading } = useGet<Raw>(['bills-hub', side, params.toString()], `/api/v1/bills-hub/${side}?${params}`)
  const data = raw ? read(raw, side) : undefined
  const sheet = `/api/v1/bills-hub/${side}/sheet?${params}`
  const costOk = canCost && showCost
  const hide = (v: M | null | undefined) => (costOk ? rs(v) : '••••••')
  const pl = (v: M | null | undefined) => (costOk ? signed(v) : '••••••')
  const f = data?.figures
  const billById = new Map((data?.bills ?? []).map((b) => [b.id, b]))
  const open = (id: string) => nav(S ? `/sales/${id}` : `/purchases/${id}`)
  const act: Act = { settle: setSettling, fix: setFixing, del: setDeleting, open }
  const filtered = !!cat || !!deal || !!brand || !!mode || !!q.trim()
  const reset = () => { setCat(''); setDeal(''); setBrand(''); setMode(''); setQ('') }
  const switchSide = (to: Side) => { reset(); put({ side: to === 'sales' ? null : to }) }

  const small = ur ? cls('sm') : 'text-[13px]'
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${small}`
  const head = 'tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1'
  const cats = ['', 'phone', ...(has('laptops') ? ['laptop'] : []), 'watch', 'tablet', ...(has('accessories') ? ['items'] : [])]
  const deals = S ? ['', 'udhaar', 'paid', ...(canCost ? ['loss'] : [])] : ['', 'udhaar', 'paid']
  const figure = (label: string, value: string, sub: string, tone: string, testid: string, onClick?: () => void) => {
    const body = <><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-lg ${tone}`} dir="ltr">{value}</span><span className={`text-muted ${tiny}`}>{sub}</span></>
    return onClick
      ? <button key={testid} type="button" onClick={onClick} className="card tap flex flex-col gap-0.5 p-3 text-start" data-testid={testid}>{body}</button>
      : <div key={testid} className="card flex flex-col gap-0.5 p-3" data-testid={testid}>{body}</div>
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stp">
      <PageHeader
        title="stp.title"
        right={
          <div className="flex gap-2">
            {canCost ? <button type="button" aria-pressed={showCost} aria-label={pick(showCost ? 'stp.s.costVisible' : 'stp.s.costHidden')} onClick={() => setShowCost(!showCost)} className={head} data-testid="stp-eye">{showCost ? <Eye size={18} /> : <EyeOff size={18} />}<BtnText k="ihub.profitShort" /></button> : null}
            <button type="button" onClick={() => setReport(true)} className={head} data-testid="stp-report"><BookOpen size={18} /><BtnText k="ihub.reportShort" /></button>
            <button type="button" onClick={() => nav(S ? '/sale/new' : '/purchase/new')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-emerald px-1.5 py-1 text-white" data-testid="stp-new"><Plus size={18} /><BtnText k={S ? 'stp.newSale' : 'stp.newPurchase'} /></button>
          </div>
        }
      />
      <BiLabel text="stp.hint" size="sm" tone="text-muted" />

      {/* the two sides */}
      <div className="grid grid-cols-2 gap-2" role="tablist" data-testid="stp-sides">
        <button type="button" role="tab" aria-selected={S} onClick={() => switchSide('sales')} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl font-extrabold ${S ? 'bg-sell text-sell-fg ring-2 ring-ink' : 'border border-line bg-surface text-ink'}`} data-testid="stp-side-sales"><Tag size={18} /><span className={ur ? cls('md') : 'text-base'}>{pick('stp.s.salesScreen')}</span></button>
        {canCost ? <button type="button" role="tab" aria-selected={!S} onClick={() => switchSide('purchases')} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl font-extrabold ${!S ? 'bg-buy text-buy-fg ring-2 ring-ink' : 'border border-line bg-surface text-ink'}`} data-testid="stp-side-purchases"><PackagePlus size={18} /><span className={ur ? cls('md') : 'text-base'}>{pick('stp.s.purchasesScreen')}</span></button> : null}
      </div>

      <SearchBox value={q} onChange={setQ} placeholder={k('search')} scan />
      {q.trim() ? <BiLabel text="inv.allDates" size="sm" tone="text-muted" /> : <PeriodPicker value={period} onChange={setPeriod} size="sm" />}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick('stp.s.cat.all')}>
        {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={chip(cat === c)} data-testid={`stp-cat-${c || 'all'}`}>{pick(c ? kindKey(c) : 'stp.s.cat.all')}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {deals.map((d) => <button key={d} type="button" aria-pressed={deal === d} onClick={() => setDeal(d)} className={chip(deal === d)} data-testid={`stp-deal-${d || 'all'}`}>{pick(k(`deal.${d || 'all'}`))}</button>)}
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={t('stp.s.brandAll', { n: data?.brand_options.length ?? 0 })} className={`tap h-10 rounded-full border-2 border-line bg-surface px-3 font-bold text-ink ${small}`} data-testid="stp-brand"><option value="">{t('stp.s.brandAll', { n: data?.brand_options.length ?? 0 })}</option>{(data?.brand_options ?? []).map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={pick('stp.s.modeAll')} className={`tap h-10 rounded-full border-2 border-line bg-surface px-3 font-bold text-ink ${small}`} data-testid="stp-mode"><option value="">{pick('stp.s.modeAll')}</option>{MODES.map((m) => <option key={m} value={m}>{pick(`ihub.mode.${m}`)}</option>)}</select>
        {filtered ? <button type="button" onClick={reset} className={`tap inline-flex h-10 items-center gap-1 px-2 font-bold text-muted underline ${small}`} data-testid="stp-reset"><RotateCcw size={14} />{pick('stp.s.reset')}</button> : null}
      </div>

      {f ? (S ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6" data-testid="stp-figures">
          {figure('stp.s.k.sales', rs(f.amount), t('stp.s.k.salesSub', { u: f.units, b: f.bills }), 'text-ink', 'stp-f-amount')}
          {canCost ? figure('stp.s.k.cost', hide(f.cost), pick('stp.s.k.costSub'), 'text-ink', 'stp-f-cost') : null}
          {figure('stp.s.k.received', rs(f.paid), pick('stp.s.k.receivedSub'), 'text-emerald-deep', 'stp-f-paid', () => setDeal('paid'))}
          {figure('stp.s.k.udhaar', rs(f.due), pick('stp.s.k.udhaarSub'), 'text-receivable', 'stp-f-due', () => setDeal('udhaar'))}
          {canCost ? figure('stp.s.k.gain', costOk ? `+${rs(f.gain)}` : '••••••', t('stp.s.k.net', { v: pl(f.profit) }), 'text-emerald-deep', 'stp-f-gain') : null}
          {canCost ? figure('stp.s.k.loss', costOk ? (num(f.loss) > 0 ? `−${rs(f.loss)}` : rs(0)) : '••••••', pick('stp.s.k.lossSub'), 'text-payable', 'stp-f-loss', () => setDeal('loss')) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="stp-figures">
          {figure('stp.p.k.total', hide(f.amount), t('stp.s.k.salesSub', { u: f.units, b: f.bills }), 'text-ink', 'stp-f-amount')}
          {figure('stp.p.k.paid', rs(f.paid), pick('stp.p.k.paidSub'), 'text-emerald-deep', 'stp-f-paid', () => setDeal('paid'))}
          {figure('stp.p.k.due', rs(f.due), pick('stp.p.k.dueSub'), 'text-payable', 'stp-f-due', () => setDeal('udhaar'))}
          {figure('stp.p.k.avg', hide(f.avg), t('stp.p.k.avgSub', { n: f.units }), 'text-ink', 'stp-f-avg')}
          {figure('stp.p.k.stock', t('stp.p.k.inShop', { n: f.inShop }), t('stp.p.k.soldOut', { n: f.sold }), 'text-ink', 'stp-f-stock')}
        </div>
      )) : null}

      <div className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-ground px-1 py-1.5" role="tablist">
        {TABS.map(([v, Icon]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => put({ tab: v === 'overview' ? null : v })} className={`tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 font-bold ${tab === v ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${small}`} data-testid={`stp-tab-${v}`}>
            <Icon size={15} />{pick(k(`tab.${v === 'bills' ? 'invoices' : v}`))}
          </button>
        ))}
      </div>

      {isLoading || !data ? <Loading />
        : tab === 'overview' ? <Overview d={data} S={S} cat={cat} canCost={canCost} hide={hide} pl={pl} setCat={setCat} setBrand={(b) => { setBrand(b); put({ tab: 'models' }) }} />
          : tab === 'models' ? <Models d={data} S={S} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} />
            : tab === 'parties' ? <Parties d={data} S={S} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} />
              : tab === 'bills' ? <Bills bills={data.bills} S={S} canCost={canCost} pl={pl} act={act} />
                : <Lines lines={data.lines} S={S} canCost={canCost} hide={hide} pl={pl} bills={billById} act={act} full />}

      <SettleSheet r={settling} onClose={() => setSettling(null)} />
      <FixSheet r={fixing} onClose={() => setFixing(null)} />
      <DeleteSheet r={deleting} onClose={() => setDeleting(null)} />
      <ReportSheet open={report} sheet={sheet} canCost={canCost && S} onClose={() => setReport(false)} title={k('a4Title')} sub={k('a4Sub')} name={side} />
    </div>
  )
}

type Act = { settle: (b: BillRef) => void; fix: (b: BillRef) => void; del: (b: BillRef) => void; open: (id: string) => void }
type Fmt = (v: M | null | undefined) => string
const plTone = (v: M | null | undefined) => (num(v) < 0 ? 'text-payable' : 'text-emerald-deep')

/** a card per kind of stock, then the brands */
function Overview({ d, S, cat, canCost, hide, pl, setCat, setBrand }: { d: Data; S: boolean; cat: string; canCost: boolean; hide: Fmt; pl: Fmt; setCat: (k: string) => void; setBrand: (b: string) => void }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const has = useModules()
  const kinds = d.kinds.filter((x) => x.key !== 'laptop' || has('laptops')).filter((x) => x.key !== 'items' || has('accessories'))
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="stp-kinds">
        {kinds.map((x) => (
          <button key={x.key} type="button" aria-pressed={cat === x.key} onClick={() => setCat(cat === x.key ? '' : x.key)} className={`card tap flex flex-col gap-1 p-3 text-start ${cat === x.key ? 'ring-2 ring-ink' : ''}`} data-testid={`stp-kind-${x.key}`}>
            <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-extrabold text-ink">{pick(kindKey(x.key))}</span><span className={`text-muted ${tiny}`}>{t('stp.s.units', { n: x.units })}</span></span>
            <span className="num text-lg text-ink" dir="ltr">{S ? rs(x.amount) : hide(x.amount)}</span>
            <span className={`flex flex-wrap justify-between gap-x-2 text-muted ${tiny}`}>
              <span>{pick(S ? 'stp.s.debit' : 'stp.p.toPay')}: <span className={`num ${S ? 'text-receivable' : 'text-payable'}`} dir="ltr">{rs(x.due)}</span></span>
              {S ? (canCost ? <span className={`num ${plTone(x.profit)}`} dir="ltr">{pl(x.profit)}</span> : null) : <span>{t('stp.p.k.inShop', { n: x.inShop })}</span>}
            </span>
          </button>
        ))}
      </div>
      <section className="flex flex-col gap-2" data-testid="stp-brands">
        <BiLabel text={S ? 'stp.s.brandTitle' : 'stp.p.brandTitle'} size="sm" tone="text-muted" bold />
        {!d.brands.length ? <Empty text={S ? 'stp.s.none' : 'stp.p.none'} /> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead><tr className={`border-b border-line text-muted ${tiny}`}>
                <th className="px-3 py-2 text-start">{pick('stp.s.col.brand')}</th><th className="px-3 py-2 text-end">{pick('stp.s.col.units')}</th>
                {S ? <>{canCost ? <th className="px-3 py-2 text-end">{pick('stp.s.col.cost')}</th> : null}<th className="px-3 py-2 text-end">{pick('stp.s.col.sales')}</th><th className="px-3 py-2 text-end">{pick('stp.s.col.received')}</th><th className="px-3 py-2 text-end">{pick('stp.s.col.udhaar')}</th>{canCost ? <th className="px-3 py-2 text-end">{pick('stp.s.col.pl')}</th> : null}</>
                  : <><th className="px-3 py-2 text-end">{pick('stp.p.col.avg')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.amount')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.paid')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.due')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.stock')}</th></>}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.brands.map((b) => (
                  <tr key={b.key} onClick={() => setBrand(b.key)} className="tap cursor-pointer" data-testid="stp-brand-row">
                    <td className="px-3 py-2.5 font-extrabold text-ink">{b.brand ?? '—'} <span className={`font-normal text-muted ${tiny}`}>({t('stp.s.models', { n: b.models })})</span></td>
                    <td className="num px-3 py-2.5 text-end">{b.units}</td>
                    {S ? <>
                      {canCost ? <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(b.cost)}</td> : null}
                      <td className="num px-3 py-2.5 text-end" dir="ltr">{rs(b.amount)}</td>
                      <td className="num px-3 py-2.5 text-end text-emerald-deep" dir="ltr">{rs(b.paid)}</td>
                      <td className="num px-3 py-2.5 text-end text-receivable" dir="ltr">{rs(b.due)}</td>
                      {canCost ? <td className={`num px-3 py-2.5 text-end ${plTone(b.profit)}`} dir="ltr">{pl(b.profit)}</td> : null}
                    </> : <>
                      <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(b.avg)}</td>
                      <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(b.amount)}</td>
                      <td className="num px-3 py-2.5 text-end text-emerald-deep" dir="ltr">{rs(b.paid)}</td>
                      <td className="num px-3 py-2.5 text-end text-payable" dir="ltr">{rs(b.due)}</td>
                      <td className={`px-3 py-2.5 text-end text-muted ${tiny}`}>{t('stp.p.k.inShop', { n: b.inShop })} · {t('stp.p.soldN', { n: b.sold })}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function RowActs({ b, S, act }: { b: Bill | undefined; S: boolean; act: Act }) {
  const { pick } = useLang()
  if (!b) return null
  const btn = 'tap inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-line bg-surface'
  return (
    <span className="inline-flex items-center gap-1">
      {num(b.due) > 0 && b.party_id ? <button type="button" onClick={(e) => { e.stopPropagation(); act.settle(b) }} aria-label={pick(S ? 'ihub.settle' : 'stp.p.pay')} className="tap inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-emerald text-white" data-testid="stp-row-settle"><Wallet size={14} /></button> : null}
      <button type="button" onClick={(e) => { e.stopPropagation(); act.fix(b) }} aria-label={pick('ihub.edit')} className={`${btn} text-receivable`}><Pencil size={14} /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); act.del(b) }} aria-label={pick('ihub.delete')} className={`${btn} text-payable`}><Trash2 size={14} /></button>
    </span>
  )
}

/** every sold / bought line: its bill, the phone or item, the person, the money and where it is now */
function Lines({ lines, S, canCost, hide, pl, bills, act, full }: { lines: Line[]; S: boolean; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act; full?: boolean }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  if (!lines.length) return <Empty text={S ? 'stp.s.none' : 'stp.p.none'} />
  const where = (l: Line) => (l.state === 'part' ? t('stp.p.where.partN', { h: l.inShop, s: l.sold }) : pick(`stp.p.where.${l.state ?? 'other'}`))
  return (
    <div className="card overflow-x-auto p-0" data-testid={full ? 'stp-ledger' : undefined}>
      <table className="w-full border-collapse text-sm">
        <thead><tr className={`border-b border-line text-muted ${tiny}`}>
          <th className="px-3 py-2 text-start">{pick('stp.s.col.bill')}</th><th className="px-3 py-2 text-start">{pick('stp.s.col.modelCode')}</th><th className="px-3 py-2 text-start">{pick(S ? 'stp.s.col.buyer' : 'stp.p.col.seller')}</th>
          {S ? <>{canCost ? <th className="px-3 py-2 text-end">{pick('stp.s.m.cost')}</th> : null}<th className="px-3 py-2 text-end">{pick('stp.s.col.sale')}</th><th className="px-3 py-2 text-end">{pick('stp.s.col.udhaar')}</th>{canCost ? <th className="px-3 py-2 text-end">{pick('stp.s.m.pl')}</th> : null}</>
            : <><th className="px-3 py-2 text-end">{pick('stp.p.col.unit')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.amount')}</th><th className="px-3 py-2 text-end">{pick('stp.p.col.due')}</th><th className="px-3 py-2 text-start">{pick('stp.p.col.where')}</th></>}
          <th className="px-3 py-2 text-end">{pick('stp.s.col.actions')}</th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {lines.map((l, i) => (
            <tr key={`${l.bill_id}-${i}`} onClick={() => act.open(l.bill_id)} className="tap cursor-pointer" data-testid="stp-line">
              <td className="px-3 py-2.5"><div className="num text-sm" dir="ltr">{l.no}</div><div className={`text-muted ${tiny}`} dir="ltr">{fmtDate(l.date)}</div></td>
              <td className="px-3 py-2.5"><div className="font-bold text-ink" dir="auto">{[l.brand, l.model].filter(Boolean).join(' ')}{l.qty > 1 ? <span dir="ltr"> ({l.qty}×)</span> : null}</div><div className={`text-muted ${tiny}`} dir="ltr">{l.code ?? '—'}</div></td>
              <td className="px-3 py-2.5"><div className="font-bold text-ink" dir="auto">{l.party_name ?? pick('sale.cashCustomer')}</div>{S && canCost && l.other ? <div className={`text-muted ${tiny}`} dir="auto">{pick('stp.s.col.bought')}: {l.other} <span dir="ltr">({l.otherNo})</span></div> : null}</td>
              {S ? <>
                {canCost ? <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(l.cost)}</td> : null}
                <td className="num px-3 py-2.5 text-end" dir="ltr">{rs(l.amount)}</td>
                <td className={`num px-3 py-2.5 text-end ${num(l.due) > 0 ? 'text-receivable' : 'text-muted'}`} dir="ltr">{num(l.due) > 0 ? rs(l.due) : '0'}</td>
                {canCost ? <td className={`num px-3 py-2.5 text-end ${plTone(l.profit)}`} dir="ltr">{pl(l.profit)}</td> : null}
              </> : <>
                <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(l.unit_cost)}</td>
                <td className="num px-3 py-2.5 text-end" dir="ltr">{hide(l.amount)}</td>
                <td className={`num px-3 py-2.5 text-end ${num(l.due) > 0 ? 'text-payable' : 'text-muted'}`} dir="ltr">{num(l.due) > 0 ? rs(l.due) : '0'}</td>
                <td className="px-3 py-2.5" data-testid="stp-where"><Chip text={{ en: where(l), ur: where(l) }} tone={l.state === 'in_shop' ? 'warn' : l.state === 'sold' ? 'ok' : 'muted'} />{l.other || l.otherNo ? <div className={`mt-0.5 text-muted ${tiny}`} dir="auto">{l.other ?? pick('sale.cashCustomer')} {l.otherNo ? <span dir="ltr">({l.otherNo})</span> : null}</div> : null}</td>
              </>}
              <td className="px-3 py-2.5 text-end"><RowActs b={bills.get(l.bill_id)} S={S} act={act} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Models({ d, S, canCost, hide, pl, bills, act }: { d: Data; S: boolean; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  if (!d.models.length) return <Empty text="stp.s.noModels" />
  const cell = (label: string, value: string, tone = '') => <span className="flex flex-col"><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-sm ${tone}`} dir="ltr">{value}</span></span>
  return (
    <div className="flex flex-col gap-3" data-testid="stp-models">
      {d.models.map((m) => (
        <section key={m.key} className="flex flex-col gap-2" data-testid="stp-model">
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap items-center gap-2"><Chip text={kindKey(m.kind)} tone="ink" /><span className="text-base font-extrabold text-ink" dir="auto">{[m.brand, m.model].filter(Boolean).join(' ')}</span><span className={`text-muted ${tiny}`}>{t('stp.s.units', { n: m.units })}</span></span>
            <span className="flex flex-wrap items-center gap-4">
              {S ? <>{canCost ? cell('stp.s.m.cost', hide(m.cost)) : null}{cell('stp.s.m.sale', rs(m.amount))}{cell('stp.s.m.udhaar', rs(m.due), 'text-receivable')}{canCost ? cell('stp.s.m.pl', pl(m.profit), plTone(m.profit)) : null}</>
                : <>{cell('stp.p.col.avg', hide(m.avg))}{cell('stp.p.col.amount', hide(m.amount))}{cell('stp.p.col.due', rs(m.due), 'text-payable')}{cell('stp.p.col.stock', `${t('stp.p.k.inShop', { n: m.inShop })} · ${t('stp.p.soldN', { n: m.sold })}`)}</>}
            </span>
          </div>
          <Lines lines={m.lines} S={S} canCost={canCost} hide={hide} pl={pl} bills={bills} act={act} />
        </section>
      ))}
    </div>
  )
}

function BillCard({ b, S, canCost, pl, act, checked, onCheck }: { b: Bill; S: boolean; canCost: boolean; pl: Fmt; act: Act; checked?: boolean; onCheck?: (v: boolean) => void }) {
  const { pick, ur, cls } = useLang()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className={`flex flex-wrap items-center gap-3 px-3 py-3 ${checked ? 'bg-emerald-tint' : b.edited ? 'bg-receivable-tint/40' : ''}`} data-testid="stp-bill" data-no={b.no}>
      {onCheck ? <input type="checkbox" checked={!!checked} onChange={(e) => onCheck(e.target.checked)} aria-label={b.no} className="h-5 w-5 shrink-0" data-testid="stp-check" /> : null}
      <button type="button" onClick={() => act.open(b.id)} className="tap flex min-w-0 flex-1 flex-col text-start">
        <span className="truncate text-[15px] font-bold text-ink" dir="auto">{b.party_name ?? pick('sale.cashCustomer')}</span>
        <span className={`flex flex-wrap items-center gap-x-1.5 text-muted ${tiny}`}><span className="num" dir="ltr">{b.no}</span><span>·</span><span dir="ltr">{fmtDate(b.date)}</span>{b.mode ? <span>· {pick(`ihub.mode.${b.mode}`)}</span> : null}{b.supplier_no ? <span dir="ltr">· #{b.supplier_no}</span> : null}{b.edited ? <span className="font-bold text-receivable">· {pick('ihub.edited')}</span> : null}</span>
      </button>
      <span className="flex flex-col items-end">
        <span className="num text-base text-ink" dir="ltr">{rs(b.total)}</span>
        <span className={`flex flex-wrap items-center justify-end gap-x-1.5 ${tiny}`}><span className="text-emerald-deep">{pick(S ? 'stp.s.credit' : 'stp.p.col.paid')}: <span className="num" dir="ltr">{rs(b.paid)}</span></span>{num(b.due) > 0 ? <span className={S ? 'text-receivable' : 'text-payable'}>{pick(S ? 'stp.s.debit' : 'stp.p.toPay')}: <span className="num" dir="ltr">{rs(b.due)}</span></span> : null}{S && canCost && b.profit != null ? <span className={`num ${plTone(b.profit)}`} dir="ltr">{pl(b.profit)}</span> : null}</span>
      </span>
      <RowActs b={b} S={S} act={act} />
    </div>
  )
}

function Parties({ d, S, canCost, hide, pl, bills, act }: { d: Data; S: boolean; canCost: boolean; hide: Fmt; pl: Fmt; bills: Map<string, Bill>; act: Act }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  if (!d.parties.length) return <Empty text={S ? 'stp.s.none' : 'stp.p.none'} />
  const cell = (label: string, value: string, tone = '', testid?: string) => <span className="flex flex-col rounded-xl bg-ground px-2 py-1.5" data-testid={testid}><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-sm leading-tight ${tone}`} dir="ltr">{value}</span></span>
  return (
    <div className="flex flex-col gap-3" data-testid="stp-parties">
      {d.parties.map((p) => (
        <section key={p.party_id ?? 'walkin'} className="card flex flex-col gap-2 p-0" data-testid="stp-party">
          <div className="flex flex-col gap-2 border-b border-line px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip text={`ihub.role.${p.role}`} tone={p.role === 'dealer' ? 'ink' : 'muted'} />
              {p.party_id ? <button type="button" onClick={() => nav(`/parties/${p.party_id}`)} className="tap text-base font-extrabold text-ink underline-offset-2 hover:underline" dir="auto" data-testid="stp-party-open">{p.name}</button> : <span className="text-base font-extrabold text-ink">{pick('sale.cashCustomer')}</span>}
              {p.phone ? <span className="num text-sm text-muted" dir="ltr">{p.phone}</span> : null}
              <span className={`text-muted ${tiny}`}>{t('stp.s.p.bills', { b: p.bills, u: p.units })}</span>
            </div>
            <div className={`grid gap-1.5 ${S && canCost ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {cell(S ? 'stp.s.p.total' : 'stp.p.p.total', S ? rs(p.amount) : hide(p.amount))}
              {cell(S ? 'stp.s.p.settled' : 'stp.p.col.paid', rs(p.paid), 'text-emerald-deep')}
              {cell(S ? 'stp.s.p.udhaar' : 'stp.p.col.due', rs(p.due), num(p.due) > 0 ? (S ? 'text-receivable' : 'text-payable') : 'text-muted', 'stp-party-due')}
              {S && canCost ? cell('stp.s.p.profit', pl(p.profit), plTone(p.profit)) : null}
            </div>
          </div>
          <div className="divide-y divide-line">{p.ids.map((id) => bills.get(id)).filter((b): b is Bill => !!b).map((b) => <BillCard key={b.id} b={b} S={S} canCost={canCost} pl={pl} act={act} />)}</div>
        </section>
      ))}
    </div>
  )
}

/** the bills; several can be picked and what is left on them settled / paid, one payment per bill */
function Bills({ bills, S, canCost, pl, act }: { bills: Bill[]; S: boolean; canCost: boolean; pl: Fmt; act: Act }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const all = bills.length > 0 && bills.every((b) => sel.has(b.id))
  const picked = bills.filter((b) => sel.has(b.id) && num(b.due) > 0 && b.party_id)
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  async function go() {
    setBusy(true); setErr('')
    let n = 0
    try {
      for (const b of picked) {
        await api('POST', '/api/v1/payments', { party_id: b.party_id, direction: S ? 'in' : 'out', amount: num(b.due), allocations: [{ document_type: S ? 'invoice' : 'purchase', document_id: b.id, amount: num(b.due) }] })
        n += 1
      }
      setSel(new Set()); setConfirm(false)
      setDone(t(S ? 'stp.s.settleSelDone' : 'stp.p.paySelDone', { n }))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally {
      setBusy(false)
      if (n) await inv('bills-hub', 'invoices', 'party', 'parties', 'statement', 'party-units', 'party-khata', 'payments', 'dashboard', 'day', 'balances')
    }
  }
  if (!bills.length) return <Empty text={S ? 'stp.s.none' : 'stp.p.none'} />
  return (
    <section className="flex flex-col gap-2" data-testid="stp-bills">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={`flex min-h-10 cursor-pointer items-center gap-2 font-bold text-ink ${tiny}`}><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(bills.map((b) => b.id)) : new Set())} className="h-5 w-5" data-testid="stp-check-all" />{pick('stp.s.selectAll')} · {t(S ? 'stp.s.invTitle' : 'stp.p.billsTitle', { n: bills.length })}</label>
        {sel.size ? <span className="flex flex-wrap items-center gap-2"><span className={`text-muted ${tiny}`}>{t('stp.s.selected', { n: sel.size })}</span><button type="button" disabled={!picked.length} onClick={() => setConfirm(true)} className={`tap inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald px-3 font-bold text-white disabled:opacity-50 ${tiny}`} data-testid="stp-settle-sel"><Wallet size={15} />{pick(S ? 'stp.s.settleSel' : 'stp.p.paySel')}</button></span> : null}
      </div>
      {sel.size ? <span className={`text-muted ${tiny}`}>{pick('stp.s.noBulkDelete')}</span> : null}
      {done ? <BiAlert text={{ en: done, ur: done }} kind="success" /> : null}
      <div className="card divide-y divide-line p-0">
        {bills.map((b) => <BillCard key={b.id} b={b} S={S} canCost={canCost} pl={pl} act={act} checked={sel.has(b.id)} onCheck={(v) => { const n = new Set(sel); if (v) n.add(b.id); else n.delete(b.id); setSel(n); setDone('') }} />)}
      </div>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={{ en: t(S ? 'stp.s.settleSelTitle' : 'stp.p.paySelTitle', { n: picked.length }), ur: t(S ? 'stp.s.settleSelTitle' : 'stp.p.paySelTitle', { n: picked.length }) }}>
        <div className="flex flex-col gap-2" data-testid="stp-settle-sheet">
          <BiLabel text={S ? 'stp.s.settleSelSub' : 'stp.p.paySelSub'} size="sm" tone="text-muted" />
          {picked.map((b) => <div key={b.id} className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2"><span className="text-sm text-ink"><span className="num" dir="ltr">{b.no}</span> · <span dir="auto">{b.party_name}</span></span><span className={`num text-base ${S ? 'text-receivable' : 'text-payable'}`} dir="ltr">{rs(b.due)}</span></div>)}
          {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
          <BiButton text="ihub.apply" full loading={busy} onClick={() => void go()} data-testid="stp-settle-sel-go" />
        </div>
      </Sheet>
    </section>
  )
}
