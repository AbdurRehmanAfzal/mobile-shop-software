/** Repairs & lab hub in the new product (ADR-134), drawn from `09-repairs-and-lab-hub.html`: a full
 *  screen with the file's own bar (the shop, "Repairs & lab hub (F7)", two tabs, cost visible,
 *  language, dark) and two views.
 *
 *  "+ Take phone for repair": three numbered cards on the left (the customer from the khata or a quick
 *  walk-in, the phone and its IMEI with the scanner; the faults and what came with it; who repairs it
 *  — the shop's technician or an outside lab with its price, instruction and back-by — the customer's
 *  likely cost, the advance and ready-by) and the 80 mm slip drawn live on the right with Save & print.
 *  It posts what the live intake posts (`POST /repairs`, then `POST /repairs/{id}/lab` for a lab) and
 *  prints the server's own job sheet (`/repairs/{id}/job-sheet`) — the preview is only a drawing.
 *
 *  "Active jobs & labs": four cards, In shop / Outside lab / Ready filters and a search, a card per
 *  open job (its faults, who has it, WhatsApp, Back from lab, Mark ready, Deliver & settle) and the
 *  outside labs' khata. Back from lab is the live lab return (ADR-044, the lab's charge booked then),
 *  Mark ready the live status, Deliver the live delivery (the bill, what is paid now).
 *
 *  Differences from the drawing: the job number is the server's (shown once saved); a quick walk-in
 *  is made as a customer with a name and a number (the server needs a person on a repair); the
 *  estimated profit and the slip's balance are the form's own preview, not a figure the server keeps;
 *  lab prices and profit are shown only to the owner / manager (cost). */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Check, CheckCircle2, Eye, EyeOff, FlaskConical, Languages, MessageCircle, Moon, PlusCircle, Printer, ScanBarcode, Search, Sun, TrendingUp, UserCheck,
  UserPlus, Wrench, X,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { activeShop, useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { isoDay, withCur } from '@/lib/format'
import { waNumber } from '@/lib/phone'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate, useParties } from '@/lib/queries'
import { beep, useScan } from '@/lib/scanner'
import { useTheme } from '@/lib/theme'
import type { Party } from '@/lib/types'

type M = string
export interface Fault { code: string; en: string; ur: string }
interface Tech { id: string; name: string; role: string }
interface Lab { party_id: string; name: string; phone: string | null; balance: M; at_lab: number }
export interface Trip { id: string; lab_party_id: string; lab_name: string | null; quoted_cost: M; expected_back: string | null; late: boolean }
export interface Job {
  id: string; no: string; party_id: string | null; party_name: string | null; party_phone: string | null; device_desc: string; imei: string | null
  fault_codes: string[]; fault_text: string | null; received_accessories: string[]; estimate: M; advance: M; promised_at: string | null; overdue: boolean
  technician_name: string | null; status: string; total: M; paid: M; balance_due: M; at_lab: Trip | null; created_at: string
}
const RECEIVED = ['sim', 'memory_card', 'cover', 'charger', 'box', 'earphones']
const LIME = '#A3E635'
const num = (v: M | number | null | undefined) => Number(v ?? 0)
const rs = (v: M | number | null | undefined) => withCur(Math.round(Math.abs(num(v))).toLocaleString('en-US'))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

