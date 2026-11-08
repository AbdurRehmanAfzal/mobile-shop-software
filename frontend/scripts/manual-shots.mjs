// Screenshots for the user manual (owner 2026-11-03): every module, in English, Urdu and Roman Urdu,
// from a demo shop made by scripts/demo-shop.mjs. Run with the backend on :8000 and the frontend on
// :5173:   node scripts/manual-shots.mjs
// Writes docs/manual/img/<lang>/<name>.jpg (the names are listed in docs/manual/SHOTS.md).

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:8000/api/v1'
const OUT = join(process.cwd(), '..', 'docs', 'manual', 'img')
const PHONE = `037${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const PASS = 'demo12345'
const LANGS = (process.argv[2] ?? 'en,ur,roman').split(',')
// ONLY=sale-done,payment retakes just those shots
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null

// 1. a full demo shop through the real API
execFileSync(process.execPath, ['scripts/demo-shop.mjs'], { env: { ...process.env, PHONE, PASS, SHOP: 'Al-Madina Mobile Zone' }, stdio: 'inherit' })

// 2. what the screens need from it
const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: PHONE, password: PASS }) })).json()
const shopId = login.me.active_shop_id ?? login.me.shops?.[0]?.id
const H = { Authorization: `Bearer ${login.tokens.access_token}`, 'X-Shop-Id': shopId }
const get = async (p) => (await fetch(`${API}${p}`, { headers: H })).json()
const parties = await get('/parties?limit=200')
const party = (n) => parties.find((p) => p.name.startsWith(n))?.id
const devices = await get('/devices?limit=200')
const list = Array.isArray(devices) ? devices : devices.items ?? devices.rows ?? []
const used = list.find((d) => d.condition === 'used' && d.status === 'in_stock') ?? list[0]
const anyDevice = list.find((d) => d.status === 'in_stock') ?? list[0]
const repairs = await get('/repairs?open_only=true')
const atLab = repairs.find((r) => r.at_lab) ?? repairs[0]
const labs = await get('/repairs/labs')
const lab = labs.find((l) => l.sent) ?? labs[0]
const items = await get('/accessories')
const item = items.find((a) => /cable/i.test(a.name)) ?? items[0]
const sales = await get('/sales?limit=20')
const saleRows = Array.isArray(sales) ? sales : sales.items ?? []
const sale = saleRows.find((s) => s.status !== 'void' && Number(s.returned_total ?? 0) === 0 && s.party_id) ?? saleRows.find((s) => s.status !== 'void') ?? saleRows[0]
const ids = { used: used?.id, device: anyDevice?.id, repair: atLab?.id, lab: lab?.party_id, item: item?.id, sale: sale?.id, tariq: party('Tariq'), bilal: party('Bilal') }
console.log('ids', ids)
// the bill's QR link (signed with the backend's own secret, as the printed bill does)
let billToken = ''
try {
  if (ids.sale) billToken = execFileSync(join('..', 'backend', '.venv', 'Scripts', 'python'), ['-c', `import uuid; from app.modules.sales import bill_link; print(bill_link.token(uuid.UUID('${ids.sale}')))`], { cwd: join('..', 'backend'), env: { ...process.env, PYTHONUTF8: '1' } }).toString().trim()
} catch (e) { console.log('bill token SKIPPED', String(e).split('\n')[0]) }

const browser = await chromium.launch()
for (const lang of LANGS) {
  const dir = join(OUT, lang)
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.addInitScript((l) => localStorage.setItem('locale', l), lang)
  const shot = (name) => page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 82 })
  const go = async (name, path, prep) => {
    if (ONLY && name !== 'login' && !ONLY.includes(name)) return
    try {
      await page.goto(`${WEB}${path}`)
      await page.waitForLoadState('networkidle')
      if (prep) await prep()
      await page.waitForTimeout(600)
      await shot(name)
      console.log(lang, name)
    } catch (e) {
      console.log(lang, name, 'SKIPPED', String(e).split('\n')[0])
    }
  }
  const scroll = (y) => async () => { await page.mouse.wheel(0, y); await page.waitForTimeout(500) }

  await go('login', '/login')
  await page.locator('input[type="tel"]').first().fill(PHONE)
  await page.locator('input[type="password"]').fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/$/)

  await go('home', '/')
  await go('profile-menu', '/', async () => { await page.getByTestId('profile-button').click(); await page.getByTestId('profile-menu').waitFor() })
  await go('appearance', '/more/appearance')
  await go('more', '/more')
  await go('help', '/audit?preset=this_month', async () => { await page.locator('[data-help^="audit.overview"]').first().click() })
  await go('sale-pick', '/sale/new')
  await go('sale-pay', '/sale/new', async () => { await page.locator('main button').filter({ hasText: /Galaxy|iPhone|Infinix|Vivo|Tecno|Redmi|Oppo/ }).first().click(); await page.waitForTimeout(500); await page.mouse.wheel(0, 1500) })
  if (ids.sale) await go('sale-done', `/sales/${ids.sale}`)
  if (billToken) await go('bill-check', `/b/${billToken}`)
  await go('purchase-source', '/purchase/new')
  await go('oldstock', '/stock/opening')
  await go('purchase-device', '/stock/opening', async () => { await page.locator('main button').filter({ hasText: /Add device|موبائل شامل کریں|Phone daalein/ }).first().click(); await page.waitForTimeout(500) })
  await go('stock-list', '/stock')
  if (ids.device) await go('device-page', `/stock/${ids.device}`)
  if (ids.device) await go('device-history', `/stock/${ids.device}`, scroll(1200))
  if (ids.used) await go('verify', `/stock/${ids.used}/verify`)
  if (ids.used) await go('signature', `/stock/${ids.used}/verify`, async () => {
    const pad = page.getByTestId('signature-pad').locator('canvas')
    await pad.scrollIntoViewIfNeeded()
    const b = await pad.boundingBox()
    await page.mouse.move(b.x + 30, b.y + b.height * 0.6); await page.mouse.down()
    // a hand-written looking line: loops that drift to the right
    for (let t = 0; t <= 6 * Math.PI; t += 0.2) await page.mouse.move(b.x + 30 + t * 13 + Math.cos(t) * 14, b.y + b.height * 0.55 - Math.sin(t) * 26 - t * 1.5)
    await page.mouse.up()
    await page.mouse.wheel(0, 120)
  })
  await go('return', '/return/new')
  await go('exchange', '/exchange/new')
  await go('khata', '/khata')
  if (ids.bilal) await go('person', `/parties/${ids.bilal}`)
  if (ids.tariq) await go('lending', `/parties/${ids.tariq}`, async () => { await page.getByTestId('party-lending').scrollIntoViewIfNeeded(); await page.mouse.wheel(0, -80) })
  if (ids.bilal) await go('payment', `/parties/${ids.bilal}`, async () => { await page.getByRole('button', { name: /Money received|پیسے ملے|Paise mile/ }).first().click() })
  await go('hisaab', '/hisaab')
  await go('expenses', '/expenses')
  await go('repairs', '/repairs')
  await go('repair-new', '/repairs/new')
  if (ids.repair) await go('repair-job', `/repairs/${ids.repair}`, scroll(330))
  await go('repair-labs', '/repairs/labs')
  if (ids.lab) await go('repair-lab', `/repairs/labs/${ids.lab}`)
  await go('accessories', '/accessories')
  if (ids.item) await go('item-page', `/accessories/${ids.item}`, scroll(500))
  await go('installments', '/installments')
  await go('loans', '/loans')
  await go('stock-count', '/stock/count')
  await go('audit', '/audit?preset=this_month')
  await go('audit-finance', '/audit/finance?preset=this_month')
  await go('audit-sales', '/audit/sales?preset=this_month', scroll(300))
  await go('audit-udhaar', '/audit/udhaar?preset=this_month')
  await go('audit-lending', '/audit/lending?preset=all_time')
  await go('audit-repairs', '/audit/repairs?preset=this_month', scroll(300))
  await go('audit-stock', '/audit/stock?preset=this_month')
  await go('reports', '/reports')
  await go('staff', '/more/staff')
  await go('settings', '/more/settings')
  await go('business', '/more/settings', scroll(1150))
  await go('notifications', '/more/notifications')
  await go('bulk', '/more/bulk')
  await go('accounts', '/more/cash')

  // printed stickers, shown at a readable size
  const printed = async (name, path) => {
    if (ONLY && !ONLY.includes(name)) return
    try {
      const html = await (await fetch(`${API}${path}`, { headers: H })).text()
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: 'body{background:#eef2f7;display:flex;flex-direction:column;align-items:center;gap:20px;padding:60px 0;margin:0}.label{box-shadow:0 6px 18px rgba(14,22,19,.15);background:#fff;transform:scale(1.45);transform-origin:top center;margin-bottom:90px}' })
      await page.waitForTimeout(300)
      const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.label')].map((e) => e.getBoundingClientRect().bottom)))
      await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 390, height: Math.min(844, Math.ceil(h) + 50) } })
      console.log(lang, name)
    } catch (e) {
      console.log(lang, name, 'SKIPPED', String(e).split('\n')[0])
    }
  }
  const docLang = lang === 'ur' ? 'ur' : 'en'
  // the printed 80 mm bill with its QR at the bottom
  if (ids.sale && (!ONLY || ONLY.includes('bill-qr'))) {
    try {
      const html = await (await fetch(`${API}/sales/${ids.sale}/receipt?lang=${docLang}`, { headers: H })).text()
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: 'html,body{background:#eef2f7!important}body{padding:24px 0!important}' })
      await page.waitForTimeout(400)
      const h = await page.evaluate(() => Math.ceil(document.body.scrollHeight))
      await page.screenshot({ path: join(dir, 'bill-qr.jpg'), type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 390, height: Math.min(1600, h + 24) } })
      console.log(lang, 'bill-qr')
    } catch (e) { console.log(lang, 'bill-qr', 'SKIPPED', String(e).split('\n')[0]) }
  }
  if (ids.repair) await printed('repair-sticker', `/labels/repairs?${new URLSearchParams({ ids: ids.repair, size: '58x40', fields: 'shop,no,barcode,customer,phone,device,imei,fault,accessories,promised,left', lang: docLang })}`)
  if (ids.device) await printed('label', `/labels/devices?${new URLSearchParams({ ids: ids.device, size: '50x30', fields: 'shop,name,specs,price,barcode,imei,condition', lang: docLang })}`)
  await ctx.close()
}
await browser.close()
console.log('done', OUT)
