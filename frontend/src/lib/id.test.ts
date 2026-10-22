import { afterEach, describe, expect, it } from 'vitest'
import { uid } from './id'

const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')

describe('uid', () => {
  afterEach(() => { if (original) Object.defineProperty(crypto, 'randomUUID', original) })
  it('works when randomUUID is missing (http on a phone over LAN)', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    const a = uid()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uid()).not.toBe(a)
  })
})
