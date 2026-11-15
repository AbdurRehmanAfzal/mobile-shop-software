/** Price lists (owner 2026-11-15, ADR-078): next to the stock page's Download / Share, two more A4
 *  lists of the phones the page shows — for the staff (every phone field with the asking price, no
 *  cost or seller) and for customers (what customers ask about with the price; no IMEI or cost;
 *  phones for sale only). Each is Print / PDF / Excel / CSV, downloaded or shared. */

import { ListChecks, Printer } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { BtnText, Sheet } from '@/components/ui'
import { openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'

function Copy({ path, copy, name }: { path: string; copy: 'staff' | 'customer'; name: string }) {
  const { pick, ur, cls } = useLang()
  const url = `${path}${path.includes('?') ? '&' : '?'}copy=${copy}`
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line p-3" data-testid={`plist-${copy}`}>
      <span className="flex items-center gap-1"><BiLabel text={`plist.${copy}`} size="md" bold /><Help term={`plist.${copy}`} size="sm" /></span>
      <BiLabel text={`plist.${copy}Hint`} size="sm" tone="text-muted" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openPrintable(withDocLang(`${url}&format=pdf`))} className={`tap inline-flex min-h-14 items-center gap-2 rounded-2xl bg-ink px-4 font-bold text-ground ${ur ? cls('sm') : 'text-sm'}`}>
          <Printer size={20} />{pick('tally.print')}
        </button>
        <DownloadButton path={url} name={name} />
      </div>
    </div>
  )
}

export default function PriceListsButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1" data-testid="price-lists">
        <ListChecks size={20} strokeWidth={1.75} />
        <BtnText k="plist.button" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="plist.title">
        <div className="flex flex-col gap-3">
          <BiLabel text="plist.intro" size="sm" tone="text-muted" />
          <Copy path={path} copy="staff" name="stock-prices" />
          <Copy path={path} copy="customer" name="phones-for-sale" />
        </div>
      </Sheet>
    </>
  )
}
