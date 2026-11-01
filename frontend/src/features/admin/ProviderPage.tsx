/** The provider console (docs/28): the product owner's business view — income and collections, who
 *  paid through which channel, what is pending / coming / overdue, every shop's package and time left,
 *  who uses the website / app and who the one-PC install, and the license keys (find, resend,
 *  renew, cancel, magic link). Super admin only. */

import { Copy, KeyRound, Link2, MessageCircle, RefreshCw, Send, Store, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Bars from '@/components/charts/Bars'
import { Empty, ErrorText, Loading, PageHeader, SearchBox, Sheet, fmtDate, fmtDateTime } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useGet, useInvalidate } from '@/lib/queries'
import { SITE } from './AppLinkCard'
import {withCur } from '@/lib/format'

type Tab = 'overview' | 'shops' | 'payments' | 'keys'
interface Overview {
  counts: Record<string, number>
  paying_shops: number; mrr: string; arpu: string; collected_total: string; collected_month: string; collected_prev_month: string
  pending_count: number; pending_amount: string
  coming_7: { count: number; amount: string }; coming_30: { count: number; amount: string }; overdue: { count: number; amount: string }
  by_channel: { method: string; count: number; amount: string }[]; by_plan: { plan: string; shops: number; mrr: string }[]
  monthly: { month: string; amount: string }[]; keys: { issued: number; redeemed: number; revoked: number }
}
interface ShopRow {
  organisation_id: string; shop_id: string; name: string; city: string | null; phone: string | null; plan: string; plan_status: string
  plan_expires_at: string | null; days_left: number | null; monthly_fee: string; paid_total: string; payments: number; pending_amount: string
  last_payment_at: string | null; last_payment_amount: string | null; last_channel: string | null
  deployment: 'cloud' | 'local'; online: boolean; last_used_at: string | null; install_version: string | null; keys_unused: number; keys_total: number
}
interface PayRow { id: string; shop_id: string; shop_name: string; plan: string; amount: string; method: string; reference: string | null; months: number; status: string; paid_on: string; receipt_no: string | null; note: string | null }
interface KeyRow {
  id: string; shop_id: string; shop_name: string | null; months: number; code: string; status: 'issued' | 'redeemed' | 'revoked'; note: string | null
  issued_at: string; redeemed_at: string | null; redeemed_where: string | null; revoked_at: string | null; revoke_reason: string | null
  sent_count: number; last_sent_at: string | null; last_sent_via: string | null; link_active: boolean; link_expires_at: string | null; view_count: number
}
interface SendOut { whatsapp: string; sms: string; text: string; link: string | null; key: KeyRow }

const rs = (v: string | number | null | undefined) => `${withCur(Math.round(Number(v ?? 0)).toLocaleString('en-US'))}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Tile({ label, value, sub, tone = 'bg-surface', testid }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; testid?: string }) {
  const { pick, ur, cls } = useLang()
  return (
    <div className={`flex flex-col gap-0.5 rounded-2xl border border-line px-3.5 py-3 ${tone}`} data-testid={testid}>
      <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(label)}</span>
      <span className="num text-xl leading-tight" dir="ltr">{value}</span>
      {sub ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{sub}</span> : null}
    </div>
  )
}

function StatusChip({ s }: { s: string }) {
  const { pick } = useLang()
  const tone = s === 'locked' || s === 'expired' ? 'bg-payable-tint text-payable' : s === 'due_soon' ? 'bg-[#F59E0B]/15 text-[#92400E]' : 'bg-emerald-tint text-emerald-deep'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{pick(`prov.st.${s}`)}</span>
}

function UseChip({ r }: { r: Pick<ShopRow, 'deployment' | 'online'> }) {
  const { pick } = useLang()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.deployment === 'local' ? 'bg-[#3B82F6]/15 text-[#1D4ED8]' : 'bg-ground text-ink'}`}>
      <span className={`h-2 w-2 rounded-full ${r.online ? 'bg-emerald' : 'bg-line'}`} />
      {pick(r.deployment === 'local' ? 'prov.local' : 'prov.cloud')}
    </span>
  )
}

