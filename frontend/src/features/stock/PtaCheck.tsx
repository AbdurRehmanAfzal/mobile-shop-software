/** PTA check (owner 2026-11-15, ADR-082). PTA's DIRBS page cannot be shown inside the app (the site
 *  forbids it, and its "I'm not a robot" works only on PTA's own site), so: one tap copies the IMEI
 *  and opens DIRBS — paste, tick, CHECK — or sends it by SMS to 8484. Back in the app, one tap says
 *  what PTA answered: on a phone in stock it is saved on its history (and sets its PTA status); while
 *  buying it sets the PTA choice of the form. */

import { Check, Copy, ExternalLink, MessageSquare, ShieldQuestion } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BtnText, ErrorText, Sheet } from '@/components/ui'
import { post } from '@/lib/api'

export const DIRBS = 'https://dirbs.pta.gov.pk/'
export type PtaResult = 'pta_approved' | 'non_pta' | 'blocked'

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function PtaCheckSheet({ imei, open, onClose, deviceId, onSaved, onResult }: { imei: string; open: boolean; onClose: () => void; deviceId?: string; onSaved?: () => void; onResult?: (r: PtaResult) => void }) {
  const { pick, ur, cls } = useLang()
  const [via, setVia] = useState<'dirbs' | 'sms'>('dirbs')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<PtaResult | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const small = ur ? cls('sm') : 'text-sm'

  async function openDirbs() {
    setVia('dirbs')
    setCopied(await copy(imei))
    window.open(DIRBS, '_blank', 'noopener')
  }
  async function answer(r: PtaResult) {
    setErr(null)
    if (!deviceId) { onResult?.(r); onClose(); return }
    setBusy(r)
    try {
      await post(`/api/v1/devices/${deviceId}/pta-check`, { result: r, via })
      onSaved?.()
      onClose()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(null)
    }
  }
  const tone: Record<PtaResult, string> = { pta_approved: 'border-emerald bg-emerald-tint text-emerald-deep', non_pta: 'border-gold bg-gold/15 text-gold-text', blocked: 'border-payable bg-payable-tint text-payable' }

  return (
    <Sheet open={open} onClose={onClose} title="ptachk.title">
      <div className="flex flex-col gap-3" data-testid="pta-sheet">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-ground px-4 py-3">
          <span className="num text-xl font-extrabold tracking-wide" dir="ltr">{imei}</span>
          <button type="button" onClick={async () => setCopied(await copy(imei))} className="tap inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface px-3 font-bold">
            {copied ? <Check size={18} className="text-emerald" /> : <Copy size={18} />}<BtnText k={copied ? 'ptachk.copied' : 'ptachk.copy'} />
          </button>
        </div>
        <span className="flex items-center gap-1"><BiLabel text="ptachk.step1" size="sm" bold /><Help term="ptachk.how" size="sm" /></span>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void openDirbs()} className="tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-ink px-2 py-2 font-bold text-ground" data-testid="pta-open">
            <ExternalLink size={20} /><span className={small}>{pick('ptachk.website')}</span>
          </button>
          <a href={`sms:8484?body=${imei}`} onClick={() => setVia('sms')} className="tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-2 py-2 font-bold text-ink" data-testid="pta-sms">
            <MessageSquare size={20} /><span className={small}>{pick('ptachk.sms')}</span>
          </a>
        </div>
        <BiLabel text="ptachk.websiteHint" size="sm" tone="text-muted" />
        <BiLabel text="ptachk.step2" size="sm" bold />
        <div className="grid grid-cols-3 gap-2">
          {(['pta_approved', 'non_pta', 'blocked'] as const).map((r) => (
            <BiButton key={r} text={`ptachk.r.${r}`} size="md" variant="secondary" className={`border-2 ${tone[r]}`} loading={busy === r} onClick={() => void answer(r)} data-testid={`pta-${r}`} />
          ))}
        </div>
        <ErrorText error={err} />
      </div>
    </Sheet>
  )
}

/** the small "PTA check" button */
export function PtaCheckButton({ onClick, size = 'md' }: { onClick: () => void; size?: 'sm' | 'md' }) {
  const { pick, ur, cls } = useLang()
  return (
    <button type="button" onClick={onClick} className={`tap inline-flex ${size === 'sm' ? 'min-h-9 px-2' : 'min-h-11 px-3'} items-center gap-1 rounded-xl border border-line bg-surface font-bold text-emerald-deep ${ur ? cls('sm') : 'text-sm'}`} data-testid="pta-check">
      <ShieldQuestion size={18} />{pick('ptachk.button')}
    </button>
  )
}
