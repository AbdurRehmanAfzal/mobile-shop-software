/** Offline mode (owner 2026-10-29: markets lose the internet often). What the phone could not send
 *  (a sale, purchase, payment or expense) waits here, on the phone, and goes out in order when the
 *  connection is back. Each item carries the Idempotency-Key the server uses to post it only once,
 *  so a message that was lost on the way back cannot make a second bill. */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PendingKind = 'sale' | 'purchase' | 'payment' | 'expense'

export interface Pending {
  /** also the Idempotency-Key */
  id: string
  kind: PendingKind
  method: 'POST'
  path: string
  body: unknown
  shopId: string | null
  /** shown in the list, e.g. "Sale · Rs. 12,000" */
  label: string
  createdAt: string
  /** the server refused it (e.g. the phone was sold meanwhile): waits for the user */
  error: string | null
}

interface OfflineState {
  online: boolean
  queue: Pending[]
  sending: boolean
  /** when something was just queued, for the short "saved on this phone" notice */
  lastQueuedAt: number | null
  setOnline: (v: boolean) => void
  enqueue: (p: Omit<Pending, 'createdAt' | 'error'>) => void
  remove: (id: string) => void
  setError: (id: string, error: string | null) => void
  setSending: (v: boolean) => void
}

export const useOffline = create<OfflineState>()(
  persist(
    (set) => ({
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      queue: [],
      sending: false,
      lastQueuedAt: null,
      setOnline: (online) => set({ online }),
      enqueue: (p) => set((s) => ({ queue: [...s.queue, { ...p, createdAt: new Date().toISOString(), error: null }], lastQueuedAt: Date.now() })),
      remove: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
      setError: (id, error) => set((s) => ({ queue: s.queue.map((x) => (x.id === id ? { ...x, error } : x)) })),
      setSending: (sending) => set({ sending }),
    }),
    { name: 'mobileshop.outbox', partialize: (s) => ({ queue: s.queue }) },
  ),
)

export const isQueued = (x: unknown): x is { queued: true; id: string } =>
  !!x && typeof x === 'object' && (x as { queued?: unknown }).queued === true

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useOffline.getState().setOnline(true))
  window.addEventListener('offline', () => useOffline.getState().setOnline(false))
}
