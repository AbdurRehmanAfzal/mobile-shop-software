// Screenshots for the super-admin manual (owner 2026-11-03): the Super admin screen and the provider
// console, scrolled top to bottom, plus the sheets that open from them. Needs the backend (:8000) and
// the frontend (:5173), and SUPER_PHONE in the backend's SUPERUSER_PHONES.
//   SUPER_PHONE=03990000099 SUPER_PASS=... node scripts/manual-admin-shots.mjs [en,roman]
// Writes docs/manual/img/<lang>/admin-NN.jpg (Super admin, scrolled), business-<tab>-N.jpg
// (provider console tabs), admin-shop / admin-billing / admin-more / admin-newshop.jpg.

import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:8000/api/v1'
const OUT = join(process.cwd(), '..', 'docs', 'manual', 'img')
const PHONE = process.env.SUPER_PHONE ?? '03990000099'
const PASS = process.env.SUPER_PASS ?? 'super-secret-1'
const LANGS = (process.argv[2] ?? 'en,roman').split(',')
const post = (p, body) => fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// the super user exists (a fresh database has no one), and a website request is waiting
await post('/auth/signup', { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: PHONE, password: PASS })
const REQ_PHONE = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
await post('/public/shop-requests', { name: 'Hamza Iqbal', shop_name: 'Hamza Mobile Centre', city: 'Multan', phone: REQ_PHONE, plan: 'pro' }).catch(() => undefined)

const browser = await chromium.launch()
for (const lang of LANGS) {
  const dir = join(OUT, lang)
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.addInitScript((l) => localStorage.setItem('locale', l), lang)
  const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 82 }); console.log(lang, name) }
  const tryShot = async (name, fn) => { try { await fn(); await shot(name) } catch (e) { console.log(lang, name, 'SKIPPED', String(e).split('\n')[0]) } }

  await page.goto(`${WEB}/login`)
  await page.locator('input[type="tel"]').first().fill(PHONE)
  await page.locator('input[type="password"]').fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/$/)

  // a page, top to bottom, one phone screen at a time
  const walk = async (prefix, path) => {
    await page.goto(`${WEB}${path}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    let n = 1
    for (let y = 0; y < total && n <= 14; y += 640, n++) {
      await page.evaluate((v) => window.scrollTo(0, v), y)
      await shot(`${prefix}-${String(n).padStart(2, '0')}`)
    }
  }
  await walk('admin', '/admin')
  // the provider console: each tab top to bottom
  const tabs = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8')).prov.tab
  for (const tab of ['overview', 'shops', 'payments', 'keys']) {
    await page.goto(`${WEB}/admin/business`); await page.waitForLoadState('networkidle')
    await page.getByTestId('provider-page').getByRole('button', { name: tabs[tab], exact: true }).first().click()
    await page.waitForLoadState('networkidle')
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    let n = 1
    for (let y = 0; y < total && n <= 4; y += 640, n++) {
      await page.evaluate((v) => window.scrollTo(0, v), y)
      await shot(`business-${tab}-${n}`)
    }
    if (tab === 'shops') await tryShot('admin-shop', () => page.getByTestId('prov-shops').locator('button').first().click())
    if (tab === 'keys') await tryShot('admin-key', async () => { await page.evaluate(() => window.scrollTo(0, 0)); await page.getByTestId('make-key').click() })
  }

  await page.goto(`${WEB}/admin`); await page.waitForLoadState('networkidle')
  await tryShot('admin-billing', () => page.getByTestId('billing-open').first().click())
  await page.goto(`${WEB}/more`); await page.waitForLoadState('networkidle')
  await tryShot('admin-more', () => page.evaluate(() => window.scrollTo(0, 0)))
  const L = JSON.parse(readFileSync(`src/i18n/locales/${lang}.json`, 'utf8'))
  await page.goto(`${WEB}/admin`); await page.waitForLoadState('networkidle')
  await tryShot('admin-newshop', () => page.getByRole('button', { name: L.admin.newShop }).first().click())
  await ctx.close()
}
await browser.close()

// close the sample request again: an open one would sit in the real request list (and in the e2e tests)
const login = await (await post('/auth/login', { phone: PHONE, password: PASS })).json()
const auth = { Authorization: `Bearer ${login.tokens.access_token}` }
const open = await (await fetch(`${API}/admin/shop-requests?open_only=true`, { headers: auth })).json()
for (const r of open.filter((x) => x.phone === REQ_PHONE)) await fetch(`${API}/admin/shop-requests/${r.id}/done`, { method: 'POST', headers: auth })
