/** ADR-128 (shopkeepers 2026-11-21): the phones whose ID card check is pending, opened from the
 *  dashboard's "Needs attention". Each one can be checked or skipped ("I know this person"), and
 *  all of them can be skipped in one go. The server does the skip and writes it in each phone's
 *  history; a phone marked as suspected stolen is never skipped from here. */

import { ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, Empty, ErrorText, Loading, PageHeader, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useDevices, useInvalidate } from '@/lib/queries'

export default function PendingChecksPage() {
  const nav = useNavigate()
  const inv = useInvalidate()
  const { pick, ur, cls } = useLang()
  const { data, isLoading } = useDevices({ id_pending: true, limit: 500 })
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<number | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  if (isLoading || !data) return <Loading />
  const pending = data.filter((d) => d.verification_status === 'pending')
  const flagged = data.filter((d) => d.verification_status === 'flagged')
  const say = (k: string, n: number) => { const s = pick(k).replace('{{n}}', String(n)); return { en: s, ur: s } }

  const skip = async (ids: string[] | null) => {
    setBusy(ids ? ids[0] : 'all')
    setError(null)
    try {
      const r = await api<{ skipped: number; flagged_left: number }>('POST', '/api/v1/verification/skip-pending', { reason: pick('purchase.skipReason'), ...(ids ? { device_ids: ids } : {}) })
      if (!ids) setDone(r.skipped)
      inv('devices', 'device', 'dashboard')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
      setAsk(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="id-pending">
      <PageHeader title="idp.title" help={<Help term="idp.page" />} />
      {done != null ? <div className="rounded-2xl bg-emerald-tint px-4 py-3 text-emerald-deep" data-testid="idp-done"><BiLabel text={say('idp.done', done)} size="sm" bold tone="text-current" /></div> : null}
      {pending.length ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-khata p-4 text-khata-fg">
          <div className="flex items-start gap-2"><ShieldAlert size={22} className="mt-0.5 shrink-0" /><BiLabel text="idp.intro" size="sm" tone="text-current" /></div>
          {pending.length > 1 ? <BiButton text={say('idp.skipAll', pending.length)} icon={<UserCheck size={20} />} variant="secondary" full onClick={() => setAsk(true)} data-testid="idp-skip-all" /> : null}
        </div>
      ) : null}
      <ErrorText error={error} />
      {!data.length ? <Empty text="idp.none" /> : null}

      {[...pending, ...flagged].map((d) => {
        const bad = d.verification_status === 'flagged'
        return (
          <div key={d.id} className="card flex flex-col gap-3" data-testid="idp-row">
            <button type="button" onClick={() => nav(`/stock/${d.id}`)} className="tap flex items-start justify-between gap-3 text-start">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-bold text-ink">{d.brand_name} {d.model_name}</span>
                <span className={`num text-muted ${small}`} dir="ltr">{d.imei1}</span>
                {d.source_party_name ? <span className={`truncate text-muted ${small}`}>{d.source_party_name}</span> : null}
              </span>
              <Chip text={`stock.verification.${d.verification_status}`} tone={bad ? 'bad' : 'warn'} />
            </button>
            {bad ? <BiLabel text="idp.flaggedNote" size="sm" tone="text-payable" /> : null}
            <div className="grid grid-cols-2 gap-2">
              <BiButton text="idp.check" icon={<ShieldCheck size={18} />} size="sm" variant="gold" onClick={() => nav(`/stock/${d.id}/verify`)} data-testid="idp-check" />
              {bad ? null : <BiButton text="purchase.skipKnown" icon={<UserCheck size={18} />} size="sm" variant="secondary" loading={busy === d.id} disabled={!!busy} onClick={() => void skip([d.id])} data-testid="idp-skip" />}
            </div>
          </div>
        )
      })}

      <Sheet open={ask} onClose={() => setAsk(false)} title={say('idp.skipAllAsk', pending.length)}>
        <div className="flex flex-col gap-3">
          <BiLabel text="idp.skipAllNote" size="sm" tone="text-muted" />
          <BiButton text={say('idp.skipAllYes', pending.length)} icon={<UserCheck size={20} />} full loading={busy === 'all'} onClick={() => void skip(null)} data-testid="idp-skip-all-yes" />
          <BiButton text="common.cancel" variant="ghost" full onClick={() => setAsk(false)} />
        </div>
      </Sheet>
    </div>
  )
}
