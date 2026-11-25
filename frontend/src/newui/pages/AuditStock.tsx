/** Shop audit → Stock & ageing in the new product (ADR-134), drawn from mock-up 22's sixth tab ("live
 *  stock & ageing audit"): every phone in stock with its condition / PTA, supplier, age, cost and
 *  asking, filtered by condition, PTA and age band and searched by IMEI / model / supplier, with a
 *  "Verify ID" / "Set rate" that opens the phone's page; the age bands and what needs attention;
 *  the stock by every dimension with the supplier exposure and the top lists (`?tab=summary`); the ID
 *  checks with every skip and who made it (`?tab=verification`).
 *
 *  Every figure is the live audit's: `/shop-audit/inventory` (as-of when chosen), `/inventory/ageing`
 *  and `/verification`; the reports are the live report's `ageing` / `inventory` / `verification`.
 *  The app only filters and searches the server's rows. A phone's ID check and price are changed on
 *  its page, never here. The drawing's age bands are the shop's own (Settings → stock audit
 *  thresholds). Cost and margin for the owner / manager, as the server. */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Search, ShieldAlert, Smartphone } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { useGet } from '@/lib/queries'
import { useAuditPeriod } from '@/features/audit/period'
import { AuditFrame } from './Audit'
import { Caps, HBars, Pill, Secret, SectionReport, Segs, Table, Tile, Wait, card, n, useTab, type M } from '../auditKit'

interface Dim { key: string; count: number; cost: M | null; asking: M }
interface Row { device_id: string; label: string; brand: string; imei1: string; category: string; condition: string; pta_status: string; verification_status: string; status: string; supplier: string | null; supplier_id: string | null; purchase_no: string | null; intake_date: string | null; days: number; band: string; cost: M | null; asking: M | null; margin: M | null; margin_pct: number | null }
interface Summary { by_supplier?: { party_id: string | null; name: string | null; count: number; cost: M | null; asking: M }[]; count: number; cost_value: M | null; asking_value: M; expected_margin: M | null; expected_margin_pct: number | null; unpriced: number; no_cost: number; by_condition: Dim[]; by_pta: Dim[]; by_verification: Dim[]; by_category: Dim[]; by_brand: { brand: string; count: number; cost: M | null; asking: M }[]; status_counts: Record<string, number>; most_expensive_cost: Row[]; most_expensive_asking: Row[]; highest_margin: Row[]; lowest_margin: Row[] }
interface Alert { kind: string; device_id: string; label: string; imei1: string; days: number; cost: M | null; margin_pct: number | null; supplier: string | null; times?: number }
interface Ageing { band_keys: string[]; band_edges: number[]; bands: { band: string; count: number; cost: M | null; asking: M }[]; rows: Row[]; alerts: Alert[] }
interface Verification { in_stock: Record<string, number>; all_devices: Record<string, number>; checks_in_period: Record<string, number>; bypasses: number; rows: { at: string; device_id: string; label: string; imei1: string; party_name: string | null; user_name: string | null; reason: string | null; previous: string | null }[]; by_user: { user_name: string | null; bypasses: number; flagged_bypassed: number; intakes: number; share: number | null; unusual: boolean }[] }

const TABS = ['ageing', 'summary', 'verification'] as const
const CONDITIONS = ['box_pack', 'open_box', 'used', 'patched']
const PTAS = ['pta_approved', 'non_pta', 'jv', 'cpid', 'unknown']

