/** Ways to see one phone (owner 2026-11-10, shopkeepers in testing: "the detail page should be
 *  easier — the phone, its customer and the actions together"). Classic is the page as it was;
 *  Smart, Tabs, Tiles and Compact show the same data with each action next to the value it changes.
 *  Every action is the page's own (same sheets, same rules); the choice is kept on this device. */

import { ArrowDown, ArrowUp, Check, ChevronDown, LayoutGrid, LayoutList, Rows3, Sparkles, SquareStack } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, MoneyText, Sheet } from '@/components/ui'
import PaymentForm, { type Allocation } from '@/features/payments/PaymentForm'
import { useGet, useInvalidate } from '@/lib/queries'
import type { DeviceDetail, Party } from '@/lib/types'
import { DeviceReserve } from './ReserveCard'
import { hasPta, specLine } from './StockPage'
import type { Side, UnitMoneyData } from './UnitMoney'
import UnitMoney from './UnitMoney'

export type DeviceStyle = 'classic' | 'smart' | 'tabs' | 'tiles' | 'compact'
const STYLES: { s: DeviceStyle; icon: typeof Rows3 }[] = [
  { s: 'classic', icon: Rows3 },
  { s: 'smart', icon: Sparkles },
  { s: 'tabs', icon: SquareStack },
  { s: 'tiles', icon: LayoutGrid },
  { s: 'compact', icon: LayoutList },
]
const KEY = 'device.style'
export function loadStyle(): DeviceStyle {
  try {
    const v = localStorage.getItem(KEY)
    return STYLES.some((x) => x.s === v) ? (v as DeviceStyle) : 'classic'
  } catch {
    return 'classic'
  }
}
export function saveStyle(s: DeviceStyle) {
  try { localStorage.setItem(KEY, s) } catch { /* private mode */ }
}

export function StyleSwitch({ value, onChange }: { value: DeviceStyle; onChange: (s: DeviceStyle) => void }) {
  const { pick } = useLang()
  return (
    <div className="flex items-center gap-1" data-testid="device-styles">
      <div role="radiogroup" aria-label={pick('dl.title')} className="flex flex-1 rounded-2xl border border-line bg-surface p-1">
        {STYLES.map(({ s, icon: Icon }) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)} className={`tap flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${value === s ? 'bg-ink text-ground' : 'text-muted'}`} data-testid={`dstyle-${s}`}>
            <Icon size={16} />
            {pick(`dl.styles.${s}`)}
          </button>
        ))}
      </div>
      <Help term="dl.styles" size="sm" />
    </div>
  )
}

/** one action the page can do (the same buttons as Classic) */
export interface Act { key: string; label: string; run: () => void; tone?: 'primary' | 'gold' | 'secondary'; testid?: string }

export interface LayoutProps {
  d: DeviceDetail
  acts: Act[]
  canSeeCost: boolean
  inStock: boolean
}

const n = (v: string | number | null | undefined) => (v == null || v === '' ? null : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

function useMoney(id: string) {
  return useGet<UnitMoneyData>(['unit-money', id], `/api/v1/devices/${id}/money`).data
}

/** a small action button that sits beside a value */
function Mini({ a, onClick, label, tone }: { a?: Act; onClick?: () => void; label?: string; tone?: 'primary' | 'secondary' }) {
  const { pick } = useLang()
  if (!a && !onClick) return null
  const t = a?.tone ?? tone ?? 'secondary'
  return (
    <button type="button" onClick={a ? a.run : onClick} className={`tap inline-flex min-h-9 shrink-0 items-center rounded-xl px-3 text-[13px] font-bold ${t === 'primary' ? 'bg-emerald text-white' : t === 'gold' ? 'bg-gold text-[#0E1613]' : 'border border-line bg-surface text-ink'}`} data-testid={a?.testid}>
      {pick(label ?? a!.label)}
    </button>
  )
}

/** label · value · action, the row every new style is built from */
function Line({ label, value, actions, ltr, testid }: { label: string; value: ReactNode; actions?: ReactNode; ltr?: boolean; testid?: string }) {
  const { pick, ur, cls } = useLang()
  const empty = value == null || value === ''
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 last:border-0" data-testid={testid}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(label)}</span>
        <span className={`truncate text-[15px] font-bold ${empty ? 'text-muted' : 'text-ink'} ${ltr ? 'num' : ''}`} dir={ltr ? 'ltr' : undefined}>{empty ? pick('dl.notRecorded') : value}</span>
      </span>
      {actions ? <span className="flex shrink-0 flex-wrap justify-end gap-1.5">{actions}</span> : null}
    </div>
  )
}

