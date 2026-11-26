/** The control room's shared pieces (file 26, ADR-134 / ADR-115): the types of the live provider
 *  console's answers, money and error text, the file's input / card / tab looks and its modal. */

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError } from '@/lib/api'
import { withCur } from '@/lib/format'

export interface AdminShop { id: string; organisation_id: string; name: string; city: string | null; owner_name: string | null; owner_phone: string | null; users: number; branches: number; created_at: string; plan: string; plan_expires_at: string | null; days_left: number | null; monthly_fee: string; fee_note: string | null; plan_status: 'unlimited' | 'ok' | 'due_soon' | 'expired' | 'locked'; modules: string[]; modules_custom: boolean; grace_days?: number | null; fee_due?: string; fee_deal?: { plan: string; price: string; months: number | null; months_left: number | null; note: string | null } | null; deleted_at?: string | null; deleted_reason?: string | null }
export interface ShopRow {
  organisation_id: string; shop_id: string; name: string; city: string | null; phone: string | null; plan: string; plan_status: string
  plan_expires_at: string | null; days_left: number | null; monthly_fee: string; paid_total: string; payments: number; pending_amount: string
  last_payment_at: string | null; last_payment_amount: string | null; last_channel: string | null
  deployment: 'cloud' | 'local'; online: boolean; last_used_at: string | null; install_version: string | null; keys_unused: number; keys_total: number
}
export interface PayRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; months: number; status: string; paid_on: string; receipt_no: string | null; note: string | null }
export interface KeyRow {
  id: string; shop_id: string; shop_name: string | null; months: number; code: string; status: 'issued' | 'redeemed' | 'revoked'; note: string | null
  issued_at: string; redeemed_at: string | null; redeemed_where: string | null; revoked_at: string | null; revoke_reason: string | null
  sent_count: number; last_sent_at: string | null; last_sent_via: string | null; link_active: boolean; link_expires_at: string | null; view_count: number
}
export interface FeeRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; proof_path: string | null; months: number; note: string | null; status: string; created_at: string; receipt_no?: string | null; fee_due?: string; order?: { plan: string; months: number; years: number; discount_pct: number; total: string; extras: string[] } | null }
export interface ModuleCatalogue { modules: Record<string, { en: string; ur: string }>; plans: Record<string, string[]> }
export interface Overview {
  counts: Record<string, number>
  paying_shops: number; mrr: string; arpu: string; collected_total: string; collected_month: string; collected_prev_month: string
  pending_count: number; pending_amount: string
  coming_7: { count: number; amount: string }; coming_30: { count: number; amount: string }; overdue: { count: number; amount: string }
  by_channel: { method: string; count: number; amount: string }[]; by_plan: { plan: string; shops: number; mrr: string }[]
  monthly: { month: string; amount: string }[]; keys: { issued: number; redeemed: number; revoked: number }
}
export type Settings = 'accounts' | 'billing' | 'prices'

export const PLANS = ['trial', 'basic', 'pro', 'chain'] as const
export const METHODS = ['cash', 'easypaisa', 'jazzcash', 'bank'] as const
export const rs = (v: string | number | null | undefined) => withCur(Math.round(Number(v ?? 0)).toLocaleString('en-US'))
export const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

// the file's looks
export const LIME = 'bg-[#A3E635] hover:bg-[#84CC16] text-obsidian-950'
export const CARD = 'bg-white dark:bg-obsidian-900 rounded-2xl border border-slate-200 dark:border-slate-800'
export const SOFT = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-obsidian-850'
export const INPUT = 'w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#A3E635]'
export const LABEL = 'block text-xs font-bold text-slate-500 mb-1'
export const seg = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap cursor-pointer ${on ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`
export const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${on ? 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`
export const BTN_DARK = 'px-4 py-2 rounded-xl text-xs font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40'
export const BTN_LIGHT = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40'

/** a payment channel's name: the app's own word when it has one, else as the server keeps it */
export function useMethod() {
  const { pick } = useLang()
  return (m: string) => ((METHODS as readonly string[]).includes(m) ? pick(`pay.${m}`) : m.replace(/_/g, ' '))
}

/** a centred window over a dark veil, as the file's modals */
export function Modal({ title, onClose, children, footer, wide, testid, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; testid: string; icon?: ReactNode }) {
  const { pick } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-5 bg-black/75 overflow-y-auto print:static print:block print:bg-transparent print:p-0 print:overflow-visible" data-testid={testid} role="dialog" aria-modal="true">
      <div className={`bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full shadow-2xl overflow-hidden my-3 ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-obsidian-850 print:hidden">
          <h3 className="font-display font-extrabold text-base flex items-center gap-2">{icon}{title}</h3>
          <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 text-xs max-h-[78vh] overflow-y-auto print:max-h-none print:overflow-visible">{children}</div>
        {footer ? <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2 print:hidden">{footer}</div> : null}
      </div>
    </div>
  )
}

/** one fee payment of the console, as the file's ledger row */
export function PayLine({ p }: { p: PayRow }) {
  const { pick } = useLang()
  const method = useMethod()
  const tone = p.status === 'approved' ? 'text-emerald-600 dark:text-[#A3E635]' : p.status === 'pending' ? 'text-amber-600' : 'text-rose-600'
  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40 dark:bg-obsidian-850/60" data-testid="nctl-pay">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-display font-extrabold text-sm truncate" dir="auto">{p.shop_name}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-obsidian-800">{method(p.method)}</span></div><div className="text-xs text-slate-500 font-mono mt-0.5 truncate" dir="ltr">{fmtDate(p.paid_on)} · {p.months}m{p.reference ? ` · ${p.reference}` : ''}{p.receipt_no ? ` · ${p.receipt_no}` : ''}</div></div>
      <div className="text-end"><div className="font-mono font-extrabold text-base" dir="ltr">{rs(p.amount)}</div><span className={`text-xs font-extrabold ${tone}`}>{pick(`prov.st.${p.status}`)}</span></div>
    </div>
  )
}
