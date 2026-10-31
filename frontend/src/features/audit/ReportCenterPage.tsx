/** Shop Audit → Reports (docs/16 §17, docs/17 P10): every individual report with its download,
 *  and the complete shop audit report — pick the sections and the mode, get a printable page
 *  (Save as PDF) or an Excel workbook with a sheet per section, for the chosen period. */

import { FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import { openPrintable } from '@/lib/files'
import { downloadFile } from '@/lib/files'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

const SECTIONS = ['summary', 'pnl', 'cash', 'expenses', 'tax', 'customers', 'suppliers', 'udhaar', 'inventory', 'ageing', 'products', 'invoices', 'verification', 'checks', 'security'] as const
type Section = (typeof SECTIONS)[number]
type Mode = 'summary' | 'detail'

const INDIVIDUAL: { key: string; path: (qs: string) => string; name: string; needsPeriod?: boolean }[] = [
  { key: 'sales', path: (qs) => `/api/v1/exports/sales${qs}`, name: 'sales', needsPeriod: true },
  { key: 'purchases', path: (qs) => `/api/v1/exports/purchases${qs}`, name: 'purchases', needsPeriod: true },
  { key: 'profit', path: (qs) => `/api/v1/exports/profit-loss${qs}`, name: 'profit-loss', needsPeriod: true },
  { key: 'day', path: (qs) => `/api/v1/exports/day${qs}`, name: 'hisaab', needsPeriod: true },
  { key: 'expenses', path: (qs) => `/api/v1/exports/expenses${qs}`, name: 'expenses', needsPeriod: true },
  { key: 'top', path: (qs) => `/api/v1/exports/top-sellers${qs}`, name: 'best-sellers', needsPeriod: true },
  { key: 'khata', path: () => '/api/v1/exports/khata', name: 'udhaar-khata' },
  { key: 'parties', path: () => '/api/v1/exports/parties', name: 'people' },
  { key: 'stock', path: () => '/api/v1/exports/stock', name: 'stock' },
  { key: 'stockSummary', path: () => '/api/v1/exports/stock-summary', name: 'stock-worth' },
  { key: 'ageing', path: () => '/api/v1/exports/stock-ageing', name: 'old-stock' },
  { key: 'forecast', path: () => '/api/v1/exports/forecast', name: 'estimate' },
]

export default function ReportCenterPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { period, query } = useAuditPeriod()
  const { data: res } = useGet<{ date_from: string; date_to: string }>(['audit-period', query], `/api/v1/shop-audit/period?${query}`)
  const [picked, setPicked] = useState<Section[]>(SECTIONS.filter((s) => s !== 'security' || role === 'owner'))
  const [mode, setMode] = useState<Mode>('summary')
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const qs = res ? `?date_from=${res.date_from}&date_to=${res.date_to}` : period.preset === 'custom' ? `?date_from=${period.from}&date_to=${period.to}` : ''
  const toggle = (s: Section) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const reportUrl = (format: 'pdf' | 'xlsx') => `/api/v1/shop-audit/report?${query}&sections=${picked.join(',')}&mode=${mode}&format=${format}${ur ? '&lang=ur' : ''}`
  const run = async (format: 'pdf' | 'xlsx') => {
    setBusy(format)
    try {
      if (format === 'pdf') openPrintable(reportUrl('pdf'))
      else await downloadFile(reportUrl('xlsx'), `shop-audit.xlsx`)
    } finally {
      setBusy(null)
    }
  }
  const shown = SECTIONS.filter((s) => s !== 'security' || role === 'owner')
  return (
    <AuditLayout>
      <section className="card flex flex-col gap-3" data-testid="full-report">
        <div className="flex items-center gap-2"><FileText size={18} /><BiLabel text="audit.rep.full" size="md" bold /></div>
        <BiLabel text="audit.rep.fullHint" size="sm" tone="text-muted" />
        <div className="flex flex-wrap gap-1.5">
          {shown.map((s) => <button key={s} type="button" aria-pressed={picked.includes(s)} onClick={() => toggle(s)} className={`tap min-h-9 whitespace-nowrap rounded-full border px-3 py-1.5 font-bold leading-tight ${picked.includes(s) ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{pick(`audit.rep.s.${s}`)}</button>)}
          <button type="button" onClick={() => setPicked(picked.length === shown.length ? ['summary'] : [...shown])} className={`tap h-9 rounded-full border border-line bg-surface px-3 font-bold text-muted ${ur ? cls('sm') : 'text-xs'}`}>{picked.length === shown.length ? pick('audit.rep.onlySummary') : pick('common.all')}</button>
        </div>
        <BiSegmented<Mode> value={mode} onChange={setMode} options={[{ value: 'summary', text: 'audit.rep.modeSummary' }, { value: 'detail', text: 'audit.rep.modeDetail' }]} />
        <div className="grid grid-cols-2 gap-2">
          <BiButton text="audit.rep.pdf" icon={<Printer size={20} />} full loading={busy === 'pdf'} disabled={!picked.length} onClick={() => void run('pdf')} />
          <BiButton text="audit.rep.xlsx" icon={<FileSpreadsheet size={20} />} variant="secondary" full loading={busy === 'xlsx'} disabled={!picked.length} onClick={() => void run('xlsx')} />
        </div>
        <span className={`text-muted ${small}`}>{pick('audit.rep.footer')}</span>
      </section>

      <BiLabel text="audit.rep.individual" size="md" bold />
      <BiLabel text="audit.rep.individualHint" size="sm" tone="text-muted" />
      <div className="card divide-y divide-line p-0" data-testid="individual-reports">
        {INDIVIDUAL.filter(() => role !== 'salesman').map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="flex flex-col"><span className={ur ? cls('md') : 'text-[15px] font-semibold'}>{pick(`audit.rep.i.${r.key}`)}</span>{r.needsPeriod ? <span className={`text-muted ${small}`}>{pick('audit.rep.forPeriod')}</span> : null}</span>
            <DownloadButton path={r.path(r.needsPeriod ? qs : '')} name={r.name} />
          </div>
        ))}
      </div>
    </AuditLayout>
  )
}
