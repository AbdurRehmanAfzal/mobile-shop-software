/** Every bill in one place (owner, 2026-10-27: "shopkeeper koi bhi invoice dekh sake"): sales,
 *  purchases, returns and repairs. Find one by bill number, the person's name or phone, or a phone's
 *  IMEI (Scan), for any period, and filter by what is still due. Tapping a bill opens its own page
 *  (print is there).
 *
 *  Owner 2026-11-26 (ADR-137, from the new product's file 24): the page is now the shop's bills
 *  centre — create a bill, the bills ledger report (A4 / Excel / CSV), profit shown or hidden, filters
 *  by kind of stock and payment mode beside type and money, five figures (sales, purchases, still to
 *  get, still to pay, net sales profit), and five views: all bills, dealer-wise, customer-wise, edited
 *  bills (what was corrected and why) and the full ledger; each bill has a quick view (print in
 *  English or Urdu, 80 mm or A4, WhatsApp, settle, correct, return items, delete, history). Every
 *  figure is the server's `/bills-hub/bills`; the page adds up nothing. */

import { BookOpen, Eye, EyeOff, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BtnText, Empty, List, Loading, PageHeader, SearchBox } from '@/components/ui'
import PeriodPicker, { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useModules } from '@/lib/modules'
import { useGet } from '@/lib/queries'
import { BillCard, BillSheet, CreateSheet, DeleteSheet, FixSheet, Groups, LedgerTable, ReportSheet, SettleSheet, kindKey, useShare, type Act, type BillRow, type HubData } from './InvoiceHub'

type State = 'paid' | 'due' | 'open' | 'returned' | 'void'
type View = 'bills' | 'dealers' | 'customers' | 'edited' | 'ledger'
const VIEWS: View[] = ['bills', 'dealers', 'customers', 'edited', 'ledger']
const MODES = ['cash', 'bank', 'online', 'cheque', 'remittance', 'udhaar'] as const

