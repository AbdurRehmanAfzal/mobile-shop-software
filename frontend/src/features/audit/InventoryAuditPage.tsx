/** Shop Audit → Stock (docs/16 §6, §7, §9 — docs/17 P6-5): what is in stock in every dimension
 *  (now or on the chosen day), the age of each unit in the shop's own bands with alerts, and the
 *  ID-check audit with the bypasses by employee. Every row opens the phone. */

import { AlertTriangle, ShieldAlert, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import Donut from '@/components/charts/Donut'
import { Empty, Loading, fmtDate, fmtDateTime } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

type M = string
type Tab = 'summary' | 'ageing' | 'verification'
interface Dim { key: string; count: number; cost: M | null; asking: M }
interface Row { device_id: string; label: string; brand: string; model: string; imei1: string; category: string; condition: string; pta_status: string; verification_status: string; status: string; supplier: string | null; supplier_id: string | null; purchase_no: string | null; intake_date: string | null; days: number; band: string; cost: M | null; asking: M | null; margin: M | null; margin_pct: number | null }
interface Summary { as_of: string | null; count: number; cost_value: M | null; asking_value: M; expected_margin: M | null; expected_margin_pct: number | null; unpriced: number; no_cost: number; by_condition: Dim[]; by_pta: Dim[]; by_verification: Dim[]; by_category: Dim[]; by_brand: { brand: string; count: number; cost: M | null; asking: M }[]; status_counts: Record<string, number>; most_expensive_cost: Row[]; most_expensive_asking: Row[]; highest_margin: Row[]; lowest_margin: Row[]; prefs: { age_bands: number[]; high_value: number; low_margin_pct: number } }
interface Alert { kind: string; device_id: string; label: string; imei1: string; days: number; cost: M | null; asking: M | null; margin_pct: number | null; supplier: string | null; times?: number }
interface Ageing { band_keys: string[]; band_edges: number[]; bands: { band: string; count: number; cost: M | null; asking: M }[]; rows: Row[]; alerts: Alert[]; alert_counts: Record<string, number>; prefs: { high_value: number; low_margin_pct: number } }
interface Verification { in_stock: Record<string, number>; all_devices: Record<string, number>; checks_in_period: Record<string, number>; bypasses: number; rows: { at: string; device_id: string; label: string; imei1: string; party_name: string | null; purchase_no: string | null; user_name: string | null; reason: string | null; previous: string | null; status_now: string; device_status: string }[]; by_user: { user_name: string | null; bypasses: number; flagged_bypassed: number; intakes: number; share: number | null; unusual: boolean }[]; prefs: { bypass_share: number; bypass_min: number } }

const n = (v: M | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))

