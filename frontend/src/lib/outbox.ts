/** Sending the offline queue (see lib/offline.ts): in order, one at a time, stopping at the first
 *  network failure; a document the server refuses keeps its reason and waits for the user. */

import type { QueryClient } from '@tanstack/react-query'
import { ApiError, api } from './api'
import { useOffline } from './offline'

export async function flush(qc?: QueryClient): Promise<void> {
  const st = useOffline.getState()
  if (st.sending || !st.queue.some((x) => !x.error)) return
  st.setSending(true)
  let sentAny = false
  try {
    for (const item of [...useOffline.getState().queue]) {
      if (item.error) continue
      try {
        await api(item.method, item.path, item.body, { idempotencyKey: item.id, shopId: item.shopId })
        useOffline.getState().remove(item.id)
        sentAny = true
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'offline' || e.code === 'in_progress' || e.status >= 500)) break
        useOffline.getState().setError(item.id, e instanceof ApiError ? e.messageEn : String(e))
      }
    }
  } finally {
    useOffline.getState().setSending(false)
    if (sentAny && qc) void qc.invalidateQueries()
  }
}

/** try again what the server refused (after the user changed something) */
export function retry(id: string, qc?: QueryClient): Promise<void> {
  useOffline.getState().setError(id, null)
  return flush(qc)
}