export default function ProviderPage() {
  const { pick, ur, cls } = useLang()
  const isSuper = useAuth((s) => !!s.me?.user.is_superuser)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p })
  if (!isSuper) return <Navigate to="/" replace />
  return (
    <div className="flex flex-col gap-3" data-testid="provider-page">
      <PageHeader title="prov.title" />
      <BiSegmented<Tab> value={tab} onChange={setTab} options={[{ value: 'overview', text: 'prov.tab.overview' }, { value: 'shops', text: 'prov.tab.shops' }, { value: 'payments', text: 'prov.tab.payments' }, { value: 'keys', text: 'prov.tab.keys' }]} />
      {tab === 'overview' ? <OverviewTab go={setTab} /> : tab === 'shops' ? <ShopsTab /> : tab === 'payments' ? <PaymentsTab /> : <KeysTab />}
      <span className={`text-muted ${ur ? cls('sm') : 'text-xs'}`}>{pick('admin.only')}</span>
    </div>
  )
}

function OverviewTab({ go }: { go: (t: Tab) => void }) {
  const { pick } = useLang()
  const { data: o } = useGet<Overview>(['prov-overview'], '/api/v1/admin/business/overview')
  if (!o) return <Loading />
  const c = o.counts
  const n = (k: string, v: number) => pick(k).replace('{{n}}', String(v))
  return (
    <div className="flex flex-col gap-3" data-testid="prov-overview">
      <section className="hero flex flex-col gap-1 px-5 py-4">
        <span className="text-sm text-hero-text/80">{pick('prov.mrr')}</span>
        <span className="num text-3xl" dir="ltr">{rs(o.mrr)}</span>
        <span className="text-xs text-hero-text/75">{pick('prov.arpu')}: <span className="num" dir="ltr">{rs(o.arpu)}</span> · {n('prov.shopsN', c.paid)}</span>
      </section>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="prov.collectedMonth" value={rs(o.collected_month)} sub={<>{pick('prov.collectedPrev')}: <span className="num" dir="ltr">{rs(o.collected_prev_month)}</span></>} testid="prov-month" />
        <Tile label="prov.collectedTotal" value={rs(o.collected_total)} sub={n('prov.shopsN', o.paying_shops)} />
        <button type="button" onClick={() => go('payments')} className="text-start"><Tile label="prov.pending" value={rs(o.pending_amount)} sub={n('prov.shopsN', o.pending_count)} tone={o.pending_count ? 'bg-[#F59E0B]/10' : 'bg-surface'} /></button>
        <Tile label="prov.coming7" value={rs(o.coming_7.amount)} sub={n('prov.shopsN', o.coming_7.count)} />
        <Tile label="prov.coming30" value={rs(o.coming_30.amount)} sub={n('prov.shopsN', o.coming_30.count)} testid="prov-coming" />
        <Tile label="prov.overdue" value={rs(o.overdue.amount)} sub={n('prov.shopsN', o.overdue.count)} tone={o.overdue.count ? 'bg-payable-tint/50' : 'bg-surface'} testid="prov-overdue" />
        <Tile label="prov.onlineNow" value={c.online_now} sub={<>{pick('prov.activeToday')} {c.active_today} · {pick('prov.active7')} {c.active_7d}</>} />
        <button type="button" onClick={() => go('keys')} className="text-start"><Tile label="prov.keys" value={o.keys.issued} sub={<>{pick('prov.keysRedeemed')} {o.keys.redeemed} · {pick('prov.keysRevoked')} {o.keys.revoked}</>} /></button>
      </div>
      <section className="card flex flex-col gap-2">
        <BiLabel text="prov.byMonth" size="md" bold />
        <Bars data={o.monthly.map((m) => ({ label: MONTHS[Number(m.month.slice(5)) - 1], value: Number(m.amount), hint: `${m.month} · ${rs(m.amount)}` }))} testid="prov-monthly" />
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card flex flex-col gap-2" data-testid="prov-channels">
          <BiLabel text="prov.byChannel" size="md" bold />
          {!o.by_channel.length ? <BiLabel text="prov.none" size="sm" tone="text-muted" /> : o.by_channel.map((ch) => (
            <div key={ch.method} className="flex items-center justify-between gap-2 text-sm"><span className="font-bold capitalize">{ch.method.replace(/_/g, ' ')}</span><span className="num" dir="ltr">{ch.count} · {rs(ch.amount)}</span></div>
          ))}
        </section>
        <section className="card flex flex-col gap-2">
          <BiLabel text="prov.byPlan" size="md" bold />
          {o.by_plan.map((p) => (
            <div key={p.plan} className="flex items-center justify-between gap-2 text-sm"><span className="font-bold capitalize">{p.plan}</span><span className="num" dir="ltr">{n('prov.shopsN', p.shops)} · {rs(p.mrr)}{pick('prov.perMonth')}</span></div>
          ))}
        </section>
        <section className="card flex flex-col gap-2 lg:col-span-2">
          <BiLabel text="prov.usage" size="md" bold />
          <div className="grid grid-cols-2 gap-2">
            <Tile label="prov.cloud" value={c.cloud} />
            <Tile label="prov.local" value={c.local} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['ok', 'due_soon', 'expired', 'locked', 'unlimited'] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><StatusChip s={s} /><span className="num text-sm" dir="ltr">{c[s] ?? 0}</span></span>)}
            <span className="inline-flex items-center gap-1"><StatusChip s="trial" /><span className="num text-sm" dir="ltr">{c.trial}</span></span>
          </div>
        </section>
      </div>
    </div>
  )
}

