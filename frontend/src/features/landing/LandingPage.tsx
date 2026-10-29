/** The public landing page (owner 2026-10-29): what the software does, module by module, with
 *  screenshots, a sample video, prices, the accounts to pay into and an "open a shop for me" form
 *  that reaches the product owner. Served at /welcome; a visitor on / without a login lands here. */

import { ArrowLeftRight, BarChart3, BellRing, BookOpen, Check, CloudOff, Copy, CreditCard, Download, FileText, Fingerprint, HandCoins, Headphones, IdCard, Languages, MessageCircle, PackagePlus, PauseCircle, PlayCircle, Receipt, RotateCcw, ScanLine, ShieldCheck, Smartphone, Tag, Undo2, Users, Wallet, Wrench, type LucideIcon } from 'lucide-react'
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
const OPTIONAL: Record<string, LucideIcon> = { accessories: Headphones, repairs: Wrench, expenses: Wallet, held_sales: PauseCircle, tax: Receipt, exchange: ArrowLeftRight, reports: BarChart3, exports: Download, notifications: BellRing, loans: RotateCcw }
const EXTRAS: { key: string; Icon: LucideIcon }[] = [{ key: 'offline', Icon: CloudOff }, { key: 'fingerprint', Icon: Fingerprint }, { key: 'cnic', Icon: ShieldCheck }, { key: 'whatsapp', Icon: MessageCircle }]
const SHOTS = ['home', 'sale', 'stock', 'khata', 'reports', 'invoice'] as const

