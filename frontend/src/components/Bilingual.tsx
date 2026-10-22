/**
 * Bilingual primitives. Rule: English small on top, Urdu large below, Urdu always RTL,
 * numbers always Latin digits. Big tap targets for shopkeepers on phones.
 */

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { both } from '@/i18n'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const enSize: Record<Size, string> = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm', xl: 'text-base' }
const urSize: Record<Size, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-2xl' }

export interface BiText {
  en: string
  ur: string
}

/** Accept either an i18n key or an explicit {en, ur} pair. */
export function resolve(t: string | BiText): BiText {
  return typeof t === 'string' ? both(t) : t
}

export function BiLabel({
  text,
  size = 'md',
  align = 'start',
  bold = false,
  className = '',
  tone = 'text-slate-700',
}: {
  text: string | BiText
  size?: Size
  align?: 'start' | 'center' | 'end'
  bold?: boolean
  className?: string
  tone?: string
}) {
  const { en, ur } = resolve(text)
  const alignCls = align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start'
  return (
    <div className={`leading-tight ${alignCls} ${tone} ${className}`}>
      <div className={`${enSize[size]} uppercase tracking-wide opacity-70`} dir="ltr">
        {en}
      </div>
      <div className={`ur ${urSize[size]} ${bold ? 'font-bold' : ''}`} dir="rtl" lang="ur">
        {ur}
      </div>
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const variantCls: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 ring-brand-700',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
}

export interface BiButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  text: string | BiText
  variant?: Variant
  size?: Size
  full?: boolean
  loading?: boolean
  icon?: ReactNode
}

export function BiButton({
  text,
  variant = 'primary',
  size = 'lg',
  full = false,
  loading = false,
  icon,
  className = '',
  disabled,
  ...rest
}: BiButtonProps) {
  const { en, ur } = resolve(text)
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`tap inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-2 font-medium shadow-sm disabled:opacity-50 ${variantCls[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {icon ? <span className="text-xl">{icon}</span> : null}
      <span className="flex flex-col items-center leading-tight">
        <span className={`${enSize[size]} opacity-80`} dir="ltr">
          {loading ? '…' : en}
        </span>
        <span className={`ur ${urSize[size]}`} dir="rtl" lang="ur">
          {ur}
        </span>
      </span>
    </button>
  )
}

export interface BiInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string | BiText
  error?: string | BiText | null
  hint?: string | BiText
}

export const BiInput = forwardRef<HTMLInputElement, BiInputProps>(function BiInput(
  { label, error, hint, className = '', id, ...rest },
  ref,
) {
  const inputId = id ?? `in-${resolve(label).en.replace(/\W+/g, '-').toLowerCase()}`
  const err = error ? resolve(error) : null
  return (
    <label htmlFor={inputId} className="block">
      <BiLabel text={label} size="md" />
      <input
        ref={ref}
        id={inputId}
        {...rest}
        dir="ltr"
        className={`mt-1 block w-full rounded-xl border px-4 py-3 text-lg shadow-sm focus:outline-none focus:ring-2 ${
          err ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 focus:ring-brand-500'
        } ${className}`}
      />
      {err ? (
        <div className="mt-1 text-red-600">
          <span className="text-xs" dir="ltr">
            {err.en}
          </span>
          <span className="ur ms-2 text-sm" dir="rtl">
            {err.ur}
          </span>
        </div>
      ) : hint ? (
        <BiLabel text={hint} size="sm" tone="text-slate-500" className="mt-1" />
      ) : null}
    </label>
  )
})

export function BiAlert({ text, kind = 'error' }: { text: BiText; kind?: 'error' | 'success' | 'info' }) {
  const cls =
    kind === 'error'
      ? 'bg-red-50 text-red-800 ring-red-200'
      : kind === 'success'
        ? 'bg-brand-50 text-brand-800 ring-brand-100'
        : 'bg-sky-50 text-sky-800 ring-sky-200'
  return (
    <div role="alert" className={`rounded-xl px-4 py-3 ring-1 ${cls}`}>
      <div className="text-sm" dir="ltr">
        {text.en}
      </div>
      <div className="ur text-base" dir="rtl" lang="ur">
        {text.ur}
      </div>
    </div>
  )
}
