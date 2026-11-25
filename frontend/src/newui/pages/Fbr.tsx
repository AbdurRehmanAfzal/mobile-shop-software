/** FBR digital invoicing in the new product (ADR-134, ADR-049 / ADR-050). No mock-up draws it (owner
 *  2026-11-23: design it from what the live software does, in the files' own visual language) — so it
 *  is drawn like cash & bank (file 03): the shared rail, the bar with where bills go (sandbox /
 *  production), the setup as a checklist (owner), three cards (sent / waiting / turned down) and the
 *  bills as rows with their FBR number, the error FBR gave, and Send again.
 *
 *  Everything is the live FBR: `GET /fbr/settings` (owner — whether it is on, where it sends, whether
 *  the token is saved; the token itself is never sent to the app), `POST /fbr/test` (owner),
 *  `GET /fbr/submissions` (the bills, with the counts), `POST /fbr/submissions/{id}/send` (send a
 *  waiting or turned-down bill again), `POST /fbr/send-pending`. The setup is changed in Shop settings
 *  (tab 4) and explained in the FBR guide; this screen never promises what was not run against FBR. */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, CheckCircle2, Clock, Copy, Landmark, Languages, Moon, PlugZap, Search, Send, Settings, Sun, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { ApiError, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import FileRail from '../FileRail'

const LIME = '#B4F000'
type St = 'pending' | 'sent' | 'rejected'
interface Fbr { enabled: boolean; env: 'sandbox' | 'production'; token_set: boolean; ntn: string | null; strn: string | null; ready: boolean }
interface Sub { id: string; invoice_id: string; invoice_no: string; total: string; env: string; status: St; fbr_invoice_no: string | null; attempts: number; last_error: string | null; sent_at: string | null; created_at: string }
interface Subs { counts: Record<St, number>; rows: Sub[] }
const rs = (v: string | number | null | undefined) => withCur(Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

export default function NewFbr() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const nav = useNavigate()
  const inv = useInvalidate()
  const owner = useAuth((s) => s.me?.user.role) === 'owner'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const { data: fbr } = useGet<Fbr>(['fbr-settings'], owner ? '/api/v1/fbr/settings' : null)
  const { data: subs } = useGet<Subs>(['fbr-subs'], '/api/v1/fbr/submissions')
  const [tab, setTab] = useState<St | 'all'>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [test, setTest] = useState<{ ok: boolean; error: string | null } | null>(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 3000); return () => clearTimeout(x) }, [toast])
  const counts = subs?.counts ?? { pending: 0, sent: 0, rejected: 0 }
  const query = q.trim().toLowerCase()
  const rows = (subs?.rows ?? []).filter((r) => (tab === 'all' || r.status === tab) && (!query || `${r.invoice_no} ${r.fbr_invoice_no ?? ''} ${r.last_error ?? ''}`.toLowerCase().includes(query)))

  async function again(id: string) { setBusy(id); setErr(''); try { const r = await post<Sub>(`/api/v1/fbr/submissions/${id}/send`, {}); await inv('fbr-subs', 'fbr-bill'); setToast(pick(r.status === 'sent' ? 'nfbr.sentNow' : 'nfbr.stillWaiting')) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(null) } }
  async function sendAll() { setBusy('all'); setErr(''); try { const r = await post<{ tried: number }>('/api/v1/fbr/send-pending', {}); await inv('fbr-subs', 'fbr-bill'); setToast(t('nfbr.tried', { n: r.tried })) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(null) } }
  async function tryIt() { setBusy('test'); setTest(null); setErr(''); try { setTest(await post<{ ok: boolean; error: string | null }>('/api/v1/fbr/test', {})) } catch (e) { setErr(errText(e, ur)) } finally { setBusy(null) } }

  const steps: { k: string; ok: boolean }[] = fbr ? [{ k: 'nfbr.s.ntn', ok: !!fbr.ntn }, { k: 'nfbr.s.token', ok: fbr.token_set }, { k: 'nfbr.s.on', ok: fbr.enabled }, { k: fbr.env === 'production' ? 'nfbr.s.live' : 'nfbr.s.sandbox', ok: fbr.env === 'production' }] : []
  const card = (k: St, label: string, Icon: typeof Clock, tone: string, sub: React.ReactNode) => (
    <button type="button" onClick={() => setTab(tab === k ? 'all' : k)} className={`p-4 rounded-2xl text-start cursor-pointer border ${tone} ${tab === k ? 'ring-2 ring-obsidian-900 dark:ring-[#B4F000]' : ''}`} data-testid={`nfbr-k-${k}`}>
      <div className="flex items-center justify-between"><span className={`font-extrabold uppercase tracking-wider ${ur ? cls('sm') : 'text-[10px]'}`}>{pick(label)}</span><Icon className="w-4 h-4 opacity-70" /></div>
      <div className="font-display font-extrabold text-2xl mt-1" dir="ltr">{counts[k]}</div>
      <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
    </button>
  )

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nfbr" data-newui="1" data-file="03">
      <FileRail lit="" lime={LIME} testid="nfbr-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-[#B4F000] dark:text-obsidian-950 flex items-center justify-center"><Landmark className="w-4 h-4" /></span>
            <div><div className="flex items-center gap-2"><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('fbr.title')}</h1>{fbr ? <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${!fbr.enabled ? 'bg-slate-200 text-slate-600' : fbr.env === 'production' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`} data-testid="nfbr-env">{pick(!fbr.enabled ? 'nfbr.off' : fbr.env === 'production' ? 'fbr.production' : 'fbr.sandbox')}</span> : null}</div><p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nfbr.subtitle')}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => nav('/fbr-guide')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nfbr-guide"><BookOpen className="w-3.5 h-3.5 text-blue-600" />{pick('nfbr.guide')}</button>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nfbr-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#B4F000]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
          </div>
        </header>

        <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {owner && fbr ? (
            <section className="rounded-2xl bg-obsidian-900 text-white border border-slate-800 p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center" data-testid="nfbr-setup">
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${fbr.ready && fbr.enabled ? 'bg-[#B4F000]' : 'bg-amber-400'}`} /><span className="font-display font-extrabold text-sm" data-testid="nfbr-ready">{pick(fbr.ready && fbr.enabled ? 'nfbr.readyOn' : fbr.ready ? 'nfbr.readyOff' : 'nfbr.notReady')}</span></div>
                <div className="grid grid-cols-2 gap-1.5" data-testid="nfbr-steps">{steps.map((s) => <div key={s.k} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${s.ok ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-400'}`}>{s.ok ? <Check className="w-3.5 h-3.5 text-[#B4F000]" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-500" />}{pick(s.k)}</div>)}</div>
                {fbr.ntn ? <div className="text-[11px] text-slate-400">NTN <span className="font-mono text-slate-200" dir="ltr">{fbr.ntn}</span>{fbr.strn ? <> · STRN <span className="font-mono text-slate-200" dir="ltr">{fbr.strn}</span></> : null}</div> : null}
              </div>
              <div className="lg:col-span-5 flex flex-col gap-2">
                <button type="button" onClick={() => nav('/new/more/settings?tab=4')} className="py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nfbr-settings"><Settings className="w-3.5 h-3.5" />{pick('nfbr.changeSetup')}</button>
                <button type="button" onClick={() => void tryIt()} disabled={!fbr.token_set || busy === 'test'} className="py-2 rounded-xl bg-[#B4F000] text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40" data-testid="nfbr-test"><PlugZap className="w-3.5 h-3.5" />{pick('fbr.test')}</button>
                {test ? <div className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${test.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>{test.ok ? pick('fbr.testOk') : `${pick('fbr.testBad')}: ${test.error ?? ''}`}</div> : null}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {card('sent', 'fbr.sent', CheckCircle2, 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200', pick('nfbr.sentSub'))}
            {card('pending', 'fbr.waiting', Clock, 'bg-amber-50/90 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200', counts.pending ? <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); void sendAll() }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void sendAll() } }} className="inline-flex items-center gap-1 font-extrabold underline cursor-pointer" data-testid="nfbr-send-all"><Send className="w-3 h-3" />{pick('fbr.sendNow')}</span> : pick('nfbr.waitingSub'))}
            {card('rejected', 'fbr.rejected', XCircle, 'bg-rose-50/90 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200', pick('nfbr.rejectedSub'))}
          </div>

          <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800">
            <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5">{(['all', 'sent', 'pending', 'rejected'] as const).map((k) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} data-testid={`nfbr-tab-${k}`} className={`px-3 py-1.5 rounded-xl text-xs cursor-pointer ${tab === k ? 'font-extrabold bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}>{pick(k === 'all' ? 'nfbr.all' : k === 'pending' ? 'fbr.waiting' : `fbr.${k}`)}</button>)}</div>
              <div className="relative flex-1 max-w-sm min-w-[200px]"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nfbr.search')} className="w-full ps-8 pe-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700" data-testid="nfbr-q" /></div>
            </div>
            {err ? <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700" role="alert">{err}</div> : null}
            <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="nfbr-rows">
              {!rows.length ? (
                <div className="p-10 text-center" data-testid="nfbr-empty"><Landmark className="w-8 h-8 mx-auto text-slate-300" /><div className="text-sm font-bold mt-2">{pick('nfbr.none')}</div><div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{pick('nfbr.noneHint')}</div></div>
              ) : rows.map((r) => (
                <div key={r.id} className="p-3.5 sm:p-4 grid grid-cols-12 gap-3 items-center" data-testid="nfbr-row">
                  <div className="col-span-12 sm:col-span-4 min-w-0"><button type="button" onClick={() => nav(`/sales/${r.invoice_id}`)} className="text-sm font-bold font-mono hover:underline cursor-pointer" dir="ltr">{r.invoice_no}</button><div className="text-[11px] text-slate-500"><span dir="ltr">{fmtDate(r.created_at)}</span> · <span dir="ltr">{rs(r.total)}</span> · {pick(r.env === 'production' ? 'fbr.production' : 'fbr.sandbox')}</div></div>
                  <div className="col-span-12 sm:col-span-5 min-w-0 text-xs">
                    {r.status === 'sent' ? <div className="flex items-center gap-1.5"><span className="text-slate-500">{pick('nfbr.fbrNo')}</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(r.fbr_invoice_no ?? '').catch(() => undefined); setToast(pick('nfbr.copied')) }} className="font-mono font-bold inline-flex items-center gap-1 cursor-pointer" dir="ltr">{r.fbr_invoice_no}<Copy className="w-3 h-3 opacity-60" /></button>{r.sent_at ? <span className="text-[10px] text-slate-400" dir="ltr">· {fmtDateTime(r.sent_at)}</span> : null}</div>
                      : <div className={r.status === 'rejected' ? 'text-rose-600 font-semibold' : 'text-slate-500'} dir="auto">{r.last_error || pick('fbr.billWaiting')}<span className="text-[10px] text-slate-400"> · {t('nfbr.attempts', { n: r.attempts })}</span></div>}
                  </div>
                  <div className="col-span-12 sm:col-span-3 flex items-center justify-end gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : r.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{pick(r.status === 'pending' ? 'fbr.waiting' : `fbr.${r.status}`)}</span>
                    {r.status !== 'sent' ? <button type="button" onClick={() => void again(r.id)} disabled={busy === r.id} className="px-2.5 py-1 rounded-lg bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50" data-testid="nfbr-again"><Send className="w-3 h-3" />{pick('fbr.sendAgain')}</button> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-obsidian-900 dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#B4F000]" /><span data-testid="nfbr-toast">{toast}</span></div></div>
    </div>
  )
}