function copy(text: string, done: () => void) {
  try { void navigator.clipboard?.writeText(text).then(done, done) } catch { done() }
}

/** what each style shares: the phone's facts with their actions, the people with the money */
function useFacts({ d, acts, canSeeCost }: LayoutProps) {
  const { pick } = useLang()
  const a = (k: string) => acts.find((x) => x.key === k)
  const [copied, setCopied] = useState(false)
  const lockText = d.lock_checks ? (Object.values(d.lock_checks).some((v) => v === 'not_cleared') ? pick('devx.lock.bad') : pick('devx.lock.ok')) : d.condition !== 'box_pack' ? pick('devx.lock.none') : null
  const rows: { key: string; label: string; value: ReactNode; actions?: ReactNode; ltr?: boolean }[] = [
    { key: 'imei', label: 'stock.imei', value: d.imei2 ? `${d.imei1} · ${d.imei2}` : d.imei1, ltr: true, actions: <>
      <Mini onClick={() => copy(d.imei1, () => { setCopied(true); setTimeout(() => setCopied(false), 1500) })} label={copied ? 'dl.copied' : 'dl.copy'} />
      <Mini a={a('fixImei')} />
    </> },
    { key: 'price', label: 'stock.asking', value: n(d.asking_price), ltr: true, actions: <Mini a={a('price')} /> },
    ...(canSeeCost ? [{ key: 'cost', label: 'stock.cost', value: n(d.cost_price), ltr: true, actions: <Mini a={a('fixCost')} /> }] : []),
    { key: 'status', label: 'dl.status', value: pick(`stock.status.${d.status}`), actions: <>{['sell', 'return', 'repairBack', 'approvalBack', 'faultyCleared', 'faultEdit'].map((k) => <Mini key={k} a={a(k)} />)}</> },
    { key: 'condition', label: 'stock.conditionShort', value: [pick(`stock.condition.${d.condition}`), d.grade ? pick(`devx.grades.${d.grade}`) : null].filter(Boolean).join(' · '), actions: <Mini a={a('edit')} /> },
    ...(hasPta(d) ? [{ key: 'pta', label: 'stock.ptaShort', value: [pick(`stock.pta.${d.pta_status}`), d.sim_time_months ? `${d.sim_time_months} ${pick('stock.months')}` : null].filter(Boolean).join(' · ') }] : []),
    { key: 'spec', label: 'dl.spec', value: specLine(d, pick) || null },
    { key: 'shelf', label: 'stock.shelf', value: d.location, actions: <Mini a={a('edit')} label="dl.edit" /> },
    { key: 'barcode', label: 'barcode.label', value: d.barcode, ltr: true, actions: <Mini a={a('sticker')} /> },
    ...(d.verification_status !== 'not_required' ? [{ key: 'idcheck', label: 'stock.col.verification', value: pick(`stock.verification.${d.verification_status}`), actions: <Mini a={a('verify')} /> }] : []),
    ...(lockText ? [{ key: 'lock', label: 'devx.lock.title', value: lockText, actions: <Mini a={a('lock')} /> }] : []),
    { key: 'notes', label: 'common.notes', value: d.notes, actions: <Mini a={a('note')} /> },
  ]
  return { rows, a }
}

