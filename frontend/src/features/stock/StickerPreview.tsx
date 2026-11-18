/** The phone's sticker beside its details (owner 2026-11-16, ADR-091): tick what goes on it and see
 *  the sticker change at once; print it from here. The size and copies are in "More options" (the
 *  usual sticker sheet), and the choice is remembered the same way as there. */

import { Check, Printer, SlidersHorizontal, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { BarChoice, LABEL_FIELDS, LABEL_LS, labelPath, loadLabelPrefs, type LabelField, type Prefs } from '@/components/LabelSheet'
import { withDocLang } from '@/lib/docLang'
import { BASE, authHeaders, openPrintable } from '@/lib/files'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'

export default function StickerPreview({ deviceId, onMore }: { deviceId: string; onMore: () => void }) {
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { data: shop } = useGet<{ label_prefs: Partial<Prefs> | null }>(['shop-full'], '/api/v1/shops/current')
  const [p, setP] = useState<Prefs>(() => loadLabelPrefs(null))
  useEffect(() => { setP(loadLabelPrefs(shop?.label_prefs)) }, [shop?.label_prefs])
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const path = labelPath('devices', [deviceId], { ...p, copies: 1 })

  // the preview follows every tick (a short wait so quick taps make one request)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      // preview=1: shown here, not printed — no print is recorded on the phone's history
      fetch(`${BASE}${withDocLang(`${path}&preview=1`)}`, { headers: authHeaders() })
        .then((r) => r.text())
        .then((h) => { if (live) setHtml(h) })
        .catch(() => undefined)
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [path])

  const fields = LABEL_FIELDS.filter((f) => canCost || f !== 'code')
  const toggle = (f: LabelField) => {
    keep({ ...p, fields: p.fields.includes(f) ? p.fields.filter((x) => x !== f) : [...p.fields, f] })
  }
  const keep = (next: Prefs) => {
    setP(next)
    try { localStorage.setItem(LABEL_LS, JSON.stringify(next)) } catch { /* private window */ }
  }

  return (
    <section className="card flex flex-col gap-3" data-testid="sticker-preview">
      <span className="flex items-center gap-2">
        <span className="well h-9 w-9 shrink-0 rounded-xl bg-emerald-tint text-emerald-deep"><Tag size={18} /></span>
        <span className="flex-1"><BiLabel text="dview.sticker" size="md" bold /></span>
        <Help term="label.sheet" size="sm" />
      </span>
      <div className="flex min-h-[150px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-white p-2">
        {html ? <iframe title={pick('dview.sticker')} srcDoc={html} className="h-[170px] w-full border-0" sandbox="" data-testid="sticker-frame" /> : <span className="text-sm text-muted">…</span>}
      </div>
      <span className="text-xs font-bold text-muted">{pick('dview.stickerFields')}</span>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => {
          const on = p.fields.includes(f)
          return (
            <button key={f} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f)} className={`tap inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold ${on ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-muted'}`} data-testid={`sticker-f-${f}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-emerald bg-emerald text-white' : 'border-line'}`}>{on ? <Check size={11} strokeWidth={3} /> : null}</span>
              {pick(`label.f.${f}`)}
            </button>
          )
        })}
      </div>
      {p.fields.includes('barcode') ? <BarChoice value={p.bar} onChange={(bar) => keep({ ...p, bar })} /> : null}
      <ErrorText error={err} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <BiButton text="label.print" icon={<Printer size={18} />} size="md" disabled={!p.fields.length} onClick={() => { setErr(null); openPrintable(labelPath('devices', [deviceId], p)).catch(setErr) }} data-testid="sticker-print" />
        <button type="button" onClick={onMore} className="tap inline-flex min-h-12 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 text-sm font-bold" data-testid="sticker-more">
          <SlidersHorizontal size={16} />{pick('dview.stickerMore')}
        </button>
      </div>
    </section>
  )
}
