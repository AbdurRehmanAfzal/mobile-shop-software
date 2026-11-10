/** Open balances / udhaar (owner brief 2026-11-10, ADR-058): lena hai / dena hai by phone (IMEI),
 *  customer, dealer and technician on one screen. A row opens the bills / jobs behind it with what
 *  was paid and what is left; Receive / Pay opens the usual payment form with the person, the
 *  direction and the bill already filled in. Owner / manager only (dealer payables are cost). */

import { ArrowDown, ArrowUp, Smartphone, User, Users, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Empty, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import PaymentForm, { type Allocation } from '@/features/payments/PaymentForm'
import { get } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import type { Party } from '@/lib/types'

type View = 'imei' | 'customer' | 'dealer' | 'technician'
type Dir = '' | 'get' | 'give'
interface Item { party_id: string; party_name: string; direction: 'get' | 'give'; amount: string; source: 'invoice' | 'purchase' | 'repair' | 'lab' | 'other'; source_id: string | null; no: string | null; date: string | null; total: string | null; paid: string | null; imeis: string[]; payments: { no: string | null; date: string | null; amount: string; unallocated?: boolean }[] }
interface Group { key: string; label: string; sub: string | null; get: string; give: string; parties: { id: string; name: string }[]; items: Item[] }
interface Data { totals: { get: string; give: string }; groups: Group[] }

const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })
const VIEWS: { v: View; icon: typeof Smartphone }[] = [
  { v: 'imei', icon: Smartphone },
  { v: 'customer', icon: User },
  { v: 'dealer', icon: Users },
  { v: 'technician', icon: Wrench },
]