function ShopsTab() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [dep, setDep] = useState<'' | 'cloud' | 'local'>('')
  const [st, setSt] = useState('')
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (dep) qs.set('deployment', dep)
  if (st) qs.set('status', st)
  const { data } = useGet<ShopRow[]>(['prov-shops', qs.toString()], `/api/v1/admin/business/shops?${qs}`)
  const [sel, setSel] = useState<ShopRow | null>(null)
  const chip = (on: boolean) => `tap h-9 rounded-full border-2 px-3 text-[12px] font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="common.search" />
      <div className="flex flex-wrap gap-1.5">
        {([['', 'prov.all'], ['cloud', 'prov.cloud'], ['local', 'prov.local']] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={dep === v} onClick={() => setDep(v)} className={chip(dep === v)}>{pick(t)}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([['', 'prov.all'], ['due', 'prov.st.due_soon'], ['expired', 'prov.st.expired'], ['locked', 'prov.st.locked'], ['ok', 'prov.st.ok']] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={st === v} onClick={() => setSt(v)} className={chip(st === v)}>{pick(t)}</button>)}
      </div>
      {!data ? <Loading /> : !data.length ? <Empty text="prov.none" /> : (
        <div className="card divide-y divide-line p-0" data-testid="prov-shops">
          {data.map((r) => (
            <button key={r.organisation_id} type="button" onClick={() => setSel(r)} className="tap flex w-full flex-col gap-1 px-4 py-3 text-start">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{r.name}{r.city ? <span className="font-medium text-muted"> · {r.city}</span> : null}</span>
                <span className="num text-sm" dir="ltr">{Number(r.monthly_fee) ? `${rs(r.monthly_fee)}${pick('prov.perMonth')}` : '—'}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-ground px-2 py-0.5 text-[11px] font-bold capitalize">{r.plan}</span>
                <StatusChip s={r.plan_status} />
                {r.days_left != null ? <span className={small} dir="ltr">{r.days_left >= 0 ? pick('prov.daysLeft').replace('{{n}}', String(r.days_left)) : pick('prov.daysOver').replace('{{n}}', String(-r.days_left))}</span> : null}
                <UseChip r={r} />
              </span>
              <span className={`text-muted ${small}`}>
                {pick('prov.paidTotal')} <span className="num" dir="ltr">{rs(r.paid_total)}</span>
                {r.last_channel ? <> · {pick('prov.lastPayment')} <span className="num" dir="ltr">{fmtDate(r.last_payment_at)}</span> ({r.last_channel})</> : null}
                {Number(r.pending_amount) ? <> · <span className="text-[#92400E]">{pick('prov.pending')} <span className="num" dir="ltr">{rs(r.pending_amount)}</span></span></> : null}
                {' · '}{pick('prov.lastUsed')} <span className="num" dir="ltr">{r.last_used_at ? fmtDateTime(r.last_used_at) : pick('prov.never')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? { en: sel.name, ur: sel.name, roman: sel.name } : 'prov.tab.shops'}>
        {sel ? <ShopSheet r={sel} onOpenAdmin={() => nav(`/admin?shop=${sel.shop_id}`)} /> : null}
      </Sheet>
    </div>
  )
}

function ShopSheet({ r, onOpenAdmin }: { r: ShopRow; onOpenAdmin: () => void }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const { data: pays } = useGet<{ rows: PayRow[] }>(['prov-shop-pays', r.shop_id], `/api/v1/admin/business/payments?q=${encodeURIComponent(r.name)}`)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const wa = (r.phone ?? '').replace(/^0/, '')
  const remind = `https://wa.me/92${wa}?text=${encodeURIComponent(`${r.name}: Mobile Shop — ${r.plan} plan ${r.days_left != null && r.days_left >= 0 ? `ends in ${r.days_left} days` : 'has ended'}. Fee ${rs(r.monthly_fee)} / month. More → Software fees to pay.`)}`
  return (
    <div className="flex flex-col gap-3" data-testid="prov-shop-sheet">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="prov.fee" value={`${rs(r.monthly_fee)}`} sub={<span className="capitalize">{r.plan}</span>} />
        <Tile label="prov.status" value={r.days_left != null ? (r.days_left >= 0 ? pick('prov.daysLeft').replace('{{n}}', String(r.days_left)) : pick('prov.daysOver').replace('{{n}}', String(-r.days_left))) : '∞'} sub={<StatusChip s={r.plan_status} />} />
        <Tile label="prov.paidTotal" value={rs(r.paid_total)} sub={`${r.payments}×`} />
        <Tile label="prov.lastUsed" value={r.last_used_at ? fmtDate(r.last_used_at) : pick('prov.never')} sub={<UseChip r={r} />} />
      </div>
      {r.install_version ? <span className={`text-muted ${small}`}>{pick('prov.version')} <span className="num" dir="ltr">{r.install_version}</span></span> : null}
      <BiLabel text="prov.deployment" size="md" tone="text-muted" />
      <BiSegmented<'cloud' | 'local'> value={r.deployment} onChange={async (v) => { await api('PATCH', `/api/v1/admin/shops/${r.shop_id}/deployment`, { deployment: v }); await inv('prov-shops', 'prov-overview'); r.deployment = v }} options={[{ value: 'cloud', text: 'prov.cloud' }, { value: 'local', text: 'prov.local' }]} />
      <div className="grid grid-cols-2 gap-2">
        {wa ? <a href={remind} target="_blank" rel="noopener noreferrer" className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald text-sm font-bold text-white"><MessageCircle size={18} /> {pick('prov.remind')}</a> : null}
        <BiButton text="prov.openAdmin" icon={<Store size={18} />} variant="secondary" onClick={onOpenAdmin} />
      </div>
      <BiLabel text="prov.tab.payments" size="md" bold />
      {!pays?.rows.filter((p) => p.shop_id === r.shop_id).length ? <BiLabel text="prov.none" size="sm" tone="text-muted" /> : (
        <div className="card divide-y divide-line p-0">
          {pays.rows.filter((p) => p.shop_id === r.shop_id).map((p) => <PayLine key={p.id} p={p} />)}
        </div>
      )}
      <BiLabel text="prov.keys" size="md" bold />
      <KeyList shopId={r.shop_id} shopName={r.name} />
    </div>
  )
}

