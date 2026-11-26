/** Shop audit → Udhaar & len-den in the new product (ADR-134), drawn from mock-up 22's fifth tab: the
 *  drawing's two columns — people who owe us (lene hain) and people we owe (dene hain), each person
 *  with how old or how late the debt is and a "+ Receive" / "Pay" that opens their khata — under the
 *  balances start → end → now, the period's movement, overdue and age bands, the phones on unpaid
 *  bills and the installments; and len-den (`?tab=lending`): owed to us / we owe, given and taken in
 *  the period, the return dates, by person, by method and every entry.
 *
 *  Every figure is the live audit's: `/shop-audit/udhaar` and `/shop-audit/lending`; the sections'
 *  reports are the live report's `udhaar` / `lending`. Money is never taken here: "+ Receive" opens
 *  the person's khata (`/new/parties/:id`), where payments are recorded. What we owe is shown to the
 *  owner / manager, as the server. The drawing's due notes ("20d late") are the server's overdue days
 *  where a bill carries a promise date; otherwise the age from the oldest unpaid bill (docs/16 §7). */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, BookOpen, HandCoins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame } from './Audit'
import { Caps, HBars, Notes, Pill, SectionReport, Segs, Tile, Wait, card, n, useTab, type M } from '../auditKit'

interface Bal { opening: M; closing: M; as_of: M; current: M; parties: number }
interface Band { band: string; amount: M; parties: number }
interface Row { party_id: string; name: string | null; phone: string | null; amount: M; oldest_bill: string | null; age_days: number | null; band: string; last_payment: string | null; due_date: string | null; overdue_days: number }
interface Phone { side: 'receivable' | 'payable'; party_name: string | null; device_id: string; label: string; imei1: string; doc_type: string; doc_id: string; no: string; date: string; doc_remaining: M | null; age_days: number; due_date: string | null; overdue_days: number }
interface Plans { open: number; remaining: M; late_plans: number; late_amount: M; rows: { id: string; invoice_no: string; party_name: string; item: string; remaining: M; overdue_count: number; next_due: string | null; days_late: number }[] }
interface Udhaar { lending?: { receivable: M; payable: M }; installments?: Plans; receivable: Bal; payable: Bal; received_in_period: M; paid_in_period: M; movement: Record<string, M | null>; receivable_bands: Band[]; payable_bands: Band[]; receivable_overdue: M; payable_overdue: M | null; receivable_overdue_bands: Band[]; payable_overdue_bands: Band[]; receivable_rows: Row[]; payable_rows: Row[]; phones: Phone[]; notes: string[] }
interface Open { amount: M; people: number }
interface Lending {
  due: { party_id: string; name: string | null; side: 'owes_us' | 'we_owe'; amount: M; due_date: string; days_late: number; status: 'late' | 'today' | 'soon' | 'later' }[]
  totals: { lent: M; borrowed: M; lent_count: number; borrowed_count: number; previous_lent: M; previous_borrowed: M; voided: number; adjusted_on_bills: M }
  owed_to_shop: Open; shop_owes: Open; as_of: { owed_to_shop: Open; shop_owes: Open }
  by_method: { method: string; lent: M; borrowed: M }[]
  people: { party_id: string; name: string | null; lent: M; borrowed: M; open: M; khata: M; last_date: string | null }[]
  entries: { id: string; no: string; party_id: string; party_name: string | null; direction: 'in' | 'out'; amount: M; date: string; notes: string | null; by: string | null }[]
}

const TABS = ['udhaar', 'lending'] as const
const MOVES = ['udhaar_given', 'received', 'sale_returns', 'udhaar_taken', 'paid', 'purchase_returns', 'lent', 'borrowed', 'repairs', 'other'] as const

export default function NewAuditUdhaar() {
  const { pick } = useLang()
  const [tab, setTab] = useTab(TABS)
  return (
    <AuditFrame section="udhaar" testid="nud">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segs tabs={TABS} value={tab} onChange={setTab} label={(t) => <span className="flex items-center gap-1.5">{t === 'udhaar' ? <BookOpen className="w-3.5 h-3.5" /> : <HandCoins className="w-3.5 h-3.5" />}{pick(t === 'udhaar' ? 'audit.nav.udhaar' : 'audit.nav.lending')}</span>} testid="nud-tab" />
        <SectionReport sections={[tab]} name={tab === 'udhaar' ? 'udhaar' : 'len-den'} testid="nud-report" />
      </div>
      {tab === 'udhaar' ? <UdhaarTab /> : <LendingTab />}
    </AuditFrame>
  )
}

