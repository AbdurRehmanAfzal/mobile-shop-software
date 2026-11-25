/** Exchange (phone for phone) in the new product (ADR-134). No mock-up draws it (owner 2026-11-23:
 *  design it from what the live software does, in the files' own visual language) — so it is drawn
 *  like the counter (file 14) and add stock (file 01): the shared rail, the bar with "New exchange" /
 *  "Recent exchanges", and three columns — the customer and the old phone coming in, the new phone
 *  going out, and the settlement that says in words who pays whom — then the done card with the bill.
 *
 *  Everything is the live exchange: the old phone is the live purchase line (`DeviceLineDraft` →
 *  `draftToApi`, its trade-in value is its cost), the new one a phone in stock at a price,
 *  `POST /exchanges` with paid now or paid back (and how), the ID checks as the live wizard does them
 *  (ADR-128: the phone going out — check now or skip; a flagged one needs the owner and a reason; the
 *  phone coming in — later or skip), the bill's receipt (`/sales/{id}/receipt`), the list
 *  `GET /exchanges` and delete `POST /exchanges/{id}/void` with a reason (ADR-090). The figures in
 *  the settlement are the form's preview, as in the live wizard; the server's result is shown after. */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Check, FileText, Languages, Moon, Plus, Printer, Receipt, Search, ShieldAlert, ShieldCheck, Smartphone, Sun, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { newPay, payInfo, payReady, type PayState } from '@/components/PayPicker'
import { draftToApi, emptyDraft, type DeviceLineDraft } from '@/features/purchase/DeviceLineSheet'
import { ApiError, api, get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { ALL_BANKS } from '@/lib/pkPayments'
import { LOCALES, setLocale } from '@/i18n'
import { useBrands, useColours, useDevice, useDevices, useGet, useImeiLookup, useInvalidate, useModels, useParties, useStorages } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Device, Party } from '@/lib/types'
import FileRail from '../FileRail'

const LIME = '#9AE600'
type Tab = 'new' | 'recent'
interface ExchangeOut { id: string; no: string; party_name?: string | null; date: string; invoice_id: string; invoice_no: string | null; purchase_no?: string | null; previous_balance: string; trade_in_value: string; new_total: string; paid: string; new_balance: string; original_invoice_no?: string | null; refund?: string; deleted?: boolean; created_at: string }
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const plain = (v: string | number | null | undefined) => Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })
const rs = (v: string | number | null | undefined) => withCur(plain(v))
const digits = (s: string) => s.replace(/\D/g, '')
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
const LABEL = 'block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1'
const INPUT = 'w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#9AE600]'
const pill = (on: boolean) => `px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${on ? 'font-extrabold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`

export default function NewExchange() {
  const { pick, ur, cls } = useLang()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [tab, setTab] = useState<Tab>('new')
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3000); return () => clearTimeout(x) }, [toast])
  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nex" data-newui="1" data-file="14">
      <FileRail lit="" lime={LIME} testid="nex-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#9AE600] text-slate-950 flex items-center justify-center"><ArrowLeftRight className="w-4 h-4" /></span>
            <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('exchange.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nex.subtitle')}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800">{(['new', 'recent'] as Tab[]).map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nex-tab-${k}`} className={`px-3 py-1 rounded-lg text-xs cursor-pointer ${tab === k ? 'font-bold bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950' : 'font-semibold text-slate-600 dark:text-slate-400'}`}>{pick(`nex.tab.${k}`)}</button>)}</div>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nex-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#9AE600]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </header>
        <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 py-4">{tab === 'new' ? <NewOne onToast={setToast} /> : <Recent onToast={setToast} />}</div>
      </div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#9AE600]" /><span data-testid="nex-toast">{toast}</span></div></div>
    </div>
  )
}

function Panel({ n, title, children, testid }: { n: string; title: string; children: React.ReactNode; testid?: string }) {
  const { pick } = useLang()
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3" data-testid={testid}>
      <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-mono text-[11px] font-extrabold flex items-center justify-center">{n}</span><h2 className="font-display font-extrabold text-sm">{pick(title)}</h2></div>
      {children}
    </section>
  )
}

