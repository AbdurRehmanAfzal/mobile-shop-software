/** The shop's jobs, one colour each (docs/11 v2 "Dukaan counter"). Home tiles, the laptop side menu
 *  and the F-key shortcuts all read this list, so a job looks and lands the same everywhere. */

import { ArrowLeftRight, BookOpen, Boxes, FileText, PackagePlus, Receipt, Smartphone, Tag, Undo2, Wallet, Wrench, type LucideIcon } from 'lucide-react'

export interface Job {
  id: 'sell' | 'addStock' | 'khata' | 'stock' | 'repair' | 'expense' | 'return' | 'invoices' | 'exchange' | 'sales'
  to: string
  label: string
  hint?: string
  Icon: LucideIcon
  /** tile background + text classes (tokens in index.css) */
  tone: string
  /** icon colour on the white well */
  ink: string
  fkey: string
  /** the module this job needs (none = basic) */
  module?: 'repairs' | 'expenses' | 'exchange'
  /** on the home screen only (the laptop side menu keeps to the F-key jobs, so it fits the screen) */
  homeOnly?: boolean
}

/** The jobs of this shop: one that keeps no phones or laptops (accessories only, ADR-109) opens
 *  its items where a mobile shop opens its phones. */
export function jobsFor(trade: { devices: boolean }): Job[] {
  return trade.devices ? JOBS : JOBS.filter((j) => j.id !== 'exchange').map((j) => (j.id === 'stock' ? { ...j, to: '/accessories', Icon: Boxes } : j.id === 'addStock' ? { ...j, hint: 'goods.addStockHint' } : j))
}

export const JOBS: Job[] = [
  { id: 'sell', to: '/sale/new', label: 'counter.sell', hint: 'counter.sellHint', Icon: Tag, tone: 'bg-sell text-sell-fg', ink: 'text-sell-icon', fkey: 'F2' },
  { id: 'addStock', to: '/purchase/new', label: 'counter.addStock', hint: 'counter.addStockHint', Icon: PackagePlus, tone: 'bg-buy text-buy-fg', ink: 'text-buy-icon', fkey: 'F3' },
  { id: 'khata', to: '/khata', label: 'counter.khata', Icon: BookOpen, tone: 'bg-khata text-khata-fg', ink: 'text-khata-icon', fkey: 'F4' },
  { id: 'stock', to: '/stock/summary', label: 'counter.stock', Icon: Smartphone, tone: 'bg-stockt text-stockt-fg', ink: 'text-stockt-icon', fkey: 'F6' },
  // owner 2026-11-15: used every day, so on the home screen too (no F-key)
  { id: 'exchange', to: '/exchange/new', label: 'more.exchange', Icon: ArrowLeftRight, tone: 'bg-sell text-sell-fg', ink: 'text-sell-icon', fkey: '', module: 'exchange', homeOnly: true },
  { id: 'sales', to: '/sales', label: 'more.sales', Icon: Receipt, tone: 'bg-sell text-sell-fg', ink: 'text-sell-icon', fkey: '', homeOnly: true },
  { id: 'repair', to: '/repairs', label: 'counter.repair', Icon: Wrench, tone: 'bg-repair text-repair-fg', ink: 'text-repair-icon', fkey: 'F7', module: 'repairs' },
  { id: 'return', to: '/return/new', label: 'counter.returnJob', Icon: Undo2, tone: 'bg-ret text-ret-fg', ink: 'text-ret-icon', fkey: 'F9' },
  { id: 'invoices', to: '/invoices', label: 'inv.short', Icon: FileText, tone: 'bg-khata text-khata-fg', ink: 'text-khata-icon', fkey: 'F10' },
  { id: 'expense', to: '/expenses', label: 'counter.expense', Icon: Wallet, tone: 'bg-expense text-expense-fg', ink: 'text-expense-icon', fkey: 'F8', module: 'expenses' },
]
