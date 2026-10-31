/** Subscription reminders (owner addendum 3, docs/19): the slim colour-coded bar at the top, the
 *  three-language popup with the payment details, the full-screen soft-lock notice and the
 *  "thank you, renewed" card. What to show comes from the server (`lib/planReminder.ts`); the popup
 *  opens only on login, on the Home screen, or when the user is idle on a list page — never on a
 *  form. The popup deliberately shows English, Urdu and Roman together (the owner's rule for this
 *  one screen, so any shopkeeper can read it). */

import i18next from 'i18next'
import { AlertTriangle, Check, ChevronDown, Copy, CreditCard, Download, Lock, MessageCircle, Printer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLang } from './Bilingual'
import { fmtDate } from './ui'
import { MAKER } from '@/features/auth/AuthLayout'
import { useAuth } from '@/lib/auth'
import { downloadFile, fileUrl, openPrintable } from '@/lib/files'
import { popupAllowedOn, romanBarLine, usePlanReminder, type Reminder, type SnoozeOption } from '@/lib/planReminder'

const IDLE_MS = 60_000
const REFRESH_EVERY_MS = 5 * 60_000

/** mounted once in the shell: fetches on login / Home / idle, and renders the overlays */
export function PlanOverlays() {
  const { pathname } = useLocation()
  const token = useAuth((s) => s.accessToken)
  const refresh = usePlanReminder((s) => s.refresh)
  const lastEvent = usePlanReminder((s) => s.lastEvent)
  const data = usePlanReminder((s) => s.data)
  const popupOpen = usePlanReminder((s) => s.popupOpen)
  const lastAt = useRef(0)

  useEffect(() => {
    if (!token) return
    const now = Date.now()
    const first = lastEvent === null
    if (first || pathname === '/' || now - lastAt.current > REFRESH_EVERY_MS) {
      lastAt.current = now
      void refresh(first ? 'login' : 'open', pathname)
    }
  }, [token, pathname, refresh, lastEvent])

  // idle on a list page: ask again (the server decides whether it is time)
  useEffect(() => {
    if (!token || !data || data.stage === 'none' || popupOpen || !popupAllowedOn(pathname)) return
    let t = window.setTimeout(() => void refresh('idle', pathname), IDLE_MS)
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(() => void refresh('idle', pathname), IDLE_MS) }
    for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, reset, { passive: true })
    return () => { window.clearTimeout(t); for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.removeEventListener(ev, reset) }
  }, [token, data, popupOpen, pathname, refresh])

  if (!data) return null
  return (
    <>
      {data.stage === 'locked' && !pathname.startsWith('/more/fees') ? <LockScreen d={data} /> : null}
      <PlanPopup />
      <ThanksCard />
    </>
  )
}