/** bought from / sold to, what is still owed, and pay / receive right there */
function People({ d, canSeeCost, acts }: LayoutProps) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const money = useMoney(d.id)
  const [paying, setPaying] = useState<{ side: Side; dir: 'in' | 'out' } | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const sides: { side: Side; role: 'bought' | 'sold' }[] = []
  if (money?.purchase && canSeeCost) sides.push({ side: money.purchase, role: 'bought' })
  if (money?.sale) sides.push({ side: money.sale, role: 'sold' })
  const changeSeller = acts.find((x) => x.key === 'changeSeller')
  const changeBuyer = acts.find((x) => x.key === 'changeBuyer')
  return (
    <div className="flex flex-col gap-2" data-testid="dl-people">
      {d.reserved_party_id || d.status === 'in_stock' ? <DeviceReserve deviceId={d.id} d={d} inStock={d.status === 'in_stock'} /> : null}
      {d.current_party_name && !money?.sale ? (
        <div className="card flex items-center gap-2"><span className="flex-1"><span className={`text-muted ${small}`}>{pick('stock.withParty')}</span><div className="font-bold">{d.current_party_name}</div></span></div>
      ) : null}
      {sides.map(({ side, role }) => {
        const rem = Number(side.remaining ?? 0)
        const bought = role === 'bought'
        return (
          <div key={role} className={`flex flex-col gap-1.5 rounded-3xl p-4 ${bought ? 'bg-buy text-buy-fg' : 'bg-sell text-sell-fg'}`} data-testid={`dl-${role}`}>
            <span className={`opacity-80 ${small}`}>{pick(bought ? 'unit.boughtFrom' : 'unit.soldTo')}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => side.party_id && nav(`/parties/${side.party_id}`)} className="min-w-0 flex-1 truncate text-start text-lg font-extrabold">{side.party_name ?? pick('sale.cashCustomer')}</button>
              {rem > 0 ? <span className="num text-lg font-extrabold" dir="ltr">{n(rem)}</span> : <Chip text="unit.settled" tone="ok" />}
            </div>
            <span className={`opacity-80 ${small}`} dir="ltr">{side.no} · {n(side.line_total)}</span>
            <div className="flex flex-wrap gap-1.5">
              {rem > 0 && side.party_id ? <button type="button" onClick={() => setPaying({ side, dir: bought ? 'out' : 'in' })} className="tap inline-flex min-h-10 items-center gap-1 rounded-xl bg-white/90 px-3 font-bold text-ink" data-testid={`dl-${bought ? 'pay' : 'receive'}`}>{bought ? <ArrowUp size={16} /> : <ArrowDown size={16} />}{pick(bought ? 'dl.pay' : 'dl.receive')} {n(rem)}</button> : null}
              <button type="button" onClick={() => nav(bought ? `/purchases/${side.doc_id}` : `/sales/${side.doc_id}`)} className="tap inline-flex min-h-10 items-center rounded-xl border border-current/30 px-3 font-bold">{pick('dl.openBill')}</button>
              {bought && changeSeller ? <button type="button" onClick={changeSeller.run} className="tap inline-flex min-h-10 items-center rounded-xl border border-current/30 px-3 font-bold">{pick('dl.changePerson')}</button> : null}
              {!bought && changeBuyer ? <button type="button" onClick={changeBuyer.run} className="tap inline-flex min-h-10 items-center rounded-xl border border-current/30 px-3 font-bold" data-testid="dl-change-buyer">{pick('dl.changePerson')}</button> : null}
            </div>
          </div>
        )
      })}
      <Sheet open={!!paying} onClose={() => setPaying(null)} title={paying?.dir === 'out' ? 'unit.payForThis' : 'unit.receiveForThis'}>
        {paying ? (
          <PaymentForm
            party={{ id: paying.side.party_id!, name: paying.side.party_name ?? '', phone: paying.side.party_phone ?? '', balance: '0' } as unknown as Party}
            direction={paying.dir}
            allocation={{ document_type: paying.side.doc_type, document_id: paying.side.doc_id, document_no: paying.side.no, remaining: Number(paying.side.remaining ?? 0) } as Allocation}
            onDone={() => { setPaying(null); void inv('unit-money', 'parties', 'balances', 'dashboard') }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

/** the actions not already beside a value, folded */
function MoreActions({ acts, shown }: { acts: Act[]; shown: string[] }) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const rest = acts.filter((a) => !shown.includes(a.key))
  if (!rest.length) return null
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen(!open)} className="tap flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-4 font-bold" data-testid="dl-more">
        {pick('dl.more')} <ChevronDown size={18} className={open ? 'rotate-180' : ''} />
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2">
          {rest.map((a) => <BiButton key={a.key} text={a.label} variant="secondary" size="md" onClick={a.run} data-testid={a.testid} />)}
        </div>
      ) : null}
    </div>
  )
}

