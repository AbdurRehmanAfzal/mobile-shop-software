/** Mobile numbers of any country (owner 2026-11-18, ADR-107). A Pakistani number is kept as it
 *  always was — 03XXXXXXXXX; a number of another country is kept with its country code —
 *  +971501234567. The server applies the same rule (`backend/app/core/pk.py`); a server test reads
 *  this file and keeps the two tables equal. */

import { toLatinDigits } from './format'

export interface Country {
  iso: string
  dial: string
  /** digits after the country code, without a leading 0 */
  min: number
  max: number
  /** how people of that country write a mobile number (after the code) */
  example?: string
}

const OTHER_MIN = 4
const OTHER_MAX = 13

/** [iso, dial, min, max, example] — the lengths the server also knows for certain */
const KNOWN: [string, string, number, number, string][] = [
  ['PK', '92', 10, 10, '300 1234567'],
  ['AE', '971', 9, 9, '50 123 4567'],
  ['SA', '966', 9, 9, '50 123 4567'],
  ['AF', '93', 9, 9, '70 123 4567'],
  ['GB', '44', 10, 10, '7911 123456'],
  ['US', '1', 10, 10, '415 555 2671'],
  ['CA', '1', 10, 10, '416 555 0123'],
  ['QA', '974', 8, 8, '3312 3456'],
  ['OM', '968', 8, 8, '9212 3456'],
  ['KW', '965', 8, 8, '5001 2345'],
  ['BH', '973', 8, 8, '3600 1234'],
  ['CN', '86', 11, 11, '138 0013 8000'],
  ['MY', '60', 9, 10, '12 345 6789'],
  ['TR', '90', 10, 10, '501 234 5678'],
  ['IR', '98', 10, 10, '912 345 6789'],
  ['IN', '91', 10, 10, '98765 43210'],
  ['BD', '880', 10, 10, '1712 345678'],
  ['DE', '49', 10, 11, '151 23456789'],
  ['IT', '39', 9, 10, '312 345 6789'],
  ['ES', '34', 9, 9, '612 345 678'],
  ['FR', '33', 9, 9, '6 12 34 56 78'],
  ['AU', '61', 9, 9, '412 345 678'],
  ['SG', '65', 8, 8, '8123 4567'],
  ['HK', '852', 8, 8, '5123 4567'],
  ['LK', '94', 9, 9, '71 234 5678'],
  ['NP', '977', 10, 10, '984 1234567'],
  ['RU', '7', 10, 10, '912 345 6789'],
  ['KZ', '7', 10, 10, '701 234 5678'],
  ['IQ', '964', 10, 10, '790 123 4567'],
  ['JO', '962', 9, 9, '7 9012 3456'],
  ['EG', '20', 10, 10, '100 123 4567'],
  ['ZA', '27', 9, 9, '71 123 4567'],
  ['NL', '31', 9, 9, '6 12345678'],
  ['NO', '47', 8, 8, '412 34 567'],
  ['GR', '30', 10, 10, '691 234 5678'],
  ['IE', '353', 9, 9, '85 123 4567'],
]

/** every other country: "ISO dial" */
const OTHERS =
  'AD 376,AL 355,AM 374,AO 244,AR 54,AT 43,AW 297,AZ 994,BA 387,BE 32,BF 226,BG 359,BI 257,BJ 229,BN 673,BO 591,BR 55,BT 975,BW 267,BY 375,BZ 501,' +
  'CD 243,CF 236,CG 242,CH 41,CI 225,CK 682,CL 56,CM 237,CO 57,CR 506,CU 53,CV 238,CW 599,CY 357,CZ 420,DJ 253,DK 45,DZ 213,EC 593,EE 372,ER 291,ET 251,' +
  'FI 358,FJ 679,FK 500,FM 691,FO 298,GA 241,GE 995,GF 594,GH 233,GI 350,GL 299,GM 220,GN 224,GP 590,GQ 240,GT 502,GW 245,GY 592,HN 504,HR 385,HT 509,HU 36,' +
  'ID 62,IL 972,IO 246,IS 354,JP 81,KE 254,KG 996,KH 855,KI 686,KM 269,KP 850,KR 82,LA 856,LB 961,LI 423,LR 231,LS 266,LT 370,LU 352,LV 371,LY 218,' +
  'MA 212,MC 377,MD 373,ME 382,MG 261,MH 692,MK 389,ML 223,MM 95,MN 976,MO 853,MQ 596,MR 222,MT 356,MU 230,MV 960,MW 265,MX 52,MZ 258,' +
  'NA 264,NC 687,NE 227,NF 672,NG 234,NI 505,NR 674,NU 683,NZ 64,PA 507,PE 51,PF 689,PG 675,PH 63,PL 48,PM 508,PS 970,PT 351,PW 680,PY 595,' +
  'RE 262,RO 40,RS 381,RW 250,SB 677,SC 248,SD 249,SE 46,SH 290,SI 386,SK 421,SL 232,SM 378,SN 221,SO 252,SR 597,SS 211,ST 239,SV 503,SY 963,SZ 268,' +
  'TD 235,TG 228,TH 66,TJ 992,TK 690,TL 670,TM 993,TN 216,TO 676,TV 688,TW 886,TZ 255,UA 380,UG 256,UY 598,UZ 998,VE 58,VN 84,VU 678,WF 681,WS 685,XK 383,YE 967,ZM 260,ZW 263'

