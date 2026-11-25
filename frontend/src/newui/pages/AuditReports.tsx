/** Shop audit → Reports centre in the new product (ADR-134), drawn from mock-up 22's last tab
 *  ("Complete shop audit & individual sheets hub"): the complete audit report (the A4 builder — tick
 *  the sections, summary or detail, PDF or Excel, the live `/shop-audit/report`) and every individual
 *  sheet with its CSV / PDF / Excel (the live `/exports/*`, period sheets for the audit's period).
 *  Nothing is computed here; each button asks the server for its file. */

import { useState } from 'react'
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { downloadFile, openPrintable } from '@/lib/files'
import { useGet } from '@/lib/queries'
import { useModules } from '@/lib/modules'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame, ReportBuilder } from './Audit'
import { card } from '../auditKit'

const INDIVIDUAL: { key: string; path: string; name: string; period?: boolean }[] = [
  { key: 'sales', path: '/api/v1/exports/sales', name: 'sales', period: true },
  { key: 'purchases', path: '/api/v1/exports/purchases', name: 'purchases', period: true },
  { key: 'profit', path: '/api/v1/exports/profit-loss', name: 'profit-loss', period: true },
  { key: 'day', path: '/api/v1/exports/day', name: 'hisaab', period: true },
  { key: 'expenses', path: '/api/v1/exports/expenses', name: 'expenses', period: true },
  { key: 'top', path: '/api/v1/exports/top-sellers', name: 'best-sellers', period: true },
  { key: 'khata', path: '/api/v1/exports/khata', name: 'udhaar-khata' },
  { key: 'parties', path: '/api/v1/exports/parties', name: 'people' },
  { key: 'stock', path: '/api/v1/exports/stock', name: 'stock' },
  { key: 'stockSummary', path: '/api/v1/exports/stock-summary', name: 'stock-worth' },
  { key: 'ageing', path: '/api/v1/exports/stock-ageing', name: 'old-stock' },
  { key: 'forecast', path: '/api/v1/exports/forecast', name: 'estimate' },
]

export default function NewAuditReports() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const has = useModules()
  const { data: res } = useGet<{ date_from: string; date_to: string }>(['audit-period', query], `/api/v1/shop-audit/period?${query}`)
  const [busy, setBusy] = useState('')
  const url = (r: (typeof INDIVIDUAL)[number], f: string) => `${r.path}?format=${f}${r.period && res ? `&date_from=${res.date_from}&date_to=${res.date_to}` : ''}`
  const get = async (r: (typeof INDIVIDUAL)[number], f: 'csv' | 'xlsx') => { setBusy(`${r.key}${f}`); try { await downloadFile(url(r, f), `${r.name}.${f}`) } finally { setBusy('') } }
  return (
    <AuditFrame section="reports" testid="nrep">
      <section className={`p-5 space-y-4 ${card}`} data-testid="nrep-full">
        <div><h3 className="font-display font-extrabold text-base">{pick('nau.rep.title')}</h3><p className="text-xs text-slate-500 mt-0.5">{pick('audit.rep.fullHint')}</p></div>
        <ReportBuilder testid="nrep-builder" />
      </section>
      <div>
        <h3 className="font-display font-extrabold text-sm mb-1">{pick('audit.rep.individual')}</h3>
        <p className="text-xs text-slate-500 mb-3">{pick('audit.rep.individualHint')}</p>
        {!has('exports') ? <p className="text-xs text-slate-400">{pick('nau.rep.noExports')}</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs" data-testid="nrep-sheets">
            {INDIVIDUAL.map((r) => (
              <div key={r.key} className={`p-4 flex items-center justify-between gap-2 ${card}`} data-testid={`nrep-${r.key}`}>
                <div className="min-w-0 flex items-center gap-2"><Sheet className="w-4 h-4 text-slate-400 shrink-0" /><div><div className="font-bold">{pick(`audit.rep.i.${r.key}`)}</div><div className="text-[11px] text-slate-400">{r.period ? pick('audit.rep.forPeriod') : pick('audit.now')}</div></div></div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" disabled={!!busy} onClick={() => void get(r, 'csv')} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-800 font-bold hover:bg-[#A3E635] hover:text-obsidian-950 cursor-pointer disabled:opacity-50">CSV</button>
                  <button type="button" disabled={!!busy} onClick={() => void get(r, 'xlsx')} aria-label={pick('audit.rep.xlsx')} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-obsidian-800 font-bold cursor-pointer disabled:opacity-50"><FileSpreadsheet className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => void openPrintable(url(r, 'pdf'))} className="px-2.5 py-1 rounded-lg bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 font-bold flex items-center gap-1 cursor-pointer"><FileText className="w-3 h-3" />PDF</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuditFrame>
  )
}
