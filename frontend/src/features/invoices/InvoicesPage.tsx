/** Every bill in one place (owner, 2026-10-27: "shopkeeper koi bhi invoice dekh sake"): sales,
 *  purchases, returns and repairs. Find one by bill number, the person's name or phone, or a phone's
 *  IMEI (Scan), for any period, and filter by what is still due. Tapping a bill opens its own page
 *  (print is there). */

import { PackagePlus, Tag, Undo2, Wrench, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, fmtDate, List, Loading, MoneyText, PageHeader, Row, SearchBox } from '@/components/ui'
import PeriodPicker, { periodOf, periodQuery, type Period } from '@/features/counter/PeriodPicker'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useGet } from '@/lib/queries'

type Kind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'repair'
type State = 'paid' | 'due' | 'open' | 'returned' | 'void'
export interface DocRow {
  kind: Kind
  id: string
  no: string
  date: string
  party_name: string | null
  party_phone: string | null
  items: string | null
  total: string
  paid: string
  due: string
  state: State
  ref_id: string | null
  ref_no: string | null
  created_by_name: string | null
}
interface DocList { rows: DocRow[]; to_get: string; to_give: string }

const KIND: Record<Kind, { Icon: LucideIcon; tone: string; label: string; open: (r: DocRow) => string }> = {
  sale: { Icon: Tag, tone: 'bg-sell text-sell-fg', label: 'inv.kind.sale', open: (r) => `/sales/${r.id}` },
  purchase: { Icon: PackagePlus, tone: 'bg-buy text-buy-fg', label: 'inv.kind.purchase', open: (r) => `/purchases/${r.id}` },
  sale_return: { Icon: Undo2, tone: 'bg-ret text-ret-fg', label: 'inv.kind.sale_return', open: (r) => `/sales/${r.ref_id}` },
  purchase_return: { Icon: Undo2, tone: 'bg-ret text-ret-fg', label: 'inv.kind.purchase_return', open: (r) => `/purchases/${r.ref_id}` },
  repair: { Icon: Wrench, tone: 'bg-repair text-repair-fg', label: 'inv.kind.repair', open: (r) => `/repairs/${r.id}` },
}
const STATE_TONE: Record<State, 'ok' | 'warn' | 'bad' | 'muted' | 'ink'> = { paid: 'ok', due: 'warn', open: 'ink', returned: 'muted', void: 'muted' }

export default function InvoicesPage() {
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState<Period>(periodOf('month'))
  const [kind, setKind] = useState<'all' | 'sale' | 'purchase' | 'return' | 'repair'>('all')
  const [state, setState] = useState<'all' | State>('all')

  // a search looks through every date; otherwise the chosen period
  const params = new URLSearchParams()
  if (q.trim()) params.set('q', q.trim())
  else for (const [k, v] of new URLSearchParams(periodQuery(period))) params.set(k, v)
  if (kind !== 'all' && kind !== 'return') params.set('kind', kind)
  if (state !== 'all') params.set('state', state)
  params.set('limit', '200')
  const { data, isLoading } = useGet<DocList>(['invoices', params.toString()], `/api/v1/invoices?${params}`)
  const rows = (data?.rows ?? []).filter((r) => kind !== 'return' || r.kind === 'sale_return' || r.kind === 'purchase_return')

  const chip = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const kinds = [
    { v: 'all', t: 'common.all' },
    { v: 'sale', t: 'inv.kinds.sale' },
    ...(canCost ? [{ v: 'purchase', t: 'inv.kinds.purchase' }] : []),
    { v: 'return', t: 'inv.kinds.return' },
    { v: 'repair', t: 'inv.kinds.repair' },
  ] as const
  const states = [
    { v: 'all', t: 'common.all' },
    { v: 'due', t: 'inv.state.due' },
    { v: 'paid', t: 'inv.state.paid' },
    { v: 'open', t: 'inv.state.open' },
    { v: 'returned', t: 'inv.state.returned' },
    { v: 'void', t: 'inv.state.void' },
  ] as const

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="inv.title" />
      <BiLabel text="inv.hint" size="sm" tone="text-muted" />
      <SearchBox value={q} onChange={setQ} placeholder="inv.search" scan />
      {q.trim() ? <BiLabel text="inv.allDates" size="sm" tone="text-muted" /> : <PeriodPicker value={period} onChange={setPeriod} size="sm" />}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick('inv.type')}>
        {kinds.map((k) => (
          <button key={k.v} type="button" aria-pressed={kind === k.v} onClick={() => setKind(k.v as typeof kind)} className={chip(kind === k.v)}>{pick(k.t)}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick('inv.stateLabel')}>
        {states.map((s) => (
          <button key={s.v} type="button" aria-pressed={state === s.v} onClick={() => setState(s.v)} className={chip(state === s.v)}>{pick(s.t)}</button>
        ))}
      </div>

      {data && (Number(data.to_get) > 0 || Number(data.to_give) > 0) ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="card flex flex-col gap-0.5 p-3">
            <BiLabel text="inv.toGet" size="sm" tone="text-muted" />
            <span className="num text-lg text-receivable" dir="ltr">{formatMoney(data.to_get)}</span>
          </div>
          <div className="card flex flex-col gap-0.5 p-3">
            <BiLabel text="inv.toGive" size="sm" tone="text-muted" />
            <span className="num text-lg text-payable" dir="ltr">{formatMoney(data.to_give)}</span>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <Empty text="inv.none" />
      ) : (
        <>
          <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
            <span className="num">{rows.length}</span> {pick('inv.count')}
          </span>
          <List>
            {rows.map((r) => {
              const k = KIND[r.kind]
              return (
                <Row
                  key={`${r.kind}-${r.id}`}
                  icon={<k.Icon size={20} />}
                  iconTone={k.tone}
                  title={r.party_name ?? pick(r.kind === 'repair' ? 'inv.noName' : 'sale.cashCustomer')}
                  sub={
                    <span className="flex flex-wrap items-center gap-x-1.5">
                      <span>{pick(k.label)}</span>
                      <span dir="ltr" className="num">{r.no}</span>
                      <span>·</span>
                      <span dir="ltr">{fmtDate(r.date)}</span>
                      {r.items ? <span className="truncate">· {r.items}</span> : null}
                      {r.ref_no ? <span dir="ltr">({pick('inv.ofBill')} {r.ref_no})</span> : null}
                    </span>
                  }
                  right={
                    <div className="flex flex-col items-end gap-1">
                      <MoneyText value={r.total} tone="ink" />
                      {Number(r.due) > 0 ? (
                        <span className="flex items-center gap-1">
                          <Chip text={r.kind === 'purchase' ? 'inv.state.toPay' : 'inv.state.due'} tone="warn" />
                          <MoneyText value={r.due} size="sm" />
                        </span>
                      ) : (
                        <Chip text={`inv.state.${r.state}`} tone={STATE_TONE[r.state]} />
                      )}
                    </div>
                  }
                  onClick={() => nav(k.open(r))}
                />
              )
            })}
          </List>
        </>
      )}
    </div>
  )
}
