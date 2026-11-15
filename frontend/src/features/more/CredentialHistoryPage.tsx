/** Password / PIN history (owner 2026-11-15, ADR-088): when each password or PIN was set, changed,
 *  removed or reset, by whom (self, the owner, the super admin, a code) and from which phone /
 *  browser. The owner sees everyone in the shop; anyone else their own. The password or PIN itself is
 *  never kept — nobody, not even the super admin, can read it. */

import { KeyRound, ShieldCheck } from 'lucide-react'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Empty, Loading, PageHeader, fmtDateTime } from '@/components/ui'
import { useGet } from '@/lib/queries'

export interface CredRow { id: string; user_name: string; role: string; phone: string; kind: 'password' | 'pin'; action: string; by_kind: string; by_name: string | null; user_agent: string | null; at: string }

function device(ua: string | null): string {
  if (!ua) return ''
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : ''
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [os, br].filter(Boolean).join(' · ')
}

export function CredList({ rows }: { rows: CredRow[] }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs'
  if (!rows.length) return <Empty text="cred.none" />
  return (
    <div className="card divide-y divide-line p-0" data-testid="cred-list">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
          <span className={`well h-10 w-10 shrink-0 ${r.kind === 'pin' ? 'bg-khata text-khata-fg' : 'bg-emerald-tint text-emerald-deep'}`}><KeyRound size={18} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold">{r.user_name} <span className={`font-medium text-muted ${small}`}>· {pick(`staff.roles.${r.role}`)}</span></span>
            <span className={small}>{pick(`cred.kind.${r.kind}`)} — {pick(`cred.action.${r.action}`)} · {r.by_kind === 'owner' && r.by_name ? `${pick('cred.by.owner')} (${r.by_name})` : pick(`cred.by.${r.by_kind}`)}</span>
            <span className={`text-muted ${small}`} dir="ltr">{fmtDateTime(r.at)}{device(r.user_agent) ? ` · ${device(r.user_agent)}` : ''}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function CredentialHistoryPage() {
  const { data, isLoading } = useGet<CredRow[]>(['cred-history'], '/api/v1/credentials/history')
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="cred.history" help={<Help term="cred.history" />} />
      <div className="flex items-start gap-2 rounded-2xl bg-emerald-tint/60 px-3 py-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-deep" />
        <BiLabel text="cred.safe" size="sm" tone="text-ink" />
      </div>
      {isLoading || !data ? <Loading /> : <CredList rows={data} />}
    </div>
  )
}
