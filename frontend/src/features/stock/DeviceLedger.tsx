/** What a phone's page gained from the new product's file 20 (owner 2026-11-26, ADR-140):
 *  - money spent on the unit after buying it (parts, a screen guard, courier …) — added to its cost by
 *    the server (Dr stock, Cr the account paid from), listed, and deleted with a reason while the unit
 *    is still the shop's;
 *  - the unit's own ledger: every rupee out on it and every rupee in, with the net after each line,
 *    and the same as an A4 sheet (the server's page), CSV, or a short summary to paste in WhatsApp;
 *  - a quick check (QC): the unit's faults as pass / issue, marked through the live "faulty" events.
 *  Every figure is the server's (`GET /devices/{id}/money`: `ledger`, `costs`, `summary.added`); the
 *  page adds up nothing. It is all cost, so the expenses and the ledger are for owner / manager. */

import { BookOpen, Download, MessageCircle, Plus, Printer, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Sheet, fmtDate } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { withDocLang } from '@/lib/docLang'
import { BASE, authHeaders, downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useCashAccounts, useDeviceEvent, useGet, useInvalidate } from '@/lib/queries'
import type { DeviceDetail } from '@/lib/types'
import { faultName } from './Faults'
import type { UnitMoneyData } from './UnitMoney'

export interface LedgerRow { upfront?: string | null; kind: string; at: string | null; date: string | null; no: string | null; doc_no: string | null; party_name: string | null; method: string | null; note: string | null; out: string | null; in: string | null; cash: string | null; net_after: string }
export interface Ledger { rows: LedgerRow[]; out: string; in: string; net: string; paid: string; received: string; cost: string | null; added?: string | null; net_cost?: string | null; sold_for: string | null; profit: string | null; expected: string | null }
export interface UnitCost { group_id: string; at: string; source: 'unit_expense' | 'repair_cost' | 'repair_lab'; document_id: string | null; kind: string | null; note: string | null; amount: string; undone: boolean }
export type Money = Omit<UnitMoneyData, 'summary'> & { ledger?: Ledger | null; costs?: UnitCost[]; summary: UnitMoneyData['summary'] & { added?: string | null; net_cost?: string | null; true_margin?: string | null } }

/** the statuses in which the unit is still the shop's (an expense can be added or deleted) */
export const OWNED = ['in_stock', 'faulty', 'in_repair', 'on_loan', 'with_customer_for_approval']
const EXPENSE_KINDS = ['parts', 'screen_guard', 'cleaning', 'transport', 'software', 'other'] as const
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const signed = (v: string | number | null | undefined) => `${num(v) < 0 ? '−' : '+'}${rs(v)}`
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const KEEP = ['device', 'devices', 'history', 'unit-money', 'accounts', 'dashboard', 'day', 'stock-status'] as const

export const useUnitMoney = (deviceId: string) => useGet<Money>(['unit-money', deviceId], `/api/v1/devices/${deviceId}/money`)

/* ------------------------------------------------------------------ expenses on the unit */

/** "+ Add expense": money spent on this unit, paid from a cash account, added to its cost */
export function ExpenseSheet({ open, d, onClose }: { open: boolean; d: DeviceDetail; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data: accounts } = useCashAccounts()
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<(typeof EXPENSE_KINDS)[number]>('parts')
  const [note, setNote] = useState('')
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setAmount(''); setNote(''); setErr('') } }, [open])
  async function save() {
    setBusy(true); setErr('')
    try {
      await api('POST', `/api/v1/devices/${d.id}/expenses`, { amount: Number(amount), kind, note: note.trim() || undefined, cash_account_id: account || undefined })
      await inv(...KEEP)
      onClose()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const small = ur ? cls('sm') : 'text-sm'
  return (
    <Sheet open={open} onClose={onClose} title="dled.ex.title">
      <div className="flex flex-col gap-3" data-testid="dled-expense-sheet">
        <BiLabel text="dled.ex.sub" size="sm" tone="text-muted" />
        <BiInput label="dled.ex.amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" data-testid="dled-expense-amount" />
        <div className="flex flex-col gap-1.5">
          <BiLabel text="dled.ex.what" size="md" tone="text-muted" />
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_KINDS.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`tap min-h-11 rounded-2xl px-3.5 font-bold ${kind === k ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${small}`} data-testid={`dled-expense-${k}`}>{pick(`dled.ex.k.${k}`)}</button>)}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <BiLabel text="dled.ex.from" size="md" tone="text-muted" />
          <select value={account} onChange={(e) => setAccount(e.target.value)} className={`tap min-h-12 rounded-2xl border border-line bg-surface px-3 font-bold text-ink ${small}`} data-testid="dled-expense-account">
            <option value="">{pick('dled.ex.defaultCash')}</option>
            {(accounts ?? []).filter((a) => a.kind !== 'cheque' && a.kind !== 'remittance').map((a) => <option key={a.id} value={a.id}>{ur ? a.name_ur || a.name : a.name}</option>)}
          </select>
        </label>
        <BiInput label="common.notes" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} data-testid="dled-expense-note" />
        <BiLabel text="dled.ex.rule" size="sm" tone="text-muted" />
        {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
        <BiButton text="common.save" full loading={busy} disabled={!(Number(amount) > 0)} onClick={() => void save()} data-testid="dled-expense-save" />
      </div>
    </Sheet>
  )
}

