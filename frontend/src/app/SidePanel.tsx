/** The laptop side panel (lg+), in the design the user chose on the Appearance page (owner
 *  2026-11-07): Classic (coloured job rows, two-up shop tiles), Tiles (a launcher grid), Simple (a
 *  plain list with a bar on the open page) and Bold (a dark panel). Every design shows the same
 *  pages in the same order and fits one 1280×720 screen. Counter (ADR-132) is the frame of the
 *  owner's new screens: a panel of its own from top to bottom with the shop's name, the jobs as
 *  tiles with their keys, the shop's pages and who is logged in. */

import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Home, Landmark, LayoutGrid, LineChart, Package, Settings, UserCog, Users, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useLang } from '@/components/Bilingual'
import { activeShop, useAuth } from '@/lib/auth'
import { moduleFor, useModules, useTrade } from '@/lib/modules'
import { useLayout } from '@/lib/theme'
import { jobsFor } from '@/features/counter/jobs'

/** owner 2026-11-06/07: the side panel's shop pages, two to a row in Classic, so every one fits one
 *  laptop screen; "All options" (the More page) closes the panel */
const MANAGERS = ['owner', 'manager']
const SHOP_LINKS: { to: string; key: string; Icon: LucideIcon; roles?: string[] }[] = [
  { to: '/parties', key: 'party.title', Icon: Users },
  { to: '/audit', key: 'audit.title', Icon: LineChart, roles: MANAGERS },
  { to: '/hisaab', key: 'counter.dayTitle', Icon: CalendarDays },
  { to: '/reports', key: 'more.reports', Icon: BarChart3 },
  { to: '/more/cash', key: 'more.cashAccounts', Icon: Landmark, roles: MANAGERS },
  { to: '/purchases', key: 'nav.purchases', Icon: Package },
  { to: '/more/staff', key: 'more.staff', Icon: UserCog, roles: ['owner'] },
  { to: '/more/settings', key: 'more.settings', Icon: Settings, roles: ['owner'] },
]

/** a side-panel row: a bordered button with an icon well and a chevron, so it reads as tappable */
const sideRow = (active: boolean) =>
  `tap group flex min-h-8 items-center gap-2.5 rounded-xl border px-2 py-0 font-bold transition-colors ${active ? 'border-ink bg-ink text-ground shadow-hero' : 'border-line bg-surface text-ink shadow-[0_1px_0_rgb(var(--line))] hover:border-ink/40 hover:bg-ground'}`
const tileCls = (active: boolean) =>
  `tap flex min-w-0 flex-col items-center justify-center gap-0 rounded-xl border px-1 py-0.5 text-center font-bold transition-colors ${active ? 'border-ink bg-ink text-ground shadow-hero' : 'border-line bg-surface text-ink shadow-[0_1px_0_rgb(var(--line))] hover:border-ink/40 hover:bg-ground'}`
/** Simple: no boxes, a bar at the start of the open page */
const listRow = (active: boolean) =>
  `tap flex min-h-[30px] items-center gap-2.5 rounded-lg border-s-[3px] px-2 font-bold transition-colors ${active ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-transparent text-ink hover:bg-surface'}`
/** Bold: light text on the dark panel */
const boldRow = (active: boolean) =>
  `tap flex min-h-[34px] items-center gap-2.5 rounded-xl px-2 font-bold transition-colors ${active ? 'bg-white/20 text-white ring-1 ring-white/40' : 'text-white/85 hover:bg-white/10'}`

