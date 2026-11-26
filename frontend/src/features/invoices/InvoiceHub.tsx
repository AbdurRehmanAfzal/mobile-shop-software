/** The pieces the invoices page gained from the new product's file 24 (owner 2026-11-26, ADR-137):
 *  a bill's card with its actions, the bills per dealer / customer, the full bills ledger, the quick
 *  view of a bill (print in English or Urdu, 80 mm or A4, WhatsApp, settle, correct, return, delete,
 *  history), settle a bill, the correction chooser, the delete hand-off, the create chooser and the
 *  A4 / Excel report. Every figure is the server's (`/bills-hub/bills`). A bill is never edited in
 *  place and never deleted from a list: each choice opens the live screen for it (ADR-090 / 099). */

import { Building2, Eye, FileSpreadsheet, FileText, PackagePlus, Pencil, Printer, RotateCcw, Share2, Tag, Trash2, Undo2, User, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, Loading, Sheet, fmtDate } from '@/components/ui'
import PaymentForm from '@/features/payments/PaymentForm'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useModules } from '@/lib/modules'
import { waNumber } from '@/lib/phone'
import { useInvalidate, useParty } from '@/lib/queries'

type M = string
export type Kind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'repair'
export type BState = 'due' | 'paid' | 'in_repair' | 'returned' | 'void'
interface Line { kind: string; label: string | null; code: string | null; qty: number; device_id?: string; accessory_id?: string }
interface Change { type: string; memo: string | null; by: string | null; at: string | null; from_no?: string; from_total?: M }
export interface BillRow {
  kind: Kind; type: string; id: string; no: string; date: string; party_id: string | null; party_name: string | null; party_name_ur: string | null; party_phone: string | null
  role: 'customer' | 'dealer'; lines: Line[]; kinds: string[]; total: M; paid: M; due: M; state: BState
  ref_id: string | null; ref_no: string | null; created_by_name: string | null; mode: string | null; changes: Change[]; edited: boolean; replaced_by_no: string | null
  profit: M | null; stage: string | null; money_in: M; money_out: M
}
export interface Group { party_id: string | null; name: string | null; name_ur: string | null; phone: string | null; role: 'customer' | 'dealer'; bills: number; kinds: string[]; billed: M; paid: M; to_get: M; to_pay: M; ids: string[] }
export interface HubData { rows: BillRow[]; total_rows: number; figures: { sales: M; sales_count: number; purchases: M | null; purchases_count: number | null; to_get: M; to_pay: M | null; profit: M | null; count: number; edited: number }; parties: Group[] }

export const num = (v: M | number | null | undefined) => Number(v ?? 0)
export const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
export const signed = (v: M | number | null | undefined) => `${num(v) < 0 ? '−' : '+'}${rs(v)}`
export const kindKey = (k: string) => (k === 'items' ? 'ihub.items' : `devcat.${k}`)

const KIND: Record<Kind, { Icon: LucideIcon; tone: string; label: string }> = {
  sale: { Icon: Tag, tone: 'bg-sell text-sell-fg', label: 'inv.kind.sale' },
  purchase: { Icon: PackagePlus, tone: 'bg-buy text-buy-fg', label: 'inv.kind.purchase' },
  sale_return: { Icon: Undo2, tone: 'bg-ret text-ret-fg', label: 'inv.kind.sale_return' },
  purchase_return: { Icon: Undo2, tone: 'bg-ret text-ret-fg', label: 'inv.kind.purchase_return' },
  repair: { Icon: Wrench, tone: 'bg-repair text-repair-fg', label: 'inv.kind.repair' },
}
const STATE_TONE: Record<BState, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { paid: 'ok', due: 'warn', in_repair: 'ink', returned: 'muted', void: 'muted' }
const stateKey = (r: BillRow) => (r.state === 'due' && r.kind === 'purchase' ? 'inv.state.toPay' : r.state === 'in_repair' ? 'inv.state.open' : `inv.state.${r.state}`)
/** the bill's own page, where it always opened */
export const billPage = (r: BillRow) => (r.kind === 'sale' ? `/sales/${r.id}` : r.kind === 'purchase' ? `/purchases/${r.id}` : r.kind === 'repair' ? `/repairs/${r.id}` : r.ref_id ? (r.kind === 'sale_return' ? `/sales/${r.ref_id}` : `/purchases/${r.ref_id}`) : '/returns')
const canSettle = (r: BillRow) => num(r.due) > 0 && r.state !== 'void' && (r.kind === 'sale' || r.kind === 'purchase') && !!r.party_id