export default function InventoryAuditPage() {
  const { pick, ur, cls } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const { period, query } = useAuditPeriod()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const tab = ((['summary', 'ageing', 'verification'] as const).find((t) => t === sp.get('tab')) ?? 'summary') as Tab
  const setTab = (t: Tab) => { const o = new URLSearchParams(sp); o.set('tab', t); setSp(o, { replace: true }) }
  const asOfQ = period.asOf ? `?as_of=${period.asOf}` : ''
  const { data: sum } = useGet<Summary>(['audit-inventory', asOfQ], tab === 'summary' ? `/api/v1/shop-audit/inventory${asOfQ}` : null)
  const { data: age } = useGet<Ageing>(['audit-ageing'], tab === 'ageing' ? '/api/v1/shop-audit/inventory/ageing' : null)
  const { data: ver } = useGet<Verification>(['audit-verification', query], tab === 'verification' ? `/api/v1/shop-audit/verification?${query}` : null)
  const [band, setBand] = useState<string | null>(null)
  const [dim, setDim] = useState<{ kind: string; key: string } | null>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const dimLabel = (kind: string, key: string) => pick(kind === 'condition' ? `stock.condition.${key}` : kind === 'pta' ? `stock.pta.${key}` : kind === 'verification' ? `stock.verification.${key}` : `devcat.${key}`)
  const ageRows = useMemo(() => (age ? age.rows.filter((r) => !band || r.band === band) : []), [age, band])
  const bandLabel = (k: string, i: number, edges: number[]) => `${pick(`audit.band.${k}`)} ${i === 0 ? `≤${edges[0]}` : i < 4 ? `${edges[i - 1] + 1}–${edges[i]}` : `>${edges[3]}`}`
  const stockLink = (kind: string, key: string) => `/stock?${kind === 'condition' ? 'condition' : kind === 'pta' ? 'pta_status' : kind === 'category' ? 'category' : 'verification'}=${key}`

  return (
    <AuditLayout>
      <BiSegmented<Tab> value={tab} onChange={setTab} options={[{ value: 'summary', text: 'audit.inv.summary' }, { value: 'ageing', text: 'audit.inv.ageing' }, { value: 'verification', text: 'audit.inv.verification' }]} />

      {tab === 'summary' ? (!sum ? <Loading /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="inv-kpis">
            <Kpi k={period.asOf ? 'audit.inv.inStockAsOf' : 'audit.inv.inStock'} v={`${sum.count}`} sub={`${pick('audit.phones')}${sum.unpriced ? ` · ${sum.unpriced} ${pick('audit.inv.unpriced')}` : ''}`} tone="bg-stockt text-stockt-fg" />
            {canCost ? <Kpi k="audit.atCost" v={`Rs. ${n(sum.cost_value)}`} tone="bg-buy text-buy-fg" /> : null}
            <Kpi k="audit.atAsking" v={`Rs. ${n(sum.asking_value)}`} tone="bg-sell text-sell-fg" />
            {canCost ? <Kpi k="audit.inv.expectedMargin" v={`Rs. ${n(sum.expected_margin)}`} sub={sum.expected_margin_pct != null ? `${sum.expected_margin_pct}%` : undefined} tone="bg-emerald-tint text-emerald-deep" /> : null}
          </section>
          <section className="grid gap-2 sm:grid-cols-2" data-testid="inv-donuts">
            <div className="card"><BiLabel text="audit.chart.byCondition" size="sm" tone="text-muted" bold /><Donut data={sum.by_condition.map((d) => ({ label: dimLabel('condition', d.key), value: d.count, key: d.key }))} onTap={(s) => nav(stockLink('condition', String(s.key)))} empty="audit.noData" unit={pick('audit.phones')} /></div>
            <div className="card"><BiLabel text="audit.chart.byVerification" size="sm" tone="text-muted" bold /><Donut data={sum.by_verification.map((d) => ({ label: dimLabel('verification', d.key), value: d.count, key: d.key }))} onTap={() => nav('/stock')} empty="audit.noData" unit={pick('audit.phones')} /></div>
          </section>
          <BiLabel text="audit.inv.dimsHint" size="sm" tone="text-muted" />
          <section className="grid gap-2 sm:grid-cols-2" data-testid="inv-dims">
            {([['condition', sum.by_condition], ['pta', sum.by_pta], ['verification', sum.by_verification], ['category', sum.by_category]] as const).map(([kind, rows]) => (
              <div key={kind} className="card flex flex-col gap-1.5">
                <BiLabel text={`audit.inv.dim.${kind}`} size="sm" tone="text-muted" bold />
                {rows.filter((r) => r.count).map((r) => (
                  <Link key={r.key} to={stockLink(kind, r.key)} onClick={() => setDim({ kind, key: r.key })} className="tap flex items-center justify-between gap-2 rounded-xl px-1 py-0.5">
                    <span className={`font-bold ${ur ? cls('sm') : 'text-sm'}`}>{dimLabel(kind, r.key)}</span>
                    <span className={`text-muted ${small}`}><span className="num font-bold text-ink">{r.count}</span>{r.cost != null ? <> · <span className="num" dir="ltr">{n(r.cost)}</span></> : null} · <span className="num" dir="ltr">{n(r.asking)}</span></span>
                  </Link>
                ))}
                {!rows.some((r) => r.count) ? <span className={`text-muted ${small}`}>—</span> : null}
              </div>
            ))}
          </section>
          {sum.by_brand.length ? (
            <section className="card"><BiLabel text="audit.inv.byBrand" size="sm" tone="text-muted" bold /><Bars data={sum.by_brand.slice(0, 12).map((b) => ({ label: b.brand, value: b.count, hint: `Rs. ${n(b.asking)}` }))} tone="rgb(var(--emerald))" height={110} /></section>
          ) : null}
          <div className={`flex flex-wrap gap-x-4 text-muted ${small}`} data-testid="inv-status">
            {Object.entries(sum.status_counts).filter(([, v]) => v).map(([k, v]) => <span key={k}>{pick(`stock.status.${k}`)}: <span className="num">{v}</span></span>)}
          </div>
          <section className="grid gap-2 sm:grid-cols-2">
            {canCost ? <TopList title="audit.inv.topCost" rows={sum.most_expensive_cost} value={(r) => n(r.cost)} testid="top-cost" /> : null}
            <TopList title="audit.inv.topAsking" rows={sum.most_expensive_asking} value={(r) => n(r.asking)} testid="top-asking" />
            {canCost ? <TopList title="audit.inv.topMargin" rows={sum.highest_margin} value={(r) => `${n(r.margin)} (${r.margin_pct}%)`} testid="top-margin" /> : null}
            {canCost ? <TopList title="audit.inv.lowMargin" rows={sum.lowest_margin} value={(r) => `${n(r.margin)} (${r.margin_pct}%)`} testid="low-margin" /> : null}
          </section>
          {dim ? null : null}
        </>
      )) : null}

      {tab === 'ageing' ? (!age ? <Loading /> : (
        <>
          <BiLabel text="audit.inv.ageHint" size="sm" tone="text-muted" />
          <section className="card" data-testid="age-bands">
            <Bars data={age.bands.map((b, i) => ({ label: bandLabel(b.band, i, age.band_edges), value: b.count, hint: canCost ? `Rs. ${n(b.cost)}` : `Rs. ${n(b.asking)}`, key: b.band }))} tone="rgb(var(--emerald))" onTap={(b) => setBand(band === b.key ? null : (b.key as string))} empty="audit.noData" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {age.bands.map((b, i) => <button key={b.band} type="button" aria-pressed={band === b.band} onClick={() => setBand(band === b.band ? null : b.band)} className={`tap h-9 rounded-full border px-3 font-bold ${band === b.band ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-xs'}`}>{bandLabel(b.band, i, age.band_edges)} · {b.count}</button>)}
              <Link to="/more/settings" className={`tap h-9 rounded-full border border-line bg-surface px-3 font-bold leading-9 text-muted ${ur ? cls('sm') : 'text-xs'}`}>{pick('audit.inv.thresholds')}</Link>
            </div>
          </section>
          {age.alerts.length ? (
            <section className="card flex flex-col gap-1.5" data-testid="age-alerts">
              <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-payable" /><BiLabel text="audit.inv.alerts" size="md" bold /><span className={`text-muted ${small}`}>({age.alerts.length})</span></div>
              {age.alerts.slice(0, 30).map((a, i) => (
                <Link key={i} to={`/stock/${a.device_id}`} className="tap flex items-center gap-3 rounded-xl px-1 py-1">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 ${a.kind === 'verification_flagged' || a.kind === 'dead_stock' ? 'bg-payable-tint text-payable' : 'bg-receivable-tint text-receivable'} ${ur ? cls('sm') : 'text-[11px] font-bold'}`}>{pick(`audit.alert.${a.kind}`)}</span>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{a.label} <span className="font-medium text-muted" dir="ltr">· {a.imei1}</span></span><span className={`text-muted ${small}`}><span className="num">{a.days}</span> {pick('audit.days')}{a.cost != null ? <> · {pick('audit.atCost')} <span className="num" dir="ltr">{n(a.cost)}</span></> : null}{a.margin_pct != null ? <> · <span className="num">{a.margin_pct}%</span></> : null}{a.times ? <> · ×{a.times}</> : null}{a.supplier ? ` · ${a.supplier}` : ''}</span></span>
                </Link>
              ))}
            </section>
          ) : null}
          {!ageRows.length ? <Empty text="audit.noData" /> : (
            <div className="card divide-y divide-line p-0" data-testid="age-rows">
              {ageRows.map((r) => (
                <Link key={r.device_id} to={`/stock/${r.device_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{r.label} <span className="font-medium text-muted" dir="ltr">· {r.imei1}</span></span>
                    <span className={`text-muted ${small}`}>{pick(`stock.condition.${r.condition}`)} · {pick(`stock.pta.${r.pta_status}`)}{r.supplier ? ` · ${r.supplier}` : ''}{r.intake_date ? <> · <span dir="ltr">{fmtDate(r.intake_date)}</span></> : null}{r.verification_status === 'pending' || r.verification_status === 'flagged' ? ` · ${pick(`stock.verification.${r.verification_status}`)}` : ''}</span>
                  </span>
                  <span className="flex flex-col items-end"><span className="num font-bold" dir="ltr">{r.days} {pick('audit.days')}</span><span className={`text-muted ${small}`} dir="ltr">{r.cost != null ? `${n(r.cost)} → ` : ''}{n(r.asking)}{r.margin_pct != null ? ` (${r.margin_pct}%)` : ''}</span></span>
                </Link>
              ))}
            </div>
          )}
        </>
      )) : null}

      {tab === 'verification' ? (!ver ? <Loading /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="ver-kpis">
            {(['clear', 'pending', 'flagged', 'not_required'] as const).map((k) => <Kpi key={k} k={`stock.verification.${k}`} v={`${ver.in_stock[k] ?? 0}`} sub={`${pick('audit.inv.inStock')} · ${pick('audit.inv.allTime')} ${ver.all_devices[k] ?? 0}`} tone={k === 'flagged' ? 'bg-payable-tint text-payable' : k === 'pending' ? 'bg-receivable-tint text-receivable' : 'bg-emerald-tint text-emerald-deep'} />)}
          </section>
          <div className={`text-muted ${small}`}>{pick('audit.inv.checksInPeriod')}: {Object.entries(ver.checks_in_period).map(([k, v]) => `${pick(`stock.verification.${k}`)} ${v}`).join(' · ')}</div>
          <section className="card flex flex-col gap-1.5" data-testid="ver-users">
            <div className="flex items-center gap-2"><ShieldAlert size={18} /><BiLabel text="audit.inv.bypasses" size="md" bold /><span className={`text-muted ${small}`}>({ver.bypasses})</span></div>
            <BiLabel text="audit.inv.bypassHint" size="sm" tone="text-muted" />
            {ver.by_user.length ? ver.by_user.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="font-bold">{u.user_name ?? '—'}{u.unusual ? <span className={`ms-2 rounded-full bg-payable-tint px-2 py-0.5 text-payable ${ur ? cls('sm') : 'text-[11px]'}`}>{pick('audit.inv.unusual')}</span> : null}</span>
                <span className={`text-muted ${small}`}><span className="num">{u.bypasses}</span> {pick('audit.inv.skipped')}{u.flagged_bypassed ? <> · <span className="num text-payable">{u.flagged_bypassed}</span> {pick('stock.verification.flagged')}</> : null} · <span className="num">{u.intakes}</span> {pick('audit.inv.intakes')}{u.share != null ? <> · <span className="num">{u.share}%</span></> : null}</span>
              </div>
            )) : <span className={`text-muted ${small}`}>—</span>}
          </section>
          {ver.rows.length ? (
            <div className="card divide-y divide-line p-0" data-testid="ver-rows">
              {ver.rows.map((r, i) => (
                <Link key={i} to={`/stock/${r.device_id}`} className="tap flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{r.label} <span className="font-medium text-muted" dir="ltr">· {r.imei1}</span></span>
                    <span className={`text-muted ${small}`}>{r.user_name ?? '—'} · <span dir="ltr">{fmtDateTime(r.at)}</span>{r.party_name ? ` · ${r.party_name}` : ''}{r.reason ? ` · ${r.reason}` : ''}{r.previous ? ` · ${pick('audit.inv.was')} ${pick(`stock.verification.${r.previous}`)}` : ''}</span>
                  </span>
                  <Smartphone size={16} className="text-muted" />
                </Link>
              ))}
            </div>
          ) : <Empty text="audit.inv.noBypass" />}
        </>
      )) : null}
    </AuditLayout>
  )
}

