import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.json'
import roman from '@/i18n/locales/roman.json'
import ur from '@/i18n/locales/ur.json'
import routerSource from '@/app/router.tsx?raw'
import { GROUPS, REPORTS, reportsFor } from './catalog'

const P = { from: '2026-11-01', to: '2026-11-19' }
type Hub = { r: Record<string, { t: string; d: string }>; g: Record<string, string> }
const all = () => true

describe('the list of every report (ADR-111)', () => {
  it('every report has a name and a line in three languages, and no name is left over', () => {
    for (const [lang, loc] of Object.entries({ en, ur, roman })) {
      const hub = (loc as unknown as { hub: Hub }).hub
      for (const r of REPORTS) {
        expect(hub.r[r.id]?.t, `${lang} ${r.id}`).toBeTruthy()
        expect(hub.r[r.id]?.d, `${lang} ${r.id}`).toBeTruthy()
      }
      expect(Object.keys(hub.r).sort()).toEqual(REPORTS.map((r) => r.id).sort())
      for (const g of GROUPS) expect(hub.g[g], `${lang} ${g}`).toBeTruthy()
    }
  })

  it('no report twice, and each opens a screen the app has', () => {
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length)
    const routes = [...routerSource.matchAll(/path: '([^']+)'/g)].map((m) => m[1])
    for (const r of REPORTS) {
      const path = r.to(P).split('?')[0]
      expect(routes, r.id).toContain(path)
      if (r.download) expect(r.download.path(P)).toMatch(/^\/api\/v1\/exports\//)
    }
  })

  it('the dates picked reach the hisaab, the audit and the dated downloads', () => {
    const by = (id: string) => REPORTS.find((r) => r.id === id)!
    expect(by('day').to(P)).toBe('/hisaab?from=2026-11-01&to=2026-11-19')
    expect(by('audit').to(P)).toBe('/audit?preset=custom&date_from=2026-11-01&date_to=2026-11-19')
    expect(by('sales').download!.path(P)).toBe('/api/v1/exports/sales?date_from=2026-11-01&date_to=2026-11-19')
    expect(by('khata').download!.path(P)).toBe('/api/v1/exports/khata')
  })

  it('each person sees the reports he may open', () => {
    const ids = (v: Parameters<typeof reportsFor>[0]) => reportsFor(v).map((r) => r.id)
    const owner = ids({ role: 'owner', has: all, shops: 1, devices: true })
    expect(owner).toEqual(expect.arrayContaining(['day', 'tally', 'khata', 'profit', 'security', 'logins', 'accounts']))
    expect(owner).not.toContain('transfers') // one shop: nothing to transfer
    expect(ids({ role: 'owner', has: all, shops: 2, devices: true })).toContain('transfers')
    // a salesman: the daily lists, nothing with cost, profit or other people's work
    const salesman = ids({ role: 'salesman', has: all, shops: 1, devices: true })
    expect(salesman).toEqual(expect.arrayContaining(['day', 'tally', 'khata', 'sales', 'purchases', 'returns', 'stock', 'invoices']))
    for (const no of ['profit', 'cash', 'accounts', 'staff', 'security', 'balances', 'audit', 'lending']) expect(salesman).not.toContain(no)
    const manager = ids({ role: 'manager', has: all, shops: 1, devices: true })
    expect(manager).toContain('profit')
    expect(manager).not.toContain('security')
    // a shop on the basic plan (no reports module): the daily reports stay
    const basic = ids({ role: 'owner', has: (m) => ['accessories', 'expenses'].includes(m), shops: 1, devices: true })
    expect(basic).toEqual(expect.arrayContaining(['day', 'tally', 'khata', 'sales', 'expenses', 'cash', 'items']))
    for (const no of ['profit', 'audit', 'ledger', 'installments', 'reminders', 'repairs']) expect(basic).not.toContain(no)
    // an accessories-only shop: no phone reports
    const acc = ids({ role: 'owner', has: all, shops: 1, devices: false })
    for (const no of ['tally', 'stock', 'itemSheet', 'oldStock', 'byType', 'prices']) expect(acc).not.toContain(no)
    expect(acc).toEqual(expect.arrayContaining(['items', 'worth', 'sales', 'profit']))
  })
})
