/** "Scan CNIC": photo of the card's front → number, name, father's name, dates filled in for the
 *  shopkeeper to check (owner, 2026-10-28). Read on the phone; the photo is not sent for reading. */

import { IdCard } from 'lucide-react'
import { useRef, useState } from 'react'
import { BiAlert, BiLabel, useLang } from './Bilingual'
import { readCnic, type CnicData } from '@/lib/cnicOcr'
import { readPhotoAi } from '@/lib/files'
import { useAiStatus, type CnicAi } from '@/lib/ai'

export default function CnicScanButton({ onRead }: { onRead: (d: CnicData, photo: File) => void }) {
  const { pick, ur, cls } = useLang()
  const { data: ai } = useAiStatus()
  const file = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [msg, setMsg] = useState<'none' | 'expired' | null>(null)

  async function read(f: File) {
    setMsg(null)
    setProgress(0)
    try {
      let d: CnicData | null = null
      if (ai?.configured) {
        try {
          const r = await readPhotoAi<CnicAi>(f, 'cnic')
          const exp = r.expiry && /^\d{2}\.\d{2}\.\d{4}$/.test(r.expiry) ? r.expiry : undefined
          const expired = exp ? new Date(Number(exp.slice(6)), Number(exp.slice(3, 5)) - 1, Number(exp.slice(0, 2))) < new Date() : false
          d = { cnic: r.cnic ?? undefined, name: r.name ?? undefined, fatherName: r.father_name ?? undefined, gender: r.gender ?? undefined, dob: r.dob ?? undefined, issue: r.issue ?? undefined, expiry: r.expiry ?? undefined, expired }
        } catch { d = null }
      }
      d = d ?? (await readCnic(f, setProgress))
      if (!d.cnic && !d.name) setMsg('none')
      else if (d.expired) setMsg('expired')
      onRead(d, f)
    } catch {
      setMsg('none')
    } finally {
      setProgress(null)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => file.current?.click()} disabled={progress !== null} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald bg-emerald-tint/40 px-4 font-bold text-emerald-deep disabled:opacity-60">
        <IdCard size={22} />
        <span className={ur ? cls('md') : ''}>{progress === null ? pick('cnicScan.button') : `${pick('cnicScan.reading')} ${Math.round(progress * 100)}%`}</span>
      </button>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" data-testid="cnic-photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f) }} />
      {progress === null && msg === null ? <BiLabel text="cnicScan.hint" size="sm" tone="text-muted" /> : null}
      {msg === 'none' ? <BiAlert text="cnicScan.none" kind="info" /> : null}
      {msg === 'expired' ? <BiAlert text="cnicScan.expired" /> : null}
    </div>
  )
}
