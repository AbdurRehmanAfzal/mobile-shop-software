/** The new product's frame (ADR-134), copied from the owner's mock-ups: a 252px panel with the
 *  shop's mark and name, the daily counter as tiles with their F-keys, the shop's pages as a grid
 *  of nine, and the "Quick IMEI Focus" hint at its foot; above the page a sticky bar with the IMEI
 *  search and Scan, the language, light / dark, messages and who is logged in.
 *
 *  Every class here is the mock-up file's own (`new mobile shop ui/…pos_stock_ui (4).html`), with
 *  one change: `left`/`right` are written as `start`/`end` so Urdu (RTL) puts the panel on the
 *  right — in English the pixels are the same. This product lives under `/new` and shares nothing
 *  with the software the shops run; that one is untouched. */

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { activeShop, useAuth } from '@/lib/auth'
import { useLang } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { useModules, useTrade } from '@/lib/modules'
import {
  IconBank, IconBars, IconBell, IconBook, IconBox, IconCalendar, IconChevronRight, IconClose,
  IconCog, IconDoc, IconGrid, IconHome, IconMenu, IconMoon, IconPhone, IconPie, IconPlus,
  IconReturn, IconScan, IconSearch, IconSun, IconTag, IconUser, IconUsers, IconWallet,
} from './icons'

type Icon = (p: { className?: string }) => JSX.Element
interface Job { to: string; label: string; Icon: Icon; fkey: string; module?: string; kind?: 'sell' | 'buy' }
interface Tile { to: string; label: string; Icon: Icon; tone?: string; roles?: string[]; module?: string }

/** the counter's eight tiles, in the mock-up's order; the first two are its lime and dark buttons */
const JOBS: Job[] = [
  { to: '/new/sale/new', label: 'counter.sell', Icon: IconTag, fkey: 'F2', kind: 'sell' },
  { to: '/new/purchase/new', label: 'counter.addStock', Icon: IconPlus, fkey: 'F3', kind: 'buy' },
  { to: '/new/khata', label: 'counter.khata', Icon: IconBook, fkey: 'F4' },
  { to: '/new/stock/summary', label: 'counter.stock', Icon: IconPhone, fkey: 'F6' },
  { to: '/new/repairs', label: 'counter.repair', Icon: IconCog, fkey: 'F7', module: 'repairs' },
  { to: '/new/return/new', label: 'counter.returnJob', Icon: IconReturn, fkey: 'F9' },
  { to: '/new/invoices', label: 'inv.short', Icon: IconDoc, fkey: 'F10' },
  { to: '/new/expenses', label: 'counter.expense', Icon: IconWallet, fkey: 'F8', module: 'expenses' },
]

const MANAGERS = ['owner', 'manager']
/** the nine of "Accounts & Audit", in the mock-up's order */
const TILES: Tile[] = [
  { to: '/new/parties', label: 'party.title', Icon: IconUsers },
  { to: '/new/audit', label: 'audit.title', Icon: IconBars, tone: 'text-emerald-600 dark:text-emerald-400', roles: MANAGERS },
  { to: '/new/hisaab', label: 'counter.dayTitle', Icon: IconCalendar },
  { to: '/new/reports', label: 'more.reports', Icon: IconPie },
  { to: '/new/more/cash', label: 'more.cashAccounts', Icon: IconBank, roles: MANAGERS },
  { to: '/new/purchases', label: 'nav.purchases', Icon: IconBox },
  { to: '/new/more/staff', label: 'more.staff', Icon: IconUser, roles: ['owner'] },
  { to: '/new/more/settings', label: 'more.settings', Icon: IconCog, roles: ['owner'] },
  { to: '/new/more', label: 'nav.allOptions', Icon: IconGrid },
]

const DULL = 'p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 text-start transition-all cursor-pointer flex flex-col justify-between min-h-[64px]'
const LIVE = 'p-2.5 rounded-xl bg-white dark:bg-obsidian-800 border-2 border-obsidian-900 dark:border-[#B4F000] text-start transition-all cursor-pointer flex flex-col justify-between min-h-[64px]'

