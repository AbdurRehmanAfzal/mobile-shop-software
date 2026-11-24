/** The rail that files 03 (cash & bank) and 04 (day's hisaab) draw: the shop's mark, Dashboard, the
 *  counter's tiles with their F-keys (Sell lime, Add stock dark), the shop grid of nine with this
 *  screen's tile lit, and who is logged in at the foot. Each file has its own lime, passed as `lime`
 *  (a CSS variable, so the classes stay the files' own). Links go to the new product's addresses. */

import type { CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3, BookOpen, CalendarCheck, ChevronRight, FileText, Home, Landmark, LayoutGrid, PackagePlus, Settings, ShieldCheck,
  ShoppingBag, Smartphone, Tag, Undo2, UserCog, Users, Wallet, Wrench,
} from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { activeShop, useAuth } from '@/lib/auth'
import { useModules } from '@/lib/modules'

type Icon = typeof Tag

export default function FileRail({ lit, lime, testid }: { lit: string; lime: string; testid: string }) {
  const { pick, ur, cls } = useLang()
  const has = useModules()
  const shop = useAuth(activeShop)
  const me = useAuth((s) => s.me)
  const role = me?.user.role
  const name = ur ? shop?.name_ur || shop?.name || '' : shop?.name || ''
  const mark = (shop?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const userName = me?.user.name || me?.user.phone || ''
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const managers = role === 'owner' || role === 'manager'
  const JOBS: [string, string, string, Icon][] = [
    ['/new/khata', 'counter.khata', 'F4', BookOpen], ['/new/stock/summary', 'counter.stock', 'F6', Smartphone],
    ...(has('repairs') ? [['/new/repairs', 'counter.repair', 'F7', Wrench] as [string, string, string, Icon]] : []),
    ['/new/return/new', 'counter.returnJob', 'F9', Undo2], ['/new/invoices', 'inv.short', 'F10', FileText],
    ...(has('expenses') ? [['/new/expenses', 'counter.expense', 'F8', Wallet] as [string, string, string, Icon]] : []),
  ]
  const SHOP: [string, string, Icon, boolean][] = [
    ['/new/parties', 'party.title', Users, true], ['/new/audit', 'audit.title', ShieldCheck, managers], ['/new/hisaab', 'counter.dayTitle', CalendarCheck, true],
    ['/new/reports', 'more.reports', BarChart3, true], ['/new/more/cash', 'more.cashAccounts', Landmark, managers], ['/new/purchases', 'nav.purchases', ShoppingBag, managers],
    ['/new/more/staff', 'more.staff', UserCog, role === 'owner'], ['/new/more/settings', 'more.settings', Settings, role === 'owner'], ['/new/more', 'nav.allOptions', LayoutGrid, true],
  ]
  const tiny = ur ? cls('sm') : 'text-[10px]'
  const small = ur ? cls('sm') : 'text-xs'
  return (
    <aside style={{ '--nl': lime } as CSSProperties} className="hidden lg:flex lg:w-64 shrink-0 flex-col bg-white dark:bg-obsidian-900 border-e border-slate-200/90 dark:border-slate-800 z-20 lg:h-screen lg:sticky lg:top-0" data-testid={testid}>
      <NavLink to="/new" className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-obsidian-900 dark:bg-[var(--nl)] text-[var(--nl)] dark:text-obsidian-950 flex items-center justify-center font-display font-extrabold text-xs shadow-xs" dir="ltr">{mark}</div>
        <div className="min-w-0"><div className="font-display font-extrabold text-sm tracking-tight truncate">{name}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{shop?.city || (role ? pick(`staff.roles.${role}`) : '')}</div></div>
      </NavLink>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <NavLink to="/new" className={`w-full px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-obsidian-850 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between cursor-pointer transition-colors ${small}`}><span className="flex items-center gap-2"><Home className="w-3.5 h-3.5 text-slate-400" /> {pick('nav.dashboard')}</span><ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" /></NavLink>
          <div className={`px-2.5 mt-3 mb-1.5 font-extrabold uppercase tracking-wider text-slate-400 ${tiny}`}>{pick('nav.counterSection')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NavLink to="/new/sale/new" className="p-2.5 rounded-xl bg-[var(--nl)] hover:brightness-95 text-slate-950 font-display font-extrabold text-xs flex flex-col justify-between gap-1.5 shadow-2xs cursor-pointer transition-colors min-h-[56px]"><span className="flex items-center justify-between w-full"><Tag className="w-3.5 h-3.5" /><span className="text-[10px] opacity-75" dir="ltr">F2</span></span><span className={small}>{pick('counter.sell')}</span></NavLink>
            <NavLink to="/new/purchase/new" className="p-2.5 rounded-xl bg-obsidian-900 dark:bg-obsidian-800 hover:opacity-95 text-white font-display font-extrabold text-xs flex flex-col justify-between gap-1.5 shadow-2xs cursor-pointer transition-colors min-h-[56px]"><span className="flex items-center justify-between w-full"><PackagePlus className="w-3.5 h-3.5 text-[var(--nl)]" /><span className="text-[10px] text-slate-400" dir="ltr">F3</span></span><span className={small}>{pick('counter.addStock')}</span></NavLink>
            {JOBS.map(([to, label, key, I]) => to === lit ? (
              <span key={to} aria-current="page" className="p-2 rounded-xl bg-slate-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex flex-col justify-between gap-1.5 ring-2 ring-slate-900/20 dark:ring-white/20 shadow-xs min-h-[52px]"><span className="flex items-center justify-between w-full"><I className="w-3.5 h-3.5 text-[var(--nl)] dark:text-obsidian-950" /><span className="font-mono text-[10px] text-slate-300 dark:text-obsidian-900" dir="ltr">{key}</span></span><span className={small}>{pick(label)}</span></span>
            ) : (
              <NavLink key={to} to={to} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex flex-col justify-between gap-1.5 cursor-pointer transition-colors min-h-[52px]"><span className="flex items-center justify-between w-full"><I className="w-3.5 h-3.5 text-emerald-600" /><span className="text-[10px] text-slate-400" dir="ltr">{key}</span></span><span className={small}>{pick(label)}</span></NavLink>
            ))}
          </div>
        </div>
        <div>
          <div className={`px-2.5 mb-1.5 font-extrabold uppercase tracking-wider text-slate-400 ${tiny}`}>{pick('nlist.shop')}</div>
          <div className="grid grid-cols-3 gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
            {SHOP.filter((x) => x[3]).map(([to, label, I]) => to === lit ? (
              <span key={to} aria-current="page" className="p-2 rounded-xl bg-obsidian-900 dark:bg-[var(--nl)] text-white dark:text-obsidian-950 font-extrabold flex flex-col items-center text-center gap-1 shadow-xs"><I className="w-3.5 h-3.5 text-[var(--nl)] dark:text-obsidian-950" /><span className={`leading-tight ${tiny}`}>{pick(label)}</span></span>
            ) : (
              <NavLink key={to} to={to} end={to === '/new/more'} className="p-2 rounded-xl bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 dark:hover:bg-obsidian-800 border border-slate-200/70 dark:border-slate-800 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"><I className="w-3.5 h-3.5 text-slate-500" /><span className={`leading-tight ${tiny}`}>{pick(label)}</span></NavLink>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center" dir="ltr">{initials}</div>
        <div className="min-w-0"><div className="text-xs font-bold truncate">{userName}</div><div className="text-[10px] text-slate-400">{role ? pick(`staff.roles.${role}`) : ''}</div></div>
      </div>
    </aside>
  )
}
