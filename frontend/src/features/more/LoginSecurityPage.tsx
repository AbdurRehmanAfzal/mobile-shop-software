/** Login security (owner 2026-11-15, ADR-080): so a stolen password is not enough. Owner only.
 *  - Approved phones only: a staff member logs in only on a phone / browser the owner allowed; a new
 *    one waits here (and on the home screen) for Allow / Say no; Take back logs it out at once.
 *  - Login hours: staff log in only between the shop's hours.
 *  - Log out all staff now.
 *  Both rules start off; the owner is never held by them. */

import { Clock, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, ErrorText, Loading, PageHeader, Sheet, fmtDateTime } from '@/components/ui'
import { api, post } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'

interface Rules { device_approval: boolean; hours_on: boolean; hours_from: string; hours_to: string }
interface Dev { id: string; user_name: string; role: string; label: string | null; ip: string | null; status: 'pending' | 'approved' | 'rejected'; requested_at: string; decided_at: string | null; decided_by: string | null; last_used_at: string | null }
export interface SecurityState { rules: Rules; devices: Dev[]; pending: number }

function Switch({ on, onClick, testid }: { on: boolean; onClick: () => void; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} data-testid={testid} className={`tap flex h-8 w-14 shrink-0 items-center rounded-full p-1 ${on ? 'bg-emerald' : 'bg-line'}`}>
      <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6 rtl:-translate-x-6' : ''}`} />
    </button>
  )
}

