/** Amanat (loans): phones given to another shop to show or sell. Owner 2026-10-29: brought onto the
 *  v2 look (violet = stock): a summary card, one card per phone with the shop and a Call button,
 *  "give on amanat" from here (not only from a device page), confirm sheets, big buttons with icons. */

import { Check, HandCoins, Phone, Plus, RotateCcw, Smartphone, Store } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import PartyPicker from '@/components/PartyPicker'
import { Chip, ErrorText, List, Loading, PageHeader, SearchBox, Sheet, fmtDate } from '@/components/ui'
import { DeviceRow } from '@/features/stock/StockPage'
import { isoDay } from '@/lib/format'
import { useDevices, useDocMutation, useInvalidate, useLoans } from '@/lib/queries'
import type { Device, Loan, Party } from '@/lib/types'

type View = 'out' | 'returned' | 'sold'
const VIEWS: View[] = ['out', 'returned', 'sold']
const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime()) / 86_400_000))

export default function LoansPage() {
  const nav = useNavigate()
  const inv = useInvalidate()
  const { pick, ur, cls } = useLang()
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.includes(params.get('view') as View) ? params.get('view') : 'out') as View
  const { data, isLoading } = useLoans({ status: view })
  const { data: out } = useLoans({ status: 'out' })
  const [returning, setReturning] = useState<Loan | null>(null)
  const [selling, setSelling] = useState<Loan | null>(null)
  const [price, setPrice] = useState('')
  const [paid, setPaid] = useState('')
  const [giving, setGiving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const ret = useDocMutation<{ id: string }, Loan>('POST', (i) => `/api/v1/loans/${i.id}/return`, () => ({}))
  const sell = useDocMutation<{ id: string; price: number; paid: number }, Loan>('POST', (i) => `/api/v1/loans/${i.id}/sell`, (i) => ({ price: i.price, paid: i.paid }))
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const overdue = out?.filter((l) => l.overdue).length ?? 0

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="loan.title" />
      <div className="flex flex-col gap-3 rounded-3xl bg-stockt p-4 text-stockt-fg">
        <div className="flex items-center gap-3">
          <span className="well h-12 w-12 shrink-0 rounded-2xl bg-white/15 text-current"><Store size={22} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="num text-[28px] leading-none" dir="ltr">{out?.length ?? 0}</span>
            <BiLabel text="loan.outCount" size="sm" tone="text-current" className="opacity-80" />
          </span>
          {overdue ? <Chip text={{ en: `${overdue} ${pick('loan.overdue')}`, ur: `${overdue} ${pick('loan.overdue')}`, roman: `${overdue} ${pick('loan.overdue')}` }} tone="bad" /> : null}
        </div>
        <BiLabel text="counter.loanHint" size="sm" tone="text-current" className="opacity-80" />
      </div>
      <BiButton text="loan.give" icon={<Plus size={22} />} full onClick={() => { setDone(null); setGiving(true) }} />
      {done ? <BiAlert text={done} kind="success" /> : null}

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setParams(v === 'out' ? {} : { view: v }, { replace: true })} className={`tap h-10 rounded-full border-2 px-3.5 font-bold ${view === v ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`}>
            {pick(`loan.${v}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <span className="well h-14 w-14 rounded-2xl bg-stockt text-stockt-fg"><RotateCcw size={26} /></span>
          <BiLabel text="loan.none" size="md" align="center" tone="text-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((l) => (
            <article key={l.id} className="card flex flex-col gap-3">
              <button type="button" onClick={() => nav(`/stock/${l.device_id}`)} className="tap flex items-center gap-3 text-start">
                <span className={`well h-11 w-11 shrink-0 rounded-2xl ${l.overdue ? 'bg-payable-tint text-payable' : 'bg-stockt text-stockt-fg'}`}><Smartphone size={20} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{l.device_label}</span>
                  <span className={`text-muted ${small}`} dir="ltr">{l.imei1}</span>
                </span>
                {l.status === 'out' ? (
                  l.overdue ? <Chip text="loan.overdue" tone="bad" /> : <Chip text={{ en: pick('loan.since').replace('{{n}}', String(daysSince(l.out_at))), ur: pick('loan.since').replace('{{n}}', String(daysSince(l.out_at))), roman: pick('loan.since').replace('{{n}}', String(daysSince(l.out_at))) }} tone="muted" />
                ) : <Chip text={l.status === 'sold' ? 'loan.sold' : 'loan.returned'} tone={l.status === 'sold' ? 'ink' : 'ok'} />}
              </button>
              <div className="flex items-center gap-3 rounded-2xl bg-ground px-3 py-2">
                <Store size={18} className="shrink-0 text-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{l.party_name}</span>
                  <span className={`text-muted ${small}`}>
                    <span dir="ltr">{fmtDate(l.out_at)}</span>
                    {l.expected_back_at && l.status === 'out' ? <> · {pick('loan.backBy')} <span dir="ltr">{fmtDate(l.expected_back_at)}</span></> : null}
                    {l.settled_at ? <> · <span dir="ltr">{fmtDate(l.settled_at)}</span></> : null}
                  </span>
                </span>
                <button type="button" onClick={() => nav(`/parties/${l.party_id}`)} className={`tap flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold ${small}`}><Phone size={15} />{pick('loan.shopPage')}</button>
              </div>
              {l.status === 'out' ? (
                <div className="grid grid-cols-2 gap-2">
                  <BiButton text="loan.markReturned" size="sm" variant="secondary" icon={<RotateCcw size={18} />} onClick={() => { ret.reset(); setReturning(l) }} />
                  <BiButton text="loan.sellToShop" size="sm" icon={<HandCoins size={18} />} onClick={() => { sell.reset(); setSelling(l); setPrice(''); setPaid('') }} />
                </div>
              ) : null}
              {l.status === 'sold' && l.invoice_id ? <BiButton text="exchange.viewBill" size="sm" variant="ghost" full onClick={() => nav(`/sales/${l.invoice_id}`)} /> : null}
            </article>
          ))}
        </div>
      )}

      <Sheet open={returning !== null} onClose={() => setReturning(null)} title="loan.markReturned">
        {returning ? (
          <div className="flex flex-col gap-3">
            <div className="card flex items-center gap-3">
              <span className="well h-11 w-11 shrink-0 bg-stockt text-stockt-fg"><Smartphone size={20} /></span>
              <span className="flex min-w-0 flex-col"><span className="font-bold">{returning.device_label}</span><span className="text-xs text-muted">{returning.party_name}</span></span>
            </div>
            <BiLabel text="loan.confirmBack" size="md" />
            <ErrorText error={ret.error} />
            <BiButton text="loan.yesBack" icon={<Check size={22} />} full loading={ret.isPending} onClick={async () => { await ret.mutateAsync({ id: returning.id }); setReturning(null); setDone('loan.backDone'); inv('loans', 'devices', 'dashboard') }} />
          </div>
        ) : null}
      </Sheet>

      <Sheet open={selling !== null} onClose={() => setSelling(null)} title="loan.sellToShop">
        {selling ? (
          <div className="flex flex-col gap-3">
            <div className="card flex items-center gap-3">
              <span className="well h-11 w-11 shrink-0 bg-stockt text-stockt-fg"><Smartphone size={20} /></span>
              <span className="flex min-w-0 flex-col"><span className="font-bold">{selling.device_label}</span><span className="text-xs text-muted">{selling.party_name}</span></span>
            </div>
            <BiInput label="loan.price" type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="num text-2xl" autoFocus />
            <BiInput label="sale.paidNow" type="number" inputMode="numeric" min={0} max={Number(price || 0)} value={paid} onChange={(e) => setPaid(e.target.value)} className="num" hint="loan.restOnKhata" />
            <div className="flex items-center justify-between rounded-2xl bg-khata px-4 py-3 text-khata-fg">
              <BiLabel text="loan.onTheirKhata" size="md" bold tone="text-current" />
              <span className="num text-2xl" dir="ltr">{n(Number(price || 0) - Number(paid || 0))}</span>
            </div>
            <ErrorText error={sell.error} />
            <BiButton text="common.confirm" icon={<Check size={22} />} full loading={sell.isPending} disabled={!price || Number(paid || 0) > Number(price)} onClick={async () => { await sell.mutateAsync({ id: selling.id, price: Number(price), paid: Number(paid || 0) }); setSelling(null); setDone('loan.soldDone'); inv('loans', 'devices', 'parties', 'dashboard') }} />
          </div>
        ) : null}
      </Sheet>

      <GiveSheet open={giving} onClose={() => setGiving(false)} onDone={() => { setGiving(false); setDone('loan.givenDone'); inv('loans', 'devices', 'dashboard') }} />
    </div>
  )
}

/** Give a phone on amanat: which phone (from stock) → which shop → back in how many days. */
function GiveSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { pick, ur, cls } = useLang()
  const [dev, setDev] = useState<Device | null>(null)
  const [q, setQ] = useState('')
  const [shop, setShop] = useState<Party | null>(null)
  const [days, setDays] = useState<number | null>(7)
  const [notes, setNotes] = useState('')
  const { data: stock } = useDevices({ status: 'in_stock', q: q || undefined })
  const m = useDocMutation<{ device_id: string; party_id: string; expected_back_at?: string; notes?: string }, Loan>('POST', () => '/api/v1/loans')
  const reset = () => { setDev(null); setQ(''); setShop(null); setDays(7); setNotes(''); m.reset() }
  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="loan.give">
      <div className="flex flex-col gap-3">
        <BiLabel text="loan.pickPhone" size="md" bold />
        {dev ? (
          <div className="card p-0"><DeviceRow d={dev} onClick={() => setDev(null)} /></div>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="stock.searchPlaceholder" scan />
            <div className="max-h-72 overflow-y-auto"><List>{stock?.slice(0, 20).map((d) => <DeviceRow key={d.id} d={d} onClick={() => setDev(d)} />)}</List></div>
          </>
        )}
        {dev ? (
          <>
            <PartyPicker value={shop} onChange={setShop} kind="shop" label="loan.whichShop" />
            <div>
              <BiLabel text="loan.backIn" size="md" bold className="mb-1.5" />
              <div className="flex flex-wrap gap-1.5">
                {[3, 7, 15, 30].map((d) => (
                  <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`tap h-11 rounded-full border-2 px-4 font-bold ${days === d ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`}>
                    {pick('loan.days').replace('{{n}}', String(d))}
                  </button>
                ))}
                <button type="button" aria-pressed={days === null} onClick={() => setDays(null)} className={`tap h-11 rounded-full border-2 px-4 font-bold ${days === null ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`}>
                  {pick('loan.noDate')}
                </button>
              </div>
            </div>
            <BiInput label="common.notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <BiLabel text="loan.giveHint" size="sm" tone="text-muted" />
            <ErrorText error={m.error} />
            <BiButton text="loan.new" icon={<Check size={22} />} full loading={m.isPending} disabled={!shop} onClick={async () => { await m.mutateAsync({ device_id: dev.id, party_id: shop!.id, expected_back_at: days ? isoDay(days) : undefined, notes: notes || undefined }); reset(); onDone() }} />
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
