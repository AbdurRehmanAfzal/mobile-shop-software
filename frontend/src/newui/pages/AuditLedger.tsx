/** Shop audit → Master ledger in the new product (ADR-134), drawn from mock-up 22's "Complete shop
 *  master ledger": one account of the books (cash, a bank, the people's khata, stock, sales, an
 *  expense …, picked from the chart of accounts) for the audit's period — the balance before, every
 *  entry with its reference, date, type, person, details, debit, credit and the balance after it,
 *  the totals — filtered by type and searched; PDF / Excel of the same ledger.
 *
 *  Every figure is the books' own: `/reports/chart-of-accounts`, `/reports/general-ledger` and its
 *  download `/exports/general-ledger` (ADR-104: one accounting engine, the general ledger's closing
 *  equals the trial balance's line). The period is the audit's (`/shop-audit/period`). The app only
 *  filters the rows it was sent. Differences: the drawing mixes every document in one list with a
 *  profit column; the books keep one list per account (a sale's profit is in sales & purchases). */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, FileText, Search } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame } from './Audit'
import { Pill, Table, Tile, Wait, card, n, signed, type M } from '../auditKit'

interface Account { key: string; kind: string; name?: string; name_ur?: string; balance?: M }
interface Row { date: string | null; type: string; no: string; memo: string; party_name: string | null; debit: M; credit: M; balance: M; reversed: boolean }
interface Ledger { account: Account; opening: M; rows: Row[]; count: number; debit: M; credit: M; closing: M; truncated: boolean }
interface Resolved { date_from: string; date_to: string }
const KINDS = ['asset', 'liability', 'equity', 'income', 'expense', 'other'] as const
const LIMIT = 1000

