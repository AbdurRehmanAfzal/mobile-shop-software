/** The provider's own place (owner 2026-11-20, ADR-115): `/control` — only the screens that run
 *  the software itself (shops, plans, fees, modules, keys, the business view), under their own
 *  address and frame, with none of a shop's counter around them. Someone who is not logged in is
 *  sent to the login and comes back here; a login that is not the provider's is told so. The
 *  server decides who the provider is on every request — this frame only keeps the two apart. */

import { BarChart3, LogOut, ShieldCheck, Store } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'

/** where the login sends a provider who came for the control room */
export const NEXT_KEY = 'mobileshop.next'
/** a logout from here is a goodbye, not a visit to remember */
let leaving = false
const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'EN' }

export default function ControlShell() {
  const { pick, ur, roman, cls, dir } = useLang()
  const token = useAuth((s) => s.accessToken)
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const { pathname } = useLocation()
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  // arrived: the login has nothing left to remember
  useEffect(() => { if (token) { leaving = false; try { sessionStorage.removeItem(NEXT_KEY) } catch { /* private window */ } } }, [token])
  if (!token) {
    try { if (!leaving) sessionStorage.setItem(NEXT_KEY, pathname) } catch { /* private window: the login opens the app, the link works again */ }
    return <Navigate to="/login" replace />
  }
  const tab = ({ isActive }: { isActive: boolean }) => `tap flex min-h-11 items-center gap-2 rounded-xl px-3.5 font-bold ${ur ? cls('sm') : 'text-sm'} ${isActive ? 'bg-ink text-ground' : 'text-ink hover:bg-surface'}`

  return (
    <div className="min-h-dvh bg-ground text-ink" dir={dir} data-testid="control-shell">
      <header className="sticky top-0 z-20 border-b border-line bg-ground print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span className="well h-10 w-10 shrink-0 rounded-xl bg-ink text-ground"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span className="flex min-w-[9rem] flex-1 flex-col leading-tight">
            <span className={`truncate ${ur ? cls('md') : 'text-base font-extrabold tracking-tight'}`}>{pick('control.title')}</span>
            <span className={`truncate text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{me?.user.name || me?.user.phone}</span>
          </span>
          <div className="flex gap-0.5 rounded-full bg-surface p-0.5" dir="ltr">
            {LOCALES.map((l) => <button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)} className={`tap h-8 rounded-full px-2.5 text-[12px] font-bold ${l === locale ? 'bg-ink text-ground' : 'text-ink'} ${l === 'ur' ? 'ur' : ''}`}>{LANG[l]}</button>)}
          </div>
          <button type="button" onClick={() => { leaving = true; logout() }} className={`tap flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold text-payable ${ur ? cls('sm') : 'text-sm'}`} data-testid="control-logout"><LogOut size={16} />{pick('auth.logout')}</button>
        </div>
        {me?.user.is_superuser ? (
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 pb-2" aria-label={pick('control.title')}>
            <NavLink to="/control" end className={tab} data-testid="control-tab-shops"><Store size={16} />{pick('control.shops')}</NavLink>
            <NavLink to="/control/business" className={tab} data-testid="control-tab-business"><BarChart3 size={16} />{pick('control.business')}</NavLink>
            <Link to="/" className={`tap ms-auto flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-bold text-muted hover:bg-surface ${ur ? cls('sm') : 'text-sm'}`} data-testid="control-to-app">{pick('control.toApp')}</Link>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-4">
        {me?.user.is_superuser ? <Outlet /> : (
          <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center" data-testid="control-denied">
            <span className="well h-14 w-14 rounded-2xl bg-payable-tint text-payable"><ShieldCheck size={26} /></span>
            <BiLabel text="control.denied" size="lg" bold align="center" />
            <BiLabel text="control.deniedHint" size="sm" tone="text-muted" align="center" />
            <Link to="/" className={`tap flex min-h-12 items-center justify-center rounded-2xl bg-ink px-5 font-bold text-ground ${ur ? cls('md') : ''}`}>{pick('control.toApp')}</Link>
          </div>
        )}
      </main>
    </div>
  )
}