export default function LoginSecurityPage() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data, isLoading } = useGet<SecurityState>(['security'], '/api/v1/security')
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('23:00')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [confirmOut, setConfirmOut] = useState(false)
  const [ended, setEnded] = useState<number | null>(null)
  const small = ur ? cls('sm') : 'text-sm'

  useEffect(() => {
    if (data) { setFrom(data.rules.hours_from); setTo(data.rules.hours_to) }
  }, [data?.rules.hours_from, data?.rules.hours_to]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    setErr(null)
    try {
      await fn()
      await inv('security')
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(null)
    }
  }
  const setRules = (body: Partial<Rules>, key: string) => run(key, () => api('PUT', '/api/v1/security/rules', body))
  const act = (d: Dev, action: 'approve' | 'reject' | 'revoke') => run(`${action}${d.id}`, () => post(`/api/v1/security/devices/${d.id}/${action}`, {}))

  if (isLoading || !data) return <div className="flex flex-col gap-3"><PageHeader title="sec.title" help={<Help term="sec.page" />} /><Loading /></div>
  const r = data.rules
  const pending = data.devices.filter((d) => d.status === 'pending')
  const approved = data.devices.filter((d) => d.status === 'approved')
  const rejected = data.devices.filter((d) => d.status === 'rejected')

  const row = (d: Dev, buttons: React.ReactNode) => (
    <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2" data-testid={`dev-${d.status}`}>
      <span className="well h-10 w-10 shrink-0 bg-ground text-ink"><Smartphone size={18} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{d.user_name} <span className={`font-medium text-muted ${small}`}>· {pick(`staff.roles.${d.role}`)}</span></span>
        <span className={`truncate text-muted ${small}`} dir="auto">{d.label ?? '—'}{d.ip ? <span dir="ltr"> · {d.ip}</span> : null}</span>
        <span className={`text-muted ${small}`}>
          {d.status === 'pending' ? pick('sec.asked') : d.status === 'approved' ? pick('sec.lastUsed') : pick('sec.refused')}{' '}
          <span dir="ltr">{fmtDateTime(d.status === 'pending' ? d.requested_at : d.status === 'approved' ? d.last_used_at ?? d.decided_at : d.decided_at)}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-2">{buttons}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="sec.title" help={<Help term="sec.page" />} />

      <section className="card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="well h-11 w-11 shrink-0 bg-emerald-tint text-emerald-deep"><ShieldCheck size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1"><BiLabel text="sec.devices" size="md" bold /><Help term="sec.devices" size="sm" /></span>
            <BiLabel text="sec.devicesHint" size="sm" tone="text-muted" />
          </span>
          <Switch on={r.device_approval} onClick={() => void setRules({ device_approval: !r.device_approval }, 'dev')} testid="sec-devices" />
        </div>
        {r.device_approval ? <Chip text="sec.devicesOn" tone="ok" /> : null}
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="well h-11 w-11 shrink-0 bg-gold/15 text-gold-text"><Clock size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1"><BiLabel text="sec.hours" size="md" bold /><Help term="sec.hours" size="sm" /></span>
            <BiLabel text="sec.hoursHint" size="sm" tone="text-muted" />
          </span>
          <Switch on={r.hours_on} onClick={() => void setRules({ hours_on: !r.hours_on, hours_from: from, hours_to: to }, 'hours')} testid="sec-hours" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <BiInput label="sec.from" type="time" value={from} onChange={(e) => { setFrom(e.target.value); setSaved(false) }} dir="ltr" data-testid="sec-from" />
          <BiInput label="sec.to" type="time" value={to} onChange={(e) => { setTo(e.target.value); setSaved(false) }} dir="ltr" data-testid="sec-to" />
        </div>
        {from !== r.hours_from || to !== r.hours_to ? (
          <BiButton text="sec.saveHours" size="md" loading={busy === 'save'} onClick={() => void setRules({ hours_from: from, hours_to: to }, 'save').then(() => setSaved(true))} />
        ) : saved ? <BiLabel text="sec.saved" size="sm" tone="text-emerald-deep" /> : null}
      </section>

      {err ? <ErrorText error={err} /> : null}

      <section className="card flex flex-col gap-2" data-testid="sec-pending">
        <span className="flex items-center gap-1"><BiLabel text="sec.waiting" size="md" bold />{pending.length ? <Chip text={String(pending.length)} tone="warn" /> : null}</span>
        {pending.length ? pending.map((d) => row(d, (
          <>
            <BiButton text="sec.allow" size="md" loading={busy === `approve${d.id}`} onClick={() => void act(d, 'approve')} />
            <BiButton text="sec.no" size="md" variant="secondary" loading={busy === `reject${d.id}`} onClick={() => void act(d, 'reject')} />
          </>
        ))) : <BiLabel text="sec.noneWaiting" size="sm" tone="text-muted" />}
      </section>

      <section className="card flex flex-col gap-2" data-testid="sec-approved">
        <BiLabel text="sec.allowed" size="md" bold />
        {approved.length ? approved.map((d) => row(d, <BiButton text="sec.takeBack" size="md" variant="secondary" loading={busy === `revoke${d.id}`} onClick={() => void act(d, 'revoke')} />)) : <BiLabel text="sec.noneAllowed" size="sm" tone="text-muted" />}
      </section>

      {rejected.length ? (
        <section className="card flex flex-col gap-2">
          <BiLabel text="sec.refusedList" size="md" bold />
          {rejected.map((d) => row(d, (
            <>
              <BiButton text="sec.allow" size="md" variant="secondary" loading={busy === `approve${d.id}`} onClick={() => void act(d, 'approve')} />
              <BiButton text="sec.forget" size="md" variant="ghost" loading={busy === `revoke${d.id}`} onClick={() => void act(d, 'revoke')} />
            </>
          )))}
        </section>
      ) : null}

      <section className="card flex flex-col gap-2">
        <span className="flex items-center gap-1"><BiLabel text="sec.logoutAll" size="md" bold /><Help term="sec.logoutAll" size="sm" /></span>
        <BiLabel text="sec.logoutAllHint" size="sm" tone="text-muted" />
        <BiButton text="sec.logoutAllBtn" icon={<LogOut size={20} />} variant="danger" onClick={() => setConfirmOut(true)} data-testid="sec-logout-all" />
        {ended != null ? <BiLabel text={{ en: pick('sec.ended').replace('{{n}}', String(ended)), ur: pick('sec.ended').replace('{{n}}', String(ended)) }} size="sm" tone="text-emerald-deep" /> : null}
      </section>

      <Sheet open={confirmOut} onClose={() => setConfirmOut(false)} title="sec.logoutAll">
        <div className="flex flex-col gap-3">
          <BiLabel text="sec.logoutConfirm" size="md" />
          <BiButton text="sec.logoutAllBtn" variant="danger" full loading={busy === 'out'} onClick={() => void run('out', async () => { const res = await post<{ ended: number }>('/api/v1/security/logout-staff', {}); setEnded(res.ended); setConfirmOut(false) })} data-testid="sec-logout-confirm" />
        </div>
      </Sheet>
    </div>
  )
}
