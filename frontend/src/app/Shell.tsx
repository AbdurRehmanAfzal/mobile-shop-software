/** App frame, "Dukaan counter" (docs/11 v2). Phone: slim header + 5-tab bottom bar.
 *  Laptop (lg+): the same job tiles as a side menu with F-key shortcuts, content beside it. */

import { Bell, BookOpen, CalendarDays, Home, Menu, MoreHorizontal, Smartphone } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth, activeShop } from '@/lib/auth'
import { useLang } from '@/components/Bilingual'
import { JOBS } from '@/features/counter/jobs'

const tabs = [
  { to: '/', key: 'nav.home', Icon: Home },
  { to: '/stock/summary', key: 'nav.stock', Icon: Smartphone },
  { to: '/khata', key: 'nav.khata', Icon: BookOpen },
  { to: '/hisaab', key: 'nav.hisaab', Icon: CalendarDays },
  { to: '/more', key: 'nav.more', Icon: MoreHorizontal },
]

export default function Shell() {
  const shop = useAuth(activeShop)
  const nav = useNavigate()
  const { ur, pick, cls, dir } = useLang()
  const shopName = ur ? shop?.name_ur || shop?.name || 'موبائل شاپ' : shop?.name || 'Mobile Shop'

  // counter shortcuts on a laptop keyboard (F5 is left alone: it reloads the page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const job = JOBS.find((j) => j.fkey === e.key)
      if (!job) return
      e.preventDefault()
      nav(job.to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground lg:max-w-6xl">
      <header className="print:hidden sticky top-0 z-10 flex items-center gap-3 bg-ground/90 px-5 pb-2 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur">
        <NavLink to="/" className={`min-w-0 flex-1 truncate ${ur ? 'ur text-xl font-bold' : 'text-xl font-extrabold tracking-[-0.01em]'}`} dir={dir}>
          {shopName}
        </NavLink>
        <button type="button" aria-label={pick('more.notifications')} onClick={() => nav('/more/notifications')} className="well tap h-11 w-11 border border-line bg-surface text-ink">
          <Bell size={20} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label={pick('nav.more')} onClick={() => nav('/more')} className="well tap h-11 w-11 border border-line bg-surface text-ink lg:hidden">
          <Menu size={20} strokeWidth={1.75} />
        </button>
      </header>

      <div className="flex flex-1 gap-6 lg:px-5">
        <aside className="print:hidden sticky top-20 hidden h-fit w-64 shrink-0 flex-col gap-2 lg:flex" aria-label={pick('nav.home')}>
          <NavLink to="/" end className={({ isActive }) => `tap flex min-h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold ${isActive ? 'bg-ink text-ground' : 'text-ink'}`}>
            <Home size={20} strokeWidth={1.9} /> <span className={ur ? cls('md') : ''}>{pick('nav.home')}</span>
          </NavLink>
          {JOBS.map((j) => (
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

        <main className="min-w-0 flex-1 px-5 pb-28 pt-1 lg:max-w-3xl lg:px-0 lg:pb-10">
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
                    <Icon size={24} strokeWidth={isActive ? 2.1 : 1.75} />
                    <span className={`leading-none ${ur ? cls('sm') : 'text-[11px] font-semibold'}`} dir={dir}>{pick(key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