export default function NewAuditStock() {
  const { pick } = useLang()
  const { period } = useAuditPeriod()
  const [tab, setTab] = useTab(TABS)
  const asOfQ = period.asOf ? `?as_of=${period.asOf}` : ''
  const { data: sum } = useGet<Summary>(['audit-inventory', asOfQ], `/api/v1/shop-audit/inventory${asOfQ}`)
  return (
    <AuditFrame section="stock" testid="nstk">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segs tabs={TABS} value={tab} onChange={setTab} label={(t) => pick(t === 'summary' ? 'audit.inv.summary' : t === 'ageing' ? 'audit.inv.ageing' : 'audit.inv.verification')} testid="nstk-tab" />
        <SectionReport sections={[tab === 'summary' ? 'inventory' : tab]} name="stock-audit" testid="nstk-report" />
      </div>
      {!sum ? <Wait /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="nstk-kpis">
          <Tile tone="dark" Icon={Smartphone} label={pick(period.asOf ? 'audit.inv.inStockAsOf' : 'audit.inv.inStock')} value={<>{sum.count} <span className="text-base">{pick('audit.phones')}</span></>} testid="nstk-count" sub={sum.unpriced ? <><span dir="ltr">{sum.unpriced}</span> {pick('audit.inv.unpriced')}</> : null} />
          {sum.cost_value != null ? <Tile label={pick('audit.atCost')} value={<Secret>{withCur(n(sum.cost_value))}</Secret>} testid="nstk-cost" /> : null}
          <Tile tone="lime" label={pick('audit.atAsking')} value={withCur(n(sum.asking_value))} testid="nstk-asking" />
          {sum.expected_margin != null ? <Tile tone="emerald" label={pick('audit.inv.expectedMargin')} value={<Secret>{withCur(n(sum.expected_margin))}</Secret>} testid="nstk-margin" sub={sum.expected_margin_pct != null ? <Secret><span dir="ltr">{sum.expected_margin_pct}%</span></Secret> : null} /> : null}
        </div>
      )}
      {tab === 'ageing' ? <AgeingTab /> : tab === 'summary' ? (sum ? <SummaryTab sum={sum} /> : null) : <VerificationTab />}
    </AuditFrame>
  )
}

