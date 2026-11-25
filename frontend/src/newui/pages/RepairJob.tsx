/** A repair job's page in the new product (ADR-134), drawn from `08-repair-job-detail.html`: a full
 *  screen with the file's own bar (the shop, the F2 – F10 pills with Repair lit, the job / new intake
 *  tabs, language, dark), the open jobs to switch between, and two columns — the job (its card with
 *  the customer, staff, IMEI and what came with it, Call and the WhatsApp status link; the four-step
 *  progress you tap to move it; the bill with what is left and Collect; the history) and on the right
 *  the 80 mm slip in the chosen language with Print sticker, Print slip, Download PDF and Share link.
 *
 *  Everything is the live job (`GET /repairs/{id}`) and its live actions: the status
 *  (`POST /repairs/{id}/status`), the work charge (`PATCH /repairs/{id}` labour), back from a lab
 *  (ADR-044), the delivery, the delete with a reason (ADR-087, owner / manager); the slip and the
 *  sticker that print are the server's (`/repairs/{id}/job-sheet?lang=`, `/labels/repairs`), the
 *  preview is only a drawing; the status link is the live public page (`/r/{token}`).
 *
 *  Differences from the drawing: a deleted job cannot be restored (the live software keeps a deleted
 *  repair as Deleted for good), so "Restore job" is not built; once given back, what is left is on the
 *  customer's khata, so Collect opens the khata; parts are edited on the full repair page. */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Banknote, Check, Download, FileText, FlaskConical, Languages, MessageCircle, Moon, Pencil, PhoneCall, PlusCircle, Printer, Share2, Smartphone, Sun, Tag, Trash2, User, X } from 'lucide-react'
