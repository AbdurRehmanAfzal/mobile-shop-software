/** Inputs that cannot take a wrong shape (owner, 2026-10-27): a mobile number with its country code
 *  in front (+92 unless another country is picked — ADR-107), a CNIC that stops at 13 digits and adds its own dashes, and an IMEI that stops at 15. */

import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { ScanButton } from './ScanButton'
import { BiInput, BiLabel, useLang, type BiInputProps } from './Bilingual'
import Help from './Help'
import { toLatinDigits } from '@/lib/format'
import { COUNTRIES, FEATURED, compose, countryByIso, countryName, countryOf, isValidMobile, localMobile, nationalOf, parseInternational } from '@/lib/phone'

type Base = Omit<BiInputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> & {
  value: string
  onChange: (value: string) => void
}

const digits = (s: string) => toLatinDigits(s).replace(/\D/g, '')

export { localMobile }

/** a complete mobile number: Pakistani, or another country's written with its code */
export const isMobileOk = (v: string) => isValidMobile(v)

/** The country code in front (tap it to pick another country), the number after it. The parent gets
 *  a Pakistani number as 03XXXXXXXXX and any other as +<code><number> ('' when empty) — ADR-107.
 *  `help`: the "?" beside the label (docs/33); a mobile-number one by default, `null` for none. */
export function PhoneInput({ label, value, onChange, error, id, required, help, ...rest }: Base) {
  const { pick, cls, dir, ur } = useLang()
  const [touched, setTouched] = useState(false)
  // the country stays picked while the box is still empty; a value from outside brings its own
  const [iso, setIso] = useState(() => countryOf(value).iso)
  const c = countryByIso(iso)
  useEffect(() => {
    if (value && countryOf(value).dial !== countryByIso(iso).dial) setIso(countryOf(value).iso)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const pk = c.iso === 'PK'
  const local = value ? nationalOf(value) : ''
  const bad = touched && local.length > 0 && !isValidMobile(compose(c, local))
  const shown = error ?? (bad ? (pk ? 'field.badMobile' : 'field.badMobileIntl') : null)
  const autoId = useId()
  const inputId = id ?? autoId
  const locale = ur ? 'ur' : 'en'
  const options = useMemo(() => {
    const named = COUNTRIES.map((x) => ({ ...x, name: countryName(x.iso, locale) }))
    return [...named.slice(0, FEATURED), ...named.slice(FEATURED).sort((a, b) => a.name.localeCompare(b.name, locale))]
  }, [locale])
  return (
    <div>
      <div className="flex items-center gap-1">
        <label htmlFor={inputId} className="block">
          <BiLabel text={label} size="md" tone="text-muted" />
        </label>
        {help === undefined ? <Help term="common.phone" size="sm" /> : help}
      </div>
      <div
        dir="ltr"
        className={`mt-1.5 flex min-h-14 w-full items-stretch overflow-hidden rounded-2xl border bg-surface focus-within:ring-2 ${
          shown ? 'border-payable focus-within:ring-payable/40' : 'border-line focus-within:border-emerald focus-within:ring-emerald/30'
        }`}
      >
        <span className="relative flex items-center gap-0.5 border-e border-line bg-ground ps-3 pe-1.5 text-muted">
          <span className="num text-lg font-bold" data-testid="phone-dial">+{c.dial}</span>
          <ChevronDown size={14} aria-hidden />
          <select
            aria-label={pick('field.country')}
            value={iso}
            onChange={(e) => { const next = countryByIso(e.target.value); setIso(next.iso); onChange(compose(next, next.iso === 'PK' ? local : local.slice(0, next.max))) }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            data-testid="phone-country"
          >
            {options.map((o) => <option key={o.iso} value={o.iso}>{`${o.name} (+${o.dial})`}</option>)}
          </select>
        </span>
        <input
          {...rest}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete={rest.autoComplete ?? 'tel-national'}
          placeholder={pk ? rest.placeholder ?? '3001234567' : c.example ?? ''}
          required={required}
          value={local}
          onChange={(e) => {
            // a whole number pasted with its code (+971 50 … or 00971…) picks its country itself
            const typed = toLatinDigits(e.target.value).trim()
            const whole = typed.startsWith('+') || typed.startsWith('00') ? parseInternational(typed) : null
            if (whole) { setIso(whole.country.iso); onChange(compose(whole.country, whole.national)); return }
            onChange(compose(c, e.target.value))
          }}
          onBlur={(e) => {
            setTouched(true)
            rest.onBlur?.(e)
          }}
          className="num min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold text-ink placeholder:font-medium placeholder:text-muted/60 focus:outline-none"
        />
      </div>
      {shown ? (
        <div className={`mt-1 font-semibold text-payable ${cls('sm')}`} dir={dir}>
          {pick(shown)}
        </div>
      ) : !pk ? (
        // another country: its name and how its numbers are written
        <div className={`mt-1 font-semibold text-muted ${cls('sm')}`} dir={dir} data-testid="phone-country-hint">
          {countryName(c.iso, locale)}{c.example ? <> · {pick('field.mobileEg')} <span dir="ltr" className="num">+{c.dial} {c.example}</span></> : null}
        </div>
      ) : null}
    </div>
  )
}

/** "3310012345671" -> "33100-1234567-1" while typing */
export function formatCnic(raw: string): string {
  const d = digits(raw).slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}

export const isCnicOk = (v: string) => digits(v).length === 13

/** `help`: a CNIC "?" by default (docs/33), `null` for none */
export function CnicInput({ value, onChange, error, help, ...rest }: Base) {
  const [touched, setTouched] = useState(false)
  const n = digits(value).length
  const bad = touched && n > 0 && n !== 13
  return (
    <BiInput
      {...rest}
      inputMode="numeric"
      help={help === undefined ? <Help term="common.cnic" size="sm" /> : help}
      placeholder={rest.placeholder ?? '33100-1234567-1'}
      maxLength={15}
      value={formatCnic(value)}
      onChange={(e) => onChange(formatCnic(e.target.value))}
      onBlur={(e) => { setTouched(true); rest.onBlur?.(e) }}
      error={error ?? (bad ? 'field.badCnic' : null)}
      className="num"
    />
  )
}

export const IMEI_LEN = 15
export const isImeiOk = (v: string) => digits(v).length === IMEI_LEN

/** IMEI: digits only, never more than 15, with a Scan button (camera / photo of the barcode) */
/** `help`: an IMEI "?" by default (docs/33), `null` for none */
export function ImeiInput({ value, onChange, error, scan = true, exclude, help, ...rest }: Base & { scan?: boolean; exclude?: string }) {
  const [touched, setTouched] = useState(false)
  const n = digits(value).length
  const bad = touched && n > 0 && n !== IMEI_LEN
  return (
    <BiInput
      {...rest}
      inputMode="numeric"
      maxLength={IMEI_LEN}
      help={help === undefined ? <Help term="imei" size="sm" /> : help}
      value={value}
      onChange={(e) => onChange(digits(e.target.value).slice(0, IMEI_LEN))}
      onBlur={(e) => { setTouched(true); rest.onBlur?.(e) }}
      error={error ?? (bad ? 'field.badImei' : null)}
      className="num"
      right={scan && !rest.disabled ? <ScanButton onImei={onChange} exclude={exclude || undefined} /> : undefined}
    />
  )
}
