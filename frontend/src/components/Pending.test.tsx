import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/i18n'
import { Pending } from './ui'

afterEach(() => setLocale('ur'))

describe('Pending (report screens never load forever)', () => {
  it('shows the skeleton while there is no error', () => {
    render(<Pending error={null} />)
    expect(screen.queryByTestId('load-error')).not.toBeInTheDocument()
  })
  it('shows the reason and a working retry when the request failed', () => {
    setLocale('en')
    const retry = vi.fn()
    render(<Pending error={new Error('boom')} retry={retry} />)
    expect(screen.getByTestId('load-error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Try again'))
    expect(retry).toHaveBeenCalledOnce()
  })
})
