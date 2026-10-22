import { ArrowLeftRight, Bell, Download, HandCoins, Home, Menu, Plus, Receipt, Search, Smartphone, Users, Wrench } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, activeShop } from '@/lib/auth'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Sheet } from '@/components/ui'

function initials(name: string | undefined): string {
  if (!name) return 'MS'
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

const tabs = [
  { to: '/', key: 'nav.home', Icon: Home },
  { to: '/stock', key: 'nav.stock', Icon: Smartphone },
  { to: '#new', key: 'nav.new', Icon: Plus, fab: true },
  { to: '/parties', key: 'nav.parties', Icon: Users },
  { to: '/more', key: 'nav.more', Icon: Menu },
]

const choices = [
  { to: '/sale/new', key: 'dashboard.newSale', Icon: Receipt },
  { to: '/purchase/new', key: 'dashboard.newPurchase', Icon: Download },
  { to: '/parties', key: 'dashboard.payment', Icon: HandCoins },
  { to: '/repairs/new', key: 'dashboard.repair', Icon: Wrench },
  { to: '/exchange/new', key: 'more.exchange', Icon: ArrowLeftRight },
  { to: '/stock', key: 'dashboard.imeiSearch', Icon: Search },
]

export default function Shell() {
  const shop = useAuth(activeShop)
  const nav = useNavigate()
  const loc = useLocation()
  const { ur, pick, cls, dir } = useLang()
  const [chooser, setChooser] = useState(false)
  const shopName = ur ? shop?.name_ur || shop?.name || 'موبائل شاپ' : shop?.name || 'Mobile Shop'
  const home = loc.pathname === '/'

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <header className={`print:hidden sticky top-0 z-10 flex items-center justify-between px-5 pb-3 pt-[max(14px,env(safe-area-inset-top))] ${home ? 'bg-emerald text-white' : 'bg-ground/90 backdrop-blur'}`}>
        <button type="button" onClick={() => nav('/more')} className={`well h-11 w-11 rounded-full text-[15px] font-extrabold tracking-wider ${home ? 'bg-white/20 text-white' : 'bg-ink text-gold'}`}>
          {initials(shop?.name)}
        </button>
        <div className={`flex-1 truncate px-3 text-center leading-tight ${ur ? 'ur text-lg font-bold' : 'text-lg font-extrabold'}`} dir={dir}>{shopName}</div>
        <div className="flex gap-1">
          <button type="button" aria-label="Search" onClick={() => nav('/stock')} className={`well tap h-11 w-11 ${home ? 'text-white' : 'text-ink'}`}><Search size={22} strokeWidth={1.75} /></button>
          <button type="button" aria-label="Notifications" onClick={() => nav('/more/notifications')} className={`well tap h-11 w-11 ${home ? 'text-white' : 'text-ink'}`}><Bell size={22} strokeWidth={1.75} /></button>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-1">
        <Outlet />
      </main>

      <nav className="print:hidden fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-nav/95 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <ul className="grid grid-cols-5 gap-1 px-3" dir={dir}>
          {tabs.map(({ to, key, Icon, fab }) => (
            <li key={to}>
              {fab ? (
                <button type="button" onClick={() => setChooser(true)} className="tap flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-muted">
                  <span className="well -mt-7 h-14 w-14 rounded-2xl bg-emerald text-white shadow-cta"><Icon size={26} strokeWidth={2.2} /></span>
                  <span className={`leading-none ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(key)}</span>
                </button>
              ) : (
                <NavLink to={to} end={to === '/'} className={({ isActive }) => `tap flex min-h-14 flex-col items-center justify-center gap-0.5 ${isActive ? 'text-emerald' : 'text-muted'}`}>
                  <Icon size={24} strokeWidth={1.75} />
                  <span className={`leading-none ${ur ? cls('sm') : 'text-[11px] font-semibold'}`} dir={dir}>{pick(key)}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <Sheet open={chooser} onClose={() => setChooser(false)} title="home.whatToDo">
        <div className="grid grid-cols-3 gap-3">
          {choices.map(({ to, key, Icon }) => (
            <button key={key} type="button" onClick={() => { setChooser(false); nav(to) }} className="tap flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-surface px-2 py-3">
              <Icon size={28} strokeWidth={1.6} className="text-emerald" />
              <BiLabel text={key} size="sm" align="center" />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