export interface Act { view: (r: BillRow) => void; settle: (r: BillRow) => void; fix: (r: BillRow) => void; del: (r: BillRow) => void; share: (r: BillRow) => void }

export function useShare() {
  const { pick } = useLang()
  const shop = useAuth(activeShop)
  return (r: BillRow) => {
    const msg = [`*${shop?.name ?? ''}*`, `${pick(KIND[r.kind].label)}: ${r.no}`, `${pick('ihub.dateL')}: ${fmtDate(r.date)}`, r.party_name ? `${pick('ihub.partyL')}: ${r.party_name}` : '', ...r.lines.map((l) => `${l.label ?? ''}${l.code ? ` (${l.code})` : ''}`), `${pick('ihub.total')}: ${rs(r.total)}`, `${pick('ihub.paid')}: ${rs(r.paid)}`, `${pick('ihub.remaining')}: ${rs(r.due)}`].filter(Boolean).join('\n')
    window.open(`https://wa.me/${waNumber(r.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }
}

function ChangeLine({ c }: { c: Change }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  return <span>{pick(`ihub.ch.${c.type}`)}{c.from_no ? <> · {t('ihub.replaces', { no: c.from_no, total: rs(c.from_total) })}</> : null}{c.memo ? <> · <span dir="auto">{c.memo}</span></> : null}</span>
}

/** one bill: tapping it opens its own page (as always); the buttons under it are the quick actions */
export function BillCard({ r, act, costOk }: { r: BillRow; act: Act; costOk: boolean }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const k = KIND[r.kind]
  const first = r.lines[0]
  const last = r.changes[r.changes.length - 1]
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const icon = 'tap inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl border border-line bg-surface px-2.5 font-bold text-ink'
  return (
    <div className={`flex flex-col gap-2 px-3 py-3 ${r.edited ? 'bg-receivable-tint/40' : ''}`} data-testid="ihub-row" data-no={r.no}>
      <button type="button" onClick={() => nav(billPage(r))} className="tap flex w-full items-center gap-3 text-start">
        <span className={`well h-11 w-11 shrink-0 rounded-2xl ${k.tone}`}><k.Icon size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-bold text-ink" dir="auto">{r.party_name ?? pick(r.kind === 'repair' ? 'inv.noName' : 'sale.cashCustomer')}</span>
          <span className={`flex flex-wrap items-center gap-x-1.5 text-muted ${small}`}>
            <span>{pick(k.label)}</span>
            <span dir="ltr" className="num">{r.no}</span>
            <span>·</span>
            <span dir="ltr">{fmtDate(r.date)}</span>
            {r.mode ? <span>· {pick(`ihub.mode.${r.mode}`)}</span> : null}
            {first?.label ? <span className="truncate">· {first.label}{r.lines.length > 1 ? <span dir="ltr"> +{r.lines.length - 1}</span> : null}</span> : null}
            {r.ref_no ? <span dir="ltr">({pick('inv.ofBill')} {r.ref_no})</span> : null}
          </span>
          {first?.code ? <span className={`text-muted ${small}`} dir="ltr">{first.code}</span> : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-base text-ink" dir="ltr">{rs(r.total)}</span>
          <span className="flex items-center gap-1">
            <Chip text={stateKey(r)} tone={STATE_TONE[r.state]} />
            {num(r.due) > 0 ? <span className="num text-sm text-receivable" dir="ltr">{rs(r.due)}</span> : null}
          </span>
          {r.profit != null && r.kind === 'sale' && r.state !== 'void' ? <span className={`num text-xs ${num(r.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr" data-testid="ihub-row-profit">{costOk ? signed(r.profit) : '••••'}</span> : null}
        </span>
      </button>
      {last ? <div className={`rounded-xl bg-receivable-tint px-2.5 py-1 text-ink ${small}`} data-testid="ihub-row-change"><span className="font-bold text-receivable">{pick('ihub.edited')}:</span> <ChangeLine c={last} /></div> : null}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" onClick={() => act.view(r)} className={icon} data-testid="ihub-view"><Eye size={15} /><span className={small}>{pick('ihub.viewBtn')}</span></button>
        {canSettle(r) ? <button type="button" onClick={() => act.settle(r)} className="tap inline-flex h-10 items-center gap-1 rounded-xl bg-emerald px-3 font-bold text-white" data-testid="ihub-settle"><Wallet size={15} /><span className={small}>{pick('ihub.settle')}</span></button> : null}
        <button type="button" onClick={() => act.share(r)} aria-label={pick('ihub.whatsapp')} className={icon}><Share2 size={15} /></button>
        {r.state !== 'void' ? <button type="button" onClick={() => act.fix(r)} aria-label={pick('ihub.edit')} className={`${icon} text-receivable`} data-testid="ihub-fix"><Pencil size={15} /></button> : null}
        {r.state !== 'void' ? <button type="button" onClick={() => act.del(r)} aria-label={pick('ihub.delete')} className={`${icon} text-payable`} data-testid="ihub-del"><Trash2 size={15} /></button> : null}
      </div>
    </div>
  )
}

/** the bills of each dealer or customer, with what was billed, paid and is still to get / to pay */
export function Groups({ rows, groups, role, act, costOk }: { rows: BillRow[]; groups: Group[]; role: 'dealer' | 'customer'; act: Act; costOk: boolean }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const Icon = role === 'dealer' ? Building2 : User
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  if (!groups.length) return <Empty text="inv.none" />
  return (
    <div className="flex flex-col gap-3" data-testid={`ihub-groups-${role}`}>
      {groups.map((g) => {
        const due = role === 'dealer' ? g.to_pay : g.to_get
        return (
          <section key={g.party_id ?? 'walkin'} className="card flex flex-col gap-2 p-0" data-testid="ihub-group">
            <div className="flex flex-col gap-2 border-b border-line px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="well h-9 w-9 shrink-0 rounded-xl bg-ground text-ink"><Icon size={16} /></span>
                <span className="text-base font-extrabold text-ink" dir="auto">{(ur ? g.name_ur || g.name : g.name) ?? pick('sale.cashCustomer')}</span>
                {g.phone ? <span className="num text-sm text-muted" dir="ltr">{g.phone}</span> : null}
                <span className={`text-muted ${small}`}>{t('ihub.bills', { n: g.bills })}</span>
                {g.party_id ? <button type="button" onClick={() => nav(`/parties/${g.party_id}`)} className="tap inline-flex min-h-9 items-center rounded-xl border border-line bg-surface px-2.5 font-bold text-ink" data-testid="ihub-group-khata"><span className={small}>{pick('ihub.openKhata')}</span></button> : null}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([['ihub.billed', rs(g.billed), ''], ['ihub.paidSettled', rs(g.paid), 'text-emerald-deep'], [role === 'dealer' ? 'inv.toGive' : 'inv.toGet', rs(due), num(due) > 0 ? (role === 'dealer' ? 'text-payable' : 'text-receivable') : 'text-muted']] as [string, string, string][]).map(([k, v, tone], i) => (
                  <span key={k} className="flex flex-col rounded-xl bg-ground px-2 py-1.5" data-testid={i === 2 ? 'ihub-group-due' : undefined}>
                    <span className={`text-muted ${small}`}>{pick(k)}</span>
                    <span className={`num text-sm leading-tight ${tone}`} dir="ltr">{v}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="divide-y divide-line">{g.ids.map((id) => byId.get(id)).filter((r): r is BillRow => !!r).map((r) => <BillCard key={`${r.kind}-${r.id}`} r={r} act={act} costOk={costOk} />)}</div>
          </section>
        )
      })}
    </div>
  )
}

/** every bill as one ledger line: money in, money out, what is left, the profit */
export function LedgerTable({ rows, costOk, canCost }: { rows: BillRow[]; costOk: boolean; canCost: boolean }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const tiny = ur ? cls('sm') : 'text-[11px] font-semibold'
  if (!rows.length) return <Empty text="inv.none" />
  return (
    <div className="card overflow-x-auto p-0" data-testid="ihub-ledger">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={`border-b border-line text-muted ${tiny}`}>
            <th className="px-3 py-2 text-start">{pick('ihub.col.voucher')}</th><th className="px-3 py-2 text-start">{pick('ihub.col.type')}</th><th className="px-3 py-2 text-start">{pick('ihub.col.party')}</th><th className="px-3 py-2 text-start">{pick('ihub.col.mode')}</th>
            <th className="px-3 py-2 text-end">{pick('ihub.col.in')}</th><th className="px-3 py-2 text-end">{pick('ihub.col.out')}</th><th className="px-3 py-2 text-end">{pick('ihub.col.balance')}</th>{canCost ? <th className="px-3 py-2 text-end">{pick('ihub.col.profit')}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`} onClick={() => nav(billPage(r))} className="tap cursor-pointer" data-testid="ihub-ledger-row">
              <td className="px-3 py-2.5"><div className="num text-sm" dir="ltr">{r.no}</div><div className={`text-muted ${tiny}`} dir="ltr">{fmtDate(r.date)}</div></td>
              <td className="px-3 py-2.5"><div className="font-bold text-ink">{pick(KIND[r.kind].label)}</div><div className={`text-muted ${tiny}`}>{r.kinds.map((k) => pick(kindKey(k))).join(', ')}</div></td>
              <td className="px-3 py-2.5"><div className="font-bold text-ink" dir="auto">{r.party_name ?? pick('sale.cashCustomer')}</div><div className={`max-w-[220px] truncate text-muted ${tiny}`}>{r.lines[0]?.label ?? '—'}{r.lines[0]?.code ? <> · <span dir="ltr">{r.lines[0].code}</span></> : null}</div></td>
              <td className={`px-3 py-2.5 text-ink ${tiny}`}>{r.mode ? pick(`ihub.mode.${r.mode}`) : '—'}</td>
              <td className="num px-3 py-2.5 text-end text-emerald-deep" dir="ltr">{num(r.money_in) > 0 ? `+${rs(r.money_in)}` : '—'}</td>
              <td className="num px-3 py-2.5 text-end text-payable" dir="ltr">{num(r.money_out) > 0 ? `−${rs(r.money_out)}` : '—'}</td>
              <td className={`num px-3 py-2.5 text-end ${num(r.due) > 0 ? 'text-receivable' : 'text-muted'}`} dir="ltr">{num(r.due) > 0 ? rs(r.due) : pick('ihub.settled')}</td>
              {canCost ? <td className={`num px-3 py-2.5 text-end ${num(r.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{r.profit != null && r.state !== 'void' && num(r.profit) !== 0 ? (costOk ? signed(r.profit) : '••••') : '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** the quick view of a bill: print, WhatsApp, settle, correct, return, delete, its lines and history */
export function BillSheet({ r, costOk, canCost, act, onClose }: { r: BillRow | null; costOk: boolean; canCost: boolean; act: Act; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [lang, setLang] = useState<'en' | 'ur'>(ur ? 'ur' : 'en')
  const [fmt, setFmt] = useState<'thermal' | 'a4'>('thermal')
  if (!r) return null
  const page = r.kind === 'sale' ? `/api/v1/sales/${r.id}/receipt?format=${fmt}&lang=${lang}` : r.kind === 'repair' ? `/api/v1/repairs/${r.id}/job-sheet?lang=${lang}` : null
  const phone = r.lines.find((l) => l.device_id)?.device_id
  const small = ur ? cls('sm') : 'text-sm'
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const seg = (on: boolean) => `tap min-h-10 flex-1 rounded-xl px-3 font-bold ${on ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${tiny}`
  const btn = 'tap flex min-h-12 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-start font-bold text-ink'
  return (
    <Sheet open onClose={onClose} title={{ en: `${pick(KIND[r.kind].label)} ${r.no}`, ur: `${pick(KIND[r.kind].label)} ${r.no}` }}>
      <div className="flex flex-col gap-3" data-testid="ihub-sheet">
        <div className="card flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-extrabold text-ink" dir="auto">{r.party_name ?? pick('sale.cashCustomer')}</span>
            <Chip text={stateKey(r)} tone={STATE_TONE[r.state]} />
          </div>
          <span className={`text-muted ${tiny}`}><span dir="ltr">{fmtDate(r.date)}</span>{r.party_phone ? <> · <span dir="ltr">{r.party_phone}</span></> : null}{r.mode ? <> · {pick(`ihub.mode.${r.mode}`)}</> : null}{r.created_by_name ? <> · {t('ihub.by', { who: r.created_by_name })}</> : null}</span>
          <div className="flex flex-col gap-1 border-y border-line py-2" data-testid="ihub-lines">
            {r.lines.map((l, i) => <div key={i}><div className="text-sm font-bold text-ink" dir="auto">{l.label ?? '—'}{l.qty > 1 ? <span dir="ltr"> × {l.qty}</span> : null}</div>{l.code ? <div className={`text-muted ${tiny}`} dir="ltr">{l.code}</div> : null}</div>)}
            {r.ref_no ? <div className={`text-muted ${tiny}`}>{t('ihub.ofBill', { no: r.ref_no })}</div> : null}
          </div>
          {([['ihub.total', rs(r.total), 'text-ink'], ['ihub.paid', rs(r.paid), 'text-emerald-deep'], ['ihub.remaining', rs(r.due), num(r.due) > 0 ? 'text-receivable' : 'text-muted']] as [string, string, string][]).map(([k, v, tone], i) => (
            <div key={k} className="flex items-center justify-between gap-2"><span className={`text-muted ${tiny}`}>{pick(k)}</span><span className={`num text-base ${tone}`} dir="ltr" data-testid={i === 2 ? 'ihub-sheet-due' : undefined}>{v}</span></div>
          ))}
          {canCost && r.kind === 'sale' && r.profit != null && r.state !== 'void' ? <div className="flex items-center justify-between gap-2 border-t border-line pt-1.5"><span className={`text-muted ${tiny}`}>{pick('ihub.profitBill')}</span><span className={`num text-base ${num(r.profit) < 0 ? 'text-payable' : 'text-emerald-deep'}`} dir="ltr">{costOk ? signed(r.profit) : '••••••'}</span></div> : null}
        </div>

        {canSettle(r) ? <BiButton text={{ en: t('ihub.settleBox', { amt: rs(r.due) }), ur: t('ihub.settleBox', { amt: rs(r.due) }) }} full icon={<Wallet size={18} />} onClick={() => act.settle(r)} data-testid="ihub-sheet-settle" /> : null}

        {page ? (
          <div className="card flex flex-col gap-2">
            <div className="flex gap-1.5"><button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={seg(lang === 'en')}>English</button><button type="button" aria-pressed={lang === 'ur'} onClick={() => setLang('ur')} className={seg(lang === 'ur')} data-testid="ihub-doc-ur">اردو</button></div>
            {r.kind === 'sale' ? <div className="flex gap-1.5"><button type="button" aria-pressed={fmt === 'thermal'} onClick={() => setFmt('thermal')} className={seg(fmt === 'thermal')} data-testid="ihub-fmt-80">{pick('ihub.fmt80')}</button><button type="button" aria-pressed={fmt === 'a4'} onClick={() => setFmt('a4')} className={seg(fmt === 'a4')}>{pick('ihub.fmtA4')}</button></div> : null}
            <BiButton text="ihub.print" variant="secondary" full icon={<Printer size={18} />} onClick={() => void openPrintable(page)} data-testid="ihub-print" />
          </div>
        ) : <BiLabel text="ihub.printNone" size="sm" tone="text-muted" />}

        <button type="button" onClick={() => act.share(r)} className={btn}><Share2 size={17} /><span className={small}>{pick('ihub.whatsapp')}</span></button>
        <button type="button" onClick={() => nav(billPage(r))} className={btn} data-testid="ihub-open-page"><FileText size={17} /><span className={small}>{pick('ihub.openBill')}</span></button>
        {r.state !== 'void' ? <button type="button" onClick={() => act.fix(r)} className={`${btn} text-receivable`}><Pencil size={17} /><span className={small}>{pick('ihub.edit')}</span></button> : null}
        {r.kind === 'sale' && (r.state === 'paid' || r.state === 'due') ? <button type="button" onClick={() => nav(`/return/new?invoice=${r.id}`)} className={btn} data-testid="ihub-return"><Undo2 size={17} /><span className={small}>{pick('ihub.returnItems')}</span></button> : null}
        {r.kind === 'repair' ? <button type="button" onClick={() => nav(`/repairs/${r.id}`)} className={btn}><Wrench size={17} /><span className={small}>{pick('ihub.repairStage')}: {r.stage ? pick(`repair.status.${r.stage}`) : '—'}</span></button> : null}
        {phone ? <button type="button" onClick={() => nav(`/stock/${phone}`)} className={btn}><Tag size={17} /><span className={small}>{pick('ihub.openItem')}</span></button> : null}
        {r.state !== 'void' ? <button type="button" onClick={() => act.del(r)} className="tap flex min-h-12 w-full items-center gap-2 rounded-2xl border border-payable/40 bg-payable-tint px-4 text-start font-bold text-payable"><Trash2 size={17} /><span className={small}>{pick('ihub.delete')}</span></button> : null}

        <div className="flex flex-col gap-1.5" data-testid="ihub-history">
          <BiLabel text="ihub.history" size="sm" tone="text-muted" bold />
          {[...r.changes].reverse().map((c, i) => <div key={i} className="rounded-2xl bg-receivable-tint px-3 py-2"><div className={`font-bold text-ink ${tiny}`}><ChangeLine c={c} /></div>{c.by ? <div className={`text-muted ${tiny}`}>{t('ihub.by', { who: c.by })}</div> : null}</div>)}
          {r.replaced_by_no ? <div className={`rounded-2xl bg-surface px-3 py-2 font-bold text-ink ${tiny}`}>{t('ihub.replacedBy', { no: r.replaced_by_no })}</div> : null}
          <div className="rounded-2xl bg-surface px-3 py-2"><div className={`font-bold text-ink ${tiny}`}>{pick('ihub.made')}</div><div className={`text-muted ${tiny}`}><span dir="ltr">{fmtDate(r.date)}</span>{r.created_by_name ? <> · {t('ihub.by', { who: r.created_by_name })}</> : null}</div></div>
        </div>
      </div>
    </Sheet>
  )
}

/** settle a bill: the live payment form, already put against this bill */
export function SettleSheet({ r, onClose }: { r: BillRow | null; onClose: () => void }) {
  const inv = useInvalidate()
  const { data: party } = useParty(r?.party_id ?? undefined)
  if (!r) return null
  return (
    <Sheet open onClose={onClose} title={r.kind === 'purchase' ? 'unit.payForThis' : 'unit.receiveForThis'}>
      <div data-testid="ihub-settle-sheet">
        {party ? (
          <PaymentForm
            party={party}
            direction={r.kind === 'purchase' ? 'out' : 'in'}
            allocation={{ document_type: r.kind === 'purchase' ? 'purchase' : 'invoice', document_id: r.id, document_no: r.no, remaining: num(r.due) }}
            onDone={() => { onClose(); void inv('bills-hub', 'invoices', 'party', 'parties', 'statement', 'party-units', 'party-khata', 'dashboard', 'balances') }}
          />
        ) : <Loading />}
      </div>
    </Sheet>
  )
}

/** what can be corrected on a bill: each choice opens the live correction for it */
export function FixSheet({ r, onClose }: { r: BillRow | null; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  if (!r) return null
  const ch: [string, string, string][] =
    r.kind === 'sale' ? [['ihub.e.replace', 'ihub.e.replaceHint', `/sale/new?replace=${r.id}`], ['ihub.e.party', 'ihub.e.partyHint', `/sales/${r.id}?change=1`], ['ihub.e.return', 'ihub.e.returnHint', `/return/new?invoice=${r.id}`]]
      : r.kind === 'purchase' ? [['ihub.e.replace', 'ihub.e.replaceHint', `/purchase/new?replace=${r.id}`], ['ihub.e.party', 'ihub.e.partyHint', `/purchases/${r.id}?change=1`], ['ihub.e.paid', 'ihub.e.paidHint', `/purchases/${r.id}?paid=1`], ['ihub.e.cost', 'ihub.e.costHint', `/purchases/${r.id}`]]
        : r.kind === 'repair' ? [['ihub.e.repair', 'ihub.e.repairHint', `/repairs/${r.id}`]]
          : [['ihub.e.retList', 'ihub.e.retHint', '/returns']]
  return (
    <Sheet open onClose={onClose} title={{ en: `${pick('ihub.edit')} · ${r.no}`, ur: `${pick('ihub.edit')} · ${r.no}` }}>
      <div className="flex flex-col gap-2" data-testid="ihub-fix-sheet">
        <BiLabel text="ihub.editSub" size="sm" tone="text-muted" />
        {ch.map(([title, hint, to]) => (
          <button key={title} type="button" onClick={() => nav(to)} className="tap flex min-h-14 w-full items-start gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-start" data-testid="ihub-fix-choice">
            <Pencil size={17} className="mt-0.5 shrink-0 text-receivable" />
            <span className="flex flex-col"><span className={`font-bold text-ink ${ur ? cls('md') : 'text-[15px]'}`}>{pick(title)}</span><span className={`text-muted ${ur ? cls('sm') : 'text-xs'}`}>{pick(hint)}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** delete is the bill's own page: it checks what must be undone first and asks for a reason */
export function DeleteSheet({ r, onClose }: { r: BillRow | null; onClose: () => void }) {
  const { pick } = useLang()
  const nav = useNavigate()
  if (!r) return null
  const to = r.kind === 'sale' ? `/sales/${r.id}?delete=1` : r.kind === 'purchase' ? `/purchases/${r.id}?delete=1` : r.kind === 'repair' ? `/repairs/${r.id}` : '/returns'
  return (
    <Sheet open onClose={onClose} title={{ en: `${pick('ihub.delete')} · ${r.no}`, ur: `${pick('ihub.delete')} · ${r.no}` }}>
      <div className="flex flex-col gap-3" data-testid="ihub-del-sheet">
        <BiLabel text="ihub.delSub" size="sm" tone="text-muted" />
        <BiButton text="ihub.delGo" variant="danger" full icon={<Trash2 size={18} />} onClick={() => { onClose(); nav(to) }} data-testid="ihub-del-go" />
        <BiButton text="common.cancel" variant="secondary" full onClick={onClose} />
      </div>
    </Sheet>
  )
}

/** "Create new bill": each bill is made on its own form */
export function CreateSheet({ open, canCost, onClose }: { open: boolean; canCost: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const has = useModules()
  const choices: [string, string, LucideIcon][] = [
    ['ihub.c.sale', '/sale/new', Tag],
    ...(canCost ? [['ihub.c.purchase', '/purchase/new', PackagePlus]] as [string, string, LucideIcon][] : []),
    ['ihub.c.return', '/return/new', Undo2],
    ...(has('repairs') ? [['ihub.c.repair', '/repairs/new', Wrench]] as [string, string, LucideIcon][] : []),
    ...(has('exchange') ? [['ihub.c.exchange', '/exchange/new', RotateCcw]] as [string, string, LucideIcon][] : []),
  ]
  return (
    <Sheet open={open} onClose={onClose} title="ihub.createTitle">
      <div className="flex flex-col gap-2" data-testid="ihub-create-sheet">
        <BiLabel text="ihub.createSub" size="sm" tone="text-muted" />
        {choices.map(([l, to, I]) => <button key={l} type="button" onClick={() => nav(to)} className="tap flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-start font-bold text-ink" data-testid="ihub-create-choice"><I size={18} /><span className={ur ? cls('md') : 'text-[15px]'}>{pick(l)}</span></button>)}
      </div>
    </Sheet>
  )
}

/** the bills ledger report: the server's A4 page of the filtered bills, or the same as Excel / CSV */
export function ReportSheet({ open, sheet, canCost, onClose }: { open: boolean; sheet: string; canCost: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const [hideProfit, setHideProfit] = useState(false)
  const [lang, setLang] = useState<'en' | 'ur'>(ur ? 'ur' : 'en')
  const [err, setErr] = useState('')
  const url = (fmt: string) => `${sheet}${sheet.includes('?') ? '&' : '?'}format=${fmt}&profit=${!hideProfit}&lang=${lang}`
  const run = (p: Promise<unknown>) => { setErr(''); p.catch((e) => setErr(String(e))) }
  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const seg = (on: boolean) => `tap min-h-10 flex-1 rounded-xl px-3 font-bold ${on ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'} ${tiny}`
  return (
    <Sheet open={open} onClose={onClose} title="ihub.a4Title">
      <div className="flex flex-col gap-3" data-testid="ihub-report-sheet">
        <BiLabel text="ihub.a4Sub" size="sm" tone="text-muted" />
        <div className="flex gap-1.5"><button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={seg(lang === 'en')}>English</button><button type="button" aria-pressed={lang === 'ur'} onClick={() => setLang('ur')} className={seg(lang === 'ur')}>اردو</button></div>
        {canCost ? <label className={`flex min-h-10 cursor-pointer items-center gap-2 text-ink ${tiny}`}><input type="checkbox" checked={hideProfit} onChange={(e) => setHideProfit(e.target.checked)} className="h-4 w-4" data-testid="ihub-rep-hide" />{pick('ihub.hideProfit')}</label> : null}
        <BiButton text="ihub.openPrint" full icon={<Printer size={18} />} onClick={() => run(openPrintable(url('pdf')))} data-testid="ihub-rep-print" />
        <div className="grid grid-cols-2 gap-2">
          <BiButton text={{ en: 'Excel (.xlsx)', ur: 'Excel (.xlsx)' }} variant="secondary" full icon={<FileSpreadsheet size={18} />} onClick={() => run(downloadFile(url('xlsx'), 'bills.xlsx'))} data-testid="ihub-rep-xlsx" />
          <BiButton text={{ en: 'CSV', ur: 'CSV' }} variant="secondary" full icon={<FileSpreadsheet size={18} />} onClick={() => run(downloadFile(url('csv'), 'bills.csv'))} data-testid="ihub-rep-csv" />
        </div>
        {err ? <span className="text-sm font-bold text-payable" role="alert">{err}</span> : null}
      </div>
    </Sheet>
  )
}

