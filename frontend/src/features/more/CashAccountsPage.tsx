/** Cash & bank: the shop's money accounts, each with its own book.
 *
 *  Owner 2026-11-26 (ADR-142, from the new product's file 03): four figures on top (all the money,
 *  cash in hand, bank / online, this month's cash flow), the accounts as cards to choose from, and the
 *  chosen account's book on the page itself — its opening and current balance, a search, money in /
 *  money out / transfers, each line with its kind and the balance after it, opening its bill; money
 *  out recorded from the account (as an expense — there is no free cash entry, docs/38 §4), the
 *  book as CSV or printed, the opening balance set from the "below zero" hint with the amount that
 *  makes it zero. Moving money, the list of moves with undo, add / edit / delete an account are as
 *  before. Everything is the live server's: `/ledger/accounts`, `/ledger/accounts/{id}/book`,
 *  `/ledger/transfers`, `/reports/cash-flow`; the page only adds the account balances for its cards. */

import { AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpDown, ArrowUpRight, Banknote, Download, Landmark, Pencil, Plus, Printer, Smartphone, Trash2, Wallet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import RemoveSheet from '@/components/RemoveSheet'
import { BtnText, Chip, Empty, ErrorText, fmtDate, MoneyText, PageHeader, SearchBox, Sheet } from '@/components/ui'
import { api, ApiError, post } from '@/lib/api'
import RowActions from '@/components/RowActions'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useCashAccounts, useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import type { CashAccount } from '@/lib/types'

type Kind = CashAccount['kind']
interface BookRow { entry_id: string; group_id: string; at: string; document_type: string; document_id: string | null; memo: string | null; in: string; out: string; balance: string; reversed: boolean }
interface Book { opening_balance: string; closing_balance: string; rows: BookRow[] }
interface Flow { cash_account_id: string; cash_in: string; cash_out: string; transfers_in: string; transfers_out: string }
interface Category { id: string; key: string; name: string; name_ur: string | null }
type Filter = 'all' | 'in' | 'out' | 'transfer'

const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const signed = (v: number) => `${v < 0 ? '−' : ''}${rs(v)}`
const KIND_ICON: Record<string, LucideIcon> = { cash: Banknote, bank: Landmark, easypaisa: Smartphone, jazzcash: Smartphone, cheque: Wallet, remittance: Wallet }
const isTransfer = (r: BookRow) => r.document_type === 'transfer' || r.document_type === 'reversal:transfer'
const docLink = (r: BookRow) => (!r.document_id ? null : r.document_type === 'invoice' ? `/sales/${r.document_id}` : r.document_type === 'purchase' ? `/purchases/${r.document_id}` : r.document_type === 'repair' ? `/repairs/${r.document_id}` : r.document_type === 'expense' ? '/expenses' : null)

export default function CashAccountsPage() {
  const { ur, pick, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const role = useAuth((s) => s.me?.user.role)
  const { data } = useCashAccounts()
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [f, setF] = useState({ kind: 'easypaisa' as Kind, name: '', account_no: '', opening_balance: '' })
  const canSee = role === 'owner' || role === 'manager'
  const list = data ?? []
  // the chosen account: the one tapped, else the counter's cash
  const sel = list.find((a) => a.id === picked) ?? list.find((a) => a.is_default) ?? list[0] ?? null
  const { data: book } = useGet<Book>(['book', sel?.id], sel && canSee ? `/api/v1/ledger/accounts/${sel.id}/book` : null)
  const { data: flow } = useGet<Flow[]>(['cash-flow-month'], canSee ? '/api/v1/reports/cash-flow' : null)
  const create = useDocMutation<Record<string, unknown>, CashAccount>('POST', () => '/api/v1/ledger/accounts')
  const [editing, setEditing] = useState<CashAccount | null>(null)
  const [removing, setRemoving] = useState<CashAccount | null>(null)
  const [newName, setNewName] = useState('')
  const [newOpening, setNewOpening] = useState('')
  // owner 2026-11-05 (accounting audit): the opening balance can be set later too
  const rename = useDocMutation<{ id: string; name: string; opening_balance?: number }, CashAccount>('PATCH', (i) => `/api/v1/ledger/accounts/${i.id}`, (i) => ({ name: i.name, ...(i.opening_balance !== undefined ? { opening_balance: i.opening_balance } : {}) }))
  const edit = (a: CashAccount) => { setNewName(a.name); setNewOpening(String(Number(a.opening_balance ?? 0))); setEditing(a) }
  // a cheque account below zero is cheques given and not cleared yet — normal, no hint
  const below = list.filter((a) => Number(a.balance) < 0 && a.kind !== 'cheque' && a.kind !== 'remittance')
  const inv = useInvalidate()
  const label = (a: CashAccount) => (ur && a.name_ur ? a.name_ur : a.name)
  // Shop Audit P2-1: counter cash to the bank (or back) as one balanced move, never income or expense
  const [moving, setMoving] = useState(false)
  const [mv, setMv] = useState({ from: '', to: '', amount: '', note: '' })
  const move = useDocMutation<Record<string, unknown>, { id: string }>('POST', () => '/api/v1/ledger/transfers')
  const canMove = canSee
  const { data: transfers } = useGet<{ id: string; at: string; from_name: string | null; to_name: string | null; amount: string; memo: string | null; posted_by_name: string | null; reversed: boolean }[]>(['transfers'], canMove ? '/api/v1/ledger/transfers?limit=20' : null)
  const openMove = () => { setMv({ from: list.find((x) => x.is_default)?.id ?? list[0]?.id ?? '', to: list.find((x) => !x.is_default)?.id ?? '', amount: '', note: '' }); setMoving(true) }
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [paying, setPaying] = useState(false)

  // the cards: the account balances added up for the heading (the balances themselves are the server's)
  const cashBal = list.filter((a) => a.kind === 'cash').reduce((s, a) => s + num(a.balance), 0)
  const bankBal = list.filter((a) => a.kind !== 'cash').reduce((s, a) => s + num(a.balance), 0)
  const flowIn = (flow ?? []).reduce((s, x) => s + num(x.cash_in) - num(x.transfers_in), 0)
  const flowOut = (flow ?? []).reduce((s, x) => s + num(x.cash_out) - num(x.transfers_out), 0)

  const docName = (dt: string): string => { const base = dt.startsWith('reversal:') ? dt.slice(9) : dt; const k = `cashx.doc.${base}`; const v = pick(k); return v === k ? base.replace(/_/g, ' ') : v }
  const query = q.trim().toLowerCase()
  const rows = book?.rows ?? []
  const shown = [...rows].reverse().filter((r) => {
    if (filter === 'transfer' && !isTransfer(r)) return false
    if (filter === 'in' && (isTransfer(r) || !(num(r.in) > 0))) return false
    if (filter === 'out' && (isTransfer(r) || !(num(r.out) > 0))) return false
    return !query || (r.memo ?? '').toLowerCase().includes(query) || docName(r.document_type).toLowerCase().includes(query) || fmtDate(r.at).includes(query) || String(num(r.in) + num(r.out)).includes(query.replace(/[,\s]/g, ''))
  })
  function exportCsv() {
    if (!book || !sel) return
    const esc = (x: string) => `"${x.replace(/"/g, '""')}"`
    const head = [pick('cashx.colDate'), pick('cashx.colWhat'), pick('cashx.colType'), pick('cash.in'), pick('cash.out'), pick('cashx.colBalance')]
    const lines = [head, ...book.rows.map((r) => [fmtDate(r.at), r.memo ?? '', docName(r.document_type), r.in, r.out, r.balance])].map((l) => l.map((x) => esc(String(x))).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `cash-book-${sel.name}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const tiny = ur ? cls('sm') : 'text-xs font-semibold'
  const small = ur ? cls('sm') : 'text-[13px]'
  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${small}`
  const tool = `tap inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-ink ${tiny}`
  const figure = (label: string, value: string, sub: string, tone: string, testid: string, onClick?: () => void) => {
    const body = <><span className={`text-muted ${tiny}`}>{pick(label)}</span><span className={`num text-lg ${tone}`} dir="ltr">{value}</span><span className={`text-muted ${tiny}`}>{sub}</span></>
    return onClick
      ? <button key={testid} type="button" onClick={onClick} className="card tap flex flex-col gap-0.5 p-3 text-start" data-testid={testid}>{body}</button>
      : <div key={testid} className="card flex flex-col gap-0.5 p-3" data-testid={testid}>{body}</div>
  }
  const firstOf = (cash: boolean) => list.find((a) => (a.kind === 'cash') === cash)?.id ?? null

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="cash.title" help={<Help term="more.tile.cash" />} right={role === 'owner' ? <button type="button" aria-label="add" onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground"><Plus size={22} /><BtnText k={'cash.new'} /></button> : undefined} />

      {/* ADR-142: the money at a glance */}
      {list.length ? (
        <div className={`grid grid-cols-2 gap-2 ${canSee ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`} data-testid="cashx-figures">
          {figure('cashx.kpiAll', signed(cashBal + bankBal), pick('cashx.kpiAllSub'), cashBal + bankBal < 0 ? 'text-payable' : 'text-ink', 'cashx-f-all')}
          {figure('cashx.kpiCash', signed(cashBal), pick(cashBal < 0 ? 'cashx.deficit' : 'cashx.clickCash'), cashBal < 0 ? 'text-payable' : 'text-emerald-deep', 'cashx-f-cash', () => setPicked(firstOf(true)))}
          {figure('cashx.kpiBank', signed(bankBal), t('cashx.nAccounts', { n: list.filter((a) => a.kind !== 'cash').length }), bankBal < 0 ? 'text-payable' : 'text-ink', 'cashx-f-bank', () => setPicked(firstOf(false)))}
          {canSee && flow ? figure('cashx.kpiFlow', signed(flowIn - flowOut), t('cashx.flowSub', { inn: rs(flowIn), out: rs(flowOut) }), flowIn - flowOut < 0 ? 'text-payable' : 'text-emerald-deep', 'cashx-f-flow') : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:items-start">
        {/* the accounts */}
        <div className="flex min-w-0 flex-col gap-3">
          <BiLabel text="cashx.accounts" size="sm" tone="text-muted" bold />
          <div className="flex flex-col gap-2" data-testid="cashx-accounts">
            {list.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? Wallet
              const on = sel?.id === a.id
              return (
                <button key={a.id} type="button" aria-pressed={on} onClick={() => setPicked(a.id)} className={`card tap flex items-center gap-3 p-3 text-start ${on ? 'ring-2 ring-ink' : ''}`} data-testid="cashx-account">
                  <span className={`well h-11 w-11 shrink-0 rounded-2xl ${on ? 'bg-ink text-ground' : 'bg-ground text-ink'}`}><Icon size={20} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold text-ink" dir="auto">{label(a)}</span>
                    <span className={`text-muted ${tiny}`}>{pick(`cashx.kind.${a.kind}`)}{a.is_default ? ` · ${pick('cashx.counterGalla')}` : ''}{a.account_no ? <span dir="ltr"> · {a.account_no}</span> : null}</span>
                  </span>
                  <MoneyText value={a.balance} tone="ink" />
                </button>
              )
            })}
          </div>
          {below.map((a) => (
            <BelowZero key={a.id} a={a} name={label(a)} owner={role === 'owner'} onEdit={() => edit(a)} />
          ))}
          {canMove && list.length > 1 ? (
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1"><BiButton text="cash.move" icon={<ArrowLeftRight size={20} />} variant="secondary" full onClick={openMove} /></div>
              <Help term="accounts.move" size="sm" />
            </div>
          ) : null}
          {transfers?.length ? (
            <>
              <span className="flex items-center gap-1"><BiLabel text="cash.transfers" size="md" bold /><Help term="accounts.transfers" size="sm" /></span>
              <div className="card divide-y divide-line p-0" data-testid="transfers">
                {transfers.map((tr) => (
                  <div key={tr.id} className={`flex items-center gap-3 px-3 py-2 ${tr.reversed ? 'line-through opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" dir="auto">{tr.from_name} → {tr.to_name}</div>
                      <div className="text-xs text-muted"><span dir="ltr">{fmtDate(tr.at)}</span>{tr.posted_by_name ? ` · ${tr.posted_by_name}` : ''}{tr.memo ? ` · ${tr.memo}` : ''}</div>
                    </div>
                    <MoneyText value={tr.amount} tone="ink" size="sm" />
                    {/* ADR-090: a move made by mistake is undone (both accounts as before), kept crossed out */}
                    {!tr.reversed ? <RowActions warn="cashTransfer" reason title="del.undoTransfer" name={`${tr.from_name} → ${tr.to_name}`} canDelete onDelete={async (why) => { await post(`/api/v1/ledger/groups/${tr.id}/reverse`, { reason: why }); await inv() }} /> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* the chosen account's book */}
        {sel ? (
          <section className="flex min-w-0 flex-col gap-3" data-testid="cashx-book">
            <div className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1"><span className="truncate text-lg font-extrabold text-ink" dir="auto" data-testid="cashx-book-name">{t('cashx.bookOf', { name: label(sel) })}</span><Help term="accounts.book" size="sm" /></span>
                  {book ? <span className={`text-muted ${tiny}`}>{t('cashx.bookSub', { open: rs(book.opening_balance), n: book.rows.length })}</span> : null}
                </span>
                <span className="flex flex-col items-end">
                  <span className={`text-muted ${tiny}`}>{pick('cashx.current')}</span>
                  <span className={`num text-2xl ${num(sel.balance) < 0 ? 'text-payable' : 'text-ink'}`} dir="ltr" data-testid="cashx-book-balance">{signed(num(sel.balance))}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canSee ? <button type="button" onClick={() => setPaying(true)} className={tool} data-testid="cashx-manual"><ArrowUpDown size={15} />{pick('cashx.manual')}</button> : null}
                {canSee ? <button type="button" onClick={exportCsv} disabled={!book} className={`${tool} disabled:opacity-50`} data-testid="cashx-csv"><Download size={15} />{pick('cashx.exportCsv')}</button> : null}
                {canSee ? <button type="button" onClick={() => window.print()} className={tool}><Printer size={15} />{pick('cashx.printBook')}</button> : null}
                {role === 'owner' ? <button type="button" onClick={() => edit(sel)} className={tool} data-testid="cashx-edit"><Pencil size={15} />{pick('crud.editAccount')}</button> : null}
                {role === 'owner' && !sel.is_default ? <button type="button" onClick={() => setRemoving(sel)} className={`${tool} text-payable`}><Trash2 size={15} />{pick('crud.delete')}</button> : null}
              </div>
            </div>

            {!canSee ? <BiAlert text="cashx.noAccess" kind="info" /> : (
              <>
                <SearchBox value={q} onChange={setQ} placeholder="cashx.search" />
                <div className="flex flex-wrap gap-1.5" role="group">
                  {(['all', 'in', 'out', 'transfer'] as Filter[]).map((k) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={chip(filter === k)} data-testid={`cashx-flt-${k}`}>{pick(`cashx.f.${k}`)}</button>)}
                </div>
                {!book ? null : !rows.length ? <Empty text="cashx.noRows" /> : !shown.length ? <Empty text="cashx.noMatch" /> : (
                  <>
                    <div className="card divide-y divide-line p-0" data-testid="cashx-rows">
                      {shown.map((r) => {
                        const tr = isTransfer(r)
                        const inn = num(r.in) > 0
                        const link = docLink(r)
                        return (
                          <div key={r.entry_id} className={`flex items-center gap-3 px-3 py-2.5 ${r.reversed ? 'opacity-55' : ''}`} data-testid="cashx-row">
                            <span className={`well h-9 w-9 shrink-0 rounded-xl ${tr ? 'bg-ground text-ink' : inn ? 'bg-emerald-tint text-emerald-deep' : 'bg-payable-tint text-payable'}`}>{tr ? <ArrowLeftRight size={16} /> : inn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                            <button type="button" disabled={!link} onClick={() => link && nav(link)} className="tap min-w-0 flex-1 text-start disabled:cursor-default">
                              <div className={`truncate text-sm font-semibold text-ink ${r.reversed ? 'line-through' : ''}`} dir="auto">{r.memo || docName(r.document_type)}</div>
                              <div className={`flex flex-wrap items-center gap-x-1.5 text-muted ${tiny}`}><span dir="ltr">{fmtDate(r.at)}</span><Chip text={{ en: docName(r.document_type), ur: docName(r.document_type) }} tone="muted" /></div>
                            </button>
                            <div className="shrink-0 text-end">
                              <div className={`num text-base ${inn ? 'text-emerald-deep' : 'text-payable'}`} dir="ltr">{inn ? `+${rs(r.in)}` : `−${rs(r.out)}`}</div>
                              <div className={`num text-muted ${tiny}`} dir="ltr">= {signed(num(r.balance))}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <span className={`text-muted ${tiny}`}>{t('cashx.showing', { n: shown.length, total: rows.length })}</span>
                  </>
                )}
              </>
            )}
          </section>
        ) : null}
      </div>

      <Sheet open={moving} onClose={() => setMoving(false)} title="cash.move">
        <div className="flex flex-col gap-3">
          <BiLabel text="cash.moveHint" size="sm" tone="text-muted" />
          <span className="flex items-center gap-1"><BiLabel text="cash.from" size="md" tone="text-muted" /><Help term="accounts.from" size="sm" /></span>
          <div className="flex flex-wrap gap-2">
            {list.map((a) => (
              <button key={a.id} type="button" aria-pressed={mv.from === a.id} onClick={() => setMv({ ...mv, from: a.id, to: mv.to === a.id ? '' : mv.to })} className={`tap h-11 rounded-full border-2 px-3.5 text-sm font-bold ${mv.from === a.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{label(a)}</button>
            ))}
          </div>
          <span className="flex items-center gap-1"><BiLabel text="cash.to" size="md" tone="text-muted" /><Help term="accounts.to" size="sm" /></span>
          <div className="flex flex-wrap gap-2">
            {list.filter((a) => a.id !== mv.from).map((a) => (
              <button key={a.id} type="button" aria-pressed={mv.to === a.id} onClick={() => setMv({ ...mv, to: a.id })} className={`tap h-11 rounded-full border-2 px-3.5 text-sm font-bold ${mv.to === a.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{label(a)}</button>
            ))}
          </div>
          <BiInput label="cash.amount" type="number" inputMode="decimal" min={0} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} className="num text-2xl" autoFocus help={<Help term="accounts.moveAmount" size="sm" />} />
          <BiInput label="cash.note" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} help={<Help term="common.notes" size="sm" />} />
          <ErrorText error={move.error} />
          <BiButton text="cash.moveNow" full loading={move.isPending} disabled={!mv.from || !mv.to || Number(mv.amount) <= 0} onClick={async () => { await move.mutateAsync({ from_account_id: mv.from, to_account_id: mv.to, amount: Number(mv.amount), note: mv.note || null }); await inv('book', 'cash-flow-month'); setMoving(false) }} />
        </div>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="cash.new">
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="cash.kind" size="md" tone="text-muted" /><Help term="accounts.kind" size="sm" /></span>
          <BiSegmented<Kind> value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'cash', text: 'pay.cash' }, { value: 'bank', text: 'pay.bank' }, { value: 'easypaisa', text: 'pay.easypaisa' }, { value: 'jazzcash', text: 'pay.jazzcash' }]} />
          <BiInput label="cash.name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} help={<Help term="accounts.name" size="sm" />} />
          <BiInput label="cash.accountNo" value={f.account_no} onChange={(e) => setF({ ...f, account_no: e.target.value })} help={<Help term="accounts.accountNo" size="sm" />} />
          <BiInput label="cash.opening" type="number" inputMode="decimal" min={0} value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} help={<Help term="accounts.opening" size="sm" />} />
          <ErrorText error={create.error} />
          <BiButton text="common.save" full loading={create.isPending} disabled={!f.name} onClick={async () => { const a = await create.mutateAsync({ ...f, name_ur: null, account_no: f.account_no || null, opening_balance: Number(f.opening_balance || 0) }); if (a && 'id' in a) setPicked(a.id); setAdding(false) }} />
        </div>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="crud.editAccount">
        {editing ? (
          <div className="flex flex-col gap-3">
            <BiInput label="cash.name" value={newName} onChange={(e) => setNewName(e.target.value)} help={<Help term="accounts.name" size="sm" />} />
            <BiInput label="cash.opening" type="number" inputMode="decimal" min={0} value={newOpening} onChange={(e) => setNewOpening(e.target.value)} help={<Help term="accounts.opening" size="sm" />} data-testid="opening-input" />
            {/* ADR-142: the amount that brings a below-zero account to zero, one tap */}
            {Number(editing.balance) < 0 ? <button type="button" onClick={() => setNewOpening(String(Math.round(num(editing.opening_balance) - num(editing.balance))))} className={`tap self-start font-bold text-emerald-deep underline ${tiny}`} data-testid="cashx-fill">{t('cashx.fill', { n: rs(num(editing.opening_balance) - num(editing.balance)) })}</button> : null}
            <ErrorText error={rename.error} />
            <BiButton text="common.save" full loading={rename.isPending} disabled={!newName.trim() || Number(newOpening) < 0} onClick={async () => { await rename.mutateAsync({ id: editing.id, name: newName.trim(), opening_balance: Number(newOpening || 0) }); await inv(); setEditing(null) }} />
          </div>
        ) : null}
      </Sheet>

      {sel ? <ManualSheet open={paying} acc={sel} name={label(sel)} onClose={() => setPaying(false)} /> : null}

      <RemoveSheet
        warn="cashAccount"
        open={removing !== null}
        onClose={() => setRemoving(null)}
        name={removing ? label(removing) : ''}
        onConfirm={async () => {
          await api('DELETE', `/api/v1/ledger/accounts/${removing!.id}`)
          setPicked(null)
          await inv()
        }}
      />
    </div>
  )
}

/** an account below zero: why, and the way to set its opening balance */
function BelowZero({ a, name, owner, onEdit }: { a: CashAccount; name: string; owner: boolean; onEdit: () => void }) {
  const { pick, ur } = useLang()
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-payable-tint px-4 py-3 text-payable" data-testid="cash-below-zero" data-account={a.id}>
      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={ur ? 'text-sm leading-relaxed' : 'text-sm font-semibold'}>{pick('cash.belowZero').replace('{{name}}', name)}</span>
        {owner ? <BiButton text="cash.setOpening" size="md" variant="secondary" onClick={onEdit} /> : null}
      </div>
      <Help term="accounts.opening" size="sm" />
    </div>
  )
}

/** "Money in / out by hand": out is an expense paid from this account (its category); in comes with a
 *  bill or from a person, so it opens where that is recorded — never a free entry (docs/38 §4) */
function ManualSheet({ open, acc, name, onClose }: { open: boolean; acc: CashAccount; name: string; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const { data: cats } = useGet<Category[]>(['exp-cats'], open ? '/api/v1/expenses/categories' : null)
  const [dir, setDir] = useState<'in' | 'out'>('out')
  const [cat, setCat] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  async function save() {
    setBusy(true); setErr(''); setDone('')
    try {
      await api('POST', '/api/v1/expenses', { category_id: cat, amount: Number(amount), cash_account_id: acc.id, description: desc.trim() || null })
      await inv('cash', 'book', 'cash-flow-month', 'transfers', 'dashboard', 'day', 'accounts', 'expenses')
      setDone(t('cashx.paidOut', { n: rs(Number(amount)), name })); setAmount(''); setDesc('')
    } catch (e) { setErr(e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e)) } finally { setBusy(false) }
  }
  const small = ur ? cls('sm') : 'text-sm'
  return (
    <Sheet open={open} onClose={onClose} title={{ en: t('cashx.manualIn', { name }), ur: t('cashx.manualIn', { name }) }}>
      <div className="flex flex-col gap-3" data-testid="cashx-manual-sheet">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={dir === 'in'} onClick={() => setDir('in')} className={`tap min-h-12 rounded-2xl font-bold ${dir === 'in' ? 'bg-emerald text-white' : 'border border-line bg-surface text-ink'} ${small}`} data-testid="cashx-manual-in">+ {pick('cashx.in')}</button>
          <button type="button" aria-pressed={dir === 'out'} onClick={() => setDir('out')} className={`tap min-h-12 rounded-2xl font-bold ${dir === 'out' ? 'bg-payable text-white' : 'border border-line bg-surface text-ink'} ${small}`} data-testid="cashx-manual-out">− {pick('cashx.out')}</button>
        </div>
        {dir === 'in' ? (
          <>
            <BiLabel text="cashx.inHelp" size="sm" tone="text-muted" />
            <BiButton text="party.title" full onClick={() => nav('/parties')} data-testid="cashx-in-people" />
            <BiButton text="counter.sell" variant="secondary" full onClick={() => nav('/sale/new')} />
          </>
        ) : (
          <>
            <BiLabel text="cashx.outHelp" size="sm" tone="text-muted" />
            <label className="flex flex-col gap-1.5">
              <BiLabel text="cashx.pickCat" size="md" tone="text-muted" />
              <select value={cat} onChange={(e) => setCat(e.target.value)} className={`tap min-h-12 rounded-2xl border border-line bg-surface px-3 font-bold text-ink ${small}`} data-testid="cashx-manual-cat">
                <option value="">—</option>
                {(cats ?? []).map((c) => <option key={c.id} value={c.id}>{ur && c.name_ur ? c.name_ur : c.name}</option>)}
              </select>
            </label>
            <BiInput label="cash.amount" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" data-testid="cashx-manual-amount" />
            <BiInput label="cash.note" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} data-testid="cashx-manual-desc" />
            {err ? <BiAlert text={{ en: err, ur: err }} /> : null}
            {done ? <BiAlert text={{ en: done, ur: done }} kind="success" /> : null}
            <BiButton text="common.save" full loading={busy} disabled={!cat || !(Number(amount) > 0)} onClick={() => void save()} data-testid="cashx-manual-save" />
          </>
        )}
      </div>
    </Sheet>
  )
}
