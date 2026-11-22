import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/i18n'
import { Pills, SplitView, StatCard, TabStrip } from './kit'

afterEach(() => setLocale('ur'))

describe('the redesign parts (ADR-132)', () => {
  it('a figure card shows its label, figure and note, and is a button only when it can be tapped', () => {
    setLocale('en')
    const tap = vi.fn()
    render(<><StatCard label="nav.stock" value="12" note="pieces" testid="plain" /><StatCard label="nav.khata" value="5" onClick={tap} on testid="tap" /></>)
    expect(screen.getByTestId('plain').tagName).toBe('DIV')
    expect(screen.getByTestId('plain')).toHaveTextContent('Stock')
    expect(screen.getByTestId('plain')).toHaveTextContent('12')
    fireEvent.click(screen.getByTestId('tap'))
    expect(tap).toHaveBeenCalledOnce()
    expect(screen.getByTestId('tap')).toHaveAttribute('aria-pressed', 'true')
  })
  it('pills mark the chosen one and report a tap', () => {
    setLocale('en')
    const pickOne = vi.fn()
    render(<Pills options={[{ value: 'a', label: 'nav.stock', count: 3 }, { value: 'b', label: 'nav.more' }]} value="a" onChange={pickOne} />)
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[0]).toHaveTextContent('3')
    fireEvent.click(radios[1])
    expect(pickOne).toHaveBeenCalledWith('b')
  })
  it('tabs mark the open one', () => {
    setLocale('en')
    const go = vi.fn()
    render(<TabStrip tabs={[{ value: 'x', label: 'nav.stock' }, { value: 'y', label: 'nav.more' }]} value="y" onChange={go} />)
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getAllByRole('tab')[0])
    expect(go).toHaveBeenCalledWith('x')
  })
  it('on a phone the details take the place of the list while a row is open', () => {
    const { rerender } = render(<SplitView open={false} list={<p>list</p>} detail={<p>detail</p>} />)
    expect(screen.getByTestId('split-detail').className).toContain('max-lg:hidden')
    expect(screen.getByTestId('split-list').className).not.toContain('max-lg:hidden')
    rerender(<SplitView open list={<p>list</p>} detail={<p>detail</p>} />)
    expect(screen.getByTestId('split-list').className).toContain('max-lg:hidden')
    expect(screen.getByTestId('split-detail').className).not.toContain('max-lg:hidden')
  })
})
