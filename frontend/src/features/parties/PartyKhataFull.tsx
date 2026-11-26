/** A person's khata, the full version (owner 2026-11-26, from the new product's file 21, ADR-136):
 *  what the page of a dealer, customer, other shop or repair lab shows beside what it always had —
 *  the dates of the account (opened, first and last dealing, the promised date with Change), the
 *  phone with Copy, WhatsApp khata, three cards (their phones in the shop / sold / returned, the money
 *  by channel, the profit from them with hide), and the book in four tabs with a search and a kind
 *  filter: the complete account ledger with Fix / Edit on every line, the stock & sales tracker
 *  (sell now, return to dealer), brand & model, the payment method log; and the full ledger report
 *  (the server's A4 page, with presets, from / to, sections, profit hidden or shown).
 *
 *  Every figure is the server's (`GET /parties/{id}/khata`, the statement, `khata-report`); the app
 *  only searches and filters the rows. A line is never edited in place: Fix / Edit opens the live
 *  correction for that kind of entry (change the customer / dealer, what was paid, delete with a
 *  reason — ADR-090 / ADR-099). Cost and profit only for the owner and the manager. */

import { CalendarCheck, Copy, Download, Eye, EyeOff, FileSpreadsheet, FileText, MessageCircle, Pencil, Phone, Printer, Tag, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withDocLang } from '@/lib/docLang'
import { BASE, authHeaders, downloadFile, openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { useGet, useInvalidate, useParties } from '@/lib/queries'
import type { Party, StatementRow } from '@/lib/types'

type M = string
export interface KhataUnit { role: 'bought_from' | 'sold_to'; state: 'in_shop' | 'sold' | 'returned' | 'other' | 'sold_to'; device_id: string; label: string; brand_name: string | null; model_name: string | null; storage_name: string | null; imei1: string | null; doc_id: string; no: string; date: string; days_in_shop: number | null; cost: M | null; sold_for: M | null; sold_no: string | null; profit: M | null; remaining?: M }
interface Pile { count: number; cost: M | null }
export interface KhataFile {
  created_at: string; balance: M; old_balance: M | null
  promise: { date: string; side: string; entries: string[] } | null
  stock: { bought: number; in_shop: Pile; sold: Pile & { value: M; profit: M | null }; returned: Pile; other: Pile; dearest: { label: string; cost: M | null; device_id: string } | null; sold_to: number }
  units: KhataUnit[]
  models: { brand_name: string | null; model_name: string | null; bought: number; in_shop: number; sold: number; returned: number; sold_to: number; highest_cost: M | null; total_cost: M | null }[]
  channels: { method: string; in: M; out: M | null; count: number }[]
  money_in: M; money_out: M | null
  payments: { id: string; no: string; date: string; direction: 'in' | 'out'; method: string; amount: M | null; purpose: string; reference: string | null; notes: string | null }[]
}

const n0 = (v: number | string | null | undefined) => Math.round(Math.abs(Number(v || 0))).toLocaleString('en-US')
const rs = (v: number | string | null | undefined) => withCur(n0(v))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const timeOf = (iso: string) => { const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const KEEP = ['party', 'parties', 'statement', 'party-journey', 'party-lending', 'old-balances', 'party-units', 'party-khata', 'payments', 'dashboard', 'day', 'balances'] as const

export function usePartyKhata(partyId: string | undefined) {
  return useGet<KhataFile>(['party-khata', partyId ?? ''], partyId ? `/api/v1/parties/${partyId}/khata` : null)
}
export const useCanCost = () => useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')

/** the few lines a WhatsApp khata message opens with: the server's balance and the money either way */
export function useWaText(party: Party, kh: KhataFile | undefined): string {
  const { pick } = useLang()
  const { t } = useTranslation()
  const bal = Number(party.balance)
  return [
    t('pkh.x.waHead', { shop: '', who: party.name }).trim(),
    bal > 0 ? t('pkh.x.waOwesUs', { n: rs(bal) }) : bal < 0 ? t('pkh.x.waWeOwe', { n: rs(bal) }) : pick('pkh.x.waClear'),
    kh ? t('pkh.x.waFlow', { inn: rs(kh.money_in), out: kh.money_out != null ? rs(kh.money_out) : '—' }) : '',
  ].filter(Boolean).join('\n')
}

/* ------------------------------------------------------------------ the dates of the account */

/** The person in one card: who they are (phone with Copy, WhatsApp, CNIC, city, address) and the
 *  account's dates (opened, first and last dealing, the promised date with Change). */
export function PartyFacts({ party, rows, kh }: { party: Party; rows: StatementRow[]; kh: KhataFile | undefined }) {
  const { pick, ur, cls } = useLang()
  const [copied, setCopied] = useState(false)
  const [promising, setPromising] = useState(false)
  useEffect(() => { if (!copied) return; const x = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(x) }, [copied])
  const live = rows.filter((r) => !r.reversed)
  const first = live[0]?.at
  const last = live[live.length - 1]?.at
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const fact = (label: string, value: ReactNode, testid: string, ltr = true) => (
    <span className="flex flex-col rounded-xl bg-ground px-3 py-1.5" data-testid={testid}>
      <span className={`text-muted ${small}`}>{pick(label)}</span>
      <span className="text-sm font-bold text-ink" dir={ltr ? 'ltr' : 'auto'}>{value}</span>
    </span>
  )
  const initials = party.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  return (
    <section className="card flex flex-col gap-3" data-testid="pkh-facts">
      <div className="flex flex-wrap items-center gap-3">
        <span className="well h-12 w-12 shrink-0 rounded-2xl bg-ink text-base font-extrabold text-ground" dir="ltr">{initials}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <BiLabel text="pkh.t.profile" size="sm" tone="text-muted" bold />
          {party.phone ? (
            <span className="flex flex-wrap items-center gap-2">
              <Phone size={15} className="text-muted" />
              <span className="num text-base" dir="ltr">{party.phone}</span>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(party.phone ?? '').catch(() => undefined); setCopied(true) }} className="tap inline-flex min-h-9 items-center gap-1 rounded-xl border border-line bg-surface px-2.5 font-bold text-ink" data-testid="pkh-copy">
                <Copy size={14} /><span className={small}>{pick(copied ? 'pkh.copied' : 'pkh.copy')}</span>
              </button>
            </span>
          ) : null}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="pkh-bio">
        {party.whatsapp ? fact('party.whatsapp', party.whatsapp, 'pkh-whatsapp') : null}
        {party.cnic ? fact('party.cnic', party.cnic, 'pkh-cnic') : null}
        {party.city ? fact('party.city', party.city, 'pkh-city', false) : null}
        {party.address ? fact('party.address', party.address, 'pkh-address', false) : null}
        {fact('pkh.created', fmtDate(kh?.created_at ?? party.created_at), 'pkh-created')}
        {first ? fact('pkh.firstDeal', fmtDate(first), 'pkh-first') : null}
        {last ? fact('pkh.lastDeal', fmtDate(last), 'pkh-last') : null}
        {kh?.promise ? (
          <span className="flex flex-col rounded-xl bg-receivable-tint px-3 py-1.5" data-testid="pkh-promise">
            <span className={`flex items-center gap-1 text-receivable ${small}`}><CalendarCheck size={13} />{pick('pkh.promise')}</span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink" dir="ltr">{fmtDate(kh.promise.date)}</span>
              <button type="button" onClick={() => setPromising(true)} className={`tap font-bold text-receivable underline ${small}`} data-testid="pkh-promise-change">{pick('pkh.change')}</button>
            </span>
          </span>
        ) : null}
      </div>
      {party.notes ? <span className={`text-muted ${small}`} dir="auto">{party.notes}</span> : null}
      {kh?.promise ? <PromiseSheet open={promising} promise={kh.promise} onClose={() => setPromising(false)} /> : null}
    </section>
  )
}

