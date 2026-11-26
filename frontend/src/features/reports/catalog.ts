/** Every report and sheet of the software, in one list (owner 2026-11-19, ADR-111). Shopkeepers
 *  coming from other software look for all of them under "Reports"; here they were spread over
 *  the stock, khata, hisaab, accessories and audit screens. The reports stay where they are — this
 *  list only says where each one lives, whether it can be downloaded, and who may open it. The
 *  Reports page (`ReportsHub`) is drawn from it; `hub.r.<id>.t / .d` are its name and one line. */

import type { ModuleKey } from '@/lib/modules'

export type Group = 'daily' | 'sales' | 'stock' | 'people' | 'money' | 'staff'
export const GROUPS: Group[] = ['daily', 'sales', 'stock', 'people', 'money', 'staff']
export interface Period { from: string; to: string }

export interface Report {
  id: string
  group: Group
  /** where the report opens; the dates picked are passed on where the screen takes them */
  to: (p: Period) => string
  /** a PDF / Excel / CSV of it, when the software has one */
  download?: { path: (p: Period) => string; name: string }
  module?: ModuleKey
  /** owner and manager only (the screen shows cost, profit or other people's work) */
  managers?: boolean
  ownerOnly?: boolean
  /** only for an owner with more than one shop */
  branches?: boolean
  /** not for a shop that keeps no phones or laptops (accessories only) */
  units?: boolean
}

const dates = (p: Period) => `date_from=${p.from}&date_to=${p.to}`
const audit = (path: string) => (p: Period) => `${path}?preset=custom&${dates(p)}`
const at = (path: string) => () => path

