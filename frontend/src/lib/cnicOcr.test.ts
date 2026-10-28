import { describe, expect, it } from 'vitest'
import { parseCnicText } from './cnicOcr'

// made-up card text, laid out the way OCR returns a CNIC front (no real person)
const FRONT = `PAKISTAN National Identity Card
ISLAMIC REPUBLIC OF PAKISTAN
Name
BILAL AHMED KHAN
Father Name
Muhammad Aslam Khan
Gender | Country of Stay
M Pakistan
Identity Number Date of Birth
35202-1234567-1 10.03.1990
Date of Issue Date of Expiry
05.06.2018 05.06.2028
Holder's Signature`

describe('reading a CNIC photo', () => {
  it('finds the number, names, gender and dates', () => {
    const d = parseCnicText(FRONT, new Date(2026, 9, 28))
    expect(d).toMatchObject({
      cnic: '35202-1234567-1',
      name: 'Bilal Ahmed Khan',
      fatherName: 'Muhammad Aslam Khan',
      gender: 'M',
      dob: '10.03.1990',
      issue: '05.06.2018',
      expiry: '05.06.2028',
      expired: false,
    })
  })

  it('warns about an expired card and copes with OCR slips', () => {
    const d = parseCnicText(FRONT.replace('05.06.2028', '05.06.2024').replace('35202-1234567-1', '35202 l234567 - 1'), new Date(2026, 9, 28))
    expect(d.expired).toBe(true)
    expect(d.cnic).toBe('35202-1234567-1')
  })

  it('separates the number from a date OCR glued to it', () => {
    expect(parseCnicText('Identity Number Date of Birth\n35202-1234567-10.03.1990\n').cnic).toBe('35202-1234567-1')
    const d = parseCnicText('Identity Number Date of Birth\n35202-1234567-110.03.1990\n05.06.2018 05.06.2032', new Date(2026, 9, 28))
    expect(d).toMatchObject({ cnic: '35202-1234567-1', dob: '10.03.1990', issue: '05.06.2018', expiry: '05.06.2032' })
  })

  it('reads a real-looking photo: crumbs around names, the father label not read', () => {
    const messy = ['TY i Name', 'me Bilal Ahmed Khan Ca |', 'Bly Muhammad Aslam A', '35202-1234567-1 ; 10.03.1990 oe oo', '05.06.2018 © 05.06.2032 em'].join('\n')
    expect(parseCnicText(messy, new Date(2026, 9, 28))).toMatchObject({
      name: 'Bilal Ahmed Khan',
      fatherName: 'Muhammad Aslam',
      dob: '10.03.1990',
      issue: '05.06.2018',
      expiry: '05.06.2032',
      expired: false,
    })
    // only two dates read: the past one is the issue date, not an expiry
    const two = parseCnicText('35202-1234567-1 10.03.1990\n05.06.2018', new Date(2026, 9, 28))
    expect(two).toMatchObject({ dob: '10.03.1990', issue: '05.06.2018' })
    expect(two.expired).toBeUndefined()
  })

  it('returns what it can from a poor photo', () => {
    expect(parseCnicText('blurry ... 352021234567 1 ...')).toEqual({ cnic: '35202-1234567-1' })
    expect(parseCnicText('nothing useful')).toEqual({})
  })
})
