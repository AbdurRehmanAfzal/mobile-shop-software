/** Reports → Balance sheet (docs/35 §5 item 1): the balance sheet and the trial balance as of the end
 *  of a day, both worked out by the server from the ledger. Nothing here can be edited. */

import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Loading } from '@/components/ui'
import { isoDay, withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'

interface Row { kind: string; key: string; group: string; name?: string; name_ur?: string; count?: number }
interface SheetRow extends Row { amount: string }
interface TrialRow extends Row { debit: string; credit: string }
interface Sheet { as_of: string; assets: SheetRow[]; liabilities: SheetRow[]; owner: SheetRow[]; total_assets: string; total_liabilities: string; total_owner: string; balanced: boolean }
interface Trial { as_of: string; rows: TrialRow[]; debit: string; credit: string; balanced: boolean }
type View = 'sheet' | 'trial'

const n = (v: string | number) => {
  const x = Number(v)
  const s = Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })
  return x < 0 ? `− ${s}` : s
}

export default function BooksTab() {
  const { pick, ur, cls } = useLang()
  const [view, setView] = useState<View>('sheet')
  const [asOf, setAsOf] = useState(isoDay(0))
  const { data: sheet } = useGet<Sheet>(['r-sheet', asOf], view === 'sheet' ? `/api/v1/reports/balance-sheet?as_of=${asOf}` : null)
  const { data: trial } = useGet<Trial>(['r-trial', asOf], view === 'trial' ? `/api/v1/reports/trial-balance?as_of=${asOf}` : null)
  const small = ur ? cls('sm') : 'text-sm'
  const label = (r: Row) => (r.name ? (ur ? r.name_ur || r.name : r.name) : pick(`books.line.${r.key}`))

  /** one line; the two people lines open the udhaar khata */
  const Line = ({ r, value }: { r: Row; value: string }) => {
    const people = r.key === 'receivable' || r.key === 'payable' ? r.count ?? 0 : null
    const body = (
      <>
        <span className={`flex min-w-0 flex-col ${ur ? cls('md') : 'text-[15px]'}`}>
          <span className="break-words">{label(r)}</span>
          {people != null ? <span className={`text-muted ${small}`}>{pick('books.people').replace('{{n}}', String(people))}</span> : null}
        </span>
        <span className="num text-base" dir="ltr">{n(value)}</span>
      </>
    )
    const row = 'flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0'
    return people != null ? <Link to="/khata" className={`tap ${row}`}>{body}</Link> : <div className={row}>{body}</div>
  }

  const Box = ({ title, help, rows, total }: { title: string; help: string; rows: SheetRow[]; total: string }) => (
    <section className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1"><BiLabel text={title} size="md" bold /><Help term={help} size="sm" /></span>
      <div className="card flex flex-col p-0">
        {rows.map((r) => <Line key={r.key} r={r} value={r.amount} />)}
        <div className="flex items-center justify-between gap-3 bg-ground/60 px-4 py-2.5">
          <BiLabel text="books.total" size="md" bold />
          <span className="num text-xl" dir="ltr">{withCur(n(total))}</span>
        </div>
      </div>
    </section>
  )

  const Check = ({ ok }: { ok: boolean }) => (
    <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ${ok ? 'bg-emerald-tint text-emerald-deep' : 'bg-payable-tint text-payable'}`} data-testid="books-check">
      {ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <BiLabel text={ok ? 'books.ok' : 'books.bad'} size="sm" bold tone="text-current" />
      <Help term="books.check" size="sm" />
    </div>
  )

  return (
    <div className="flex flex-col gap-3" data-testid="books">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiSegmented<View> value={view} onChange={setView} options={[{ value: 'sheet', text: 'books.sheet' }, { value: 'trial', text: 'books.trial' }]} /></div>
        <Help term={view === 'sheet' ? 'books.sheet' : 'books.trial'} size="sm" />
      </div>
      <label className="flex items-center gap-2">
        <span className="flex items-center gap-1"><BiLabel text="books.asOf" size="sm" bold /><Help term="books.asOf" size="sm" /></span>
        <input type="date" aria-label={pick('books.asOf')} value={asOf} max={isoDay(0)} onChange={(e) => e.target.value && setAsOf(e.target.value)} className="h-12 flex-1 rounded-2xl border border-line bg-surface px-3 font-bold" dir="ltr" />
      </label>

      {view === 'sheet' ? (
        !sheet ? <Loading /> : (
          <>
            <Box title="books.has" help="books.has" rows={sheet.assets} total={sheet.total_assets} />
            <Box title="books.owes" help="books.owes" rows={sheet.liabilities} total={sheet.total_liabilities} />
            <section className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1"><BiLabel text="books.owner" size="md" bold /><Help term="books.owner" size="sm" /></span>
              <div className="card flex flex-col p-0">
                {sheet.owner.map((r) => <Line key={r.key} r={r} value={r.amount} />)}
                <div className="flex items-center justify-between gap-3 bg-ground/60 px-4 py-2.5">
                  <span className="flex items-center gap-1"><BiLabel text="books.total" size="md" bold /><Help term="books.profit" size="sm" /></span>
                  <span className="num text-xl" dir="ltr">{withCur(n(sheet.total_owner))}</span>
                </div>
              </div>
            </section>
            <Check ok={sheet.balanced} />
          </>
        )
      ) : (
        !trial ? <Loading /> : (
          <>
            <div className="card flex flex-col p-0" data-testid="trial-rows">
              <div className={`grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line px-4 py-2 font-bold text-muted ${small}`}>
                <span>{pick('books.account')}</span><span className="w-[5.5rem] text-end">{pick('books.debit')}</span><span className="w-[5.5rem] text-end">{pick('books.credit')}</span>
              </div>
              {trial.rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className={`min-w-0 break-words ${ur ? cls('md') : 'text-[15px]'}`}>{label(r)}</span>
                  <span className="num w-[5.5rem] text-end" dir="ltr">{Number(r.debit) ? n(r.debit) : ''}</span>
                  <span className="num w-[5.5rem] text-end" dir="ltr">{Number(r.credit) ? n(r.credit) : ''}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-ground/60 px-4 py-2.5 font-bold">
                <BiLabel text="books.total" size="md" bold />
                <span className="num w-[5.5rem] text-end" dir="ltr">{n(trial.debit)}</span>
                <span className="num w-[5.5rem] text-end" dir="ltr">{n(trial.credit)}</span>
              </div>
            </div>
            <Check ok={trial.balanced} />
          </>
        )
      )}
      <BiLabel text="books.hint" size="sm" tone="text-muted" />
    </div>
  )
}