/** the slim bar under the app header; collapsible for the session, never gone while the plan is due */
export function PlanBar() {
  const { pick, ur, cls } = useLang()
  const data = usePlanReminder((s) => s.data)
  const collapsed = usePlanReminder((s) => s.collapsed)
  const collapse = usePlanReminder((s) => s.collapse)
  const openPopup = usePlanReminder((s) => s.openPopup)
  const nav = useNavigate()
  if (!data || !data.tone) return null
  const staff = data.audience === 'staff'
  const n = data.days_left ?? 0
  const graceLeft = Math.max(0, data.grace_days + n)
  const text = data.pending_payment
    ? pick('plan.bar.pending')
    : staff
      ? data.stage === 'locked' ? pick('plan.bar.staffLocked') : data.stage === 'grace' ? pick('plan.bar.staffGrace') : pick('plan.bar.staff').replace('{{n}}', String(n))
      : data.stage === 'locked'
        ? pick('plan.bar.locked')
        : data.stage === 'grace'
          ? pick('plan.bar.grace').replace('{{n}}', String(graceLeft))
          : data.stage === 'urgent'
            ? pick('plan.bar.urgent').replace('{{when}}', pick(n === 0 ? 'plan.bar.today' : 'plan.bar.tomorrow'))
            : pick(data.stage === 'warn' ? 'plan.bar.warn' : 'plan.bar.info').replace('{{n}}', String(n))
  const tone = {
    yellow: 'bg-[#FEF3C7] text-[#78350F] border-[#F59E0B]/40',
    orange: 'bg-[#FFEDD5] text-[#7C2D12] border-[#F97316]/40',
    red: 'bg-[#FEE2E2] text-[#7F1D1D] border-[#EF4444]/40',
    locked: 'bg-[#7F1D1D] text-white border-[#7F1D1D]',
    blue: 'bg-[#DBEAFE] text-[#1E3A8A] border-[#3B82F6]/40',
  }[data.tone]
  if (collapsed) {
    return (
      <button type="button" onClick={() => usePlanReminder.setState({ collapsed: false })} aria-label={pick('plan.bar.details')} data-testid="plan-bar-collapsed" className={`print:hidden sticky top-0 z-20 flex w-full items-center justify-center gap-2 border-b px-3 py-1 text-xs font-bold ${tone}`}>
        <AlertTriangle size={14} /> {text.length > 60 ? `${text.slice(0, 60)}…` : text}
      </button>
    )
  }
  return (
    <div role="status" data-testid="plan-bar" data-tone={data.tone} className={`print:hidden sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 ${tone}`}>
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`font-bold leading-snug ${ur ? cls('sm') : 'text-sm'}`}>{text}</span>
        {!data.pending_payment ? <span className="text-[11px] font-semibold opacity-80" dir="ltr">{romanBarLine(data)}</span> : null}
      </span>
      {!staff ? (
        <span className="flex shrink-0 items-center gap-1.5">
          {!data.pending_payment ? <button type="button" onClick={() => nav('/more/fees')} className={`tap h-8 rounded-full bg-ink px-3 text-xs font-bold text-ground ${ur ? 'ur' : ''}`}>{pick('plan.bar.payNow')}</button> : null}
          <button type="button" onClick={openPopup} className={`tap h-8 rounded-full border border-current px-3 text-xs font-bold ${ur ? 'ur' : ''}`}>{pick('plan.bar.details')}</button>
          <button type="button" onClick={collapse} aria-label={pick('plan.bar.collapse')} className="tap flex h-8 w-8 items-center justify-center rounded-full"><ChevronDown size={16} /></button>
        </span>
      ) : (
        <button type="button" onClick={collapse} aria-label={pick('plan.bar.collapse')} className="tap flex h-8 w-8 items-center justify-center rounded-full"><ChevronDown size={16} /></button>
      )}
    </div>
  )
}

/** three lines, one per language, for the popup (all three at once by the owner's rule) */
function Tri({ k, vars, size = 'md', bold = false, tone = 'text-ink' }: { k: string; vars?: Record<string, string>; size?: 'sm' | 'md' | 'lg'; bold?: boolean; tone?: string }) {
  const t = (lng: string) => {
    let s = i18next.t(k, { lng, defaultValue: k })
    for (const [a, b] of Object.entries(vars ?? {})) s = s.split(`{{${a}}}`).join(b)
    return s
  }
  const en = size === 'lg' ? 'text-[19px] font-extrabold' : size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  const urC = size === 'lg' ? 'ur text-[20px] font-bold leading-[1.9]' : size === 'sm' ? 'ur text-[15px] leading-[1.9]' : 'ur text-[17px] leading-[1.9]'
  const ro = size === 'lg' ? 'text-[15px] font-bold' : 'text-[13px]'
  return (
    <span className={`flex flex-col gap-0.5 ${tone}`}>
      <span className={`${en} ${bold ? 'font-bold' : 'font-medium'}`} dir="ltr">{t('en')}</span>
      <span className={urC} dir="rtl" lang="ur">{t('ur')}</span>
      <span className={`${ro} ${bold ? 'font-bold' : 'font-medium'} opacity-80`} dir="ltr">{t('roman')}</span>
    </span>
  )
}

