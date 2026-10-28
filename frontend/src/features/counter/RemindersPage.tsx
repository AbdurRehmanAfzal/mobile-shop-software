/** Udhaar reminders (owner 2026-10-29): everyone who owes the shop, how long their account has sat,
 *  and a WhatsApp reminder for one or for all. With the Cloud API set on the server they go out by
 *  themselves; otherwise each tap opens WhatsApp with the message ready. */

import { BellRing, Check, MessageCircle, Send } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiLabel, useLang } from '@/components/Bilingual'
import { Empty, ErrorText, Loading, PageHeader, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Message } from '@/lib/types'

interface Row { party_id: string; name: string; phone: string | null; balance: string; days_since: number | null; last_reminded_at: string | null; body: string }
const DAYS = [0, 7, 15, 30] as const

export default function RemindersPage() {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [minDays, setMinDays] = useState<(typeof DAYS)[number]>(0)
  const { data, isLoading } = useGet<Row[]>(['reminders', minDays], `/api/v1/notifications/reminders?min_days=${minDays}`)
  const { data: prov } = useGet<{ whatsapp_api: boolean }>(['notif-provider'], '/api/v1/notifications/provider')
  const auto = !!prov?.whatsapp_api
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ sent: number; links: Message[] } | null>(null)

  async function send(ids: string[] | null) {
    setBusy(ids ? ids[0] : 'all')
    setError(null)
    setDone(null)
    try {
      const msgs = await api<Message[]>('POST', '/api/v1/notifications/reminders', { party_ids: ids, min_days: minDays })
      if (!auto && msgs.length === 1 && msgs[0].link) {
        window.open(msgs[0].link, '_blank', 'noopener')
        await api('POST', `/api/v1/notifications/${msgs[0].id}/mark-sent`).catch(() => undefined)
      }
      setDone({ sent: msgs.filter((m) => m.status === 'sent').length, links: auto ? [] : msgs.filter((m) => m.status !== 'sent' && m.link) })
      inv('reminders', 'messages')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const n = (v: string) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="remind.title" />
      <BiLabel text={auto ? 'remind.autoHint' : 'remind.handHint'} size="sm" tone="text-muted" />
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => (
          <button key={d} type="button" aria-pressed={minDays === d} onClick={() => setMinDays(d)} className={`tap h-10 rounded-full border-2 px-3.5 font-bold ${minDays === d ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
            {d === 0 ? pick('remind.everyone') : pick('remind.olderThan').replace('{{n}}', String(d))}
          </button>
        ))}
      </div>

      {done ? (
        <div className="flex flex-col gap-2">
          <BiAlert text={auto ? { en: pick('remind.sentN').replace('{{n}}', String(done.sent)), ur: pick('remind.sentN').replace('{{n}}', String(done.sent)), roman: pick('remind.sentN').replace('{{n}}', String(done.sent)) } : 'remind.openEach'} kind="success" />
          {done.links.map((m) => (
            <a key={m.id} href={m.link!} target="_blank" rel="noopener noreferrer" onClick={() => void api('POST', `/api/v1/notifications/${m.id}/mark-sent`).catch(() => undefined)} className="tap flex min-h-12 items-center gap-2 rounded-2xl bg-emerald px-4 font-bold text-white">
              <MessageCircle size={18} /> <span dir="ltr">{m.recipient}</span>
            </a>
          ))}
        </div>
      ) : null}
      <ErrorText error={error} />

      {isLoading ? <Loading /> : !data?.length ? <Empty text="remind.none" /> : (
        <>
          <button type="button" disabled={!!busy} onClick={() => send(null)} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-ground disabled:opacity-60 ${ur ? cls('md') : ''}`}>
            {auto ? <Send size={20} /> : <BellRing size={20} />} {pick('remind.sendAll').replace('{{n}}', String(data.length))}
          </button>
          <div className="card divide-y divide-line p-0">
            {data.map((r) => (
              <div key={r.party_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{r.name}</span>
                  <span className={`text-muted ${small}`}>
                    {r.days_since != null ? pick('remind.daysSince').replace('{{n}}', String(r.days_since)) : ''}
                    {r.last_reminded_at ? <> · {pick('remind.lastSent')} <span dir="ltr">{fmtDate(r.last_reminded_at)}</span></> : null}
                  </span>
                </div>
                <span className="num text-lg text-receivable" dir="ltr">{n(r.balance)}</span>
                <button type="button" aria-label={`${pick('remind.send')} ${r.name}`} disabled={!!busy || !r.phone} onClick={() => send([r.party_id])} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald text-white disabled:opacity-40">
                  {busy === r.party_id ? <Check size={18} /> : <MessageCircle size={18} />}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