export default function LandingPage() {
  const { pick, ur, roman, cls } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const { data: info } = useGet<Info>(['public-info'], '/api/v1/public/info')
  const wa = (text: string) => `https://wa.me/${(info?.whatsapp ? `92${info.whatsapp.replace(/^0/, '')}` : MAKER.tel.replace('+', ''))}?text=${encodeURIComponent(text)}`
  const fmt = (n: number) => n.toLocaleString('en-US')
  const h2 = ur ? `${cls('xl')} font-bold` : 'text-[26px] font-extrabold tracking-[-0.02em]'
  const body = ur ? cls('md') : 'text-[15px] font-medium'

  return (
    <div className="min-h-dvh bg-ground text-ink">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
          <span className="flex-1 text-lg font-extrabold tracking-tight">Mobile Shop</span>
          <div className="flex gap-1" dir="ltr">
            {LOCALES.map((l) => (
              <button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)} className={`tap h-9 rounded-full px-3 text-[13px] font-bold ${l === locale ? 'bg-ink text-ground' : 'text-ink'} ${l === 'ur' ? 'ur' : ''}`}>{LANG[l]}</button>
            ))}
          </div>
          <Link to="/login" className="tap hidden h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-bold sm:flex">{pick('auth.login')}</Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[linear-gradient(135deg,rgb(var(--emerald))_0%,rgb(var(--hero))_100%)] [clip-path:polygon(0_0,100%_0,100%_82%,0_100%)]" />
        <div className="mx-auto grid max-w-5xl gap-8 px-5 pb-10 pt-10 text-white md:grid-cols-2 md:items-center md:pt-16">
          <div className="flex flex-col gap-4">
            <span className={`w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-bold ${ur ? 'ur text-sm' : ''}`}>{pick('landing.badge')}</span>
            <h1 className={ur ? `${cls('xl')} text-[34px] font-bold leading-[1.9]` : 'text-[38px] font-extrabold leading-[1.1] tracking-[-0.03em] md:text-[46px]'}>{pick('landing.h1')}</h1>
            <p className={`max-w-lg text-white/85 ${ur ? cls('md') : 'text-[17px] font-medium'}`}>{pick('landing.sub')}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="#start" className={`tap flex min-h-14 items-center gap-2 rounded-2xl bg-white px-5 font-extrabold text-ink ${ur ? cls('md') : 'text-[15px]'}`}><Check size={20} /> {pick('landing.ctaTrial').replace('{{n}}', String(info?.trial_days ?? 14))}</a>
              <a href={wa(pick('landing.waHello'))} target="_blank" rel="noopener noreferrer" className={`tap flex min-h-14 items-center gap-2 rounded-2xl bg-emerald px-5 font-bold text-white ${ur ? cls('md') : 'text-[15px]'}`}><MessageCircle size={20} /> WhatsApp</a>
              <Link to="/login" className={`tap flex min-h-14 items-center rounded-2xl border border-white/40 px-5 font-bold text-white sm:hidden ${ur ? cls('md') : 'text-[15px]'}`}>{pick('auth.login')}</Link>
            </div>
            <div className={`flex flex-wrap gap-x-5 gap-y-1 pt-2 text-white/80 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>
              <span>✓ {pick('landing.point1')}</span><span>✓ {pick('landing.point2')}</span><span>✓ {pick('landing.point3')}</span>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[300px]">
            <Phone src={`/landing/home-${ur ? 'ur' : 'en'}.png`} />
          </div>
        </div>
      </section>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-5 pb-20 pt-6">
        {/* who it is for */}
        <section className="grid gap-3 sm:grid-cols-3">
          {(['used', 'new', 'repair'] as const).map((k) => (
            <div key={k} className="card flex flex-col gap-1.5">
              <BiLabel text={`landing.for.${k}.t`} size="md" bold />
              <span className={`text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>{pick(`landing.for.${k}.d`)}</span>
            </div>
          ))}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BASICS.map(({ key, Icon }) => <Feature key={key} Icon={Icon} title={pick(`landing.basics.${key}.t`)} text={pick(`landing.basics.${key}.d`)} tone="bg-emerald-tint text-emerald-deep" />)}
          </div>
          <BiLabel text="landing.optionalTitle" size="md" bold className="mt-2" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(OPTIONAL).map(([key, Icon]) => <Feature key={key} Icon={Icon} title={pick(`modules.${key}`)} text={pick(`landing.optional.${key}`)} tone="bg-khata text-khata-icon" />)}
          </div>
          <BiLabel text="landing.extrasTitle" size="md" bold className="mt-2" />
          <div className="grid gap-3 sm:grid-cols-2">
            {EXTRAS.map(({ key, Icon }) => <Feature key={key} Icon={Icon} title={pick(`landing.extras.${key}.t`)} text={pick(`landing.extras.${key}.d`)} tone="bg-sell text-sell-icon" />)}
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

        {/* pricing */}
        <section id="pricing" className="flex flex-col gap-4">
          <h2 className={h2}>{pick('landing.priceTitle')}</h2>
          <p className={`text-muted ${body}`}>{pick('landing.priceSub').replace('{{n}}', String(info?.trial_days ?? 14))}</p>
          <div className="grid gap-3 md:grid-cols-3">
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
        <section id="start" className="grid gap-6 md:grid-cols-2">
          <RequestForm info={info} />
          <div className="flex flex-col gap-3">
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

      <footer className="border-t border-line bg-surface">
        <div className={`mx-auto flex max-w-5xl flex-col gap-2 px-5 py-8 text-muted ${ur ? cls('sm') : 'text-sm font-medium'}`}>
          <span className="font-bold text-ink">Mobile Shop · {MAKER.company}</span>
          <span dir="ltr">{MAKER.person} · {MAKER.phone} · <a href={`https://${MAKER.site}`} className="underline">{MAKER.site}</a></span>
          <span>{pick('landing.footer')}</span>
        </div>
      </footer>
    </div>
  )
}

function Phone({ src, small = false }: { src: string; small?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[32px] border-[6px] border-ink bg-ink shadow-hero ${small ? '' : ''}`}>
      <img src={src} alt="" loading="lazy" className="aspect-[9/19.5] w-full object-cover object-top" />
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
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 shadow-hero">
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