function CopyRow({ label, value, raw = false }: { label: string; value: string; raw?: boolean }) {
  const [ok, setOk] = useState(false)
  const t = (lng: string, k: string) => i18next.t(k, { lng })
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-semibold text-muted">{raw ? label : <>{t('en', label)} · <span className="ur">{t('ur', label)}</span></>}</span>
        <span className="num truncate text-[15px] font-bold" dir="ltr">{value}</span>
      </span>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1800) } catch { /* on screen anyway */ } }} className={`tap flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold ${ok ? 'bg-emerald text-white' : 'border border-line text-ink'}`} aria-label={`${t('en', 'plan.pop.copy')} ${value}`}>
        {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? t('en', 'plan.pop.copied') : t('en', 'plan.pop.copy')}
      </button>
    </div>
  )
}

export function waLink(d: Reminder): string {
  const to = d.billing?.support.whatsapp ? d.billing.support.whatsapp.replace(/[^\d]/g, '').replace(/^0/, '92') : MAKER.tel.replace('+', '')
  const text = i18next.t('plan.pop.waText', { lng: 'en' }).replace('{{shop}}', d.shop_name).replace('{{plan}}', d.plan)
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}

export async function backupNow(): Promise<void> {
  await downloadFile('/api/v1/plan/backup', 'mobileshop-backup.zip')
}

