/** The thin strip under the header for offline mode (owner 2026-10-29): "no internet" while the
 *  connection is down, "saved on this phone" right after something was queued, and "N waiting to
 *  send" with a list (retry / delete) until the queue is empty. Also the place that sends the queue:
 *  when the connection returns, every 30 s, and on opening the app. */

import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, CloudUpload, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { Sheet, fmtDateTime } from './ui'
import { useOffline } from '@/lib/offline'
import { flush, retry } from '@/lib/outbox'

export default function OfflineBar() {
  const { pick, ur, cls } = useLang()
  const qc = useQueryClient()
  const online = useOffline((s) => s.online)
  const queue = useOffline((s) => s.queue)
  const sending = useOffline((s) => s.sending)
  const lastQueuedAt = useOffline((s) => s.lastQueuedAt)
  const remove = useOffline((s) => s.remove)
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    void flush(qc)
    const t = setInterval(() => void flush(qc), 30_000)
    return () => clearInterval(t)
  }, [qc])
  useEffect(() => {
    if (online) void flush(qc)
  }, [online, qc])
  // the "saved on this phone" notice fades after a few seconds
  useEffect(() => {
    if (!lastQueuedAt) return
    const t = setTimeout(() => tick((n) => n + 1), 6500)
    return () => clearTimeout(t)
  }, [lastQueuedAt])

  const justQueued = !!lastQueuedAt && Date.now() - lastQueuedAt < 6000
  const failed = queue.filter((x) => x.error).length
  if (online && !queue.length && !justQueued) return null
  const small = ur ? cls('sm') : 'text-sm font-semibold'
  const tone = justQueued ? 'bg-emerald-tint text-emerald-deep' : !online ? 'bg-[#F59E0B]/15 text-[#92400E]' : failed ? 'bg-payable-tint text-payable' : 'bg-khata text-khata-fg'
  const text = justQueued ? pick('offline.queued') : !online ? pick('offline.noNet') : sending ? pick('offline.sending') : failed ? pick('offline.failedN').replace('{{n}}', String(failed)) : pick('offline.pendingN').replace('{{n}}', String(queue.length))
  return (
    <>
      <button type="button" onClick={() => queue.length && setOpen(true)} role="status" className={`print:hidden mx-5 mb-2 flex items-center gap-3 rounded-2xl px-4 py-2.5 text-start ${tone} max-[379px]:mx-4`}>
        {!online ? <WifiOff size={20} className="shrink-0" /> : justQueued ? <CloudOff size={20} className="shrink-0" /> : <CloudUpload size={20} className={`shrink-0 ${sending ? 'animate-pulse' : ''}`} />}
        <span className={`flex-1 ${small}`}>{text}</span>
        {queue.length ? <span className="num rounded-full bg-black/10 px-2 py-0.5 text-xs">{queue.length}</span> : null}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="offline.listTitle">
        <div className="flex flex-col gap-2">
          <BiLabel text="offline.listHint" size="sm" tone="text-muted" />
          {queue.map((p) => (
            <div key={p.id} className="card flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[15px] font-bold">{p.label}</span>
                <span className="text-xs text-muted" dir="ltr">{fmtDateTime(p.createdAt)}</span>
              </div>
              {p.error ? <span className="text-sm font-semibold text-payable">{p.error}</span> : <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(online ? 'offline.waiting' : 'offline.waitingNet')}</span>}
              <div className="flex gap-2">
                {p.error ? (
                  <button type="button" onClick={() => void retry(p.id, qc)} className={`tap flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-ink font-bold text-ground ${ur ? cls('sm') : 'text-sm'}`}>
                    <RefreshCw size={16} /> {pick('offline.retry')}
                  </button>
                ) : null}
                <button type="button" onClick={() => { if (window.confirm(pick('offline.deleteAsk'))) remove(p.id) }} className={`tap flex min-h-10 items-center justify-center gap-1 rounded-xl border border-line px-3 font-bold text-payable ${ur ? cls('sm') : 'text-sm'}`}>
                  <Trash2 size={16} /> {pick('crud.delete')}
                </button>
              </div>
            </div>
          ))}
          {!queue.length ? <BiLabel text="offline.empty" size="md" tone="text-muted" align="center" className="py-4" /> : null}
        </div>
      </Sheet>
    </>
  )
}