export const REPORTS: Report[] = [
  // ---- every day ----
  { id: 'day', group: 'daily', to: (p) => `/hisaab?from=${p.from}&to=${p.to}`, download: { path: (p) => `/api/v1/exports/day?${dates(p)}`, name: 'hisaab' } },
  { id: 'tally', group: 'daily', to: at('/stock/summary'), units: true },
  { id: 'khata', group: 'daily', to: at('/khata'), download: { path: () => '/api/v1/exports/khata', name: 'udhaar-khata' } },
  { id: 'sales', group: 'daily', to: at('/sales'), download: { path: (p) => `/api/v1/exports/sales?${dates(p)}`, name: 'sales' } },
  { id: 'purchases', group: 'daily', to: at('/purchases'), download: { path: (p) => `/api/v1/exports/purchases?${dates(p)}`, name: 'purchases' } },
  { id: 'lending', group: 'daily', to: audit('/audit/lending'), module: 'reports', managers: true },
  { id: 'cash', group: 'daily', to: at('/more/cash'), managers: true },
  { id: 'expenses', group: 'daily', to: at('/expenses'), module: 'expenses', managers: true, download: { path: (p) => `/api/v1/exports/expenses?${dates(p)}`, name: 'expenses' } },
  { id: 'returns', group: 'daily', to: at('/returns') },
  // ---- sales and profit ----
  { id: 'profit', group: 'sales', to: at('/reports?tab=profit'), module: 'reports', managers: true, download: { path: (p) => `/api/v1/exports/profit-loss?${dates(p)}`, name: 'profit-loss' } },
  { id: 'top', group: 'sales', to: at('/reports?tab=top'), module: 'reports', managers: true, download: { path: (p) => `/api/v1/exports/top-sellers?${dates(p)}`, name: 'best-sellers' } },
  { id: 'salesAudit', group: 'sales', to: audit('/audit/sales'), module: 'reports', managers: true },
  { id: 'bills', group: 'sales', to: audit('/audit/bills'), module: 'reports', managers: true },
  { id: 'returnsReport', group: 'sales', to: audit('/audit/returns'), module: 'reports', managers: true },
  { id: 'products', group: 'sales', to: audit('/audit/products'), module: 'reports', managers: true },
  { id: 'prices', group: 'sales', to: at('/reports?tab=prices'), module: 'reports', managers: true, units: true },
  { id: 'estimate', group: 'sales', to: at('/reports?tab=estimate'), module: 'reports', managers: true, units: true, download: { path: () => '/api/v1/exports/forecast', name: 'estimate' } },
  { id: 'invoices', group: 'sales', to: at('/invoices') },
  { id: 'trade', group: 'sales', to: at('/sale-purchase') },
  { id: 'installments', group: 'sales', to: at('/installments'), module: 'installments' },
  // ---- stock ----
  { id: 'stock', group: 'stock', to: at('/stock'), units: true, download: { path: () => '/api/v1/exports/stock', name: 'stock' } },
  { id: 'worth', group: 'stock', to: at('/stock/summary'), download: { path: () => '/api/v1/exports/stock-summary', name: 'stock-worth' } },
  { id: 'itemSheet', group: 'stock', to: at('/stock/summary'), units: true, download: { path: () => '/api/v1/exports/stock-cost', name: 'stock-item-wise' } },
  { id: 'oldStock', group: 'stock', to: at('/reports?tab=old'), module: 'reports', managers: true, units: true, download: { path: () => '/api/v1/exports/stock-ageing', name: 'old-stock' } },
  { id: 'byType', group: 'stock', to: at('/reports?tab=types'), module: 'reports', managers: true, units: true },
  { id: 'stockAudit', group: 'stock', to: audit('/audit/stock'), module: 'reports', managers: true },
  { id: 'count', group: 'stock', to: at('/stock/count'), managers: true },
  { id: 'items', group: 'stock', to: at('/accessories/reports'), module: 'accessories' },
  { id: 'transfers', group: 'stock', to: at('/transfers'), managers: true, branches: true },
  // ---- udhaar and people ----
  { id: 'balances', group: 'people', to: at('/balances'), managers: true },
  { id: 'ageing', group: 'people', to: audit('/audit/udhaar'), module: 'reports', managers: true },
  { id: 'people', group: 'people', to: audit('/audit/people'), module: 'reports', managers: true, download: { path: () => '/api/v1/exports/parties', name: 'people' } },
  { id: 'personLedger', group: 'people', to: at('/parties') },
  { id: 'payments', group: 'people', to: at('/payments') },
  { id: 'reminders', group: 'people', to: at('/khata/reminders'), module: 'notifications' },
  // ---- money and accounts ----
  { id: 'accounts', group: 'money', to: at('/accounts'), managers: true },
  { id: 'finance', group: 'money', to: audit('/audit/finance'), module: 'reports', managers: true },
  { id: 'books', group: 'money', to: at('/reports?tab=books'), module: 'reports', managers: true },
  { id: 'ledger', group: 'money', to: at('/reports/ledger'), module: 'reports', managers: true },
  { id: 'overview', group: 'money', to: at('/overview'), managers: true },
  { id: 'audit', group: 'money', to: audit('/audit'), module: 'reports', managers: true },
  { id: 'full', group: 'money', to: audit('/audit/reports'), module: 'reports', managers: true },
  // ---- staff and security ----
  { id: 'staff', group: 'staff', to: audit('/audit/staff'), module: 'reports', managers: true },
  { id: 'security', group: 'staff', to: audit('/audit/security'), module: 'reports', ownerOnly: true },
  { id: 'repairs', group: 'staff', to: audit('/audit/repairs'), module: 'repairs', managers: true },
  { id: 'logins', group: 'staff', to: at('/more/logins'), module: 'login_activity', ownerOnly: true },
]

export interface Viewer { role?: string; has: (m: ModuleKey) => boolean; shops: number; devices: boolean }

/** the reports this person may open in this shop */
export function reportsFor(v: Viewer): Report[] {
  const manager = v.role === 'owner' || v.role === 'manager'
  return REPORTS.filter((r) => (!r.module || v.has(r.module)) && (!r.managers || manager) && (!r.ownerOnly || v.role === 'owner') && (!r.branches || v.shops > 1) && (!r.units || v.devices) && (r.module !== 'repairs' || v.has('reports')))
}
