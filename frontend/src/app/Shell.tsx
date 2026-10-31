/** App frame, "Dukaan counter" (docs/11 v2). Phone: slim header + 5-tab bottom bar.
 *  Laptop (lg+): the same job tiles as a side menu with F-key shortcuts, content beside it. */

import { BtnText, Sheet } from '@/components/ui'
import { Bell, BookOpen, CalendarDays, Check, Home, Languages, Menu, Moon, MoreHorizontal, Smartphone, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { noteRoute } from '@/lib/draft'
import { useAuth, activeShop } from '@/lib/auth'
import { BiLabel, useLang, type BiText } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { JOBS } from '@/features/counter/jobs'

/** screens that use the whole laptop width (lists, overviews, the side-by-side sale); forms stay at 3xl */
const WIDE = ['/sale/new', '/stock', '/khata', '/hisaab', '/reports', '/audit', '/sales', '/purchases', '/invoices', '/parties', '/expenses', '/installments', '/repairs', '/accessories', '/payments', '/returns', '/admin', '/loans']
import { useModules } from '@/lib/modules'
import { PlanBar, PlanOverlays } from '@/components/PlanReminders'
import ScanListener from '@/components/ScanListener'
import OfflineBar from '@/components/OfflineBar'

/** each language's name written in itself, so anyone can find their own */
const LANG_NAMES: Record<Locale, BiText> = {
  ur: { en: 'اردو', ur: 'اردو', roman: 'اردو' },
  roman: { en: 'Roman Urdu', ur: 'Roman Urdu', roman: 'Roman Urdu' },
  en: { en: 'English', ur: 'English', roman: 'English' },
}

const tabs = [
  { to: '/', key: 'nav.home', Icon: Home },
  { to: '/stock/summary', key: 'nav.stock', Icon: Smartphone },
  { to: '/khata', key: 'nav.khata', Icon: BookOpen },
  { to: '/hisaab', key: 'nav.hisaab', Icon: CalendarDays },
  { to: '/more', key: 'nav.more', Icon: MoreHorizontal },
]

export default function Shell() {
  const { pathname } = useLocation()
  noteRoute(pathname) // during render, so a page opened by a tap never restores an old draft
  const wide = pathname === '/' || WIDE.some((w) => pathname === w || pathname.startsWith(`${w}/`) || pathname.startsWith(`${w}?`))
  const shop = useAuth(activeShop)
  const nav = useNavigate()
  const { ur, roman, pick, cls, dir } = useLang()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const [langOpen, setLangOpen] = useState(false)
  const has = useModules()
  const jobs = JOBS.filter((j) => !j.module || has(j.module))
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const shopName = ur ? shop?.name_ur || shop?.name || 'موبائل شاپ' : shop?.name || 'Mobile Shop'

  // counter shortcuts on a laptop keyboard (F5 is left alone: it reloads the page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const job = jobs.find((j) => j.fkey === e.key)
      if (!job) return
      e.preventDefault()
      nav(job.to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, jobs])

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground lg:max-w-[1360px]">
      {/* narrow phones (iPhone SE): the shop's name on its own line, the buttons spread under it */}
      <div className="sticky top-0 z-10">
      <PlanBar />
      <header className="print:hidden flex flex-wrap items-center gap-x-2 gap-y-2 bg-ground/90 px-5 pb-2 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur max-[379px]:px-4">
        <NavLink to="/" className={`min-w-0 flex-1 line-clamp-2 max-[379px]:basis-full ${ur ? 'ur text-lg font-bold leading-snug' : 'text-lg font-extrabold leading-tight tracking-[-0.01em]'}`} dir={dir}>
          {shopName}
        </NavLink>
        <div className="flex shrink-0 gap-1.5 max-[379px]:grid max-[379px]:w-full max-[379px]:grid-cols-4">
          <button type="button" aria-label={pick('more.language')} onClick={() => setLangOpen(true)} className="tap flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink">
            <Languages size={20} strokeWidth={1.75} />
            <BtnText k={locale === 'roman' ? { en: 'Roman', ur: 'Roman', roman: 'Roman' } : LANG_NAMES[locale]} />
          </button>
          {/* shows the mode it switches to: a moon to go dark, a sun to go light */}
          <button type="button" aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} onClick={() => setTheme(dark ? 'light' : 'dark')} className="tap flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink">
            {dark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
            <BtnText k={dark ? 'more.themeLight' : 'more.themeDark'} />
          </button>
          <button type="button" aria-label={pick('counter.messages')} onClick={() => nav('/more/notifications')} className="tap flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink">
            <Bell size={20} strokeWidth={1.75} />
            <BtnText k={'counter.messages'} />
          </button>
          <button type="button" aria-label={pick('nav.more')} onClick={() => nav('/more')} className="tap flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink lg:hidden">
            <Menu size={20} strokeWidth={1.75} />
            <BtnText k={'nav.more'} />
          </button>
        </div>
      </header>
      </div>

      <PlanOverlays />
      <ScanListener />
      <OfflineBar />
      <div className="flex flex-1 gap-6 lg:px-5">
        <aside className="print:hidden sticky top-20 hidden h-fit w-64 shrink-0 flex-col gap-2 lg:flex" aria-label={pick('nav.home')}>
          <NavLink to="/" end className={({ isActive }) => `tap flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold ${isActive ? 'bg-ink text-ground' : 'text-ink'}`}>
            <Home size={20} strokeWidth={1.9} /> <span className={ur ? cls('md') : ''}>{pick('nav.home')}</span>
          </NavLink>
          {jobs.map((j) => (
            <NavLink key={j.id} to={j.to} className={({ isActive }) => `tap flex min-h-14 items-center gap-3 rounded-2xl px-3 font-bold ${j.tone} ${isActive ? 'ring-2 ring-current' : ''}`}>
              <span className={`well h-10 w-10 bg-surface ${j.ink}`}><j.Icon size={20} strokeWidth={1.9} /></span>
              <span className={`flex-1 ${ur ? cls('md') : 'text-[15px]'}`}>{pick(j.label)}</span>
              <kbd className="rounded-md border border-line bg-surface px-1.5 font-sans text-[11px] font-bold text-muted" dir="ltr">{j.fkey}</kbd>
            </NavLink>
          ))}
          <NavLink to="/hisaab" className={({ isActive }) => `tap flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold ${isActive ? 'bg-ink text-ground' : 'text-ink'}`}>
            <CalendarDays size={20} strokeWidth={1.9} /> <span className={ur ? cls('md') : ''}>{pick('counter.dayTitle')}</span>
          </NavLink>
          <NavLink to="/more" className="tap flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-muted">
            <MoreHorizontal size={20} strokeWidth={1.75} /> <span className={ur ? cls('sm') : ''}>{pick('counter.menu')}</span>
          </NavLink>
        </aside>

        <main className={`min-w-0 flex-1 px-5 pb-28 pt-1 max-[379px]:px-4 lg:px-0 lg:pb-10 ${wide ? 'lg:max-w-5xl' : 'lg:max-w-3xl'}`}>
          <Outlet />
        </main>
      </div>

      <nav className="print:hidden fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-nav/95 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5 gap-1 px-2" dir={dir}>
          {tabs.map(({ to, key, Icon }) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => `tap flex min-h-14 flex-col items-center justify-center gap-0.5 ${isActive ? 'font-bold text-ink' : 'text-muted'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-emerald-tint text-emerald-deep' : ''}`}>
                      <Icon size={22} strokeWidth={isActive ? 2.1 : 1.75} />
                    </span>
                    <span className={`leading-none ${ur ? cls('sm') : 'text-[11px] font-semibold'}`} dir={dir}>{pick(key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="more.language">
        <div className="flex flex-col gap-2.5">
          {LOCALES.map((l) => (
            <button key={l} type="button" aria-pressed={l === locale} onClick={() => { setLocale(l); setLangOpen(false) }} className={`tap flex min-h-16 items-center justify-between rounded-3xl border-2 px-5 ${l === locale ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>
              <BiLabel text={LANG_NAMES[l]} size="xl" bold tone="text-current" className={l === 'ur' ? 'ur' : ''} />
              {l === locale ? <Check size={22} /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
