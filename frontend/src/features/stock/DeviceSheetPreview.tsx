/** A phone's printed details, previewed (shopkeepers 2026-11-20, ADR-114): an 80 mm slip or an A4
 *  page. Tick what goes on it — the preview is the server's own print page, so it changes at once
 *  and what you see is what prints — then print, download or share. The ticks are remembered on
 *  this device, one set for the slip and one for the page. */

import { Check, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import DocActions from '@/components/DocShare'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { withDocLang } from '@/lib/docLang'
import { BASE, authHeaders, openPrintable } from '@/lib/files'
import { useGet } from '@/lib/queries'

type Format = 'thermal' | 'a4'
interface Options { fields: string[]; default_fields: string[] }
const KEY = (f: Format) => `mobileshop.deviceSheet.${f}`

function load(f: Format): string[] | null {
  try { const v = JSON.parse(localStorage.getItem(KEY(f)) ?? 'null'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null } catch { return null }
}

export default function DeviceSheetPreview({ deviceId, format, name }: { deviceId: string; format: Format; name: string }) {
  const { pick, ur, cls } = useLang()
  const { data: opts } = useGet<Options>(['device-sheet-options'], '/api/v1/devices/sheet-options')
  const [picked, setPicked] = useState<string[] | null>(() => load(format))
  useEffect(() => { setPicked(load(format)) }, [format])
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const all = opts?.fields ?? []
  const fields = (picked ?? opts?.default_fields ?? []).filter((f) => all.includes(f))
  const path = `/api/v1/devices/${deviceId}/sheet?format=${format}&fields=${fields.join(',')}`
  const ready = !!opts && fields.length > 0

  // the preview follows every tick (a short wait so quick taps make one request)
  useEffect(() => {
    if (!ready) { setHtml(null); return }
    let live = true
    const t = setTimeout(() => {
      fetch(`${BASE}${withDocLang(path)}`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((h) => { if (live) setHtml(h) })
        .catch(() => { if (live) setHtml(null) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [path, ready])

  const toggle = (f: string) => {
    const next = fields.includes(f) ? fields.filter((x) => x !== f) : all.filter((x) => x === f || fields.includes(x))
    setPicked(next)
    try { localStorage.setItem(KEY(format), JSON.stringify(next)) } catch { /* private window */ }
  }
  const thermal = format === 'thermal'

  return (
    <section className="card flex flex-col gap-3" data-testid="device-sheet">
      <span className="flex items-center gap-2">
        <span className="flex-1"><BiLabel text={thermal ? 'dsheet.thermal' : 'dsheet.a4'} size="md" bold /></span>
        <Help term="dsheet.page" size="sm" />
      </span>
      <BiLabel text="dsheet.hint" size="sm" tone="text-muted" />

      {/* the paper: an 80 mm strip, or an A4 page scaled to the screen */}
      <div className="flex justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-ground p-3">
        {html ? (
          thermal ? (
            <iframe title={pick('dsheet.thermal')} srcDoc={html} sandbox="" className="h-[520px] w-[304px] max-w-full rounded-md border-0 bg-white shadow-[0_10px_30px_-18px_rgba(27,31,36,.5)]" data-testid="device-sheet-frame" />
          ) : (
            // A4 at 190 mm is ~720 px wide: shown at its own width where the screen has room, scaled down on a phone
            <div className="w-full max-w-[760px] overflow-x-auto">
              <iframe title={pick('dsheet.a4')} srcDoc={html} sandbox="" className="h-[760px] w-[760px] origin-top-left rounded-md border-0 bg-white shadow-[0_10px_30px_-18px_rgba(27,31,36,.5)] max-[820px]:h-[1050px] max-[820px]:w-[760px] max-[820px]:[zoom:0.44] min-[500px]:max-[820px]:[zoom:0.62]" data-testid="device-sheet-frame" />
            </div>
          )
        ) : <span className={`py-10 text-muted ${ur ? cls('sm') : 'text-sm'}`}>{ready ? '…' : pick('dsheet.pickOne')}</span>}
      </div>

      <span className="flex items-center gap-1"><BiLabel text="dsheet.fields" size="sm" bold tone="text-muted" /><Help term="dsheet.fields" size="sm" /></span>
      <div className="flex flex-wrap gap-1.5" data-testid="device-sheet-fields">
        {all.map((f) => {
          const on = fields.includes(f)
          return (
            <button key={f} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f)} className={`tap inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-bold ${ur ? cls('sm') : 'text-[13px]'} ${on ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`} data-testid={`dsheet-f-${f}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-emerald bg-emerald text-white' : 'border-line'}`}>{on ? <Check size={11} strokeWidth={3} /> : null}</span>
              {pick(`dsheet.f.${f}`)}
            </button>
          )
        })}
      </div>

      <ErrorText error={err} />
      <BiButton text="label.print" icon={<Printer size={20} />} full disabled={!ready} onClick={() => { setErr(null); openPrintable(path).catch(setErr) }} data-testid="device-sheet-print" />
      {ready ? <DocActions path={path} name={name} title={pick(thermal ? 'dsheet.thermal' : 'dsheet.a4')} picker={false} /> : null}
    </section>
  )
}