function PayLine({ p }: { p: PayRow }) {
  const { pick, ur, cls } = useLang()
  const tone = p.status === 'approved' ? 'text-emerald-deep' : p.status === 'pending' ? 'text-[#92400E]' : 'text-payable'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">{p.shop_name} <span className="font-semibold capitalize text-muted">· {p.method.replace(/_/g, ' ')}</span></span>
        <span className={`truncate text-muted ${ur ? cls('sm') : 'text-xs'}`} dir="ltr">{fmtDate(p.paid_on)} · {p.months}m{p.reference ? ` · ${p.reference}` : ''}{p.receipt_no ? ` · ${p.receipt_no}` : ''}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="num text-sm" dir="ltr">{rs(p.amount)}</span>
        <span className={`text-[11px] font-bold ${tone}`}>{pick(`prov.st.${p.status}`)}</span>
      </span>
    </div>
  )
}

function PaymentsTab() {
  const { pick } = useLang()
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const qs = new URLSearchParams()
  if (method) qs.set('method', method)
  if (status) qs.set('status', status)
  if (q) qs.set('q', q)
  const { data } = useGet<{ rows: PayRow[]; approved_total: string; methods: string[] }>(['prov-pays', qs.toString()], `/api/v1/admin/business/payments?${qs}`)
  const chip = (on: boolean) => `tap h-9 rounded-full border-2 px-3 text-[12px] font-bold capitalize ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`
  const csv = () => {
    if (!data) return
    const head = 'date,shop,channel,amount,months,status,reference,receipt\n'
    const body = data.rows.map((p) => [p.paid_on, p.shop_name, p.method, p.amount, p.months, p.status, p.reference ?? '', p.receipt_no ?? ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([head + body], { type: 'text/csv' }))
    a.download = 'software-fees.csv'
    a.click()
  }
  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={q} onChange={setQ} placeholder="common.search" />
      <div className="flex flex-wrap gap-1.5" data-testid="prov-pay-channels">
        <button type="button" aria-pressed={!method} onClick={() => setMethod('')} className={chip(!method)}>{pick('prov.allChannels')}</button>
        {(data?.methods ?? []).map((m) => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={chip(method === m)}>{m.replace(/_/g, ' ')}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {([['', 'prov.all'], ['pending', 'prov.st.pending'], ['approved', 'prov.st.approved'], ['rejected', 'prov.st.rejected']] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={chip(status === v)}>{pick(t)}</button>)}
      </div>
      {!data ? <Loading /> : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">{pick('prov.approvedTotal')}: <span className="num" dir="ltr">{rs(data.approved_total)}</span></span>
            <button type="button" onClick={csv} className="tap rounded-full border border-line px-3 py-1.5 text-xs font-bold">{pick('prov.exportCsv')}</button>
          </div>
          {!data.rows.length ? <Empty text="prov.none" /> : <div className="card divide-y divide-line p-0" data-testid="prov-pays">{data.rows.map((p) => <PayLine key={p.id} p={p} />)}</div>}
        </>
      )}
    </div>
  )
}

function KeysTab() {
  const { pick } = useLang()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [making, setMaking] = useState(false)
  const chip = (on: boolean) => `tap h-9 rounded-full border-2 px-3 text-[12px] font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`
  return (
    <div className="flex flex-col gap-2">
      <BiLabel text="prov.key.hint" size="sm" tone="text-muted" />
      <BiButton text="prov.key.generate" icon={<KeyRound size={18} />} full onClick={() => setMaking(true)} />
      <SearchBox value={q} onChange={setQ} placeholder="common.search" />
      <div className="flex flex-wrap gap-1.5">
        {([['', 'prov.all'], ['issued', 'prov.key.issued'], ['redeemed', 'prov.key.redeemed'], ['revoked', 'prov.key.revoked']] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={chip(status === v)}>{pick(t)}</button>)}
      </div>
      <KeyList status={status} q={q} />
      <Sheet open={making} onClose={() => setMaking(false)} title="prov.key.generate">
        {making ? <MakeKey /> : null}
      </Sheet>
    </div>
  )
}

function MakeKey({ shopId, shopName }: { shopId?: string; shopName?: string }) {
  const { pick } = useLang()
  const inv = useInvalidate()
  const [shopQ, setShopQ] = useState('')
  const [shop, setShop] = useState<{ id: string; name: string } | null>(shopId ? { id: shopId, name: shopName ?? '' } : null)
  const [months, setMonths] = useState('1')
  const [note, setNote] = useState('')
  const [made, setMade] = useState<KeyRow | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const { data: shops } = useGet<ShopRow[]>(['prov-shops-pick', shopQ], !shop ? `/api/v1/admin/business/shops?q=${encodeURIComponent(shopQ)}` : null)
  if (made) return <div className="flex flex-col gap-2"><BiAlert text="prov.key.made" kind="success" /><KeyCard k={made} /></div>
  return (
    <div className="flex flex-col gap-3" data-testid="make-key">
      <BiLabel text="prov.key.forShop" size="md" tone="text-muted" />
      {shop ? (
        <button type="button" onClick={() => !shopId && setShop(null)} className="tap rounded-2xl border border-emerald bg-emerald-tint px-4 py-3 text-start font-bold text-emerald-deep">{shop.name}</button>
      ) : (
        <>
          <SearchBox value={shopQ} onChange={setShopQ} placeholder="common.search" />
          <div className="card max-h-60 divide-y divide-line overflow-y-auto p-0">
            {(shops ?? []).slice(0, 30).map((s) => <button key={s.shop_id} type="button" onClick={() => setShop({ id: s.shop_id, name: s.name })} className="tap w-full px-4 py-2.5 text-start text-sm font-bold">{s.name}{s.city ? <span className="font-medium text-muted"> · {s.city}</span> : null}</button>)}
          </div>
        </>
      )}
      <div className="grid grid-cols-4 gap-2">
        {['1', '3', '6', '12'].map((m) => <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)} className={`tap min-h-12 rounded-2xl border-2 font-bold ${months === m ? 'border-ink bg-ink text-ground' : 'border-line bg-surface'}`}>{pick('prov.key.months').replace('{{n}}', m)}</button>)}
      </div>
      <BiInput label="prov.key.note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      <ErrorText error={err} />
      <BiButton text="prov.key.generate" icon={<KeyRound size={18} />} full disabled={!shop} onClick={async () => {
        try {
          const r = await api<{ key: KeyRow }>('POST', `/api/v1/admin/shops/${shop!.id}/renewal-code`, { months: Number(months), note: note || null })
          setMade(r.key)
          await inv('prov-keys', 'prov-overview', 'prov-shops')
        } catch (e) { setErr(e) }
      }} />
    </div>
  )
}

