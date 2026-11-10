/** App frame, "Dukaan counter" (docs/11 v2). Phone: slim header + 5-tab bottom bar.
 *  Laptop (lg+): the same job tiles as a side menu with F-key shortcuts, content beside it. */

import { BtnText, Sheet } from '@/components/ui'
import { Bell, BookOpen, CalendarDays, Check, Home, Languages, LogOut, Menu, MoreHorizontal, Moon, Palette, Settings, Smartphone, Store, Sun, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { noteRoute } from '@/lib/draft'
import { useAuth, activeShop } from '@/lib/auth'
import { BiLabel, useLang, type BiText } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { JOBS } from '@/features/counter/jobs'
import SidePanel from './SidePanel'

/** screens that use the whole laptop width (lists, overviews, the side-by-side sale); forms stay at 3xl */
const WIDE = ['/sale/new', '/stock', '/khata', '/balances', '/hisaab', '/reports', '/audit', '/sales', '/purchases', '/invoices', '/parties', '/expenses', '/installments', '/repairs', '/accessories', '/payments', '/returns', '/admin', '/loans']
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

/** owner 2026-11-06: top-right corner, as in every app — who is logged in, the profile, log out */
function ProfileMenu() {
  const me = useAuth((s) => s.me)
  const shop = useAuth(activeShop)
  const logout = useAuth((s) => s.logout)
  const nav = useNavigate()
  const { pick, ur, cls } = useLang()
  const [open, setOpen] = useState(false)
  // on a phone the dark / light switch lives here, so the header keeps room for the shop's name
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc) }
  }, [open])
  if (!me) return null
  const name = me.user.name || me.user.phone
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
  const go = (to: string) => { setOpen(false); nav(to) }
  const item = `tap flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start font-bold hover:bg-ground ${ur ? cls('md') : 'text-[15px]'}`
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={pick('profile.menu')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="tap flex min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink" data-testid="profile-button">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald text-[12px] font-extrabold text-white" dir="ltr">{initials}</span>
        <BtnText k={'profile.short'} />
      </button>
      {open ? (
        <div role="menu" className="absolute end-0 top-[calc(100%+8px)] z-40 w-[min(300px,calc(100vw-32px))] rounded-3xl border border-line bg-surface p-2 shadow-hero" data-testid="profile-menu">
          <div className="flex items-center gap-3 rounded-2xl bg-ground p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald text-base font-extrabold text-white" dir="ltr">{initials}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-extrabold" data-testid="profile-name">{name}</span>
              <span className="num truncate text-xs text-muted" dir="ltr">{me.user.phone}</span>
              <span className={`w-fit rounded-full bg-emerald-tint px-2 py-0.5 font-bold text-emerald-deep ${ur ? cls('sm') : 'text-[11px]'}`}>{pick(`staff.roles.${me.user.role}`)}</span>
            </span>
          </div>
          {shop ? (
            <div className={`flex items-center gap-2 px-3 py-2 text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
              <Store size={14} className="shrink-0" /><span className="truncate">{ur ? shop.name_ur || shop.name : shop.name}</span>
            </div>
          ) : null}
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => go('/more')} className={item} data-testid="profile-open">
            <UserRound size={20} className="shrink-0 text-muted" /> {pick('profile.open')}
          </button>
          {me.user.role === 'owner' ? (
            <button type="button" role="menuitem" onClick={() => go('/more/settings')} className={item}>
              <Settings size={20} className="shrink-0 text-muted" /> {pick('more.settings')}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => go('/more/appearance')} className={item} data-testid="profile-appearance">
            <Palette size={20} className="shrink-0 text-muted" /> {pick('look.title')}
          </button>
          <button type="button" role="menuitem" onClick={() => setTheme(dark ? 'light' : 'dark')} className={`${item} lg:hidden`} data-testid="profile-theme">
            {dark ? <Sun size={20} className="shrink-0 text-muted" /> : <Moon size={20} className="shrink-0 text-muted" />} {pick(dark ? 'more.themeLight' : 'more.themeDark')}
          </button>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); logout() }} className={`${item} text-payable`} data-testid="profile-logout">
            <LogOut size={20} className="shrink-0" /> {pick('auth.logout')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

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
          <button type="button" aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} onClick={() => setTheme(dark ? 'light' : 'dark')} className="tap hidden min-h-14 min-w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface px-1.5 py-1 text-ink lg:flex">
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
          <ProfileMenu />
        </div>
      </header>
      </div>

      <PlanOverlays />
      <ScanListener />
      <OfflineBar />
      <div className="flex flex-1 gap-6 lg:px-5">
        <SidePanel />

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