/** The countries a Pakistani shop meets most come first (in this order); the rest follow by name. */
export const FEATURED = 17
export const COUNTRIES: Country[] = [
  ...KNOWN.map(([iso, dial, min, max, example]) => ({ iso, dial, min, max, example })),
  ...OTHERS.split(',').map((s) => { const [iso, dial] = s.split(' '); return { iso, dial, min: OTHER_MIN, max: OTHER_MAX } }),
]
export const PK = COUNTRIES[0]

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]))
/** the first country of a calling code: +1 → United States, +7 → Russia */
const BY_DIAL = new Map<string, Country>()
for (const c of COUNTRIES) if (!BY_DIAL.has(c.dial)) BY_DIAL.set(c.dial, c)

export const countryByIso = (iso: string): Country => BY_ISO.get(iso) ?? PK

const digitsOf = (s: string) => toLatinDigits(s).replace(/\D/g, '')
const clean = (s: string) => toLatinDigits(s).replace(/[\s\-().]/g, '')

/** "+971 50 1234567" / "00971501234567" → its country and the digits after the code; null when the
 *  text does not begin with a known country code */
export function parseInternational(raw: string): { country: Country; national: string } | null {
  const s = clean(raw)
  const full = s.startsWith('+') ? digitsOf(s) : s.startsWith('00') ? digitsOf(s).slice(2) : ''
  if (!full) return null
  for (const n of [1, 2, 3]) {
    const c = BY_DIAL.get(full.slice(0, n))
    if (c) return { country: c, national: full.slice(n).replace(/^0+/, '') }
  }
  return null
}

/** "03001234567", "+92 300 1234567", "3001234567" → "3001234567" (at most 10 digits) */
export function localMobile(raw: string): string {
  let d = digitsOf(raw)
  if (d.startsWith('0092')) d = d.slice(4)
  else if (d.startsWith('92') && d.length > 10) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

/** the country of a stored number: "+971…" → UAE, anything else → Pakistan */
export function countryOf(value: string): Country {
  const p = value.trim().startsWith('+') ? parseInternational(value) : null
  return p ? p.country : PK
}

/** the digits after the country code of a stored number */
export function nationalOf(value: string): string {
  const p = value.trim().startsWith('+') ? parseInternational(value) : null
  return p && p.country.dial !== PK.dial ? p.national : localMobile(value)
}

/** country + the digits typed → the number as it is stored ('' when nothing is typed) */
export function compose(c: Country, national: string): string {
  if (c.dial === PK.dial) { const d = localMobile(national); return d ? `0${d}` : '' }
  const d = digitsOf(national).replace(/^0+/, '').slice(0, c.max)
  return d ? `+${c.dial}${d}` : ''
}

/** Any way of writing a number → the stored form (mirrors the server's `normalise_phone`). */
export function normalisePhone(raw: string): string {
  const p = parseInternational(raw)
  if (p && p.country.dial !== PK.dial) return `+${p.country.dial}${p.national}`
  let digits = clean(raw)
  if (digits.startsWith('+92')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('0092')) digits = '0' + digits.slice(4)
  else if (digits.startsWith('92') && digits.length === 12) digits = '0' + digits.slice(2)
  else if (digits.startsWith('3') && digits.length === 10) digits = '0' + digits
  return digits
}

/** a complete mobile number: Pakistani (03 + 9 digits) or another country's with the right length */
export function isValidMobile(raw: string): boolean {
  const v = normalisePhone(raw)
  if (!v.startsWith('+')) return /^03\d{9}$/.test(v)
  const p = parseInternational(v)
  if (!p) return false
  const n = p.national.length
  return n >= p.country.min && n <= p.country.max && p.country.dial.length + n <= 15
}

/** A number as WhatsApp links want it — country code first, no "+": 03001234567 → 923001234567,
 *  +971501234567 → 971501234567. '' when there is no number. */
export function waNumber(phone: string | null | undefined): string {
  const v = (phone ?? '').trim()
  if (!v) return ''
  const d = digitsOf(v)
  if (v.startsWith('+')) return d
  if (d.startsWith('0092')) return d.slice(2)
  if (d.startsWith('92') && d.length === 12) return d
  return `92${d.replace(/^0/, '')}`
}

/** The country's name in the app's language (the browser knows them); the ISO code if it does not. */
export function countryName(iso: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale === 'ur' ? 'ur' : 'en'], { type: 'region' }).of(iso) ?? iso
  } catch {
    return iso
  }
}
