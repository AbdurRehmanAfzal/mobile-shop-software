/** Chart of accounts and general ledger (owner 2026-11-18, ADR-104). With no account chosen: every
 *  account of the shop with its balance, grouped as on the balance sheet. With one chosen
 *  (`?account=`): each entry of it for the days picked — the balance before, debit / credit, the
 *  balance after every entry, the totals — and a download. All from the server's ledger. */

import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import DownloadButton from '@/components/DownloadButton'
import Help from '@/components/Help'
import { Chip, Empty, PageHeader, Pending, fmtDate } from '@/components/ui'
import PeriodPicker, { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'

type M = string
interface Account { key: string; kind: string; group: string; name?: string; name_ur?: string; count?: number; balance?: M }
interface Row { date: string | null; type: string; no: string; memo: string; party_name: string | null; debit: M; credit: M; balance: M; reversed: boolean }
interface Ledger { account: Account; date_from: string; date_to: string; opening: M; rows: Row[]; count: number; debit: M; credit: M; closing: M; truncated: boolean }

const KINDS = ['asset', 'liability', 'equity', 'income', 'expense', 'other'] as const
const n = (v: M | number) => { const x = Number(v); const s = Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 }); return x < 0 ? `− ${s}` : s }
const PAGE = 100

export default function GeneralLedgerPage() {
  const { pick, ur, cls } = useLang()
  const [sp, setSp] = useSearchParams()
  const account = sp.get('account')
  const [period, setPeriod] = useState<Period>(() => (sp.get('from') && sp.get('to') ? { from: sp.get('from')!, to: sp.get('to')! } : periodOf('month')))
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { setLimit(PAGE) }, [account, period.from, period.to])
  const { data: chart, error: chartErr, refetch: chartAgain } = useGet<Account[]>(['gl-chart'], '/api/v1/reports/chart-of-accounts')
  const q = account ? `account=${encodeURIComponent(account)}&${periodQuery(period)}` : ''
  const { data: g, error, refetch } = useGet<Ledger>(['gl', account, period.from, period.to, limit], account ? `/api/v1/reports/general-ledger?${q}&limit=${limit}` : null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const name = (a: Account) => (a.key === 'receivable' || a.key === 'payable' ? pick(`books.line.${a.key}`) : a.name ? (ur ? a.name_ur || a.name : a.name) : pick(`books.line.${a.key}`))
  const typ = (t: string) => { const k = `gl.type.${t}`; const v = pick(k); return v === k ? t.replace(/_/g, ' ') : v }
  const open = (key: string | null) => { const next = new URLSearchParams(sp); if (key) next.set('account', key); else next.delete('account'); setSp(next) }

  if (!account) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title="gl.chart" help={<Help term="gl.page" />} />
        <BiLabel text="gl.chartHint" size="sm" tone="text-muted" />
        {!chart ? <Pending error={chartErr} retry={chartAgain} /> : KINDS.map((k) => {
          const rows = chart.filter((a) => a.kind === k)
          if (!rows.length) return null
          return (
            <section key={k} className="flex flex-col gap-1.5" data-testid={`chart-${k}`}>
              <BiLabel text={`gl.kind.${k}`} size="sm" bold tone="text-muted" />
              <div className="card flex flex-col divide-y divide-line p-0">
                {rows.map((a) => (
                  <button key={a.key} type="button" onClick={() => open(a.key)} className="tap flex min-h-12 items-center gap-3 px-4 py-2.5 text-start" data-testid={`chart-row-${a.key.split(':')[0]}`}>
                    <span className={`min-w-0 flex-1 break-words ${ur ? cls('md') : 'text-[15px] font-semibold'}`}>{name(a)}</span>
                    <span className="num shrink-0 text-base" dir="ltr">{n(a.balance ?? 0)}</span>
                    <ChevronRight size={16} className="shrink-0 text-muted rtl:rotate-180" />
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="general-ledger">
      <PageHeader title="gl.title" help={<Help term="gl.page" />} right={<DownloadButton path={`/api/v1/exports/general-ledger?${q}`} name={`general-ledger-${account.split(':')[0]}`} />} />
      <div className="flex items-center justify-between gap-2">
        <span className={`min-w-0 truncate ${ur ? cls('lg') : 'text-lg font-extrabold'}`} data-testid="gl-account">{g ? (g.account.key === 'receivable' || g.account.key === 'payable' ? pick('gl.people') : name(g.account)) : ''}</span>
        <BiButton text="gl.change" size="md" variant="secondary" onClick={() => open(null)} data-testid="gl-change" />
      </div>
      <PeriodPicker value={period} onChange={setPeriod} size="sm" />
      {!g ? <Pending error={error} retry={refetch} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="gl-totals">
            {([['gl.opening', g.opening], ['gl.debit', g.debit], ['gl.credit', g.credit], ['gl.closing', g.closing]] as const).map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col rounded-2xl bg-surface px-3 py-2.5 shadow-sm ring-1 ring-line">
                <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(k)}</span>
                <span className="num truncate text-lg font-extrabold leading-tight" dir="ltr">{withCur(n(v))}</span>
              </div>
            ))}
          </div>
          {g.truncated ? <span className={`rounded-2xl bg-gold/15 px-3 py-2 text-gold-text ${small}`}>{pick('gl.tooMany')}</span> : null}
          {!g.rows.length ? <Empty text="gl.none" /> : (
            <div className="card flex flex-col divide-y divide-line p-0" data-testid="gl-rows">
              {g.rows.map((r, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${r.reversed ? 'opacity-60' : ''}`} data-testid="gl-row">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className={ur ? cls('md') : 'text-[15px] font-bold'}>{typ(r.type)}</span>
                      {r.no ? <span className="num text-sm text-muted" dir="ltr">{r.no}</span> : null}
                      {r.reversed ? <Chip text="gl.deleted" tone="muted" /> : null}
                    </span>
                    <span className={`text-muted ${small}`}><span className="num" dir="ltr">{r.date ? fmtDate(r.date) : ''}</span>{r.party_name ? ` · ${r.party_name}` : ''}{r.memo ? ` · ${r.memo}` : ''}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="num text-[15px] font-bold" dir="ltr">{Number(r.debit) ? `${pick('gl.debit')} ${n(r.debit)}` : `${pick('gl.credit')} ${n(r.credit)}`}</span>
                    <span className={`num text-muted ${small}`} dir="ltr">{n(r.balance)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className={`text-muted ${small}`} data-testid="gl-count">{pick('gl.rows').replace('{{n}}', String(g.rows.length)).replace('{{t}}', String(g.count))}</span>
            {g.rows.length < g.count ? <BiButton text="gl.more" size="md" variant="secondary" onClick={() => setLimit(limit + PAGE)} data-testid="gl-more" /> : null}
          </div>
        </>
      )}
    </div>
  )
}
