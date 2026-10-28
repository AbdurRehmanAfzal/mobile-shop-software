/** Inputs that cannot take a wrong shape (owner, 2026-10-27): a mobile number with +92 already in
 *  front, a CNIC that stops at 13 digits and adds its own dashes, and an IMEI that stops at 15. */

import { useId, useState } from 'react'
import { ScanButton } from './ScanButton'
import { BiInput, BiLabel, useLang, type BiInputProps } from './Bilingual'
import { toLatinDigits } from '@/lib/format'

type Base = Omit<BiInputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> & {
  value: string
  onChange: (value: string) => void
}

const digits = (s: string) => toLatinDigits(s).replace(/\D/g, '')

/** "03001234567", "+92 300 1234567", "3001234567" -> "3001234567" (at most 10 digits) */
export function localMobile(raw: string): string {
  let d = digits(raw)
  if (d.startsWith('0092')) d = d.slice(4)
  else if (d.startsWith('92') && d.length > 10) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

export const isMobileOk = (v: string) => /^3\d{9}$/.test(localMobile(v))

/** Shows +92 fixed in front; the parent gets the number as 03XXXXXXXXX ('' when empty). */
export function PhoneInput({ label, value, onChange, error, id, required, ...rest }: Base) {
  const { pick, cls, dir } = useLang()
  const [touched, setTouched] = useState(false)
  const local = localMobile(value)
  const bad = touched && local.length > 0 && !isMobileOk(local)
  const shown = error ?? (bad ? 'field.badMobile' : null)
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div>
      <label htmlFor={inputId} className="block">
        <BiLabel text={label} size="md" tone="text-muted" />
      </label>
      <div
        dir="ltr"
        className={`mt-1.5 flex min-h-14 w-full items-stretch overflow-hidden rounded-2xl border bg-surface focus-within:ring-2 ${
          shown ? 'border-payable focus-within:ring-payable/40' : 'border-line focus-within:border-emerald focus-within:ring-emerald/30'
        }`}
      >
        <span className="num flex items-center border-e border-line bg-ground px-3 text-lg font-bold text-muted">+92</span>
        <input
          {...rest}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete={rest.autoComplete ?? 'tel-national'}
          placeholder={rest.placeholder ?? '3001234567'}
          required={required}
          value={local}
          onChange={(e) => {
            const d = localMobile(e.target.value)
            onChange(d ? `0${d}` : '')
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

export function CnicInput({ value, onChange, error, ...rest }: Base) {
  const [touched, setTouched] = useState(false)
  const n = digits(value).length
  const bad = touched && n > 0 && n !== 13
  return (
    <BiInput
      {...rest}
      inputMode="numeric"
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
export function ImeiInput({ value, onChange, error, scan = true, exclude, ...rest }: Base & { scan?: boolean; exclude?: string }) {
  const [touched, setTouched] = useState(false)
  const n = digits(value).length
  const bad = touched && n > 0 && n !== IMEI_LEN
  return (
    <BiInput
      {...rest}
      inputMode="numeric"
      maxLength={IMEI_LEN}
      value={value}
      onChange={(e) => onChange(digits(e.target.value).slice(0, IMEI_LEN))}
      onBlur={(e) => { setTouched(true); rest.onBlur?.(e) }}
      error={error ?? (bad ? 'field.badImei' : null)}
      className="num"
      right={scan && !rest.disabled ? <ScanButton onImei={onChange} exclude={exclude || undefined} /> : undefined}
    />
  )
}
