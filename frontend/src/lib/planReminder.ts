/** Subscription reminders (owner addendum 3, docs/19): one store that asks the server what to show
 *  (stage, bar tone, whether the popup may open now, the snooze choices), remembers the collapsed
 *  bar for the session, and never opens the popup on a form page. The snooze lives on the server,
 *  so it holds across reloads and across the shop's phones. */

import { create } from 'zustand'
import { api } from './api'

export type Stage = 'none' | 'info' | 'warn' | 'urgent' | 'grace' | 'locked'
export type Tone = 'yellow' | 'orange' | 'red' | 'locked' | 'blue' | null
export type SnoozeOption = '4h' | 'tomorrow' | '3d'
export interface Billing {
  bank: { bank_name: string; account_title: string; account_number: string; iban: string; branch: string } | null
  wallets: { label: string; account_name: string; number: string; note: string | null }[]
  support: { phone: string | null; whatsapp: string | null }
  qr_path: string | null
  note: { en?: string; ur?: string; roman?: string }
}
export interface Reminder {
  stage: Stage
  state: 'ACTIVE' | 'EXPIRING_SOON' | 'GRACE' | 'EXPIRED'
  tone: Tone
  days_left: number | null
  grace_days: number
  expires_at: string | null
  plan: string
  amount_due: string
  fee_unpaid?: string | null  // fee still unpaid for packages already given (ADR-053)
  currency: string
  last_payment_at: string | null
  pending_payment: { id: string; amount: string; created_at: string } | null
  show_popup: boolean
  snooze_options: SnoozeOption[]
  close_option: SnoozeOption | null
  snoozed_until: string | null
  audience: 'owner' | 'staff'
  billing: Billing | null
  renewed: { payment_id: string; until: string | null; receipt_no: string | null; amount: string } | null
  clock_rolled_back: boolean
  shop_name: string
}

/** pages where a popup would interrupt work: never there (docs/19 §C.6) */
const FORM_PATHS = ['/sale/', '/purchase/', '/return/', '/exchange/', '/repairs/new', '/payments/new', '/stock/opening', '/signup', '/login', '/welcome', '/admin', '/more/fees']
export function popupAllowedOn(pathname: string): boolean {
  return !FORM_PATHS.some((p) => pathname === p || pathname.startsWith(p))
}

interface State {
  data: Reminder | null
  popupOpen: boolean
  collapsed: boolean
  thanksOpen: boolean
  /** the payment whose thank-you this session has already told the server about */
  thanked: string | null
  /** the thank-you on the screen (kept while it is open, whatever later refreshes say) */
  thanks: Reminder['renewed']
  loading: boolean
  lastEvent: 'login' | 'open' | 'idle' | null
  refresh: (event?: 'login' | 'open' | 'idle', pathname?: string) => Promise<void>
  openPopup: () => void
  closePopup: (snooze?: boolean) => Promise<void>
  snooze: (option: SnoozeOption) => Promise<void>
  collapse: () => void
  thanksSeen: () => Promise<void>
  clear: () => void
}

export const usePlanReminder = create<State>()((set, get) => ({
  data: null,
  popupOpen: false,
  collapsed: false,
  thanksOpen: false,
  thanked: null,
  thanks: null,
  loading: false,
  lastEvent: null,
  async refresh(event = 'open', pathname = window.location.pathname) {
    if (get().loading) return
    set({ loading: true })
    try {
      const data = await api<Reminder>('GET', `/api/v1/plan/reminder?event=${event}`)
      const may = popupAllowedOn(pathname)
      const wasOpen = get().popupOpen
      const open = wasOpen || (data.show_popup && may && data.audience === 'owner')
      // while soft-locked the full-screen notice speaks; the popup opens only from the bar's Details
      set({ data, popupOpen: open && data.stage !== 'none' && data.stage !== 'locked' && !data.pending_payment, thanksOpen: get().thanksOpen || (!!data.renewed && may), thanks: data.renewed && may ? data.renewed : get().thanks, lastEvent: event })
      if (open && !wasOpen) void api('POST', '/api/v1/plan/reminder/shown').catch(() => undefined)
      // owner 2026-11-18 (ADR-105): the thank-you is marked seen the moment it shows, so it never
      // comes back on the next login — whether the shopkeeper taps OK, prints or just leaves
      if (data.renewed && may && get().thanked !== data.renewed.payment_id) {
        set({ thanked: data.renewed.payment_id })
        void api('POST', '/api/v1/plan/reminder/thanks', { payment_id: data.renewed.payment_id }).catch(() => set({ thanked: null }))
      }
    } catch {
      /* offline or not logged in: keep what we have */
    } finally {
      set({ loading: false })
    }
  },
  openPopup: () => set({ popupOpen: true }),
  async closePopup(snooze = true) {
    const d = get().data
    set({ popupOpen: false })
    if (snooze && d?.close_option) await get().snooze(d.close_option)
  },
  async snooze(option) {
    set({ popupOpen: false })
    try {
      await api('POST', '/api/v1/plan/reminder/snooze', { option })
    } catch {
      /* the server said no (stage moved on); the popup is closed anyway */
    }
    const d = get().data
    if (d) set({ data: { ...d, show_popup: false } })
  },
  collapse: () => set({ collapsed: true }),
  async thanksSeen() {
    const d = get().data
    const shown = get().thanks
    set({ thanksOpen: false, thanks: null })
    if (shown) {
      // already told when it appeared; said again here in case that call did not get through
      try { await api('POST', '/api/v1/plan/reminder/thanks', { payment_id: shown.payment_id }) } catch { /* the server stops offering it after a few days anyway */ }
      if (d) set({ data: { ...d, renewed: null } })
    }
  },
  clear: () => set({ data: null, popupOpen: false, collapsed: false, thanksOpen: false, thanks: null, thanked: null }),
}))

/** the Roman line the bar always carries (docs/19 §D) */
export function romanBarLine(d: Reminder): string {
  if (d.pending_payment) return 'Payment mil gayi, tasdeeq baqi hai.'
  if (d.stage === 'locked') return 'Plan khatam ho gaya. Software sirf dikha raha hai; fee ada karein to sab chal parega.'
  if (d.stage === 'grace') return `Plan khatam ho chuka hai; ${Math.max(0, d.grace_days + (d.days_left ?? 0))} din baqi hain. Software band ho sakta hai aur data lost hone ka khatra hai.`
  const n = d.days_left ?? 0
  return `Plan khatam hone mein ${n} din baqi ${n === 1 ? 'hai' : 'hain'}. Software band ho sakta hai aur data lost hone ka khatra hai.`
}
