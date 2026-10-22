/**
 * Bilingual primitives built on the design tokens (docs/11-DESIGN-SYSTEM.md).
 * Rule: English eyebrow small on top, Urdu Nastaliq large below, Urdu always RTL,
 * numbers always Latin digits. Tap targets ≥ 44px.
 */

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { both } from '@/i18n'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const enSize: Record<Size, string> = { sm: 'text-[9px]', md: 'text-[10px]', lg: 'text-[11px]', xl: 'text-xs' }
const urSize: Record<Size, string> = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-lg', xl: 'text-2xl' }

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
  tone = 'text-ink',
  eyebrowTone = 'text-muted',
}: {
  text: string | BiText
  size?: Size
  align?: 'start' | 'center' | 'end'
  bold?: boolean
  className?: string
  tone?: string
  eyebrowTone?: string
}) {
  const { en, ur } = resolve(text)
  const alignCls = align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start'
  return (
    <div className={`leading-tight ${alignCls} ${className}`}>
      <div className={`eyebrow ${enSize[size]} ${eyebrowTone}`} dir="ltr">
        {en}
      </div>
      <div className={`ur -mt-0.5 ${urSize[size]} ${tone} ${bold ? 'font-bold' : ''}`} dir="rtl" lang="ur">
        {ur}
      </div>
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'
const variantCls: Record<Variant, string> = {
  primary: 'bg-emerald text-white shadow-cta',
  secondary: 'bg-surface text-ink border border-line',
  danger: 'bg-payable text-white',
  ghost: 'bg-transparent text-emerald',
  gold: 'bg-gold text-[#0E1613]',
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
  const dim = variant === 'primary' || variant === 'danger' ? 'text-white/75' : 'text-muted'
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`tap inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-2 font-semibold disabled:opacity-40 disabled:shadow-none ${variantCls[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="flex flex-col items-center leading-tight">
        <span className={`eyebrow ${enSize[size]} ${dim}`} dir="ltr">
          {loading ? '…' : en}
        </span>
        <span className={`ur -mt-0.5 ${urSize[size]}`} dir="rtl" lang="ur">
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
        dir={rest.dir ?? 'ltr'}
        className={`mt-1.5 block min-h-14 w-full rounded-2xl border bg-surface px-4 text-lg font-semibold text-ink placeholder:font-medium placeholder:text-muted/60 focus:outline-none focus:ring-2 ${
          err ? 'border-payable focus:ring-payable/40' : 'border-line focus:border-emerald focus:ring-emerald/30'
        } ${className}`}
      />
      {err ? (
        <div className="mt-1 text-payable">
          <span className="text-xs font-semibold" dir="ltr">
            {err.en}
          </span>
          <span className="ur ms-2 text-sm" dir="rtl">
            {err.ur}
          </span>
        </div>
      ) : hint ? (
        <BiLabel text={hint} size="sm" tone="text-muted" className="mt-1" />
      ) : null}
    </label>
  )
})

export function BiAlert({ text, kind = 'error' }: { text: BiText; kind?: 'error' | 'success' | 'info' }) {
  const cls =
    kind === 'error'
      ? 'bg-payable-tint/40 text-payable border-payable/30'
      : kind === 'success'
        ? 'bg-emerald-tint/50 text-emerald-deep border-emerald/30'
        : 'bg-surface text-ink border-line'
  return (
    <div role="alert" className={`rounded-2xl border px-4 py-3 ${cls}`}>
      <div className="text-sm font-semibold" dir="ltr">
        {text.en}
      </div>
      <div className="ur text-[15px]" dir="rtl" lang="ur">
        {text.ur}
      </div>
    </div>
  )
}

/** Segmented control, e.g. PTA / Non-PTA / JV or Cash / Easypaisa / Bank. */
export function BiSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; text: string | BiText }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      role="group"
      className="grid gap-1.5 rounded-2xl border border-line bg-surface p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const { en, ur } = resolve(o.text)
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`tap flex min-h-11 flex-col items-center justify-center rounded-xl text-[13px] font-bold ${
              on ? 'bg-ink text-ground' : 'text-muted'
            }`}
          >
            <span dir="ltr">{en}</span>
            <span className={`ur -mt-1 text-xs ${on ? 'text-gold-text' : ''}`} dir="rtl" lang="ur">
              {ur}
            </span>
          </button>
        )
      })}
    </div>
  )
}
