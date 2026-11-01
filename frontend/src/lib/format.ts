/** Money and number formatting. Always Latin digits, always PKR, 2 dp dropped when zero. */

const latin = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** how the shop writes money (Settings → Currency, docs/30); always PKR underneath */
export interface Currency { symbol: string; position: 'before' | 'after'; decimals: 0 | 2 }
let CUR: Currency = { symbol: 'Rs.', position: 'before', decimals: 0 }
const fixed2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function setCurrency(c: Partial<Currency> | null | undefined) {
  CUR = { symbol: c?.symbol || 'Rs.', position: c?.position === 'after' ? 'after' : 'before', decimals: c?.decimals === 2 ? 2 : 0 }
}

/** the currency label alone, e.g. "Rs." or "PKR" */
export const cur = () => CUR.symbol

/** a number with the shop's currency label, e.g. "Rs. 45,000" or "45,000 PKR" */
export function withCur(body: string): string {
  return CUR.position === 'after' ? `${body} ${CUR.symbol}` : `${CUR.symbol} ${body}`
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return withCur('0')
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return withCur('0')
  const abs = Math.abs(n)
  const body = CUR.decimals === 2 ? fixed2.format(abs) : latin.format(abs)
  return n < 0 ? `-${withCur(body)}` : withCur(body)
}

/** Convert Arabic-Indic / Urdu digits typed by a user to Latin digits. */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/** Normalise a Pakistani mobile number to 03XXXXXXXXX (mirrors backend). */
export function normalisePhone(raw: string): string {
  let digits = toLatinDigits(raw).replace(/[\s\-()]/g, '')
  if (digits.startsWith('+92')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('92') && digits.length === 12) digits = '0' + digits.slice(2)
  else if (digits.startsWith('3') && digits.length === 10) digits = '0' + digits
  return digits
}

export function isValidPkMobile(raw: string): boolean {
  return /^03\d{9}$/.test(normalisePhone(raw))
}

/** 2,510,000 -> "25.1" (lakh), the way shopkeepers say big amounts. */
export function toLakh(value: number | string): string {
  const n = Number(value) / 100_000
  return latin.format(Math.round(n * 10) / 10)
}

/** Local calendar day as YYYY-MM-DD, `offset` days from today (-1 = yesterday). */
export function isoDay(offset = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Owner (2026-10-27): "from" may never be after "to", and neither may be after today.
 *  The date that was just moved gives way: a "from" past "to" becomes "to", and the other way round. */
export function clampRange(from: string, to: string, moved: 'from' | 'to' = 'from'): { from: string; to: string } {
  const today = isoDay(0)
  const f = from > today ? today : from
  const t = to > today ? today : to
  if (f <= t) return { from: f, to: t }
  return moved === 'from' ? { from: t, to: t } : { from: f, to: f }
}
