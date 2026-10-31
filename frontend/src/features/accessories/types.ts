/** Counted items (accessories, watches): the product card of owner addendum 5 (docs/24). */

export interface Item {
  id: string
  sku: string
  name: string
  name_ur: string | null
  category: string
  qty: number
  avg_cost: string | null
  price: string
  reorder_level: number
  is_active: boolean
  low_stock: boolean
  barcode?: string | null
  barcode_type?: string | null
  manufacturer_code?: string | null
  brand?: string | null
  compatible?: string | null
  grade?: string
  color?: string | null
  size?: string | null
  capacity?: string | null
  connector?: string | null
  wattage?: string | null
  warranty_days?: number
  warranty_terms?: string | null
  warranty_by?: 'shop' | 'supplier' | null
  unit?: string
  pack_units?: Record<string, number> | null
  wholesale_price?: string | null
  min_price?: string | null
  promo_price?: string | null
  promo_from?: string | null
  promo_to?: string | null
  pricing_mode?: 'fixed' | 'markup'
  markup_pct?: string | null
  tax_rate?: string | null
  tax_inclusive?: boolean | null
  max_stock?: number | null
  location?: string | null
  show_in_sale?: boolean
  description?: string | null
  profit?: string | null
  margin_pct?: string | null
  stock_value?: string | null
  supplier_skus?: { party_id: string | null; party_name: string | null; sku: string }[]
  units?: Record<string, number>
}

export interface ItemOptions {
  valuation: 'avg' | 'fifo'
  allow_negative_stock: boolean
  units: Record<string, number>
  grades: string[]
  brands: string[]
  locations: string[]
}

export interface Batch {
  id: string
  date: string
  source: string
  document_type: string | null
  document_id: string | null
  party_id: string | null
  party_name: string | null
  qty_in: number
  qty_left: number
  unit_cost: string
  pack_unit: string | null
  pack_qty: number | null
  batch_ref: string | null
}

export type TimelineRow =
  | { kind: 'move'; at: string; reason: string; qty_delta: number; qty_after: number; unit_cost: string | null; document_type: string | null; document_id: string | null; doc_no: string | null; party_id: string | null; party_name: string | null; amount: string | null; paid: string | null; remaining: string | null }
  | { kind: 'price'; at: string; field: string; old: string | null; new: string | null; source: string }

export interface PriceFor { price: string; tier: 'retail' | 'wholesale' | 'promo'; min_price: string | null; qty: number; warranty_days: number }

/** the known units in order; the shop's own extra units follow */
export const UNIT_ORDER = ['piece', 'dozen', 'box', 'carton']

export function unitLabel(pick: (k: string) => string, unit: string, exists: (k: string) => boolean): string {
  return exists(`acc.units.${unit}`) ? pick(`acc.units.${unit}`) : unit
}

export function gradeLabel(pick: (k: string) => string, grade: string, exists: (k: string) => boolean): string {
  return exists(`acc.grades.${grade}`) ? pick(`acc.grades.${grade}`) : grade
}
