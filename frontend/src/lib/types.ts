/** API shapes (mirror backend schemas). Money arrives as strings ("1500.00"). */

export type UUID = string
export type Money = string

export type PartyKind = 'customer' | 'supplier' | 'shop' | 'technician'
export interface Party {
  id: UUID
  name: string
  name_ur: string | null
  phone: string
  alt_phone: string | null
  whatsapp: string | null
  cnic: string | null
  address: string | null
  city: string | null
  photo_path: string | null
  kinds: PartyKind[]
  notes: string | null
  balance: Money
  is_active: boolean
  created_at: string
}

export interface Brand {
  id: UUID
  name: string
  name_ur: string | null
  is_global: boolean
  model_count: number
}
export interface Model {
  id: UUID
  brand_id: UUID
  name: string
  name_ur: string | null
  reference_price: Money | null
  is_feature_phone: boolean
  is_global: boolean
}
export interface Storage {
  id: UUID
  name: string
  name_ur: string | null
  gigabytes: number
  is_global: boolean
}
export interface Colour {
  id: UUID
  name: string
  name_ur: string | null
  hex: string | null
  is_global: boolean
}

export type DeviceCondition = 'box_pack' | 'open_box' | 'used' | 'patched'
export type PtaStatus = 'pta_approved' | 'non_pta' | 'jv' | 'unknown'
export type DeviceStatus = 'in_stock' | 'on_loan' | 'with_customer_for_approval' | 'sold' | 'in_repair' | 'faulty' | 'returned_to_supplier'
export type VerificationStatus = 'not_required' | 'pending' | 'clear' | 'flagged'

export interface AccessoryItem {
  id?: UUID
  kind: 'box' | 'charger' | 'cable' | 'earphones' | 'airpods' | 'other'
  label?: string | null
  came_with: boolean
  condition?: string | null
  pending_from: 'none' | 'vendor' | 'shop'
  expected_at?: string | null
  delivered_at?: string | null
  given_at_sale?: boolean | null
  promised_to_customer_at?: string | null
  notes?: string | null
}

export interface Device {
  id: UUID
  imei1: string
  imei2: string | null
  serial: string | null
  brand_id: UUID
  brand_name: string
  model_id: UUID
  model_name: string
  storage_id: UUID | null
  storage_name: string | null
  colour_id: UUID | null
  colour_name: string | null
  condition: DeviceCondition
  pta_status: PtaStatus
  sim_time_months: number | null
  warranty_months: number
  warranty_start: string | null
  patch_details: string | null
  notes: string | null
  photos: string[]
  status: DeviceStatus
  current_party_id: UUID | null
  current_party_name: string | null
  verification_status: VerificationStatus
  cost_price: Money | null
  asking_price: Money | null
  cycle_no: number
  first_seen_at: string
  last_event_at: string
  event_count: number
  imei_luhn_ok: boolean
}
export interface DeviceDetail extends Device {
  accessories: AccessoryItem[]
  recent_events: DeviceEvent[]
}
export interface DeviceEvent {
  id: UUID
  seq: number
  type: string
  status_after: DeviceStatus
  party_id: UUID | null
  party_name: string | null
  amount: Money | null
  document_type: string | null
  document_id: UUID | null
  data: Record<string, unknown> | null
  user_name: string | null
  at: string
}
export interface ImeiLookup {
  found: boolean
  device: Device | null
  seen_before: boolean
  times_bought: number
  luhn_ok: boolean
}

export interface Verification {
  id: UUID
  device_id: UUID
  cycle_no: number
  seller_party_id: UUID | null
  cnic_no: string | null
  cnic_front_path: string | null
  cnic_back_path: string | null
  seller_photo_path: string | null
  device_photos: string[]
  egadget_result: 'clear' | 'flagged' | 'not_checked'
  egadget_ref: string | null
  egadget_screenshot_path: string | null
  pta_checked: boolean
  pta_result: PtaStatus | null
  declaration_signed: boolean
  declaration_path: string | null
  physical_notes: string | null
  result: 'pending' | 'clear' | 'flagged'
  missing: string[]
  override_reason: string | null
}