function Panel({ onClose, open }: { open: boolean; onClose: () => void }) {
  const { pick, ur, cls } = useLang()
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const has = useModules()
  const trade = useTrade()
  const { pathname } = useLocation()
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const jobs = JOBS.filter((j) => !j.module || has(j.module as never))
  const tiles = TILES.filter((x) => (!x.roles || (role && x.roles.includes(role))) && (!x.module || has(x.module as never)))
  // ADR-109: a shop that keeps no phones opens its items where a mobile shop opens its stock
  const stockTo = trade.devices ? '/new/stock/summary' : '/new/accessories'
  const small = ur ? cls('sm') : 'text-xs'
  const tiny = ur ? cls('sm') : 'text-[10px]'

  return (
    <aside
      className={`fixed lg:sticky top-0 start-0 z-50 h-screen w-[252px] shrink-0 bg-white dark:bg-obsidian-900 border-e border-slate-200/80 dark:border-slate-800/80 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'ltr:max-lg:-translate-x-full rtl:max-lg:translate-x-full'}`}
      data-testid="newui-panel"
    >
      <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <NavLink to="/new" end className="flex items-center gap-2.5 min-w-0" data-testid="newui-brand">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-[#B4F000] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-sm shadow-sm" dir="ltr">{mark}</div>
          <div className="min-w-0">
            <div className={`truncate ${ur ? `ur font-bold ${cls('md')}` : 'font-display font-bold text-sm tracking-tight leading-tight'}`}>{name}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</span>
            </div>
          </div>
        </NavLink>
        <button type="button" onClick={onClose} aria-label={pick('common.close')} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <IconClose className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        <NavLink to="/new" end onClick={onClose} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold bg-slate-100/80 dark:bg-obsidian-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors ${small}`}>
          <span className="flex items-center gap-2.5">
            <IconHome className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>{pick('nav.dashboard')}</span>
          </span>
          <IconChevronRight className="w-3.5 h-3.5 opacity-50 rtl:rotate-180" />
        </NavLink>

        <div>
          <div className="px-1.5 mb-2 flex items-center justify-between">
            <span className={`font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${tiny}`}>{pick('nav.counterSection')}</span>
            <span className="text-[10px] text-slate-400">{pick('nav.shortcuts')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2" data-testid="newui-jobs">
            {jobs.map((j) => {
              const to = j.label === 'counter.stock' ? stockTo : j.to
              const on = pathname === to || pathname.startsWith(`${to}/`)
              if (j.kind === 'sell')
                return (
                  <NavLink key={j.to} to={to} onClick={onClose} className="p-2.5 rounded-xl bg-[#B4F000] hover:bg-[#A3DC00] text-slate-950 text-start transition-all shadow-sm hover:shadow cursor-pointer flex flex-col justify-between min-h-[68px]">
                    <span className="flex items-center justify-between w-full">
                      <span className="w-6 h-6 rounded-lg bg-white/80 flex items-center justify-center"><j.Icon className="w-3.5 h-3.5 text-slate-900" /></span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/10" dir="ltr">{j.fkey}</span>
                    </span>
                    <span className={`font-bold mt-2 ${small}`}>{pick(j.label)}</span>
                  </NavLink>
                )
              if (j.kind === 'buy')
                return (
                  <NavLink key={j.to} to={to} onClick={onClose} className="p-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 hover:bg-obsidian-800 dark:hover:bg-slate-700 text-white text-start transition-all shadow-sm cursor-pointer flex flex-col justify-between min-h-[68px] border border-transparent dark:border-slate-700">
                    <span className="flex items-center justify-between w-full">
                      <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center"><j.Icon className="w-3.5 h-3.5 text-[#B4F000]" /></span>
                      <span className="text-[10px] font-semibold text-slate-400" dir="ltr">{j.fkey}</span>
                    </span>
                    <span className={`font-bold mt-2 ${small}`}>{pick(j.label)}</span>
                  </NavLink>
                )
              return (
                <NavLink key={j.to} to={to} onClick={onClose} className={on ? LIVE : DULL}>
                  <span className="flex items-center justify-between w-full">
                    <j.Icon className={`w-4 h-4 ${on ? 'text-emerald-600 dark:text-[#B4F000]' : 'text-slate-600 dark:text-slate-400'}`} />
                    <span className={`text-[10px] ${on ? 'font-bold text-slate-700 dark:text-[#B4F000]' : 'font-medium text-slate-400'}`} dir="ltr">{j.fkey}</span>
                  </span>
                  <span className={`mt-1.5 ${on ? 'font-bold' : 'font-semibold'} ${small}`}>{pick(j.label)}</span>
                </NavLink>
              )
            })}
          </div>
        </div>

        <div>
          <div className="px-1.5 mb-2">
            <span className={`font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${tiny}`}>{pick('nav.accountsSection')}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5" data-testid="newui-tiles">
            {tiles.map((x) => (
              <NavLink key={x.to} to={x.to} end={x.to === '/new/more'} onClick={onClose} className="p-2 rounded-xl bg-slate-50/80 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/60 dark:border-slate-800 flex flex-col items-center text-center gap-1.5 cursor-pointer transition-colors">
                <x.Icon className={`w-4 h-4 ${x.tone ?? 'text-slate-600 dark:text-slate-400'}`} />
                <span className={`font-semibold leading-tight ${tiny}`}>{pick(x.label)}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="truncate">{pick('nav.quickImei')}</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold" dir="ltr">/</kbd>
        </div>
      </div>
    </aside>
  )
}

function Bar({ onMenu }: { onMenu: () => void }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const me = useAuth((s) => s.me)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [q, setQ] = useState('')
  const locale: Locale = ur ? 'ur' : 'en'
  const initials = (me?.user.name || me?.user.phone || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const btn = 'px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-obsidian-850 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-obsidian-800 transition-colors cursor-pointer flex items-center gap-1.5'
  const next = () => { const i = LOCALES.indexOf(locale); setLocale(LOCALES[(i + 1) % LOCALES.length]) }

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-obsidian-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-2.5" data-testid="newui-bar">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px] max-w-md">
          <button type="button" onClick={onMenu} aria-label={pick('nav.more')} className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300" data-testid="newui-menu">
            <IconMenu className="w-5 h-5" />
          </button>
          <div className="relative flex-1">
            <IconSearch className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) nav(`/new/stock?q=${encodeURIComponent(q.trim())}`) }}
              placeholder={pick('stock.searchPlaceholder')}
              className="w-full ps-9 pe-16 py-2 rounded-xl text-xs bg-slate-100/80 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-700/80 focus:outline-none focus:border-obsidian-900 dark:focus:border-[#B4F000] transition-colors"
              data-testid="newui-search"
            />
            <button type="button" onClick={() => nav('/new/stock')} className="absolute end-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-white dark:bg-obsidian-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-400 cursor-pointer flex items-center gap-1">
              <IconScan className="w-3 h-3" />
              {pick('common.scan')}
            </button>
          </div>
        </div>

        <div className="order-2 flex items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={next} className={btn} data-testid="newui-lang">
            <span className="text-slate-500 dark:text-slate-400">文A</span>
            <span className={ur ? cls('sm') : ''}>{locale === 'ur' ? 'اردو' : 'English'}</span>
          </button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className={btn} aria-label={pick(dark ? 'more.themeLight' : 'more.themeDark')} data-testid="newui-theme">
            {dark ? <IconSun className="w-3.5 h-3.5 text-[#B4F000]" /> : <IconMoon className="w-3.5 h-3.5 text-slate-600" />}
            <span className="hidden sm:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span>
          </button>
          <button type="button" onClick={() => nav('/new/more/notifications')} aria-label={pick('counter.messages')} className="relative p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-obsidian-850 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-obsidian-800 cursor-pointer">
            <IconBell className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => nav('/new/more')} title={me?.user.name ?? ''} className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center cursor-pointer" dir="ltr" data-testid="newui-profile">
            {initials}
          </button>
        </div>
      </div>
    </header>
  )
}

export default function NewShell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const has = useModules()
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])

  // the counter's keys, as the panel prints them (F5 is left alone: it reloads the page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const job = JOBS.find((j) => j.fkey === e.key)
      if (!job || (job.module && !has(job.module as never))) return
      e.preventDefault()
      nav(job.to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, has])

  return (
    <div className="min-h-dvh bg-[#F4F6F9] dark:bg-obsidian-950 text-slate-900 dark:text-slate-100 antialiased font-sans" data-newui="1">
      <div className="flex">
        <Panel open={open} onClose={() => setOpen(false)} />
        {open ? <button type="button" aria-hidden className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <Bar onMenu={() => setOpen(true)} />
          <main className="min-w-0 flex-1 px-4 sm:px-6 py-4">
            <div className="max-w-7xl mx-auto"><Outlet /></div>
          </main>
        </div>
      </div>
    </div>
  )
}

/** A screen the new product does not draw yet. It says so plainly and opens the same address in the
 *  software the shops use, so nothing is a dead end while the screens are built one by one. */
export function Soon() {
  const { pick } = useLang()
  const { pathname, search } = useLocation()
  const at = `${pathname.replace(/^\/new/, '') || '/'}${search}`
  return (
    <div className="py-16 flex flex-col items-center gap-3 text-center" data-testid="newui-soon">
      <span className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-obsidian-850 flex items-center justify-center text-slate-400"><IconGrid className="w-6 h-6" /></span>
      <span className="font-display text-lg font-extrabold">{pick('newui.soonTitle')}</span>
      <span className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">{pick('newui.soon')}</span>
      <a href={at} className="mt-1 px-4 py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 text-sm font-bold" data-testid="newui-open-old">
        {pick('newui.openOld')}
      </a>
    </div>
  )
}