function UdhaarTab() {
  const { pick } = useLang()
  const { t } = useTranslation()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const { data } = useGet<Udhaar>(['audit-udhaar', query], `/api/v1/shop-audit/udhaar?${query}`)
  if (!data) return <Wait />
  const asOf = !!period.asOf
  const main = (b: Bal) => (asOf ? b.as_of : b.closing)
  const bandLabel = (b: string) => (b === 'no_bill' ? pick('audit.udhaar.noBill') : b === 'no_due_date' ? pick('audit.udhaar.noDueDate') : b === 'not_due' ? pick('audit.udhaar.notDue') : `${b} ${pick('audit.days')}`)
  const bands = (rows: Band[]) => rows.map((b) => ({ key: b.band, label: bandLabel(b.band), value: b.amount, hint: <><span dir="ltr">{b.parties}</span> {pick('audit.people')}</> }))
  const note = (r: Row) => (r.overdue_days > 0 ? t('audit.udhaar.overdueBy', { n: r.overdue_days }) : r.due_date ? `${pick('audit.udhaar.dueOn')} ${fmtDate(r.due_date)}` : r.age_days != null ? `${r.age_days} ${pick('audit.days')}` : pick('audit.udhaar.noBill'))
  const overdue = data.receivable_overdue_bands.some((b) => b.band !== 'no_due_date' && b.parties) || data.payable_overdue_bands.some((b) => b.band !== 'no_due_date' && b.parties)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile tone="amber" Icon={ArrowDownLeft} label={pick('audit.receivable')} value={withCur(n(main(data.receivable)))} testid="nud-receivable" sub={<>{pick('audit.opening')} <span dir="ltr">{n(data.receivable.opening)}</span> · {pick('audit.now')} <span dir="ltr">{n(data.receivable.current)}</span> · <span dir="ltr">{data.receivable.parties}</span> {pick('audit.people')}</>} />
        {canCost ? <Tile tone="rose" Icon={ArrowUpRight} label={pick('audit.payable')} value={withCur(n(main(data.payable)))} testid="nud-payable" sub={<>{pick('audit.opening')} <span dir="ltr">{n(data.payable.opening)}</span> · {pick('audit.now')} <span dir="ltr">{n(data.payable.current)}</span> · <span dir="ltr">{data.payable.parties}</span> {pick('audit.people')}</>} /> : null}
        <Tile label={pick('audit.receivedInPeriod')} value={withCur(n(data.received_in_period))} valueTone="text-emerald-600 dark:text-[#A3E635]" testid="nud-received" sub={Number(data.receivable_overdue) ? <span className="text-rose-600 font-bold">{pick('audit.udhaar.overdue')} <span dir="ltr">{n(data.receivable_overdue)}</span></span> : null} />
        {canCost ? <Tile label={pick('audit.paidInPeriod')} value={withCur(n(data.paid_in_period))} testid="nud-paid" sub={data.payable_overdue != null && Number(data.payable_overdue) ? <span className="text-rose-600 font-bold">{pick('audit.udhaar.overdue')} <span dir="ltr">{n(data.payable_overdue)}</span></span> : null} /> : null}
      </div>
      {data.lending && (Number(data.lending.receivable) || Number(data.lending.payable)) ? (
        <p className="text-xs text-slate-500" data-testid="nud-of-lending">{pick('audit.udhaar.ofLending')}: {pick('audit.lend.owedToShop')} <b dir="ltr">{n(data.lending.receivable)}</b>{canCost ? <> · {pick('audit.lend.shopOwes')} <b dir="ltr">{n(data.lending.payable)}</b></> : null}</p>
      ) : null}

      <div className={`grid grid-cols-1 ${canCost ? 'lg:grid-cols-2' : ''} gap-5`}>
        <People tone="amber" title={<>{pick('audit.udhaar.owesUs')} — <span dir="ltr">{withCur(n(main(data.receivable)))}</span></>} count={data.receivable.parties} rows={data.receivable_rows} note={note} action={pick('nau.ud.receive')} testid="nud-owes-us" />
        {canCost ? <People tone="rose" title={<>{pick('audit.udhaar.weOwe')} — <span dir="ltr">{withCur(n(main(data.payable)))}</span></>} count={data.payable.parties} rows={data.payable_rows} note={note} action={pick('nau.ud.pay')} testid="nud-we-owe" /> : null}
      </div>

      <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nud-movement">
        <h3 className="font-display font-extrabold text-sm">{pick('audit.udhaar.movement')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">{MOVES.map((k) => data.movement[k] == null ? null : <div key={k} className="flex items-center justify-between gap-2"><span className="text-slate-500">{pick(`audit.udhaar.m.${k}`)}</span><b className="font-mono" dir="ltr">{n(data.movement[k])}</b></div>)}</div>
      </section>

      {overdue ? (
        <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nud-overdue">
          <div><h3 className="font-display font-extrabold text-sm">{pick('audit.udhaar.overdueTitle')}</h3><p className="text-[11px] text-slate-500">{pick('audit.udhaar.overdueHint')}</p></div>
          <div className={`grid grid-cols-1 ${canCost ? 'md:grid-cols-2' : ''} gap-5`}>
            <div><Caps className="block mb-2 text-amber-700 dark:text-amber-300">{pick('audit.receivable')}</Caps><HBars rows={bands(data.receivable_overdue_bands)} tone="bg-rose-500" /></div>
            {canCost ? <div><Caps className="block mb-2 text-rose-600">{pick('audit.payable')}</Caps><HBars rows={bands(data.payable_overdue_bands)} tone="bg-rose-500" /></div> : null}
          </div>
        </section>
      ) : null}

      <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nud-age">
        <div><h3 className="font-display font-extrabold text-sm">{pick('audit.udhaar.age')}</h3><p className="text-[11px] text-slate-500">{pick('audit.udhaar.ageHint')}</p></div>
        <div className={`grid grid-cols-1 ${canCost ? 'md:grid-cols-2' : ''} gap-5`}>
          <div><Caps className="block mb-2 text-amber-700 dark:text-amber-300">{pick('audit.receivable')}</Caps><HBars rows={bands(data.receivable_bands)} tone="bg-amber-500" /></div>
          {canCost ? <div><Caps className="block mb-2 text-rose-600">{pick('audit.payable')}</Caps><HBars rows={bands(data.payable_bands)} tone="bg-rose-400" /></div> : null}
        </div>
      </section>

      <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nud-phones">
        <h3 className="font-display font-extrabold text-sm">{pick('audit.udhaar.phones')}</h3>
        {!data.phones.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.phones.map((p, i) => (
            <Link key={i} to={`/new/item/${p.device_id}`} className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-obsidian-850/60">
              <div className="min-w-0"><div className="font-bold truncate" dir="auto">{p.label} <span className="font-mono font-normal text-slate-400" dir="ltr">· {p.imei1}</span></div><div className="text-[11px] text-slate-500"><span dir="auto">{p.party_name ?? '—'}</span> · <span dir="ltr">{p.no} · {fmtDate(p.date)}</span> · <span dir="ltr">{p.age_days}</span> {pick('audit.days')}{p.overdue_days > 0 ? <span className="text-rose-600 font-bold"> · {t('audit.udhaar.overdueBy', { n: p.overdue_days })}</span> : p.due_date ? <> · {pick('audit.udhaar.dueOn')} <span dir="ltr">{fmtDate(p.due_date)}</span></> : null}</div></div>
              <div className="text-end shrink-0"><div className={`font-mono font-extrabold ${p.side === 'receivable' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-600'}`} dir="ltr">{n(p.doc_remaining)}</div><div className="text-[10px] text-slate-400">{pick(p.side === 'receivable' ? 'audit.udhaar.theyOwe' : 'audit.udhaar.weOweShort')}</div></div>
            </Link>
          ))}</div>
        )}
      </section>

      {data.installments && data.installments.open ? (
        <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nud-plans">
          <h3 className="font-display font-extrabold text-sm">{pick('audit.udhaar.plans')}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div><div className="text-slate-500">{pick('audit.udhaar.plansOpen')}</div><div className="font-display font-extrabold text-lg" dir="ltr">{data.installments.open}</div></div>
            <div><div className="text-slate-500">{pick('audit.udhaar.plansLeft')}</div><div className="font-display font-extrabold text-lg" dir="ltr">{withCur(n(data.installments.remaining))}</div></div>
            <div><div className="text-slate-500">{pick('audit.udhaar.plansLate')}</div><div className="font-display font-extrabold text-lg text-rose-600" dir="ltr">{data.installments.late_plans}</div></div>
            <div><div className="text-slate-500">{pick('audit.udhaar.plansLateAmount')}</div><div className="font-display font-extrabold text-lg text-rose-600" dir="ltr">{withCur(n(data.installments.late_amount))}</div></div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.installments.rows.map((r) => (
            <Link key={r.id} to={`/new/installments/${r.id}`} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.party_name} <span className="font-normal text-slate-400" dir="ltr">· {r.invoice_no}</span></div><div className="text-[11px] text-slate-500" dir="auto">{r.item}{r.next_due ? <> · {pick('audit.udhaar.dueOn')} <span dir="ltr">{fmtDate(r.next_due)}</span></> : null}{r.overdue_count ? <span className="text-rose-600"> · {t('audit.udhaar.overdueBy', { n: r.days_late })}</span> : null}</div></div><span className="font-mono font-extrabold text-amber-700 dark:text-amber-300" dir="ltr">{n(r.remaining)}</span></Link>
          ))}</div>
          <p className="text-[11px] text-slate-500">{pick('audit.udhaar.plansNote')}</p>
        </section>
      ) : null}
      <p className="text-[11px] text-slate-500">{pick('audit.udhaar.notes')}</p>
      <Notes notes={data.notes} />
    </div>
  )
}