/** "Change" the promised date: every open len-den entry of this person gets the new date */
function PromiseSheet({ open, promise, onClose }: { open: boolean; promise: NonNullable<KhataFile['promise']>; onClose: () => void }) {
  const { ur } = useLang()
  const inv = useInvalidate()
  const [day, setDay] = useState(promise.date)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    try {
      for (const pid of promise.entries) await api('PATCH', `/api/v1/payments/${pid}/due-date`, { due_date: day })
      await inv('party-khata', 'party-lending')
      onClose()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="pkh.promiseTitle">
      <div className="flex flex-col gap-3" data-testid="pkh-promise-sheet">
        <BiLabel text="pkh.promiseHint" size="sm" tone="text-muted" />
        <BiInput label="pkh.promise" type="date" value={day} min={isoDay(0)} onChange={(e) => setDay(e.target.value)} dir="ltr" data-testid="pkh-promise-date" />
        {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
        <BiButton text="common.save" full loading={busy} disabled={!day} onClick={() => void save()} data-testid="pkh-promise-save" />
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ the three cards */

const short = (v: number | string | null | undefined) => { const x = Math.abs(Number(v || 0)); return x >= 100000 ? `${(x / 100000).toFixed(x >= 10_000_000 ? 0 : 1)}L` : x.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
const methodName = (m: string, pick: (k: string) => string) => { const k = `pkh.m.${m}`; const v = pick(k); return v === k ? m : v }

/** their phones in the shop / sold / returned, the money by channel, the profit from them */
export function KhataCards({ kh, canCost, showProfit, setShowProfit }: { kh: KhataFile; canCost: boolean; showProfit: boolean; setShowProfit: (v: boolean) => void }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const s = kh.stock
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const tiny = ur ? cls('sm') : 'text-[11px] font-semibold'
  const pile = (label: string, p: Pile, tone: string, testid: string) => (
    <span className={`flex flex-col items-center rounded-xl px-2 py-2 text-center ${tone}`} data-testid={testid}>
      <span className={tiny}>{pick(label)}</span>
      <span className="num text-xl leading-tight text-ink">{p.count}</span>
      {canCost && p.cost != null ? <span className={`text-muted ${tiny}`} dir="ltr">{short(p.cost)}</span> : null}
    </span>
  )
  const profit = s.sold.profit
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" data-testid="pkh-cards">
      <section className="card flex flex-col gap-2" data-testid="pkh-stock">
        <BiLabel text="pkh.stockTitle" size="sm" tone="text-muted" bold />
        <div className="grid grid-cols-3 gap-1.5">
          {pile('pkh.inShop', s.in_shop, 'bg-receivable-tint text-receivable', 'pkh-stock-in')}
          {pile('pkh.soldOut', s.sold, 'bg-emerald-tint text-emerald-deep', 'pkh-stock-sold')}
          {pile('pkh.returned', s.returned, 'bg-payable-tint text-payable', 'pkh-stock-ret')}
        </div>
        {s.dearest ? (
          <button type="button" onClick={() => nav(`/stock/${s.dearest!.device_id}`)} className="tap flex items-center justify-between gap-2 border-t border-line pt-2 text-start">
            <span className={`text-muted ${small}`}>{pick('pkh.dearest')}</span>
            <span className="truncate text-sm font-bold text-ink" dir="auto">{s.dearest.label}{canCost && s.dearest.cost != null ? <span className="num text-muted" dir="ltr"> · {short(s.dearest.cost)}</span> : null}</span>
          </button>
        ) : null}
        {s.sold_to ? <span className={`text-muted ${small}`}>{t('pkh.soldToN', { n: s.sold_to })}</span> : null}
      </section>

      <section className="card flex flex-col gap-2" data-testid="pkh-channels">
        <BiLabel text="pkh.channels" size="sm" tone="text-muted" bold />
        {kh.channels.length ? (
          <div className="grid grid-cols-2 gap-1.5">
            {kh.channels.map((c) => (
              <span key={c.method} className="flex items-center justify-between gap-2 rounded-xl bg-ground px-2.5 py-1.5" data-testid="pkh-channel">
                <span className={`truncate text-ink ${small}`}>{methodName(c.method, pick)}</span>
                <span className="num text-sm" dir="ltr">{short(Number(c.in) + Number(c.out ?? 0))}</span>
              </span>
            ))}
          </div>
        ) : <span className={`text-muted ${small}`}>{pick('pkh.noMoney')}</span>}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className={`text-muted ${small}`}>{pick('pkh.totalFlow')}</span>
          <span className="num text-sm" dir="ltr">{kh.money_out != null ? `${short(kh.money_out)} / ` : ''}{short(kh.money_in)}</span>
        </div>
      </section>

      {canCost ? (
        <section className="card flex flex-col gap-2" data-testid="pkh-profit">
          <div className="flex items-center justify-between gap-2">
            <BiLabel text="pkh.profitTitle" size="sm" tone="text-muted" bold />
            <button type="button" onClick={() => setShowProfit(!showProfit)} className="tap inline-flex min-h-9 items-center gap-1 rounded-xl border border-line bg-surface px-2.5 font-bold text-ink" data-testid="pkh-eye">
              {showProfit ? <EyeOff size={14} /> : <Eye size={14} />}<span className={small}>{pick(showProfit ? 'pkh.hideProfit' : 'pkh.showProfit')}</span>
            </button>
          </div>
          <div className={`num text-[30px] leading-none ${Number(profit ?? 0) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr" data-testid="pkh-profit-val">
            {profit == null ? '—' : showProfit ? `${Number(profit) < 0 ? '−' : '+'}${rs(profit)}` : '••••'}
          </div>
          <span className={`text-muted ${small}`}>{t('pkh.profitSub', { sold: s.sold.count, bought: s.bought })}</span>
        </section>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ the book: four tabs */

const TYPES = ['all', 'unsold', 'sold', 'returned', 'purchase', 'sale', 'payment_in', 'payment_out', 'return', 'mistake'] as const
type TypeFilter = (typeof TYPES)[number]
export type Tab = 'ledger' | 'items' | 'models' | 'methods'
const BADGE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { purchase: 'ink', sale: 'ok', payment_in: 'ok', payment_out: 'warn', return: 'warn', mistake: 'bad', other: 'muted' }
const STATE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { in_shop: 'warn', sold: 'ok', sold_to: 'ok', returned: 'bad', other: 'muted' }
/** the kind of a statement line; money paid or received at the counter on a bill counts as money */
const rowType = (r: StatementRow): string => (r.reversed || r.document_type === 'correction' || r.document_type.startsWith('reversal:') || r.document_type.endsWith('_void') || r.document_type.endsWith('_change') ? 'mistake' : r.document_type === 'invoice' ? (Number(r.credit) > 0 ? 'payment_in' : 'sale') : r.document_type === 'purchase' ? (Number(r.debit) > 0 ? 'payment_out' : 'purchase') : r.document_type === 'payment' || r.document_type === 'lending' ? (Number(r.credit) > 0 ? 'payment_in' : 'payment_out') : r.document_type.includes('return') ? 'return' : 'other')

export function KhataBook({ party, rows, kh, canCost, showProfit, right, only }: { party: Party; rows: StatementRow[]; kh: KhataFile | undefined; canCost: boolean; showProfit: boolean; right?: ReactNode; only?: Tab }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [own, setTab] = useState<Tab>('ledger')
  const tab = only ?? own
  const [q, setQ] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [fixing, setFixing] = useState<StatementRow | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const tiny = ur ? cls('sm') : 'text-[11px] font-semibold'
  const docName = (dt: string): string => { if (dt.startsWith('reversal:')) return `${pick('pkh.reversedOf')}: ${docName(dt.slice(9))}`; const k = `pkh.doc.${dt}`; const v = pick(k); return v === k ? dt.replace(/_/g, ' ') : v }
  const query = q.trim().toLowerCase()
  const stockType = ['unsold', 'sold', 'returned'].includes(type)
  const ledgerRows = rows.filter((r) => (type === 'all' || stockType || rowType(r) === type) && (!query || (r.memo ?? '').toLowerCase().includes(query) || docName(r.document_type).toLowerCase().includes(query) || String(Number(r.debit) + Number(r.credit)).includes(query.replace(/[,\s]/g, ''))))
  const units = kh?.units ?? []
  const unitRows = units.filter((u) => (type === 'all' || !stockType || (type === 'unsold' ? u.state === 'in_shop' : type === 'sold' ? u.state === 'sold' || u.state === 'sold_to' : u.state === 'returned')) && (!query || `${u.label} ${u.imei1 ?? ''} ${u.no} ${u.sold_no ?? ''}`.toLowerCase().includes(query)))
  const modelRows = (kh?.models ?? []).filter((m) => !query || `${m.brand_name ?? ''} ${m.model_name ?? ''}`.toLowerCase().includes(query))
  const payRows = (kh?.payments ?? []).filter((p) => !query || `${p.no} ${p.method} ${p.reference ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(query))
  const profitShown = (v: string | null | undefined) => (v == null ? '—' : showProfit ? `${Number(v) < 0 ? '−' : '+'}${rs(v)}` : '••••')
  const tabs: [Tab, string, number | null][] = [['ledger', 'pkh.tabLedger', rows.length], ['items', 'pkh.tabItems', units.length], ['models', 'pkh.tabModels', null], ['methods', 'pkh.tabMethods', null]]

  return (
    <section className="flex flex-col gap-2" data-testid={only ? `pkh-book-${only}` : 'pkh-book'}>
      <div className="flex items-center justify-between gap-2">
        <BiLabel text={only ? tabs.find((x) => x[0] === only)![1] : 'party.statement'} size="sm" tone="text-muted" bold />
        {right}
      </div>
      {only ? null : <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map(([k, label, count]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 font-bold ${tab === k ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'}`} data-testid={`pkh-tab-${k}`}>
            <span className={ur ? cls('sm') : 'text-sm'}>{pick(label)}</span>
            {count != null ? <span className="num text-xs opacity-80" dir="ltr">{count}</span> : null}
          </button>
        ))}
      </div>}
      <div className={`grid grid-cols-1 gap-2 ${tab === 'ledger' || tab === 'items' ? 'sm:grid-cols-[1fr_auto]' : ''}`}>
        <SearchBox value={q} onChange={setQ} placeholder="pkh.searchPh" />
        {tab === 'ledger' || tab === 'items' ? <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} aria-label={pick('pkh.type.all')} className={`tap min-h-12 rounded-2xl border border-line bg-surface px-3 font-bold text-ink ${ur ? 'ur' : 'text-sm'}`} data-testid="pkh-type">
          {TYPES.filter((x) => (tab === 'ledger' ? !['unsold', 'sold', 'returned'].includes(x) : ['all', 'unsold', 'sold', 'returned'].includes(x))).map((x) => <option key={x} value={x}>{pick(`pkh.type.${x}`)}</option>)}
        </select> : null}
      </div>

      {tab === 'ledger' ? (
        <>
          <div className={`rounded-2xl bg-receivable-tint px-3 py-2 text-ink ${small}`} data-testid="pkh-fix-hint"><strong>{pick('pkh.fixTitle')}</strong> {pick('pkh.fixHint')}</div>
          {!ledgerRows.length ? <Empty text={rows.length ? 'pkh.x.noMatch' : 'common.nothingFound'} /> : (
            <div className="card divide-y divide-line p-0" data-testid="pkh-ledger">
              {[...ledgerRows].reverse().map((r) => {
                const d = Number(r.debit), c = Number(r.credit), b = Number(r.balance)
                const ty = rowType(r)
                const isPay = (r.document_type === 'payment' || r.document_type === 'lending') && r.document_id
                return (
                  <div key={r.entry_id} className={`flex flex-col gap-1.5 px-3 py-2.5 ${r.reversed ? 'opacity-55' : ''}`} data-testid="pkh-row">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip text={`pkh.badge.${ty}`} tone={BADGE[ty] ?? 'muted'} />
                          <span className={`text-muted ${tiny}`} dir="ltr">{fmtDate(r.at)} · {timeOf(r.at)}</span>
                        </div>
                        <div className={`mt-1 text-sm font-semibold text-ink ${r.reversed ? 'line-through' : ''}`} dir="auto">{r.memo || docName(r.document_type)}</div>
                        <div className={`text-muted ${tiny}`}>{docName(r.document_type)}</div>
                      </div>
                      <div className="shrink-0 text-end">
                        <div className={`num text-base ${d > 0 ? 'text-emerald-deep' : 'text-ink'}`} dir="ltr">{d > 0 ? `+${n0(d)}` : `−${n0(c)}`}</div>
                        <div className={`${b > 0 ? 'text-receivable' : b < 0 ? 'text-payable' : 'text-muted'} ${tiny}`} data-testid="pkh-running">
                          <span className="num" dir="ltr">= {n0(b)}</span> {pick(b > 0 ? 'pkh.lene' : b < 0 ? 'pkh.dene' : 'party.clear')}
                        </div>
                      </div>
                    </div>
                    {!r.reversed ? (
                      <div className="flex items-center justify-end gap-2">
                        {isPay ? <button type="button" aria-label={pick('unit.printReceipt')} onClick={() => void openPrintable(`/api/v1/payments/${r.document_id}/receipt?format=thermal`)} className="tap inline-flex min-h-9 items-center rounded-xl border border-line bg-surface px-2.5 text-ink"><Printer size={14} /></button> : null}
                        <button type="button" onClick={() => setFixing(r)} className="tap inline-flex min-h-9 items-center gap-1 rounded-xl border border-line bg-surface px-2.5 font-bold text-ink" data-testid="pkh-fix">
                          <Pencil size={13} className="text-receivable" /><span className={tiny}>{pick('pkh.fix')}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : tab === 'items' ? (
        !unitRows.length ? <Empty text="pkh.x.noPhones" /> : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" data-testid="pkh-items">
            {unitRows.map((u, i) => {
              const dearest = kh?.stock.dearest?.device_id === u.device_id
              const theirs = u.role === 'sold_to'
              return (
                <div key={`${u.role}-${u.device_id}-${i}`} className={`card flex flex-col gap-2 ${dearest ? 'ring-2 ring-receivable/50' : ''}`} data-testid="pkh-item">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => nav(`/stock/${u.device_id}`)} className="tap min-w-0 text-start">
                      <div className="truncate text-[15px] font-bold text-ink" dir="auto">{u.label}{u.storage_name ? <span className="font-medium text-muted"> · {u.storage_name}</span> : null}</div>
                      <div className={`text-muted ${tiny}`} dir="ltr">{u.imei1 ? `${u.imei1} · ` : ''}{u.no} · {fmtDate(u.date)}</div>
                    </button>
                    <span className="flex shrink-0 flex-col items-end gap-1" data-testid="pkh-item-state">
                      <Chip text={u.state === 'in_shop' ? { en: t('pkh.st.in_shopDays', { n: u.days_in_shop ?? 0 }), ur: t('pkh.st.in_shopDays', { n: u.days_in_shop ?? 0 }) } : `pkh.st.${u.state}`} tone={STATE[u.state] ?? 'muted'} />
                      {dearest ? <Chip text="pkh.dearestTag" tone="ink" /> : null}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      [theirs ? 'pkh.soldRate' : 'pkh.cost', theirs ? rs(u.sold_for) : u.cost != null ? rs(u.cost) : '—', ''],
                      [theirs ? 'pkh.left' : 'pkh.soldRate', theirs ? rs(u.remaining) : u.sold_for != null ? rs(u.sold_for) : pick('pkh.notSold'), ''],
                      ['pkh.profit', u.profit != null ? profitShown(u.profit) : '—', Number(u.profit ?? 0) < 0 ? 'text-payable' : 'text-emerald-deep'],
                    ] as [string, string, string][]).map(([k, v, tone]) => (
                      <span key={k} className="flex flex-col rounded-xl bg-ground px-2 py-1.5">
                        <span className={`text-muted ${tiny}`}>{pick(k)}</span>
                        <span className={`num text-sm leading-tight ${tone}`} dir="ltr">{v}</span>
                      </span>
                    ))}
                  </div>
                  {u.role === 'bought_from' && u.state === 'in_shop' ? (
                    <div className="grid grid-cols-2 gap-2">
                      {canCost ? (
                        <button type="button" onClick={() => nav(`/purchases/${u.doc_id}?return=${u.device_id}`)} className="tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-payable" data-testid="pkh-item-return">
                          <Undo2 size={15} /><span className={small}>{pick('pkh.returnDealer')}</span>
                        </button>
                      ) : <span />}
                      <button type="button" onClick={() => nav(`/sale/new?device=${u.device_id}`)} className="tap inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald px-3 font-bold text-white" data-testid="pkh-item-sell">
                        <Tag size={15} /><span className={small}>{pick('pkh.sellNow')}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      ) : tab === 'models' ? (
        !modelRows.length ? <Empty text="pkh.x.noPhones" /> : (
          <div className="card overflow-x-auto p-0" data-testid="pkh-models">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className={`border-b border-line text-muted ${tiny}`}>
                  <th className="px-3 py-2 text-start">{pick('pkh.brand')}</th><th className="px-3 py-2 text-start">{pick('pkh.model')}</th>
                  <th className="px-3 py-2 text-end">{pick('pkh.bought')}</th><th className="px-3 py-2 text-end">{pick('pkh.inShop')}</th><th className="px-3 py-2 text-end">{pick('pkh.soldOut')}</th><th className="px-3 py-2 text-end">{pick('pkh.returned')}</th><th className="px-3 py-2 text-end">{pick('pkh.soldToThem')}</th>
                  {canCost ? <><th className="px-3 py-2 text-end">{pick('pkh.highest')}</th><th className="px-3 py-2 text-end">{pick('pkh.totalCost')}</th></> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {modelRows.map((m, i) => (
                  <tr key={i} data-testid="pkh-model">
                    <td className="px-3 py-2.5 font-bold text-ink">{m.brand_name}</td><td className="px-3 py-2.5 text-ink" dir="auto">{m.model_name}</td>
                    <td className="num px-3 py-2.5 text-end">{m.bought}</td>
                    <td className="num px-3 py-2.5 text-end text-receivable">{m.in_shop}</td>
                    <td className="num px-3 py-2.5 text-end text-emerald-deep">{m.sold}</td>
                    <td className="num px-3 py-2.5 text-end text-payable">{m.returned}</td>
                    <td className="num px-3 py-2.5 text-end">{m.sold_to}</td>
                    {canCost ? <><td className="num px-3 py-2.5 text-end" dir="ltr">{n0(m.highest_cost)}</td><td className="num px-3 py-2.5 text-end" dir="ltr">{n0(m.total_cost)}</td></> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2" data-testid="pkh-methods">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(kh?.channels ?? []).map((c) => (
              <div key={c.method} className="card flex flex-col gap-1" data-testid="pkh-method">
                <span className="text-[15px] font-extrabold text-ink">{methodName(c.method, pick)}</span>
                {c.out != null ? <span className="flex items-center justify-between gap-2"><span className={`text-muted ${small}`}>{pick('pkh.paidOut')}</span><span className="num text-sm text-payable" dir="ltr">{rs(c.out)}</span></span> : null}
                <span className="flex items-center justify-between gap-2"><span className={`text-muted ${small}`}>{pick('pkh.recvIn')}</span><span className="num text-sm text-emerald-deep" dir="ltr">{rs(c.in)}</span></span>
                <span className={`border-t border-line pt-1 text-muted ${tiny}`}>{t('pkh.entriesN', { n: c.count })}</span>
              </div>
            ))}
          </div>
          {payRows.length ? (
            <div className="card divide-y divide-line p-0">
              {payRows.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="pkh-pay">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="num text-sm" dir="ltr">{p.no}</span><Chip text={{ en: methodName(p.method, pick), ur: methodName(p.method, pick) }} tone="muted" />{p.purpose === 'lending' ? <Chip text="pkh.x.lendBadge" tone="warn" /> : null}</div>
                    <div className={`truncate text-muted ${tiny}`} dir="auto">{fmtDate(p.date)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</div>
                  </div>
                  <span className={`num text-base ${p.direction === 'in' ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{p.amount != null ? `${p.direction === 'in' ? '+' : '−'}${n0(p.amount)}` : '••••'}</span>
                  <button type="button" aria-label={pick('unit.printReceipt')} onClick={() => void openPrintable(`/api/v1/payments/${p.id}/receipt?format=thermal`)} className="tap rounded-full border border-line p-2 text-ink"><Printer size={14} /></button>
                </div>
              ))}
            </div>
          ) : <Empty text="pkh.noMoney" />}
        </div>
      )}

      <FixSheet row={fixing} party={party} canCost={canCost} docName={docName} onClose={() => setFixing(null)} />
    </section>
  )
}

/* ------------------------------------------------------------------ Fix / Edit on a line */

/** what the live software lets the shop correct for that kind of entry; never an edit in place */
function FixSheet({ row, canCost, docName, onClose }: { row: StatementRow | null; party: Party; canCost: boolean; docName: (dt: string) => string; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [undo, setUndo] = useState<{ kind: 'old' | 'pay'; id: string } | null>(null)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!row) { setUndo(null); setWhy(''); setErr('') } }, [row])
  if (!row) return null
  const id = row.document_id
  const acts: { key: string; label: string; run: () => void; danger?: boolean }[] = []
  if (row.document_type === 'invoice' && id) {
    acts.push({ key: 'open', label: 'pkh.fx.openBill', run: () => nav(`/sales/${id}`) })
    if (canCost) acts.push({ key: 'buyer', label: 'sale.fix.button', run: () => nav(`/sales/${id}?change=1`) }, { key: 'del', label: 'del.deleteSale', run: () => nav(`/sales/${id}?delete=1`), danger: true })
  } else if (row.document_type === 'purchase' && id) {
    acts.push({ key: 'open', label: 'pkh.fx.openBill', run: () => nav(`/purchases/${id}`) })
    if (canCost) acts.push({ key: 'seller', label: 'purchase.fix.partyButton', run: () => nav(`/purchases/${id}?change=1`) }, { key: 'paid', label: 'purchase.paidFix.button', run: () => nav(`/purchases/${id}?paid=1`) }, { key: 'del', label: 'del.deletePurchase', run: () => nav(`/purchases/${id}?delete=1`), danger: true })
  } else if ((row.document_type === 'payment' || row.document_type === 'lending') && id) {
    acts.push({ key: 'receipt', label: 'unit.printReceipt', run: () => void openPrintable(`/api/v1/payments/${id}/receipt?format=a4`) })
    if (canCost) acts.push({ key: 'void', label: 'pkh.fx.deletePayment', run: () => setUndo({ kind: 'pay', id }), danger: true })
  } else if (row.document_type === 'opening_balance') {
    if (canCost) acts.push({ key: 'void', label: 'pkh.fx.deleteOld', run: () => setUndo({ kind: 'old', id: row.group_id }), danger: true })
  } else if (row.document_type.startsWith('repair') && id) {
    acts.push({ key: 'open', label: 'pkh.fx.openJob', run: () => nav(`/repairs/${id}`) })
  } else if (row.document_type.includes('return')) {
    acts.push({ key: 'returns', label: 'pkh.e.openReturns', run: () => nav('/returns') })
  }
  async function go() {
    if (!undo) return
    setBusy(true); setErr('')
    try {
      await api('POST', undo.kind === 'old' ? `/api/v1/ledger/opening-balances/${undo.id}/undo` : `/api/v1/payments/${undo.id}/void`, { reason: why.trim() })
      await inv(...KEEP)
      onClose()
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const small = ur ? cls('sm') : 'text-sm'
  return (
    <Sheet open onClose={onClose} title="pkh.fixWindow">
      <div className="flex flex-col gap-3" data-testid="pkh-fix-sheet">
        <div className="rounded-2xl bg-surface px-3 py-2">
          <div className="text-sm font-bold text-ink" dir="auto">{row.memo || docName(row.document_type)}</div>
          <div className="text-xs text-muted" dir="ltr">{fmtDate(row.at)} · {timeOf(row.at)} · {n0(Number(row.debit) + Number(row.credit))}</div>
        </div>
        <BiLabel text="pkh.fixRule" size="sm" tone="text-muted" />
        {undo ? (
          <>
            <BiLabel text={undo.kind === 'old' ? 'old.undoHint' : 'pkh.e.wrongPerson'} size="sm" tone="text-muted" />
            <BiInput label="common.reason" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} data-testid="pkh-undo-why" />
            {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
            <BiButton text="pkh.x.confirmDelete" variant="danger" full loading={busy} disabled={why.trim().length < 3} onClick={() => void go()} data-testid="pkh-undo-yes" />
            <BiButton text="common.cancel" variant="secondary" full onClick={() => setUndo(null)} />
          </>
        ) : acts.length ? acts.map((a) => (
          <button key={a.key} type="button" onClick={a.run} className={`tap flex min-h-14 w-full items-center gap-2 rounded-2xl border px-4 text-start font-bold ${a.danger ? 'border-payable/40 bg-payable-tint text-payable' : 'border-line bg-surface text-ink'}`} data-testid={`pkh-fx-${a.key}`}>
            {a.danger ? <Trash2 size={16} /> : <Pencil size={16} />}<span className={small}>{pick(a.label)}</span>
          </button>
        )) : <BiLabel text="pkh.fx.none" size="sm" tone="text-muted" />}
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ WhatsApp khata */

export function WaSheet({ open, party, text, onClose }: { open: boolean; party: Party; text: string; onClose: () => void }) {
  const { pick, ur } = useLang()
  const [msg, setMsg] = useState(text)
  useEffect(() => { if (open) setMsg(text) }, [open, text])
  const num = waNumber(party.whatsapp || party.phone)
  return (
    <Sheet open={open} onClose={onClose} title="pkh.x.waTitle">
      <div className="flex flex-col gap-3" data-testid="pkh-wa-sheet">
        <BiLabel text={num ? 'pkh.x.waReady' : 'pkh.x.waNoNumber'} size="sm" tone="text-muted" />
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={7} dir="auto" aria-label={pick('pkh.x.waTitle')} className={`w-full rounded-2xl border border-line bg-surface p-3 text-ink ${ur ? 'ur' : 'text-sm'}`} data-testid="pkh-wa-text" />
        <BiButton text="pkh.x.waSend" full icon={<MessageCircle size={18} />} onClick={() => { void navigator.clipboard?.writeText(msg).catch(() => undefined); window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); onClose() }} data-testid="pkh-wa-send" />
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ the full ledger report */

const SECS = ['channels', 'models', 'units', 'ledger'] as const

/** the server's A4 page for the period and sections chosen, previewed here, printed, downloaded, shared */
export function ReportWindow({ party, canCost, waText, onClose }: { party: Party; canCost: boolean; waText: string; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const [preset, setPreset] = useState<'all' | 'today' | '7d' | 'month'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [secs, setSecs] = useState<string[]>([...SECS])
  const [hideProfit, setHideProfit] = useState(true)
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [wa, setWa] = useState(false)
  useEffect(() => { const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  useEffect(() => { if (!note) return; const x = setTimeout(() => setNote(''), 1800); return () => clearTimeout(x) }, [note])
  const pickPreset = (p: typeof preset) => {
    setPreset(p)
    const today = isoDay(0)
    if (p === 'all') { setFrom(''); setTo('') } else if (p === 'today') { setFrom(today); setTo(today) } else if (p === '7d') { setFrom(isoDay(-6)); setTo(today) } else { setFrom(`${today.slice(0, 8)}01`); setTo(today) }
  }
  const qs = new URLSearchParams()
  if (from) qs.set('date_from', from)
  if (to) qs.set('date_to', to)
  qs.set('sections', secs.join(',') || 'ledger')
  if (canCost && !hideProfit) qs.set('profit', 'true')
  const path = `/api/v1/parties/${party.id}/khata-report?${qs}`
  const range = `${from ? `&date_from=${from}` : ''}${to ? `&date_to=${to}` : ''}`
  useEffect(() => {
    let live = true
    const x = setTimeout(() => { fetch(`${BASE}${withDocLang(path)}`, { headers: authHeaders() }).then((r) => r.text()).then((h) => { if (live) setHtml(h) }).catch((e) => setErr(String(e))) }, 200)
    return () => { live = false; clearTimeout(x) }
  }, [path])
  const small = ur ? cls('sm') : 'text-xs font-bold'
  const btn = 'tap inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-ink'
  const run = (p: Promise<unknown>) => { setErr(''); p.catch((e) => setErr(errText(e, ur))) }
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-ink/60 p-2 backdrop-blur-sm sm:p-5" data-testid="pkh-report">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-ground shadow-hero">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <BiLabel text="pkh.reportTitle" size="md" bold />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setWa(true)} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald px-3 font-bold text-white" data-testid="pkh-rep-wa"><MessageCircle size={15} /><span className={small}>{pick('pkh.shareWa')}</span></button>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(waText).catch(() => undefined); setNote(pick('pkh.copied')) }} className={btn} data-testid="pkh-rep-copy"><Copy size={15} /><span className={small}>{note || pick('pkh.copyText')}</span></button>
            <button type="button" onClick={() => run(downloadFile(withDocLang(`/api/v1/exports/parties/${party.id}/statement?format=pdf${range}`), `khata-${party.name}.pdf`))} className={btn} data-testid="pkh-rep-pdf"><Download size={15} /><span className={small}>PDF</span></button>
            <button type="button" onClick={() => run(downloadFile(withDocLang(`/api/v1/exports/parties/${party.id}/statement?format=csv${range}`), `khata-${party.name}.csv`))} className={btn} data-testid="pkh-rep-csv"><FileSpreadsheet size={15} /><span className={small}>{pick('pkh.excel')}</span></button>
            <button type="button" onClick={() => run(openPrintable(path))} className="tap inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-3 font-bold text-ground" data-testid="pkh-rep-print"><Printer size={15} /><span className={small}>{pick('pkh.printA4')}</span></button>
            <button type="button" onClick={onClose} aria-label={pick('common.close')} className={btn} data-testid="pkh-rep-close"><X size={16} /></button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'today', '7d', 'month'] as const).map((p) => <button key={p} type="button" aria-pressed={preset === p} onClick={() => pickPreset(p)} className={`tap inline-flex min-h-10 items-center rounded-xl px-3 font-bold ${preset === p ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'}`} data-testid={`pkh-rep-${p}`}><span className={small}>{pick(`pkh.preset.${p}`)}</span></button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <BiInput label="pkh.from" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPreset('all') }} dir="ltr" data-testid="pkh-rep-from" />
              <BiInput label="pkh.to" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPreset('all') }} dir="ltr" data-testid="pkh-rep-to" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {canCost ? <label className={`flex min-h-9 cursor-pointer items-center gap-1.5 text-ink ${small}`}><input type="checkbox" checked={hideProfit} onChange={(e) => setHideProfit(e.target.checked)} className="h-4 w-4" data-testid="pkh-rep-hideprofit" />{pick('pkh.hideProfitPrint')}</label> : null}
            {SECS.map((k) => <label key={k} className={`flex min-h-9 cursor-pointer items-center gap-1.5 text-ink ${small}`}><input type="checkbox" checked={secs.includes(k)} onChange={(e) => setSecs(e.target.checked ? [...secs, k] : secs.filter((x) => x !== k))} className="h-4 w-4" data-testid={`pkh-rep-sec-${k}`} />{pick(`pkh.sec.${k}`)}</label>)}
            <button type="button" onClick={() => { pickPreset('all'); setSecs([...SECS]); setHideProfit(true) }} className={`tap ms-auto text-muted underline ${small}`}>{pick('pkh.reset')}</button>
          </div>
          {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
        </div>
        <div className="bg-surface p-3 sm:p-5">{html ? <iframe title={pick('pkh.reportTitle')} srcDoc={html} sandbox="" className="h-[70vh] w-full rounded-2xl border border-line bg-white" data-testid="pkh-rep-frame" /> : <div className="flex h-40 items-center justify-center text-muted">…</div>}</div>
      </div>
      <WaSheet open={wa} party={party} text={waText} onClose={() => setWa(false)} />
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ the people with an open balance */

/** one tap to the next person whose account is open (the file's switcher) */
export function OpenPeople({ current }: { current: string }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const { data: people } = useParties({})
  const list = (people ?? []).filter((p) => p.id !== current && Number(p.balance) !== 0).sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance))).slice(0, 6)
  if (!list.length) return null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-1" data-testid="pkh-people">
      <span className={`text-muted ${small}`}>{pick('pkh.e.others')}</span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {list.map((p) => {
          const b = Number(p.balance)
          return (
            <button key={p.id} type="button" onClick={() => nav(`/parties/${p.id}`)} className="tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-ink">
              <span className={ur ? cls('sm') : 'text-sm'} dir="auto">{ur ? p.name_ur || p.name : p.name}</span>
              <span className={`${b > 0 ? 'text-receivable' : 'text-payable'} ${small}`}>{pick(b > 0 ? 'pkh.lene' : 'pkh.dene')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ WhatsApp khata + full report */

/** the two buttons under "money received / paid": WhatsApp khata and the full ledger report */
export function KhataButtons({ party, kh, canCost, children }: { party: Party; kh: KhataFile | undefined; canCost: boolean; children?: ReactNode }) {
  const { pick, ur, cls } = useLang()
  const waText = useWaText(party, kh)
  const [wa, setWa] = useState(false)
  const [report, setReport] = useState(false)
  const name = ur ? cls('sm') : 'text-sm'
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="pkh-buttons">
      <button type="button" onClick={() => setWa(true)} className="tap flex min-h-16 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-start text-ink" data-testid="pkh-wa">
        <span className="well h-10 w-10 shrink-0 rounded-xl bg-emerald text-white"><MessageCircle size={18} /></span>
        <span className={`font-extrabold ${name}`}>{pick('pkh.waKhata')}</span>
      </button>
      <button type="button" onClick={() => setReport(true)} className="tap flex min-h-16 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-start text-ink" data-testid="pkh-report-open">
        <span className="well h-10 w-10 shrink-0 rounded-xl bg-ink text-ground"><FileText size={18} /></span>
        <span className={`min-w-0 font-extrabold ${name}`}>{pick('pkh.e.report')}</span>
      </button>
      {children}
      <WaSheet open={wa} party={party} text={waText} onClose={() => setWa(false)} />
      {report ? <ReportWindow party={party} canCost={canCost} waText={waText} onClose={() => setReport(false)} /> : null}
    </div>
  )
}
