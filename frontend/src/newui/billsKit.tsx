/** Pieces shared by the bills screen (file 24, `/new/invoices`) and the sales screen (file 25,
 *  `/new/sales`) of the new product (ADR-134): the period bar, the top bar's tools, the settle window
 *  (a payment against the bill, as the khata records one), the corrections chooser (each opens the
 *  live correction — a bill is never rewritten, ADR-090) and the delete hand-off (the bill's own page
 *  checks what must be undone first, ADR-099 / ADR-100). Nothing here adds up a figure. */

import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Boxes, Eye, EyeOff, FileSpreadsheet, Headphones, Languages, Laptop, Moon, Pencil, Smartphone, Sun, Tablet, Trash2, Watch, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { newPay, payInfo } from '@/components/PayPicker'
import { api, ApiError } from '@/lib/api'
import { downloadFile } from '@/lib/files'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'

export type M = string
export const num = (v: M | number | null | undefined) => Number(v ?? 0)
export const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
/** "+Rs. 5,000" / "−Rs. 5,000" for a profit or loss the server sent */
export const signed = (v: M | number | null | undefined) => `${num(v) < 0 ? '−' : '+'}${rs(v)}`
export const KIND_ICON: Record<string, typeof Smartphone> = { phone: Smartphone, tablet: Tablet, watch: Watch, laptop: Laptop, items: Headphones }
export const kindIcon = (k: string) => KIND_ICON[k] ?? Boxes
export const kindKey = (k: string) => (k === 'items' ? 'nitem.items' : `devcat.${k}`)

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export type Preset = 'today' | 'yesterday' | 'week' | 'month' | ''
export function presetDates(p: Preset): [string, string] {
  const now = new Date()
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return iso(d) }
  if (p === 'today') return [iso(now), iso(now)]
  if (p === 'yesterday') return [back(1), back(1)]
  if (p === 'week') return [back(7), iso(now)]
  return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)]
}

/** the period in the address (`from`, `to`, `p`), this month when nothing is chosen */
export function usePeriod() {
  const [sp, setSp] = useSearchParams()
  const preset = (sp.get('p') ?? (sp.get('from') || sp.get('to') ? '' : 'month')) as Preset
  const [df, dt] = presetDates('month')
  const from = sp.get('from') ?? (preset ? presetDates(preset)[0] : df)
  const to = sp.get('to') ?? (preset ? presetDates(preset)[1] : dt)
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k) } setSp(n, { replace: true }) }
  return { sp, set, preset, from, to }
}

export const pillOn = 'bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950'
export const pillOff = 'text-slate-600 dark:text-slate-300'
export const pillBox = 'inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar max-w-full'