const INLINE = ['sell', 'return', 'repairBack', 'approvalBack', 'faultyCleared', 'fixImei', 'price', 'edit', 'sticker', 'verify', 'lock', 'note', 'changeSeller', 'changeBuyer', 'fixCost', 'faultEdit']

function Head({ d }: { d: DeviceDetail }) {
  const { pick } = useLang()
  return (
    <section className="hero flex items-start justify-between gap-2 p-4">
      <span className="flex min-w-0 flex-col">
        <span className="num text-lg" dir="ltr">{d.imei1}</span>
        <span className="truncate text-sm text-hero-text/75">{specLine(d, pick)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Chip text={`stock.status.${d.status}`} tone="ink" />
        {d.asking_price ? <MoneyText value={d.asking_price} tone="ink" size="lg" /> : null}
      </span>
    </section>
  )
}

/** 1. Smart: each fact with its action, the people with their money, then everything that happened */
export function SmartLayout(p: LayoutProps) {
  const { rows } = useFacts(p)
  const main = p.acts.find((x) => x.key === 'sell') ?? p.acts.find((x) => x.key === 'return')
  return (
    <div className="flex flex-col gap-3" data-testid="dl-smart">
      <Head d={p.d} />
      {main ? <BiButton text={main.label} icon={<Check size={20} />} full onClick={main.run} data-testid="dl-main" /> : null}
      <div className="card p-0" data-testid="dl-facts">{rows.map((r) => <Line key={r.key} label={r.label} value={r.value} actions={r.actions} ltr={r.ltr} testid={`dl-row-${r.key}`} />)}</div>
      <People {...p} />
      <MoreActions acts={p.acts} shown={INLINE} />
      <UnitMoney deviceId={p.d.id} historyOnly />
    </div>
  )
}

/** 2. Tabs: overview / money & people / history, the main action always on top */
export function TabsLayout(p: LayoutProps) {
  const { pick } = useLang()
  const { rows } = useFacts(p)
  const [tab, setTab] = useState<'overview' | 'people' | 'history'>('overview')
  const main = p.acts.find((x) => x.key === 'sell') ?? p.acts.find((x) => x.key === 'return')
  return (
    <div className="flex flex-col gap-3" data-testid="dl-tabs">
      <Head d={p.d} />
      {main ? <BiButton text={main.label} full onClick={main.run} data-testid="dl-main" /> : null}
      <div role="tablist" className="flex rounded-2xl border border-line bg-surface p-1">
        {(['overview', 'people', 'history'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`tap min-h-11 flex-1 rounded-xl text-sm font-bold ${tab === t ? 'bg-ink text-ground' : 'text-muted'}`} data-testid={`dl-tab-${t}`}>{pick(`dl.tab.${t}`)}</button>
        ))}
      </div>
      {tab === 'overview' ? (
        <>
          <div className="card p-0">{rows.map((r) => <Line key={r.key} label={r.label} value={r.value} actions={r.actions} ltr={r.ltr} />)}</div>
          <MoreActions acts={p.acts} shown={INLINE} />
        </>
      ) : tab === 'people' ? <People {...p} /> : <UnitMoney deviceId={p.d.id} historyOnly />}
    </div>
  )
}

