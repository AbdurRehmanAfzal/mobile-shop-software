/** Login activity (owner 2026-11-14, ADR-074): where the app is logged in — who, on which phone or
 *  browser, from which IP, since when, last used — and "Log out this device". Shown only when the
 *  super admin has switched on the "login_activity" module for this shop. */

import { LogOut, Monitor, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, Empty, ErrorText, Loading, PageHeader, Sheet, fmtDateTime } from '@/components/ui'
import { post } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'

interface Row { id: string; user_id: string; user_name: string; role: string; phone: string | null; method: string; ip: string | null; user_agent: string | null; started_at: string; last_seen_at: string; ended_at: string | null; end_reason: string | null; online: boolean; this_device: boolean }

/** "Chrome on Android", "the shop app on Android", "Edge on Windows" */
export function deviceText(ua: string | null, pick: (k: string) => string): string {
  if (!ua) return pick('logins.unknownDevice')
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : ''
  const app = /; wv\)|Capacitor/i.test(ua)
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const who = app ? pick('logins.theApp') : browser || pick('logins.browser')
  return os ? `${who} · ${os}` : who
}

const ago = (iso: string, pick: (k: string) => string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return pick('logins.justNow')
  if (m < 60) return pick('logins.minAgo').replace('{{n}}', String(m))
  const h = Math.round(m / 60)
  if (h < 48) return pick('logins.hoursAgo').replace('{{n}}', String(h))
  return pick('logins.daysAgo').replace('{{n}}', String(Math.round(h / 24)))
}

export default function LoginActivityPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [days, setDays] = useState(7)
  const { data, isLoading } = useGet<Row[]>(['login-activity', days], `/api/v1/login-activity?days=${days}`)
  const [ending, setEnding] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const groups: [string, Row[]][] = [
    ['logins.onlineNow', (data ?? []).filter((r) => r.online)],
    ['logins.loggedIn', (data ?? []).filter((r) => !r.online && !r.ended_at)],
    ['logins.ended', (data ?? []).filter((r) => !!r.ended_at)],
  ]
  async function endIt() {
    if (!ending) return
    setBusy(true)
    setErr(null)
    try {
      await post(`/api/v1/login-activity/${ending.id}/end`, {})
      await inv('login-activity')
      setEnding(null)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="logins.title" help={<Help term="logins.page" />} />
      <div className="flex flex-wrap gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`tap min-h-10 rounded-full border-2 px-4 text-sm font-bold ${days === d ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
            {pick(d === 1 ? 'logins.today' : 'logins.lastDays').replace('{{n}}', String(d))}
          </button>
        ))}
      </div>
      {isLoading ? <Loading /> : !data?.length ? <Empty text="logins.none" /> : groups.filter(([, rows]) => rows.length).map(([title, rows]) => (
        <section key={title} className="flex flex-col gap-2" data-testid={`logins-${title.split('.')[1]}`}>
          <BiLabel text={title} size="md" bold />
          <div className="card divide-y divide-line p-0">
            {rows.map((r) => (
              <div key={r.id} className={`flex flex-col gap-2 px-4 py-3 ${r.ended_at ? 'opacity-60' : ''}`} data-testid="login-row">
                <div className="flex items-center gap-3">
                  <span className={`well h-10 w-10 shrink-0 rounded-xl ${r.online ? 'bg-emerald-tint text-emerald-deep' : 'bg-ground text-muted'}`}>{/Android|iPhone|iPad/i.test(r.user_agent ?? '') ? <Smartphone size={18} /> : <Monitor size={18} />}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">{r.user_name} <span className="font-medium text-muted">· {pick(`staff.roles.${r.role}`)}</span></span>
                    <span className={`truncate text-muted ${small}`}>{deviceText(r.user_agent, pick)}{r.ip ? <span dir="ltr"> · {r.ip}</span> : null}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {r.this_device ? <Chip text="logins.thisDevice" tone="ok" /> : null}
                    {r.online ? <Chip text="logins.online" tone="ok" /> : null}
                    {r.ended_at ? <Chip text={r.end_reason === 'owner' ? 'logins.endedByOwner' : 'logins.loggedOut'} tone="muted" /> : null}
                  </span>
                </div>
                <div className={`flex flex-wrap gap-x-3 gap-y-0.5 text-muted ${small}`}>
                  <span>{pick('logins.since')} <span dir="ltr">{fmtDateTime(r.started_at)}</span> · {pick(`logins.method.${r.method}`)}</span>
                  <span>{pick('logins.lastUsed')} {ago(r.last_seen_at, pick)}</span>
                  {r.ended_at ? <span>{pick('logins.endedAt')} <span dir="ltr">{fmtDateTime(r.ended_at)}</span></span> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => nav(`/more/staff?tab=activity&who=${r.user_id}`)} className={`tap min-h-10 rounded-xl border border-line px-3 font-bold ${small}`}>{pick('logins.whatTheyDid')}</button>
                  {!r.ended_at && !r.this_device ? (
                    <button type="button" onClick={() => { setErr(null); setEnding(r) }} className={`tap inline-flex min-h-10 items-center gap-1 rounded-xl border border-line px-3 font-bold text-payable ${small}`} data-testid="login-end">
                      <LogOut size={14} />{pick('logins.end')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <Sheet open={ending !== null} onClose={() => setEnding(null)} title="logins.endTitle">
        {ending ? (
          <div className="flex flex-col gap-3" data-testid="login-end-sheet">
            <BiLabel text={{ en: `${ending.user_name} · ${deviceText(ending.user_agent, pick)}`, ur: `${ending.user_name} · ${deviceText(ending.user_agent, pick)}` }} size="md" bold />
            <BiLabel text="logins.endHint" size="sm" tone="text-muted" />
            <ErrorText error={err} />
            <BiButton text="logins.end" variant="danger" full loading={busy} onClick={endIt} data-testid="login-end-confirm" />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
