import { Bell, Home, Menu, Plus, Smartphone, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, activeShop } from '@/lib/auth'
import { both } from '@/i18n'

function initials(name: string | undefined): string {
  if (!name) return 'MS'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const tabs = [
  { to: '/', key: 'nav.home', Icon: Home },
  { to: '/stock', key: 'nav.stock', Icon: Smartphone },
  { to: '/sale', key: 'nav.new', Icon: Plus, fab: true },
  { to: '/parties', key: 'nav.parties', Icon: Users },
  { to: '/more', key: 'nav.more', Icon: Menu },
]

export default function Shell() {
  const shop = useAuth(activeShop)
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-ground/90 px-5 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="well h-11 w-11 bg-ink text-[15px] font-extrabold tracking-wider text-gold">
            {initials(shop?.name)}
          </div>
          <div className="leading-tight">
            <div className="eyebrow text-muted" dir="ltr">
              {shop?.name ?? 'Mobile Shop'}
            </div>
            <div className="ur -mt-0.5 text-lg font-bold" dir="rtl" lang="ur">
              {shop?.name_ur ?? shop?.name ?? 'موبائل شاپ'}
            </div>
          </div>
        </div>
        <button type="button" aria-label="Notifications" className="well tap relative h-11 w-11 border border-line bg-surface">
          <Bell size={21} strokeWidth={1.75} />
        </button>
      </header>

      <main className="flex-1 px-5 pb-28 pt-1">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-nav/95 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <ul className="grid grid-cols-5 gap-1 px-3">
          {tabs.map(({ to, key, Icon, fab }) => {
            const { ur } = both(key)
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `tap flex min-h-14 flex-col items-center justify-center gap-0.5 ${isActive ? 'text-emerald' : 'text-muted'}`
                  }
                >
                  {fab ? (
                    <span className="well -mt-6 h-12 w-12 rounded-2xl bg-ink text-gold shadow-fab">
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                  ) : (
                    <Icon size={24} strokeWidth={1.75} />
                  )}
                  <span className="ur text-xs leading-none" dir="rtl" lang="ur">
                    {ur}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
