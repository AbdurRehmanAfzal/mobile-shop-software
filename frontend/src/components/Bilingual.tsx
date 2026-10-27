/**
 * Language-aware primitives built on the design tokens (docs/11-DESIGN-SYSTEM.md).
 * Rule (owner, 2026-10-22): ONE language at a time. Urdu mode shows only Urdu (Nastaliq, RTL);
 * English mode shows only English. Components accept an i18n key or an explicit {en, ur} pair.
 * Numbers are always Latin digits. Tap targets ≥ 44px.
 */

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { both } from '@/i18n'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const enSize: Record<Size, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base', xl: 'text-xl' }
const urSize: Record<Size, string> = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-lg', xl: 'text-2xl' }

export interface BiText {
  en: string
  ur: string
  /** Roman Urdu; when missing, Roman mode shows the English text */
  roman?: string
}

/** Accept either an i18n key or an explicit {en, ur} pair. */
export function resolve(t: string | BiText): BiText {
  return typeof t === 'string' ? both(t) : t
}

/** Pick the active language's string and its presentation classes. */
export function useLang() {
  const { i18n } = useTranslation()
  const ur = i18n.language === 'ur'
  const roman = i18n.language === 'roman'
  return {
    ur,
    roman,
    pick: (t: string | BiText) => {
      const r = resolve(t)
      return ur ? r.ur || r.en : roman ? r.roman || r.en : r.en || r.ur
    },
    cls: (size: Size) => (ur ? `ur ${urSize[size]}` : `${enSize[size]}`),
    dir: ur ? ('rtl' as const) : ('ltr' as const),
  }
}

export function BiLabel({
  text,
  size = 'md',
  align = 'start',
  bold = false,
  className = '',
  tone = 'text-ink',
}: {
  text: string | BiText
  size?: Size
  align?: 'start' | 'center' | 'end'
  bold?: boolean
  className?: string
  tone?: string
}) {
  const { pick, cls, dir, ur } = useLang()
  const alignCls = align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start'
  return (
    <div
      className={`${ur ? 'leading-[1.7]' : 'leading-tight'} ${alignCls} ${tone} ${cls(size)} ${bold ? (ur ? 'font-bold' : 'font-semibold') : ''} ${className}`}
      dir={dir}
      lang={ur ? 'ur' : 'en'}
    >
      {pick(text)}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'
const variantCls: Record<Variant, string> = {
  primary: 'bg-emerald text-white shadow-cta',
  secondary: 'bg-surface text-ink border border-line',
  danger: 'bg-payable text-white',
  // was a bare green text link; shopkeepers did not see it as a button (owner, 2026-10-26)
  ghost: 'border border-line bg-surface text-emerald-deep',
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
  const { pick, cls, dir, ur } = useLang()
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`tap inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-2 font-semibold disabled:opacity-40 disabled:shadow-none ${variantCls[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className={`leading-tight ${cls(size)}`} dir={dir} lang={ur ? 'ur' : 'en'}>
        {loading ? '…' : pick(text)}
      </span>
    </button>
  )
}

export interface BiInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string | BiText
  error?: string | BiText | null
  hint?: string | BiText
  /** a button beside the box, e.g. Scan */
  right?: ReactNode
}

export const BiInput = forwardRef<HTMLInputElement, BiInputProps>(function BiInput(
  { label, error, hint, right, className = '', id, ...rest },
  ref,
) {
  const inputId = id ?? `in-${resolve(label).en.replace(/\W+/g, '-').toLowerCase()}`
  const { pick, cls, dir } = useLang()
  return (
    // only the words are the <label>, so a button beside the box (Scan) is not part of its name
    <div>
      <label htmlFor={inputId} className="block">
        <BiLabel text={label} size="md" tone="text-muted" />
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          ref={ref}
          id={inputId}
          {...rest}
          dir={rest.dir ?? 'ltr'}
          className={`block min-h-14 w-full min-w-0 flex-1 rounded-2xl border bg-surface px-4 text-lg font-semibold text-ink placeholder:font-medium placeholder:text-muted/60 focus:outline-none focus:ring-2 ${
            error ? 'border-payable focus:ring-payable/40' : 'border-line focus:border-emerald focus:ring-emerald/30'
          } ${className}`}
        />
        {right}
      </div>
      {error ? (
        <div className={`mt-1 font-semibold text-payable ${cls('sm')}`} dir={dir}>
          {pick(error)}
        </div>
      ) : hint ? (
        <BiLabel text={hint} size="sm" tone="text-muted" className="mt-1" />
      ) : null}
    </div>
  )
})

export function BiAlert({ text, kind = 'error' }: { text: string | BiText; kind?: 'error' | 'success' | 'info' }) {
  const { pick, cls, dir } = useLang()
  const tone =
    kind === 'error'
      ? 'bg-payable-tint/40 text-payable border-payable/30'
      : kind === 'success'
        ? 'bg-emerald-tint/50 text-emerald-deep border-emerald/30'
        : 'bg-surface text-ink border-line'
  return (
    <div role="alert" className={`rounded-2xl border px-4 py-3 font-semibold ${tone} ${cls('md')}`} dir={dir}>
      {pick(text)}
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
  const { pick, cls, dir } = useLang()
  return (
    <div
      role="group"
      className="grid gap-1.5 rounded-2xl border border-line bg-surface p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      dir={dir}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`tap flex min-h-11 items-center justify-center rounded-xl font-bold ${cls('sm')} ${
              on ? 'bg-ink text-ground' : 'text-muted'
            }`}
          >
            {pick(o.text)}
          </button>
        )
      })}
    </div>
  )
}
