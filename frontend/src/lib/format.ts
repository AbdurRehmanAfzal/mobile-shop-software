/** Money and number formatting. Always Latin digits, always PKR, 2 dp dropped when zero. */

const latin = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Rs. 0'
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return 'Rs. 0'
  const abs = Math.abs(n)
  const body = latin.format(abs)
  return n < 0 ? `-Rs. ${body}` : `Rs. ${body}`
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
