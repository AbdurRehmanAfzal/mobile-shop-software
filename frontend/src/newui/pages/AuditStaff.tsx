/** Shop audit → Staff & security in the new product (ADR-134), drawn from mock-up 22's ninth tab: a
 *  card per person (what they sold, bills, discount, profit, credit, returns, purchases, payments,
 *  expenses, and for the owner their security counts with the flags), and the owner's "immutable
 *  security & fraud log" (`?tab=security`): every price change, sale under asking / cost, discount,
 *  void, reversal, stock adjustment, opening balance, skipped ID check, wrong PIN and admin action —
 *  who, when, before → after, why, who approved — filtered by kind.
 *
 *  Every figure is the live audit's: `/shop-audit/staff` and `/shop-audit/security` (owner only, as
 *  the server); the reports are the live report's `staff` / `security`. Differences: the drawing's
 *  "Owner approve" / "Verify now" on a log line open the document or the phone — the log is a record
 *  and is never edited; an approval is given at the counter with the owner's PIN. */

import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ShieldAlert, UserRound, Users } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDateTime } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame, periodSearch } from './Audit'
import { Pill, Secret, SectionReport, Segs, Tile, Wait, card, n, useTab, type M } from '../auditKit'

interface Row {
  user_id: string | null
  user_name: string | null
  sales: { bills: number; units: number; billed: M; discount: M; on_credit: M; due: M; profit: M | null; returns: number; returns_amount: M } | null
  purchases: { bills: number; phones: number; items: number; total: M; owed: M } | null
  expenses: { count: number; amount: M } | null
  payments: { in_count: number; in_amount: M; out_count: number; out_amount: M } | null
  security: { kinds: Record<string, number>; total: number; flags: string[] } | null
}
interface Staff { rows: Row[]; totals: { people: number; sales_billed: M; sales_profit: M | null; discount: M; purchases_total: M | null; expenses: M }; security_shown: boolean }
interface FeedRow { at: string; kind: string; user_name: string | null; label: string; before: string | null; after: string | null; amount: string | null; reason: string | null; approved_by: string | null; ref: string | null; link: { type: string; id: string } | null }
interface Feed { counts: Record<string, number>; total: number; rows: FeedRow[]; by_user: { user_name: string; total: number; kinds: Record<string, number>; flags: string[] }[]; flag_at: Record<string, number>; kinds: string[] }

const BAD = ['below_asking', 'below_cost', 'void', 'reversal', 'bypass', 'pin_wrong', 'delete']
const num = (v: string | null) => (v == null || v === '' || isNaN(Number(v)) ? v ?? '—' : n(v))
const linkTo = (l: FeedRow['link']) => (!l ? null : l.type === 'device' ? `/new/item/${l.id}` : l.type === 'invoice' ? `/sales/${l.id}` : l.type === 'purchase' ? `/purchases/${l.id}` : l.type === 'party' ? `/new/parties/${l.id}` : l.type === 'payment' ? '/payments' : l.type === 'expense' ? '/new/expenses' : null)

export default function NewAuditStaff() {
  const { pick } = useLang()
  const owner = useAuth((s) => s.me?.user.role) === 'owner'
  const [tab, setTab] = useTab(owner ? (['staff', 'security'] as const) : (['staff'] as const))
  return (
    <AuditFrame section="staff" testid="nstf">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segs tabs={owner ? (['staff', 'security'] as const) : (['staff'] as const)} value={tab} onChange={setTab} label={(t) => <span className="flex items-center gap-1.5">{t === 'staff' ? <Users className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}{pick(`audit.nav.${t}`)}</span>} testid="nstf-tab" />
        <SectionReport sections={[tab]} name={tab === 'staff' ? 'staff-report' : 'security-report'} testid="nstf-report" />
      </div>
      {tab === 'staff' ? <StaffTab /> : <SecurityTab />}
    </AuditFrame>
  )
}

