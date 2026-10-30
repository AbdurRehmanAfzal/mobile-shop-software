/** Modules the shop may use (owner 2026-10-29): the super admin switches them per shop or per plan;
 *  the app hides a switched-off module's tiles and buttons (the API refuses it anyway). */

import { useAuth } from './auth'

export const MODULE_KEYS = ['accessories', 'repairs', 'expenses', 'held_sales', 'tax', 'exchange', 'reports', 'exports', 'notifications', 'loans', 'installments', 'attendance', 'ai'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

/** what a route or menu entry needs; anything not listed is basic */
export const ROUTE_MODULE: Record<string, ModuleKey> = {
  '/repairs': 'repairs',
  '/accessories': 'accessories',
  '/expenses': 'expenses',
  '/exchange/new': 'exchange',
  '/loans': 'loans',
  '/reports': 'reports',
  '/more/notifications': 'notifications',
  '/khata/reminders': 'notifications',
  '/installments': 'installments',
  '/assistant': 'ai',
}

export function moduleFor(path: string): ModuleKey | null {
  for (const [prefix, key] of Object.entries(ROUTE_MODULE)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key
  }
  return null
}

export function enabledModules(): readonly string[] {
  const me = useAuth.getState().me
  // no plan info (older server, super admin inside a shop): everything shows
  return me?.plan?.modules ?? MODULE_KEYS
}

export function useModule(key: ModuleKey): boolean {
  return useAuth((s) => (s.me?.plan?.modules ?? (MODULE_KEYS as readonly string[])).includes(key) || !!s.me?.user.is_superuser)
}

export function useModules(): (key: ModuleKey) => boolean {
  const list = useAuth((s) => s.me?.plan?.modules)
  const superuser = useAuth((s) => !!s.me?.user.is_superuser)
  return (key) => superuser || (list ?? (MODULE_KEYS as readonly string[])).includes(key)
}