function NewOne({ onToast }: { onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const isOwner = useAuth((s) => s.me?.user.role) === 'owner'
  const [party, setParty] = useState<Party | null>(null)
  const [old, setOld] = useState<DeviceLineDraft>(() => ({ ...emptyDraft('', 'trade_in'), condition: 'used', pta_status: 'pta_approved' }))
  const [newDev, setNewDev] = useState<Device | null>(null)
  const [price, setPrice] = useState('')
  const [paid, setPaid] = useState('')
  const [giveBack, setGiveBack] = useState<string | null>(null)
  const [pay, setPay] = useState<PayState>(() => newPay())
  const [skipOld, setSkipOld] = useState(false)
  const [skipNew, setSkipNew] = useState(false)
  const [why, setWhy] = useState('')
  const [idem, setIdem] = useState(uid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<ExchangeOut | null>(null)
  const { data: live } = useDevice(newDev?.id)
  const check = (live ?? newDev)?.verification_status
  const checkOk = check === 'flagged' ? isOwner && why.trim().length >= 5 : check !== 'pending' || skipNew
  const { data: lookup } = useImeiLookup(old.imei1)
  const oldInStock = !!lookup?.found && !['sold', 'returned_to_supplier', 'transferred'].includes(lookup.device?.status ?? '')
  const oldOk = digits(old.imei1).length === 15 && !!old.brand_id && !!old.model_id && num(old.cost) > 0 && !oldInStock

  const tradeIn = num(old.cost)
  const total = num(price)
  const previous = num(party?.balance)
  const diff = total - tradeIn
  const paidNow = diff > 0 ? num(paid) : 0
  const refundNow = diff < 0 ? Math.min(-diff, Math.max(0, giveBack === null ? -diff : num(giveBack))) : 0
  const moneyMoves = paidNow > 0 || refundNow > 0
  const newBalance = previous + diff - paidNow + refundNow
  const owesWord = (b: number) => (b > 0 ? 'exchange.toGet' : b < 0 ? 'exchange.toGive' : 'exchange.settled')
  const ready = !!party && oldOk && !!newDev && total > 0 && checkOk && paidNow <= Math.max(0, diff) && (!moneyMoves || payReady(pay))

  async function confirm() {
    if (!ready || !party || !newDev) return
    setBusy(true); setErr('')
    try {
      const res = await api<ExchangeOut>('POST', '/api/v1/exchanges', { party_id: party.id, trade_in: [draftToApi({ ...old, imei1: digits(old.imei1) })], devices: [{ device_id: newDev.id, price: total }], paid: paidNow, refund: refundNow, payment: moneyMoves ? payInfo(pay) : undefined, override_reason: check === 'flagged' ? why.trim() : check === 'pending' && skipNew ? pick('purchase.skipReason') : undefined }, { idempotencyKey: idem })
      if (skipOld) {
        try {
          const hit = await get<{ device: { id: string; verification_status: string } | null }>(`/api/v1/devices/imei/${digits(old.imei1)}`)
          if (hit.device?.verification_status === 'pending') await api('POST', `/api/v1/devices/${hit.device.id}/verification/override`, { reason: pick('purchase.skipReason') })
        } catch { /* it stays pending and shows under "Needs attention" */ }
      }
      setResult(res)
      await inv('devices', 'parties', 'party', 'dashboard', 'sales', 'purchases', 'exchanges', 'day')
      onToast(pick('exchange.done'))
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  function reset() { setParty(null); setOld({ ...emptyDraft('', 'trade_in'), condition: 'used', pta_status: 'pta_approved' }); setNewDev(null); setPrice(''); setPaid(''); setGiveBack(null); setPay(newPay()); setSkipOld(false); setSkipNew(false); setWhy(''); setIdem(uid()); setResult(null); setErr('') }

  if (result) {
    const bal = num(result.new_balance)
    return (
      <div className="max-w-xl mx-auto space-y-4" data-testid="nex-done">
        <div className="rounded-2xl bg-[#9AE600] text-slate-950 p-6 text-center space-y-1">
          <span className="mx-auto w-14 h-14 rounded-full bg-obsidian-900 text-[#9AE600] flex items-center justify-center"><Check className="w-7 h-7" /></span>
          <div className="font-display font-extrabold text-lg">{pick('exchange.done')}</div>
          <div className="font-mono text-sm" dir="ltr" data-testid="nex-done-no">{result.no}{result.invoice_no ? ` · ${result.invoice_no}` : ''}</div>
          <div className="text-sm font-bold" data-testid="nex-done-balance">{pick(owesWord(bal))}{bal ? <>: <span dir="ltr">{rs(bal)}</span></> : null}</div>
          {result.original_invoice_no ? <div className="text-xs opacity-80">{pick('exchange.firstBill')} <span dir="ltr">{result.original_invoice_no}</span></div> : null}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => void openPrintable(`/api/v1/sales/${result.invoice_id}/receipt?format=thermal`)} className="py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"><Printer className="w-4 h-4" />{pick('sale.printThermal')}</button>
          <button type="button" onClick={() => void openPrintable(`/api/v1/sales/${result.invoice_id}/receipt?format=a4`)} className="py-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"><FileText className="w-4 h-4" />{pick('sale.printA4')}</button>
          <button type="button" onClick={() => nav(`/sales/${result.invoice_id}`)} className="py-2.5 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-300 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"><Receipt className="w-4 h-4" />{pick('exchange.viewBill')}</button>
          <button type="button" onClick={reset} className="py-2.5 rounded-xl bg-[#9AE600] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nex-another"><Plus className="w-4 h-4" />{pick('exchange.another')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <div className="xl:col-span-4 space-y-4">
        <Panel n="1" title="sale.steps.customer" testid="nex-customer"><CustomerPick party={party} onPick={setParty} /></Panel>
        <Panel n="2" title="exchange.oldDevice" testid="nex-old"><OldPhone d={old} set={setOld} inStock={oldInStock} /></Panel>
      </div>
      <div className="xl:col-span-4 space-y-4">
        <Panel n="3" title="exchange.newDevice" testid="nex-new"><NewPhone dev={newDev} price={price} onPick={(d) => { setNewDev(d); setPrice(num(d.asking_price) ? String(num(d.asking_price)) : ''); setSkipNew(false); setWhy('') }} onPrice={setPrice} /></Panel>
      </div>
      <div className="xl:col-span-4 space-y-4">
        <section className="rounded-2xl bg-white dark:bg-obsidian-900 border-2 border-obsidian-900 dark:border-[#9AE600] p-4 space-y-3" data-testid="nex-settle">
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-[#9AE600] text-slate-950 font-mono text-[11px] font-extrabold flex items-center justify-center">4</span><h2 className="font-display font-extrabold text-sm">{pick('exchange.settle')}</h2></div>
          <div className="text-xs space-y-1.5">
            <Line k="exchange.newDevice" v={rs(total)} />
            <Line k="exchange.tradeValue" v={`− ${rs(tradeIn)}`} tone="text-emerald-700 dark:text-[#9AE600]" />
            {previous ? <Line k="exchange.previous" v={`${previous < 0 ? '−' : ''}${rs(previous)}`} /> : null}
          </div>
          <div className={`p-3.5 rounded-xl ${diff > 0 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300' : diff < 0 ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'}`} data-testid="nex-diff">
            <div className="text-[11px] font-extrabold uppercase tracking-wider">{pick(diff > 0 ? 'exchange.customerPays' : diff < 0 ? 'exchange.shopPays' : 'exchange.even')}</div>
            {diff !== 0 ? <div className="font-display font-extrabold text-2xl" dir="ltr">{rs(Math.abs(diff))}</div> : null}
          </div>
          {diff > 0 ? <div><label className={LABEL}>{pick('sale.paidNow')}</label><div className="flex gap-1.5"><input type="number" min={0} max={diff} value={paid} onChange={(e) => setPaid(e.target.value)} className={`${INPUT} font-mono text-base font-extrabold`} dir="ltr" data-testid="nex-paid" /><button type="button" onClick={() => setPaid(String(diff))} className="px-3 rounded-xl bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold cursor-pointer whitespace-nowrap" data-testid="nex-paid-all">{pick('nex.all')}</button></div><p className="text-[10px] text-slate-400 mt-1">{pick('exchange.paidHint')}</p></div> : null}
          {diff < 0 ? <div><label className={LABEL}>{pick('exchange.shopPaysNow')}</label><input type="number" min={0} max={-diff} value={giveBack ?? String(-diff)} onChange={(e) => setGiveBack(e.target.value)} className={`${INPUT} font-mono text-base font-extrabold`} dir="ltr" data-testid="nex-give" /><p className="text-[10px] text-slate-400 mt-1">{pick('exchange.shopPaysHint')}</p></div> : null}
          {moneyMoves ? <PayWay pay={pay} setPay={setPay} /> : null}
          <div className="p-3 rounded-xl bg-obsidian-900 text-white flex items-center justify-between" data-testid="nex-balance"><span className="text-xs font-bold text-[#9AE600]">{pick(owesWord(newBalance))}</span>{newBalance ? <span className="font-display font-extrabold text-lg" dir="ltr">{rs(newBalance)}</span> : null}</div>
          <div className="space-y-1.5">
            <div className={LABEL}>{pick('exchange.oldCheck')}</div>
            <div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => setSkipOld(false)} aria-pressed={!skipOld} className={`${pill(!skipOld)} py-2 flex items-center justify-center gap-1`}><ShieldCheck className="w-3.5 h-3.5" />{pick('exchange.oldCheckLater')}</button><button type="button" onClick={() => setSkipOld(true)} aria-pressed={skipOld} className={`${pill(skipOld)} py-2 flex items-center justify-center gap-1`}><UserCheck className="w-3.5 h-3.5" />{pick('counter.skipCheck')}</button></div>
          </div>
          {check === 'flagged' ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-rose-700 space-y-2" data-testid="nex-flagged"><div className="flex items-center gap-1.5 text-xs font-extrabold"><ShieldAlert className="w-4 h-4" />{pick('counter.flaggedSale')}</div>{isOwner ? <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('sale.override')} className={INPUT} /> : null}</div>
          ) : check === 'pending' ? (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-800 space-y-2" data-testid="nex-pending"><div className="flex items-center gap-1.5 text-xs font-extrabold"><ShieldAlert className="w-4 h-4" />{pick('exchange.pendingNew')}</div><div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => window.open(`/stock/${newDev!.id}/verify`, '_blank')} className={`${pill(false)} py-2`}>{pick('counter.checkNow')}</button><button type="button" onClick={() => setSkipNew(!skipNew)} aria-pressed={skipNew} className={`${pill(skipNew)} py-2`} data-testid="nex-skip">{pick('exchange.skipAndGive')}</button></div></div>
          ) : null}
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
          <button type="button" onClick={() => void confirm()} disabled={busy || !ready} className="w-full py-3 rounded-xl bg-[#9AE600] hover:brightness-95 disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer" data-testid="nex-confirm"><Check className="w-4 h-4" />{pick('exchange.confirm')}</button>
        </section>
      </div>
    </div>
  )
}

function Line({ k, v, tone }: { k: string; v: string; tone?: string }) {
  const { pick } = useLang()
  return <div className="flex items-center justify-between"><span className="text-slate-500">{pick(k)}</span><span className={`font-mono font-bold ${tone ?? ''}`} dir="ltr">{v}</span></div>
}

function CustomerPick({ party, onPick }: { party: Party | null; onPick: (p: Party | null) => void }) {
  const { pick, ur } = useLang()
  const [q, setQ] = useState('')
  const { data: people } = useParties(q.trim() ? { q: q.trim() } : {})
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  if (party) {
    const bal = num(party.balance)
    return <div className="p-3 rounded-xl border-2 border-obsidian-900 dark:border-[#9AE600] flex items-center justify-between gap-2" data-testid="nex-party"><div className="min-w-0"><div className="text-sm font-bold truncate" dir="auto">{party.name}</div><div className="text-[11px] text-slate-500" dir="ltr">{party.phone ?? ''}</div></div><div className="flex items-center gap-2">{bal ? <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${bal > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}`}>{pick(bal > 0 ? 'nkh.lena' : 'nkh.dena')} <span dir="ltr">{plain(bal)}</span></span> : null}<button type="button" onClick={() => onPick(null)} aria-label={pick('nlist.clear')} className="text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div></div>
  }
  if (adding) {
    return (
      <div className="space-y-2" data-testid="nex-new-party">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={pick('nex.name')} className={INPUT} dir="auto" data-testid="nex-new-name" />
        <PhoneInput label="settings.phone" value={phone} onChange={setPhone} />
        {err ? <p className="text-[11px] font-bold text-rose-600">{err}</p> : null}
        <div className="flex gap-2"><button type="button" onClick={() => setAdding(false)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={name.trim().length < 2} onClick={async () => { setErr(''); try { onPick(await api<Party>('POST', '/api/v1/parties', { name: name.trim(), phone: phone || null, kinds: ['customer'] })) } catch (e) { setErr(errText(e, ur)) } }} className="flex-1 py-2 rounded-xl bg-obsidian-900 dark:bg-[#9AE600] text-white dark:text-obsidian-950 text-xs font-extrabold cursor-pointer disabled:opacity-50" data-testid="nex-new-save">{pick('common.save')}</button></div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5"><div className="relative flex-1"><Users className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nlist.partySearch')} className={`${INPUT} ps-8`} data-testid="nex-pq" /></div><button type="button" onClick={() => setAdding(true)} className="px-2.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 text-[11px] font-bold flex items-center gap-1 cursor-pointer" data-testid="nex-add-party"><UserPlus className="w-3.5 h-3.5" />{pick('nex.newCustomer')}</button></div>
      <div className="max-h-44 overflow-y-auto space-y-1" data-testid="nex-people">{(people ?? []).slice(0, 8).map((p) => <button key={p.id} type="button" onClick={() => onPick(p)} className="w-full p-2 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border border-slate-200 dark:border-slate-800 hover:border-slate-400"><span className="font-bold truncate" dir="auto">{p.name}</span><span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.phone ?? ''}</span></button>)}</div>
    </div>
  )
}

/** the phone coming in: the live purchase line, asked in the files' style (its value is its cost) */
function OldPhone({ d, set, inStock }: { d: DeviceLineDraft; set: (d: DeviceLineDraft) => void; inStock: boolean }) {
  const { pick } = useLang()
  const [mq, setMq] = useState('')
  const { data: brands } = useBrands('phone')
  const { data: models } = useModels(d.brand_id || undefined, mq || undefined, 'phone')
  const { data: storages } = useStorages()
  const { data: colours } = useColours()
  const up = (p: Partial<DeviceLineDraft>) => set({ ...d, ...p })
  const topBrands = useMemo(() => (brands ?? []).slice().sort((a, b) => b.model_count - a.model_count).slice(0, 10), [brands])
  const imei = digits(d.imei1)
  return (
    <div className="space-y-3">
      <div><label className={LABEL}>IMEI</label><input value={d.imei1} onChange={(e) => up({ imei1: digits(e.target.value).slice(0, 15) })} inputMode="numeric" placeholder="35xxxxxxxxxxxxx" className={`${INPUT} font-mono`} dir="ltr" data-testid="nex-old-imei" />{imei.length > 0 && imei.length !== 15 ? <p className="text-[10px] text-amber-600 mt-1">{pick('nex.imei15')}</p> : null}{inStock ? <p className="text-[10px] font-bold text-rose-600 mt-1" data-testid="nex-old-instock">{pick('nex.alreadyIn')}</p> : null}</div>
      <div><label className={LABEL}>{pick('nex.brand')}</label><div className="flex flex-wrap gap-1" data-testid="nex-brands">{topBrands.map((b) => <button key={b.id} type="button" onClick={() => up({ brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' })} className={pill(d.brand_id === b.id)}>{b.name}</button>)}</div><select value={d.brand_id} onChange={(e) => { const b = (brands ?? []).find((x) => x.id === e.target.value); if (b) up({ brand_id: b.id, brand_name: b.name, model_id: '', model_name: '' }) }} className={`${INPUT} mt-1.5`} aria-label={pick('nex.brand')} data-testid="nex-brand-all"><option value="">{pick('nex.otherBrand')}</option>{(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      {d.brand_id ? (
        <div><label className={LABEL}>{pick('nex.model')}</label>
          {d.model_id ? <div className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between text-xs"><span className="font-bold" data-testid="nex-old-model">{d.brand_name} {d.model_name}</span><button type="button" onClick={() => up({ model_id: '', model_name: '' })} className="text-slate-400 cursor-pointer" aria-label={pick('nlist.clear')}><X className="w-3.5 h-3.5" /></button></div> : (
            <><input value={mq} onChange={(e) => setMq(e.target.value)} placeholder={pick('nex.modelSearch')} className={INPUT} data-testid="nex-model-q" /><div className="mt-1 max-h-36 overflow-y-auto flex flex-wrap gap-1" data-testid="nex-models">{(models ?? []).slice(0, 24).map((m) => <button key={m.id} type="button" onClick={() => up({ model_id: m.id, model_name: m.name })} className={pill(false)}>{m.name}</button>)}</div></>
          )}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={LABEL}>{pick('nex.storage')}</label><select value={d.storage_id} onChange={(e) => up({ storage_id: e.target.value })} className={INPUT}><option value="">—</option>{(storages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className={LABEL}>{pick('nex.colour')}</label><select value={d.colour_id} onChange={(e) => up({ colour_id: e.target.value })} className={INPUT}><option value="">—</option>{(colours ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div><label className={LABEL}>{pick('nbuy.condition')}</label><div className="flex flex-wrap gap-1">{(['used', 'open_box', 'box_pack', 'patched'] as const).map((c) => <button key={c} type="button" onClick={() => up({ condition: c })} className={pill(d.condition === c)}>{pick(`stock.condition.${c}`)}</button>)}</div>{d.condition === 'patched' ? <input value={d.patch_details} onChange={(e) => up({ patch_details: e.target.value })} placeholder={pick('nbuy.patchWhat')} className={`${INPUT} mt-1.5`} /> : null}</div>
      <div><label className={LABEL}>PTA</label><div className="flex flex-wrap gap-1">{(['pta_approved', 'non_pta', 'jv', 'cpid'] as const).map((p) => <button key={p} type="button" onClick={() => up({ pta_status: p })} className={pill(d.pta_status === p)}>{pick(`stock.pta.${p}`)}</button>)}</div></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={LABEL}>{pick('nex.battery')}</label><input type="number" min={1} max={100} value={d.battery_health} onChange={(e) => up({ battery_health: e.target.value })} placeholder="%" className={`${INPUT} font-mono`} dir="ltr" /></div>
        <div><label className={LABEL}>{pick('exchange.tradeValue')}</label><input type="number" min={0} value={d.cost} onChange={(e) => up({ cost: e.target.value })} className={`${INPUT} font-mono font-extrabold`} dir="ltr" data-testid="nex-old-value" /></div>
        <div><label className={LABEL}>{pick('nex.resale')}</label><input type="number" min={0} value={d.asking_price} onChange={(e) => up({ asking_price: e.target.value })} className={`${INPUT} font-mono`} dir="ltr" data-testid="nex-old-asking" /></div>
      </div>
      {d.condition !== 'box_pack' ? <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer"><input type="checkbox" checked={!!d.lock_checked} onChange={(e) => up({ lock_checked: e.target.checked })} className="w-4 h-4 accent-[#9AE600]" />{pick('nex.lockChecked')}</label> : null}
    </div>
  )
}

function NewPhone({ dev, price, onPick, onPrice }: { dev: Device | null; price: string; onPick: (d: Device) => void; onPrice: (v: string) => void }) {
  const { pick } = useLang()
  const [q, setQ] = useState('')
  const { data: stock } = useDevices({ status: 'in_stock', q: q.trim() || undefined, limit: 30 })
  return (
    <div className="space-y-3">
      {dev ? (
        <div className="p-3 rounded-xl border-2 border-obsidian-900 dark:border-[#9AE600] space-y-2" data-testid="nex-new-picked">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-bold truncate">{dev.brand_name} {dev.model_name}</div><div className="font-mono text-[11px] text-slate-500" dir="ltr">{dev.imei1}</div></div><span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-obsidian-850">{pick(`stock.condition.${dev.condition}`)}</span></div>
          <div><label className={LABEL}>{pick('sale.price')}</label><input type="number" min={0} value={price} onChange={(e) => onPrice(e.target.value)} className={`${INPUT} font-mono text-base font-extrabold`} dir="ltr" data-testid="nex-price" /></div>
        </div>
      ) : null}
      <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nex.stockSearch')} className={`${INPUT} ps-8`} data-testid="nex-stock-q" /></div>
      <div className="max-h-[420px] overflow-y-auto space-y-1.5" data-testid="nex-stock">
        {(stock ?? []).map((d) => (
          <button key={d.id} type="button" onClick={() => onPick(d)} className={`w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border ${dev?.id === d.id ? 'border-2 border-obsidian-900 dark:border-[#9AE600]' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'}`}>
            <span className="flex items-center gap-2 min-w-0"><span className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-obsidian-850 flex items-center justify-center"><Smartphone className="w-4 h-4 text-slate-500" /></span><span className="min-w-0"><span className="block font-bold truncate">{d.brand_name} {d.model_name}</span><span className="block font-mono text-[10px] text-slate-400" dir="ltr">{d.imei1}</span></span></span>
            <span className="text-end shrink-0"><span className="block font-mono font-bold" dir="ltr">{num(d.asking_price) ? rs(d.asking_price) : '—'}</span>{d.verification_status === 'pending' ? <span className="text-[10px] font-bold text-amber-600">{pick('nex.idPending')}</span> : d.verification_status === 'flagged' ? <span className="text-[10px] font-bold text-rose-600">{pick('nex.flagged')}</span> : null}</span>
          </button>
        ))}
        {stock && !stock.length ? <p className="text-[11px] text-slate-400 p-2">{pick('nloan.noStock')}</p> : null}
      </div>
    </div>
  )
}

/** how the money moved now: cash, online with the bank, or a cheque (as the live wizard asks) */
function PayWay({ pay, setPay }: { pay: PayState; setPay: (p: PayState) => void }) {
  const { pick } = useLang()
  return (
    <div className="space-y-2" data-testid="nex-pay">
      <div className="grid grid-cols-3 gap-1">{(['cash', 'online', 'cheque'] as const).map((m) => <button key={m} type="button" onClick={() => setPay({ ...newPay(m), chequeDate: pay.chequeDate })} aria-pressed={pay.method === m} className={`${pill(pay.method === m)} py-2`} data-testid={`nex-pay-${m}`}>{pick(`nq.m.${m}`)}</button>)}</div>
      {pay.method !== 'cash' ? (
        <>
          <select value={pay.bank} onChange={(e) => setPay({ ...pay, bank: e.target.value })} className={INPUT} aria-label={pick('nq.bank')} data-testid="nex-pay-bank"><option value="">{pick('nq.bank')}</option>{ALL_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
          <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pick(pay.method === 'cheque' ? 'nq.chequeNo' : 'nq.tid')} className={INPUT} dir="ltr" />
          {pay.method === 'cheque' ? <input type="date" value={pay.chequeDate} onChange={(e) => setPay({ ...pay, chequeDate: e.target.value })} className={INPUT} dir="ltr" /> : null}
        </>
      ) : null}
    </div>
  )
}

function Recent({ onToast }: { onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const role = useAuth((s) => s.me?.user.role)
  const canDelete = role === 'owner' || role === 'manager'
  const { data } = useGet<ExchangeOut[]>(['exchanges'], '/api/v1/exchanges?limit=200')
  const [del, setDel] = useState<ExchangeOut | null>(null)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nex-recent">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><h2 className="font-display font-extrabold text-sm">{pick('nex.tab.recent')}</h2><span className="text-[11px] text-slate-500">{t('nex.count', { n: (data ?? []).length })}</span></div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {!data?.length ? <div className="p-10 text-center text-sm text-slate-400">{pick('nex.none')}</div> : data.map((e) => {
          const bal = num(e.new_balance)
          return (
            <div key={e.id} className={`p-3.5 sm:p-4 grid grid-cols-12 gap-3 items-center ${e.deleted ? 'opacity-60' : ''}`} data-testid="nex-row">
              <div className="col-span-12 sm:col-span-4 min-w-0"><div className="text-sm font-bold truncate" dir="auto">{e.party_name}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{fmtDate(e.date)}</span> · <span className="font-mono" dir="ltr">{e.no}</span>{e.invoice_no ? <> · <span className="font-mono" dir="ltr">{e.invoice_no}</span></> : null}</div></div>
              <div className="col-span-6 sm:col-span-4 text-xs"><div><span className="text-slate-500">{pick('exchange.newDevice')}:</span> <strong dir="ltr">{rs(e.new_total)}</strong></div><div><span className="text-slate-500">{pick('exchange.tradeValue')}:</span> <strong className="text-emerald-700 dark:text-[#9AE600]" dir="ltr">{rs(e.trade_in_value)}</strong></div></div>
              <div className="col-span-6 sm:col-span-4 flex items-center justify-end gap-2">
                {e.deleted ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">{pick('sale.status.void')}</span> : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${bal > 0 ? 'bg-amber-100 text-amber-800' : bal < 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{pick(bal > 0 ? 'exchange.toGet' : bal < 0 ? 'exchange.toGive' : 'exchange.settled')}{bal ? <> <span dir="ltr">{plain(bal)}</span></> : null}</span>}
                <button type="button" onClick={() => nav(`/sales/${e.invoice_id}`)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 cursor-pointer" aria-label={pick('exchange.viewBill')}><Receipt className="w-3.5 h-3.5" /></button>
                {canDelete && !e.deleted ? <button type="button" onClick={() => { setDel(e); setWhy(''); setErr('') }} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={pick('crud.delete')} data-testid="nex-delete"><Trash2 className="w-3.5 h-3.5" /></button> : null}
              </div>
            </div>
          )
        })}
      </div>
      {del ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" data-testid="nex-del-window">
          <div className="bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-display font-extrabold text-sm">{pick('nex.deleteTitle')} <span className="font-mono" dir="ltr">{del.no}</span></h3><button type="button" onClick={() => setDel(null)} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
            <p className="text-xs text-slate-500">{pick('nex.deleteEffect')}</p>
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('bill.reasonPh')} className={INPUT} data-testid="nex-del-why" />
            {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setDel(null)} className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={why.trim().length < 3} onClick={async () => { setErr(''); try { await api('POST', `/api/v1/exchanges/${del.id}/void`, { reason: why.trim() }); await inv('exchanges', 'devices', 'parties', 'party', 'dashboard', 'sales', 'purchases', 'day'); setDel(null); onToast(pick('nkh.undone')) } catch (e) { setErr(errText(e, ur)) } }} className="px-4 py-2 rounded-xl bg-rose-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="nex-del-yes">{pick('nkh.confirmDelete')}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
