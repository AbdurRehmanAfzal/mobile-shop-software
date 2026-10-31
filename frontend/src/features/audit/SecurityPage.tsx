/** Shop Audit → Security (docs/16 §14, docs/17 P8-2): the owner's feed of every bent number or
 *  rule — who, when, before / after, reason, authorisation — with a filter by kind and the
 *  per-employee counts and flags. Owner only (the API refuses everyone else). */

import { ShieldAlert } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Loading, fmtDateTime } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

interface Row { at: string; kind: string; user_name: string | null; label: string; before: string | null; after: string | null; amount: string | null; reason: string | null; approved_by: string | null; source: string | null; ref: string | null; link: { type: string; id: string } | null }
interface Feed { counts: Record<string, number>; total: number; rows: Row[]; by_user: { user_name: string; total: number; kinds: Record<string, number>; flags: string[] }[]; flag_at: Record<string, number>; kinds: string[] }

const n = (v: string | number | null | undefined) => (v == null || v === '' || isNaN(Number(v)) ? v ?? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const TONE: Record<string, string> = { asking_changed: 'bg-receivable-tint text-receivable', below_asking: 'bg-payable-tint text-payable', below_cost: 'bg-payable-tint text-payable', discount: 'bg-receivable-tint text-receivable', void: 'bg-payable-tint text-payable', reversal: 'bg-payable-tint text-payable', bypass: 'bg-payable-tint text-payable', pin_wrong: 'bg-payable-tint text-payable', security: 'bg-ink text-ground' }
const linkTo = (l: Row['link']) => (!l ? null : l.type === 'device' ? `/stock/${l.id}` : l.type === 'invoice' ? `/sales/${l.id}` : l.type === 'purchase' ? `/purchases/${l.id}` : l.type === 'party' ? `/parties/${l.id}` : l.type === 'payment' ? '/payments' : l.type === 'expense' ? '/expenses' : null)

export default function SecurityPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const kind = sp.get('kind')
  const setKind = (k: string | null) => { const o = new URLSearchParams(sp); if (k) o.set('kind', k); else o.delete('kind'); setSp(o, { replace: true }) }
  const { data, isLoading, error } = useGet<Feed>(['audit-security', query, kind], role === 'owner' ? `/api/v1/shop-audit/security?${query}${kind ? `&kind=${kind}` : ''}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (role !== 'owner') return <AuditLayout><Empty text="audit.sec.ownerOnly" /></AuditLayout>
  return (
    <AuditLayout>
      <BiLabel text="audit.sec.hint" size="sm" tone="text-muted" />
      {isLoading || !data ? (error ? <Empty text="audit.sec.ownerOnly" /> : <Loading />) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-testid="sec-kinds">
            <button type="button" aria-pressed={!kind} onClick={() => setKind(null)} className={`tap min-h-9 whitespace-nowrap rounded-full border px-3 py-1.5 font-bold leading-tight ${!kind ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{pick('common.all')} · {data.total}</button>
            {data.kinds.filter((k) => data.counts[k]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)} className={`tap min-h-9 whitespace-nowrap rounded-full border px-3 py-1.5 font-bold leading-tight ${kind === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{pick(`audit.sec.k.${k}`)} · {data.counts[k]}</button>)}
          </div>
          <section className="card flex flex-col gap-1.5" data-testid="sec-users">
            <div className="flex items-center gap-2"><ShieldAlert size={18} /><BiLabel text="audit.sec.byUser" size="md" bold /></div>
            {data.by_user.map((u) => (
              <div key={u.user_name} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{u.user_name}{u.flags.length ? <span className={`ms-2 rounded-full bg-payable-tint px-2 py-0.5 text-payable ${ur ? cls('sm') : 'text-[11px]'}`}>{pick('audit.sec.flagged')}: {u.flags.map((f) => pick(`audit.sec.k.${f}`)).join(', ')}</span> : null}</span>
                <span className={`text-muted ${small}`}>{Object.entries(u.kinds).map(([k, c]) => `${pick(`audit.sec.k.${k}`)} ${c}`).join(' · ')}</span>
              </div>
            ))}
            {!data.by_user.length ? <span className={`text-muted ${small}`}>—</span> : null}
            <span className={`text-muted ${small}`}>{pick('audit.sec.flagHint')} {Object.entries(data.flag_at).map(([k, v]) => `${pick(`audit.sec.k.${k}`)} ≥ ${v}`).join(' · ')}</span>
          </section>
          {!data.rows.length ? <Empty text="audit.sec.none" /> : (
            <div className="card divide-y divide-line p-0" data-testid="sec-rows">
              {data.rows.map((r, i) => {
                const to = linkTo(r.link)
                const body = (
                  <>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 ${TONE[r.kind] ?? 'bg-ground text-muted'} ${ur ? cls('sm') : 'text-[11px] font-bold'}`}>{pick(`audit.sec.k.${r.kind}`)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold" dir="auto">{r.label}{r.ref && r.ref !== r.label ? <span className="font-medium text-muted" dir="ltr"> · {r.ref}</span> : null}</span>
                      <span className={`text-muted ${small}`} dir="auto">{r.user_name ?? '—'} · <span dir="ltr">{fmtDateTime(r.at)}</span>{r.before != null || r.after != null ? <> · <span className="num" dir="ltr">{n(r.before)} → {n(r.after)}</span></> : null}{r.reason ? ` · ${r.reason}` : ''}{r.approved_by ? ` · ${pick('unit.approved')}: ${r.approved_by}` : ''}</span>
                    </span>
                    {r.amount != null ? <span className={`num font-bold ${Number(r.amount) < 0 ? 'text-payable' : ''}`} dir="ltr">{n(r.amount)}</span> : null}
                  </>
                )
                return to ? <Link key={i} to={to} className="tap flex items-center gap-3 px-4 py-2.5">{body}</Link> : <div key={i} className="flex items-center gap-3 px-4 py-2.5">{body}</div>
              })}
            </div>
          )}
          <BiLabel text="audit.sec.notes" size="sm" tone="text-muted" />
        </>
      )}
    </AuditLayout>
  )
}
