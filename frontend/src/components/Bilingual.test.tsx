import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import { BiButton, BiLabel } from './Bilingual'

afterEach(() => setLocale('ur'))

describe('BiLabel (one language at a time)', () => {
  it('shows only Urdu in Urdu mode, RTL', () => {
    setLocale('ur')
    render(<BiLabel text="nav.sale" />)
    const ur = screen.getByText('فروخت')
    expect(ur).toHaveAttribute('dir', 'rtl')
    expect(ur).toHaveAttribute('lang', 'ur')
    expect(screen.queryByText('Sale')).not.toBeInTheDocument()
  })
  it('shows only English in English mode, LTR', () => {
    setLocale('en')
    render(<BiLabel text="nav.sale" />)
    expect(screen.getByText('Sale')).toHaveAttribute('dir', 'ltr')
    expect(screen.queryByText('فروخت')).not.toBeInTheDocument()
  })
  it('accepts explicit pairs', () => {
    setLocale('en')
    render(<BiLabel text={{ en: 'Hello', ur: 'سلام' }} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})

describe('BiButton', () => {
  it('is disabled while loading', () => {
    render(<BiButton text="common.save" loading />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