export function DateBar({ preset, from, to, set, testid }: { preset: Preset; from: string; to: string; set: (p: Record<string, string | null>) => void; testid: string }) {
  const { pick } = useLang()
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {(['today', 'yesterday', 'week', 'month'] as const).map((p) => <button key={p} type="button" onClick={() => set({ p, from: null, to: null })} aria-pressed={preset === p} className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${preset === p ? pillOn : 'bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300'}`} data-testid={`${testid}-p-${p}`}>{pick(`nbill.${p}`)}</button>)}
      <div className="flex items-center gap-1 ps-1" dir="ltr">
        <input type="date" value={from} onChange={(e) => set({ p: null, from: e.target.value || null, to })} aria-label={pick('nbill.from')} className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold" data-testid={`${testid}-from`} />
        <span className="text-slate-400">–</span>
        <input type="date" value={to} onChange={(e) => set({ p: null, from, to: e.target.value || null })} aria-label={pick('nbill.to')} className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold" data-testid={`${testid}-to`} />
      </div>
    </div>
  )
}

/** the right side of the top bar: profit eye (cost logins only), Excel / CSV, language, dark */
export function TopTools({ canCost, showCost, setShowCost, sheet, eyeOn, eyeOff, testid }: { canCost: boolean; showCost: boolean; setShowCost: (v: boolean) => void; sheet: string; eyeOn: string; eyeOff: string; testid: string }) {
  const { pick, ur } = useLang()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [open, setOpen] = useState(false)
  const go = (fmt: 'csv' | 'xlsx') => { setOpen(false); void downloadFile(`${sheet}${sheet.includes('?') ? '&' : '?'}format=${fmt}&profit=${showCost}&lang=${ur ? 'ur' : 'en'}`, `${testid}.${fmt}`) }
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer bg-slate-100 dark:bg-obsidian-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200" data-testid={`${testid}-eye`}>{showCost ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden md:inline">{pick(showCost ? eyeOn : eyeOff)}</span></button> : null}
      <div className="relative">
        <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 hover:border-[#A3E635] cursor-pointer" data-testid={`${testid}-excel`}><FileSpreadsheet className="w-3.5 h-3.5" /><span className="hidden sm:inline">{pick('nbill.excel')}</span></button>
        {open ? <div className="absolute end-0 top-full mt-1 z-50 w-36 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 shadow-xl p-1 text-xs font-bold">
          <button type="button" onClick={() => go('xlsx')} className="w-full text-start px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer" data-testid={`${testid}-xlsx`}>Excel (.xlsx)</button>
          <button type="button" onClick={() => go('csv')} className="w-full text-start px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-obsidian-800 cursor-pointer" data-testid={`${testid}-csv`}>CSV</button>
        </div> : null}
      </div>
      <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-800 text-slate-700 dark:text-slate-200 cursor-pointer" data-testid={`${testid}-lang`}><Languages className="w-3.5 h-3.5" />{ur ? 'English' : 'اردو'}</button>
      <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-obsidian-950 dark:bg-white text-white dark:text-obsidian-950 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}</button>
    </div>
  )
}

export function Modal({ title, sub, onClose, children, wide, testid }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; testid?: string }) {
  const { pick } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-5 bg-black/75 overflow-y-auto" onClick={onClose}>
      <div className={`bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 rounded-2xl ${wide ? 'max-w-5xl' : 'max-w-xl'} w-full shadow-2xl overflow-hidden my-3 animate-pop`} onClick={(e) => e.stopPropagation()} data-testid={testid}>
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-obsidian-850 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="font-display font-extrabold text-base">{title}</h3>{sub ? <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export interface SettleBill { id: string; no: string; kind: 'sale' | 'purchase'; party_id: string | null; party_name: string | null; due: M }

/** a payment against one bill (in from a customer, out to a dealer), allocated to that bill */
export function SettleWindow({ bill, onClose, onDone }: { bill: SettleBill; onClose: () => void; onDone: (msg: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [amount, setAmount] = useState(String(Math.round(num(bill.due))))
  const [online, setOnline] = useState(false)
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const v = Number(amount)
  async function save() {
    if (!bill.party_id || !(v > 0)) return
    setBusy(true); setErr(null)
    try {
      await api('POST', '/api/v1/payments', { party_id: bill.party_id, direction: bill.kind === 'sale' ? 'in' : 'out', amount: v, payment: online ? payInfo({ ...newPay('online'), reference: ref }) : undefined, allocations: [{ document_type: bill.kind === 'sale' ? 'invoice' : 'purchase', document_id: bill.id, amount: v }] })
      await inv('bills-hub', 'invoices', 'sales', 'purchases', 'party', 'parties', 'statement', 'payments', 'dashboard', 'day', 'balances')
      onDone(t('nbill.settleDone', { amt: rs(v), no: bill.no }))
    } catch (e) {
      setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
    } finally { setBusy(false) }
  }
  return (
    <Modal title={t('nbill.settleTitle', { no: bill.no })} sub={bill.party_id ? t('nbill.settleSub', { who: bill.party_name ?? '' }) : pick('nbill.settleNoParty')} onClose={onClose} testid="nbill-settle">
      <div className="p-5 space-y-3 text-xs">
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300/80 dark:border-amber-800 flex items-center justify-between"><span className="font-bold text-amber-900 dark:text-amber-300">{pick('nbill.remaining')}</span><span className="font-mono font-extrabold text-amber-800 dark:text-amber-300" dir="ltr">{rs(bill.due)}</span></div>
        <label className="block"><span className="font-bold text-slate-500 block mb-1">{pick('nbill.amount')}</span><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white dark:bg-obsidian-850 border border-amber-300 dark:border-amber-700 font-mono font-bold" dir="ltr" data-testid="nbill-settle-amount" /></label>
        <div className={pillBox}>{[false, true].map((o) => <button key={String(o)} type="button" onClick={() => setOnline(o)} aria-pressed={online === o} className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${online === o ? pillOn : pillOff}`}>{pick(o ? 'nbill.online' : 'nbill.cash')}</button>)}</div>
        {online ? <label className="block"><span className="font-bold text-slate-500 block mb-1">{pick('nbill.ref')}</span><input value={ref} onChange={(e) => setRef(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" dir="ltr" /></label> : null}
        {err ? <p className="text-rose-600 font-bold" role="alert">{err}</p> : null}
        <button type="button" disabled={busy || !bill.party_id || !(v > 0)} onClick={() => void save()} className="w-full py-2.5 rounded-xl font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50" data-testid="nbill-settle-go">{pick('nbill.apply')}</button>
      </div>
    </Modal>
  )
}

export interface FixBill { id: string; no: string; kind: string; party_id?: string | null; ref_id?: string | null }

/** what can be corrected on a bill: each choice opens the live correction for it */
export function EditChooser({ bill, onClose }: { bill: FixBill; onClose: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const ch: [string, string, string][] =
    bill.kind === 'sale' ? [['nbill.e.replace', 'nbill.e.replaceHint', `/sale/new?replace=${bill.id}`], ['nbill.e.party', 'nbill.e.partyHint', `/sales/${bill.id}?change=1`], ['nbill.e.return', 'nbill.e.returnHint', `/return/new?invoice=${bill.id}`]]
      : bill.kind === 'purchase' ? [['nbill.e.replace', 'nbill.e.replaceHint', `/purchase/new?replace=${bill.id}`], ['nbill.e.party', 'nbill.e.partyHint', `/purchases/${bill.id}?change=1`], ['nbill.e.paid', 'nbill.e.paidHint', `/purchases/${bill.id}?paid=1`], ['nbill.e.cost', 'nbill.e.costHint', `/purchases/${bill.id}`]]
        : bill.kind === 'repair' ? [['nbill.e.repair', 'nbill.e.repairHint', `/new/repairs/${bill.id}`]]
          : [['nbill.e.retList', 'nbill.e.retHint', '/returns']]
  return (
    <Modal title={t('nbill.editTitle', { no: bill.no })} sub={pick('nbill.editSub')} onClose={onClose} testid="nbill-edit">
      <div className="p-4 grid gap-2">
        {ch.map(([title, hint, to]) => <button key={title} type="button" onClick={() => nav(to)} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-start flex items-start gap-2.5 cursor-pointer" data-testid="nbill-edit-choice"><Pencil className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" /><span><span className="block font-bold text-sm">{pick(title)}</span><span className="block text-[11px] text-slate-500">{pick(hint)}</span></span></button>)}
      </div>
    </Modal>
  )
}

/** delete is the bill's own page: it checks what must be undone first and asks for a reason */
export function DeleteGo({ bill, onClose }: { bill: FixBill; onClose: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const to = bill.kind === 'sale' ? `/sales/${bill.id}?delete=1` : bill.kind === 'purchase' ? `/purchases/${bill.id}?delete=1` : bill.kind === 'repair' ? `/repairs/${bill.id}` : '/returns'
  return (
    <Modal title={t('nbill.delTitle', { no: bill.no })} sub={pick('nbill.delSub')} onClose={onClose} testid="nbill-del">
      <div className="p-4 flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-bold bg-slate-200 dark:bg-obsidian-800 cursor-pointer">{pick('common.cancel')}</button>
        <button type="button" onClick={() => { onClose(); nav(to) }} className="px-4 py-2 rounded-xl font-extrabold bg-rose-600 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nbill-del-go"><Trash2 className="w-3.5 h-3.5" />{pick('nbill.delGo')}</button>
      </div>
    </Modal>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="fixed bottom-5 end-5 z-50 bg-obsidian-950 dark:bg-white text-white dark:text-obsidian-950 border border-slate-700 dark:border-slate-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold" role="status" data-testid="nbill-toast"><span className="w-2 h-2 rounded-full bg-[#A3E635]" />{msg}</div>
}