export default function InvoicesPage() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const has = useModules()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  // opened from the Shop Audit: the period and kind come in the link
  const [period, setPeriod] = useState<Period>(sp.get('from') && sp.get('to') ? { from: sp.get('from')!, to: sp.get('to')! } : periodOf('month'))
  const [kind, setKind] = useState<'all' | 'sale' | 'purchase' | 'return' | 'repair'>((['sale', 'purchase', 'return', 'repair'] as const).find((k) => k === sp.get('kind')) ?? 'all')
  const [state, setState] = useState<'all' | State>('all')
  const [cat, setCat] = useState('')
  const [mode, setMode] = useState('')
  const [view, setView] = useState<View>('bills')
  const [showCost, setShowCost] = useState(true)
  const [viewing, setViewing] = useState<BillRow | null>(null)
  const [settling, setSettling] = useState<BillRow | null>(null)
  const [fixing, setFixing] = useState<BillRow | null>(null)
  const [deleting, setDeleting] = useState<BillRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [report, setReport] = useState(false)
  const share = useShare()

  // a search looks through every date; otherwise the chosen period
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  else { const pq = new URLSearchParams(periodQuery(period)); const f = pq.get('date_from') ?? pq.get('from'); const to = pq.get('date_to') ?? pq.get('to'); if (f) params.set('date_from', f); if (to) params.set('date_to', to) }
  if (kind !== 'all') params.set('type', kind)
  if (state !== 'all') params.set('state', state === 'open' ? 'in_repair' : state)
  if (cat) params.set('kind', cat)
  if (mode) params.set('mode', mode)
  const { data, isLoading } = useGet<HubData>(['bills-hub', 'bills', params.toString()], `/api/v1/bills-hub/bills?${params}&limit=1000`)
  const sheet = `/api/v1/bills-hub/bills/sheet?${params}${view === 'edited' ? '&edited=true' : ''}`
  const rows = (data?.rows ?? []).filter((r) => view !== 'edited' || r.edited)
  const f = data?.figures
  const costOk = canCost && showCost
  const act: Act = { view: setViewing, settle: (r) => { setViewing(null); setSettling(r) }, fix: (r) => { setViewing(null); setFixing(r) }, del: (r) => { setViewing(null); setDeleting(r) }, share }
  const filtered = kind !== 'all' || state !== 'all' || !!cat || !!mode || !!q.trim()

  const small = ur ? cls('sm') : 'text-[13px]'
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${small}`
  const head = 'tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1'
  const kinds = [
    { v: 'all', t: 'common.all' },
    { v: 'sale', t: 'inv.kinds.sale' },
    ...(canCost ? [{ v: 'purchase', t: 'inv.kinds.purchase' }] : []),
    { v: 'return', t: 'inv.kinds.return' },
    { v: 'repair', t: 'inv.kinds.repair' },
  ] as const
  const states = [
    { v: 'all', t: 'common.all' },
    { v: 'due', t: 'inv.state.due' },
    { v: 'paid', t: 'inv.state.paid' },
    { v: 'open', t: 'inv.state.open' },
    { v: 'returned', t: 'inv.state.returned' },
    { v: 'void', t: 'inv.state.void' },
  ] as const
  const cats = ['', 'phone', ...(has('laptops') ? ['laptop'] : []), 'watch', 'tablet', ...(has('accessories') ? ['items'] : [])]
  const figure = (label: string, value: string, sub: string, tone: string, testid: string, onClick?: () => void, help?: string) => {
    const body = (
      <>
        <span className="flex items-center gap-1"><BiLabel text={label} size="sm" tone="text-muted" />{help ? <Help term={help} size="sm" /> : null}</span>
        <span className={`num text-lg ${tone}`} dir="ltr">{value}</span>
        <span className={`text-muted ${tiny}`}>{sub}</span>
      </>
    )
    return onClick
      ? <div className="relative" key={testid}><button type="button" onClick={onClick} className="card tap flex w-full flex-col gap-0.5 p-3 text-start" data-testid={testid}>{body}</button></div>
      : <div key={testid} className="card flex flex-col gap-0.5 p-3" data-testid={testid}>{body}</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="inv.title"
        help={<Help term="invoices.page" />}
        right={
          <div className="flex gap-2">
            {canCost ? <button type="button" aria-pressed={showCost} aria-label={pick(showCost ? 'ihub.profitVisible' : 'ihub.profitHidden')} onClick={() => setShowCost(!showCost)} className={head} data-testid="ihub-eye">{showCost ? <Eye size={18} /> : <EyeOff size={18} />}<BtnText k="ihub.profitShort" /></button> : null}
            <button type="button" onClick={() => setReport(true)} className={head} data-testid="ihub-report"><BookOpen size={18} /><BtnText k="ihub.reportShort" /></button>
            <button type="button" onClick={() => setCreating(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-emerald px-1.5 py-1 text-white" data-testid="ihub-create"><Plus size={18} /><BtnText k="ihub.newShort" /></button>
          </div>
        }
      />
      <BiLabel text="inv.hint" size="sm" tone="text-muted" />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="inv.search" scan /></div>
        <Help term="invoices.search" size="sm" />
      </div>
      {q.trim() ? <BiLabel text="inv.allDates" size="sm" tone="text-muted" /> : <PeriodPicker value={period} onChange={setPeriod} size="sm" />}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick('inv.type')}>
        {kinds.map((k) => (
          <button key={k.v} type="button" aria-pressed={kind === k.v} onClick={() => setKind(k.v as typeof kind)} className={chip(kind === k.v)}>{pick(k.t)}</button>
        ))}
        <Help term="invoices.kind" size="sm" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick('inv.stateLabel')}>
        {states.map((s) => (
          <button key={s.v} type="button" aria-pressed={state === s.v} onClick={() => setState(s.v)} className={chip(state === s.v)}>{pick(s.t)}</button>
        ))}
        <Help term="invoices.state" size="sm" />
      </div>
      {/* ADR-137: the kind of stock on the bill, and how it was paid */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick('ihub.cat.all')} data-testid="ihub-cats">
        {cats.map((k) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={chip(cat === k)} data-testid={`ihub-cat-${k || 'all'}`}>{pick(k ? kindKey(k) : 'ihub.cat.all')}</button>)}
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={pick('ihub.mode.all')} className={`tap h-10 rounded-full border-2 border-line bg-surface px-3 font-bold text-ink ${small}`} data-testid="ihub-mode">
          <option value="">{pick('ihub.mode.all')}</option>
          {MODES.map((m) => <option key={m} value={m}>{pick(`ihub.mode.${m}`)}</option>)}
        </select>
        {filtered ? <button type="button" onClick={() => { setKind('all'); setState('all'); setCat(''); setMode(''); setQ('') }} className={`tap inline-flex h-10 items-center gap-1 px-2 font-bold text-muted underline ${small}`} data-testid="ihub-reset"><RotateCcw size={14} />{pick('ihub.reset')}</button> : null}
      </div>

      {f ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="ihub-figures">
          {figure('ihub.k.sales', formatMoney(f.sales), t('ihub.k.salesSub', { n: f.sales_count }), 'text-ink', 'ihub-f-sales')}
          {canCost ? figure('ihub.k.purchases', formatMoney(f.purchases), t('ihub.k.purchasesSub', { n: f.purchases_count ?? 0 }), 'text-ink', 'ihub-f-purchases') : null}
          {figure('inv.toGet', formatMoney(f.to_get), pick('ihub.k.toGetSub'), 'text-receivable', 'ihub-f-toget', () => { setKind('sale'); setState('due') }, 'invoices.toGet')}
          {canCost ? figure('inv.toGive', formatMoney(f.to_pay), pick('ihub.k.toPaySub'), 'text-payable', 'ihub-f-topay', () => { setKind('purchase'); setState('due') }, 'invoices.toGive') : null}
          {canCost ? figure('ihub.k.profit', costOk ? formatMoney(f.profit) : '••••••', t('ihub.k.profitSub', { n: f.count, e: f.edited }), Number(f.profit ?? 0) < 0 ? 'text-payable' : 'text-emerald-deep', 'ihub-f-profit') : null}
        </div>
      ) : null}

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {VIEWS.filter((v) => v !== 'dealers' || canCost).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 font-bold ${view === v ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${small}`} data-testid={`ihub-view-${v}`}>
            {pick(`ihub.view.${v}`)}{v === 'edited' && f ? <span className="num text-xs opacity-80" dir="ltr">{f.edited}</span> : null}
          </button>
        ))}
      </div>
      {data && data.total_rows > data.rows.length ? <span className={`font-bold text-receivable ${tiny}`}>{t('ihub.partial', { n: data.rows.length, t: data.total_rows })}</span> : null}

      {isLoading || !data ? (
        <Loading />
      ) : view === 'ledger' ? (
        <LedgerTable rows={rows} costOk={costOk} canCost={canCost} />
      ) : view === 'dealers' || view === 'customers' ? (
        <Groups rows={rows} groups={data.parties.filter((g) => g.role === (view === 'dealers' ? 'dealer' : 'customer'))} role={view === 'dealers' ? 'dealer' : 'customer'} act={act} costOk={costOk} />
      ) : !rows.length ? (
        <Empty text="inv.none" />
      ) : (
        <>
          {view === 'edited' ? <BiLabel text="ihub.editedSub" size="sm" tone="text-muted" /> : null}
          <span className={`text-muted ${tiny}`}>
            <span className="num">{rows.length}</span> {pick('inv.count')}
          </span>
          <List>
            {rows.map((r) => <BillCard key={`${r.kind}-${r.id}`} r={r} act={act} costOk={costOk} />)}
          </List>
        </>
      )}

      <BillSheet r={viewing} costOk={costOk} canCost={canCost} act={act} onClose={() => setViewing(null)} />
      <SettleSheet r={settling} onClose={() => setSettling(null)} />
      <FixSheet r={fixing} onClose={() => setFixing(null)} />
      <DeleteSheet r={deleting} onClose={() => setDeleting(null)} />
      <CreateSheet open={creating} canCost={canCost} onClose={() => setCreating(false)} />
      <ReportSheet open={report} sheet={sheet} canCost={canCost} onClose={() => setReport(false)} />
    </div>
  )
}
