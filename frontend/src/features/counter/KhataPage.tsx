/** Udhaar khata: the two totals ("I will get" / "I have to give") are also the filters, then the
 *  people with a balance, and two big buttons for money received / paid. `?f=get|give` preselects. */

import DownloadButton from '@/components/DownloadButton'
import { ArrowDown, ArrowUp, BellRing, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { BtnText, Empty, Loading, PageHeader, SearchBox, Sheet } from '@/components/ui'
import PartyForm from '@/features/parties/PartyForm'
import PaymentForm from '@/features/payments/PaymentForm'
import { useModules } from '@/lib/modules'
import { useGet, useParties } from '@/lib/queries'
import type { Party } from '@/lib/types'

type Filter = 'all' | 'get' | 'give'
const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function KhataPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const has = useModules()
  const [params, setParams] = useSearchParams()
  const f = (params.get('f') as Filter) || 'all'
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)
  const [who, setWho] = useState<Party | null>(null)
  const { data: dash } = useGet<{ receivable: string; payable: string }>(['dashboard'], '/api/v1/reports/dashboard')
  const { data, isLoading } = useParties({ q: q || undefined, with_balance: q ? undefined : true })
  const rows = (data ?? []).filter((p) => {
    const b = Number(p.balance)
    return f === 'all' || (f === 'get' ? b > 0 : b < 0)
  })
  const getCount = (data ?? []).filter((p) => Number(p.balance) > 0).length
  const giveCount = (data ?? []).filter((p) => Number(p.balance) < 0).length
  const setF = (x: Filter) => setParams(x === 'all' ? {} : { f: x }, { replace: true })
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="counter.khataTitle"
        help={<Help term="khata" />}
        right={
          <div className="flex gap-2">
            <DownloadButton path="/api/v1/exports/khata" name="udhaar-khata" />
            {has('notifications') ? <button type="button" aria-label={pick('remind.title')} onClick={() => nav('/khata/reminders')} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink">
              <BellRing size={20} strokeWidth={1.75} />
              <BtnText k="remind.short" />
            </button> : null}
            <button type="button" onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-ink px-2 py-1 text-ground">
              <Plus size={20} strokeWidth={2.2} />
              <BtnText k="counter.newPerson" />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" aria-pressed={f === 'get'} onClick={() => setF(f === 'get' ? 'all' : 'get')} className={`tap flex flex-col rounded-3xl border-[3px] bg-khata px-4 py-3 text-start text-khata-fg ${f === 'get' ? 'border-khata-fg' : 'border-transparent'}`}>
          <BiLabel text="counter.toGet" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr">{n(dash?.receivable)}</span>
          {!q ? <span className={small}><span className="num">{getCount}</span> {pick('counter.people')}</span> : null}
        </button>
        <button type="button" aria-pressed={f === 'give'} onClick={() => setF(f === 'give' ? 'all' : 'give')} className={`tap flex flex-col rounded-3xl border-[3px] bg-expense px-4 py-3 text-start text-expense-fg ${f === 'give' ? 'border-expense-fg' : 'border-transparent'}`}>
          <BiLabel text="counter.toGive" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr">{n(dash?.payable)}</span>
          {!q ? <span className={small}><span className="num">{giveCount}</span> {pick('counter.people')}</span> : null}
        </button>
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="party.searchPlaceholder" />

      {isLoading ? <Loading /> : !rows.length ? <Empty text="counter.nobody" /> : (
        <div className="card divide-y divide-line p-0">
          {rows.map((p) => {
            const b = Number(p.balance)
            const tone = b > 0 ? 'text-receivable' : b < 0 ? 'text-payable' : 'text-muted'
            return (
              <button key={p.id} type="button" onClick={() => nav(`/parties/${p.id}`)} className="tap flex w-full items-center gap-3 px-4 py-3 text-start">
                <span className={`well h-11 w-11 shrink-0 rounded-full text-base font-extrabold ${b > 0 ? 'bg-khata text-khata-fg' : b < 0 ? 'bg-expense text-expense-fg' : 'bg-ground text-muted'}`}>{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{p.name}</span>
                  <span className="text-xs text-muted" dir="ltr">{p.phone}</span>
                </span>
                {b !== 0 ? (
                  <span className="flex flex-col items-end">
                    <span className={`num text-lg ${tone}`} dir="ltr">{n(b)}</span>
                    <span className={`${tone} ${small}`}>{pick(b > 0 ? 'counter.owesMe' : 'counter.iOwe')}</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <div className="sticky bottom-24 grid grid-cols-2 gap-2.5 lg:bottom-4">
        <button type="button" onClick={() => { setWho(null); setPaying('in') }} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald text-white shadow-cta">
          <ArrowDown size={20} strokeWidth={2.2} />
          <span className={ur ? cls('md') : 'text-base font-bold'}>{pick('counter.gotMoney')}</span>
        </button>
        <button type="button" onClick={() => { setWho(null); setPaying('out') }} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-ink">
          <ArrowUp size={20} strokeWidth={2.2} className="text-payable" />
          <span className={ur ? cls('md') : 'text-base font-bold'}>{pick('counter.gaveMoney')}</span>
        </button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="counter.newPerson">
        <PartyForm onDone={(p) => { setAdding(false); nav(`/parties/${p.id}`) }} />
      </Sheet>
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying === 'out' ? 'counter.gaveMoney' : 'counter.gotMoney'}>
        {paying ? (
          <div className="flex flex-col gap-3">
            <PartyPicker value={who} onChange={setWho} label="party.name" />
            {who ? <PaymentForm key={who.id} party={who} direction={paying} onDone={() => setPaying(null)} /> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