export default function NewAuditLedger() {
  const { pick, ur } = useLang()
  const { query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const { data: per } = useGet<Resolved>(['audit-period', query], `/api/v1/shop-audit/period?${query}`)
  const { data: chart } = useGet<Account[]>(['gl-chart'], '/api/v1/reports/chart-of-accounts')
  const account = sp.get('account') ?? chart?.find((a) => a.kind === 'asset')?.key ?? null
  const setAccount = (k: string) => { const o = new URLSearchParams(sp); o.set('account', k); setSp(o, { replace: true }) }
  const q = account && per ? `account=${encodeURIComponent(account)}&date_from=${per.date_from}&date_to=${per.date_to}` : ''
  const { data: g } = useGet<Ledger>(['gl', account, per?.date_from, per?.date_to, LIMIT], q ? `/api/v1/reports/general-ledger?${q}&limit=${LIMIT}` : null)
  const [type, setType] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const name = (a: Account) => (a.key === 'receivable' || a.key === 'payable' ? pick(`books.line.${a.key}`) : a.name ? (ur ? a.name_ur || a.name : a.name) : pick(`books.line.${a.key}`))
  const typ = (t: string) => { const k = `gl.type.${t}`; const v = pick(k); return v === k ? t.replace(/_/g, ' ') : v }
  const types = useMemo(() => [...new Set((g?.rows ?? []).map((r) => r.type))], [g])
  const rows = useMemo(() => (g?.rows ?? []).filter((r) => (!type || r.type === type) && (!text.trim() || `${r.no} ${r.party_name ?? ''} ${r.memo}`.toLowerCase().includes(text.trim().toLowerCase()))), [g, type, text])
  const file = (f: 'pdf' | 'xlsx') => `/api/v1/exports/general-ledger?${q}&format=${f}${ur ? '&lang=ur' : ''}`
  const sel = 'px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 font-semibold text-xs'
  return (
    <AuditFrame section="ledger" testid="nled">
      {!chart || !per ? <Wait /> : (
        <section className={`p-5 space-y-4 ${card}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-extrabold text-base">{pick('nau.led.title')} {g ? <>(<span dir="ltr">{g.count}</span>)</> : null}</h3>
            <div className="flex flex-wrap gap-2 text-xs w-full sm:w-auto">
              <select value={account ?? ''} onChange={(e) => setAccount(e.target.value)} aria-label={pick('nau.led.account')} className={`${sel} max-w-full`} data-testid="nled-account">
                {KINDS.map((k) => { const list = chart.filter((a) => a.kind === k); return list.length ? <optgroup key={k} label={pick(`gl.kind.${k}`)}>{list.map((a) => <option key={a.key} value={a.key}>{name(a)}</option>)}</optgroup> : null })}
              </select>
              <select value={type} onChange={(e) => setType(e.target.value)} aria-label={pick('nau.led.type')} className={sel} data-testid="nled-type"><option value="">{pick('nau.led.allTypes')}</option>{types.map((t) => <option key={t} value={t}>{typ(t)}</option>)}</select>
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none sm:w-56"><Search className="w-3.5 h-3.5 text-slate-400" /><input value={text} onChange={(e) => setText(e.target.value)} placeholder={pick('nau.led.search')} className="min-w-0 flex-1 bg-transparent outline-none" data-testid="nled-search" /></label>
              {q ? <><button type="button" onClick={() => void openPrintable(file('pdf'))} className="px-3 py-1.5 rounded-lg bg-obsidian-950 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-extrabold flex items-center gap-1.5 cursor-pointer"><FileText className="w-3.5 h-3.5" />PDF</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadFile(file('xlsx'), 'general-ledger.xlsx') } finally { setBusy(false) } }} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><FileSpreadsheet className="w-3.5 h-3.5" />{pick('counter.excel')}</button></> : null}
            </div>
          </div>
          {!g ? <Wait /> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="nled-totals">
                <Tile label={pick('gl.opening')} value={withCur(signed(g.opening))} />
                <Tile tone="emerald" label={pick('gl.debit')} value={withCur(n(g.debit))} testid="nled-debit" />
                <Tile tone="rose" label={pick('gl.credit')} value={withCur(n(g.credit))} testid="nled-credit" />
                <Tile tone="dark" label={pick('gl.closing')} value={withCur(signed(g.closing))} testid="nled-closing" />
              </div>
              {g.truncated ? <p className="text-xs text-amber-700">{pick('gl.tooMany')}</p> : null}
              {!rows.length ? <p className="py-8 text-center text-sm text-slate-400">{pick('gl.none')}</p> : (
                <Table head={[pick('nau.led.ref'), pick('nau.led.type'), pick('nau.sa.customer'), pick('nau.led.details'), pick('gl.debit'), pick('gl.credit'), pick('nau.led.balance')]} testid="nled-rows">
                  {rows.map((r, i) => (
                    <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-obsidian-850 ${r.reversed ? 'opacity-60' : ''}`} data-testid="nled-row">
                      <td className="py-2.5 px-3"><div className="font-mono font-bold" dir="ltr">{r.no || '—'}</div><div className="text-[10px] text-slate-400" dir="ltr">{r.date ? fmtDate(r.date) : ''}</div></td>
                      <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-obsidian-800 font-bold text-[10px] whitespace-nowrap">{typ(r.type)}</span>{r.reversed ? <span className="ms-1"><Pill tone="slate">{pick('gl.deleted')}</Pill></span> : null}</td>
                      <td className="py-2.5 px-3 font-bold" dir="auto">{r.party_name ?? '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300" dir="auto">{r.memo || '—'}</td>
                      <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr">{Number(r.debit) ? n(r.debit) : '—'}</td>
                      <td className="py-2.5 px-3 text-end font-mono font-bold text-emerald-600 dark:text-[#A3E635]" dir="ltr">{Number(r.credit) ? n(r.credit) : '—'}</td>
                      <td className="py-2.5 px-3 text-end font-mono" dir="ltr">{signed(r.balance)}</td>
                    </tr>
                  ))}
                </Table>
              )}
              <p className="text-[11px] text-slate-500">{pick('nau.led.note')}</p>
            </>
          )}
        </section>
      )}
    </AuditFrame>
  )
}
