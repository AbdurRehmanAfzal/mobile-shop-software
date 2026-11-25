/** Shop audit → Returns & repairs in the new product (ADR-134), drawn from mock-up 22's eighth tab
 *  ("Returns & active repair lab tracker"): the repairs of the period — taken in, given back, open,
 *  ready, late, at a lab; income, parts, lab charges, profit; every lab's record; the jobs and lab
 *  trips that are late (each opens its job); the most common faults — and the returns report of the
 *  period (`?tab=returns`, customers' returns and returns to suppliers apart, ADR-097).
 *
 *  Every figure is the live audit's: `/shop-audit/repairs` and `/shop-audit/returns` (reports:
 *  `repairs`; the returns report has its own downloads). The returns are the live report's component
 *  in the audit's frame (one code path for the returns figures). Differences: the drawing's "Mark
 *  ready" is done on the job's own page (`/new/repairs/:id`), never from an audit. */

import { Link } from 'react-router-dom'
import { AlertTriangle, FlaskConical, Undo2, Wrench } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import ReturnsReport from '@/features/more/ReturnsReport'
import { AuditFrame } from './Audit'
import { HBars, Pill, Secret, SectionReport, Segs, Wait, card, n, useTab, type M } from '../auditKit'

interface Repairs {
  counts: Record<'came' | 'given' | 'not_fixed' | 'open_now' | 'ready_now' | 'late_now' | 'at_lab_now' | 'late_at_lab', number>
  money: { income: M; parts: M | null; lab_customer: M | null; lab_stock: M | null; lab_waiting?: M | null; profit: M | null; avg_bill: M }
  labs: { party_id: string; name: string; sent: number; at_lab: number; fixed: number; not_fixed: number; fix_rate: number | null; avg_days: number | null; cost: M }[]
  faults: { code: string; en: string; ur: string; count: number }[]
  late_jobs: { id: string; no: string; device_desc: string; customer: string | null; days_late: number | null }[]
  late_at_lab: { id: string; job_id: string; job_no: string | null; device_desc: string | null; lab_name: string | null; expected_back: string | null; days: number }[]
}
const TABS = ['repairs', 'returns'] as const
const COUNTS = [['came', 'came'], ['given', 'given'], ['not_fixed', 'notFixed'], ['open_now', 'openNow'], ['ready_now', 'readyNow'], ['late_now', 'lateNow'], ['at_lab_now', 'atLabNow'], ['late_at_lab', 'lateAtLab']] as const
const MONEY = [['income', 'income'], ['parts', 'parts'], ['lab_customer', 'labCustomer'], ['profit', 'profit'], ['lab_stock', 'labStock'], ['lab_waiting', 'labWaiting'], ['avg_bill', 'avgBill']] as const

export default function NewAuditReturns() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const [tab, setTab] = useTab(TABS)
  return (
    <AuditFrame section="returns" testid="nret">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segs tabs={TABS} value={tab} onChange={setTab} label={(t) => <span className="flex items-center gap-1.5">{t === 'repairs' ? <Wrench className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />}{pick(`audit.nav.${t}`)}</span>} testid="nret-tab" />
        {tab === 'repairs' ? <SectionReport sections={['repairs']} name="repairs" testid="nret-report" /> : null}
      </div>
      {tab === 'repairs' ? <RepairsTab /> : <section className={`p-4 sm:p-5 ${card}`} data-testid="nret-returns"><ReturnsReport url={`/api/v1/shop-audit/returns?${query}`} qk={['audit-returns', query]} /></section>}
    </AuditFrame>
  )
}

