/** A phone's page — the Details view (shopkeepers 2026-11-20, ADR-114; first made 2026-11-16,
 *  ADR-091). One table says everything about the phone: an icon and the name of the line, its
 *  value, and beside it the button that changes that value and a "?" that explains it. Every line
 *  is always there (IMEI 2, colour, shelf … show "—" until written), so there is always a way to
 *  fill it in; "Edit all details" at the top opens the whole form, as when the phone was bought.
 *  Money on this phone and what came with it are lines of the same table. Below: the main jobs as
 *  big buttons, every other job under "More". On a laptop the sticker preview sits beside. */

import {
  BadgeCheck, Barcode, Battery, BatteryCharging, Box, CalendarClock, ChevronRight, CircleDollarSign, Cpu, HandCoins, HardDrive, Hash, Lock, MapPin, MemoryStick, Palette, Pencil, ShieldCheck,
  Sparkles, Store, Tag, TrendingUp, UserRound, Wallet, Wrench,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BiLabel, useLang, type BiText } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip } from '@/components/ui'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { DeviceDetail } from '@/lib/types'
import type { Act } from './DeviceLayouts'
import { lockState } from './DeviceSpecs'
import { FaultChip } from './Faults'
import { hasPta, specLine } from './StockPage'
import type { UnitMoneyData } from './UnitMoney'

/** the main jobs, as big buttons */
const MAIN = ['sell', 'return', 'loan', 'repair', 'repairBack', 'approvalBack', 'faultyCleared']
const money = (v: string | number | null | undefined) => (v == null ? null : withCur(Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })))

/** a band that names the next group of lines */
function Band({ text }: { text: string }) {
  const { pick, ur, cls } = useLang()
  return <div className={`bg-ground px-4 py-1.5 text-muted ${ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'}`} role="rowgroup">{pick(text)}</div>
}

/** one line of the table: icon + name | value | action + "?" */
function Line({ icon, label, value, action, help, testid, strong }: { icon: ReactNode; label: string | BiText; value: ReactNode; action?: Act | null; help?: string; testid?: string; strong?: boolean }) {
  const { pick, ur, cls } = useLang()
  const empty = value == null || value === '' || value === false
  return (
    <div role="row" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 sm:grid-cols-[auto_minmax(0,0.8fr)_minmax(0,1.25fr)_auto]" data-testid={testid}>
      <span className="well h-9 w-9 shrink-0 rounded-xl bg-ground text-ink">{icon}</span>
      {/* a phone: the name above its value; from a tablet's width: two columns */}
      <span className="flex min-w-0 flex-col sm:contents">
        <span role="rowheader" className={`min-w-0 text-muted ${ur ? cls('sm') : 'text-[12px] font-semibold sm:text-[13px]'}`}>{pick(label)}</span>
        <span role="cell" className={`min-w-0 break-words ${empty ? 'text-muted' : 'text-ink'} ${strong ? 'text-[17px] font-extrabold' : 'text-[15px] font-bold'}`}>{empty ? '—' : value}</span>
      </span>
      <span role="cell" className="flex shrink-0 items-center gap-1">
        {action ? (
          <button type="button" onClick={action.run} className="tap inline-flex min-h-9 items-center gap-1 rounded-full border border-ink/15 bg-surface px-3 text-[12.5px] font-bold text-ink shadow-[0_1px_0_rgba(27,31,36,.06)] hover:bg-ground" data-testid={action.testid ?? `line-${action.key}`}>
            {pick(action.label)}
          </button>
        ) : null}
        {help ? <Help term={help} size="sm" /> : <span className="w-6" />}
      </span>
    </div>
  )
}