function People({ tone, title, count, rows, note, action, testid }: { tone: 'amber' | 'rose'; title: ReactNode; count: number; rows: Row[]; note: (r: Row) => string; action: string; testid: string }) {
  const { pick } = useLang()
  return (
    <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid={testid}>
      <div className="flex items-center justify-between gap-2"><h3 className={`font-display font-extrabold text-sm ${tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400'}`}>{title}</h3><span className="text-xs font-bold text-slate-400 shrink-0"><span dir="ltr">{count}</span> {pick('audit.people')}</span></div>
      {!rows.length ? <p className="text-xs text-slate-400">—</p> : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{rows.map((r) => (
          <div key={r.party_id} className="py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0"><Link to={`/new/parties/${r.party_id}`} className="block font-bold truncate hover:underline" dir="auto">{r.name ?? '—'}</Link><div className={`text-[11px] ${r.overdue_days > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{note(r)} · {r.last_payment ? <>{pick('audit.udhaar.lastPaid')} <span dir="ltr">{fmtDate(r.last_payment)}</span></> : pick('audit.udhaar.neverPaid')}</div></div>
            <div className="flex items-center gap-2 shrink-0"><span className={`font-mono font-extrabold ${tone === 'rose' ? 'text-rose-600' : ''}`} dir="ltr">{withCur(n(r.amount))}</span><Link to={`/new/parties/${r.party_id}`} className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${tone === 'amber' ? 'bg-[#A3E635] text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-800'}`}>{action}</Link></div>
          </div>
        ))}</div>
      )}
    </section>
  )
}

