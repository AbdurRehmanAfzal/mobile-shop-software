/** The seller signs the purchase declaration on the screen (owner 2026-11-03, "consent sign"): drawn
 *  with a finger or a mouse, saved as an image with the ID check and printed on the declaration. */

import { Eraser, PenLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BiButton, BiLabel } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { fileObjectUrl, uploadFile } from '@/lib/files'

export default function SignaturePad({ path, onSaved }: { path: string | null; onSaved: (path: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [drawn, setDrawn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [saved, setSaved] = useState<string | undefined>()
  const [redo, setRedo] = useState(!path)

  useEffect(() => {
    let alive = true
    if (path) fileObjectUrl(path).then((u) => alive && setSaved(u)).catch(() => undefined)
    return () => { alive = false }
  }, [path])

  useEffect(() => {
    const c = canvas.current
    if (!c || !redo) return
    // sharp lines on high-density screens
    const r = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = r.width * dpr
    c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0E1613'
  }, [redo])

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = at(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = at(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setDrawn(true)
  }
  const up = () => { drawing.current = false }
  const clear = () => {
    const c = canvas.current
    if (!c) return
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setDrawn(false)
  }
  const save = async () => {
    const c = canvas.current
    if (!c) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('signature'))), 'image/png'))
      const p = await uploadFile(new File([blob], 'signature.png', { type: 'image/png' }), 'signature')
      onSaved(p)
      setRedo(false)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  if (!redo && path) {
    return (
      <div className="flex flex-col gap-2" data-testid="signature-saved">
        <span className="flex items-center gap-1"><BiLabel text="verify.signed" size="sm" bold tone="text-emerald-deep" /><Help term="stock.verify.signature" size="sm" /></span>
        <div className="flex items-center gap-3 rounded-2xl border border-emerald bg-surface p-2">
          {saved ? <img src={saved} alt="" className="h-16 w-auto max-w-[70%] object-contain" /> : null}
          <button type="button" onClick={() => setRedo(true)} className="tap ms-auto text-xs font-bold text-emerald underline">{/* sign again */}<BiLabel text="verify.signAgain" size="sm" tone="text-current" /></button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2" data-testid="signature-pad">
      <span className="flex items-center gap-1"><PenLine size={16} /><BiLabel text="verify.signHere" size="sm" bold /><Help term="stock.verify.signature" size="sm" /></span>
      <canvas
        ref={canvas}
        aria-label="signature"
        className="h-40 w-full touch-none rounded-2xl border-2 border-dashed border-line bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <BiButton text="verify.clearSign" icon={<Eraser size={16} />} size="md" variant="secondary" onClick={clear} disabled={!drawn || busy} />
        <BiButton text="verify.saveSign" size="md" onClick={save} disabled={!drawn} loading={busy} />
      </div>
      <ErrorText error={err} />
    </div>
  )
}
