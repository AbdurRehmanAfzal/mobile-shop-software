/** Shop Audit → Repairs (owner 2026-11-03, docs/34): phones taken in and given back in the period,
 *  repair income, parts, outside lab charges and profit, every repair lab's record, faults, and what
 *  needs a look now (late jobs, phones late at a lab). */

import { AlertTriangle, FlaskConical, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import Help from '@/components/Help'
import { Empty, fmtDate, Pending } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import SectionDownload from './SectionDownload'
import { useAuditPeriod } from './period'

type M = string
interface Lab { party_id: string; name: string; phone: string | null; balance: M | null; sent: number; at_lab: number; late: number; fixed: number; not_fixed: number; fix_rate: number | null; avg_days: number | null; cost: M }
interface Late { id: string; no: string; device_desc: string; customer: string | null; promised_at: string | null; days_late: number | null }
interface LabLate { id: string; job_id: string; job_no: string | null; device_desc: string | null; lab_name: string | null; expected_back: string | null; days: number }
interface Repairs {
  granularity: string
  counts: { came: number; given: number; not_fixed: number; open_now: number; ready_now: number; late_now: number; at_lab_now: number; late_at_lab: number; sent_to_lab: number; back_from_lab: number }
  money: { income: M; parts: M | null; lab_customer: M | null; lab_stock: M | null; profit: M | null; avg_bill: M }
  labs: Lab[]
  faults: { code: string; en: string; ur: string; count: number }[]
  series: { bucket: string; came: number; given: number }[]
  late_jobs: Late[]
  late_at_lab: LabLate[]
}

const n = (v: M | number | null | undefined) => (v == null ? '—' : Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const label = (bucket: string, g: string) => (g === 'month' ? bucket.slice(0, 7) : bucket.slice(5))
const COUNTS = [
  { key: 'came', helpKey: 'audit.repairs.came' },
  { key: 'given', helpKey: 'audit.repairs.given' },
  { key: 'not_fixed', helpKey: 'audit.repairs.notFixed' },
  { key: 'open_now', helpKey: 'audit.repairs.openNow' },
  { key: 'ready_now', helpKey: 'audit.repairs.readyNow' },
  { key: 'late_now', helpKey: 'audit.repairs.lateNow' },
  { key: 'at_lab_now', helpKey: 'audit.repairs.atLabNow' },
  { key: 'late_at_lab', helpKey: 'audit.repairs.lateAtLab' },
] as const
const MONEY = [
  { key: 'income', helpKey: 'audit.repairs.income' },
  { key: 'parts', helpKey: 'audit.repairs.parts' },
  { key: 'lab_customer', helpKey: 'audit.repairs.labCustomer' },
  { key: 'profit', helpKey: 'audit.repairs.profit' },
  { key: 'lab_stock', helpKey: 'audit.repairs.labStock' },
  { key: 'avg_bill', helpKey: 'audit.repairs.avgBill' },
] as const

export default function RepairsAuditPage() {
  const { pick, ur, cls } = useLang()
  const { query } = useAuditPeriod()
  const { data: d, error, refetch } = useGet<Repairs>(['audit-repairs', query], `/api/v1/shop-audit/repairs?${query}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <AuditLayout right={<SectionDownload sections={['repairs']} name="repairs" />}>
      {!d ? <Pending error={error} retry={refetch} /> : (
        <>
          <section className="flex items-center justify-between rounded-3xl bg-repair px-5 py-4 text-repair-fg" data-testid="repairs-hero">
            <span className="flex flex-col">
              <span className="flex items-center gap-1 [&_button]:text-current"><BiLabel text="audit.repairs.income" size="md" bold tone="text-current" /><Help term="audit.repairs.income" size="sm" /></span>
              <span className={`opacity-80 ${small}`}><span className="num">{d.counts.given}</span> {pick('audit.repairs.given')}</span>
            </span>
            <span className="num text-2xl font-bold" dir="ltr">{withCur(n(d.money.income))}</span>
          </section>

          <div className="card grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" data-testid="repairs-counts">
            {COUNTS.map((c) => (
              <span key={c.key} className="flex flex-col">
                <span className={`flex items-center gap-1 text-muted ${small}`}>{pick(`audit.repairs.${c.helpKey.split('.').pop()}`)}<Help term={c.helpKey} size="sm" /></span>
                <span className={`num text-lg font-bold ${(c.key === 'late_now' || c.key === 'late_at_lab') && d.counts[c.key] ? 'text-payable' : ''}`}>{d.counts[c.key]}</span>
              </span>
            ))}
          </div>

          {d.money.profit != null ? (
            <div className="card grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3" data-testid="repairs-money">
              {MONEY.map((m) => (
                <span key={m.key} className="flex flex-col">
                  <span className={`flex items-center gap-1 text-muted ${small}`}>{pick(`audit.repairs.${m.helpKey.split('.').pop()}`)}<Help term={m.helpKey} size="sm" /></span>
                  <span className={`num text-lg font-bold ${m.key === 'profit' && Number(d.money.profit) < 0 ? 'text-payable' : ''}`} dir="ltr">{n(d.money[m.key])}</span>
                </span>
              ))}
            </div>
          ) : null}

          <span className="flex items-center gap-1"><BiLabel text="audit.repairs.series" size="md" bold /><Help term="audit.repairs.series" size="sm" /></span>
          <section className="card"><Bars data={d.series.map((x) => ({ label: label(x.bucket, d.granularity), value: x.came, hint: `${pick('audit.repairs.given')} ${x.given}`, key: x.bucket }))} testid="repairs-series" empty="audit.noData" /></section>

          <span className="flex items-center gap-1"><BiLabel text="rlab.labs" size="md" bold /><Help term="audit.repairs.labs" size="sm" /></span>
          {!d.labs.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="repairs-labs">
              {d.labs.map((l) => (
                <Link key={l.party_id} to={`/repairs/labs/${l.party_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="well h-9 w-9 shrink-0 bg-repair text-repair-fg"><FlaskConical size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{l.name}</span>
                    <span className={`text-muted ${small}`}>{pick('rlab.sent')} <span className="num">{l.sent}</span> · {pick('rlab.o.fixed')} <span className="num">{l.fixed}</span> · {pick('rlab.o.not_fixed')} <span className="num">{l.not_fixed}</span>{l.avg_days != null ? <> · {pick('rlab.avgDays')} <span className="num">{l.avg_days}</span></> : null}{l.at_lab ? <> · {pick('rlab.atLabShort')} <span className="num">{l.at_lab}</span></> : null}</span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="num font-bold">{l.fix_rate == null ? '—' : `${l.fix_rate}%`}</span>
                    <span className={`num text-muted ${small}`} dir="ltr">{n(l.cost)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {d.late_at_lab.length || d.late_jobs.length ? (
            <>
              <span className="flex items-center gap-1"><BiLabel text="audit.repairs.needsLook" size="md" bold /><Help term="audit.repairs.needsLook" size="sm" /></span>
              <div className="card divide-y divide-line p-0" data-testid="repairs-late">
                {d.late_at_lab.map((t) => (
                  <Link key={t.id} to={`/repairs/${t.job_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                    <AlertTriangle size={16} className="shrink-0 text-payable" />
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{t.device_desc}</span><span className={`text-muted ${small}`}>{pick('rlab.atLabShort')}: {t.lab_name} · <span dir="ltr">{t.job_no}</span>{t.expected_back ? <> · {pick('rlab.expected')} <span dir="ltr">{fmtDate(t.expected_back)}</span></> : null}</span></span>
                    <span className={`num font-bold text-payable ${small}`}>{t.days} {pick('audit.days')}</span>
                  </Link>
                ))}
                {d.late_jobs.map((j) => (
                  <Link key={j.id} to={`/repairs/${j.id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                    <Wrench size={16} className="shrink-0 text-payable" />
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{j.device_desc}</span><span className={`text-muted ${small}`}>{j.customer ?? '—'} · <span dir="ltr">{j.no}</span></span></span>
                    <span className={`num font-bold text-payable ${small}`}>{j.days_late} {pick('audit.days')}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          {d.faults.length ? (
            <>
              <span className="flex items-center gap-1"><BiLabel text="audit.repairs.faults" size="md" bold /><Help term="audit.repairs.faults" size="sm" /></span>
              <section className="card"><Bars data={d.faults.map((f) => ({ label: ur ? f.ur : f.en, value: f.count, key: f.code }))} empty="audit.noData" /></section>
            </>
          ) : null}
        </>
      )}
    </AuditLayout>
  )
}
