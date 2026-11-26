/** "Download" and "Share" for any report (owner, 2026-10-28: every report can be downloaded and
 *  shared). Each opens PDF / Excel / CSV choices; Download also offers Print. `path` is the export
 *  URL without `format` (it may already carry a query string). The PDF is made from the server's
 *  print page on the phone, which keeps Urdu correct. */

import { Columns3, Download, EyeOff, FileSpreadsheet, FileText, Printer, Share2, Sheet as SheetIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import DocLangPicker from './DocLangPicker'
import { DocStatus, useDocFile, type DocMode } from './DocShare'
import { BtnText, Sheet } from './ui'
import { BASE, authHeaders, downloadFile, openPrintable } from '@/lib/files'
import { useAuth } from '@/lib/auth'
import { withDocLang } from '@/lib/docLang'
import { fetchFile, printPagePdf } from '@/lib/share'
import { useModule } from '@/lib/modules'

type Fmt = 'pdf' | 'xlsx' | 'csv'
interface Field { i: number; label: string; cost: boolean }

/** `formats`: the files this report comes as (default PDF, Excel and CSV). `compact`: two small
 *  icon buttons, for a row in a long list (the Reports page, ADR-111). */
export default function DownloadButton({ path, name, formats = ['pdf', 'xlsx', 'csv'], compact = false }: { path: string; name: string; formats?: Fmt[]; compact?: boolean }) {
  const [mode, setMode] = useState<DocMode | null>(null)
  const { pick, ur, cls } = useLang()
  const s = useDocFile(name)
  const on = useModule('exports')
  // ADR-144: what the reader leaves out of this report — columns, cost and profit. The server
  // does the leaving out (`rhide`, `rnocost`); the app only sends the choice.
  const role = useAuth((x) => x.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const [noCost, setNoCost] = useState(false)
  const [hidden, setHidden] = useState<number[]>([])
  const [fields, setFields] = useState<Field[] | null>(null)
  const [pickCols, setPickCols] = useState(false)
  const opts = `${noCost ? '&rnocost=1' : ''}${hidden.length ? `&rhide=${hidden.join(',')}` : ''}`
  const url = (fmt: string) => withDocLang(`${path}${path.includes('?') ? '&' : '?'}format=${fmt}${opts}`)
  const colsUrl = withDocLang(`${path}${path.includes('?') ? '&' : '?'}format=${formats.includes('csv') ? 'csv' : formats[0]}&rcols=1`)
  useEffect(() => { setFields(null); setHidden([]); setPickCols(false) }, [path])
  useEffect(() => {
    if (!pickCols) return
    let live = true
    fetch(`${BASE}${colsUrl}`, { headers: authHeaders() })
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : { fields: [] }))
      .then((j: { fields?: Field[] }) => { if (live) setFields(j.fields ?? []) })
      .catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [pickCols, colsUrl])

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

  if (!on) return null
  const head = compact ? 'tap print:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface' : 'tap print:hidden flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1'
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" aria-label={pick('counter.download')} onClick={() => open('download')} className={head}>
        <Download size={compact ? 18 : 20} />
        {compact ? null : <BtnText k="counter.download" />}
      </button>
      <button type="button" aria-label={pick('docShare.share')} onClick={() => open('share')} className={`${head} border-emerald/40 text-emerald-deep`}>
        <Share2 size={compact ? 18 : 20} />
        {compact ? null : <BtnText k="docShare.share" />}
      </button>
      <Sheet open={mode !== null} onClose={() => setMode(null)} title={mode === 'share' ? 'docShare.shareTitle' : 'counter.downloadTitle'}>
        <div className="flex flex-col gap-2.5">
          <DocLangPicker />
          <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-3 py-2" data-testid="rep-options">
            {canCost ? (
              <label className={`flex min-h-10 cursor-pointer items-center gap-2 text-ink ${ur ? cls('sm') : 'text-sm font-semibold'}`}>
                <input type="checkbox" checked={noCost} onChange={(e) => setNoCost(e.target.checked)} className="h-4 w-4" data-testid="rep-nocost" />
                <EyeOff size={16} className="shrink-0 text-muted" />{pick('rep.hideCost')}
              </label>
            ) : null}
            <button type="button" aria-expanded={pickCols} onClick={() => setPickCols((v) => !v)} className={`tap flex min-h-10 items-center gap-2 text-start text-ink ${ur ? cls('sm') : 'text-sm font-semibold'}`} data-testid="rep-cols">
              <Columns3 size={16} className="shrink-0 text-muted" />
              <span className="flex-1">{pick('rep.columns')}</span>
              {hidden.length ? <span className="num rounded-full bg-ground px-2 text-xs font-bold text-muted">−{hidden.length}</span> : null}
            </button>
            {pickCols ? (
              fields === null ? <span className="text-sm text-muted">…</span>
                : fields.length === 0 ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} data-testid="rep-cols-none">{pick('rep.noColumns')}</span>
                  : (
                    <div className="grid grid-cols-2 gap-x-3" data-testid="rep-cols-list">
                      {fields.filter((f) => !(noCost && f.cost)).map((f) => (
                        <label key={f.i} className="flex min-h-9 cursor-pointer items-center gap-1.5 text-ink">
                          <input type="checkbox" checked={!hidden.includes(f.i)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((x) => x !== f.i) : [...hidden, f.i])} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate text-[13px] font-semibold" dir="auto">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  )
            ) : null}
          </div>
          {formats.includes('pdf') ? <Choice icon={<FileText size={24} />} tone="bg-expense text-expense-fg" title="counter.pdf" hint="counter.pdfHint" busy={s.busy === 'pdf'} disabled={!!s.busy} onClick={() => run('pdf')} /> : null}
          {formats.includes('xlsx') ? <Choice icon={<FileSpreadsheet size={24} />} tone="bg-sell text-sell-fg" title="counter.excel" hint="counter.excelHint" busy={s.busy === 'xlsx'} disabled={!!s.busy} onClick={() => run('xlsx')} /> : null}
          {formats.includes('csv') ? <Choice icon={<SheetIcon size={24} />} tone="bg-buy text-buy-fg" title="counter.csv" hint="counter.csvHint" busy={s.busy === 'csv'} disabled={!!s.busy} onClick={() => run('csv')} /> : null}
          {formats.includes('pdf') ? (
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
