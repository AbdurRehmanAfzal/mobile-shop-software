/** Subscription notice (owner 2026-10-29, selling the software): from 7 days before the plan's
 *  expiry the owner sees how many days are left; after it, that the shop is in its grace days; after
 *  the grace the API only reads and the notice says whom to call. Shops without an expiry see
 *  nothing. The super admin sets the dates in More → Super admin. */

import { CalendarClock, MessageCircle, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLang } from './Bilingual'
import { MAKER } from '@/features/auth/AuthLayout'
import { useAuth } from '@/lib/auth'

export default function PlanBanner() {
  const { pick, ur, cls } = useLang()
  const plan = useAuth((s) => s.me?.plan)
  const role = useAuth((s) => s.me?.user.role)
  if (!plan || plan.status === 'unlimited' || plan.status === 'ok') return null
  // staff need not see the money side unless the shop is locked
  if (role !== 'owner' && plan.status !== 'locked') return null
  const n = (v: number) => String(Math.abs(v))
  const text =
    plan.status === 'due_soon'
      ? pick(plan.days_left === 0 ? 'plan.dueToday' : 'plan.dueSoon').replace('{{n}}', n(plan.days_left ?? 0))
      : plan.status === 'expired'
        ? pick('plan.expired').replace('{{n}}', n(plan.grace_days + (plan.days_left ?? 0)))
        : pick('plan.locked')
  const tone = plan.status === 'due_soon' ? 'bg-[#F59E0B]/15 text-[#92400E]' : 'bg-payable-tint text-payable'
  const wa = `https://wa.me/${MAKER.tel.replace('+', '')}?text=${encodeURIComponent(pick('plan.waText'))}`
  return (
    <div className={`print:hidden mx-5 mb-2 flex items-center gap-3 rounded-2xl px-4 py-3 ${tone} max-[379px]:mx-4`} role="status">
      {plan.status === 'locked' ? <ShieldAlert size={22} className="shrink-0" /> : <CalendarClock size={22} className="shrink-0" />}
      <Link to="/more/fees" className={`flex-1 font-semibold underline-offset-2 hover:underline ${ur ? cls('sm') : 'text-sm'}`}>{text} <span className="font-bold">{pick('fees.payNow')}</span></Link>
      <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={pick('plan.contact')} className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald text-white">
        <MessageCircle size={18} />
      </a>
    </div>
  )
}
