import { describe, expect, it } from 'vitest'
import { parseStorage } from './queries'

describe('parseStorage', () => {
  it('reads sizes the way shopkeepers type them', () => {
    expect(parseStorage('128')).toEqual({ name: '128GB', gigabytes: 128 })
    expect(parseStorage('256 gb')).toEqual({ name: '256GB', gigabytes: 256 })
    expect(parseStorage('1tb')).toEqual({ name: '1TB', gigabytes: 1024 })
    expect(parseStorage('4MB')).toEqual({ name: '4MB', gigabytes: 1 })
    expect(parseStorage('big')).toBeNull()
  })
})
