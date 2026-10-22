import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BiButton, BiLabel } from './Bilingual'

describe('BiLabel', () => {
  it('renders both English and Urdu for an i18n key, Urdu in RTL', () => {
    render(<BiLabel text="nav.sale" />)
    expect(screen.getByText('Sale')).toBeInTheDocument()
    const ur = screen.getByText('فروخت')
    expect(ur).toHaveAttribute('dir', 'rtl')
    expect(ur).toHaveAttribute('lang', 'ur')
  })
  it('renders explicit pairs', () => {
    render(<BiLabel text={{ en: 'Hello', ur: 'سلام' }} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('سلام')).toBeInTheDocument()
  })
})

describe('BiButton', () => {
  it('is disabled while loading', () => {
    render(<BiButton text="common.save" loading />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