function Kpi({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone: string }) {
  const { ur, cls } = useLang()
  return (
    <div className="card flex min-w-0 flex-col gap-1">
      <span className={`inline-flex w-fit rounded-xl px-2 py-0.5 ${tone} ${ur ? cls('sm') : 'text-[11px] font-bold'}`}><BiLabel text={k} size="sm" tone="text-current" bold /></span>
      <span className="num text-xl font-bold" dir="ltr">{v}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span> : null}
    </div>
  )
}

function TopList({ title, rows, value, testid }: { title: string; rows: Row[]; value: (r: Row) => string; testid: string }) {
  const { ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="card flex flex-col gap-1 p-0" data-testid={testid}>
      <div className="px-4 pt-3"><BiLabel text={title} size="sm" tone="text-muted" bold /></div>
      {!rows.length ? <div className={`px-4 pb-3 text-muted ${small}`}>—</div> : rows.map((r) => (
        <Link key={r.device_id} to={`/stock/${r.device_id}`} className="tap flex items-center gap-3 border-t border-line px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-bold">{r.label}</span><span className={`text-muted ${small}`} dir="ltr">{r.imei1} · {r.days} d</span></span>
          <span className="num font-bold" dir="ltr">{value(r)}</span>
        </Link>
      ))}
    </div>
  )
}
