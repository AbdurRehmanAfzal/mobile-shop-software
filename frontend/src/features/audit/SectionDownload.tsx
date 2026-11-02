/** Print / PDF and Excel of the screen the owner is looking at (docs/31 R9): the complete report
 *  endpoint with only this screen's sections, for the same period. */

import { FileSpreadsheet, Printer } from 'lucide-react'
import { useState } from 'react'
import { useLang } from '@/components/Bilingual'
import { downloadFile, openPrintable } from '@/lib/files'
import { useAuditPeriod } from './period'

export default function SectionDownload({ sections, name }: { sections: string[]; name: string }) {
  const { pick, ur } = useLang()
  const { query } = useAuditPeriod()
  const [busy, setBusy] = useState(false)
  const url = (format: 'pdf' | 'xlsx', mode: 'summary' | 'detail' = 'detail') => `/api/v1/shop-audit/report?${query}&sections=${sections.join(',')}&mode=${mode}&format=${format}${ur ? '&lang=ur' : ''}`
  const btn = 'tap inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink disabled:opacity-50'
  return (
    <span className="flex items-center gap-1.5" data-testid="section-download">
      <button type="button" aria-label={pick('audit.rep.pdf')} title={pick('audit.rep.pdf')} onClick={() => void openPrintable(url('pdf'))} className={btn}>
        <Printer size={18} />
      </button>
      <button
        type="button"
        aria-label={pick('audit.rep.xlsx')}
        title={pick('audit.rep.xlsx')}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try { await downloadFile(url('xlsx'), `${name}.xlsx`) } finally { setBusy(false) }
        }}
        className={btn}
      >
        <FileSpreadsheet size={18} />
      </button>
    </span>
  )
}