function PlanPopup() {
  const data = usePlanReminder((s) => s.data)
  const open = usePlanReminder((s) => s.popupOpen)
  const closePopup = usePlanReminder((s) => s.closePopup)
  const snooze = usePlanReminder((s) => s.snooze)
  const nav = useNavigate()
  const [later, setLater] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!open) setLater(false) }, [open])
  if (!open || !data || data.audience !== 'owner') return null
  const n = data.days_left ?? 0
  const title: [string, Record<string, string>] = data.stage === 'locked' ? ['plan.pop.titleLocked', {}]
    : data.stage === 'grace' ? ['plan.pop.titleGrace', { n: String(Math.max(0, data.grace_days + n)) }]
      : n === 0 ? ['plan.pop.titleToday', {}] : n === 1 ? ['plan.pop.titleTomorrow', {}] : ['plan.pop.titleDays', { n: String(n) }]
  const tone = data.stage === 'warn' ? 'bg-[#F97316]' : 'bg-[#DC2626]'
  const b = data.billing
  const optLabel: Record<SnoozeOption, string> = { '4h': 'plan.pop.in4h', tomorrow: 'plan.pop.tomorrow', '3d': 'plan.pop.in3d' }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" data-testid="plan-popup">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-ground shadow-hero sm:rounded-3xl">
        <div className={`flex items-start gap-3 px-5 pb-4 pt-5 text-white ${tone}`}>
          <span className="well mt-1 h-11 w-11 shrink-0 bg-white/20 text-white">{data.stage === 'locked' ? <Lock size={22} /> : <AlertTriangle size={22} />}</span>
          <div className="min-w-0 flex-1"><Tri k={title[0]} vars={title[1]} size="lg" tone="text-white" /></div>
          <button type="button" onClick={() => void closePopup(true)} aria-label={i18next.t('plan.pop.close', { lng: 'en' })} className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white" data-testid="plan-close"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Fact k="plan.pop.plan" v={data.plan} />
            <Fact k={data.stage === 'grace' || data.stage === 'locked' ? 'plan.pop.ended' : 'plan.pop.expires'} v={data.expires_at ? fmtDate(data.expires_at) : '—'} />
            <Fact k="plan.pop.amount" v={`Rs. ${Number(data.amount_due).toLocaleString('en-US')}`} />
          </div>
          <div className="rounded-2xl border border-payable/30 bg-payable-tint/40 px-4 py-3"><Tri k="plan.pop.warning" size="sm" tone="text-payable" /></div>
          {data.clock_rolled_back ? <div className="rounded-2xl bg-receivable-tint px-4 py-2"><Tri k="plan.pop.clock" size="sm" tone="text-receivable" /></div> : null}
          {b && (b.note?.en || b.note?.ur || b.note?.roman) ? (
            <div className="rounded-2xl bg-surface px-4 py-3 text-sm">
              {b.note.en ? <p dir="ltr">{b.note.en}</p> : null}{b.note.ur ? <p className="ur" dir="rtl">{b.note.ur}</p> : null}{b.note.roman ? <p dir="ltr" className="opacity-80">{b.note.roman}</p> : null}
            </div>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><CreditCard size={18} /><Tri k="plan.pop.payDetails" bold /></div>
            {b && (b.bank || b.wallets.length) ? (
              <div className="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="plan-pay-details">
                {b.bank ? (
                  <>
                    <CopyRow label="plan.pop.bank" value={b.bank.bank_name} />
                    <CopyRow label="plan.pop.accountTitle" value={b.bank.account_title} />
                    <CopyRow label="plan.pop.account" value={b.bank.account_number} />
                    {b.bank.iban ? <CopyRow label="plan.pop.iban" value={b.bank.iban} /> : null}
                    {b.bank.branch ? <CopyRow label="plan.pop.branch" value={b.bank.branch} /> : null}
                  </>
                ) : null}
                {b.wallets.map((w) => <CopyRow key={w.label + w.number} label={w.label} raw value={`${w.number}${w.account_name ? ` · ${w.account_name}` : ''}`} />)}
              </div>
            ) : <div className="rounded-2xl bg-surface px-4 py-3"><Tri k="plan.pop.noDetails" size="sm" tone="text-muted" /></div>}
            {b?.qr_path ? <img src={fileUrl(b.qr_path)} alt="QR" className="mx-auto h-40 w-40 rounded-2xl border border-line object-contain" /> : null}
            <a href={waLink(data)} target="_blank" rel="noopener noreferrer" className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald/40 bg-emerald-tint font-bold text-emerald-deep">
              <MessageCircle size={18} /> {i18next.t('plan.pop.whatsapp', { lng: 'en' })} · <span className="ur">{i18next.t('plan.pop.whatsapp', { lng: 'ur' })}</span>
            </a>
          </section>

          {later ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3" data-testid="plan-snooze">
              <Tri k="plan.pop.laterTitle" bold size="sm" />
              <div className="grid grid-cols-3 gap-2">
                {data.snooze_options.map((o) => (
                  <button key={o} type="button" onClick={() => void snooze(o)} className="tap flex min-h-14 flex-col items-center justify-center rounded-2xl border border-line bg-ground px-2 text-center">
                    <span className="text-sm font-bold">{i18next.t(optLabel[o], { lng: 'en' })}</span>
                    <span className="ur text-sm">{i18next.t(optLabel[o], { lng: 'ur' })}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { usePlanReminder.setState({ popupOpen: false }); nav('/more/fees') }} className="tap flex min-h-16 items-center justify-center rounded-2xl bg-ink px-4 text-ground" data-testid="plan-pay">
              <Tri k="plan.pop.payNow" bold size="sm" tone="text-ground" />
            </button>
            {data.snooze_options.length && data.stage !== 'locked' ? (
              <button type="button" onClick={() => setLater((v) => !v)} className="tap flex min-h-16 items-center justify-center rounded-2xl border border-line bg-surface px-4" data-testid="plan-later">
                <Tri k="plan.pop.later" bold size="sm" />
              </button>
            ) : null}
          </div>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await backupNow() } finally { setBusy(false) } }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-bold disabled:opacity-50" data-testid="plan-backup">
            <Download size={18} /> {i18next.t('plan.pop.backup', { lng: 'en' })} · <span className="ur">{i18next.t('plan.pop.backup', { lng: 'ur' })}</span>
          </button>
          <span className="text-center text-[12px] text-muted">{i18next.t('plan.pop.backupHint', { lng: 'en' })}</span>
        </div>
      </div>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface px-2 py-2">
      <span className="text-[11px] font-semibold text-muted">{i18next.t(k, { lng: 'en' })} · <span className="ur">{i18next.t(k, { lng: 'ur' })}</span></span>
      <span className="num text-[15px] font-bold capitalize" dir="ltr">{v}</span>
    </div>
  )
}

/** past the grace: a full-screen notice (view, export, back up, pay); staff see the short line */
function LockScreen({ d }: { d: Reminder }) {
  const nav = useNavigate()
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  if (hidden) return null
  const staff = d.audience === 'staff'
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="plan-lock">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-3xl bg-ground p-5 shadow-hero">
        <div className="flex items-center gap-3 text-payable"><span className="well h-12 w-12 bg-payable-tint text-payable"><Lock size={24} /></span><Tri k="plan.lock.title" size="lg" tone="text-payable" /></div>
        <Tri k={staff ? 'plan.lock.staff' : 'plan.lock.body'} size="sm" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setHidden(true)} className="tap flex min-h-14 items-center justify-center rounded-2xl border border-line bg-surface px-4" data-testid="plan-lock-view"><Tri k="plan.lock.view" bold size="sm" /></button>
          {!staff ? <button type="button" onClick={() => nav('/more/fees')} className="tap flex min-h-14 items-center justify-center rounded-2xl bg-ink px-4 text-ground" data-testid="plan-lock-pay"><Tri k="plan.lock.pay" bold size="sm" tone="text-ground" /></button> : null}
        </div>
        {!staff ? (
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await backupNow() } finally { setBusy(false) } }} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-bold disabled:opacity-50">
            <Download size={18} /> {i18next.t('plan.lock.backup', { lng: 'en' })} · <span className="ur">{i18next.t('plan.lock.backup', { lng: 'ur' })}</span>
          </button>
        ) : null}
        <a href={waLink(d)} target="_blank" rel="noopener noreferrer" className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald font-bold text-white"><MessageCircle size={18} /> WhatsApp</a>
      </div>
    </div>
  )
}

