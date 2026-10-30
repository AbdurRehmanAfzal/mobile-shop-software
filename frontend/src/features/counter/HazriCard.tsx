/** Hazri on Home (owner 2026-10-30): one tap to check in when the shop opens, one to check out.
 *  Shown to everyone when the shop's "attendance" module is on. */

import { Clock, LogIn, LogOut } from 'lucide-react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, ErrorText } from '@/components/ui'
import { useModules } from '@/lib/modules'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'

export interface Att { id: string; user_id: string; user_name: string | null; day: string; status: 'present' | 'half' | 'leave' | 'absent'; in_at: string | null; out_at: string | null; hours: number | null; note: string | null; marked_by: string | null }

export const tm = (iso: string | null | undefined) => (iso ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')

export default function HazriCard() {
  const has = useModules()
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data } = useGet<{ day: string; record: Att | null }>(['hazri-today'], has('attendance') ? '/api/v1/attendance/today' : null)
  const checkIn = useDocMutation<Record<string, never>, Att>('POST', () => '/api/v1/attendance/check-in')
  const checkOut = useDocMutation<Record<string, never>, Att>('POST', () => '/api/v1/attendance/check-out')
  if (!has('attendance') || !data) return null
  const r = data.record
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const line = !r?.in_at
    ? pick('hazri.notIn')
    : r.out_at
      ? `${pick('hazri.inOut').replace('{{a}}', tm(r.in_at)).replace('{{b}}', tm(r.out_at))}${r.hours != null ? ` · ${pick('hazri.hours').replace('{{h}}', String(r.hours))}` : ''}`
      : pick('hazri.inAt').replace('{{t}}', tm(r.in_at))
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={`well h-11 w-11 shrink-0 rounded-2xl ${r?.in_at && !r.out_at ? 'bg-emerald-tint text-emerald-deep' : 'bg-ground text-muted'}`}><Clock size={22} strokeWidth={1.9} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <BiLabel text="hazri.title" size="md" bold />
          <span className={`text-muted ${small}`}>{line}</span>
        </span>
        {!r?.in_at ? (
          <BiButton text="hazri.checkIn" size="sm" icon={<LogIn size={18} />} loading={checkIn.isPending} onClick={async () => { await checkIn.mutateAsync({}); inv('hazri-today') }} />
        ) : !r.out_at ? (
          <BiButton text="hazri.checkOut" size="sm" variant="secondary" icon={<LogOut size={18} />} loading={checkOut.isPending} onClick={async () => { await checkOut.mutateAsync({}); inv('hazri-today') }} />
        ) : (
          <Chip text="hazri.done" tone="ok" />
        )}
      </div>
      <ErrorText error={checkIn.error ?? checkOut.error} />
    </div>
  )
}