/** what was spent on the unit after buying it; an expense typed by mistake is deleted with a reason */
export function UnitCostsCard({ d, money, canAdd, onAdd }: { d: DeviceDetail; money: Money | undefined; canAdd: boolean; onAdd: () => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [undo, setUndo] = useState<UnitCost | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const costs = (money?.costs ?? []).filter((c) => !c.undone)
  const s = money?.summary
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const owned = OWNED.includes(d.status)
  async function go() {
    if (!undo) return
    setBusy(true); setErr('')
    try {
      await api('POST', `/api/v1/devices/${d.id}/expenses/${undo.group_id}/undo`, { reason: why.trim() })
      await inv(...KEEP)
      setUndo(null); setWhy('')
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const box = (label: string, value: string, tone: string, testid: string) => (
    <span className="flex flex-col rounded-xl bg-ground px-3 py-2" data-testid={testid}><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-base ${tone}`} dir="ltr">{value}</span></span>
  )
  return (
    <section className="card flex flex-col gap-3" data-testid="dled-costs">
      <div className="flex items-center justify-between gap-2">
        <BiLabel text="dled.costTitle" size="md" bold />
        {canAdd && owned ? <button type="button" onClick={onAdd} className="tap inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3 font-bold text-ground" data-testid="dled-add-expense"><Plus size={16} /><span className={tiny}>{pick('dled.ex.add')}</span></button> : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {box('dled.base', rs(s?.cost ?? d.cost_price), 'text-ink', 'dled-c-base')}
        {box('dled.added', `+${rs(s?.added ?? 0)}`, 'text-receivable', 'dled-c-added')}
        {box('dled.netCost', rs(s?.net_cost ?? d.cost_price), 'text-ink', 'dled-c-net')}
      </div>
      {costs.length ? (
        <div className="divide-y divide-line rounded-2xl border border-line">
          {costs.map((c) => (
            <div key={c.group_id} className="flex items-center gap-3 px-3 py-2.5" data-testid="dled-cost-row">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">{c.source === 'unit_expense' ? pick(`dled.ex.k.${c.kind ?? 'other'}`) : pick(`dled.ex.src.${c.source}`)}</div>
                <div className={`truncate text-muted ${tiny}`} dir="auto">{fmtDate(c.at)}{c.note ? ` · ${c.note}` : ''}</div>
              </div>
              <span className="num text-base text-receivable" dir="ltr">+{rs(c.amount)}</span>
              {canAdd && owned && c.source === 'unit_expense' ? <button type="button" aria-label={pick('crud.delete')} onClick={() => { setUndo(c); setWhy(''); setErr('') }} className="tap inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-payable" data-testid="dled-cost-undo"><Trash2 size={15} /></button> : null}
            </div>
          ))}
        </div>
      ) : <BiLabel text="dled.noCosts" size="sm" tone="text-muted" />}
      <Sheet open={!!undo} onClose={() => setUndo(null)} title="dled.ex.undoTitle">
        <div className="flex flex-col gap-3" data-testid="dled-undo-sheet">
          <BiLabel text="dled.ex.undoSub" size="sm" tone="text-muted" />
          {undo ? <div className="flex items-center justify-between rounded-2xl bg-surface px-3 py-2"><span className="text-sm font-bold text-ink">{pick(`dled.ex.k.${undo.kind ?? 'other'}`)}</span><span className="num text-base" dir="ltr">{rs(undo.amount)}</span></div> : null}
          <BiInput label="common.reason" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} data-testid="dled-undo-why" />
          {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
          <BiButton text="crud.delete" variant="danger" full loading={busy} disabled={why.trim().length < 3} onClick={() => void go()} data-testid="dled-undo-yes" />
        </div>
      </Sheet>
    </section>
  )
}

/* ------------------------------------------------------------------ the unit's own ledger */

export function ItemLedgerCard({ led, onSheet }: { led: Ledger; onSheet: () => void }) {
  const { pick, ur, cls } = useLang()
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const method = (m: string) => { const k = `dled.lg.m.${m}`; const v = pick(k); return v === k ? m : v }
  const box = (label: string, value: string, tone: string, testid: string) => (
    <span className={`flex flex-col items-center rounded-xl px-2 py-2 text-center ${tone}`} data-testid={testid}><span className={tiny}>{pick(label)}</span><span className="num text-base text-ink" dir="ltr">{value}</span></span>
  )
  return (
    <section className="card flex flex-col gap-3" data-testid="dled-ledger">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col"><BiLabel text="dled.lg.title" size="md" bold /><BiLabel text="dled.lg.sub" size="sm" tone="text-muted" /></span>
        <button type="button" onClick={onSheet} className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-ink" data-testid="dled-ledger-a4"><Printer size={15} /><span className={tiny}>{pick('dled.lg.a4')}</span></button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {box('dled.lg.out', rs(led.out), 'bg-payable-tint text-payable', 'dled-lg-out')}
        {box('dled.lg.in', rs(led.in), 'bg-emerald-tint text-emerald-deep', 'dled-lg-in')}
        {box('dled.lg.net', signed(led.net), 'bg-ground text-muted', 'dled-lg-net')}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-sm" data-testid="dled-lg-rows">
          <thead><tr className={`border-b border-line text-muted ${tiny}`}><th className="px-3 py-2 text-start">{pick('dled.lg.date')}</th><th className="px-3 py-2 text-start">{pick('dled.lg.what')}</th><th className="px-3 py-2 text-end">{pick('dled.lg.outCol')}</th><th className="px-3 py-2 text-end">{pick('dled.lg.inCol')}</th><th className="px-3 py-2 text-end">{pick('dled.lg.netCol')}</th></tr></thead>
          <tbody className="divide-y divide-line">
            {led.rows.length ? led.rows.map((r, i) => (
              <tr key={i} data-testid="dled-lg-row">
                <td className="whitespace-nowrap px-3 py-2.5"><div className="font-semibold text-ink" dir="ltr">{r.date ? fmtDate(r.date) : ''}</div><div className={`num text-muted ${tiny}`} dir="ltr">{r.no || r.doc_no || ''}</div></td>
                <td className="px-3 py-2.5"><div className="font-bold text-ink">{pick(`dled.lg.k.${r.kind}`)}</div><div className={`text-muted ${tiny}`} dir="auto">{[r.party_name, r.method ? method(r.method) : null, r.note, r.cash != null ? rs(r.cash) : null, num(r.upfront) > 0 ? `${pick(r.kind === 'purchase' ? 'dled.lg.paidNow' : 'dled.lg.gotNow')}: ${rs(r.upfront)}` : null].filter(Boolean).join(' · ')}</div></td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-end text-payable" dir="ltr">{r.out == null ? '—' : rs(r.out)}</td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-end text-emerald-deep" dir="ltr">{r.in == null ? '—' : rs(r.in)}</td>
                <td className={`num whitespace-nowrap px-3 py-2.5 text-end ${num(r.net_after) >= 0 ? 'text-emerald-deep' : 'text-ink'}`} dir="ltr">{signed(r.net_after)}</td>
              </tr>
            )) : <tr><td colSpan={5} className={`px-3 py-3 text-muted ${tiny}`}>{pick('common.nothingFound')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** the item ledger sheet: the server's A4 page previewed, printed, downloaded (CSV) or summed up for WhatsApp */
export function LedgerSheetWindow({ id, title, led, onClose }: { id: string; title: string; led: Ledger; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const shop = useAuth(activeShop)
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const path = `/api/v1/devices/${id}/ledger-sheet`
  useEffect(() => {
    let live = true
    fetch(`${BASE}${withDocLang(path)}`, { headers: authHeaders() }).then((r) => r.text()).then((h) => { if (live) setHtml(h) }).catch((e) => setErr(String(e)))
    return () => { live = false }
  }, [path])
  useEffect(() => { const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  useEffect(() => { if (!note) return; const x = setTimeout(() => setNote(''), 2200); return () => clearTimeout(x) }, [note])
  const share = () => {
    const text = t('dled.lg.shareText', { shop: shop?.name ?? '', item: title, out: rs(led.out), in: rs(led.in), net: signed(led.net) })
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setNote(pick('dled.lg.shared'))
  }
  const run = (p: Promise<unknown>) => { setErr(''); p.catch((e) => setErr(errText(e, ur))) }
  const small = ur ? cls('sm') : 'text-xs font-bold'
  const btn = 'tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-ink'
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-ink/60 p-2 backdrop-blur-sm sm:p-5" data-testid="dled-window">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-ground shadow-hero">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <span className="flex items-center gap-2"><BookOpen size={20} className="text-receivable" /><span className="flex flex-col"><BiLabel text="dled.lg.windowTitle" size="md" bold /><BiLabel text="dled.lg.windowSub" size="sm" tone="text-muted" /></span></span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => run(downloadFile(withDocLang(`${path}?format=csv`), 'item-ledger.csv'))} className={btn} data-testid="dled-lg-csv"><Download size={15} /><span className={small}>{pick('dled.lg.csv')}</span></button>
            <button type="button" onClick={share} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald px-3 font-bold text-white" data-testid="dled-lg-share"><MessageCircle size={15} /><span className={small}>{note || pick('dled.lg.share')}</span></button>
            <button type="button" onClick={() => run(openPrintable(path))} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-3 font-bold text-ground" data-testid="dled-lg-print"><Printer size={15} /><span className={small}>{pick('dled.lg.print')}</span></button>
            <button type="button" onClick={onClose} aria-label={pick('common.close')} className={btn} data-testid="dled-lg-close"><X size={16} /></button>
          </div>
        </div>
        {err ? <div className="px-4 pt-3"><BiAlert text={{ en: err, ur: err }} /></div> : null}
        <div className="bg-surface p-3 sm:p-5">{html ? <iframe title={pick('dled.lg.windowTitle')} srcDoc={html} sandbox="" className="h-[72vh] w-full rounded-2xl border border-line bg-white" data-testid="dled-lg-frame" /> : <div className="flex h-40 items-center justify-center text-muted">…</div>}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ quick check (QC) */

const QC: Record<string, string[]> = {
  phone: ['display', 'touch', 'camera', 'face_id', 'fingerprint', 'battery', 'charging', 'speaker', 'mic', 'network', 'wifi', 'buttons', 'body', 'water'],
  tablet: ['display', 'touch', 'camera', 'battery', 'charging', 'speaker', 'mic', 'wifi', 'buttons', 'body'],
  watch: ['display', 'touch', 'battery', 'charging', 'buttons', 'body', 'water'],
  laptop: ['display', 'battery', 'charging', 'speaker', 'wifi', 'ram', 'storage', 'board', 'buttons', 'body'],
}

/** the unit's faults as a pass / issue list: a check passes while that fault is not marked; a tap marks
 *  or clears it through the live "faulty" events (faulty with the first fault, back in stock with none) */
export function QcCard({ d, canMark }: { d: DeviceDetail; canMark: boolean }) {
  const { pick, ur, cls } = useLang()
  const ev = useDeviceEvent()
  const inv = useInvalidate()
  const [err, setErr] = useState('')
  const keys = QC[d.category ?? 'phone'] ?? QC.phone
  const faults = d.faults ?? []
  const passing = keys.filter((k) => !faults.includes(k)).length
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  async function flip(k: string) {
    if (!canMark || ev.isPending) return
    setErr('')
    const next = faults.includes(k) ? faults.filter((f) => f !== k) : [...faults, k]
    try {
      if (next.length) await ev.mutateAsync({ id: d.id, type: 'marked_faulty', data: { faults: next } })
      else await ev.mutateAsync({ id: d.id, type: 'faulty_cleared' })
      await inv('stock-status', 'device-options')
    } catch (e) { setErr(errText(e, ur)) }
  }
  return (
    <section className="card flex flex-col gap-3" data-testid="dled-qc">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col"><BiLabel text="dled.qcTitle" size="md" bold /><BiLabel text={canMark ? 'dled.qc.hint' : 'dled.qc.readOnly'} size="sm" tone="text-muted" /></span>
        <span className={`num text-lg ${passing === keys.length ? 'text-emerald-deep' : 'text-receivable'}`} dir="ltr" data-testid="dled-qc-score">{passing} / {keys.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {keys.map((k) => {
          const bad = faults.includes(k)
          return (
            <button key={k} type="button" disabled={!canMark || ev.isPending} aria-pressed={bad} onClick={() => void flip(k)} className="tap flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-start disabled:cursor-default" data-testid={`dled-qc-${k}`}>
              <span className={`truncate text-ink ${tiny}`}>{faultName(k, pick)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${bad ? 'bg-payable-tint text-payable' : 'bg-emerald-tint text-emerald-deep'} ${tiny}`}>{pick(bad ? 'dled.qc.issue' : 'dled.qc.pass')}</span>
            </button>
          )
        })}
      </div>
      {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
    </section>
  )
}
