/** Stock tally sheet (owner 2026-11-14, ADR-075): print / PDF / Excel of every phone on hand, with
 *  the shop's figures and counts by brand and model, to count the stock by hand.
 *  Staff copy (ADR-077): the same sheet with no money at all, to hand to the staff. The owner and
 *  manager get both; a salesman / technician asks the owner, and gets the staff copy once approved.
 *  The owner answers the requests here. */

import { ClipboardCheck, Printer, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { ErrorText, fmtDateTime } from '@/components/ui'
import { post } from '@/lib/api'
import { openPrintable } from '@/lib/files'
import { withDocLang } from '@/lib/docLang'
import { useGet, useInvalidate } from '@/lib/queries'

export interface AccessReq { id: string; name: string | null; status: 'pending' | 'approved'; requested_at: string; decided_at: string | null }
export interface TallyAccess { allowed: boolean; status: 'pending' | 'approved' | 'rejected' | 'revoked' | null; requests: AccessReq[] | null }

const URL = '/api/v1/exports/stock-tally'

function Actions({ staff, testid }: { staff: boolean; testid: string }) {
  const { pick, ur, cls } = useLang()
  const path = staff ? `${URL}?staff=true` : URL
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testid}>
      <button type="button" onClick={() => openPrintable(withDocLang(`${path}${staff ? '&' : '?'}format=pdf`))} className={`tap inline-flex min-h-14 items-center gap-2 rounded-2xl px-4 font-bold ${staff ? 'border border-line bg-surface text-ink' : 'bg-ink text-ground'} ${ur ? cls('sm') : 'text-sm'}`} data-testid={staff ? 'tally-print-staff' : 'tally-print'}>
        <Printer size={20} />{pick('tally.print')}
      </button>
      <DownloadButton path={path} name={staff ? 'stock-tally-staff' : 'stock-tally'} />
    </div>
  )
}

export default function TallySheetCard() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data: acc } = useGet<TallyAccess>(['tally-access'], '/api/v1/staff-access/stock_tally')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const small = ur ? cls('sm') : 'text-xs'

  async function act(path: string, key: string) {
    setBusy(key)
    setErr(null)
    try {
      await post(path, {})
      await inv('tally-access')
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(null)
    }
  }

  const full = acc?.allowed && acc.status === null // owner / manager
  return (
    <div className="card flex flex-col gap-3" data-testid="tally-card">
      <div className="flex items-center gap-3">
        <span className="well h-11 w-11 shrink-0 bg-stockt text-stockt-fg"><ClipboardCheck size={22} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1"><BiLabel text="tally.title" size="md" bold /><Help term="tally.sheet" size="sm" /></span>
          <BiLabel text={full || !acc ? 'tally.hint' : 'tally.staffHint'} size="sm" tone="text-muted" />
        </span>
      </div>
      {!acc ? null : full ? (
        <>
          <Actions staff={false} testid="tally-full" />
          <div className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
            <span className="flex items-center gap-1"><BiLabel text="tally.staffCopy" size="sm" bold /><Help term="tally.staff" size="sm" /></span>
            <BiLabel text="tally.staffCopyHint" size="sm" tone="text-muted" />
            <Actions staff testid="tally-staff" />
          </div>
          {acc.requests && acc.requests.length ? (
            <div className="flex flex-col gap-2" data-testid="tally-requests">
              <span className="flex items-center gap-1"><UserCheck size={16} className="text-emerald" /><BiLabel text="tally.requests" size="sm" bold /></span>
              {acc.requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{r.name ?? '—'}</span>
                    <span className={`text-muted ${small}`}>{pick(r.status === 'pending' ? 'tally.asked' : 'tally.allowedSince')} <span dir="ltr">{fmtDateTime(r.status === 'pending' ? r.requested_at : r.decided_at)}</span></span>
                  </span>
                  {r.status === 'pending' ? (
                    <>
                      <BiButton text="tally.approve" size="md" loading={busy === `a${r.id}`} onClick={() => act(`/api/v1/staff-access/requests/${r.id}/approve`, `a${r.id}`)} />
                      <BiButton text="tally.reject" size="md" variant="secondary" loading={busy === `r${r.id}`} onClick={() => act(`/api/v1/staff-access/requests/${r.id}/reject`, `r${r.id}`)} />
                    </>
                  ) : (
                    <BiButton text="tally.revoke" size="md" variant="secondary" loading={busy === `v${r.id}`} onClick={() => act(`/api/v1/staff-access/requests/${r.id}/revoke`, `v${r.id}`)} />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : acc.allowed ? (
        <Actions staff testid="tally-staff" />
      ) : acc.status === 'pending' ? (
        <div className={`rounded-2xl bg-gold/15 px-3 py-2 font-bold text-gold-text ${small}`} data-testid="tally-waiting">{pick('tally.waiting')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {acc.status === 'rejected' || acc.status === 'revoked' ? <BiLabel text={acc.status === 'rejected' ? 'tally.rejected' : 'tally.revoked'} size="sm" tone="text-payable" /> : null}
          <BiButton text="tally.ask" size="md" variant="ghost" loading={busy === 'ask'} onClick={() => act('/api/v1/staff-access/stock_tally/request', 'ask')} data-testid="tally-ask" />
        </div>
      )}
      {err ? <ErrorText error={err} /> : null}
    </div>
  )
}
