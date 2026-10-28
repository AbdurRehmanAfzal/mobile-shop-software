/** "Fingerprint login" on the More page (owner, 2026-10-28): switch it on for this phone / browser,
 *  see which phones can use it and remove one (the owner also sees the staff's). */

import { Fingerprint, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiAlert, BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText, fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { canUseHere, isOnHere, turnOffHere, turnOnHere } from '@/lib/fingerprint'
import { useGet, useInvalidate } from '@/lib/queries'

interface Key { id: string; user_id: string; kind: 'device' | 'passkey'; name: string; created_at: string; last_used_at: string | null }
interface Status { allowed: boolean; keys: Key[] }

export default function FingerprintCard() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<Status>(['fingerprint'], '/api/v1/auth/fingerprint')
  const [here, setHere] = useState(isOnHere())
  const [can, setCan] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  // the step and the phone's own words, small under the message, so a screenshot tells what went wrong
  const [detail, setDetail] = useState('')
  useEffect(() => { void canUseHere().then(setCan) }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    setDetail('')
    try {
      await fn()
      setHere(isOnHere())
      await inv('fingerprint')
    } catch (e) {
      // the fingerprint prompt was cancelled or failed: a plain message instead of "something went wrong"
      setErr(e instanceof ApiError ? e : 'cancelled')
      setDetail(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><Fingerprint size={22} /></span>
        <BiLabel text="fp.title" size="lg" bold />
      </div>
      {!data ? null : !data.allowed ? (
        <BiLabel text="fp.notAllowed" size="sm" tone="text-muted" />
      ) : can === false ? (
        <BiLabel text="fp.noSensor" size="sm" tone="text-muted" />
      ) : here ? (
        <>
          <BiLabel text="fp.onHere" size="md" bold tone="text-emerald-deep" />
          <BiButton text="fp.turnOff" variant="secondary" full loading={busy} onClick={() => run(turnOffHere)} />
        </>
      ) : (
        <>
          <BiLabel text="fp.explain" size="sm" tone="text-muted" />
          <BiButton text="fp.turnOn" icon={<Fingerprint size={22} />} full loading={busy} onClick={() => run(turnOnHere)} />
        </>
      )}
      {err === 'cancelled' ? <BiAlert text="fp.cancelled" /> : <ErrorText error={err} />}
      {err && detail ? <span className="text-xs text-muted" dir="ltr">{detail}</span> : null}
      {data?.keys.length ? (
        <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {data.keys.map((k) => (
            <div key={k.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{k.name}</span>
                <span className={`text-muted ${ur ? cls('sm') : 'text-xs'}`}>
                  {pick(k.kind === 'device' ? 'fp.app' : 'fp.website')} · <span dir="ltr">{fmtDate(k.last_used_at ?? k.created_at)}</span>
                </span>
              </span>
              <button type="button" aria-label={`${pick('fp.remove')}: ${k.name}`} onClick={async () => { await api('DELETE', `/api/v1/auth/fingerprint/keys/${k.id}`); await inv('fingerprint') }} className="tap flex min-h-12 shrink-0 items-center gap-1 rounded-xl px-2 font-bold text-payable">
                <Trash2 size={16} /> <span className="text-sm">{pick('fp.remove')}</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
