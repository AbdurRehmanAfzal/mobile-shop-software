/** A phone's page, made easy to read (owner 2026-11-16, ADR-091 — the "classic" view): everything
 *  about the phone in one place at the top, each line with an icon, and the thing you can do about
 *  that line right beside it (IMEI → Correct, condition → Mark faulty, PTA → Check, customer →
 *  Change …). Below: the main jobs as big buttons, then every other job in "More". On a laptop the
 *  sticker preview sits beside the details. */

import { BadgeCheck, Barcode, CalendarClock, ChevronRight, Cpu, HardDrive, Hash, Lock, MapPin, Palette, ShieldCheck, Sparkles, Store, UserRound, Wrench } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, MoneyText } from '@/components/ui'
import type { DeviceDetail } from '@/lib/types'
import type { Act } from './DeviceLayouts'
import { lockState } from './DeviceSpecs'
import { FaultChip } from './Faults'
import { hasPta, specLine } from './StockPage'

/** the main jobs, as big buttons */
const MAIN = ['sell', 'return', 'loan', 'repair', 'repairBack', 'approvalBack', 'faultyCleared']

function Line({ icon, label, value, action, testid }: { icon: ReactNode; label: string; value: ReactNode; action?: Act | null; testid?: string }) {
  const { pick } = useLang()
  return (
    <div className="flex min-h-14 items-center gap-3 py-2" data-testid={testid}>
      <span className="well h-10 w-10 shrink-0 rounded-xl bg-ground text-emerald-deep">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-muted">{pick(label)}</span>
        <span className="min-w-0 break-words text-[15px] font-bold text-ink">{value}</span>
      </span>
      {action ? (
        <button type="button" onClick={action.run} className="tap shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-bold text-emerald-deep" data-testid={action.testid ?? `line-${action.key}`}>
          {pick(action.label)}
        </button>
      ) : null}
    </div>
  )
}