function RepairsTab() {
  const { pick, ur } = useLang()
  const { query } = useAuditPeriod()
  const { data: d } = useGet<Repairs>(['audit-repairs', query], `/api/v1/shop-audit/repairs?${query}`)
  if (!d) return <Wait />
  const late = d.late_at_lab.length + d.late_jobs.length
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3" data-testid="nret-counts">
        {COUNTS.map(([k, key]) => <div key={k} className={`p-3 rounded-xl border ${(k === 'late_now' || k === 'late_at_lab') && d.counts[k] ? 'bg-rose-500/10 border-rose-500/25' : 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800'}`} data-testid={`nret-c-${k}`}><div className="text-[11px] font-bold text-slate-500">{pick(`audit.repairs.${key}`)}</div><div className="font-display font-extrabold text-xl" dir="ltr">{d.counts[k]}</div></div>)}
      </div>
      <section className={`p-4 sm:p-5 ${card}`} data-testid="nret-money">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">{MONEY.map(([k, key]) => { const v = d.money[k]; return v == null ? null : <div key={k}><div className="text-slate-500 font-bold">{pick(`audit.repairs.${key}`)}</div><div className={`font-mono font-extrabold text-base ${k === 'profit' ? 'text-emerald-600 dark:text-[#A3E635]' : ''}`} dir="ltr">{k === 'income' || k === 'avg_bill' ? withCur(n(v)) : <Secret>{withCur(n(v))}</Secret>}</div></div> })}</div>
      </section>
      <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nret-late">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('audit.repairs.needsLook')}</h3><span className="text-xs font-bold text-slate-400"><span dir="ltr">{late}</span></span></div>
        {!late ? <p className="text-xs text-emerald-600 font-bold">{pick('nau.nothingNeedsLook')}</p> : (
          <div className="space-y-2.5">
            {d.late_at_lab.map((t) => <Link key={t.id} to={`/new/repairs/${t.job_id}`} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"><div className="min-w-0"><div className="font-bold"><span className="font-mono text-slate-400 me-1.5" dir="ltr">{t.job_no}</span><span dir="auto">{t.device_desc}</span></div><div className="text-slate-500 mt-0.5">{pick('rlab.atLabShort')}: <b dir="auto">{t.lab_name}</b>{t.expected_back ? <> · {pick('rlab.expected')} <span dir="ltr">{fmtDate(t.expected_back)}</span></> : null}</div></div><Pill tone="rose"><AlertTriangle className="inline w-3 h-3 me-1" /><span dir="ltr">{t.days}</span> {pick('audit.days')}</Pill></Link>)}
            {d.late_jobs.map((j) => <Link key={j.id} to={`/new/repairs/${j.id}`} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"><div className="min-w-0"><div className="font-bold"><span className="font-mono text-slate-400 me-1.5" dir="ltr">{j.no}</span><span dir="auto">{j.device_desc}</span></div><div className="text-slate-500 mt-0.5" dir="auto">{j.customer ?? '—'}</div></div><Pill tone="amber"><span dir="ltr">{j.days_late ?? 0}</span> {pick('audit.days')}</Pill></Link>)}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nret-labs">
          <h3 className="font-display font-extrabold text-sm">{pick('rlab.labs')}</h3>
          {!d.labs.length ? <p className="text-xs text-slate-400">{pick('audit.noData')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{d.labs.map((l) => <Link key={l.party_id} to={`/new/parties/${l.party_id}`} className="py-2.5 flex items-center gap-3"><FlaskConical className="w-4 h-4 text-slate-400 shrink-0" /><div className="min-w-0 flex-1"><div className="font-bold truncate" dir="auto">{l.name}</div><div className="text-[11px] text-slate-500">{pick('rlab.sent')} <span dir="ltr">{l.sent}</span> · {pick('rlab.o.fixed')} <span dir="ltr">{l.fixed}</span> · {pick('rlab.o.not_fixed')} <span dir="ltr">{l.not_fixed}</span>{l.avg_days != null ? <> · {pick('rlab.avgDays')} <span dir="ltr">{l.avg_days}</span></> : null}{l.at_lab ? <> · {pick('rlab.atLabShort')} <span dir="ltr">{l.at_lab}</span></> : null}</div></div><div className="text-end shrink-0"><div className="font-bold" dir="ltr">{l.fix_rate == null ? '—' : `${l.fix_rate}%`}</div><div className="text-[10px] text-slate-400" dir="ltr"><Secret>{n(l.cost)}</Secret></div></div></Link>)}</div>}
        </section>
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nret-faults">
          <h3 className="font-display font-extrabold text-sm">{pick('audit.repairs.faults')}</h3>
          <HBars rows={d.faults.map((f) => ({ key: f.code, label: ur ? f.ur : f.en, value: f.count }))} tone="bg-sky-500" />
        </section>
      </div>
    </div>
  )
}