function LendingTab() {
  const { pick } = useLang()
  const { t } = useTranslation()
  const { period, query } = useAuditPeriod()
  const { data: d } = useGet<Lending>(['audit-lending', query], `/api/v1/shop-audit/lending?${query}`)
  if (!d) return <Wait />
  const asOf = !!period.asOf
  const owed = asOf ? d.as_of.owed_to_shop : d.owed_to_shop
  const owes = asOf ? d.as_of.shop_owes : d.shop_owes
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">{pick('audit.lend.hint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile tone="amber" Icon={ArrowDownLeft} label={pick('audit.lend.owedToShop')} value={withCur(n(owed.amount))} testid="nud-l-owed" sub={<><span dir="ltr">{owed.people}</span> {pick('audit.people')}</>} />
        <Tile tone="rose" Icon={ArrowUpRight} label={pick('audit.lend.shopOwes')} value={withCur(n(owes.amount))} testid="nud-l-owes" sub={<><span dir="ltr">{owes.people}</span> {pick('audit.people')}</>} />
        <Tile label={pick('audit.lend.lent')} value={withCur(n(d.totals.lent))} testid="nud-l-lent" sub={<><span dir="ltr">{d.totals.lent_count}</span> · {pick('audit.lend.prev')} <span dir="ltr">{n(d.totals.previous_lent)}</span></>} />
        <Tile label={pick('audit.lend.borrowed')} value={withCur(n(d.totals.borrowed))} testid="nud-l-borrowed" sub={<><span dir="ltr">{d.totals.borrowed_count}</span> · {pick('audit.lend.prev')} <span dir="ltr">{n(d.totals.previous_borrowed)}</span></>} />
      </div>
      <p className="text-xs text-slate-500">{pick('audit.lend.adjusted')} <b dir="ltr">{n(d.totals.adjusted_on_bills)}</b> · {pick('audit.lend.voided')} <b dir="ltr">{d.totals.voided}</b>{d.by_method.length ? <> · {pick('audit.lend.byMethod')}: {d.by_method.map((m) => <span key={m.method}>{pick(`pay.${m.method}`)} <span dir="ltr">+{n(m.borrowed)} / −{n(m.lent)}</span> </span>)}</> : null}</p>

      {d.due.length ? (
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nud-l-due">
          <div><h3 className="font-display font-extrabold text-sm">{pick('audit.lend.due')}</h3><p className="text-[11px] text-slate-500">{pick('audit.lend.dueHint')}</p></div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{d.due.map((r) => (
            <Link key={`${r.party_id}${r.side}`} to={`/new/parties/${r.party_id}`} className={`py-2.5 px-2 -mx-2 rounded-lg flex items-center gap-3 ${r.status === 'late' ? 'bg-rose-500/10' : ''}`}>
              <Pill tone={r.status === 'late' ? 'rose' : r.status === 'later' ? 'slate' : 'amber'}>{pick(`audit.lend.st.${r.status}`)}</Pill>
              <div className="min-w-0 flex-1"><div className="font-bold truncate" dir="auto">{r.name ?? '—'}</div><div className="text-[11px] text-slate-500">{pick(r.side === 'we_owe' ? 'lending.weOwe' : 'lending.theyOwe')} · <span dir="ltr">{fmtDate(r.due_date)}</span>{r.days_late ? <> · {t('lending.lateBy', { n: r.days_late })}</> : null}</div></div>
              <span className={`font-mono font-extrabold ${r.side === 'we_owe' ? 'text-rose-600' : 'text-amber-700 dark:text-amber-300'}`} dir="ltr">{n(r.amount)}</span>
            </Link>
          ))}</div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nud-l-people">
          <h3 className="font-display font-extrabold text-sm">{pick('audit.lend.people')}</h3>
          {!d.people.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{d.people.map((r) => { const o = Number(r.open); return (
            <Link key={r.party_id} to={`/new/parties/${r.party_id}`} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.name ?? '—'}</div><div className="text-[11px] text-slate-500">{pick('lending.lent')} <span dir="ltr">{n(r.lent)}</span> · {pick('lending.borrowed')} <span dir="ltr">{n(r.borrowed)}</span> · {pick('audit.lend.khata')} <span dir="ltr">{n(r.khata)}</span>{r.last_date ? <> · <span dir="ltr">{fmtDate(r.last_date)}</span></> : null}</div></div><div className="text-end shrink-0"><div className={`font-mono font-extrabold ${o > 0 ? 'text-amber-700 dark:text-amber-300' : o < 0 ? 'text-rose-600' : 'text-slate-400'}`} dir="ltr">{n(Math.abs(o))}</div><div className="text-[10px] text-slate-400">{pick(o > 0 ? 'lending.theyOwe' : o < 0 ? 'lending.weOwe' : 'lending.clear')}</div></div></Link>
          ) })}</div>}
        </section>
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nud-l-entries">
          <h3 className="font-display font-extrabold text-sm">{pick('audit.lend.entries')}</h3>
          {!d.entries.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{d.entries.map((e) => (
            <Link key={e.id} to={`/new/parties/${e.party_id}`} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{e.party_name ?? '—'} · {pick(e.direction === 'out' ? 'lending.lent' : 'lending.borrowed')}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{e.no} · {fmtDate(e.date)}</span>{e.by ? ` · ${e.by}` : ''}{e.notes ? ` · ${e.notes}` : ''}</div></div><span className={`font-mono font-extrabold ${e.direction === 'out' ? 'text-rose-600' : 'text-emerald-600'}`} dir="ltr">{e.direction === 'out' ? '−' : '+'}{n(e.amount)}</span></Link>
          ))}</div>}
        </section>
      </div>
    </div>
  )
}