export default function NewRepairs() {
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
  const [view, setView] = useState<'intake' | 'jobs'>(() => (new URLSearchParams(window.location.search).get('view') === 'jobs' ? 'jobs' : 'intake'))
  const [showCost, setShowCost] = useState(true)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2800); return () => clearTimeout(x) }, [toast])

  const { data: faults } = useGet<Fault[]>(['faults'], '/api/v1/repairs/fault-codes')
  const { data: techs } = useGet<Tech[]>(['repair-techs'], '/api/v1/repairs/technicians')
  const { data: labs } = useGet<Lab[]>(['repair-labs'], '/api/v1/repairs/labs')
  const { data: jobs } = useGet<Job[]>(['repairs', true, ''], '/api/v1/repairs?open_only=true')

  /* keys, as everywhere in the new product */
  useEffect(() => {
    const go: Record<string, string> = { F2: '/new/sale/new', F3: '/new/purchase/new', F4: '/new/khata', F6: '/new/stock/summary', F8: '/new/expenses', F9: '/new/return/new', F10: '/new/invoices' }
    const onKey = (e: KeyboardEvent) => { if (go[e.key]) { e.preventDefault(); nav(go[e.key]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const openJobs = jobs ?? []
  const costShown = canCost && showCost

  return (
    <div style={{ '--nl': LIME } as CSSProperties} className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex flex-col" data-testid="nrep" data-newui="1" data-file="09">
      {/* ===== BAR ===== */}
      <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 py-2.5 z-30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => nav('/new')} className="flex items-center gap-2.5 text-start cursor-pointer">
            <div className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
            <div>
              <div className="flex items-center gap-2"><span className="font-display font-extrabold text-sm sm:text-base tracking-tight" dir="auto">{ur ? shop?.name_ur || shop?.name : shop?.name}</span>{shop?.city ? <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">{shop.city}</span> : null}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><span className={`font-semibold text-slate-800 dark:text-[#A3E635] ${ur ? cls('sm') : ''}`}>{pick('nrep.module')}</span></div>
            </div>
          </button>
          <div className="flex items-center bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <button type="button" onClick={() => setView('intake')} aria-pressed={view === 'intake'} data-testid="nrep-tab-intake" className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 ${view === 'intake' ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 shadow-xs' : 'font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}><PlusCircle className="w-3.5 h-3.5" /><span>{pick('nrep.tabIntake')}</span></button>
            <button type="button" onClick={() => setView('jobs')} aria-pressed={view === 'jobs'} data-testid="nrep-tab-jobs" className={`px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 ${view === 'jobs' ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 shadow-xs' : 'font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}><Wrench className="w-3.5 h-3.5" /><span>{pick('nrep.tabJobs')}</span><span className="ms-0.5 px-1.5 rounded-full text-[10px] font-extrabold bg-[#A3E635] text-slate-950" dir="ltr" data-testid="nrep-open-count">{openJobs.length}</span></button>
          </div>
          <div className="flex items-center gap-2">
            {canCost ? <button type="button" onClick={() => setShowCost(!showCost)} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors" data-testid="nrep-eye">{showCost ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}<span className="hidden sm:inline">{pick(showCost ? 'nrep.costVisible' : 'nrep.costHidden')}</span></button> : null}
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors" data-testid="nrep-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 hover:bg-slate-50 dark:hover:bg-obsidian-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </div>
      </header>

      {view === 'intake'
        ? <Intake faults={faults ?? []} techs={techs ?? []} labs={labs ?? []} costShown={costShown} canCost={canCost} onSaved={(no) => { setToast(t('nrep.saved', { no })); setView('jobs'); void inv('repairs', 'repair-labs') }} />
        : <Board jobs={openJobs} labs={labs ?? []} faults={faults ?? []} costShown={costShown} canCost={canCost} onToast={setToast} />}

      <div className={`fixed bottom-5 start-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status">
        <div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="nrep-toast">{toast}</span></div>
      </div>
    </div>
  )
}

const lab = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400'
const field = 'w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-obsidian-850 border border-slate-200/90 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]'
const step = (n: number) => <span className="w-6 h-6 rounded-lg bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center" dir="ltr">{n}</span>

function Intake({ faults, techs, labs, costShown, canCost, onSaved }: { faults: Fault[]; techs: Tech[]; labs: Lab[]; costShown: boolean; canCost: boolean; onSaved: (no: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const [q, setQ] = useState('')
  const [drop, setDrop] = useState(false)
  const { data: people } = useParties(q.trim() ? { q: q.trim() } : {})
  const [party, setParty] = useState<Party | null>(null)
  const [walkIn, setWalkIn] = useState(false)
  const [wName, setWName] = useState('')
  const [wPhone, setWPhone] = useState('')
  const [model, setModel] = useState('')
  const [imei, setImei] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [received, setReceived] = useState<string[]>([])
  const [who, setWho] = useState<'shop' | 'lab'>('shop')
  const [tech, setTech] = useState('')
  const [labId, setLabId] = useState('')
  const [labPrice, setLabPrice] = useState('')
  const [labDo, setLabDo] = useState('')
  const [labBack, setLabBack] = useState(1)
  const [estimate, setEstimate] = useState('')
  const [advance, setAdvance] = useState('')
  const [ready, setReady] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (!labId && labs.length) setLabId(labs[0].party_id) }, [labs, labId])
  useScan((code) => { const d = code.replace(/\D/g, ''); if (d.length >= 14) { setImei(d.slice(0, 15)); beep('ok') } })

  const toggle = (xs: string[], x: string, fn: (v: string[]) => void) => fn(xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])
  const faultName = (c: string) => { const f = faults.find((x) => x.code === c); return f ? (ur ? f.ur : f.en) : c }
  const custName = party ? party.name : walkIn ? wName : ''
  const custPhone = party ? party.phone : walkIn ? wPhone : ''
  const bal = num(party?.balance)
  const est = Number(estimate || 0), adv = Number(advance || 0), lp = Number(labPrice || 0)
  const readyDate = isoDay(ready === 0 ? 0 : ready)
  const labName = labs.find((l) => l.party_id === labId)?.name ?? ''
  const okCustomer = !!party || (walkIn && wName.trim().length >= 2 && wPhone.length >= 10)
  const ok = okCustomer && model.trim().length >= 2 && (codes.length > 0 || other.trim().length > 0) && (who === 'shop' || !!labId) && adv <= Math.max(est, adv)

  async function save() {
    if (!ok) { setErr(pick('nrep.fillAll')); return }
    setBusy(true); setErr('')
    try {
      let pid = party?.id
      if (!pid) {
        const p = await api<Party>('POST', '/api/v1/parties', { name: wName.trim(), phone: wPhone, kinds: ['customer'] })
        pid = p.id
      }
      const j = await api<{ id: string; no: string }>('POST', '/api/v1/repairs', {
        party_id: pid, device_desc: model.trim(), imei: imei || undefined, fault_codes: codes, fault_text: other.trim() || undefined,
        received_accessories: received, estimate: est, advance: adv, promised_at: readyDate, technician_id: who === 'shop' && tech ? tech : undefined,
      })
      if (who === 'lab' && labId) {
        const problem = labDo.trim() || [...codes.map(faultName), other.trim()].filter(Boolean).join(', ')
        await api('POST', `/api/v1/repairs/${j.id}/lab`, { lab_party_id: labId, problem: problem || undefined, quoted_cost: lp, expected_back: isoDay(labBack) })
      }
      void openPrintable(`/api/v1/repairs/${j.id}/job-sheet`)
      await inv('repairs', 'repair-labs', 'parties', 'party', 'dashboard', 'day')
      onSaved(j.no)
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }

  const pill = (on: boolean, green?: boolean) => `px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${on ? (green ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950 shadow-2xs') : 'bg-slate-100/90 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800'}`
  const dayBtn = (on: boolean) => `py-2.5 rounded-xl text-xs cursor-pointer ${on ? 'font-bold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-semibold bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700'}`
  const hits = (people ?? []).slice(0, 8)

  return (
    <main className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden" data-testid="nrep-intake">
      <div className="w-full lg:w-[62%] lg:h-full lg:overflow-y-auto p-4 sm:p-6 space-y-4 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800">
        {/* 1. customer & device */}
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">{step(1)}<h2 className="font-display font-bold text-sm sm:text-base">{pick('nrep.step1')}</h2></div>
            <button type="button" onClick={() => { setWalkIn(true); setParty(null); setQ('') }} className="px-3 py-1 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:border-obsidian-900 dark:hover:border-[#A3E635] transition-colors cursor-pointer flex items-center gap-1.5" data-testid="nrep-walkin"><UserPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /><span>{pick('nrep.quickWalkIn')}</span></button>
          </div>
          {walkIn ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50/90 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800" data-testid="nrep-walkin-box">
              <div><label className={`${lab} mb-1`}>{pick('nrep.walkName')} *</label><input value={wName} onChange={(e) => setWName(e.target.value)} className={field} dir="auto" data-testid="nrep-walk-name" /></div>
              <PhoneInput label="party.phone" value={wPhone} onChange={setWPhone} />
              <button type="button" onClick={() => setWalkIn(false)} className="sm:col-span-2 text-[11px] font-bold text-slate-500 hover:underline text-start cursor-pointer">{pick('nrep.pickFromKhata')}</button>
            </div>
          ) : (
            <div className="relative">
              <label className={`${lab} mb-1.5`}>{pick('nrep.customerLabel')}</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input value={q} onFocus={() => setDrop(true)} onChange={(e) => { setQ(e.target.value); setDrop(true) }} placeholder={pick('nrep.customerPh')} data-testid="nrep-customer-q" className={`${field} ps-9 pe-24 font-medium`} />
                {party ? <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 absolute end-2.5 top-1/2 -translate-y-1/2">{pick('nrep.selected')}</span> : null}
              </div>
              {drop && hits.length ? (
                <div className="absolute z-30 start-0 end-0 mt-1.5 max-h-56 overflow-y-auto rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {hits.map((p) => { const b = num(p.balance); return (
                    <button key={p.id} type="button" onClick={() => { setParty(p); setQ(p.name); setDrop(false) }} className="w-full px-3 py-2 text-start text-xs hover:bg-slate-50 dark:hover:bg-obsidian-850 flex items-center justify-between gap-2 cursor-pointer" data-testid="nrep-customer-hit">
                      <span className="min-w-0"><span className="font-bold truncate block" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone}</span></span>
                      <span className={`text-[10px] font-bold ${b > 0 ? 'text-amber-700' : b < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{b > 0 ? `${rs(b)} ${pick('nkh.lena')}` : b < 0 ? `${rs(b)} ${pick('nkh.dena')}` : pick('nkh.clear')}</span>
                    </button>
                  ) })}
                </div>
              ) : null}
              {party ? (
                <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50/90 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="nrep-customer">
                  <div className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-emerald-600 dark:text-[#A3E635]" /><span className="font-bold text-slate-900 dark:text-white" dir="auto">{party.name}</span><span className="font-mono text-[11px] text-slate-500" dir="ltr">{party.phone}</span></div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${bal > 0 ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300' : bal < 0 ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'}`}>{bal > 0 ? `${rs(bal)} ${pick('nrep.leneHain')}` : bal < 0 ? `${rs(bal)} ${pick('nrep.deneHain')}` : pick('nrep.clearAcc')}</span>
                </div>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div><label className={`${lab} mb-1`}>{pick('nrep.model')} *</label><input value={model} onChange={(e) => setModel(e.target.value)} placeholder={pick('nrep.modelPh')} className={`${field} font-semibold`} dir="auto" data-testid="nrep-model" /></div>
            <div><label className={`${lab} mb-1`}>{pick('nrep.imei')}</label><div className="flex gap-1.5"><input value={imei} onChange={(e) => setImei(e.target.value.replace(/[^\dA-Za-z]/g, '').slice(0, 20))} placeholder={pick('nrep.imeiPh')} className={`${field} font-mono`} dir="ltr" data-testid="nrep-imei" /><span className="px-3 py-2 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 text-white text-xs font-bold flex items-center gap-1 shrink-0 border border-transparent dark:border-slate-700" title={pick('nrep.scanHint')}><ScanBarcode className="w-4 h-4 text-[#A3E635]" /><span>{pick('common.scan')}</span></span></div></div>
          </div>
        </section>

        {/* 2. faults & accessories */}
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2">{step(2)}<h2 className="font-display font-bold text-sm sm:text-base">{pick('nrep.step2')}</h2></div><span className="text-[11px] font-bold text-emerald-700 dark:text-[#A3E635]">{t('nrep.nSelected', { n: codes.length })}</span></div>
          <div className="flex flex-wrap gap-1.5" data-testid="nrep-faults">{faults.map((f) => { const on = codes.includes(f.code); return <button key={f.code} type="button" onClick={() => toggle(codes, f.code, setCodes)} aria-pressed={on} className={pill(on)} data-testid={`nrep-fault-${f.code}`}>{on ? '✓ ' : ''}{ur ? f.ur : f.en}</button> })}</div>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder={pick('nrep.otherPh')} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200/90 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" dir="auto" data-testid="nrep-other" />
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className={`${lab} mb-2`}>{pick('nrep.receivedWith')}</label>
            <div className="flex flex-wrap gap-1.5">{RECEIVED.map((x) => { const on = received.includes(x); return <button key={x} type="button" onClick={() => toggle(received, x, setReceived)} aria-pressed={on} className={pill(on, true)} data-testid={`nrep-acc-${x}`}>{on ? '✓ ' : '+ '}{pick(`repair.acc.${x}`)}</button> })}</div>
          </div>
        </section>

        {/* 3. who repairs it & estimate */}
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">{step(3)}<h2 className="font-display font-bold text-sm sm:text-base">{pick('nrep.step3')}</h2></div>
            {canCost ? <div className="px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 flex items-center gap-1.5 text-xs" data-testid="nrep-profit"><TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-[#A3E635]" /><span className="text-slate-600 dark:text-slate-300 font-medium">{pick('nrep.estProfit')}:</span><span className="font-display font-extrabold text-emerald-700 dark:text-[#A3E635]" dir="ltr">{costShown ? `${est - (who === 'lab' ? lp : 0) < 0 ? '− ' : ''}${rs(est - (who === 'lab' ? lp : 0))}` : '••••'}</span></div> : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['shop', 'lab'] as const).map((k) => { const on = who === k; return (
              <button key={k} type="button" onClick={() => setWho(k)} aria-pressed={on} data-testid={`nrep-who-${k}`} className={`p-3.5 rounded-2xl text-start transition-all cursor-pointer ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] bg-obsidian-900 dark:bg-obsidian-850 text-white' : 'border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-obsidian-850/50 hover:border-slate-400'}`}>
                <div className="flex items-center justify-between"><div className={`w-8 h-8 rounded-xl flex items-center justify-center ${k === 'shop' ? (on ? 'bg-white/10 text-[#A3E635]' : 'bg-slate-200/70 text-slate-600') : 'bg-blue-500/10 text-blue-600'}`}>{k === 'shop' ? <Wrench className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}</div>{on ? <span className="w-5 h-5 rounded-full bg-[#A3E635] text-slate-950 flex items-center justify-center"><Check className="w-3 h-3 stroke-[3]" /></span> : <span className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600" />}</div>
                <div className="font-display font-bold text-sm mt-2.5">{pick(k === 'shop' ? 'rwho.shop' : 'rwho.lab')}</div>
                <div className={`text-[11px] mt-0.5 ${on ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{pick(k === 'shop' ? 'rwho.shopHint' : 'rwho.labHint')}</div>
              </button>
            ) })}
          </div>
          {who === 'shop' ? (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800">
              <label className={`${lab} mb-1.5`}>{pick('nrep.assignTech')}</label>
              <select value={tech} onChange={(e) => setTech(e.target.value)} className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 focus:outline-none" data-testid="nrep-tech"><option value="">{pick('rwho.anyTech')}</option>{techs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </div>
          ) : (
            <LabPanel labs={labs} labId={labId} setLabId={setLabId} price={labPrice} setPrice={setLabPrice} doWhat={labDo} setDo={setLabDo} back={labBack} setBack={setLabBack} costShown={costShown} onNewLab={async (name, phone) => { const p = await api<Party>('POST', '/api/v1/parties', { name, phone: phone || null, kinds: ['technician'] }); await inv('repair-labs'); setLabId(p.id) }} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div><label className={`${lab} mb-1`}>{pick('nrep.likelyCost')}</label><input type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} className={`${field} font-extrabold`} dir="ltr" data-testid="nrep-estimate" /></div>
            <div><label className={`${lab} mb-1`}>{pick('nrep.advance')}</label><input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} className={`${field} font-extrabold text-emerald-700 dark:text-[#A3E635]`} dir="ltr" data-testid="nrep-advance" /></div>
            <div><label className={`${lab} mb-1`}>{pick('nrep.readyBy')}</label><div className="grid grid-cols-3 gap-1.5">{[[0, 'counter.today'], [1, 'counter.tomorrow'], [3, 'counter.in3days']].map(([d, k]) => <button key={d as number} type="button" onClick={() => setReady(d as number)} aria-pressed={ready === d} className={dayBtn(ready === d)}>{pick(k as string)}</button>)}</div></div>
          </div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </section>
      </div>

      {/* the slip, drawn live */}
      <div className="w-full lg:w-[38%] lg:h-full flex flex-col bg-slate-100/80 dark:bg-obsidian-900/60">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start">
          <div className="w-full max-w-sm flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />{pick('nrep.preview')}</span>
            <button type="button" onClick={() => void openPrintable('/api/v1/labels/printer-test')} className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline flex items-center gap-1 cursor-pointer"><Printer className="w-3.5 h-3.5" /><span>{pick('nrep.testPrint')}</span></button>
          </div>
          <div className="w-full max-w-sm bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-lg p-5 space-y-3.5" data-testid="nrep-slip">
            <div className="border-b-2 border-dashed border-slate-200 pb-3 text-center">
              <div className="font-display font-extrabold text-base tracking-tight uppercase" dir="auto">{shop?.name}</div>
              {shop?.city ? <div className="text-[11px] text-slate-500 font-medium">{shop.city}</div> : null}
              <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold" dir="ltr"><span>{pick('nrep.newJob')}</span><span>•</span><span>{pick('nrep.token')}</span></div>
            </div>
            <div className="text-xs space-y-1 border-b border-dashed border-slate-200 pb-3">
              <Row k="nrep.dateTime" v={<span className="font-mono font-semibold" dir="ltr">{fmtDate(isoDay(0))}</span>} />
              <Row k="nrep.customer" v={<span className="font-bold" dir="auto">{custName || '—'}</span>} />
              <Row k="nrep.contact" v={<span className="font-mono" dir="ltr">{custPhone || '—'}</span>} />
              <Row k="nrep.readyBy" v={<span className="font-bold text-emerald-700">{pick(ready === 0 ? 'counter.today' : ready === 1 ? 'counter.tomorrow' : 'counter.in3days')}</span>} />
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{pick('nrep.deviceUnder')}</div>
              <div className="font-display font-extrabold text-sm text-slate-900" dir="auto" data-testid="nrep-slip-model">{model || '—'}</div>
              {imei ? <div className="font-mono text-[11px] text-slate-600" dir="ltr">IMEI: {imei}</div> : null}
            </div>
            <div className="space-y-2 border-b border-dashed border-slate-200 pb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{pick('nrep.reported')}</div>
                <div className="flex flex-wrap gap-1">{codes.map((c) => <span key={c} className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">{faultName(c)}</span>)}</div>
                {other ? <div className="text-[11px] text-slate-600 italic mt-1" dir="auto">{other}</div> : null}
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1"><span className="text-slate-500">{pick('nrep.receivedShort')}:</span><span className="font-semibold text-slate-800">{received.length ? received.map((x) => pick(`repair.acc.${x}`)).join(', ') : '—'}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">{pick('nrep.assignedTo')}:</span><span className="font-bold text-slate-800" dir="auto">{who === 'lab' ? `${pick('nrep.labWord')}: ${labName}` : techs.find((x) => x.id === tech)?.name ?? pick('nrep.shopAny')}</span></div>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-600 font-medium">{pick('nrep.estCharges')}:</span><span className="font-display font-bold text-sm" dir="ltr">{rs(est)}</span></div>
              <div className="flex justify-between text-emerald-700"><span className="font-medium">{pick('nrep.advancePaid')}:</span><span className="font-bold" dir="ltr">− {rs(adv)}</span></div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200"><span className="font-extrabold text-xs uppercase">{pick('nrep.balancePickup')}:</span><span className="font-display font-extrabold text-lg text-slate-950" dir="ltr" data-testid="nrep-slip-balance">{rs(Math.max(0, est - adv))}</span></div>
            </div>
            <div className="pt-2 text-center border-t border-dashed border-slate-200">
              <div className="font-mono text-lg tracking-[0.25em] font-bold text-slate-800 select-none" aria-hidden dir="ltr">|||| ||| || |||| |||</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{pick('nrep.slipFoot')}</div>
            </div>
          </div>
        </div>
        <div className="shrink-0 p-4 bg-white dark:bg-obsidian-900 border-t border-slate-200 dark:border-slate-800">
          <button type="button" onClick={() => void save()} disabled={busy} className="w-full py-3.5 px-4 rounded-2xl bg-[#A3E635] hover:bg-[#84CC16] active:scale-[0.99] disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2" data-testid="nrep-save"><Printer className="w-4 h-4 stroke-[2.5]" /><span>{pick('nrep.savePrint')}</span></button>
        </div>
      </div>
    </main>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  const { pick } = useLang()
  return <div className="flex justify-between gap-2"><span className="text-slate-500">{pick(k)}:</span>{v}</div>
}

function LabPanel({ labs, labId, setLabId, price, setPrice, doWhat, setDo, back, setBack, costShown, onNewLab }: { labs: Lab[]; labId: string; setLabId: (v: string) => void; price: string; setPrice: (v: string) => void; doWhat: string; setDo: (v: string) => void; back: number; setBack: (v: number) => void; costShown: boolean; onNewLab: (name: string, phone: string) => Promise<void> }) {
  const { pick, ur } = useLang()
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState('')
  const [ph, setPh] = useState('')
  const [err, setErr] = useState('')
  const box = 'w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-blue-200 dark:border-blue-800 focus:outline-none'
  const lb = 'block text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 mb-1'
  return (
    <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/60 space-y-3" data-testid="nrep-lab-panel">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lb}>{pick('nrep.whichLab')}</label>
          {adding ? (
            <div className="space-y-1.5">
              <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder={pick('nrep.labNamePh')} className={`${box} font-bold`} dir="auto" data-testid="nrep-newlab-name" />
              <input value={ph} onChange={(e) => setPh(e.target.value.replace(/[^\d+]/g, ''))} placeholder="03XXXXXXXXX" className={`${box} font-mono`} dir="ltr" />
              <div className="flex gap-1.5"><button type="button" onClick={async () => { setErr(''); try { await onNewLab(nm.trim(), ph); setAdding(false); setNm(''); setPh('') } catch (e) { setErr(errText(e, ur)) } }} disabled={nm.trim().length < 2} className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer" data-testid="nrep-newlab-save">{pick('common.save')}</button><button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer">{pick('common.cancel')}</button></div>
              {err ? <p className="text-[10px] text-rose-600">{err}</p> : null}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <select value={labId} onChange={(e) => setLabId(e.target.value)} className={`${box} font-bold`} data-testid="nrep-lab">{!labs.length ? <option value="">{pick('nrep.noLabs')}</option> : null}{labs.map((l) => <option key={l.party_id} value={l.party_id}>{l.name}{l.phone ? ` — ${l.phone}` : ''}</option>)}</select>
              <button type="button" onClick={() => setAdding(true)} className="px-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-obsidian-900 text-[11px] font-bold text-blue-700 shrink-0 cursor-pointer" data-testid="nrep-newlab">+ {pick('nrep.newLab')}</button>
            </div>
          )}
        </div>
        <div><label className={lb}>{pick('nrep.labPrice')}</label><input type={costShown ? 'number' : 'password'} min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="6000" className={`${box} font-bold`} dir="ltr" data-testid="nrep-lab-price" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2"><label className={lb}>{pick('nrep.labDo')}</label><input value={doWhat} onChange={(e) => setDo(e.target.value)} placeholder={pick('rwho.labProblemPh')} className={box} dir="auto" data-testid="nrep-lab-do" /></div>
        <div><label className={lb}>{pick('nrep.backBy')}</label><div className="grid grid-cols-3 gap-1">{[1, 2, 3].map((d) => <button key={d} type="button" onClick={() => setBack(d)} aria-pressed={back === d} className={`py-1.5 rounded-lg text-[11px] cursor-pointer ${back === d ? 'font-bold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-semibold bg-white dark:bg-obsidian-900 border border-blue-200 dark:border-blue-800'}`}>{d === 1 ? pick('nrep.tmrw') : `${d}d`}</button>)}</div></div>
      </div>
    </div>
  )
}

type Filter = 'all' | 'shop' | 'lab' | 'ready'

function Board({ jobs, labs, faults, costShown, canCost, onToast }: { jobs: Job[]; labs: Lab[]; faults: Fault[]; costShown: boolean; canCost: boolean; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const shop = useAuth(activeShop)
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [wa, setWa] = useState<Job | null>(null)
  const [back, setBack] = useState<Job | null>(null)
  const [deliver, setDeliver] = useState<Job | null>(null)
  const [busy, setBusy] = useState('')
  const isReady = (j: Job) => j.status === 'repaired'
  const inLab = (j: Job) => !!j.at_lab
  const query = q.trim().toLowerCase()
  const shown = jobs.filter((j) => {
    if (f === 'shop' && inLab(j)) return false
    if (f === 'lab' && !inLab(j)) return false
    if (f === 'ready' && !isReady(j)) return false
    return !query || `${j.no} ${j.party_name ?? ''} ${j.device_desc} ${j.imei ?? ''} ${j.party_phone ?? ''}`.toLowerCase().includes(query)
  })
  const receivable = jobs.reduce((s, j) => s + Math.max(0, num(j.balance_due)), 0)
  const faultName = (c: string) => { const x = faults.find((y) => y.code === c); return x ? (ur ? x.ur : x.en) : c }
  const labsOut = useMemo(() => {
    const by = new Map<string, { name: string; jobs: Job[] }>()
    for (const j of jobs) if (j.at_lab) { const k = j.at_lab.lab_party_id; const g = by.get(k) ?? { name: j.at_lab.lab_name ?? labs.find((l) => l.party_id === k)?.name ?? '', jobs: [] }; g.jobs.push(j); by.set(k, g) }
    return [...by.entries()]
  }, [jobs, labs])

  async function markReady(j: Job) {
    setBusy(j.id)
    try { await api('POST', `/api/v1/repairs/${j.id}/status`, { status: 'repaired' }); await inv('repairs'); onToast(t('nrep.markedReady', { no: j.no })) } catch (e) { onToast(errText(e, ur)) } finally { setBusy('') }
  }
  const pillCls = (k: Filter, tone = 'text-slate-700 dark:text-slate-300') => `px-3.5 py-1.5 rounded-xl text-xs cursor-pointer ${f === k ? 'font-bold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : `font-semibold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 ${tone}`}`

  return (
    <main className="flex-1 lg:overflow-y-auto p-4 sm:p-6 space-y-5" data-testid="nrep-jobs">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi dark k="nrep.kOpen" v={String(jobs.length)} sub="nrep.kOpenSub" Icon={Wrench} testid="nrep-k-open" />
        <Kpi k="nrep.kLab" v={String(jobs.filter(inLab).length)} sub="nrep.kLabSub" Icon={FlaskConical} tone="text-blue-600" iconTone="bg-blue-50 dark:bg-blue-950/60 text-blue-600" />
        <Kpi k="nrep.kReady" v={String(jobs.filter(isReady).length)} sub="nrep.kReadySub" Icon={CheckCircle2} tone="text-emerald-600 dark:text-emerald-400" iconTone="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600" testid="nrep-k-ready" />
        <Kpi k="nrep.kDue" v={rs(receivable)} sub="nrep.kDueSub" Icon={CheckCircle2} tone="text-amber-600 dark:text-amber-400" iconTone="bg-amber-50 dark:bg-amber-950/60 text-amber-600" />
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setF('all')} className={pillCls('all')} data-testid="nrep-f-all">{pick('nrep.fAll')}</button>
          <button type="button" onClick={() => setF('shop')} className={pillCls('shop')} data-testid="nrep-f-shop">{pick('nrep.fShop')}</button>
          <button type="button" onClick={() => setF('lab')} className={pillCls('lab', 'text-blue-600')} data-testid="nrep-f-lab">{pick('nrep.fLab')}</button>
          <button type="button" onClick={() => setF('ready')} className={pillCls('ready', 'text-emerald-600 dark:text-emerald-400')} data-testid="nrep-f-ready">{pick('nrep.fReady')}</button>
        </div>
        <div className="relative w-full md:w-80"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nrep.searchJobs')} data-testid="nrep-q" className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#A3E635]" /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-3" data-testid="nrep-cards">
          {!shown.length ? <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-500">{pick('nrep.noJobs')}</div> : shown.map((j) => {
            const ready = isReady(j)
            const billed = num(j.total) > 0
            return (
              <div key={j.id} className={`rounded-2xl bg-white dark:bg-obsidian-900 border p-4 space-y-3 shadow-2xs ${ready ? 'border-emerald-400/80 dark:border-emerald-700' : 'border-slate-200/90 dark:border-slate-800'}`} data-testid={`nrep-card-${j.no}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => nav(`/new/repairs/${j.id}`)} className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-md bg-obsidian-900 dark:bg-obsidian-800 text-[#A3E635] cursor-pointer" dir="ltr">{j.no}</button>
                      <span className="font-display font-bold text-sm text-slate-900 dark:text-white" dir="auto">{j.device_desc}</span>
                      {ready ? <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">{pick('nrep.sReady')}</span>
                        : inLab(j) ? <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{pick(j.at_lab?.late ? 'nrep.sLabLate' : 'nrep.sLab')}</span>
                          : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">{pick('nrep.sShop')}</span>}
                      {j.overdue ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">{pick('nrep.overdue')}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-800 dark:text-slate-200" dir="auto">{j.party_name ?? '—'}</span>{j.party_phone ? <><span>•</span><span className="font-mono text-[11px]" dir="ltr">{j.party_phone}</span></> : null}{j.imei ? <><span>•</span><span className="font-mono text-[11px]" dir="ltr">IMEI: {j.imei}</span></> : null}{j.promised_at ? <><span>•</span><span>{pick('nrep.readyBy')}: <span dir="ltr">{fmtDate(j.promised_at)}</span></span></> : null}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-[10px] font-bold uppercase text-slate-400">{pick(billed ? 'nrep.balanceDue' : 'nrep.estimate')}</div>
                    <div className="font-display font-extrabold text-base text-slate-900 dark:text-white" dir="ltr">{rs(billed ? j.balance_due : j.estimate)}</div>
                    <div className="text-[10px] text-slate-500" dir="ltr">{pick('nrep.est')}: {rs(j.estimate)} · {pick('nrep.adv')}: {rs(j.advance)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {j.fault_codes.map((c) => <span key={c} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300">{faultName(c)}</span>)}
                    {j.fault_text ? <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300" dir="auto">{j.fault_text}</span> : null}
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${inLab(j) ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600' : 'bg-slate-50 dark:bg-obsidian-850 text-slate-500'}`} dir="auto">{inLab(j) ? `${pick('nrep.labWord')}: ${j.at_lab?.lab_name ?? ''}` : `${pick('nrep.techWord')}: ${j.technician_name ?? pick('nrep.any')}`}</span>
                    {inLab(j) && canCost ? <span className="text-[10px] font-bold text-slate-500" dir="ltr">{pick('nrep.labCharge')}: {costShown ? rs(j.at_lab?.quoted_cost) : '••••'}</span> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {j.party_phone ? <button type="button" onClick={() => setWa(j)} className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nrep-wa"><MessageCircle className="w-3.5 h-3.5" /><span>WhatsApp</span></button> : null}
                    {inLab(j) ? <button type="button" onClick={() => setBack(j)} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer" data-testid="nrep-back">{pick('nrep.backFromLab')}</button>
                      : ready ? <button type="button" onClick={() => setDeliver(j)} className="px-3 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-extrabold text-xs cursor-pointer" data-testid="nrep-deliver">{pick('nrep.deliver')}</button>
                        : <button type="button" onClick={() => void markReady(j)} disabled={busy === j.id} className="px-3 py-1.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 hover:opacity-90 text-white font-bold text-xs cursor-pointer disabled:opacity-50" data-testid="nrep-ready">{pick('nrep.markReady')}</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs" data-testid="nrep-labs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center"><FlaskConical className="w-4 h-4" /></div><div><h3 className="font-display font-bold text-sm">{pick('nrep.labsKhata')}</h3><p className="text-[11px] text-slate-500 dark:text-slate-400">{pick('nrep.labsKhataSub')}</p></div></div>
            <button type="button" onClick={() => nav('/repairs/labs')} className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer">{pick('nkh.open')}</button>
          </div>
          <div className="space-y-2.5">
            {!labsOut.length ? <p className="text-xs text-slate-500">{pick('nrep.noneAtLab')}</p> : labsOut.map(([id, g]) => (
              <div key={id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-2"><span className="font-bold text-xs text-slate-900 dark:text-white" dir="auto">{g.name}</span><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600">{t('nrep.phonesN', { n: g.jobs.length })}</span></div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" dir="auto">{g.jobs.map((j) => j.device_desc).join(', ')}</div>
                {canCost ? <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-800 text-xs"><span className="text-slate-500">{pick('nrep.labPayable')}:</span><span className="font-display font-extrabold text-rose-600 dark:text-rose-400" dir="ltr">{costShown ? rs(g.jobs.reduce((s, j) => s + num(j.at_lab?.quoted_cost), 0)) : '••••••'}</span></div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {wa ? <WaWindow job={wa} shopName={shop?.name ?? ''} onClose={() => setWa(null)} /> : null}
      {back ? <BackWindow job={back} canCost={canCost} onClose={() => setBack(null)} onDone={(m) => { setBack(null); onToast(m) }} /> : null}
      {deliver ? <DeliverWindow job={deliver} onClose={() => setDeliver(null)} onDone={(m) => { setDeliver(null); onToast(m) }} /> : null}
    </main>
  )
}

function Kpi({ k, v, sub, Icon, dark, tone = '', iconTone = '', testid }: { k: string; v: string; sub: string; Icon: typeof Wrench; dark?: boolean; tone?: string; iconTone?: string; testid?: string }) {
  const { pick } = useLang()
  return (
    <div className={`rounded-2xl p-4 border flex items-center justify-between ${dark ? 'bg-obsidian-900 text-white border-slate-800' : 'bg-white dark:bg-obsidian-900 border-slate-200/90 dark:border-slate-800'}`} data-testid={testid}>
      <div><div className={`text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{pick(k)}</div><div className={`font-display font-extrabold text-2xl mt-0.5 ${dark ? 'text-white' : tone}`} dir="ltr">{v}</div><div className={`text-[11px] mt-0.5 ${dark ? 'text-[#A3E635]' : 'text-slate-500'}`}>{pick(sub)}</div></div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dark ? 'bg-white/10 text-[#A3E635]' : iconTone}`}><Icon className="w-5 h-5" /></div>
    </div>
  )
}

function Win({ children, testid }: { children: ReactNode; testid: string }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid={testid}><div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">{children}</div></div>
}

export function WaWindow({ job, shopName, onClose }: { job: Job; shopName: string; onClose: () => void }) {
  const { pick } = useLang()
  const { t } = useTranslation()
  const billed = num(job.total) > 0
  const [msg, setMsg] = useState(t('nrep.waText', { who: job.party_name ?? '', model: job.device_desc, no: job.no, total: rs(billed ? job.total : job.estimate), adv: rs(job.advance), due: rs(billed ? job.balance_due : Math.max(0, num(job.estimate) - num(job.advance))), shop: shopName }))
  return (
    <Win testid="nrep-wa-window">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center"><MessageCircle className="w-4 h-4" /></span><div><h3 className="font-display font-bold text-sm">{pick('nrep.waTitle')}</h3><p className="text-[11px] text-slate-500" dir="auto">{job.party_name} ({job.party_phone})</p></div></div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={7} dir="auto" className="w-full p-3 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 font-medium leading-relaxed focus:outline-none" />
      <div className="flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.close')}</button><button type="button" onClick={() => { window.open(`https://wa.me/${waNumber(job.party_phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); onClose() }} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"><MessageCircle className="w-3.5 h-3.5" /><span>{pick('nrep.waSend')}</span></button></div>
    </Win>
  )
}

/** Back from the lab (ADR-044): fixed or not, what the lab charged (booked now), what was paid to it now. */
export function BackWindow({ job, canCost, onClose, onDone }: { job: Job; canCost: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const [outcome, setOutcome] = useState<'fixed' | 'not_fixed'>('fixed')
  const [cost, setCost] = useState(String(num(job.at_lab?.quoted_cost)))
  const [paid, setPaid] = useState('0')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = 'w-full px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none'
  async function go() {
    setBusy(true); setErr('')
    try { await api('POST', `/api/v1/repairs/${job.id}/lab/${job.at_lab!.id}/back`, { outcome, final_cost: Number(cost || 0), paid_now: Number(paid || 0) }); await inv('repairs', 'repair-labs', 'parties', 'party'); onDone(t('nrep.backDone', { no: job.no })) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Win testid="nrep-back-window">
      <div className="flex items-center justify-between"><h3 className="font-display font-bold text-sm">{pick('nrep.backFromLab')} · <span dir="ltr">{job.no}</span></h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <div className="grid grid-cols-2 gap-2">{(['fixed', 'not_fixed'] as const).map((o) => <button key={o} type="button" onClick={() => setOutcome(o)} aria-pressed={outcome === o} className={`py-2 rounded-xl text-xs cursor-pointer ${outcome === o ? (o === 'fixed' ? 'font-extrabold bg-emerald-600 text-white' : 'font-extrabold bg-rose-600 text-white') : 'font-bold bg-slate-100 dark:bg-obsidian-850'}`} data-testid={`nrep-outcome-${o}`}>{pick(`nrep.${o}`)}</button>)}</div>
      {canCost ? <div className="grid grid-cols-2 gap-2"><div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nrep.labCharged')}</label><input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={box} dir="ltr" data-testid="nrep-back-cost" /></div><div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nrep.paidLabNow')}</label><input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} className={box} dir="ltr" /></div></div> : null}
      <p className="text-[11px] text-slate-500">{pick('nrep.backHint')}</p>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" onClick={() => void go()} disabled={busy} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nrep-back-save">{pick('common.save')}</button></div>
    </Win>
  )
}

/** Deliver & settle (the live delivery): the bill (labour, prefilled with the estimate when nothing was billed yet) and what is paid now. */
export function DeliverWindow({ job, onClose, onDone }: { job: Job; onClose: () => void; onDone: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const inv = useInvalidate()
  const billed = num(job.total) > 0
  const [labour, setLabour] = useState(billed ? '' : String(num(job.estimate)))
  const [paid, setPaid] = useState(String(Math.max(0, (billed ? num(job.total) : num(job.estimate)) - num(job.advance))))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = 'w-full px-3 py-2 rounded-xl text-sm font-extrabold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none'
  async function go() {
    setBusy(true); setErr('')
    try {
      const r = await api<{ no: string; balance_due: M }>('POST', `/api/v1/repairs/${job.id}/deliver`, { labour: billed ? undefined : Number(labour || 0), paid: Number(paid || 0) })
      await inv('repairs', 'parties', 'party', 'dashboard', 'day', 'cash')
      void openPrintable(`/api/v1/repairs/${job.id}/job-sheet`)
      onDone(t('nrep.delivered', { no: r.no, due: rs(r.balance_due) }))
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  return (
    <Win testid="nrep-deliver-window">
      <div className="flex items-center justify-between"><h3 className="font-display font-bold text-sm">{pick('nrep.deliver')} · <span dir="ltr">{job.no}</span></h3><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button></div>
      <div className="grid grid-cols-2 gap-2">
        {billed ? <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850"><div className="text-[10px] font-bold uppercase text-slate-400">{pick('nrep.bill')}</div><div className="font-mono font-extrabold" dir="ltr">{rs(job.total)}</div></div>
          : <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nrep.charges')}</label><input type="number" min={0} value={labour} onChange={(e) => setLabour(e.target.value)} className={box} dir="ltr" data-testid="nrep-deliver-labour" /></div>}
        <div><label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">{pick('nrep.paidNow')}</label><input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} className={box} dir="ltr" data-testid="nrep-deliver-paid" /></div>
      </div>
      <p className="text-[11px] text-slate-500">{t('nrep.deliverHint', { adv: rs(job.advance) })}</p>
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" onClick={() => void go()} disabled={busy} className="px-4 py-2 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-extrabold text-xs cursor-pointer" data-testid="nrep-deliver-save">{pick('nrep.deliverSave')}</button></div>
    </Win>
  )
}
