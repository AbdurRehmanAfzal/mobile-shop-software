/** "Scan" next to an IMEI box (owner, 2026-10-27). Live camera where the browser allows it (https);
 *  on the shop's Wi-Fi link (http) the phone camera takes a photo and the barcode is read from it.
 *  A box label can hold IMEI 1 and IMEI 2: then both are shown to pick from. */

import { Camera, ScanBarcode } from 'lucide-react'
import { readPhotoAi } from '@/lib/files'
import { useAiStatus, type ImeiAi } from '@/lib/ai'
import { useEffect, useRef, useState } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { BtnText, Sheet } from './ui'
import { canScanLive, scanLive, scanPhoto } from '@/lib/scan'

/** `exclude`: the IMEI already in the other box; a scan skips it (IMEI 2 must not repeat IMEI 1) */
export function ScanButton({ onImei, size = 'lg', exclude }: { onImei: (imei: string) => void; size?: 'lg' | 'sm'; exclude?: string }) {
  const { pick } = useLang()
  const aiOn = !!useAiStatus().data?.configured
  const file = useRef<HTMLInputElement>(null)
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [choices, setChoices] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

  async function fromPhoto(f: File) {
    setBusy(true)
    setFailed(false)
    try {
      let found = (await scanPhoto(f)).filter((x) => x !== exclude)
      if (!found.length && aiOn) {
        try {
          const r = await readPhotoAi<ImeiAi>(f, 'imei')
          found = [r.imei1, r.imei2].filter((x): x is string => !!x && x !== exclude)
        } catch { found = [] }
      }
      if (found.length === 1) onImei(found[0])
      else if (found.length > 1) setChoices(found)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const start = () => (canScanLive() ? setLive(true) : file.current?.click())
  const box = size === 'lg' ? 'min-h-14 min-w-14 rounded-2xl' : 'min-h-12 min-w-12 rounded-xl'

  return (
    <>
      <button type="button" aria-label={pick('scan.button')} onClick={start} className={`tap flex shrink-0 flex-col items-center justify-center gap-0.5 border border-line bg-surface px-2 py-1 text-ink ${box}`}>
        <ScanBarcode size={20} className="text-emerald" />
        <BtnText k={busy ? 'scan.reading' : 'scan.button'} />
      </button>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" data-testid="scan-photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f) }} />

      <Sheet open={live} onClose={() => setLive(false)} title="scan.title">
        {live ? <LiveScan onImei={(i) => { setLive(false); onImei(i) }} onPhoto={() => { setLive(false); file.current?.click() }} exclude={exclude} /> : null}
      </Sheet>

      <Sheet open={choices.length > 0} onClose={() => setChoices([])} title="scan.pick">
        <div className="flex flex-col gap-2">
          {choices.map((c) => (
            <button key={c} type="button" onClick={() => { setChoices([]); onImei(c) }} className="tap num min-h-14 rounded-2xl border border-line bg-surface px-4 text-start text-xl" dir="ltr">
              {c}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={failed} onClose={() => setFailed(false)} title="scan.title">
        <div className="flex flex-col gap-3">
          <BiLabel text="scan.notFound" size="md" bold />
          <BiLabel text="scan.hint" size="sm" tone="text-muted" />
          <button type="button" onClick={() => { setFailed(false); file.current?.click() }} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-ground">
            <Camera size={20} /> {pick('scan.again')}
          </button>
        </div>
      </Sheet>
    </>
  )
}

function LiveScan({ onImei, onPhoto, exclude }: { onImei: (imei: string) => void; onPhoto: () => void; exclude?: string }) {
  const { pick } = useLang()
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let stop: (() => void) | undefined
    let alive = true
    scanLive(video.current!, onImei, exclude)
      .then((s) => (alive ? (stop = s) : s()))
      .catch(() => setErr(true))
    return () => {
      alive = false
      stop?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
        {/* aiming line */}
        <span aria-hidden="true" className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      </div>
      <BiLabel text={err ? 'scan.noCamera' : exclude ? 'scan.otherImei' : 'scan.hint'} size="sm" tone={err ? 'text-payable' : 'text-muted'} />
      <button type="button" onClick={onPhoto} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-bold">
        <Camera size={20} /> {pick('scan.usePhoto')}
      </button>
    </div>
  )
}