function AgeingTab() {
  const { pick } = useLang()
  const { data: age } = useGet<Ageing>(['audit-ageing'], '/api/v1/shop-audit/inventory/ageing')
  const [cond, setCond] = useState('')
  const [pta, setPta] = useState('')
  const [band, setBand] = useState('')
  const [q, setQ] = useState('')
  const rows = useMemo(() => (age?.rows ?? []).filter((r) => (!cond || r.condition === cond) && (!pta || r.pta_status === pta) && (!band || r.band === band) && (!q.trim() || `${r.label} ${r.imei1} ${r.supplier ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [age, cond, pta, band, q])
  if (!age) return <Wait />
  const bandLabel = (k: string) => { const i = age.band_keys.indexOf(k); const e = age.band_edges; return `${pick(`audit.band.${k}`)} ${i === 0 ? `≤${e[0]}` : i > 0 && i < e.length ? `${e[i - 1] + 1}–${e[i]}` : `>${e[e.length - 1]}`}` }
  const sel = 'px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 font-semibold text-xs'
  const late = (b: string) => age.band_keys.indexOf(b) >= age.band_keys.length - 2
  return (
    <div className="space-y-5">
      <section className={`p-4 sm:p-5 space-y-3 ${card}`} data-testid="nstk-bands">
        <div><h3 className="font-display font-extrabold text-sm">{pick('audit.inv.ageing')}</h3><p className="text-[11px] text-slate-500">{pick('audit.inv.ageHint')}</p></div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{age.bands.map((b) => (
          <button key={b.band} type="button" onClick={() => setBand(band === b.band ? '' : b.band)} aria-pressed={band === b.band} className={`p-3 rounded-xl border text-start cursor-pointer ${band === b.band ? 'border-obsidian-950 dark:border-[#A3E635] ring-1 ring-obsidian-950 dark:ring-[#A3E635]' : 'border-slate-200 dark:border-slate-800'} ${late(b.band) ? 'bg-rose-500/10' : 'bg-slate-50 dark:bg-obsidian-850'}`} data-testid={`nstk-band-${b.band}`}>
            <div className="text-[11px] font-bold text-slate-500">{bandLabel(b.band)} {pick('audit.days')}</div>
            <div className="font-display font-extrabold text-xl" dir="ltr">{b.count}</div>
            <div className="text-[10px] text-slate-500" dir="ltr">{b.cost != null ? <Secret>{withCur(n(b.cost))}</Secret> : withCur(n(b.asking))}</div>
          </button>
        ))}</div>
        <Link to="/new/more/settings" className="inline-block text-[11px] font-bold text-slate-500 underline">{pick('audit.inv.thresholds')}</Link>
      </section>

      {age.alerts.length ? (
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nstk-alerts">
          <h3 className="font-display font-extrabold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />{pick('audit.inv.alerts')} <span className="text-xs font-normal text-slate-400">(<span dir="ltr">{age.alerts.length}</span>)</span></h3>
          <div className="flex flex-wrap gap-2">{age.alerts.slice(0, 30).map((a, i) => (
            <Link key={i} to={`/new/item/${a.device_id}`} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${a.kind === 'verification_flagged' || a.kind === 'dead_stock' ? 'bg-rose-500/10 border-rose-500/25 text-rose-800 dark:text-rose-300' : 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300'}`}>{pick(`audit.alert.${a.kind}`)} · <span dir="auto">{a.label}</span> · <span dir="ltr">{a.days}</span> {pick('audit.days')}{a.times ? <span dir="ltr"> ×{a.times}</span> : null}</Link>
          ))}</div>
        </section>
      ) : null}

      <section className={`p-4 sm:p-5 space-y-4 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-display font-extrabold text-sm sm:text-base">{pick('nau.stk.title')}</h3><p className="text-xs text-slate-500">{pick('nau.stk.hint')}</p></div>
          <div className="flex flex-wrap gap-2 text-xs w-full sm:w-auto">
            <select value={cond} onChange={(e) => setCond(e.target.value)} aria-label={pick('audit.inv.dim.condition')} className={sel} data-testid="nstk-f-cond"><option value="">{pick('nau.stk.allConditions')}</option>{CONDITIONS.map((c) => <option key={c} value={c}>{pick(`stock.condition.${c}`)}</option>)}</select>
            <select value={pta} onChange={(e) => setPta(e.target.value)} aria-label="PTA" className={sel} data-testid="nstk-f-pta"><option value="">{pick('nau.stk.allPta')}</option>{PTAS.map((c) => <option key={c} value={c}>{pick(`stock.pta.${c}`)}</option>)}</select>
            <select value={band} onChange={(e) => setBand(e.target.value)} aria-label={pick('audit.inv.ageing')} className={sel} data-testid="nstk-f-age"><option value="">{pick('nau.stk.allAges')}</option>{age.band_keys.map((b) => <option key={b} value={b}>{bandLabel(b)} {pick('audit.days')}</option>)}</select>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none sm:w-56"><Search className="w-3.5 h-3.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nau.stk.search')} className="min-w-0 flex-1 bg-transparent outline-none" data-testid="nstk-search" /></label>
          </div>
        </div>
        {!rows.length ? <p className="py-8 text-center text-sm text-slate-400">{pick('audit.noData')}</p> : (
          <Table head={[pick('nau.stk.device'), pick('nau.stk.condPta'), pick('nau.sa.supplier'), pick('nau.stk.age'), pick('nau.sa.cost'), pick('nau.stk.asking'), '']} testid="nstk-rows">
            {rows.map((r) => {
              const check = r.verification_status === 'pending' || r.verification_status === 'flagged'
              return (
                <tr key={r.device_id} className="hover:bg-slate-50 dark:hover:bg-obsidian-850">
                  <td className="py-2.5 px-3"><Link to={`/new/item/${r.device_id}`} className="font-bold hover:underline" dir="auto">{r.label}</Link><div className="font-mono text-[11px] text-slate-400" dir="ltr">{r.imei1}</div></td>
                  <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-obsidian-800 font-semibold whitespace-nowrap">{pick(`stock.condition.${r.condition}`)} · {pick(`stock.pta.${r.pta_status}`)}</span></td>
                  <td className="py-2.5 px-3">{r.supplier_id ? <Link to={`/new/parties/${r.supplier_id}`} className="hover:underline" dir="auto">{r.supplier}</Link> : <span className="text-slate-400">{pick('audit.inv.noSupplier')}</span>}{r.intake_date ? <div className="text-[10px] text-slate-400" dir="ltr">{r.purchase_no ? `${r.purchase_no} · ` : ''}{fmtDate(r.intake_date)}</div> : null}</td>
                  <td className="py-2.5 px-3"><Pill tone={late(r.band) ? 'rose' : 'emerald'}><span dir="ltr">{r.days}</span> {pick('audit.days')}</Pill></td>
                  <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr">{r.cost != null ? <Secret>{n(r.cost)}</Secret> : '—'}</td>
                  <td className="py-2.5 px-3 text-end font-mono font-bold" dir="ltr">{r.asking != null ? <>{n(r.asking)}{r.margin_pct != null ? <div className="text-[10px] font-normal text-slate-400"><Secret>{r.margin_pct}%</Secret></div> : null}</> : <span className="text-rose-500">{pick('nau.stk.notSet')}</span>}</td>
                  <td className="py-2.5 px-3 text-end whitespace-nowrap space-x-1 rtl:space-x-reverse">
                    {check ? <Link to={`/new/item/${r.device_id}`} className="inline-block px-2 py-1 rounded bg-amber-500 text-obsidian-950 font-bold text-[10px]">{pick('nau.stk.verify')}</Link> : null}
                    {r.asking == null ? <Link to={`/new/item/${r.device_id}`} className="inline-block px-2 py-1 rounded bg-[#A3E635] text-obsidian-950 font-bold text-[10px]">{pick('nau.stk.setRate')}</Link> : !check ? <span className="text-emerald-600 font-bold text-[10px]">{pick('nau.stk.ready')}</span> : null}
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
      </section>
    </div>
  )
}

function SummaryTab({ sum }: { sum: Summary }) {
  const { pick } = useLang()
  const dimLabel = (kind: string, key: string) => pick(kind === 'condition' ? `stock.condition.${key}` : kind === 'pta' ? `stock.pta.${key}` : kind === 'verification' ? `stock.verification.${key}` : `devcat.${key}`)
  return (
    <div className="space-y-5">
      {sum.by_supplier?.length ? (
        <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nstk-suppliers">
          <h3 className="font-display font-extrabold text-sm">{pick('nau.stk.exposure')}</h3>
          <Table head={[pick('nau.sa.supplier'), pick('audit.phones'), pick('audit.atCost'), pick('audit.atAsking')]}>
            {sum.by_supplier.slice(0, 20).map((r, i) => (
              <tr key={i}><td className="py-2 px-3 font-bold">{r.party_id ? <Link to={`/new/parties/${r.party_id}`} className="hover:underline" dir="auto">{r.name}</Link> : pick('audit.inv.noSupplier')}</td><td className="py-2 px-3 font-mono" dir="ltr">{r.count}</td><td className="py-2 px-3 font-mono" dir="ltr">{r.cost != null ? <Secret>{n(r.cost)}</Secret> : '—'}</td><td className="py-2 px-3 font-mono" dir="ltr">{n(r.asking)}</td></tr>
            ))}
          </Table>
        </section>
      ) : null}
      <p className="text-[11px] text-slate-500">{pick('audit.inv.dimsHint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="nstk-dims">
        {([['condition', sum.by_condition], ['pta', sum.by_pta], ['verification', sum.by_verification], ['category', sum.by_category]] as const).map(([kind, rows]) => (
          <section key={kind} className={`p-4 space-y-2 ${card}`}>
            <Caps className="text-slate-500">{pick(`audit.inv.dim.${kind}`)}</Caps>
            <HBars rows={rows.filter((r) => r.count).map((r) => ({ key: r.key, label: dimLabel(kind, r.key), value: r.count, hint: <span dir="ltr">{r.cost != null ? <Secret>{n(r.cost)}</Secret> : null}{r.cost != null ? ' → ' : ''}{n(r.asking)}</span> }))} tone="bg-[#65A30D] dark:bg-[#A3E635]" />
          </section>
        ))}
      </div>
      {sum.by_brand.length ? <section className={`p-4 space-y-2 ${card}`}><Caps className="text-slate-500">{pick('audit.inv.byBrand')}</Caps><HBars rows={sum.by_brand.slice(0, 12).map((b) => ({ key: b.brand, label: b.brand, value: b.count, hint: <span dir="ltr">{withCur(n(b.asking))}</span> }))} tone="bg-sky-500" /></section> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500" data-testid="nstk-status">{Object.entries(sum.status_counts).filter(([, v]) => v).map(([k, v]) => <span key={k}>{pick(`stock.status.${k}`)}: <b dir="ltr">{v}</b></span>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sum.most_expensive_cost.length && sum.cost_value != null ? <Top title={pick('audit.inv.topCost')} rows={sum.most_expensive_cost} value={(r) => <Secret>{n(r.cost)}</Secret>} /> : null}
        <Top title={pick('audit.inv.topAsking')} rows={sum.most_expensive_asking} value={(r) => n(r.asking)} />
        {sum.cost_value != null ? <Top title={pick('audit.inv.topMargin')} rows={sum.highest_margin} value={(r) => <Secret>{n(r.margin)} ({r.margin_pct}%)</Secret>} /> : null}
        {sum.cost_value != null ? <Top title={pick('audit.inv.lowMargin')} rows={sum.lowest_margin} value={(r) => <Secret>{n(r.margin)} ({r.margin_pct}%)</Secret>} /> : null}
      </div>
    </div>
  )
}

function Top({ title, rows, value }: { title: string; rows: Row[]; value: (r: Row) => ReactNode }) {
  return (
    <section className={`p-4 space-y-1 ${card}`}>
      <Caps className="text-slate-500">{title}</Caps>
      {!rows.length ? <p className="text-xs text-slate-400">—</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{rows.map((r) => <Link key={r.device_id} to={`/new/item/${r.device_id}`} className="py-2 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.label}</div><div className="text-[10px] text-slate-400" dir="ltr">{r.imei1} · {r.days} d</div></div><span className="font-mono font-bold shrink-0" dir="ltr">{value(r)}</span></Link>)}</div>}
    </section>
  )
}

function VerificationTab() {
  const { pick } = useLang()
  const { query } = useAuditPeriod()
  const role = useAuth((s) => s.me?.user.role)
  const { data: ver } = useGet<Verification>(['audit-verification', query], `/api/v1/shop-audit/verification?${query}`)
  if (!ver) return <Wait />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="nstk-ver">
        {(['clear', 'pending', 'flagged', 'not_required'] as const).map((k) => <Tile key={k} tone={k === 'flagged' ? 'rose' : k === 'pending' ? 'amber' : k === 'clear' ? 'emerald' : 'plain'} label={pick(`stock.verification.${k}`)} value={ver.in_stock[k] ?? 0} testid={`nstk-ver-${k}`} sub={<>{pick('audit.inv.inStock')} · {pick('audit.inv.allTime')} <span dir="ltr">{ver.all_devices[k] ?? 0}</span></>} />)}
      </div>
      <p className="text-xs text-slate-500">{pick('audit.inv.checksInPeriod')}: {Object.entries(ver.checks_in_period).map(([k, v]) => `${pick(`stock.verification.${k}`)} ${v}`).join(' · ') || '—'}</p>
      <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nstk-ver-users">
        <h3 className="font-display font-extrabold text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" />{pick('audit.inv.bypasses')} <span className="text-xs font-normal text-slate-400">(<span dir="ltr">{ver.bypasses}</span>)</span></h3>
        <p className="text-[11px] text-slate-500">{pick('audit.inv.bypassHint')}</p>
        {ver.by_user.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{ver.by_user.map((u, i) => <div key={i} className="py-2 flex items-center justify-between gap-2"><span className="font-bold" dir="auto">{u.user_name ?? '—'}{u.unusual ? <span className="ms-2"><Pill tone="rose">{pick('audit.inv.unusual')}</Pill></span> : null}</span><span className="text-slate-500"><span dir="ltr">{u.bypasses}</span> {pick('audit.inv.skipped')}{u.flagged_bypassed ? <> · <span className="text-rose-600" dir="ltr">{u.flagged_bypassed}</span> {pick('stock.verification.flagged')}</> : null} · <span dir="ltr">{u.intakes}</span> {pick('audit.inv.intakes')}{u.share != null ? <> · <span dir="ltr">{u.share}%</span></> : null}</span></div>)}</div> : <p className="text-xs text-slate-400">—</p>}
      </section>
      <section className={`p-4 sm:p-5 space-y-2 ${card}`} data-testid="nstk-ver-rows">
        {!ver.rows.length ? <p className="text-xs text-slate-400">{pick('audit.inv.noBypass')}</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">{ver.rows.map((r, i) => (
          <Link key={i} to={`/new/item/${r.device_id}`} className="py-2.5 flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold truncate" dir="auto">{r.label} <span className="font-mono font-normal text-slate-400" dir="ltr">· {r.imei1}</span></div><div className="text-[11px] text-slate-500"><span dir="auto">{r.user_name ?? '—'}</span> · <span dir="ltr">{fmtDateTime(r.at)}</span>{r.party_name ? ` · ${r.party_name}` : ''}{r.reason ? ` · ${r.reason}` : ''}{r.previous ? ` · ${pick('audit.inv.was')} ${pick(`stock.verification.${r.previous}`)}` : ''}</div></div><Smartphone className="w-4 h-4 text-slate-400 shrink-0" /></Link>
        ))}</div>}
      </section>
      {role === 'owner' ? <Link to="/new/audit/staff?tab=security" className="inline-block text-xs font-bold underline text-slate-500">{pick('nau.stk.toSecurity')}</Link> : null}
    </div>
  )
}
