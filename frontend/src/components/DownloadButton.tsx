/** "Download" and "Share" for any report (owner, 2026-10-28: every report can be downloaded and
 *  shared). Each opens PDF / Excel / CSV choices; Download also offers Print. `path` is the export
 *  URL without `format` (it may already carry a query string). The PDF is made from the server's
 *  print page on the phone, which keeps Urdu correct. */

import { Download, FileSpreadsheet, FileText, Printer, Share2, Sheet as SheetIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import DocLangPicker from './DocLangPicker'
import { DocStatus, useDocFile, type DocMode } from './DocShare'
import { BtnText, Sheet } from './ui'
import { downloadFile, openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { fetchFile, printPagePdf } from '@/lib/share'

type Fmt = 'pdf' | 'xlsx' | 'csv'

export default function DownloadButton({ path, name }: { path: string; name: string }) {
  const [mode, setMode] = useState<DocMode | null>(null)
  const { pick } = useLang()
  const s = useDocFile(name)
  const url = (fmt: string) => withDocLang(`${path}${path.includes('?') ? '&' : '?'}format=${fmt}`)

  function run(fmt: Fmt) {
    const make = () => (fmt === 'pdf' ? printPagePdf(url('pdf'), name) : fetchFile(url(fmt), `${name}.${fmt}`))
    // in the app, if saving to the phone fails, the old way: Chrome's print / download
    const fallback = () => (fmt === 'pdf' ? openPrintable(url('pdf')) : downloadFile(url(fmt), `${name}.${fmt}`))
    return s.run(fmt, mode ?? 'download', make, fallback)
  }

  function open(m: DocMode) {
    s.reset()
    setMode(m)
  }

  const head = 'tap print:hidden flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1'
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" aria-label={pick('counter.download')} onClick={() => open('download')} className={head}>
        <Download size={20} />
        <BtnText k="counter.download" />
      </button>
      <button type="button" aria-label={pick('docShare.share')} onClick={() => open('share')} className={`${head} border-emerald/40 text-emerald-deep`}>
        <Share2 size={20} />
        <BtnText k="docShare.share" />
      </button>
      <Sheet open={mode !== null} onClose={() => setMode(null)} title={mode === 'share' ? 'docShare.shareTitle' : 'counter.downloadTitle'}>
        <div className="flex flex-col gap-2.5">
          <DocLangPicker />
          <Choice icon={<FileText size={24} />} tone="bg-expense text-expense-fg" title="counter.pdf" hint="counter.pdfHint" busy={s.busy === 'pdf'} disabled={!!s.busy} onClick={() => run('pdf')} />
          <Choice icon={<FileSpreadsheet size={24} />} tone="bg-sell text-sell-fg" title="counter.excel" hint="counter.excelHint" busy={s.busy === 'xlsx'} disabled={!!s.busy} onClick={() => run('xlsx')} />
          <Choice icon={<SheetIcon size={24} />} tone="bg-buy text-buy-fg" title="counter.csv" hint="counter.csvHint" busy={s.busy === 'csv'} disabled={!!s.busy} onClick={() => run('csv')} />
          {mode === 'download' ? (
            <Choice icon={<Printer size={24} />} tone="bg-khata text-khata-fg" title="common.print" hint="docShare.printHint" busy={false} disabled={!!s.busy} onClick={() => { setMode(null); void openPrintable(url('pdf')) }} />
          ) : null}
          <DocStatus s={s} />
        </div>
      </Sheet>
    </div>
  )
}

function Choice({ icon, tone, title, hint, busy, disabled, onClick }: { icon: ReactNode; tone: string; title: string; hint: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="tap flex min-h-[72px] items-center gap-3 rounded-3xl border border-line bg-surface px-4 text-start disabled:opacity-50">
      <span className={`well h-12 w-12 shrink-0 ${tone}`}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <BiLabel text={title} size="lg" bold />
        <BiLabel text={busy ? 'docShare.making' : hint} size="sm" tone="text-muted" />
      </span>
    </button>
  )
}
