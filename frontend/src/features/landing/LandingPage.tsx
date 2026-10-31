/** The public landing page (owner 2026-10-29): what the software does, module by module, with
 *  screenshots, a sample video, prices, the accounts to pay into and an "open a shop for me" form
 *  that reaches the product owner. Served at /welcome; a visitor on / without a login lands here. */

import { ArrowLeftRight, BarChart3, BellRing, BookOpen, Bot, CalendarCheck, Check, CloudOff, Copy, CreditCard, Download, FileSpreadsheet, FileText, Fingerprint, HandCoins, Headphones, History, IdCard, KeyRound, Languages, LineChart, MessageCircle, Monitor, PackagePlus, PauseCircle, Phone as PhoneIcon, PlayCircle, Receipt, RotateCcw, ScanLine, ShieldCheck, Smartphone, Tag, Undo2, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BiAlert, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { PhoneInput, isMobileOk } from '@/components/FieldInputs'
import { ErrorText } from '@/components/ui'
import { MAKER } from '@/features/auth/AuthLayout'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { ApiError, post } from '@/lib/api'
import { normalisePhone } from '@/lib/format'
import { useGet } from '@/lib/queries'

interface Info { plans: { key: string; price: number; modules: string[] }[]; trial_days: number; modules: Record<string, { en: string; ur: string }>; accounts: { label: string; account_name: string; number: string; note: string | null }[]; whatsapp: string | null }

const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const BASICS: { key: string; Icon: LucideIcon }[] = [
  { key: 'sale', Icon: Tag }, { key: 'purchase', Icon: PackagePlus }, { key: 'stock', Icon: Smartphone }, { key: 'verify', Icon: IdCard },
  { key: 'khata', Icon: BookOpen }, { key: 'payments', Icon: HandCoins }, { key: 'invoices', Icon: FileText }, { key: 'returns', Icon: Undo2 },
  { key: 'hisaab', Icon: Receipt }, { key: 'staff', Icon: Users }, { key: 'imei', Icon: ScanLine }, { key: 'languages', Icon: Languages },
]
const OPTIONAL: Record<string, LucideIcon> = { accessories: Headphones, repairs: Wrench, expenses: Wallet, held_sales: PauseCircle, tax: Receipt, exchange: ArrowLeftRight, reports: BarChart3, exports: Download, notifications: BellRing, loans: RotateCcw, installments: HandCoins, attendance: CalendarCheck, ai: Bot }
/** what came in the last round (owner 2026-10-31): shown first, with its own screenshots */
const NEW: { key: string; Icon: LucideIcon; shot?: string }[] = [
  { key: 'audit', Icon: LineChart, shot: 'audit' }, { key: 'bulk', Icon: FileSpreadsheet, shot: 'bulk' }, { key: 'history', Icon: History, shot: 'history' },
  { key: 'prices', Icon: ShieldCheck }, { key: 'ai', Icon: Bot }, { key: 'home', Icon: BarChart3, shot: 'home' },
  { key: 'installments', Icon: HandCoins }, { key: 'hazri', Icon: CalendarCheck }, { key: 'otp', Icon: KeyRound }, { key: 'windows', Icon: Monitor },
]
const EXTRAS: { key: string; Icon: LucideIcon }[] = [{ key: 'offline', Icon: CloudOff }, { key: 'fingerprint', Icon: Fingerprint }, { key: 'cnic', Icon: ShieldCheck }, { key: 'whatsapp', Icon: MessageCircle }]
const SHOTS = ['home', 'audit', 'sale', 'stock', 'bulk', 'khata', 'history', 'finance', 'invoice'] as const
const WEB_SHOTS = ['home', 'audit', 'stock', 'bulk', 'finance', 'invoice'] as const

export default function LandingPage() {
  const { pick, ur, roman, cls } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const { data: info } = useGet<Info>(['public-info'], '/api/v1/public/info')
  const wa = (text: string) => `https://wa.me/${(info?.whatsapp ? `92${info.whatsapp.replace(/^0/, '')}` : MAKER.tel.replace('+', ''))}?text=${encodeURIComponent(text)}`
  const fmt = (n: number) => n.toLocaleString('en-US')
  const h2 = ur ? `${cls('xl')} font-bold` : 'text-[24px] font-extrabold tracking-[-0.02em] sm:text-[28px]'
  const body = ur ? cls('md') : 'text-[15px] font-medium'

  return (
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
              <a href="#start" className={`tap flex min-h-14 items-center gap-2 rounded-2xl bg-white px-5 font-extrabold text-ink ${ur ? cls('md') : 'text-[15px]'}`}><Check size={20} /> {pick('landing.ctaTrial').replace('{{n}}', String(info?.trial_days ?? 14))}</a>
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
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NEW.map(({ key, Icon }) => <Feature key={key} Icon={Icon} title={pick(`landing.new.${key}.t`)} text={pick(`landing.new.${key}.d`)} tone="bg-emerald text-white" />)}
          </div>
          <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2">
            {NEW.filter((n) => n.shot).map((n) => (
              <figure key={n.key} className="w-[220px] shrink-0 snap-center">
                <Phone src={`/landing/${n.shot}-${ur ? 'ur' : 'en'}.png`} small />
                <figcaption className={`mt-2 text-center text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(`landing.shots.${n.shot}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* video */}
        <section id="video" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.videoTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.videoSub')}</p>
          <div className="mx-auto w-full max-w-md overflow-hidden rounded-[28px] border border-line bg-surface shadow-hero">
            <video controls playsInline preload="metadata" poster="/landing/sale-en.png" className="aspect-[9/16] w-full bg-black">
              <source src="/landing/demo.mp4" type="video/mp4" />
              <source src="/landing/demo.webm" type="video/webm" />
            </video>
          </div>
          <span className={`flex items-center justify-center gap-2 text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}><PlayCircle size={18} /> {pick('landing.videoHint')}</span>
        </section>

        {/* modules */}
        <section id="modules" className="flex flex-col gap-5">
          <div>
            <h2 className={h2}>{pick('landing.modulesTitle')}</h2>
            <p className={`text-muted ${body}`}>{pick('landing.modulesSub')}</p>
          </div>
          <BiLabel text="landing.basicsTitle" size="md" bold />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BASICS.map(({ key, Icon }) => <Feature key={key} Icon={Icon} title={pick(`landing.basics.${key}.t`)} text={pick(`landing.basics.${key}.d`)} tone="bg-emerald-tint text-emerald-deep" />)}
          </div>
          <BiLabel text="landing.optionalTitle" size="md" bold className="mt-2" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(OPTIONAL).map(([key, Icon]) => <Feature key={key} Icon={Icon} title={pick(`modules.${key}`)} text={pick(`landing.optional.${key}`)} tone="bg-[#3B82F6]/15 text-[#2563EB]" />)}
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
                <Phone src={`/landing/${s}-${ur ? 'ur' : 'en'}.png`} small />
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
                <Browser src={`/landing/web-${s}-${ur ? 'ur' : 'en'}.png`} />
                <figcaption className={`mt-2 text-center text-muted ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick(`landing.shots.${s}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.priceTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.priceSub').replace('{{n}}', String(info?.trial_days ?? 14))}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(info?.plans ?? []).filter((p) => p.key !== 'trial').map((p) => (
              <div key={p.key} className={`flex flex-col gap-3 rounded-3xl border p-5 ${p.key === 'pro' ? 'border-emerald bg-emerald-tint/40 shadow-hero' : 'border-line bg-surface'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold capitalize">{p.key}</span>
                  {p.key === 'pro' ? <span className={`rounded-full bg-emerald px-2.5 py-0.5 text-xs font-bold text-white ${ur ? 'ur' : ''}`}>{pick('landing.popular')}</span> : null}
                </div>
                <div className="flex items-baseline gap-1" dir="ltr"><span className="num text-[34px]">Rs. {fmt(p.price)}</span><span className="text-sm text-muted">/ {pick('admin.month')}</span></div>
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
            {(['data', 'phone', 'offline', 'staff', 'cancel'] as const).map((k) => (
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
          <span>{pick('landing.footer')}</span>
        </div>
      </footer>
    </div>
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

function Feature({ Icon, title, text, tone }: { Icon: LucideIcon; title: string; text: string; tone: string }) {
  const { ur, cls } = useLang()
  return (
    <div className="card flex gap-3">
      <span className={`well h-11 w-11 shrink-0 rounded-2xl ${tone}`}><Icon size={22} strokeWidth={2} /></span>
      <span className="flex min-w-0 flex-col">
        <span className={`font-bold ${ur ? cls('md') : 'text-[15px]'}`}>{title}</span>
        <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{text}</span>
      </span>
    </div>
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
