/** Stock tally sheet (owner 2026-11-14, ADR-075): print / PDF / Excel of every phone on hand, with
 *  the shop's figures and counts by brand and model, to count the stock by hand. */

import { ClipboardCheck, Printer } from 'lucide-react'
import { BiLabel, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'

export default function TallySheetCard() {
  const { pick, ur, cls } = useLang()
  return (
    <div className="card flex flex-col gap-3" data-testid="tally-card">
      <div className="flex items-center gap-3">
        <span className="well h-11 w-11 shrink-0 bg-stockt text-stockt-fg"><ClipboardCheck size={22} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1"><BiLabel text="tally.title" size="md" bold /><Help term="tally.sheet" size="sm" /></span>
          <BiLabel text="tally.hint" size="sm" tone="text-muted" />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openPrintable(withDocLang('/api/v1/exports/stock-tally?format=pdf'))} className={`tap inline-flex min-h-14 items-center gap-2 rounded-2xl bg-ink px-4 font-bold text-ground ${ur ? cls('sm') : 'text-sm'}`} data-testid="tally-print">
          <Printer size={20} />{pick('tally.print')}
        </button>
        <DownloadButton path="/api/v1/exports/stock-tally" name="stock-tally" />
      </div>
    </div>
  )
}