export default function DeviceEasyView({ d, acts, canSeeCost, onPta, aside, extra }: { d: DeviceDetail; acts: Act[]; canSeeCost: boolean; onPta?: () => void; aside?: ReactNode; extra?: ReactNode }) {
  const { pick } = useLang()
  const [moreOpen, setMoreOpen] = useState(false)
  const { data: m } = useGet<UnitMoneyData>(['unit-money', d.id], `/api/v1/devices/${d.id}/money`)
  const act = (k: string) => acts.find((a) => a.key === k) ?? null
  const main = MAIN.map(act).filter((a): a is Act => !!a)
  const showLock = d.condition !== 'box_pack' && !d.lock_type
  const showId = d.verification_status !== 'not_required' || !!act('verify')
  const showBuyer = d.status === 'sold' || (!!d.current_party_name && d.status !== 'in_stock')
  // a job shown beside its line is not repeated in "More"; anything not shown there is
  const used = new Set(['price', 'fixCost', 'fixImei', 'edit', 'sticker', act('faulty') ? 'faulty' : 'faultEdit', ...(showLock ? ['lock'] : []), ...(showId ? ['verify'] : []), ...(d.source_party_name ? ['changeSeller'] : []), ...(showBuyer ? ['changeBuyer'] : [])])
  const more = acts.filter((a) => !used.has(a.key) && !MAIN.includes(a.key))
  const lock = lockState(d.lock_checks)
  const days = Math.max(0, Math.floor((Date.now() - new Date(d.first_seen_at).getTime()) / 86_400_000))
  // "Edit" beside a line opens the same form as "Edit all details"; a line with a job of its own keeps that
  const edit = act('edit')
  const editAs = (label = 'dview.edit'): Act | null => (edit ? { ...edit, label, testid: undefined, key: 'edit' } : null)
  const phone = (d.category ?? 'phone') === 'phone'
  const watch = d.category === 'watch'
  const used2 = d.condition !== 'box_pack'
  const s = m?.summary
  const condition = (
    <span className="flex flex-wrap items-center gap-1.5">
      {pick(`stock.condition.${d.condition}`)}
      {d.grade ? <Chip text={['a', 'b', 'refurbished', 'copy'].includes(d.grade) ? `devx.grades.${d.grade}` : { en: d.grade, ur: d.grade }} /> : null}
      <FaultChip faults={d.faults} />
    </span>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start" data-testid="device-easy">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card flex flex-col gap-0 overflow-hidden p-0">
          {/* the phone at a glance, and the one button that opens the whole form */}
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="well h-12 w-12 shrink-0 rounded-2xl bg-ink text-base font-extrabold text-ground">{d.brand_name.slice(0, 2).toUpperCase()}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xl font-extrabold leading-tight text-ink">{d.brand_name} {d.model_name}</span>
                <span className="text-sm font-semibold text-muted">{specLine(d, pick) || '—'}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1"><Chip text={`stock.status.${d.status}`} tone={d.status === 'in_stock' ? 'ok' : d.status === 'sold' ? 'ink' : 'warn'} /><Help term="device.status" size="sm" /></span>
            </div>
            {edit ? (
              <button type="button" onClick={edit.run} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-[15px] font-extrabold text-ground shadow-hero active:translate-y-0.5" data-testid="device-edit-all">
                <Pencil size={18} strokeWidth={2.2} />{pick('dview.editAll')}
              </button>
            ) : null}
          </div>

          <div role="table" aria-label={pick('dview.table')} className="divide-y divide-line border-t border-line" data-testid="device-table">
            <Band text="dview.g.identity" />
            <Line icon={<Hash size={17} />} label={phone || d.cellular ? 'dview.imei1' : 'stock.serial'} value={<span className="num whitespace-nowrap" dir="ltr">{d.imei1}</span>} action={act('fixImei')} help={phone || d.cellular ? 'imei' : 'device.serial'} testid="dline-imei1" />
            {phone ? <Line icon={<Hash size={17} />} label="stock.imei2" value={d.imei2 ? <span className="num whitespace-nowrap" dir="ltr">{d.imei2}</span> : null} action={act('fixImei') ? { ...act('fixImei')!, label: d.imei2 ? 'dview.edit' : 'dview.add', testid: 'line-imei2' } : editAs(d.imei2 ? 'dview.edit' : 'dview.add')} help="device.imei2" testid="dline-imei2" /> : null}
            {phone || d.cellular ? <Line icon={<Hash size={17} />} label="stock.serial" value={d.serial ? <span className="num" dir="ltr">{d.serial}</span> : null} action={editAs(d.serial ? 'dview.edit' : 'dview.add')} help="device.serial" testid="dline-serial" /> : null}
            <Line icon={<Barcode size={17} />} label="barcode.label" value={d.barcode ? <span className="num" dir="ltr">{d.barcode}</span> : null} action={act('sticker') ? { ...act('sticker')!, label: 'dview.sticker', testid: 'line-sticker' } : null} help="label.barcode" testid="device-barcode" />

            <Band text="dview.g.details" />
            {!watch ? <Line icon={<HardDrive size={17} />} label="stock.storage" value={d.storage_name} action={editAs()} help="device.storage" testid="dline-memory" /> : null}
            {!watch ? <Line icon={<MemoryStick size={17} />} label="devx.ram" value={d.ram_gb ? <span dir="ltr">{d.ram_gb} GB</span> : null} action={editAs()} help="device.ram" testid="dline-ram" /> : null}
            <Line icon={<Palette size={17} />} label="dview.colour" value={d.colour_name} action={editAs()} help="device.colour" testid="dline-colour" />
            <Line icon={<Sparkles size={17} />} label="stock.conditionShort" value={condition} action={act('faulty') ?? act('faultEdit') ?? editAs()} help="device.condition" testid="dline-condition" />
            {used2 ? <Line icon={<Battery size={17} />} label="devx.battery" value={d.battery_health ? <span dir="ltr">{d.battery_health}%</span> : null} action={editAs()} help="device.battery" testid="dline-battery" /> : null}
            {used2 && d.battery_cycles != null ? <Line icon={<BatteryCharging size={17} />} label="devx.cycles" value={<span dir="ltr">{d.battery_cycles}</span>} action={editAs()} help="device.cycles" /> : null}
            {hasPta(d) ? (
              <Line
                icon={<ShieldCheck size={17} />}
                label="stock.ptaShort"
                value={pick(`stock.pta.${d.pta_status}`)}
                action={onPta && /^\d{15}$/.test(d.imei1) ? { key: 'pta', label: 'dview.ptaCheck', run: onPta, testid: 'line-pta' } : editAs()}
                help="device.pta"
                testid="dline-pta"
              />
            ) : null}
            {hasPta(d) && d.sim_time_months ? <Line icon={<Cpu size={17} />} label="stock.simTime" value={String(d.sim_time_months)} action={editAs()} help="device.simTime" /> : null}
            {hasPta(d) ? <Line icon={<Lock size={17} />} label="simlock.label" value={d.sim_lock ? <span className={d.sim_lock === 'locked' ? 'text-gold-text' : 'text-emerald-deep'}>{[pick(`simlock.${d.sim_lock}`), d.sim_lock_carrier].filter(Boolean).join(' · ')}</span> : null} action={editAs()} help="device.simLock" testid="dline-simlock" /> : null}
            {showLock ? <Line icon={<Lock size={17} />} label="devx.lock.title" value={<span className={lock === 'bad' ? 'text-payable' : lock === 'ok' ? 'text-emerald-deep' : 'text-gold-text'}>{pick(lock === 'ok' ? 'devx.lock.ok' : lock === 'bad' ? 'devx.lock.bad' : 'devx.lock.none')}</span>} action={act('lock')} help="device.lock" testid="dline-lock" /> : null}
            {showId ? <Line icon={<BadgeCheck size={17} />} label="dview.idCheck" value={pick(`stock.verification.${d.verification_status}`)} action={act('verify')} help="purchase.idCheck" testid="dline-id" /> : null}
            <Line icon={<Wrench size={17} />} label="stock.warranty" value={d.warranty_months ? `${d.warranty_months} ${pick('stock.months')}${d.warranty_by ? ` · ${pick(`devx.by.${d.warranty_by}`)}` : ''}` : null} action={editAs()} help="device.warrantyMonths" testid="dline-warranty" />
            <Line icon={<MapPin size={17} />} label="stock.shelf" value={d.location} action={editAs()} help="stock.shelf" testid="dline-shelf" />
            <Line icon={<CalendarClock size={17} />} label="dview.since" value={pick('dview.days').replace('{{n}}', String(days))} />

            <Band text="dview.g.money" />
            <Line icon={<Tag size={17} />} label="stock.asking" value={money(d.asking_price)} action={act('price') ? { ...act('price')!, label: 'dview.change', testid: 'line-price' } : null} help="asking" testid="dline-asking" strong />
            {s && s.original_asking != null && s.original_asking !== s.asking_price ? <Line icon={<Tag size={17} />} label="unit.askingFirst" value={<span className="text-muted">{money(s.original_asking)}</span>} help="stock.unit.askingFirst" testid="dline-asking-first" /> : null}
            {canSeeCost ? <Line icon={<Wallet size={17} />} label="stock.cost" value={money(d.cost_price)} action={act('fixCost') ? { ...act('fixCost')!, label: 'dview.correct' } : null} help="cost" testid="dline-cost" strong /> : null}
            {canSeeCost && s ? <Line icon={<HandCoins size={17} />} label="unit.stillToPay" value={s.payable == null ? null : <span className={Number(s.payable) > 0 ? 'text-payable' : ''}>{money(s.payable)}</span>} help="stock.unit.stillToPay" testid="dline-payable" /> : null}
            {s ? <Line icon={<CircleDollarSign size={17} />} label="unit.soldFor" value={money(s.sold_for)} help="stock.unit.soldFor" testid="dline-sold" /> : null}
            {s ? <Line icon={<HandCoins size={17} />} label="unit.stillToGet" value={s.sold_for == null ? null : <span className={Number(s.receivable) > 0 ? 'text-receivable' : ''}>{money(s.receivable)}</span>} help="stock.unit.stillToGet" testid="dline-receivable" /> : null}
            {canSeeCost && s && s.margin != null ? <Line icon={<TrendingUp size={17} />} label="unit.margin" value={<span className={Number(s.margin) >= 0 ? 'text-emerald-deep' : 'text-payable'}>{money(s.margin)}</span>} help="stock.unit.margin" testid="dline-margin" /> : null}

            <Band text="dview.g.people" />
            <Line icon={<Store size={17} />} label="dview.boughtFrom" value={d.source_party_name} action={act('changeSeller') ? { ...act('changeSeller')!, label: 'dview.change' } : null} help="stock.unit.bought" testid="dline-seller" />
            {showBuyer ? <Line icon={<UserRound size={17} />} label={d.status === 'sold' ? 'dview.customer' : 'stock.withParty'} value={d.current_party_name ?? pick('inv.noName')} action={act('changeBuyer') ? { ...act('changeBuyer')!, label: 'dview.change' } : null} help="stock.unit.sold" testid="dline-customer" /> : null}

            <Band text="stock.accessories" />
            {d.accessories.length ? d.accessories.map((a) => {
              const name = a.kind === 'other' && a.label ? a.label : pick(`stock.acc.${a.kind}`)
              const state = a.given_at_sale ? pick('stock.accGiven') : a.pending_from === 'vendor' ? pick('stock.accPendingVendor') : a.pending_from === 'shop' ? pick('stock.accPendingShop') : pick(a.came_with ? 'dview.accHave' : 'dview.accNo')
              const tone = a.pending_from === 'vendor' ? 'text-gold-text' : a.pending_from === 'shop' ? 'text-payable' : a.came_with ? 'text-emerald-deep' : 'text-muted'
              return <Line key={a.id ?? a.kind} icon={<Box size={17} />} label={{ en: name, ur: name, roman: name }} value={<span className={tone}>{state}</span>} help="stock.accessories" testid="dline-acc" />
            }) : <Line icon={<Box size={17} />} label="stock.accessories" value={null} help="stock.accessories" testid="dline-acc" />}
          </div>
        </section>

        {/* the main jobs */}
        {main.length ? (
          <div className="grid grid-cols-2 gap-2" data-testid="device-main-actions">
            {main.map((a, i) => (
              <button key={a.key} type="button" onClick={a.run} className={`tap flex min-h-14 items-center justify-center rounded-2xl px-3 text-[15px] font-extrabold active:translate-y-0.5 ${i === 0 ? 'col-span-2 bg-emerald text-white shadow-cta' : 'border-2 border-ink/15 bg-surface text-ink'}`} data-testid={a.testid ?? `main-${a.key}`}>
                {pick(a.label)}
              </button>
            ))}
          </div>
        ) : null}

        {/* every other job */}
        {more.length ? (
          <section className="card p-0">
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="tap flex min-h-14 w-full items-center gap-3 px-4 text-start" data-testid="device-more-toggle">
              <span className="flex-1"><BiLabel text="dview.more" size="md" bold /></span>
              <span className="num rounded-full bg-ground px-2 text-xs font-bold text-muted">{more.length}</span>
              <ChevronRight size={18} className={`text-muted transition-transform ${moreOpen ? 'rotate-90' : 'rtl:rotate-180'}`} />
            </button>
            {moreOpen ? (
              <div className="grid grid-cols-1 gap-2 border-t border-line p-3 sm:grid-cols-2" data-testid="device-more">
                {more.map((a) => (
                  <button key={a.key} type="button" onClick={a.run} className={`tap flex min-h-12 items-center rounded-2xl border px-4 text-start text-sm font-bold ${a.key.startsWith('delete') || a.key === 'removeOld' ? 'border-payable/40 text-payable' : 'border-line bg-surface text-ink'}`} data-testid={a.testid ?? `more-${a.key}`}>
                    {pick(a.label)}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {extra}
      </div>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">{aside}</aside>
    </div>
  )
}
