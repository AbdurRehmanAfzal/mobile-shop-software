/** Branch transfers in the new product (ADR-134, ADR-046). No mock-up draws them (owner 2026-11-23:
 *  design them from what the live software does, in the files' own visual language) — so they are
 *  drawn like the purchases list (file 10) and amanat (file 12): the shared rail, the bar with
 *  "+ Send to a branch", three cards, tabs and a search, a card per transfer on the left and the chosen
 *  one on the right with its lines and Undo; the send drawer picks the branch, phones and items.
 *
 *  Everything is the live transfer: `GET /transfers/branches` (the owner's other branches this user
 *  works in), `GET /transfers`, `POST /transfers` (phones by id, items with a count — they leave at
 *  their cost, never as income), `POST /transfers/{id}/undo` with a reason (the sender's side, owner /
 *  manager, ADR-090). The cost on a transfer is the server's; the drawer's total is a preview of the
 *  phones' and items' own costs, as on the live screen. Owner / manager (VIEW_COST), as the server. */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, Boxes, Languages, Minus, Moon, Plus, Search, Send, ShieldCheck, Smartphone, Store, Sun, Trash2, Undo2, X, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useDevices, useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { Device } from '@/lib/types'
import FileRail from '../FileRail'

const LIME = '#A3E635'
type Tab = 'all' | 'out' | 'in'
interface Branch { id: string; name: string; city: string | null }
interface Line { kind: 'device' | 'item'; label: string; qty: number; cost: string; device_id: string | null; item_id: string | null }
interface Transfer { id: string; no: string; direction: 'out' | 'in'; other_shop: string | null; at: string; note: string | null; total_cost: string; lines: Line[]; undone_by?: string | null }
interface Item { id: string; name: string; name_ur: string | null; sku: string; qty: number; avg_cost: string | null }
const num = (v: string | number | null | undefined) => Number(v ?? 0)
const rs = (v: string | number | null | undefined) => withCur(Math.abs(num(v)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

export default function NewTransfers() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { id: openId } = useParams()
  const [params] = useSearchParams()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { data } = useGet<Transfer[]>(['transfers'], manager ? '/api/v1/transfers' : null)
  const { data: branches } = useGet<Branch[]>(['transfer-branches'], manager ? '/api/v1/transfers/branches' : null)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(openId && openId !== 'new' ? openId : null)
  const [sending, setSending] = useState(openId === 'new' || !!params.get('device'))
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3000); return () => clearTimeout(x) }, [toast])
  const list = data ?? []
  const query = q.trim().toLowerCase()
  const shown = list.filter((x) => (tab === 'all' || x.direction === tab) && (!query || `${x.no} ${x.other_shop ?? ''} ${x.note ?? ''} ${x.lines.map((l) => l.label).join(' ')}`.toLowerCase().includes(query)))
  const cur = shown.find((x) => x.id === sel) ?? shown[0] ?? null
  const counts = { out: list.filter((x) => x.direction === 'out').length, in: list.filter((x) => x.direction === 'in').length, undone: list.filter((x) => x.undone_by).length }

  const shell = (body: React.ReactNode) => (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="ntr" data-newui="1" data-file="10">
      <FileRail lit="" lime={LIME} testid="ntr-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">{body}</div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#A3E635]" /><span data-testid="ntr-toast">{toast}</span></div></div>
    </div>
  )
  if (!manager) return shell(<div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="ntr-managers"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('ntr.managersOnly')}</p></div></div>)

  const card = (k: Tab | 'undone', label: string, n: number, Icon: typeof Store, tone: string) => (
    <button type="button" onClick={() => k !== 'undone' && setTab(k)} className={`p-3.5 rounded-2xl text-start cursor-pointer border ${tone} ${tab === k ? 'ring-2 ring-obsidian-900 dark:ring-[#A3E635]' : ''}`} data-testid={`ntr-k-${k}`}>
      <div className="flex items-center justify-between"><span className={`font-extrabold uppercase tracking-wider ${ur ? cls('sm') : 'text-[10px]'}`}>{pick(label)}</span><Icon className="w-3.5 h-3.5 opacity-70" /></div>
      <div className="font-display font-extrabold text-xl mt-1">{t('ntr.count', { n })}</div>
    </button>
  )

  return shell(
    <>
      <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#A3E635] text-[#A3E635] dark:text-obsidian-950 flex items-center justify-center"><Store className="w-4 h-4" /></span>
          <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('transfer.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('ntr.subtitle')}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="ntr-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#A3E635]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          {branches?.length ? <button type="button" onClick={() => setSending(true)} className="px-3.5 py-1.5 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] text-slate-950 font-display font-extrabold text-xs flex items-center gap-1.5 cursor-pointer" data-testid="ntr-send-open"><Send className="w-4 h-4" />{pick('ntr.send')}</button> : null}
        </div>
      </header>

      {branches && !branches.length ? <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs font-semibold text-amber-800 dark:text-amber-300" data-testid="ntr-no-branch">{pick('transfer.noBranch')}</div> : null}
      <div className="shrink-0 px-4 sm:px-6 pt-3.5 pb-2 grid grid-cols-3 gap-2.5 sm:gap-3">
        {card('out', 'ntr.kOut', counts.out, ArrowUpRight, 'bg-white dark:bg-obsidian-900 border-slate-200 dark:border-slate-800')}
        {card('in', 'ntr.kIn', counts.in, ArrowDownLeft, 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200')}
        {card('undone', 'ntr.kUndone', counts.undone, Undo2, 'bg-slate-100/80 dark:bg-obsidian-850 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300')}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        <div className="w-full lg:w-[55%] lg:h-full flex flex-col min-h-0 border-b lg:border-b-0 lg:border-e border-slate-200/80 dark:border-slate-800">
          <div className="shrink-0 px-4 sm:px-6 pt-2 pb-3 space-y-2.5">
            <div className="flex items-center gap-1.5">{(['all', 'out', 'in'] as Tab[]).map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`ntr-tab-${k}`} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}>{pick(`ntr.tab.${k}`)}</button>)}</div>
            <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('ntr.search')} className="w-full ps-9 pe-8 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="ntr-q" />{q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><XCircle className="w-3.5 h-3.5" /></button> : null}</div>
          </div>
          <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 pb-6 space-y-2.5" data-testid="ntr-cards">
            {!shown.length ? <div className="p-8 text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700"><div className="text-sm font-bold">{pick('transfer.none')}</div></div> : shown.map((x) => {
              const on = x.id === cur?.id
              return (
                <div key={x.id} role="button" tabIndex={0} onClick={() => setSel(x.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSel(x.id) }} data-testid="ntr-card" className={`p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-obsidian-900 cursor-pointer ${on ? 'border-2 border-obsidian-900 dark:border-[#A3E635] shadow-md' : 'border border-slate-200/90 dark:border-slate-800 hover:border-slate-400'} ${x.undone_by ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0"><span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${x.direction === 'out' ? 'bg-slate-100 dark:bg-obsidian-850 text-slate-700 dark:text-slate-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{x.direction === 'out' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}</span><div className="min-w-0"><div className="text-sm font-bold truncate" dir="auto">{pick(x.direction === 'out' ? 'transfer.sentTo' : 'transfer.cameFrom').replace('{{shop}}', x.other_shop ?? '—')}</div><div className="text-[11px] text-slate-500"><span className="font-mono" dir="ltr">{x.no}</span> · <span dir="ltr">{fmtDate(x.at)}</span> · {pick('transfer.lines').replace('{{n}}', String(x.lines.length))}</div></div></div>
                    <div className="shrink-0 text-end"><div className="font-display font-extrabold text-sm" dir="ltr">{rs(x.total_cost)}</div>{x.undone_by ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">{pick('ntr.undone')}</span> : null}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="w-full lg:w-[45%] lg:h-full lg:overflow-y-auto bg-white dark:bg-obsidian-900 p-4 sm:p-6 space-y-4" data-testid="ntr-detail">
          {cur ? <Detail x={cur} onToast={setToast} /> : <div className="h-full min-h-40 flex items-center justify-center text-xs text-slate-400">{pick('ntr.pick')}</div>}
        </div>
      </div>
      {sending && branches?.length ? <SendDrawer branches={branches} preDevice={params.get('device')} onClose={() => { setSending(false); if (openId === 'new') nav('/new/transfers', { replace: true }) }} onDone={(x) => { setSending(false); setSel(x.id); setTab('all'); setToast(pick('transfer.sentTo').replace('{{shop}}', x.other_shop ?? '')) }} /> : null}
    </>,
  )
}

function Detail({ x, onToast }: { x: Transfer; onToast: (m: string) => void }) {
  const { pick, ur } = useLang()
  const nav = useNavigate()
  const inv = useInvalidate()
  const [undo, setUndo] = useState(false)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  return (
    <>
      <div className={`p-4 rounded-2xl ${x.direction === 'out' ? 'bg-obsidian-900 text-white' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border border-emerald-200'}`} data-testid="ntr-head">
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{pick(x.direction === 'out' ? 'ntr.kOut' : 'ntr.kIn')}</span><span className="font-mono text-[11px] opacity-80" dir="ltr">{x.no} · {fmtDate(x.at)}</span></div>
        <div className="font-display font-extrabold text-lg mt-1" dir="auto">{pick(x.direction === 'out' ? 'transfer.sentTo' : 'transfer.cameFrom').replace('{{shop}}', x.other_shop ?? '—')}</div>
        <div className="flex items-baseline justify-between mt-1"><span className="text-xs opacity-80">{pick('transfer.cost')}</span><span className={`font-display font-extrabold text-2xl ${x.direction === 'out' ? 'text-[#A3E635]' : ''}`} dir="ltr">{rs(x.total_cost)}</span></div>
        {x.undone_by ? <div className="mt-2 px-2.5 py-1 rounded-lg bg-white/15 text-[11px] font-bold">{pick('ntr.undoneNote')}</div> : null}
      </div>
      {x.note ? <p className="text-xs text-slate-500 italic" dir="auto">"{x.note}"</p> : null}
      <div className="space-y-2" data-testid="ntr-lines">
        <div className="text-[11px] font-display font-extrabold uppercase tracking-wider text-slate-400">{pick('ntr.whatWent')}</div>
        {x.lines.map((l, i) => (
          <button key={i} type="button" onClick={() => (l.device_id ? nav(`/stock/${l.device_id}`) : l.item_id ? nav(`/accessories/${l.item_id}`) : undefined)} className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50/80 dark:bg-obsidian-850/60 border border-slate-200/60 dark:border-slate-800 text-xs text-start cursor-pointer">
            <span className="flex items-center gap-2 min-w-0"><span className="w-7 h-7 shrink-0 rounded-lg bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">{l.kind === 'device' ? <Smartphone className="w-3.5 h-3.5" /> : <Boxes className="w-3.5 h-3.5" />}</span><span className="min-w-0"><span className="block font-bold truncate" dir="auto">{l.label}</span>{l.kind === 'item' ? <span className="block text-[10px] text-slate-500">{pick('transfer.pieces').replace('{{n}}', String(l.qty))}</span> : null}</span></span>
            <span className="font-mono font-bold shrink-0" dir="ltr">{rs(l.cost)}</span>
          </button>
        ))}
      </div>
      {x.direction === 'out' && !x.undone_by ? (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          {!undo ? <button type="button" onClick={() => setUndo(true)} className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer" data-testid="ntr-undo"><Undo2 className="w-3 h-3" />{pick('del.undoBranch')}</button> : (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 space-y-2" data-testid="ntr-undo-box">
              <p className="text-[11px] text-rose-800 dark:text-rose-300">{pick('ntr.undoEffect')}</p>
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('bill.reasonPh')} className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" data-testid="ntr-undo-why" />
              {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setUndo(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer">{pick('common.cancel')}</button><button type="button" disabled={why.trim().length < 3} onClick={async () => { setErr(''); try { await api('POST', `/api/v1/transfers/${x.id}/undo`, { reason: why.trim() }); await inv('transfers', 'devices', 'device', 'stock-items', 'dashboard'); setUndo(false); onToast(pick('ntr.undoneToast')) } catch (e) { setErr(errText(e, ur)) } }} className="px-3.5 py-1.5 rounded-xl bg-rose-600 disabled:opacity-50 text-white font-bold text-xs cursor-pointer" data-testid="ntr-undo-yes">{pick('del.undoBranch')}</button></div>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

function SendDrawer({ branches, preDevice, onClose, onDone }: { branches: Branch[]; preDevice: string | null; onClose: () => void; onDone: (x: Transfer) => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [to, setTo] = useState<string>(branches.length === 1 ? branches[0].id : '')
  const [kind, setKind] = useState<'phones' | 'items'>('phones')
  const [q, setQ] = useState('')
  const { data: stock } = useDevices({ status: 'in_stock', q: q.trim() || undefined, limit: 40 })
  const { data: items } = useGet<Item[]>(['stock-items', 'transfer', q.trim()], kind === 'items' ? `/api/v1/accessories${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}` : null)
  const [phones, setPhones] = useState<Device[]>([])
  const [picked, setPicked] = useState<{ item: Item; qty: number }[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { data: pre } = useGet<Device>(['device', preDevice], preDevice ? `/api/v1/devices/${preDevice}` : null)
  useEffect(() => { if (pre && pre.status === 'in_stock') setPhones((xs) => (xs.some((d) => d.id === pre.id) ? xs : [...xs, pre])) }, [pre])
  // a preview of what leaves at its own cost (the transfer's cost is the server's)
  const cost = useMemo(() => phones.reduce((s, d) => s + num(d.cost_price), 0) + picked.reduce((s, x) => s + num(x.item.avg_cost) * x.qty, 0), [phones, picked])
  async function send() {
    setBusy(true); setErr('')
    try {
      const x = await api<Transfer>('POST', '/api/v1/transfers', { to_shop_id: to, devices: phones.map((d) => d.id), items: picked.map((p) => ({ id: p.item.id, qty: p.qty })), note: note.trim() || null })
      await inv('transfers', 'devices', 'device', 'history', 'unit-money', 'stock-items', 'dashboard')
      onDone(x)
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }
  const row = 'w-full p-2.5 rounded-xl text-start text-xs flex items-center justify-between gap-2 cursor-pointer border border-slate-200 dark:border-slate-800 hover:border-slate-400'
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="ntr-drawer">
      <div className="w-full max-w-xl h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div><h3 className="font-display font-extrabold text-sm">{pick('ntr.send')}</h3><p className="text-[11px] text-slate-500">{pick('ntr.sendHint')}</p></div><button type="button" onClick={onClose} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">1. {pick('transfer.to')}</label>
            <div className="flex flex-wrap gap-2" data-testid="ntr-branches">{branches.map((b) => <button key={b.id} type="button" onClick={() => setTo(b.id)} aria-pressed={to === b.id} className={`px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer ${to === b.id ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850'}`}><Store className="w-3.5 h-3.5" />{b.name}{b.city ? <span className="opacity-70 font-medium">· {b.city}</span> : null}</button>)}</div>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">2. {pick('ntr.what')}</label>
            {phones.length || picked.length ? (
              <div className="space-y-1.5" data-testid="ntr-picked">
                {phones.map((d) => <div key={d.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 min-w-0"><Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" /><span className="min-w-0"><span className="block font-bold truncate">{d.brand_name} {d.model_name}</span><span className="block font-mono text-[10px] text-slate-400" dir="ltr">{d.imei1}</span></span></span><span className="flex items-center gap-2"><span className="font-mono" dir="ltr">{rs(d.cost_price)}</span><button type="button" onClick={() => setPhones(phones.filter((y) => y.id !== d.id))} aria-label={pick('transfer.remove')} className="p-1 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></span></div>)}
                {picked.map((p) => <div key={p.item.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 min-w-0"><Boxes className="w-3.5 h-3.5 text-slate-500 shrink-0" /><span className="min-w-0"><span className="block font-bold truncate">{ur && p.item.name_ur ? p.item.name_ur : p.item.name}</span><span className="block text-[10px] text-slate-400">{pick('transfer.inStock').replace('{{n}}', String(p.item.qty))}</span></span></span><span className="flex items-center gap-1.5" dir="ltr"><button type="button" aria-label="−" onClick={() => setPicked(picked.map((y) => (y.item.id === p.item.id ? { ...y, qty: Math.max(1, y.qty - 1) } : y)))} className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"><Minus className="w-3 h-3" /></button><input aria-label={pick('transfer.qty')} inputMode="numeric" value={p.qty} onChange={(e) => { const v = Math.max(1, Math.min(p.item.qty, Number(e.target.value.replace(/\D/g, '')) || 1)); setPicked(picked.map((y) => (y.item.id === p.item.id ? { ...y, qty: v } : y))) }} className="w-12 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-900 text-center font-bold" data-testid="ntr-qty" /><button type="button" aria-label="+" onClick={() => setPicked(picked.map((y) => (y.item.id === p.item.id ? { ...y, qty: Math.min(p.item.qty, y.qty + 1) } : y)))} className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer" data-testid="ntr-plus"><Plus className="w-3 h-3" /></button><button type="button" onClick={() => setPicked(picked.filter((y) => y.item.id !== p.item.id))} aria-label={pick('transfer.remove')} className="p-1 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></span></div>)}
              </div>
            ) : <p className="text-[11px] text-slate-400">{pick('ntr.nothingYet')}</p>}
            <div className="flex items-center gap-1.5 pt-1">{(['phones', 'items'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} data-testid={`ntr-kind-${k}`} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${kind === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#A3E635] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850'}`}>{pick(k === 'phones' ? 'transfer.phones' : 'transfer.items')}</button>)}</div>
            <div className="relative"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick(kind === 'phones' ? 'nloan.searchStock' : 'ntr.itemSearch')} className="w-full ps-8 pe-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="ntr-dq" /></div>
            <div className="max-h-64 overflow-y-auto space-y-1.5" data-testid="ntr-stock">
              {kind === 'phones'
                ? (stock ?? []).filter((d) => !phones.some((p) => p.id === d.id)).slice(0, 30).map((d) => <button key={d.id} type="button" onClick={() => setPhones([...phones, d])} className={row}><span className="min-w-0"><span className="block font-bold truncate">{d.brand_name} {d.model_name}</span><span className="block font-mono text-[10px] text-slate-400" dir="ltr">{d.imei1}</span></span><Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" /></button>)
                : (items ?? []).filter((i) => i.qty > 0 && !picked.some((p) => p.item.id === i.id)).slice(0, 30).map((i) => <button key={i.id} type="button" onClick={() => setPicked([...picked, { item: i, qty: 1 }])} className={row}><span className="min-w-0"><span className="block font-bold truncate">{ur && i.name_ur ? i.name_ur : i.name}</span><span className="block text-[10px] text-slate-400">{pick('transfer.inStock').replace('{{n}}', String(i.qty))}</span></span><Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" /></button>)}
            </div>
          </div>
          <div className="space-y-2"><label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">3. {pick('transfer.note')}</label><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" dir="auto" /></div>
          {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">{pick('transfer.cost')}</span><span className="font-display font-extrabold text-lg" dir="ltr" data-testid="ntr-cost">{rs(cost)}</span></div>
          <button type="button" onClick={() => void send()} disabled={busy || !to || (!phones.length && !picked.length)} className="w-full py-3 rounded-xl bg-[#A3E635] hover:bg-[#84CC16] disabled:opacity-50 text-slate-950 font-display font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer" data-testid="ntr-send"><Send className="w-4 h-4" />{pick('transfer.send')}</button>
        </div>
      </div>
    </div>
  )
}