/** 3. Tiles: big squares to tap, each a fact that opens its action */
export function TilesLayout(p: LayoutProps) {
  const { pick, ur, cls } = useLang()
  const { rows, a } = useFacts(p)
  const tile = (key: string, label: string, value: ReactNode, run?: () => void, tone = 'bg-surface text-ink') => (
    <button key={key} type="button" onClick={run} disabled={!run} className={`tap flex min-h-[96px] flex-col items-start justify-between gap-1 rounded-3xl border border-line p-3 text-start disabled:cursor-default ${tone}`} data-testid={`dl-tile-${key}`}>
      <span className={`opacity-75 ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(label)}</span>
      <span className="num line-clamp-2 text-[17px] font-extrabold" dir="auto">{value ?? <span className="text-muted">{pick('dl.notRecorded')}</span>}</span>
      {run ? <span className={`opacity-75 ${ur ? cls('sm') : 'text-[11px] font-bold'}`}>{pick('dl.tapTo')}</span> : null}
    </button>
  )
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null
  const main = a('sell') ?? a('return')
  return (
    <div className="flex flex-col gap-3" data-testid="dl-tiles">
      <Head d={p.d} />
      <div className="grid grid-cols-2 gap-2">
        {main ? tile('main', main.label, n(p.d.asking_price), main.run, 'bg-emerald text-white') : tile('status', 'dl.status', get('status'))}
        {tile('price', 'stock.asking', get('price'), a('price')?.run)}
        {tile('imei', 'stock.imei', p.d.imei1, a('fixImei')?.run)}
        {tile('condition', 'stock.conditionShort', get('condition'), a('edit')?.run)}
        {get('pta') != null ? tile('pta', 'stock.ptaShort', get('pta'), a('edit')?.run) : null}
        {tile('shelf', 'stock.shelf', get('shelf'), a('edit')?.run)}
        {get('idcheck') != null ? tile('idcheck', 'stock.col.verification', get('idcheck'), a('verify')?.run, 'bg-gold-tint text-ink') : null}
        {get('lock') != null ? tile('lock', 'devx.lock.title', get('lock'), a('lock')?.run) : null}
        {tile('sticker', 'barcode.label', get('barcode'), a('sticker')?.run)}
        {p.canSeeCost ? tile('cost', 'stock.cost', get('cost'), a('fixCost')?.run) : null}
      </div>
      <People {...p} />
      <MoreActions acts={p.acts} shown={INLINE} />
      <UnitMoney deviceId={p.d.id} historyOnly />
    </div>
  )
}

/** 4. Compact: one short screen, a list with buttons on the right and the main action pinned */
export function CompactLayout(p: LayoutProps) {
  const { pick } = useLang()
  const { rows, a } = useFacts(p)
  const main = a('sell') ?? a('return')
  return (
    <div className="flex flex-col gap-2 pb-20" data-testid="dl-compact">
      <div className="card p-0">
        {rows.map((r) => <Line key={r.key} label={r.label} value={r.value} actions={r.actions} ltr={r.ltr} />)}
      </div>
      <People {...p} />
      <MoreActions acts={p.acts} shown={INLINE} />
      <UnitMoney deviceId={p.d.id} historyOnly />
      {main ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 lg:bottom-4">
          <BiButton text={main.label} className="flex-1" onClick={main.run} data-testid="dl-main" />
          <a href="#dl-top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="tap flex min-h-14 items-center justify-center rounded-2xl border border-line bg-surface px-4 font-bold">{pick('dl.top')}</a>
        </div>
      ) : null}
    </div>
  )
}
