/** "Download" for any report: one labelled button that opens PDF / Excel / CSV choices.
 *  `path` is the export URL without `format` (it may already carry a query string). PDF opens the
 *  server's print-ready page and the print dialog ("Save as PDF"), which keeps Urdu correct. */

import { Download, FileSpreadsheet, FileText, Sheet as SheetIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { BtnText, ErrorText, Sheet } from './ui'
import { downloadFile, openPrintable } from '@/lib/files'

export default function DownloadButton({ path, name }: { path: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const { pick } = useLang()
  const url = (fmt: string) => `${path}${path.includes('?') ? '&' : '?'}format=${fmt}`

  async function run(fmt: 'pdf' | 'xlsx' | 'csv') {
    setBusy(fmt)
    setError(null)
    try {
      if (fmt === 'pdf') await openPrintable(url('pdf'))
      else await downloadFile(url(fmt), `${name}.${fmt}`)
      setOpen(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button type="button" aria-label={pick('counter.download')} onClick={() => setOpen(true)} className="tap print:hidden flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1">
        <Download size={20} />
        <BtnText k="counter.download" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="counter.downloadTitle">
        <div className="flex flex-col gap-2.5">
          <Choice icon={<FileText size={24} />} tone="bg-expense text-expense-fg" title="counter.pdf" hint="counter.pdfHint" busy={busy === 'pdf'} onClick={() => run('pdf')} />
          <Choice icon={<FileSpreadsheet size={24} />} tone="bg-sell text-sell-fg" title="counter.excel" hint="counter.excelHint" busy={busy === 'xlsx'} onClick={() => run('xlsx')} />
          <Choice icon={<SheetIcon size={24} />} tone="bg-buy text-buy-fg" title="counter.csv" hint="counter.csvHint" busy={busy === 'csv'} onClick={() => run('csv')} />
          <ErrorText error={error} />
        </div>
      </Sheet>
    </>
  )
}

function Choice({ icon, tone, title, hint, busy, onClick }: { icon: ReactNode; tone: string; title: string; hint: string; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="tap flex min-h-[72px] items-center gap-3 rounded-3xl border border-line bg-surface px-4 text-start disabled:opacity-50">
      <span className={`well h-12 w-12 shrink-0 ${tone}`}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <BiLabel text={title} size="lg" bold />
        <BiLabel text={hint} size="sm" tone="text-muted" />
      </span>
    </button>
  )
}