export default function DeviceEasyView({ d, acts, canSeeCost, onPta, aside, extra }: { d: DeviceDetail; acts: Act[]; canSeeCost: boolean; onPta?: () => void; aside?: ReactNode; extra?: ReactNode }) {
  const { pick } = useLang()
  const [moreOpen, setMoreOpen] = useState(false)
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
        {/* the phone at a glance */}
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="well h-14 w-14 shrink-0 rounded-2xl bg-hero text-lg font-extrabold text-hero-text">{d.brand_name.slice(0, 2).toUpperCase()}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xl font-extrabold leading-tight text-ink">{d.brand_name} {d.model_name}</span>
              <span className="text-sm font-semibold text-emerald-deep">{specLine(d, pick) || '—'}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1"><Chip text={`stock.status.${d.status}`} tone={d.status === 'in_stock' ? 'ok' : d.status === 'sold' ? 'ink' : 'warn'} /><Help term="device.status" size="sm" /></span>
          </div>

          <div className={`grid gap-2 ${canSeeCost ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="flex flex-col gap-1 rounded-2xl bg-emerald-tint px-4 py-3">
              <span className="flex items-center gap-1"><BiLabel text="stock.asking" size="sm" tone="text-emerald-deep" /><Help term="asking" size="sm" /></span>
              <span className="whitespace-nowrap"><MoneyText value={d.asking_price} tone="ink" size="md" /></span>
              {act('price') ? <button type="button" onClick={act('price')!.run} className="tap self-start text-[13px] font-bold text-emerald-deep underline" data-testid={act('price')!.testid ?? 'line-price'}>{pick('stock.changePrice')}</button> : null}
            </div>
            {canSeeCost ? (
              <div className="flex flex-col gap-1 rounded-2xl bg-ground px-4 py-3">
                <span className="flex items-center gap-1"><BiLabel text="stock.cost" size="sm" tone="text-muted" /><Help term="cost" size="sm" /></span>
                <span className="whitespace-nowrap"><MoneyText value={d.cost_price} tone="ink" size="md" /></span>
                {act('fixCost') ? <button type="button" onClick={act('fixCost')!.run} className="tap self-start text-[13px] font-bold text-emerald-deep underline" data-testid={act('fixCost')!.testid ?? 'line-fixCost'}>{pick('purchase.costFix.button')}</button> : null}
              </div>
            ) : null}
          </div>

          <div className="divide-y divide-line">
            <Line icon={<Hash size={18} />} label="dview.imei1" value={<span className="num whitespace-nowrap" dir="ltr">{d.imei1}</span>} action={act('fixImei')} testid="dline-imei1" />
            {d.imei2 ? <Line icon={<Hash size={18} />} label="stock.imei2" value={<span className="num whitespace-nowrap" dir="ltr">{d.imei2}</span>} testid="dline-imei2" /> : null}
            {d.serial ? <Line icon={<Hash size={18} />} label="stock.serial" value={<span className="num" dir="ltr">{d.serial}</span>} /> : null}
            {d.barcode ? <Line icon={<Barcode size={18} />} label="barcode.label" value={<span className="num" dir="ltr">{d.barcode}</span>} testid="device-barcode" /> : null}
            <Line icon={<HardDrive size={18} />} label="dview.memory" value={[d.storage_name, d.ram_gb ? `${d.ram_gb} GB RAM` : null].filter(Boolean).join(' · ') || '—'} action={act('edit')} testid="dline-memory" />
            {d.colour_name ? <Line icon={<Palette size={18} />} label="dview.colour" value={d.colour_name} /> : null}
            <Line icon={<Sparkles size={18} />} label="stock.conditionShort" value={condition} action={act('faulty') ?? act('faultEdit')} testid="dline-condition" />
            {hasPta(d) ? (
              <Line
                icon={<ShieldCheck size={18} />}
                label="stock.ptaShort"
                value={pick(`stock.pta.${d.pta_status}`)}
                action={onPta && /^\d{15}$/.test(d.imei1) ? { key: 'pta', label: 'dview.ptaCheck', run: onPta, testid: 'line-pta' } : null}
                testid="dline-pta"
              />
            ) : null}
            {d.sim_lock ? <Line icon={<Lock size={18} />} label="simlock.label" value={<span className={d.sim_lock === 'locked' ? 'text-gold-text' : 'text-emerald-deep'}>{[pick(`simlock.${d.sim_lock}`), d.sim_lock_carrier].filter(Boolean).join(' · ')}</span>} testid="dline-simlock" /> : null}
            {showLock ? <Line icon={<Lock size={18} />} label="devx.lock.title" value={<span className={lock === 'bad' ? 'text-payable' : lock === 'ok' ? 'text-emerald-deep' : 'text-gold-text'}>{pick(lock === 'ok' ? 'devx.lock.ok' : lock === 'bad' ? 'devx.lock.bad' : 'devx.lock.none')}</span>} action={act('lock')} testid="dline-lock" /> : null}
            {showId ? <Line icon={<BadgeCheck size={18} />} label="dview.idCheck" value={pick(`stock.verification.${d.verification_status}`)} action={act('verify')} testid="dline-id" /> : null}
            {d.source_party_name ? <Line icon={<Store size={18} />} label="dview.boughtFrom" value={d.source_party_name} action={act('changeSeller')} testid="dline-seller" /> : null}
            {showBuyer ? <Line icon={<UserRound size={18} />} label={d.status === 'sold' ? 'dview.customer' : 'stock.withParty'} value={d.current_party_name ?? pick('inv.noName')} action={act('changeBuyer')} testid="dline-customer" /> : null}
            {d.location ? <Line icon={<MapPin size={18} />} label="stock.shelf" value={d.location} /> : null}
            {d.warranty_months ? <Line icon={<Wrench size={18} />} label="stock.warranty" value={`${d.warranty_months} ${pick('stock.months')}${d.warranty_by ? ` · ${pick(`devx.by.${d.warranty_by}`)}` : ''}`} /> : null}
            {d.sim_time_months ? <Line icon={<Cpu size={18} />} label="stock.simTime" value={String(d.sim_time_months)} /> : null}
            <Line icon={<CalendarClock size={18} />} label="dview.since" value={pick('dview.days').replace('{{n}}', String(days))} />
          </div>
        </section>

        {/* the main jobs */}
        {main.length ? (
          <div className="grid grid-cols-2 gap-2" data-testid="device-main-actions">
            {main.map((a, i) => (
              <button key={a.key} type="button" onClick={a.run} className={`tap flex min-h-14 items-center justify-center rounded-2xl px-3 text-[15px] font-extrabold ${i === 0 ? 'col-span-2 bg-emerald text-white shadow-cta' : 'border border-line bg-surface text-ink'}`} data-testid={a.testid ?? `main-${a.key}`}>
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