export default function SidePanel() {
  const layout = useLayout()
  const { ur, pick, cls, dir } = useLang()
  const has = useModules()
  const role = useAuth((s) => s.me?.user.role)
  const trade = useTrade()
  const jobs = jobsFor(trade).filter((j) => !j.homeOnly && (!j.module || has(j.module)))
  const links = SHOP_LINKS.filter((l) => (!l.roles || (role && l.roles.includes(role))) && (!moduleFor(l.to) || has(moduleFor(l.to)!)))
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight
  const txt = (en: string) => (ur ? cls('sm') : en)
  const kbd = (k: string, onDark = false) => <kbd className={`rounded-md border px-1.5 font-sans text-[11px] font-bold ${onDark ? 'border-white/25 text-white/70' : 'border-line bg-surface text-muted'}`} dir="ltr">{k}</kbd>
  const heading = (onDark = false) => <span className={`mt-1 px-1 leading-tight ${onDark ? 'text-white/60' : 'text-muted'} ${ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'}`}>{pick('nav.shopSection')}</span>
  const well = (active: boolean, Icon: LucideIcon, onDark = false) => <span className={`well h-6 w-6 shrink-0 rounded-lg ${active ? 'bg-white/15 text-current' : onDark ? 'bg-white/10 text-white' : 'bg-ground text-ink'}`}><Icon size={15} strokeWidth={2} /></span>

  const aside = 'print:hidden sticky top-[76px] hidden max-h-[calc(100dvh-88px)] w-[252px] shrink-0 flex-col overflow-y-auto lg:flex'

  const shop = useAuth(activeShop)
  const user = useAuth((s) => s.me?.user)

  if (layout === 'counter') {
    const shopName = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
    const mark = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
    const userName = user?.name || user?.phone || ''
    // the first job is the counter's main one (lime on the mock-ups), the second the dark one
    const jobTile = (i: number, active: boolean, tone: string) =>
      `tap relative flex ${ur ? 'min-h-[52px]' : 'min-h-[62px]'} min-w-0 flex-col items-start justify-between gap-1 rounded-2xl border p-2 font-bold transition-colors ${i === 0 ? `border-transparent ${tone}` : i === 1 ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink hover:border-ink/40'} ${active ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`
    // Urdu names are longer and Nastaliq is tall: two to a row with the name beside the icon, never cut
    const shopTile = (active: boolean) => (ur ? `${tileCls(active)} min-h-10 !flex-row !justify-start gap-1.5 overflow-hidden !px-1.5` : `${tileCls(active)} min-h-[58px] gap-0.5`)
    return (
      <aside className="print:hidden sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-e border-line bg-surface lg:flex" aria-label={pick('nav.home')} data-testid="side-panel" data-layout="counter">
        <NavLink to="/" end className="flex min-h-[68px] items-center gap-2.5 border-b border-line px-3.5" data-testid="side-brand">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-hero font-display text-sm font-extrabold text-hero-text" dir="ltr">{mark(shop?.name || '')}</span>
          <span className={`line-clamp-2 min-w-0 flex-1 ${ur ? 'ur text-base font-bold leading-snug' : 'font-display text-[15px] font-extrabold leading-tight tracking-[-0.01em]'}`} dir={dir}>{shopName}</span>
        </NavLink>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
          <NavLink to="/" end className={({ isActive }) => sideRow(isActive)} data-testid="side-home">
            {({ isActive }) => <>{well(isActive, Home)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.dashboard')}</span><Chevron size={16} className="shrink-0 opacity-60" /></>}
          </NavLink>
          <span className={`mt-1 px-1 leading-tight text-muted ${ur ? cls('sm') : 'text-[11px] font-bold uppercase tracking-wider'}`}>{pick('nav.counterSection')}</span>
          <nav className="grid grid-cols-2 gap-1.5" data-testid="side-jobs">
            {jobs.map((j, i) => (
              <NavLink key={j.id} to={j.to} className={({ isActive }) => jobTile(i, isActive, j.tone)}>
                <j.Icon size={18} strokeWidth={2} className="shrink-0" />
                <span className={`line-clamp-1 w-full text-start ${txt('text-[13px] leading-tight')}`}>{pick(j.label)}</span>
                {j.fkey ? <span className="absolute end-2 top-2 font-mono text-[10px] font-bold opacity-60"><bdi dir="ltr">{j.fkey}</bdi></span> : null}
              </NavLink>
            ))}
          </nav>
          {heading()}
          <nav className={`grid gap-1 ${ur ? 'grid-cols-2' : 'grid-cols-3'}`} data-testid="side-shop">
            {links.map(({ to, key, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => shopTile(isActive)}>
                <Icon size={17} strokeWidth={1.9} className="shrink-0" />
                <span className={`${ur ? `min-w-0 flex-1 whitespace-nowrap text-start ${cls('sm')}` : 'line-clamp-2 w-full text-[11px] leading-tight'}`}>{pick(key)}</span>
              </NavLink>
            ))}
            <NavLink to="/more" end className={({ isActive }) => shopTile(isActive)}>
              <LayoutGrid size={17} strokeWidth={1.9} className="shrink-0" />
              <span className={`${ur ? `min-w-0 flex-1 whitespace-nowrap text-start ${cls('sm')}` : 'line-clamp-2 w-full text-[11px] leading-tight'}`}>{pick('nav.allOptions')}</span>
            </NavLink>
          </nav>
        </div>
        {user ? (
          <div className="flex items-center gap-2.5 border-t border-line px-3.5 py-2.5" data-testid="side-user">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-tint text-[12px] font-extrabold text-emerald-deep" dir="ltr">{mark(userName)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-bold">{userName}</span>
              <span className={`truncate text-muted ${ur ? cls('sm') : 'text-[11px] font-semibold'}`}>{pick(`staff.roles.${user.role}`)}</span>
            </span>
          </div>
        ) : null}
      </aside>
    )
  }

  if (layout === 'tiles') {
    return (
      <aside className={`${aside} gap-1.5 p-1.5`} aria-label={pick('nav.home')} data-testid="side-panel" data-layout="tiles">
        <NavLink to="/" end className={({ isActive }) => sideRow(isActive)} data-testid="side-home">
          {({ isActive }) => <>{well(isActive, Home)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.dashboard')}</span><Chevron size={16} className="shrink-0 opacity-60" /></>}
        </NavLink>
        <nav className="grid grid-cols-2 gap-1.5">
          {jobs.map((j) => (
            <NavLink key={j.id} to={j.to} className={({ isActive }) => `tap relative flex min-h-[60px] min-w-0 flex-col items-start justify-between gap-1 rounded-2xl p-2 font-bold ${j.tone} ${isActive ? 'ring-2 ring-current' : ''}`}>
              <span className={`well h-7 w-7 shrink-0 rounded-lg bg-surface ${j.ink}`}><j.Icon size={16} strokeWidth={2} /></span>
              <span className={`line-clamp-1 w-full text-start ${txt('text-[13px] leading-tight')}`}>{pick(j.label)}</span>
              <span className="absolute end-1.5 top-1.5 text-[10px] font-bold opacity-60" dir="ltr">{j.fkey}</span>
            </NavLink>
          ))}
        </nav>
        {heading()}
        <nav className="grid grid-cols-3 gap-1" data-testid="side-shop">
          {links.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `${tileCls(isActive)} min-h-[54px]`}>
              {({ isActive }) => <>{well(isActive, Icon)}<span className={`line-clamp-2 w-full leading-tight ${ur ? cls('sm') : 'text-[11px]'}`}>{pick(key)}</span></>}
            </NavLink>
          ))}
          <NavLink to="/more" end className={({ isActive }) => `${tileCls(isActive)} min-h-[54px]`}>
            {({ isActive }) => <>{well(isActive, LayoutGrid)}<span className={`line-clamp-1 w-full ${ur ? cls('sm') : 'text-[11px]'}`}>{pick('nav.allOptions')}</span></>}
          </NavLink>
        </nav>
      </aside>
    )
  }

  if (layout === 'simple') {
    return (
      <aside className={`${aside} gap-0.5 p-1.5`} aria-label={pick('nav.home')} data-testid="side-panel" data-layout="simple">
        <NavLink to="/" end className={({ isActive }) => listRow(isActive)} data-testid="side-home">
          <Home size={17} strokeWidth={2} className="shrink-0" /><span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.dashboard')}</span>
        </NavLink>
        {jobs.map((j) => (
          <NavLink key={j.id} to={j.to} className={({ isActive }) => listRow(isActive)}>
            {({ isActive }) => <><j.Icon size={17} strokeWidth={2} className={`shrink-0 ${isActive ? '' : j.ink}`} /><span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick(j.label)}</span><span className="text-[11px] font-bold text-muted" dir="ltr">{j.fkey}</span></>}
          </NavLink>
        ))}
        <div className="my-1 h-px bg-line" />
        {heading()}
        <nav className="flex flex-col gap-0.5" data-testid="side-shop">
          {links.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => listRow(isActive)}>
              <Icon size={17} strokeWidth={2} className="shrink-0 text-muted" /><span className={`min-w-0 flex-1 truncate ${txt('text-sm')}`}>{pick(key)}</span>
            </NavLink>
          ))}
          <NavLink to="/more" end className={({ isActive }) => listRow(isActive)}>
            <LayoutGrid size={17} strokeWidth={2} className="shrink-0 text-muted" /><span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.allOptions')}</span><Chevron size={15} className="shrink-0 opacity-60" />
          </NavLink>
        </nav>
      </aside>
    )
  }

  if (layout === 'bold') {
    return (
      <aside className={`${aside} m-1.5 gap-0.5 rounded-3xl bg-hero p-2 text-hero-text shadow-hero`} aria-label={pick('nav.home')} data-testid="side-panel" data-layout="bold">
        <NavLink to="/" end className={({ isActive }) => boldRow(isActive)} data-testid="side-home">
          {({ isActive }) => <>{well(isActive, Home, true)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.dashboard')}</span></>}
        </NavLink>
        {jobs.map((j) => (
          <NavLink key={j.id} to={j.to} className={({ isActive }) => boldRow(isActive)}>
            <span className={`well h-6 w-6 shrink-0 rounded-lg ${j.tone}`}><j.Icon size={15} strokeWidth={2} /></span>
            <span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick(j.label)}</span>
            {j.fkey ? kbd(j.fkey, true) : null}
          </NavLink>
        ))}
        {heading(true)}
        <nav className="grid grid-cols-2 gap-1" data-testid="side-shop">
          {links.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `tap flex min-h-[44px] min-w-0 flex-col items-center justify-center rounded-xl px-1 text-center font-bold transition-colors ${isActive ? 'bg-white/20 text-white ring-1 ring-white/40' : 'bg-white/[0.07] text-white/85 hover:bg-white/15'}`}>
              <Icon size={16} strokeWidth={2} className="shrink-0" />
              <span className={`line-clamp-1 w-full ${ur ? cls('sm') : 'text-xs'}`}>{pick(key)}</span>
            </NavLink>
          ))}
          <NavLink to="/more" end className={({ isActive }) => `col-span-2 ${boldRow(isActive)}`}>
            {({ isActive }) => <>{well(isActive, LayoutGrid, true)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.allOptions')}</span><Chevron size={16} className="shrink-0 opacity-60" /></>}
          </NavLink>
        </nav>
      </aside>
    )
  }

  // Classic
  return (
    <aside className={`${aside} gap-1 p-1.5`} aria-label={pick('nav.home')} data-testid="side-panel" data-layout="classic">
      <NavLink to="/" end className={({ isActive }) => sideRow(isActive)} data-testid="side-home">
        {({ isActive }) => <>{well(isActive, Home)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.dashboard')}</span><Chevron size={16} className="shrink-0 opacity-60" /></>}
      </NavLink>
      {jobs.map((j) => (
        <NavLink key={j.id} to={j.to} className={({ isActive }) => `tap flex min-h-8 items-center gap-2.5 rounded-xl px-2 py-0 font-bold ${j.tone} ${isActive ? 'ring-2 ring-current' : ''}`}>
          <span className={`well h-6 w-6 shrink-0 rounded-lg bg-surface ${j.ink}`}><j.Icon size={15} strokeWidth={2} /></span>
          <span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick(j.label)}</span>
          {j.fkey ? kbd(j.fkey) : null}
        </NavLink>
      ))}
      {heading()}
      <nav className="grid grid-cols-2 gap-1" data-testid="side-shop">
        {links.map(({ to, key, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `${tileCls(isActive)} min-h-[46px]`}>
            {({ isActive }) => <>{well(isActive, Icon)}<span className={`line-clamp-1 w-full ${ur ? cls('sm') : 'text-xs'}`}>{pick(key)}</span></>}
          </NavLink>
        ))}
        <NavLink to="/more" end className={({ isActive }) => `col-span-2 ${sideRow(isActive)}`}>
          {({ isActive }) => <>{well(isActive, LayoutGrid)}<span className={`min-w-0 flex-1 ${txt('text-sm')}`}>{pick('nav.allOptions')}</span><Chevron size={16} className="shrink-0 opacity-60" /></>}
        </NavLink>
      </nav>
    </aside>
  )
}
