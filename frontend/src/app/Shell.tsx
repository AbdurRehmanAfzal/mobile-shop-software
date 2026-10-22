import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, activeShop } from '@/lib/auth'
import { both } from '@/i18n'

const tabs: { to: string; key: string; icon: string }[] = [
  { to: '/', key: 'nav.home', icon: '🏠' },
  { to: '/stock', key: 'nav.stock', icon: '📱' },
  { to: '/sale', key: 'nav.sale', icon: '🧾' },
  { to: '/parties', key: 'nav.parties', icon: '👥' },
  { to: '/more', key: 'nav.more', icon: '☰' },
]

export default function Shell() {
  const shop = useAuth(activeShop)
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand-700 px-4 py-3 text-white shadow">
        <div className="leading-tight">
          <div className="text-xs opacity-80" dir="ltr">
            {shop?.name ?? 'Mobile Shop'}
          </div>
          <div className="ur text-lg" dir="rtl" lang="ur">
            {shop?.name_ur ?? shop?.name ?? 'موبائل شاپ'}
          </div>
        </div>
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const { en, ur } = both(t.key)
            return (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  end={t.to === '/'}
                  className={({ isActive }) =>
                    `tap flex min-h-16 flex-col items-center justify-center gap-0.5 ${isActive ? 'text-brand-700' : 'text-slate-500'}`
                  }
                >
                  <span className="text-xl leading-none">{t.icon}</span>
                  <span className="text-[10px] leading-none" dir="ltr">
                    {en}
                  </span>
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