export default function BalancesPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [view, setView] = useState<View>('imei')
  const [dir, setDir] = useState<Dir>('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Group | null>(null)
  const [paying, setPaying] = useState<{ item: Item; party: Party } | null>(null)
  const path = `/api/v1/balances?view=${view}${dir ? `&direction=${dir}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`
  const { data, isLoading } = useGet<Data>(['balances', view, dir, q], path)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const label = (g: Group) => (g.key === 'unallocated' ? pick('bal.unallocated') : g.label)

  async function payFor(item: Item) {
    const res = await fetchParty(item.party_id)
    if (res) setPaying({ item, party: res })
  }
  const [partyErr, setPartyErr] = useState(false)
  async function fetchParty(id: string): Promise<Party | null> {
    try {
      return await get<Party>(`/api/v1/parties/${id}`)
    } catch {
      setPartyErr(true)
      return null
    }
  }
  const allocationOf = (i: Item): Allocation | undefined =>
    (i.source === 'invoice' && i.direction === 'get') || (i.source === 'purchase' && i.direction === 'give')
      ? { document_type: i.source, document_id: i.source_id!, document_no: i.no ?? '', remaining: Number(i.amount) }
      : undefined
  const srcText = (i: Item) => `${pick(`bal.src.${i.source}`)}${i.no ? ` · ${i.no}` : ''}`

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="bal.title" help={<Help term="bal.page" />} />

      <div className="grid grid-cols-2 gap-2.5" data-testid="bal-totals">
        <button type="button" aria-pressed={dir === 'get'} onClick={() => setDir(dir === 'get' ? '' : 'get')} className={`tap flex flex-col rounded-3xl border-[3px] bg-khata px-4 py-3 text-start text-khata-fg ${dir === 'get' ? 'border-khata-fg' : 'border-transparent'}`}>
          <BiLabel text="bal.toGet" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr" data-testid="bal-total-get">{n(data?.totals.get)}</span>
        </button>
        <button type="button" aria-pressed={dir === 'give'} onClick={() => setDir(dir === 'give' ? '' : 'give')} className={`tap flex flex-col rounded-3xl border-[3px] bg-expense px-4 py-3 text-start text-expense-fg ${dir === 'give' ? 'border-expense-fg' : 'border-transparent'}`}>
          <BiLabel text="bal.toGive" size="sm" bold tone="text-current" />
          <span className="num text-2xl" dir="ltr" data-testid="bal-total-give">{n(data?.totals.give)}</span>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <div role="radiogroup" aria-label={pick('bal.view')} className="flex flex-1 rounded-2xl border border-line bg-surface p-1">
          {VIEWS.map(({ v, icon: Icon }) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => { setView(v); setOpen(null) }} className={`tap flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${view === v ? 'bg-ink text-ground' : 'text-muted'}`} data-testid={`bal-view-${v}`}>
              <Icon size={17} />
              {pick(`bal.views.${v}`)}
            </button>
          ))}
        </div>
        <Help term="bal.views" size="sm" />
      </div>
      <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="bal.search" /></div><Help term="common.search" size="sm" /></div>

      {isLoading ? <Loading /> : !data?.groups.length ? <Empty text="bal.none" /> : (
        <div className="card divide-y divide-line p-0" data-testid="bal-list">
          {data.groups.map((g) => (
            <button key={g.key} type="button" onClick={() => setOpen(g)} className="tap flex w-full items-center gap-3 px-4 py-3 text-start" data-testid={`bal-row-${g.key}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="num truncate text-[15px] font-bold" dir={view === 'imei' && g.key !== 'unallocated' ? 'ltr' : 'auto'}>{label(g)}</span>
                <span className={`truncate text-muted ${small}`}>{view === 'imei' ? [g.sub, g.parties.map((p) => p.name).join(', ')].filter(Boolean).join(' · ') : g.sub}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {Number(g.get) > 0 ? <span className="num text-receivable" dir="ltr"><span className={`${small} me-1`}>{pick('bal.get')}</span>{n(g.get)}</span> : null}
                {Number(g.give) > 0 ? <span className="num text-payable" dir="ltr"><span className={`${small} me-1`}>{pick('bal.give')}</span>{n(g.give)}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open && !paying} onClose={() => setOpen(null)} title={open ? { en: label(open), ur: label(open), roman: label(open) } : 'bal.title'}>
        {open ? (
          <div className="flex flex-col gap-3" data-testid="bal-detail">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-khata px-3 py-2 text-khata-fg"><BiLabel text="bal.toGet" size="sm" tone="text-current" /><div className="num text-xl" dir="ltr">{n(open.get)}</div></div>
              <div className="rounded-2xl bg-expense px-3 py-2 text-expense-fg"><BiLabel text="bal.toGive" size="sm" tone="text-current" /><div className="num text-xl" dir="ltr">{n(open.give)}</div></div>
            </div>
            {open.key === 'unallocated' ? <BiLabel text="bal.unallocatedHint" size="sm" tone="text-muted" /> : null}
            {open.items.map((i, k) => (
              <div key={k} className="card flex flex-col gap-2" data-testid="bal-item">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <button type="button" className="truncate text-start text-[15px] font-bold text-emerald-deep" onClick={() => nav(`/parties/${i.party_id}`)}>{i.party_name}</button>
                    <span className={`truncate text-muted ${small}`}>{srcText(i)}{i.date ? <> · <span className="num" dir="ltr">{fmtDate(i.date)}</span></> : null}</span>
                    {i.imeis.length ? <span className="num truncate text-xs text-muted" dir="ltr">{i.imeis.join(', ')}</span> : null}
                  </span>
                  <span className={`num shrink-0 text-lg ${i.direction === 'get' ? 'text-receivable' : 'text-payable'}`} dir="ltr">{n(i.amount)}</span>
                </div>
                {i.total ? <div className={`flex justify-between text-muted ${small}`}><span>{pick('bal.total')} <span className="num" dir="ltr">{n(i.total)}</span></span><span>{pick('bal.paid')} <span className="num" dir="ltr">{n(i.paid)}</span></span></div> : null}
                {i.payments.length ? (
                  <div className={`flex flex-col gap-0.5 rounded-xl bg-ground px-3 py-2 ${small}`}>
                    {i.payments.map((p, j) => <span key={j} className="flex justify-between"><span dir="ltr">{p.no ?? pick('bal.notOnBill')}{p.date ? ` · ${fmtDate(p.date)}` : ''}</span><span className="num" dir="ltr">{n(p.amount)}</span></span>)}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  {i.source_id && (i.source === 'invoice' || i.source === 'purchase' || i.source === 'repair') ? <button type="button" onClick={() => nav(i.source === 'invoice' ? `/sales/${i.source_id}` : i.source === 'purchase' ? `/purchases/${i.source_id}` : `/repairs/${i.source_id}`)} className="tap min-h-11 flex-1 rounded-xl border border-line font-bold">{pick('bal.open')}</button> : null}
                  <button type="button" onClick={() => void payFor(i)} className={`tap flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl font-bold ${i.direction === 'get' ? 'bg-emerald text-white' : 'border border-payable text-payable'}`} data-testid={i.direction === 'get' ? 'bal-receive' : 'bal-pay'}>
                    {i.direction === 'get' ? <ArrowDown size={18} /> : <ArrowUp size={18} />}{pick(i.direction === 'get' ? 'bal.receive' : 'bal.pay')}
                  </button>
                </div>
              </div>
            ))}
            {partyErr ? <BiLabel text="common.error" size="sm" tone="text-payable" /> : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!paying} onClose={() => setPaying(null)} title={paying?.item.direction === 'get' ? 'bal.receive' : 'bal.pay'}>
        {paying ? (
          <div className="flex flex-col gap-3">
            <div className={`rounded-2xl bg-ground px-4 py-2 ${small}`} data-testid="bal-settles">{pick('bal.settles')} {srcText(paying.item)} · <span className="num" dir="ltr">{n(paying.item.amount)}</span></div>
            <PaymentForm
              key={`${paying.item.party_id}-${paying.item.source_id}`}
              party={paying.party}
              direction={paying.item.direction === 'get' ? 'in' : 'out'}
              allocation={allocationOf(paying.item)}
              amount={Number(paying.item.amount)}
              noAllocation={!allocationOf(paying.item) && paying.item.source !== 'other'}
              onDone={() => { setPaying(null); setOpen(null); void inv('balances', 'parties', 'dashboard', 'sales', 'purchases', 'unit-money') }}
            />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
