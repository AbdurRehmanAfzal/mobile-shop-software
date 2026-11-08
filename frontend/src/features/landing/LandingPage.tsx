/** The public landing page (owner 2026-10-29): what the software does, module by module, with
 *  screenshots, a sample video, prices, the accounts to pay into and an "open a shop for me" form
 *  that reaches the product owner. Served at /welcome; a visitor on / without a login lands here. */

import { ArrowLeftRight, Banknote, BarChart3, Building2, Calculator, BellRing, BookOpen, Bot, Boxes, CalendarCheck, Check, ChevronDown, CircleHelp, ClipboardCheck, CloudOff, Code2, FileSignature, Copy, CreditCard, Download, FileSpreadsheet, FileText, Fingerprint, FlaskConical, HandCoins, Headphones, History, IdCard, KeyRound, Languages, LineChart, Link2, Lock, MessageCircle, Monitor, PackagePlus, Palette, PauseCircle, Percent, Phone as PhoneIcon, PlayCircle, QrCode, Receipt, RotateCcw, Scale, ScanBarcode, ScanLine, ShieldCheck, Smartphone, Store, Tablet, Tag, Undo2, UserCog, Users, Wallet, Wrench, X, ZoomIn, type LucideIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiAlert, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { ErrorText } from '@/components/ui'
import { MAKER } from '@/features/auth/AuthLayout'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { ApiError, post } from '@/lib/api'
import { normalisePhone } from '@/lib/format'
import { useGet } from '@/lib/queries'

interface Info { plans: { key: string; price: number; yearly_price?: number; modules: string[] }[]; trial_days: number; yearly_paid_months?: number; modules: Record<string, { en: string; ur: string }>; accounts: { label: string; account_name: string; number: string; note: string | null }[]; whatsapp: string | null }

const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const BASICS: { key: string; Icon: LucideIcon; shot?: string }[] = [
  { key: 'sale', Icon: Tag, shot: 'sale' }, { key: 'purchase', Icon: PackagePlus, shot: 'purchases' }, { key: 'stock', Icon: Smartphone, shot: 'stock' }, { key: 'verify', Icon: IdCard, shot: 'verify' },
  { key: 'khata', Icon: BookOpen, shot: 'khata' }, { key: 'payments', Icon: HandCoins, shot: 'payments' }, { key: 'invoices', Icon: FileText, shot: 'invoice' }, { key: 'returns', Icon: Undo2 },
  { key: 'hisaab', Icon: Receipt, shot: 'hisaab' }, { key: 'staff', Icon: Users, shot: 'staff' }, { key: 'imei', Icon: ScanLine, shot: 'history' }, { key: 'languages', Icon: Languages },
]
/** owner 2026-11-08: "log text kam parhte hain, screen zyada dekhte hain" — a screen beside the text */
const OPTIONAL_SHOT: Record<string, string> = { accessories: 'items', repairs: 'repairjob', expenses: 'expenses', reports: 'reports', exports: 'bulk' }
const OPTIONAL: Record<string, LucideIcon> = { accessories: Headphones, repairs: Wrench, expenses: Wallet, held_sales: PauseCircle, tax: Receipt, exchange: ArrowLeftRight, reports: BarChart3, exports: Download, notifications: BellRing, loans: RotateCcw, installments: HandCoins, attendance: CalendarCheck, ai: Bot }
/** what came in the last round (owner 2026-10-31): shown first, with its own screenshots */
const NEW: { key: string; Icon: LucideIcon; shot?: string }[] = [
  // owner 2026-11-07: the Appearance page with four designs, a QR on every bill
  { key: 'appearance', Icon: Palette, shot: 'appearance' }, { key: 'billqr', Icon: QrCode, shot: 'billcheck' },
  // owner 2026-11-06: FBR-ready bills, the tax invoice, balance sheet, branches, the repair link
  { key: 'fbr', Icon: QrCode, shot: 'bill' }, { key: 'taxbill', Icon: Receipt, shot: 'invoice' }, { key: 'books', Icon: Scale, shot: 'books' }, { key: 'transfers', Icon: Building2 },
  { key: 'repairlink', Icon: Link2, shot: 'repairlink' }, { key: 'cashchange', Icon: Banknote, shot: 'sale' }, { key: 'accounts', Icon: Calculator, shot: 'audit' },
  // owner 2026-11-03: the newest round first — repair labs, the repair sticker, len-den, a "?" on
  // every field, the sales / purchase / staff reports, item GST, a salesman role without profit
  { key: 'repairlabs', Icon: FlaskConical, shot: 'repairlab' }, { key: 'sticker', Icon: Tag, shot: 'sticker' }, { key: 'lending', Icon: HandCoins, shot: 'lending' },
  { key: 'help', Icon: CircleHelp, shot: 'help' }, { key: 'trade', Icon: BarChart3, shot: 'trade' }, { key: 'repairaudit', Icon: Wrench, shot: 'auditrepairs' },
  { key: 'roles', Icon: UserCog }, { key: 'gst', Icon: Percent },
  // owner 2026-11-01: barcodes, accessories by dozen / box, tablets & watches
  { key: 'barcode', Icon: ScanBarcode, shot: 'label' }, { key: 'items', Icon: Boxes, shot: 'items' }, { key: 'devices', Icon: Tablet, shot: 'tablet' },
  { key: 'lock', Icon: Lock }, { key: 'count', Icon: ClipboardCheck, shot: 'count' }, { key: 'itemreports', Icon: BarChart3, shot: 'itemreports' }, { key: 'reminders', Icon: BellRing },
  { key: 'audit', Icon: LineChart, shot: 'audit' }, { key: 'bulk', Icon: FileSpreadsheet, shot: 'bulk' }, { key: 'history', Icon: History, shot: 'history' },
  { key: 'prices', Icon: ShieldCheck }, { key: 'ai', Icon: Bot }, { key: 'home', Icon: BarChart3, shot: 'home' },
  { key: 'installments', Icon: HandCoins }, { key: 'hazri', Icon: CalendarCheck }, { key: 'otp', Icon: KeyRound }, { key: 'windows', Icon: Monitor },
]
/** the newest round shown open; the rounds before fold under "earlier" */
const LATEST = 9
const EXTRAS: { key: string; Icon: LucideIcon }[] = [{ key: 'offline', Icon: CloudOff }, { key: 'fingerprint', Icon: Fingerprint }, { key: 'cnic', Icon: ShieldCheck }, { key: 'whatsapp', Icon: MessageCircle }]
const SHOTS = ['home', 'sale', 'bill', 'billcheck', 'stock', 'verify', 'repairjob', 'repairlink', 'lending', 'trade', 'books', 'items', 'tablet', 'audit', 'khata', 'history', 'finance', 'invoice', 'appearance'] as const
const WEB_SHOTS = ['home', 'bold', 'audit', 'trade', 'books', 'repairs', 'repairlab', 'stock', 'items', 'finance', 'invoice', 'appearance'] as const
/** owner 2026-11-03: every module explained twice — in shop words, and how it works inside */
const GUIDE: { key: string; Icon: LucideIcon; shot?: string }[] = [
  { key: 'sale', Icon: Tag, shot: 'sale' }, { key: 'purchase', Icon: PackagePlus, shot: 'purchases' }, { key: 'stock', Icon: Smartphone, shot: 'stock' }, { key: 'verify', Icon: IdCard, shot: 'verify' },
  { key: 'khata', Icon: BookOpen, shot: 'khata' }, { key: 'lending', Icon: HandCoins, shot: 'lending' }, { key: 'payments', Icon: Wallet, shot: 'payments' }, { key: 'returns', Icon: Undo2 },
  { key: 'repairs', Icon: Wrench, shot: 'repairjob' }, { key: 'items', Icon: Headphones, shot: 'items' }, { key: 'installments', Icon: CalendarCheck }, { key: 'expenses', Icon: Receipt, shot: 'expenses' },
  { key: 'audit', Icon: LineChart, shot: 'audit' }, { key: 'staff', Icon: Users, shot: 'staff' }, { key: 'barcodes', Icon: ScanBarcode, shot: 'label' }, { key: 'help', Icon: CircleHelp, shot: 'help' },
  { key: 'devices', Icon: Monitor, shot: 'tablet' }, { key: 'security', Icon: ShieldCheck },
  { key: 'fbr', Icon: QrCode, shot: 'bill' }, { key: 'books', Icon: Scale, shot: 'books' }, { key: 'transfers', Icon: Building2 },
]
/** owner 2026-11-06: the FBR band — what the bill does with FBR, and what the shop needs first */
const FBR_POINTS = [1, 2, 3, 4, 5, 6] as const
/** owner 2026-11-03: what no other software in Pakistan does together — shown right under the hero */
const UNIQUE: { key: string; Icon: LucideIcon; href?: string; shot?: string; web?: boolean; flip?: boolean }[] = [
  { key: 'android', Icon: Smartphone, href: '/app.apk', shot: 'home' }, { key: 'online', Icon: Monitor, shot: 'home', web: true }, { key: 'offline', Icon: CloudOff, shot: 'sale' },
  { key: 'consent', Icon: FileSignature, shot: 'history' }, { key: 'verify', Icon: ShieldCheck, shot: 'verify' }, { key: 'langs', Icon: Languages, shot: 'home', flip: true },
]
/** a tapped screen opens big (owner 2026-11-08) */
const ZoomCtx = createContext<(src: string) => void>(() => undefined)
const SITES = [
  { key: 'oop', href: 'https://oopsolutions.com', label: 'oopsolutions.com' },
  { key: 'ifix', href: 'https://ifixapplephone.com', label: 'ifixapplephone.com' },
] as const
const VIDEO_STEPS = ['sell', 'bill', 'audit', 'stock', 'khata', 'hisaab', 'labs', 'help'] as const

export default function LandingPage() {
  const { pick, ur, roman, cls } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const { data: info } = useGet<Info>(['public-info'], '/api/v1/public/info')
  const wa = (text: string) => `https://wa.me/${(info?.whatsapp ? `92${info.whatsapp.replace(/^0/, '')}` : MAKER.tel.replace('+', ''))}?text=${encodeURIComponent(text)}`
  const fmt = (n: number) => n.toLocaleString('en-US')
  const [billing, setBilling] = useState<'month' | 'year'>('year')
  const [zoom, setZoom] = useState<string | null>(null)
  // the tab title and description in the visitor's language (SEO, link previews); the app's on leaving
  useEffect(() => {
    const before = document.title
    const meta = document.querySelector('meta[name="description"]')
    const desc = meta?.getAttribute('content') ?? ''
    document.title = pick('landing.metaTitle')
    meta?.setAttribute('content', pick('landing.metaDesc'))
    return () => { document.title = before; meta?.setAttribute('content', desc) }
  }, [locale]) // eslint-disable-line react-hooks/exhaustive-deps
  const h2 = ur ? `${cls('xl')} font-bold` : 'text-[24px] font-extrabold tracking-[-0.02em] sm:text-[28px]'
  const body = ur ? cls('md') : 'text-[15px] font-medium'

  return (
    <ZoomCtx.Provider value={setZoom}>
    <div className="min-h-dvh overflow-x-hidden bg-ground text-ink">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <span className="well h-9 w-9 shrink-0 rounded-xl bg-emerald text-white"><Smartphone size={20} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight sm:text-lg">Mobile Shop</span>
          <div className="flex gap-0.5 rounded-full bg-surface p-0.5" dir="ltr">
            {LOCALES.map((l) => (
              <button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)} className={`tap h-8 rounded-full px-2.5 text-[12px] font-bold ${l === locale ? 'bg-ink text-ground' : 'text-ink'} ${l === 'ur' ? 'ur' : ''}`}>{LANG[l]}</button>
            ))}
          </div>
          <Link to="/login" className="tap hidden h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-bold sm:flex">{pick('auth.login')}</Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,rgb(var(--emerald))_0%,rgb(var(--hero))_100%)] text-white">
        <div aria-hidden className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -start-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-5 pb-12 pt-10 md:grid-cols-2 md:items-center md:py-16">
          <div className="flex min-w-0 flex-col gap-4">
            <span className={`w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-bold ${ur ? 'ur text-sm' : ''}`}>{pick('landing.badge')}</span>
            <h1 className={ur ? 'ur text-[30px] font-bold leading-[1.8] sm:text-[36px]' : 'text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[40px] md:text-[46px]'}>{pick('landing.h1')}</h1>
            <p className={`max-w-lg text-white/85 ${ur ? cls('md') : 'text-[17px] font-medium'}`}>{pick('landing.sub')}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="#start" className={`tap flex min-h-14 items-center gap-2 rounded-2xl bg-white px-5 font-extrabold text-[#0E1613] shadow-[0_10px_30px_-10px_rgba(0,0,0,.45)] ${ur ? cls('md') : 'text-[15px]'}`} data-testid="hero-cta"><Check size={20} strokeWidth={2.6} /> {pick('landing.ctaTrial').replace('{{n}}', String(info?.trial_days ?? 14))}</a>
              <a href={wa(pick('landing.waHello'))} target="_blank" rel="noopener noreferrer" className={`tap flex min-h-14 items-center gap-2 rounded-2xl bg-white/15 px-5 font-bold text-white ring-1 ring-inset ring-white/40 ${ur ? cls('md') : 'text-[15px]'}`}><MessageCircle size={20} /> WhatsApp</a>
            </div>
            <Link to="/login" className={`w-fit text-white/90 underline-offset-4 hover:underline sm:hidden ${ur ? cls('sm') : 'text-sm font-bold'}`}>{pick('landing.haveShop')}</Link>
            <div className={`flex flex-wrap gap-x-5 gap-y-1 pt-2 text-white/80 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>
              <span>✓ {pick('landing.point1')}</span><span>✓ {pick('landing.point2')}</span><span>✓ {pick('landing.point3')}</span><span>✓ {pick('landing.point4')}</span>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[260px] md:max-w-[300px]">
            <Phone src={`/landing/home-${ur ? 'ur' : 'en'}.png`} />
          </div>
        </div>
      </section>

      {/* what makes it different: Android app, online, offline, consent, verification, three languages */}
      <section id="unique" className="bg-[#0E1613] text-white" data-testid="landing-unique">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-12">
          <div className="flex flex-col gap-2">
            <span className={`w-fit rounded-full bg-[#34D399] px-3 py-1 text-xs font-extrabold text-[#0E1613] ${ur ? 'ur text-sm' : ''}`}>{pick('landing.uniqueBadge')}</span>
            <h2 className={ur ? 'ur text-[26px] font-bold leading-[1.8]' : 'text-[26px] font-extrabold tracking-[-0.02em] sm:text-[32px]'}>{pick('landing.uniqueTitle')}</h2>
            <p className={`max-w-2xl text-white/75 ${body}`}>{pick('landing.uniqueSub')}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {UNIQUE.map(({ key, Icon, href, shot, web, flip }) => (
              <div key={key} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                {shot ? <Thumb shot={shot} web={web} lang={flip ? (ur ? 'en' : 'ur') : undefined} banner /> : null}
                <span className="flex items-center gap-3">
                  <span className="well h-12 w-12 shrink-0 rounded-2xl bg-[#34D399] text-[#0E1613]"><Icon size={24} strokeWidth={2.2} /></span>
                  <span className={`font-extrabold ${ur ? 'ur text-lg leading-[1.7]' : 'text-[17px]'}`}>{pick(`landing.unique.${key}.t`)}</span>
                </span>
                <span className={`text-white/80 ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick(`landing.unique.${key}.d`)}</span>
                <ul className="flex flex-col gap-1.5">
                  {[1, 2].map((i) => <li key={i} className={`flex items-start gap-2 text-white/90 ${ur ? cls('sm') : 'text-sm font-semibold'}`}><Check size={16} className="mt-0.5 shrink-0 text-[#34D399]" />{pick(`landing.unique.${key}.p${i}`)}</li>)}
                </ul>
                {href ? <a href={href} className={`tap mt-auto flex min-h-11 w-fit items-center gap-2 rounded-xl bg-white px-4 font-bold text-[#0E1613] ${ur ? cls('sm') : 'text-sm'}`}><Download size={16} /> {pick(`landing.unique.${key}.cta`)}</a> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-5 pb-28 pt-6">
        {/* who it is for */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['used', 'new', 'repair'] as const).map((k) => (
            <div key={k} className="card flex flex-col gap-1.5">
              <BiLabel text={`landing.for.${k}.t`} size="md" bold />
              <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick(`landing.for.${k}.d`)}</span>
            </div>
          ))}
        </section>

        {/* new this round */}
        <section id="new" className="flex flex-col gap-5">
          <div>
            <span className={`mb-2 inline-block rounded-full bg-emerald px-3 py-1 text-xs font-bold text-white ${ur ? 'ur text-sm' : ''}`}>{pick('landing.newBadge')}</span>
            <h2 className={h2}>{pick('landing.newTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.newSub')}</p>
            <ZoomHint />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NEW.slice(0, LATEST).map(({ key, Icon, shot }) => <Feature key={key} Icon={Icon} shot={shot} title={pick(`landing.new.${key}.t`)} text={pick(`landing.new.${key}.d`)} tone="bg-emerald text-white" />)}
          </div>
          {/* the rounds before: folded, so the newest stays on top and the page stays short */}
          <details className="group">
            <summary className={`tap flex w-fit cursor-pointer list-none items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 font-bold ${ur ? cls('md') : 'text-[15px]'}`}>
              {pick('landing.earlier').replace('{{n}}', String(NEW.length - LATEST))}<ChevronDown size={18} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NEW.slice(LATEST).map(({ key, Icon, shot }) => <Feature key={key} Icon={Icon} shot={shot} title={pick(`landing.new.${key}.t`)} text={pick(`landing.new.${key}.d`)} tone="bg-emerald-tint text-emerald-deep" />)}
            </div>
          </details>
        </section>

        {/* FBR-ready bills (ADR-050): off by default, switched on with the shop after a sandbox test */}
        <section id="fbr" className="grid grid-cols-1 gap-6 rounded-[32px] border border-emerald/30 bg-emerald-tint/40 p-5 sm:p-8 md:grid-cols-[1fr_1.2fr]" data-testid="landing-fbr">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="flex items-center gap-3">
              <span className="well h-12 w-12 shrink-0 rounded-2xl bg-emerald text-white"><QrCode size={24} strokeWidth={2.2} /></span>
              <span className="rounded-full bg-[#0E1613] px-3 py-1 text-xs font-extrabold text-white" dir="ltr">{pick('landing.fbr.badge')}</span>
            </span>
            <h2 className={h2}>{pick('landing.fbr.title')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.fbr.sub')}</p>
            <p className={`rounded-2xl bg-surface p-3 text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick('landing.fbr.note')}</p>
            <div className="flex gap-3">
              <figure className="w-[132px]"><Thumb shot="bill" /><figcaption className={`mt-1.5 text-center text-muted ${ur ? 'ur text-xs' : 'text-xs font-semibold'}`}>{pick('landing.shots.bill')}</figcaption></figure>
              <figure className="w-[132px]"><Thumb shot="billcheck" /><figcaption className={`mt-1.5 text-center text-muted ${ur ? 'ur text-xs' : 'text-xs font-semibold'}`}>{pick('landing.shots.billcheck')}</figcaption></figure>
            </div>
          </div>
          <ul className="flex min-w-0 flex-col gap-2.5">
            {FBR_POINTS.map((i) => (
              <li key={i} className={`card flex items-start gap-3 ${ur ? cls('sm') : 'text-[15px] font-semibold'}`}><Check size={18} className="mt-0.5 shrink-0 text-emerald" />{pick(`landing.fbr.p${i}`)}</li>
            ))}
          </ul>
        </section>

        {/* video: half the video, half what it shows (owner 2026-11-03: a lone video in the middle looked empty) */}
        <section id="video" className="grid grid-cols-1 items-center gap-8 rounded-[32px] border border-line bg-surface p-5 sm:p-8 md:grid-cols-2" data-testid="landing-video">
          <div className="flex min-w-0 flex-col gap-4 md:order-2">
            <h2 className={h2}>{pick('landing.videoTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.videoSub')}</p>
            <ol className="flex flex-col gap-2.5">
              {VIDEO_STEPS.map((s, i) => (
                <li key={s} className="flex items-start gap-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald text-sm font-bold text-white">{i + 1}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className={`font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{pick(`landing.vsteps.${s}.t`)}</span>
                    <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick(`landing.vsteps.${s}.d`)}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="#start" className={`tap flex min-h-12 items-center gap-2 rounded-2xl bg-emerald px-5 font-bold text-white ${ur ? cls('md') : 'text-[15px]'}`}><Check size={18} /> {pick('landing.ctaTrial').replace('{{n}}', String(info?.trial_days ?? 14))}</a>
              <a href="#guide" className={`tap flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-5 font-bold text-ink ${ur ? cls('md') : 'text-[15px]'}`}><BookOpen size={18} /> {pick('landing.guideLink')}</a>
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-3 md:order-1">
            <div className="w-full max-w-[320px] overflow-hidden rounded-[28px] border-[6px] border-ink bg-ink shadow-hero">
              <video controls playsInline preload="metadata" poster={`/landing/sale-${ur ? 'ur' : 'en'}.png`} className="aspect-[9/19.5] w-full bg-black object-cover">
                <source src="/landing/demo.mp4" type="video/mp4" />
                <source src="/landing/demo.webm" type="video/webm" />
              </video>
            </div>
            <span className={`flex items-center gap-2 text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}><PlayCircle size={18} /> {pick('landing.videoHint')}</span>
          </div>
        </section>

        {/* every module explained twice: in shop words, and how it works inside */}
        <section id="guide" className="flex flex-col gap-5" data-testid="landing-guide">
          <div>
            <h2 className={h2}>{pick('landing.guideTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.guideSub')}</p>
            <ZoomHint />
          </div>
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {GUIDE.map(({ key, Icon, shot }) => <Guide key={key} k={key} Icon={Icon} shot={shot} />)}
          </div>
        </section>

        {/* modules */}
        <section id="modules" className="flex flex-col gap-5">
          <div>
            <h2 className={h2}>{pick('landing.modulesTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.modulesSub')}</p>
          </div>
          <BiLabel text="landing.basicsTitle" size="md" bold />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BASICS.map(({ key, Icon, shot }) => <Feature key={key} Icon={Icon} shot={shot} title={pick(`landing.basics.${key}.t`)} text={pick(`landing.basics.${key}.d`)} tone="bg-emerald-tint text-emerald-deep" />)}
          </div>
          <BiLabel text="landing.optionalTitle" size="md" bold className="mt-2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(OPTIONAL).map(([key, Icon]) => <Feature key={key} Icon={Icon} shot={OPTIONAL_SHOT[key]} title={pick(`modules.${key}`)} text={pick(`landing.optional.${key}`)} tone="bg-[#3B82F6]/15 text-[#2563EB]" />)}
          </div>
          <BiLabel text="landing.extrasTitle" size="md" bold className="mt-2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EXTRAS.map(({ key, Icon }) => <Feature key={key} Icon={Icon} title={pick(`landing.extras.${key}.t`)} text={pick(`landing.extras.${key}.d`)} tone="bg-[#F59E0B]/15 text-[#B45309]" />)}
          </div>
        </section>

        {/* screenshots */}
        <section id="screens" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.shotsTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.shotsSub')}</p>
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2">
            {SHOTS.map((s) => (
              <figure key={s} className="w-[240px] shrink-0 snap-center">
                <button type="button" className="block w-full" onClick={() => setZoom(`/landing/${s}-${ur ? 'ur' : 'en'}.png`)} aria-label={pick('landing.zoom')}><Phone src={`/landing/${s}-${ur ? 'ur' : 'en'}.png`} small /></button>
                <figcaption className={`mt-2 text-center text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(`landing.shots.${s}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* the web application on a laptop */}
        <section id="web" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.webTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.webSub')}</p>
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2">
            {WEB_SHOTS.map((s) => (
              <figure key={s} className="w-[min(92vw,620px)] shrink-0 snap-center">
                <button type="button" className="block w-full" onClick={() => setZoom(`/landing/web-${s}-${ur ? 'ur' : 'en'}.png`)} aria-label={pick('landing.zoom')}><Browser src={`/landing/web-${s}-${ur ? 'ur' : 'en'}.png`} /></button>
                <figcaption className={`mt-2 text-center text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(`landing.shots.${s}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.priceTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.priceSub').replace('{{n}}', String(info?.trial_days ?? 14))}</p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={pick('landing.billing')}>
            {(['month', 'year'] as const).map((b) => (
              <button key={b} type="button" aria-pressed={billing === b} onClick={() => setBilling(b)} className={`tap h-11 rounded-full border-2 px-4 font-bold ${billing === b ? 'border-[#0E1613] bg-[#0E1613] text-white' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-sm'}`} data-testid={`billing-${b}`}>
                {pick(`landing.billing${b === 'month' ? 'Month' : 'Year'}`)}
              </button>
            ))}
            <span className={`rounded-full bg-[#34D399] px-3 py-1 font-extrabold text-[#0E1613] ${ur ? cls('sm') : 'text-xs'}`}>{pick('landing.yearSave').replace('{{n}}', String(12 - (info?.yearly_paid_months ?? 10)))}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(info?.plans ?? []).filter((p) => p.key !== 'trial').map((p) => (
              <div key={p.key} className={`flex flex-col gap-3 rounded-3xl border p-5 ${p.key === 'pro' ? 'border-emerald bg-emerald-tint/40 shadow-hero' : 'border-line bg-surface'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold capitalize">{p.key}</span>
                  {p.key === 'pro' ? <span className={`rounded-full bg-emerald px-2.5 py-0.5 text-xs font-bold text-white ${ur ? 'ur' : ''}`}>{pick('landing.popular')}</span> : null}
                </div>
                {billing === 'year' ? (
                  <div className="flex flex-col gap-0.5" data-testid={`year-${p.key}`}>
                    <div className="flex items-baseline gap-1" dir="ltr"><span className="num text-[34px]">Rs. {fmt(p.yearly_price ?? p.price * 10)}</span><span className="text-sm text-muted">/ {pick('landing.year')}</span></div>
                    <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}><s dir="ltr">Rs. {fmt(p.price * 12)}</s> · {pick('landing.perMonth').replace('{{n}}', fmt(Math.round((p.yearly_price ?? p.price * 10) / 12)))}</span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1" dir="ltr"><span className="num text-[34px]">Rs. {fmt(p.price)}</span><span className="text-sm text-muted">/ {pick('admin.month')}</span></div>
                )}
                <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(`landing.plan.${p.key}`)}</span>
                <ul className="flex flex-col gap-1.5">
                  <li className={`flex items-start gap-2 ${ur ? cls('sm') : 'text-sm font-medium'}`}><Check size={16} className="mt-0.5 shrink-0 text-emerald" /> {pick('landing.allBasics')}</li>
                  {p.modules.map((m) => <li key={m} className={`flex items-start gap-2 ${ur ? cls('sm') : 'text-sm font-medium'}`}><Check size={16} className="mt-0.5 shrink-0 text-emerald" /> {pick(`modules.${m}`)}</li>)}
                </ul>
                <a href="#start" className={`tap mt-auto flex min-h-12 items-center justify-center rounded-2xl font-bold ${p.key === 'pro' ? 'bg-emerald text-white' : 'border border-line bg-surface text-ink'} ${ur ? cls('md') : ''}`}>{pick('landing.choose')}</a>
              </div>
            ))}
          </div>
          <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick('landing.priceNote')}</span>
        </section>

        {/* start: request + payment */}
        <section id="start" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <RequestForm info={info} />
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className={h2}>{pick('landing.payTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.paySub')}</p>
            {info?.accounts.length ? (
              <div className="card divide-y divide-line p-0">
                {info.accounts.map((a) => <AccountRow key={a.label + a.number} a={a} />)}
              </div>
            ) : <BiLabel text="landing.payAsk" size="sm" tone="text-muted" />}
            <a href={wa(pick('landing.waPaid'))} target="_blank" rel="noopener noreferrer" className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald font-bold text-white ${ur ? cls('md') : ''}`}><MessageCircle size={20} /> {pick('landing.waPaidBtn')}</a>
          </div>
        </section>

        {/* faq */}
        <section className="flex flex-col gap-3">
          <h2 className={h2}>{pick('landing.faqTitle')}</h2>
          <div className="card divide-y divide-line p-0">
            {(['android', 'offline', 'verify', 'consent', 'yearly', 'data', 'phone', 'scanner', 'staff', 'fbr', 'branches', 'cancel'] as const).map((k) => (
              <details key={k} className="group px-4 py-3">
                <summary className={`cursor-pointer list-none font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{pick(`landing.faq.${k}.q`)}</summary>
                <p className={`mt-1.5 text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick(`landing.faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* always-there contact: WhatsApp and a call, bottom corner */}
      <div className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] end-4 z-30 flex flex-col gap-2 print:hidden" data-testid="landing-contact">
        <a href={wa(pick('landing.waHello'))} target="_blank" rel="noopener noreferrer" aria-label={pick('landing.float.wa')} title={pick('landing.float.wa')} className="tap flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-hero ring-4 ring-white/70">
          <MessageCircle size={28} strokeWidth={2.2} />
        </a>
        <a href={`tel:${MAKER.tel}`} aria-label={pick('landing.float.call')} title={pick('landing.float.call')} className="tap flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ground shadow-hero ring-4 ring-white/70">
          <PhoneIcon size={26} strokeWidth={2.2} />
        </a>
      </div>

      <footer className="border-t border-line bg-surface">
        <div className={`mx-auto flex max-w-5xl flex-col gap-2 px-5 py-8 text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>
          <span className="font-bold text-ink">Mobile Shop · {MAKER.company}</span>
          <span dir="ltr">{MAKER.person} · <a href={`tel:${MAKER.tel}`} className="underline">{MAKER.phone}</a> · <a href={`https://${MAKER.site}`} className="underline">{MAKER.site}</a></span>
          <nav aria-label={pick('landing.sites')} className="flex flex-wrap gap-x-4 gap-y-1" data-testid="landing-sites">
            <span className="font-bold text-ink">{pick('landing.sites')}:</span>
            {SITES.map((s) => <a key={s.key} href={s.href} target="_blank" rel="noopener" className="font-bold text-emerald-deep underline-offset-4 hover:underline" dir="ltr">{pick(`landing.site.${s.key}`)} · {s.label}</a>)}
          </nav>
          <span>{pick('landing.footer')}</span>
        </div>
      </footer>
      {zoom ? <Zoom src={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
    </ZoomCtx.Provider>
  )
}

function Phone({ src, small = false }: { src: string; small?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[30px] border-ink bg-ink shadow-hero ${small ? 'border-4' : 'border-[6px]'}`}>
      <img src={src} alt="" loading="lazy" className="aspect-[9/19.5] w-full object-cover object-top" />
    </div>
  )
}

/** a laptop browser frame around a wide screenshot */
function Browser({ src }: { src: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-hero">
      <div className="flex items-center gap-1.5 border-b border-line bg-ground px-3 py-2" dir="ltr">
        <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" /><span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" /><span className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
        <span className="ms-3 h-5 flex-1 rounded-md bg-surface px-2 text-[10px] leading-5 text-muted">mobileshop.oopsolutions.com</span>
      </div>
      <img src={src} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top" />
    </div>
  )
}

function Feature({ Icon, title, text, tone, shot }: { Icon: LucideIcon; title: string; text: string; tone: string; shot?: string }) {
  const { ur, cls } = useLang()
  return (
    <div className="card flex gap-3" data-shot={shot}>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-center gap-3">
          <span className={`well h-11 w-11 shrink-0 rounded-2xl ${tone}`}><Icon size={22} strokeWidth={2} /></span>
          <span className={`min-w-0 font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{title}</span>
        </span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{text}</span>
      </span>
      {shot ? <Thumb shot={shot} className="w-[88px] self-start sm:w-[96px]" /> : null}
    </div>
  )
}

/** a small screen from the app beside a text; tapped, it opens big */
function Thumb({ shot, web = false, lang, banner = false, className = '' }: { shot: string; web?: boolean; lang?: 'en' | 'ur'; banner?: boolean; className?: string }) {
  const { pick, ur } = useLang()
  const zoom = useContext(ZoomCtx)
  const src = `/landing/${web ? 'web-' : ''}${shot}-${lang ?? (ur ? 'ur' : 'en')}.png`
  const frame = web ? 'rounded-xl border border-white/20 bg-surface' : 'rounded-[16px] border-[3px] border-ink bg-ink'
  const ratio = banner ? 'h-44 sm:h-48' : web ? 'aspect-[16/10]' : 'aspect-[9/16]'
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoom(src) }}
      aria-label={pick('landing.zoom')}
      title={pick('landing.zoom')}
      className={`tap group/t relative block shrink-0 overflow-hidden shadow-[0_8px_24px_-12px_rgba(14,22,19,.45)] ${frame} ${className}`}
      data-testid="landing-thumb"
    >
      <img src={src} alt="" loading="lazy" className={`block w-full object-cover object-top ${ratio}`} />
      <span className="absolute bottom-1.5 end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#0E1613]/80 text-white transition-transform group-hover/t:scale-110"><ZoomIn size={13} strokeWidth={2.4} /></span>
    </button>
  )
}

function ZoomHint() {
  const { pick, ur, cls } = useLang()
  return <span className={`mt-2 flex w-fit items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-muted ring-1 ring-inset ring-line ${ur ? cls('sm') : 'text-xs font-semibold'}`}><ZoomIn size={14} /> {pick('landing.zoomHint')}</span>
}

/** the screen at full size over the page; Esc, a tap outside or the cross closes it */
function Zoom({ src, onClose }: { src: string; onClose: () => void }) {
  const { pick } = useLang()
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = before }
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={pick('landing.zoom')} onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E1613]/85 p-4 backdrop-blur-sm" data-testid="landing-zoom">
      <img src={src} alt="" className="max-h-[88dvh] max-w-full rounded-2xl object-contain shadow-hero" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} aria-label={pick('common.close')} className="tap absolute end-4 top-[max(16px,env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0E1613]"><X size={24} strokeWidth={2.4} /></button>
    </div>
  )
}

/** one module: a line that says what it is; open it for the shop words + example and the inside view */
function Guide({ k, Icon, shot }: { k: string; Icon: LucideIcon; shot?: string }) {
  const { pick, ur, cls } = useLang()
  const small = ur ? cls('sm') : 'text-sm font-medium'
  const tech = [1, 2, 3].map((i) => pick(`landing.guide.${k}.x${i}`)).filter((x) => x && !x.startsWith('landing.'))
  return (
    <details className="group card flex flex-col gap-3 open:shadow-hero">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="well h-11 w-11 shrink-0 rounded-2xl bg-emerald-tint text-emerald-deep"><Icon size={22} strokeWidth={2} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{pick(`landing.guide.${k}.t`)}</span>
          <span className={`text-muted ${small}`}>{pick(`landing.guide.${k}.s`)}</span>
        </span>
        {shot ? <Thumb shot={shot} className="w-[72px] sm:w-[84px]" /> : null}
        <ChevronDown size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl bg-emerald-tint/60 p-3">
          <span className={`flex items-center gap-1.5 font-bold text-emerald-deep ${small}`}><Store size={16} /> {pick('landing.guideShop')}</span>
          <span className={small}>{pick(`landing.guide.${k}.e`)}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
          <span className={`flex items-center gap-1.5 font-bold text-ink ${small}`}><Code2 size={16} /> {pick('landing.guideTech')}</span>
          <ul className="flex flex-col gap-1.5">
            {tech.map((t) => <li key={t} className={`flex items-start gap-2 text-muted ${small}`}><Check size={14} className="mt-1 shrink-0 text-emerald" />{t}</li>)}
          </ul>
        </div>
      </div>
    </details>
  )
}

function AccountRow({ a }: { a: Info['accounts'][number] }) {
  const { pick, ur, cls } = useLang()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><CreditCard size={18} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold">{a.label}{a.account_name ? <span className="font-medium text-muted"> · {a.account_name}</span> : null}</span>
        <span className="num truncate text-sm" dir="ltr">{a.number}</span>
        {a.note ? <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{a.note}</span> : null}
      </span>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(a.number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* shown anyway */ } }} className={`tap flex h-10 items-center gap-1 rounded-full px-3 text-xs font-bold ${copied ? 'bg-emerald text-white' : 'border border-line'}`}>
        {copied ? <Check size={16} /> : <Copy size={16} />} {pick(copied ? 'fees.copied' : 'fees.copy')}
      </button>
    </div>
  )
}

function RequestForm({ info }: { info: Info | undefined }) {
  const { pick, ur, cls } = useLang()
  const [f, setF] = useState({ name: '', shop_name: '', city: '', phone: '', plan: 'trial', note: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const plans = ['trial', ...(info?.plans ?? []).filter((p) => p.key !== 'trial').map((p) => p.key)]

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await post('/api/v1/public/shop-requests', { ...f, city: f.city || null, note: f.note || null, phone: normalisePhone(f.phone) }, { auth: false })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err : new Error('failed'))
    } finally {
      setBusy(false)
    }
  }

  const h2 = ur ? `${cls('xl')} font-bold` : 'text-[26px] font-extrabold tracking-[-0.02em]'
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-3 rounded-3xl border border-line bg-surface p-5 shadow-hero">
      <h2 className={h2}>{pick('landing.startTitle')}</h2>
      <p className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick('landing.startSub')}</p>
      {done ? <BiAlert text="landing.sent" kind="success" /> : (
        <>
          <BiInput label="landing.yourName" value={f.name} onChange={set('name')} required minLength={2} />
          <BiInput label="auth.shopName" value={f.shop_name} onChange={set('shop_name')} required minLength={2} />
          <BiInput label="auth.city" value={f.city} onChange={set('city')} />
          <PhoneInput label="auth.phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} required />
          <div>
            <BiLabel text="landing.planPick" size="md" tone="text-muted" className="mb-1.5" />
            <div className="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <button key={p} type="button" aria-pressed={f.plan === p} onClick={() => setF({ ...f, plan: p })} className={`tap h-10 rounded-full border-2 px-3.5 text-sm font-bold capitalize ${f.plan === p ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{p === 'trial' ? pick('landing.trialName') : p}</button>
              ))}
            </div>
          </div>
          <BiInput label="landing.note" value={f.note} onChange={set('note')} maxLength={500} />
          <ErrorText error={error} />
          <button type="submit" disabled={busy || !isMobileOk(f.phone) || f.name.trim().length < 2 || f.shop_name.trim().length < 2} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-ground disabled:opacity-40 ${ur ? cls('md') : ''}`}>
            {busy ? '…' : pick('landing.send')}
          </button>
        </>
      )}
    </form>
  )
}

export function LandingLink({ children }: { children: ReactNode }) {
  return <Link to="/welcome">{children}</Link>
}
