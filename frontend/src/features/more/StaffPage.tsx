/** Staff: who works here (add, role, password, disable), their hazri (attendance) and what each one
 *  did (owner 2026-10-30). Owner only. */

import { Activity, CalendarCheck, Check, Clock, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { Chip, Empty, ErrorText, List, Loading, PageHeader, Row, Sheet, fmtDate } from '@/components/ui'
import PeriodPicker, { periodOf, type Period } from '@/features/counter/PeriodPicker'
import { tm, type Att } from '@/features/counter/HazriCard'
import { useAuth } from '@/lib/auth'
import { isoDay } from '@/lib/format'
import { useModules } from '@/lib/modules'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import { normalisePhone } from '@/lib/format'

interface Staff { id: string; name: string; phone: string; role: 'owner' | 'manager' | 'salesman' | 'technician'; is_active: boolean; last_login_at: string | null }
type Role = 'manager' | 'salesman' | 'technician'
type Tab = 'staff' | 'hazri' | 'activity'
type St = 'present' | 'half' | 'leave' | 'absent'
const ST: St[] = ['present', 'half', 'leave', 'absent']
const TONE: Record<St, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { present: 'ok', half: 'warn', leave: 'ink', absent: 'bad' }
const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function StaffPage() {
  const { pick, ur, cls } = useLang()
  const has = useModules()
  const [params, setParams] = useSearchParams()
  const tab = ((['staff', 'hazri', 'activity'] as Tab[]).includes(params.get('tab') as Tab) ? params.get('tab') : 'staff') as Tab
  const tabs: { k: Tab; Icon: typeof Users }[] = [{ k: 'staff', Icon: Users }, ...(has('attendance') ? [{ k: 'hazri' as Tab, Icon: CalendarCheck }] : []), { k: 'activity', Icon: Activity }]
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="staff.title" />
      <div className="grid gap-1.5 rounded-2xl border border-line bg-surface p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ k, Icon }) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setParams(k === 'staff' ? {} : { tab: k }, { replace: true })} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-xl font-bold ${tab === k ? 'bg-ink text-ground' : 'text-muted'} ${ur ? cls('sm') : 'text-sm'}`}>
            <Icon size={18} />{pick(`hazri.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'staff' ? <StaffList /> : tab === 'hazri' ? <HazriTab /> : <ActivityTab />}
    </div>
  )
}

function StaffList() {
  const { pick } = useLang()
  const myId = useAuth((s) => s.me?.user.id)
  const { data } = useGet<Staff[]>(['staff'], '/api/v1/staff')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [f, setF] = useState({ name: '', phone: '', password: '', pin: '', role: 'salesman' as Role })
  const [pw, setPw] = useState('')
  const create = useDocMutation<Record<string, unknown>, Staff>('POST', () => '/api/v1/staff')
  const update = useDocMutation<{ id: string } & Record<string, unknown>, Staff>('PATCH', (i) => `/api/v1/staff/${i.id}`, ({ id: _id, ...rest }) => rest)
  return (
    <>
      <BiButton text="staff.new" icon={<Plus size={22} />} full onClick={() => setAdding(true)} />
      <List>
        {data?.map((u) => (
          <Row key={u.id} title={u.name} sub={<span dir="ltr">{u.phone}</span>} right={<div className="flex flex-col items-end gap-1"><Chip text={`staff.roles.${u.role}`} tone="ink" />{!u.is_active ? <Chip text="staff.disabled" tone="bad" /> : null}</div>} onClick={u.id !== myId && u.role !== 'owner' ? () => { setEditing(u); setPw('') } : undefined} />
        ))}
      </List>

      <Sheet open={adding} onClose={() => setAdding(false)} title="staff.new">
        <div className="flex flex-col gap-3">
          <BiInput label="staff.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <PhoneInput label="staff.phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
          <BiInput label="staff.password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} />
          <BiInput label="staff.pin" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} />
          <BiLabel text="staff.role" size="md" tone="text-muted" />
          <BiSegmented<Role> value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: 'salesman', text: 'staff.roles.salesman' }, { value: 'technician', text: 'staff.roles.technician' }, { value: 'manager', text: 'staff.roles.manager' }]} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" icon={<Check size={22} />} full loading={create.isPending} disabled={!f.name || f.password.length < 6 || !f.phone} onClick={async () => { await create.mutateAsync({ name: f.name, phone: normalisePhone(f.phone), password: f.password, pin: f.pin || undefined, role: f.role }); setAdding(false); setF({ name: '', phone: '', password: '', pin: '', role: 'salesman' }) }} />
        </div>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? { en: editing.name, ur: editing.name, roman: editing.name } : ''}>
        {editing ? (
          <div className="flex flex-col gap-3">
            <BiLabel text="staff.role" size="md" tone="text-muted" />
            <BiSegmented<Role> value={editing.role as Role} onChange={async (role) => { const u = await update.mutateAsync({ id: editing.id, role }); setEditing(u) }} options={[{ value: 'salesman', text: 'staff.roles.salesman' }, { value: 'technician', text: 'staff.roles.technician' }, { value: 'manager', text: 'staff.roles.manager' }]} />
            <BiInput label="staff.resetPassword" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} />
            <BiButton text="common.save" variant="secondary" full disabled={pw.length < 6} loading={update.isPending} onClick={async () => { await update.mutateAsync({ id: editing.id, password: pw }); setPw('') }} />
            <BiButton text={editing.is_active ? 'staff.disable' : 'staff.enable'} variant={editing.is_active ? 'danger' : 'primary'} full loading={update.isPending} onClick={async () => { const u = await update.mutateAsync({ id: editing.id, is_active: !editing.is_active }); setEditing(u) }} />
            <ErrorText error={update.error} />
          </div>
        ) : null}
      </Sheet>
      <span className="sr-only">{pick('staff.title')}</span>
    </>
  )
}

interface SummaryRow { user_id: string; user_name: string; role: string; present: number; half: number; leave: number; absent: number; missing: number; hours: number; today: St | null }

function HazriTab() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [period, setPeriod] = useState<Period>(() => periodOf('month'))
  const qs = `date_from=${period.from}&date_to=${period.to}`
  const { data, isLoading } = useGet<SummaryRow[]>(['hazri-summary', qs], `/api/v1/attendance/summary?${qs}`)
  const [who, setWho] = useState<SummaryRow | null>(null)
  const { data: days } = useGet<Att[]>(['hazri-rows', who?.user_id ?? '', qs], who ? `/api/v1/attendance?${qs}&user_id=${who.user_id}` : null)
  const [day, setDay] = useState(isoDay(0))
  const [st, setSt] = useState<St>('present')
  const [note, setNote] = useState('')
  const mark = useDocMutation<Record<string, unknown>, Att>('PUT', () => `/api/v1/attendance/${who?.user_id}/${day}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="hazri.noRows" /> : (
        <div className="flex flex-col gap-2">
          {data.map((s) => (
            <button key={s.user_id} type="button" onClick={() => { setWho(s); setDay(isoDay(0)); setSt('present'); setNote(''); mark.reset() }} className="card tap flex flex-col gap-2 text-start">
              <div className="flex items-center gap-3">
                <span className="well h-11 w-11 shrink-0 rounded-full bg-khata text-khata-fg text-base font-extrabold">{s.user_name.slice(0, 1).toUpperCase()}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{s.user_name}</span>
                  <span className={`text-muted ${small}`}>{pick(`staff.roles.${s.role}`)} · {pick('hazri.hours').replace('{{h}}', String(s.hours))}</span>
                </span>
                {s.today ? <Chip text={`hazri.st.${s.today}`} tone={TONE[s.today]} /> : <Chip text="hazri.notToday" tone="muted" />}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {([['present', s.present], ['half', s.half], ['leave', s.leave], ['absent', s.absent], ['missing', s.missing]] as [string, number][]).map(([k, v]) => (
                  <span key={k} className="flex flex-col items-center rounded-xl bg-ground px-1 py-1.5">
                    <span className="num text-lg leading-none">{v}</span>
                    <span className={`text-center text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k === 'missing' ? 'hazri.missing' : `hazri.st.${k}`)}</span>
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={who !== null} onClose={() => setWho(null)} title={who ? { en: who.user_name, ur: who.user_name, roman: who.user_name } : ''}>
        {who ? (
          <div className="flex flex-col gap-3">
            <div className="card flex flex-col gap-2">
              <BiLabel text="hazri.mark" size="md" bold />
              <BiInput label="hazri.day" type="date" value={day} max={isoDay(0)} onChange={(e) => setDay(e.target.value)} dir="ltr" />
              <BiSegmented<St> value={st} onChange={setSt} options={ST.map((s) => ({ value: s, text: `hazri.st.${s}` }))} />
              <BiInput label="common.notes" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              <ErrorText error={mark.error} />
              <BiButton text="common.save" icon={<Check size={22} />} full loading={mark.isPending} disabled={!day} onClick={async () => { await mark.mutateAsync({ status: st, note: note || null }); inv('hazri-summary', 'hazri-rows', 'hazri-today', 'staff-activity') }} />
            </div>
            {days?.length ? (
              <List>
                {days.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Clock size={16} className="shrink-0 text-muted" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-bold" dir="ltr">{fmtDate(d.day)}</span>
                      <span className={`text-muted ${small}`} dir="ltr">{d.in_at ? `${tm(d.in_at)}${d.out_at ? ` – ${tm(d.out_at)} · ${d.hours} h` : ''}` : d.note || ''}</span>
                    </span>
                    <Chip text={`hazri.st.${d.status}`} tone={TONE[d.status]} />
                  </div>
                ))}
              </List>
            ) : <Empty text="hazri.noRows" />}
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}

interface ActRow { user_id: string; user_name: string; role: string; is_active: boolean; last_login_at: string | null; today: St | null; actions: number; sales_count: number; sales_total: string; purchases_count: number; purchases_total: string; received: string; paid_out: string; expenses_total: string; repairs_count: number }
interface LogRow { id: string; at: string; entity: string; action: string; ref: string | null; amount: string | null }

function ActivityTab() {
  const { pick, ur, cls } = useLang()
  const [period, setPeriod] = useState<Period>(() => periodOf('today'))
  const qs = `date_from=${period.from}&date_to=${period.to}`
  const { data, isLoading } = useGet<ActRow[]>(['staff-activity', qs], `/api/v1/staff-activity?${qs}`)
  const [who, setWho] = useState<ActRow | null>(null)
  const { data: log } = useGet<LogRow[]>(['staff-log', who?.user_id ?? '', qs], who ? `/api/v1/staff-activity/${who.user_id}/log?${qs}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const word = (ns: string, k: string) => { const key = `${ns}.${k}`; const v = pick(key); return v === key || v === k ? k.replace(/_/g, ' ') : v }
  return (
    <div className="flex flex-col gap-3">
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      {isLoading ? <Loading /> : !data?.length ? <Empty text="activity.none" /> : (
        <div className="flex flex-col gap-2">
          {data.map((a) => (
            <button key={a.user_id} type="button" onClick={() => setWho(a)} className="card tap flex flex-col gap-2 text-start">
              <div className="flex items-center gap-3">
                <span className="well h-11 w-11 shrink-0 rounded-full bg-sell text-sell-fg text-base font-extrabold">{a.user_name.slice(0, 1).toUpperCase()}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{a.user_name}{!a.is_active ? <span className="text-muted"> · {pick('staff.disabled')}</span> : null}</span>
                  <span className={`text-muted ${small}`}>{pick(`staff.roles.${a.role}`)} · {a.last_login_at ? `${pick('activity.lastLogin')} ${fmtDate(a.last_login_at)} ${tm(a.last_login_at)}` : pick('activity.never')}</span>
                </span>
                {a.today ? <Chip text={`hazri.st.${a.today}`} tone={TONE[a.today]} /> : null}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([['activity.sales', `${a.sales_count} · ${n(a.sales_total)}`], ['activity.received', n(a.received)], ['activity.purchases', `${a.purchases_count} · ${n(a.purchases_total)}`], ['activity.expenses', n(a.expenses_total)], ['activity.repairs', String(a.repairs_count)], ['activity.actions', String(a.actions)]] as [string, string][]).map(([k, v]) => (
                  <span key={k} className="flex flex-col rounded-xl bg-ground px-2 py-1.5">
                    <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
                    <span className="num text-base leading-tight" dir="ltr">{v}</span>
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={who !== null} onClose={() => setWho(null)} title={who ? { en: `${who.user_name} · ${pick('activity.log')}`, ur: `${who.user_name} · ${pick('activity.log')}`, roman: `${who.user_name} · ${pick('activity.log')}` } : ''}>
        {!log ? <Loading /> : !log.length ? <Empty text="activity.none" /> : (
          <List>
            {log.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-bold">{word('audit.a', l.action)} · {word('audit.e', l.entity)}{l.ref ? <span className="font-medium text-muted" dir="ltr"> · {l.ref}</span> : null}</span>
                  <span className={`text-muted ${small}`} dir="ltr">{fmtDate(l.at)} {tm(l.at)}</span>
                </span>
                {l.amount != null ? <span className="num" dir="ltr">{n(l.amount)}</span> : null}
              </div>
            ))}
          </List>
        )}
      </Sheet>
    </div>
  )
}
