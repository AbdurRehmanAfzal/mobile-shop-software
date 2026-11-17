/** "First do this" in a delete sheet (owner 2026-11-17, ADR-100): before the shopkeeper types a
 *  reason, the app says what stands in the way — the phone is at repair, on loan or sold on, a
 *  payment was made against the bill later — each with a button to the screen where it is undone.
 *  It only reads; the delete keeps its own checks, so the form below stays as it was. When the
 *  check cannot be read (older server, no network) nothing is shown. */

import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { get } from '@/lib/api'
import { withCur } from '@/lib/format'

interface Blocker { code: string; to?: string | null; phone?: string | null; who?: string | null; ref?: string | null; amount?: string | number | null }
interface Check { ok: boolean; blockers: Blocker[] }

export default function DeleteBlockers({ kind, id, open, onGo }: { kind: string; id: string | undefined; open: boolean; onGo?: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [chk, setChk] = useState<Check | null>(null)
  useEffect(() => {
    if (!open || !id) { setChk(null); return }
    let stale = false
    get<Check>(`/api/v1/delete-check/${kind}/${id}`).then((c) => { if (!stale) setChk(c) }).catch(() => { if (!stale) setChk(null) })
    return () => { stale = true }
  }, [open, kind, id])
  if (!chk || chk.ok || !chk.blockers.length) return null
  const text = (b: Blocker) => {
    const raw = pick(`delchk.c.${b.code}`)
    const base = raw === `delchk.c.${b.code}` ? pick('delchk.c.not_in_shop') : raw
    return base
      .replace('{{phone}}', b.phone ?? '—')
      .replace('{{who}}', b.who ?? '—')
      .replace('{{ref}}', b.ref ?? '—')
      .replace('{{amount}}', b.amount == null ? '—' : withCur(Number(b.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })))
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gold/50 bg-gold/15 p-3" data-testid="delete-blockers" role="alert">
      <span className="flex items-center gap-2 text-gold-text"><AlertTriangle size={18} /><BiLabel text="delchk.title" size="md" bold tone="text-current" /></span>
      <BiLabel text="delchk.intro" size="sm" tone="text-ink" />
      {chk.blockers.map((b, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2" data-testid={`blocker-${b.code}`}>
          <span className={`min-w-0 flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{text(b)}</span>
          {b.to ? (
            <button type="button" onClick={() => { onGo?.(); nav(b.to!) }} className={`tap inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl bg-ink px-3 text-ground ${ur ? cls('sm') : 'text-xs font-bold'}`} data-testid="blocker-open">
              {pick('delchk.open')}<ChevronRight size={14} className="rtl:rotate-180" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