export interface CashAccount {
  id: UUID
  kind: 'cash' | 'bank' | 'easypaisa' | 'jazzcash'
  name: string
  name_ur: string | null
  is_default: boolean
  balance: Money
}

export interface StatementRow {
  entry_id: UUID
  group_id: UUID
  at: string
  document_type: string
  document_id: UUID | null
  memo: string | null
  debit: Money
  credit: Money
  balance: Money
  reversed: boolean
}
export interface Statement {
  party_id: UUID
  opening_balance: Money
  closing_balance: Money
  rows: StatementRow[]
}

export interface PurchaseLine {
  id: UUID
  line_no: number
  kind: 'device' | 'misc'
  device_id: UUID | null
  imei1: string | null
  device_label: string | null
  description: string | null
  qty: number
  unit_cost: Money
  discount_share: Money
  net_cost: Money
  returned_at: string | null
}
export interface Purchase {
  id: UUID
  no: string
  kind: 'supplier' | 'walk_in' | 'shop' | 'trade_in'
  party_id: UUID
  party_name: string | null
  date: string
  subtotal: Money
  discount: Money
  total: Money
  paid: Money
  returned_total: Money
  balance_due: Money
  status: 'posted' | 'voided'
  created_at: string
  lines: PurchaseLine[]
}

export interface InvoiceLine {
  id: UUID
  line_no: number
  kind: 'device' | 'misc'
  device_id: UUID | null
  imei1: string | null
  device_label: string | null
  description: string | null
  qty: number
  unit_price: Money
  discount_share: Money
  tax_share: Money
  line_total: Money
  cost: Money | null
  profit: Money | null
  warranty_days: number
  accessories_given: string[]
  accessories_pending: { kind: string; label?: string | null; promised_at?: string | null }[]
  returned_at: string | null
}
export interface Invoice {
  id: UUID
  no: string
  party_id: UUID | null
  party_name: string | null
  party_balance_after: Money | null
  date: string
  subtotal: Money
  discount: Money
  tax_rate: Money
  tax_inclusive: boolean
  tax_amount: Money
  total: Money
  paid: Money
  returned_total: Money
  balance_due: Money
  cost_total: Money | null
  profit: Money | null
  status: 'open' | 'partially_paid' | 'paid' | 'returned' | 'void'
  loan_id: UUID | null
  created_at: string
  lines: InvoiceLine[]
}

export interface Payment {
  id: UUID
  no: string
  party_id: UUID
  party_name: string | null
  party_balance_after: Money | null
  direction: 'in' | 'out'
  amount: Money
  method: string
  reference: string | null
  date: string
  allocations: { document_type: string; document_id: UUID; document_no: string | null; amount: Money }[]
  unallocated: Money
  status: string
  created_at: string
}

export interface Loan {
  id: UUID
  device_id: UUID
  imei1: string | null
  device_label: string | null
  party_id: UUID
  party_name: string | null
  out_at: string
  expected_back_at: string | null
  overdue: boolean
  status: 'out' | 'returned' | 'sold'
  invoice_id: UUID | null
  notes: string | null
}

export interface ReturnDoc {
  id: UUID
  no: string
  kind: 'sale' | 'purchase'
  document_no: string
  party_name: string | null
  party_balance_after: Money | null
  date: string
  amount: Money
  settlement: 'refund' | 'credit' | 'income'
  refund_amount: Money
  kept_amount: Money
  created_at: string
}

export interface NotificationSettings {
  owner_whatsapp: string | null
  owner_email: string | null
  owner_on_sale_whatsapp: boolean
  owner_on_sale_email: boolean
  owner_on_purchase_whatsapp: boolean
  owner_on_purchase_email: boolean
  customer_on_sale_whatsapp: boolean
  customer_on_sale_email: boolean
  seller_on_purchase_whatsapp: boolean
  seller_on_purchase_email: boolean
  customer_on_payment_whatsapp: boolean
  language: 'en' | 'ur' | null
}
export interface Message {
  id: UUID
  channel: 'whatsapp' | 'email'
  audience: 'owner' | 'customer'
  recipient: string
  lang: string
  subject: string | null
  body: string
  link: string | null
  event_type: string
  status: string
  created_at: string
}