function KeyList({ shopId, shopName, status, q }: { shopId?: string; shopName?: string; status?: string; q?: string }) {
  const [making, setMaking] = useState(false)
  const qs = new URLSearchParams()
  if (shopId) qs.set('shop_id', shopId)
  if (status) qs.set('status', status)
  if (q) qs.set('q', q)
  const { data } = useGet<KeyRow[]>(['prov-keys', qs.toString()], `/api/v1/admin/business/keys?${qs}`)
  return (
    <div className="flex flex-col gap-2" data-testid="prov-keys">
      {shopId ? <BiButton text="prov.key.generate" icon={<KeyRound size={18} />} variant="secondary" full onClick={() => setMaking(true)} /> : null}
      {!data ? <Loading /> : !data.length ? <Empty text="prov.none" /> : data.map((k) => <KeyCard key={k.id} k={k} />)}
      {shopId ? <Sheet open={making} onClose={() => setMaking(false)} title="prov.key.generate">{making ? <MakeKey shopId={shopId} shopName={shopName} /> : null}</Sheet> : null}
    </div>
  )
}

function KeyCard({ k: initial }: { k: KeyRow }) {
  const { pick, ur, cls } = useLang()
  const inv = useInvalidate()
  const [k, setK] = useState(initial)
  const [copied, setCopied] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const tone = k.status === 'issued' ? 'bg-emerald-tint text-emerald-deep' : k.status === 'redeemed' ? 'bg-ground text-muted' : 'bg-payable-tint text-payable'
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text) } catch { /* no clipboard: the text is shown */ } setCopied(what); setTimeout(() => setCopied(null), 1800) }
  const send = async (via: 'whatsapp' | 'sms' | 'copy' | 'link') => {
    try {
      const r = await api<SendOut>('POST', `/api/v1/admin/keys/${k.id}/send`, { via, site: SITE })
      setK(r.key)
      setLink(r.link)
      if (via === 'whatsapp') window.open(r.whatsapp, '_blank', 'noopener')
      else if (via === 'sms') window.location.href = r.sms
      else if (via === 'copy') await copy(r.text, 'key')
      else if (r.link) await copy(r.link, 'link')
      await inv('prov-overview')
    } catch (e) { setErr(e) }
  }
  const act = async (path: string, body: unknown) => {
    try { const r = await api<KeyRow | { key: KeyRow }>('POST', `/api/v1/admin/keys/${k.id}/${path}`, body); setK('key' in r ? r.key : r); await inv('prov-keys', 'prov-overview', 'prov-shops') } catch (e) { setErr(e) }
  }
  const btn = 'tap flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-2 text-xs font-bold'
  return (
    <div className="card flex flex-col gap-2" data-testid="key-card">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{k.shop_name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{pick(`prov.key.${k.status}`)}</span>
        <span className="num text-sm" dir="ltr">{pick('prov.key.months').replace('{{n}}', String(k.months))}</span>
      </div>
      <span className="num break-all rounded-xl bg-ground px-3 py-2 text-[11px] leading-snug" dir="ltr" data-testid="key-code">{k.code}</span>
      <span className={`text-muted ${small}`}>
        <span dir="ltr">{fmtDateTime(k.issued_at)}</span>
        {k.sent_count ? <> · {pick('prov.key.sent').replace('{{n}}', String(k.sent_count))}{k.last_sent_via ? ` (${k.last_sent_via})` : ''}</> : null}
        {k.view_count ? <> · {pick('prov.key.viewed').replace('{{n}}', String(k.view_count))}</> : null}
        {k.redeemed_at ? <> · {pick('prov.key.redeemed')} <span dir="ltr">{fmtDate(k.redeemed_at)}</span>{k.redeemed_where ? ` ${pick(`prov.key.where.${k.redeemed_where}`)}` : ''}</> : null}
        {k.revoked_at ? <> · {pick('prov.key.revoked')}{k.revoke_reason ? `: ${k.revoke_reason}` : ''}</> : null}
        {k.note ? <> · {k.note}</> : null}
      </span>
      {link && k.status === 'issued' ? <span className="num select-all break-all text-[11px] text-emerald-deep" dir="ltr" data-testid="key-link">{link}</span> : null}
      {k.status === 'issued' ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button type="button" onClick={() => send('whatsapp')} className="tap flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald px-2 text-xs font-bold text-white"><MessageCircle size={15} /> {pick('prov.key.whatsapp')}</button>
          <button type="button" onClick={() => send('sms')} className={btn}><Send size={15} /> {pick('prov.key.sms')}</button>
          <button type="button" onClick={() => send('copy')} className={btn}><Copy size={15} /> {copied === 'key' ? pick('prov.key.copied') : pick('prov.key.copy')}</button>
          <button type="button" onClick={() => send('link')} className={btn} data-testid="copy-link"><Link2 size={15} /> {copied === 'link' ? pick('prov.key.copied') : pick('prov.key.copyLink')}</button>
          <button type="button" onClick={() => act('renew', {})} className={btn}><RefreshCw size={15} /> {pick('prov.key.renew')}</button>
          <button type="button" onClick={() => act('link', {})} className={btn}><Link2 size={15} /> {pick('prov.key.newLink')}</button>
          <button type="button" onClick={() => { const reason = window.prompt(pick('prov.key.revokeWhy')); if (reason !== null) void act('revoke', { reason: reason || null }) }} className={`${btn} text-payable`}><XCircle size={15} /> {pick('prov.key.revoke')}</button>
        </div>
      ) : k.status === 'redeemed' ? (
        <button type="button" onClick={() => act('renew', { revoke_old: false })} className={btn}><RefreshCw size={15} /> {pick('prov.key.renew')}</button>
      ) : null}
      <ErrorText error={err} />
    </div>
  )
}