import i18n from 'i18next'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { downloadFile, openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { stickerPath } from '@/features/repairs/RepairSticker'
import { BackWindow, DeliverWindow, type Fault, type Job } from './Repairs'

type M = string
interface Full extends Job { labour: M; parts: { description: string; qty: number; unit_price: M }[]; status_log: { to_status: string; note: string | null; user_name: string | null; at: string }[]; status_token?: string | null }
const LIME = '#A3E635'
const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const stage = (s: string) => (s === 'received' ? 0 : s === 'repaired' || s === 'unclaimed' ? 2 : s === 'delivered' ? 3 : s === 'cancelled' || s === 'returned_unrepaired' ? -1 : 1)

export default function NewRepairJob() {
  const { id } = useParams()
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const canCost = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { data: j } = useGet<Full>(['repair', id], id ? `/api/v1/repairs/${id}` : null)
  const { data: open } = useGet<Job[]>(['repairs', true, ''], '/api/v1/repairs?open_only=true')
  const { data: faults } = useGet<Fault[]>(['faults'], '/api/v1/repairs/fault-codes')
  const [docLang, setDocLang] = useState<'en' | 'ur'>(ur ? 'ur' : 'en')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [labourOpen, setLabourOpen] = useState(false)
  const [labour, setLabour] = useState('')
  const [back, setBack] = useState(false)
  const [deliver, setDeliver] = useState(false)
  const [del, setDel] = useState(false)
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2800); return () => clearTimeout(x) }, [toast])
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F7: '/new/repairs', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const PILLS: [string, string, string][] = [['/new/sale/new', 'counter.sell', 'F2'], ['/new/purchase/new', 'counter.addStock', 'F3'], ['/new/khata', 'counter.khata', 'F4'], ['/new/stock/summary', 'counter.stock', 'F6'], ['/new/repairs', 'counter.repair', 'F7'], ['/new/expenses', 'counter.expense', 'F8'], ['/new/return/new', 'counter.returnJob', 'F9'], ['/new/invoices', 'inv.short', 'F10']]
  const tDoc = i18n.getFixedT(docLang)
  const faultName = (c: string, lang: 'en' | 'ur' = ur ? 'ur' : 'en') => { const f = faults?.find((x) => x.code === c); return f ? (lang === 'ur' ? f.ur : f.en) : c }

  async function setStatus(s: string) {
    if (!j) return
    setBusy(true)
    try { await api('POST', `/api/v1/repairs/${j.id}/status`, { status: s }); await inv('repair', 'repairs'); setToast(t('njob.moved', { s: pick(`repair.status.${s}`) })) } catch (e) { setToast(errText(e, ur)) } finally { setBusy(false) }
  }
  async function saveLabour() {
    if (!j) return
    setBusy(true)
    try { await api('PATCH', `/api/v1/repairs/${j.id}`, { labour: Number(labour || 0) }); await inv('repair', 'repairs'); setLabourOpen(false); setToast(pick('ncash.saved')) } catch (e) { setToast(errText(e, ur)) } finally { setBusy(false) }
  }
  const tap = (k: number) => {
    if (!j || busy) return
    const cur = stage(j.status)
    if (cur < 0 || cur === 3) return
    if (k === 1 && cur !== 1) void setStatus('in_progress')
    else if (k === 2 && cur !== 2) void setStatus('repaired')
    else if (k === 3) setDeliver(true)
  }
  const statusLink = j?.status_token ? `${window.location.origin}/r/${j.status_token}` : ''
  const shareLink = () => { if (!j) return; const msg = t('njob.linkText', { who: j.party_name ?? '', model: j.device_desc, no: j.no, link: statusLink, shop: shop?.name ?? '' }); window.open(`https://wa.me/${waNumber(j.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener') }
  const sticker = () => { if (!j) return; let p = { size: '58x40', fields: ['shop', 'no', 'barcode', 'customer', 'phone', 'device', 'fault', 'promised'], copies: 1 }; try { p = { ...p, ...(JSON.parse(localStorage.getItem('mobileshop.repairStickerPrefs') ?? 'null') ?? {}) } } catch { /* private window */ } void openPrintable(stickerPath([j.id], p as Parameters<typeof stickerPath>[1])) }

  const cur = j ? stage(j.status) : 0
  const closed = j ? j.status === 'cancelled' || j.status === 'delivered' || j.status === 'returned_unrepaired' : true
  const statusLabel = (s: string) => (s === 'cancelled' ? pick('sale.status.void') : pick(`repair.status.${s}`))
  const stamp = (s: number) => j?.status_log.find((l) => stage(l.to_status) === s)?.at
  const left = num(j?.balance_due)
  const billed = num(j?.total) > 0

  return (
    <div style={{ '--nl': LIME } as CSSProperties} className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex flex-col" data-testid="njob" data-newui="1" data-file="08">
      {/* ===== BAR ===== */}
      <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 py-2.5 z-30 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => nav('/new')} className="flex items-center gap-2.5 text-start cursor-pointer">
            <div className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
            <div><div className="flex items-center gap-2"><span className="font-display font-extrabold text-sm sm:text-base tracking-tight" dir="auto">{ur ? shop?.name_ur || shop?.name : shop?.name}</span>{shop?.city ? <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">{shop.city}</span> : null}</div><div className={`text-[11px] text-slate-500 dark:text-slate-400 font-semibold ${ur ? cls('sm') : ''}`}>{pick('njob.module')}</div></div>
          </button>
          <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
            {PILLS.map(([to, label, key]) => to === '/new/repairs' ? <NavLink key={to} to={to} className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-[#A3E635] text-slate-950 whitespace-nowrap">{pick(label)} <span className="text-[9px] opacity-70" dir="ltr">{key}</span></NavLink> : <NavLink key={to} to={to} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 whitespace-nowrap">{pick(label)} <span className="text-[9px] text-slate-400" dir="ltr">{key}</span></NavLink>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <span className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{pick('njob.tabDetail')} {j ? <span dir="ltr">({j.no})</span> : null}</span>
            <NavLink to="/new/repairs" className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><PlusCircle className="w-3.5 h-3.5" />{pick('nrep.tabIntake')}</NavLink>
          </div>
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="njob-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
        </div>
      </header>

      {!j ? <div className="flex-1 p-10 text-center text-xs text-slate-400">…</div> : (
        <main className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
          <div className="w-full lg:w-[60%] lg:h-full lg:overflow-y-auto p-4 sm:p-5 space-y-4 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800">
            {/* switch job */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5" data-testid="njob-switch">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{pick('njob.switch')}</span>
              {[j, ...(open ?? []).filter((x) => x.id !== j.id)].slice(0, 6).map((x) => <button key={x.id} type="button" onClick={() => nav(`/new/repairs/${x.id}`)} className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer ${x.id === j.id ? 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}><span className="font-mono text-[10px]" dir="ltr">{x.no}</span><span dir="auto">{x.device_desc}</span><span className="opacity-70">({statusLabel(x.status)})</span></button>)}
            </div>

            {/* the job */}
            <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3.5" data-testid="njob-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-md bg-obsidian-900 dark:bg-obsidian-800 text-[#A3E635]" dir="ltr">{j.no}</span><h1 className="font-display font-extrabold text-lg sm:text-xl tracking-tight" dir="auto">{j.device_desc}</h1>{j.fault_codes.slice(0, 2).map((c) => <span key={c} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300">{faultName(c)}</span>)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex flex-wrap items-center gap-2"><User className="w-3.5 h-3.5" /><span className="font-semibold text-slate-800 dark:text-slate-200" dir="auto">{j.party_name ?? '—'}</span>{j.party_phone ? <><span>•</span><span className="font-mono" dir="ltr">{j.party_phone}</span></> : null}<span>•</span><span>{pick('njob.staff')}: <b className="text-slate-800 dark:text-slate-200">{j.technician_name ?? pick('nrep.any')}</b></span></div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${j.status === 'cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' : j.status === 'delivered' ? 'bg-slate-100 text-slate-600 border-slate-200' : cur === 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`} data-testid="njob-status"><span className={`w-1.5 h-1.5 rounded-full ${j.status === 'cancelled' ? 'bg-rose-500' : cur === 2 ? 'bg-emerald-500' : 'bg-amber-500'}`} />{statusLabel(j.status)}</span>
                  {canCost && !closed ? <button type="button" onClick={() => setDel(true)} className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="njob-delete"><Trash2 className="w-3.5 h-3.5" />{pick('crud.delete')}</button> : null}
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-500"><Smartphone className="w-3.5 h-3.5" /><span>IMEI: <span className="font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">{j.imei || '—'}</span></span><span>•</span><span>{pick('njob.accessories')}: <b className="text-slate-800 dark:text-slate-200">{j.received_accessories.length ? j.received_accessories.map((x) => pick(`repair.acc.${x}`)).join(', ') : '—'}</b></span></div>
                <div className="flex items-center gap-2">
                  {j.party_phone ? <a href={`tel:${j.party_phone}`} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 font-bold flex items-center gap-1.5"><PhoneCall className="w-3.5 h-3.5 text-blue-600" />{pick('njob.call')}</a> : null}
                  {j.party_phone && statusLink ? <button type="button" onClick={shareLink} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer" data-testid="njob-wa"><MessageCircle className="w-3.5 h-3.5" />{pick('njob.statusLink')}</button> : null}
                </div>
              </div>
              {j.at_lab ? (
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/60 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="njob-lab">
                  <span className="flex items-center gap-1.5 font-bold text-blue-800 dark:text-blue-300"><FlaskConical className="w-4 h-4" />{pick('nrep.labWord')}: <span dir="auto">{j.at_lab.lab_name}</span>{canCost ? <span className="font-mono" dir="ltr">· {rs(j.at_lab.quoted_cost)}</span> : null}{j.at_lab.expected_back ? <span className="font-normal">· {pick('nrep.backBy')} <span dir="ltr">{fmtDate(j.at_lab.expected_back)}</span></span> : null}</span>
                  <button type="button" onClick={() => setBack(true)} className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold cursor-pointer" data-testid="njob-back">{pick('nrep.backFromLab')}</button>
                </div>
              ) : null}
            </section>

            {/* progress */}
            <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{pick('njob.progress')}</span>{cur < 0 ? <span className="text-[11px] font-bold text-rose-600">{pick('njob.closedNote')}</span> : null}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="njob-steps">
                {(['njob.s1', 'njob.s2', 'njob.s3', 'njob.s4'] as const).map((k, i) => {
                  const done = cur >= i, now = cur === i
                  const at = stamp(i) ?? (i === 0 ? j.created_at : undefined)
                  return (
                    <button key={k} type="button" onClick={() => tap(i)} disabled={cur < 0 || cur === 3 || i === 0 || (j.at_lab != null && i > 0)} data-testid={`njob-step-${i}`}
                      className={`p-3 rounded-xl text-start border transition-all disabled:cursor-default cursor-pointer ${now ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-obsidian-900 dark:bg-obsidian-850 text-white' : done ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900' : 'bg-white dark:bg-obsidian-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-400'}`}>
                      <div className="flex items-center justify-between"><span className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${now ? 'bg-[#A3E635] text-slate-950' : done ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-500'}`}>{done && !now ? <Check className="w-3 h-3" /> : i + 1}</span><span className={`font-mono text-[10px] ${now ? 'text-slate-300' : 'text-slate-400'}`} dir="ltr">{done && at ? fmtDate(at) : pick('njob.pending')}</span></div>
                      <div className={`mt-2 text-xs font-bold ${now ? 'text-white' : ''}`}>{i + 1}. {pick(k)}</div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* the bill */}
            <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3.5" data-testid="njob-bill">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center"><Banknote className="w-4 h-4" /></span><h2 className="font-display font-bold text-sm sm:text-base">{pick('njob.billTitle')}</h2></div>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${left > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{pick(left > 0 ? 'njob.remaining' : 'njob.settled')}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Cell k="njob.workCharge" v={rs(j.labour)} action={!closed ? <button type="button" onClick={() => { setLabour(String(num(j.labour) || num(j.estimate))); setLabourOpen(true) }} aria-label={pick('common.edit')} className="text-slate-400 hover:text-slate-800 cursor-pointer" data-testid="njob-labour-edit"><Pencil className="w-3 h-3" /></button> : null} />
                <Cell k="njob.totalBill" v={rs(billed ? j.total : j.estimate)} sub={billed ? undefined : pick('nrep.estimate')} />
                <Cell k="njob.advance" v={`− ${rs(j.advance)}`} tone="text-emerald-600" />
                <Cell k="njob.paidNow" v={rs(Math.max(0, num(j.paid) - num(j.advance)))} tone="text-emerald-600" />
              </div>
              {labourOpen ? (
                <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="njob-labour">
                  <label className="flex-1 min-w-[160px]"><span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('njob.workCharge')}</span><input type="number" min={0} value={labour} onChange={(e) => setLabour(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm font-extrabold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" dir="ltr" data-testid="njob-labour-input" /></label>
                  <button type="button" onClick={() => void saveLabour()} disabled={busy} className="px-4 py-2 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 text-xs font-bold cursor-pointer" data-testid="njob-labour-save">{pick('common.save')}</button>
                  <button type="button" onClick={() => setLabourOpen(false)} className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer">{pick('common.cancel')}</button>
                  <button type="button" onClick={() => nav(`/repairs/${j.id}`)} className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer">{pick('njob.parts')}</button>
                </div>
              ) : null}
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-3">
                <div><div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">{pick(billed ? 'njob.remainingBig' : 'njob.leftEstimate')}</div><div className="font-display font-extrabold text-2xl text-slate-900 dark:text-white" dir="ltr" data-testid="njob-left">{rs(billed ? left : Math.max(0, num(j.estimate) - num(j.advance)))}</div></div>
                {j.status === 'delivered' && left > 0 && j.party_id ? <button type="button" onClick={() => nav(`/new/parties/${j.party_id}`)} className="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="njob-collect"><Banknote className="w-4 h-4" />{t('njob.collect', { n: rs(left) })}</button>
                  : !closed ? <button type="button" onClick={() => setDeliver(true)} className="px-4 py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="njob-deliver"><Banknote className="w-4 h-4" />{pick('nrep.deliver')}</button> : null}
              </div>
            </section>

            {/* history */}
            <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3" data-testid="njob-history">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{pick('njob.history')}</span><span className="text-[11px] text-slate-400">{pick('njob.historyNote')}</span></div>
              <div className="space-y-2">{[...j.status_log].reverse().map((l, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2"><span className={`w-2 h-2 rounded-full mt-1.5 ${l.to_status === 'cancelled' ? 'bg-rose-500' : l.to_status === 'delivered' || l.to_status === 'repaired' ? 'bg-emerald-500' : 'bg-slate-400'}`} /><div><div className="text-xs font-bold">{statusLabel(l.to_status)}{l.note ? <span className="font-normal text-slate-500" dir="auto"> — {l.note}</span> : null}</div><div className="text-[11px] text-slate-500">{pick('njob.staff')}: {l.user_name ?? '—'}</div></div></div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0" dir="ltr">{fmtDateTime(l.at)}</span>
                </div>
              ))}</div>
            </section>
          </div>

          {/* the slip */}
          <div className="w-full lg:w-[40%] lg:h-full flex flex-col bg-slate-100/80 dark:bg-obsidian-900/60">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
              <div className="w-full max-w-sm flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />{pick('njob.slipTitle')}</span>
                <div className="flex items-center bg-white dark:bg-obsidian-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">{(['en', 'ur'] as const).map((l) => <button key={l} type="button" onClick={() => setDocLang(l)} aria-pressed={docLang === l} className={`px-2.5 py-1 rounded-md cursor-pointer ${docLang === l ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold text-slate-600'}`} data-testid={`njob-doc-${l}`}>{l === 'en' ? 'English' : 'اردو'}</button>)}</div>
              </div>
              <div className="w-full max-w-sm bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-lg p-5 space-y-3.5" dir={docLang === 'ur' ? 'rtl' : 'ltr'} data-testid="njob-slip">
                <div className="border-b-2 border-dashed border-slate-200 pb-3 text-center"><div className="font-display font-extrabold text-base tracking-tight uppercase" dir="auto">{docLang === 'ur' ? shop?.name_ur || shop?.name : shop?.name}</div>{shop?.city ? <div className="text-[11px] text-slate-500">{shop.city}</div> : null}<div className="mt-2 inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold" dir="ltr"><span>{j.no}</span><span>•</span><span>{tDoc('njob.receipt')}</span></div></div>
                <div className="text-xs space-y-1 border-b border-dashed border-slate-200 pb-3">
                  <SlipRow k={tDoc('nrep.customer')} v={<b dir="auto">{j.party_name ?? '—'}</b>} />
                  <SlipRow k={tDoc('nrep.contact')} v={<span className="font-mono" dir="ltr">{j.party_phone ?? '—'}</span>} />
                  <SlipRow k={tDoc('njob.accessories')} v={<span>{j.received_accessories.map((x) => tDoc(`repair.acc.${x}`)).join(', ') || '—'}</span>} />
                  <SlipRow k={tDoc('njob.handledBy')} v={<span dir="auto">{j.technician_name ?? tDoc('nrep.any')}</span>} />
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{tDoc('njob.deviceFault')}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">{j.status === 'cancelled' ? tDoc('sale.status.void') : tDoc(`repair.status.${j.status}`)}</span></div>
                  <div className="font-display font-extrabold text-sm" dir="auto">{j.device_desc}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600"><span>{j.fault_codes.map((c) => faultName(c, docLang)).join(', ') || j.fault_text}</span>{j.imei ? <span className="font-mono" dir="ltr">IMEI: {j.imei}</span> : null}</div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <SlipRow k={tDoc('njob.workCharge')} v={<span dir="ltr">{rs(j.labour)}</span>} />
                  <SlipRow k={tDoc('njob.totalBill')} v={<b dir="ltr">{rs(billed ? j.total : j.estimate)}</b>} />
                  <SlipRow k={tDoc('njob.advance')} v={<span className="text-emerald-700" dir="ltr">− {rs(j.advance)}</span>} />
                  <SlipRow k={tDoc('njob.paidNow')} v={<span className="text-emerald-700" dir="ltr">− {rs(Math.max(0, num(j.paid) - num(j.advance)))}</span>} />
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200"><span className="font-extrabold uppercase">{tDoc('njob.remainingBig')}:</span><span className="font-display font-extrabold text-lg" dir="ltr">{rs(billed ? left : Math.max(0, num(j.estimate) - num(j.advance)))}</span></div>
                </div>
                <div className="pt-2 text-center border-t border-dashed border-slate-200"><div className="font-mono text-lg tracking-[0.25em] font-bold text-slate-800 select-none" aria-hidden dir="ltr">|||| ||| || |||| |||</div><div className="text-[10px] text-slate-400 mt-0.5">{tDoc('njob.slipFoot', { shop: shop?.name ?? '' })}</div></div>
              </div>
            </div>
            <div className="shrink-0 p-4 bg-white dark:bg-obsidian-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
              <button type="button" onClick={sticker} className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="njob-sticker"><Tag className="w-4 h-4 text-blue-600" />{pick('njob.printSticker')}</button>
              <button type="button" onClick={() => void openPrintable(`/api/v1/repairs/${j.id}/job-sheet?lang=${docLang}`)} className="py-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="njob-print"><Printer className="w-4 h-4" />{pick('njob.printSlip')}</button>
              <button type="button" onClick={() => void downloadFile(`/api/v1/repairs/${j.id}/job-sheet?lang=${docLang}`, `repair-${j.no}.html`)} className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Download className="w-4 h-4" />{pick('njob.download')}</button>
              <button type="button" onClick={shareLink} disabled={!statusLink || !j.party_phone} className="py-2.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"><Share2 className="w-4 h-4" />{pick('njob.shareLink')}</button>
            </div>
          </div>
        </main>
      )}

      {j && back ? <BackWindow job={j} canCost={canCost} onClose={() => setBack(false)} onDone={(m) => { setBack(false); setToast(m); void inv('repair') }} /> : null}
      {j && deliver ? <DeliverWindow job={j} onClose={() => setDeliver(false)} onDone={(m) => { setDeliver(false); setToast(m); void inv('repair') }} /> : null}
      {j && del ? <DeleteWindow id={j.id} onClose={() => setDel(false)} onDone={() => { setDel(false); void inv('repair', 'repairs'); setToast(pick('nkh.undone')) }} /> : null}
      <div className={`fixed bottom-5 start-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="njob-toast">{toast}</span></div></div>
    </div>
  )
}

function Cell({ k, v, tone = '', sub, action }: { k: string; v: string; tone?: string; sub?: string; action?: ReactNode }) {
  const { pick } = useLang()
  return <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-obsidian-850 border border-slate-200/70 dark:border-slate-800"><div className="flex items-center justify-between text-[11px] text-slate-500">{pick(k)}{action}</div><div className={`font-display font-extrabold text-base mt-0.5 ${tone}`} dir="ltr">{v}</div>{sub ? <div className="text-[10px] text-slate-400">{sub}</div> : null}</div>
}
function SlipRow({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-2"><span className="text-slate-500">{k}:</span>{v}</div>
}

/** Delete a repair taken in by mistake (ADR-087, owner / manager): the advance reversed, kept as Deleted. */
function DeleteWindow({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { pick, ur } = useLang()
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="njob-delete-window">
      <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('njob.deleteQ')}</h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <p className="text-xs text-slate-500">{pick('del.repair.effect')}</p>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('bill.reasonPh')} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="njob-delete-why" />
        {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={busy || why.trim().length < 3} onClick={async () => { setBusy(true); setErr(''); try { await api('POST', `/api/v1/repairs/${id}/cancel`, { reason: why.trim() }); onDone() } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="px-4 py-2 rounded-xl bg-rose-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="njob-delete-yes">{pick('nkh.confirmDelete')}</button></div>
      </div>
    </div>
  )
}
