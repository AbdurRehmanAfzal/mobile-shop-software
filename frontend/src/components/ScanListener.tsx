/** Mounted once in the shell: installs the keyboard-wedge listener and handles scans no screen
 *  claimed — look the code up and open the phone's or item's page (its whole history), with a beep;
 *  "Item not found" with "Add it" and an error tone otherwise (docs/22 §D.2). */

import { PackagePlus, ScanLine, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from './Bilingual'
import { get } from '@/lib/api'
import { beep, installScanner, onUnclaimedScan } from '@/lib/scanner'

export interface Lookup {
  code: string
  kind: 'device' | 'item' | 'none'
  matched: string | null
  device: { id: string; imei1: string; brand_name: string; model_name: string; status: string; asking_price: string | null; barcode: string | null } | null
  item: { id: string; sku: string; name: string; name_ur: string | null; qty: number; price: string; barcode: string | null } | null
  status?: string
  sellable?: boolean
}

export async function lookupCode(code: string): Promise<Lookup> {
  return get<Lookup>(`/api/v1/barcodes/lookup?code=${encodeURIComponent(code)}`)
}

export default function ScanListener() {
  const nav = useNavigate()
  const { pick } = useLang()
  const [miss, setMiss] = useState<string | null>(null)
  useEffect(() => installScanner(), [])
  useEffect(() => {
    const onScan = async (code: string) => {
      try {
        const r = await lookupCode(code)
        if (r.kind === 'device' && r.device) {
          beep('ok')
          nav(`/stock/${r.device.id}`)
        } else if (r.kind === 'item' && r.item) {
          beep('ok')
          nav(`/accessories?q=${encodeURIComponent(r.item.sku)}`)
        } else {
          beep('error')
          setMiss(code)
        }
      } catch {
        beep('error')
        setMiss(code)
      }
    }
    return onUnclaimedScan(onScan)
  }, [nav])
  if (!miss) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-payable/40 bg-surface px-4 py-3 shadow-hero lg:bottom-6" role="alert" data-testid="scan-miss">
      <span className="well h-10 w-10 shrink-0 bg-payable-tint text-payable"><ScanLine size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <BiLabel text="barcode.notFound" size="md" bold />
        <span className="num truncate text-xs text-muted" dir="ltr">{miss}</span>
      </span>
      <button type="button" onClick={() => { const c = miss; setMiss(null); nav(`/purchase/new?code=${encodeURIComponent(c)}`) }} className="tap flex h-10 items-center gap-1 rounded-xl bg-ink px-3 text-xs font-bold text-ground"><PackagePlus size={16} /> {pick('barcode.addIt')}</button>
      <button type="button" aria-label={pick('common.close')} onClick={() => setMiss(null)} className="tap flex h-10 w-10 items-center justify-center rounded-xl border border-line"><X size={16} /></button>
    </div>
  )
}