function StaffTab() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const search = periodSearch(window.location.search)
  const { data } = useGet<Staff>(['audit-staff', query], `/api/v1/shop-audit/staff?${query}`)
  if (!data) return <Wait />
  const stat = (k: string, v: ReactNode) => <div><div className="text-[10px] font-bold uppercase text-slate-400">{pick(k)}</div><div className="font-mono font-bold" dir="ltr">{v}</div></div>
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile tone="dark" label={pick('audit.staff.title')} value={withCur(n(data.totals.sales_billed))} testid="nstf-total" sub={<><span dir="ltr">{data.totals.people}</span> {pick('audit.people')} · {pick('counter.discounts')} <span dir="ltr">{n(data.totals.discount)}</span></>} />
        {data.totals.sales_profit != null ? <Tile tone="lime" label={pick('counter.grossProfit')} value={<Secret>{withCur(n(data.totals.sales_profit))}</Secret>} testid="nstf-profit" /> : null}
        <Tile label={pick('audit.expenses')} value={withCur(n(data.totals.expenses))} testid="nstf-expenses" sub={data.totals.purchases_total != null ? <>{pick('audit.trade.purchases')} <span dir="ltr"><Secret>{n(data.totals.purchases_total)}</Secret></span></> : null} />
      </div>
      <p className="text-xs text-slate-500">{pick(data.security_shown ? 'audit.staff.hintOwner' : 'audit.staff.hint')}</p>
      {!data.rows.length ? <p className="py-8 text-center text-sm text-slate-400">{pick('audit.noData')}</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="nstf-rows">
          {data.rows.map((r, i) => (
            <section key={i} className={`p-5 space-y-3 ${card}`} data-testid="nstf-person">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display font-extrabold text-base flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-obsidian-800 flex items-center justify-center"><UserRound className="w-4 h-4" /></span><span dir="auto">{r.user_name ?? '—'}</span></h4>
                {r.security?.flags.length ? <Pill tone="amber"><AlertTriangle className="inline w-3 h-3 me-1" />{r.security.flags.map((f) => pick(`audit.sec.k.${f}`)).join(' · ')}</Pill> : r.security ? <Pill tone="emerald">{pick('nau.stf.clean')}</Pill> : null}
              </div>
              {r.sales ? (
                <Link to={`/new/audit/sales${search}${search ? '&' : '?'}view=bills`} className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 text-xs">
                  {stat('audit.staff.sold', withCur(n(r.sales.billed)))}
                  {stat('audit.bills', r.sales.bills)}
                  {stat('counter.discounts', n(r.sales.discount))}
                  {r.sales.profit != null ? stat('counter.grossProfit', <Secret>{n(r.sales.profit)}</Secret>) : null}
                  {stat('audit.trade.onCredit', n(r.sales.on_credit))}
                  {stat('audit.trade.returns', r.sales.returns)}
                </Link>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {r.purchases ? <span>{pick('audit.trade.purchases')} <b dir="ltr">{r.purchases.bills}</b> · <b dir="ltr"><Secret>{n(r.purchases.total)}</Secret></b></span> : null}
                {r.payments ? <span>{pick('audit.staff.payments')} <b dir="ltr">{r.payments.in_count} / {r.payments.out_count}</b> · <span dir="ltr">+{n(r.payments.in_amount)} / −{n(r.payments.out_amount)}</span></span> : null}
                {r.expenses ? <span>{pick('audit.expenses')} <b dir="ltr">{r.expenses.count}</b> · <b dir="ltr">{n(r.expenses.amount)}</b></span> : null}
              </div>
              {r.security && r.security.total ? (
                <Link to={`/new/audit/staff${search}${search ? '&' : '?'}tab=security`} className="flex flex-wrap gap-1.5" data-testid="nstf-security">{Object.entries(r.security.kinds).map(([k, v]) => <Pill key={k} tone={r.security?.flags.includes(k) ? 'rose' : 'slate'}>{pick(`audit.sec.k.${k}`)} <span dir="ltr">{v}</span></Pill>)}</Link>
              ) : null}
              <Link to="/more/staff?tab=activity" className="inline-block text-xs font-bold underline text-slate-500">{pick('audit.staff.log')}</Link>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SecurityTab() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const kind = sp.get('kind')
  const setKind = (k: string | null) => { const o = new URLSearchParams(sp); if (k) o.set('kind', k); else o.delete('kind'); setSp(o, { replace: true }) }
  const { data, error } = useGet<Feed>(['audit-security', query, kind], `/api/v1/shop-audit/security?${query}${kind ? `&kind=${kind}` : ''}`)
  if (error) return <p className="py-8 text-center text-sm text-slate-400">{pick('audit.sec.ownerOnly')}</p>
  if (!data) return <Wait />
  const on = 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950'
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">{pick('audit.sec.hint')}</p>
      <div className="flex flex-wrap gap-1.5 text-xs" data-testid="nstf-kinds">
        <button type="button" onClick={() => setKind(null)} aria-pressed={!kind} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${!kind ? on : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`}>{pick('common.all')} · <span dir="ltr">{data.total}</span></button>
        {data.kinds.filter((k) => data.counts[k]).map((k) => <button key={k} type="button" onClick={() => setKind(kind === k ? null : k)} aria-pressed={kind === k} data-testid={`nstf-k-${k}`} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${kind === k ? on : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800'}`}>{pick(`audit.sec.k.${k}`)} · <span dir="ltr">{data.counts[k]}</span></button>)}
      </div>
      <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nstf-users">
        <h3 className="font-display font-extrabold text-sm">{pick('audit.sec.byUser')}</h3>
        {!data.by_user.length ? <p className="text-xs text-slate-400">—</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{data.by_user.map((u) => <div key={u.user_name} className="py-2 flex flex-wrap items-center justify-between gap-2"><span className="font-bold" dir="auto">{u.user_name}{u.flags.length ? <span className="ms-2"><Pill tone="rose">{pick('audit.sec.flagged')}: {u.flags.map((f) => pick(`audit.sec.k.${f}`)).join(', ')}</Pill></span> : null}</span><span className="text-slate-500">{Object.entries(u.kinds).map(([k, c]) => `${pick(`audit.sec.k.${k}`)} ${c}`).join(' · ')}</span></div>)}</div>}
        <p className="text-[11px] text-slate-500">{pick('audit.sec.flagHint')} {Object.entries(data.flag_at).map(([k, v]) => `${pick(`audit.sec.k.${k}`)} ≥ ${v}`).join(' · ')}</p>
      </section>
      <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nstf-log">
        <h3 className="font-display font-extrabold text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4" />{pick('nau.stf.log')}</h3>
        {!data.rows.length ? <p className="text-xs text-slate-400">{pick('audit.sec.none')}</p> : data.rows.map((r, i) => {
          const to = linkTo(r.link)
          const bad = BAD.includes(r.kind)
          return (
            <div key={i} className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${bad ? 'bg-rose-500/10 border-rose-500/25' : 'bg-amber-500/10 border-amber-500/25'}`} data-testid="nstf-log-row">
              <div className="min-w-0">
                <strong className={bad ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'}>{pick(`audit.sec.k.${r.kind}`)}{r.amount != null ? <span dir="ltr"> ({num(r.amount)})</span> : null}</strong> · <span dir="auto">{r.label}</span>{r.ref && r.ref !== r.label ? <span className="text-slate-500" dir="ltr"> · {r.ref}</span> : null}
                <div className="text-[11px] text-slate-500 mt-0.5"><span dir="auto">{r.user_name ?? '—'}</span> · <span dir="ltr">{fmtDateTime(r.at)}</span>{r.before != null || r.after != null ? <> · <span dir="ltr">{num(r.before)} → {num(r.after)}</span></> : null}{r.reason ? <> · <span dir="auto">{r.reason}</span></> : null}{r.approved_by ? <> · {pick('unit.approved')}: <span dir="auto">{r.approved_by}</span></> : null}</div>
              </div>
              {to ? <Link to={to} className="px-2.5 py-1 rounded-lg bg-obsidian-950 dark:bg-white text-white dark:text-obsidian-950 font-bold text-[10px] shrink-0">{pick('nau.open')}</Link> : null}
            </div>
          )
        })}
      </section>
      <p className="text-[11px] text-slate-500">{pick('audit.sec.notes')}</p>
    </div>
  )
}