function ThanksCard() {
  const data = usePlanReminder((s) => s.data)
  const open = usePlanReminder((s) => s.thanksOpen)
  const seen = usePlanReminder((s) => s.thanksSeen)
  const { ur } = useLang()
  if (!open || !data?.renewed) return null
  const r = data.renewed
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="plan-thanks">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-3xl bg-ground p-5 shadow-hero">
        <div className="flex items-center gap-3 text-emerald-deep"><span className="well h-12 w-12 bg-emerald-tint text-emerald-deep"><Check size={26} /></span><Tri k="plan.thanks.title" size="lg" tone="text-emerald-deep" /></div>
        <Tri k="plan.thanks.body" vars={{ date: r.until ? fmtDate(r.until) : '—' }} size="sm" />
        {r.receipt_no ? <span className="num text-sm font-bold" dir="ltr">{i18next.t('plan.thanks.receipt', { lng: 'en' }).replace('{{no}}', r.receipt_no)}</span> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void openPrintable(`/api/v1/plan/receipts/${r.payment_id}?lang=${ur ? 'ur' : 'en'}`)} className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-bold"><Printer size={18} /> {i18next.t('plan.thanks.print', { lng: 'en' })}</button>
          <button type="button" onClick={() => void seen()} className="tap flex min-h-12 items-center justify-center rounded-2xl bg-ink text-sm font-bold text-ground" data-testid="plan-thanks-ok">{i18next.t('plan.thanks.ok', { lng: 'en' })} · <span className="ur ms-1">{i18next.t('plan.thanks.ok', { lng: 'ur' })}</span></button>
        </div>
      </div>
    </div>
  )
}
