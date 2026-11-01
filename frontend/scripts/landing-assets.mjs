// Screenshots and the sample video for the landing page, taken from the running app on a demo
// shop (owner 2026-10-29). Run with the backend on :8000 and the frontend on :5173:
//   node scripts/landing-assets.mjs
// Writes public/landing/*.png and public/landing/demo.webm (+ demo.mp4 when ffmpeg can).

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WEB = 'http://localhost:5173'
const API = 'http://localhost:8000/api/v1'
const OUT = join(process.cwd(), 'public', 'landing')
mkdirSync(OUT, { recursive: true })
const PHONE = `038${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const PASS = 'demo-secret-1'

async function seed() {
  const r = await fetch(`${API}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shop_name: 'Al-Madina Mobile Zone', owner_name: 'Hamza Iqbal', phone: PHONE, password: PASS, city: 'Lahore' }) })
  const { tokens, me } = await r.json()
  const h = { 'content-type': 'application/json', Authorization: `Bearer ${tokens.access_token}`, 'X-Shop-Id': me.active_shop_id ?? me.shops[0].id }
  const get = async (p) => (await fetch(`${API}${p}`, { headers: h })).json()
  const post = async (p, body) => {
    const res = await fetch(`${API}${p}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`${p}: ${await res.text()}`)
    return res.json()
  }
  const brands = await get('/catalogue/brands')
  const storages = await get('/catalogue/storages')
  const colours = await get('/catalogue/colours')
  const brand = (n) => brands.find((b) => b.name === n)
  const model = async (b, q) => (await get(`/catalogue/models?brand_id=${b.id}&q=${encodeURIComponent(q)}`))[0]
  const st = (gb) => storages.find((s) => s.name.startsWith(String(gb))) ?? storages[0]
  const col = (n) => colours.find((c) => c.name === n) ?? colours[0]
  const phones = [
    ['Samsung', 'Galaxy A55', 128, 'Black', 'box_pack', 92000, 99500, '490154203237518'],
    ['Apple', 'iPhone 13', 128, 'Blue', 'used', 148000, 162000, '356938035643809'],
    ['Infinix', 'Hot 40', 128, 'Green', 'box_pack', 31000, 34500, '353918050000002'],
    ['Vivo', 'Y28', 128, 'Black', 'box_pack', 42000, 46000, '358240051111110'],
    ['Xiaomi', 'Redmi Note 13', 256, 'Blue', 'used', 55000, 61000, '352099001761481'],
    ['Oppo', 'A78', 128, 'Black', 'open_box', 47000, 52000, '357805023984942'],
  ]
  const ids = []
  for (const [b, m, gb, c, cond, cost, ask, imei] of phones) {
    const br = brand(b)
    const md = br ? await model(br, m) : null
    if (!br || !md) continue
    const d = await post('/devices/opening-stock', { imei1: imei, brand_id: br.id, model_id: md.id, storage_id: st(gb).id, colour_id: col(c).id, condition: cond, pta_status: 'pta_approved', cost_price: cost, asking_price: ask })
    ids.push(d.id)
  }
  const ali = await post('/parties', { name: 'Ali Raza', phone: '03215550001', kinds: ['customer'] })
  const bilal = await post('/parties', { name: 'Bilal Ahmed', phone: '03215550002', kinds: ['customer'] })
  const usman = await post('/parties', { name: 'Usman Tariq', phone: '03215550004', kinds: ['customer'] })
  const dealer = await post('/parties', { name: 'Rehman Traders', phone: '03005550003', kinds: ['supplier'] })
  // the shop's local day (a UTC slice is yesterday after midnight PKT)
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  // a supplier purchase with part payment (so the audit has a supplier side)
  const tecno = brand('Tecno') ?? brand('Infinix')
  const tm = tecno ? await model(tecno, tecno.name === 'Tecno' ? 'Spark' : 'Smart') : null
  let pur = null
  if (tecno && tm) {
    pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: day(12), devices: [
      { device: { imei1: '359568073814231', brand_id: tecno.id, model_id: tm.id, storage_id: st(128).id, colour_id: col('Black').id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 28500, asking_price: 32000 },
      { device: { imei1: '861536030196001', brand_id: tecno.id, model_id: tm.id, storage_id: st(128).id, colour_id: col('Blue').id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 28500, asking_price: 32000 },
    ], paid: 40000 }).catch(() => null)
  }
  // sales spread over the last weeks: cash, udhaar with a part payment, a third one
  await post('/sales', { party_id: ali.id, date: day(9), devices: [{ device_id: ids[2], price: 34500 }], paid: 34500 })
  await post('/sales', { party_id: bilal.id, date: day(5), devices: [{ device_id: ids[3], price: 46000 }], paid: 20000, due_date: day(-10) })
  if (pur) await post('/sales', { party_id: usman.id, date: day(2), devices: [{ device_id: pur.lines[0].device_id, price: 32500 }], paid: 32500 }).catch(() => undefined)
  await post('/sales', { date: day(1), devices: [{ device_id: ids[4], price: 61000 }], paid: 61000 }).catch(() => undefined)
  await post('/sales', { party_id: ali.id, devices: [{ device_id: ids[5], price: 52000 }], paid: 52000 }).catch(() => undefined)
  await post('/payments', { party_id: bilal.id, direction: 'in', amount: 6000 }).catch(() => undefined)
  await post('/accessories', { name: 'Type-C charger 25W', category: 'charger', price: 1500, reorder_level: 5, opening_qty: 12, opening_cost: 900 })
  // owner addendum 5: a cable with its card, bought by the dozen twice, some sold — batches, timeline, reports
  const cable = await post('/accessories', { name: 'Baseus Type-C cable 1m', category: 'cable', price: 300, reorder_level: 20, brand: 'Baseus', grade: 'original', color: 'Black', compatible: 'All Type-C phones', wholesale_price: 220, min_price: 200, warranty_days: 30, location: 'Rack A2' })
  await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: day(20), supplier_invoice_no: 'RT-1042', misc: [{ description: cable.name, accessory_id: cable.id, qty: 3, unit: 'dozen', unit_cost: 1200 }], paid: 3600 }).catch((e) => console.log(e.message))
  await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: day(6), supplier_invoice_no: 'RT-1077', misc: [{ description: cable.name, accessory_id: cable.id, qty: 2, unit: 'dozen', unit_cost: 1320 }], extra_costs: 240, paid: 1500 }).catch((e) => console.log(e.message))
  await post('/sales', { party_id: ali.id, date: day(4), misc: [{ description: cable.name, accessory_id: cable.id, qty: 6, unit_price: 300 }], paid: 1800 }).catch(() => undefined)
  await post('/sales', { date: day(1), misc: [{ description: cable.name, accessory_id: cable.id, qty: 4, unit_price: 300 }], paid: 1200 }).catch(() => undefined)
  await post('/accessories', { name: 'Silicone cover iPhone 13', category: 'cover', price: 650, reorder_level: 6, brand: 'Generic', opening_qty: 3, opening_cost: 280 }).catch(() => undefined)
  // owner addendum 6: a SIM tablet with its spec sheet and a used watch with its lock check
  let tabletId = ''
  const sam = brand('Samsung'); const tabModel = sam ? await model(sam, 'Galaxy Tab A9+') : null
  if (sam && tabModel) {
    const tp = await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: day(3), devices: [{ device: { category: 'tablet', cellular: true, imei1: '350123451234560', brand_id: sam.id, model_id: tabModel.id, storage_id: st(128).id, colour_id: col('Black').id, condition: 'box_pack', pta_status: 'pta_approved', ram_gb: 8, warranty_months: 12, warranty_by: 'brand', model_number: 'SM-X216B', specs: { os: 'Android 14', chipset: 'Snapdragon 695', display_in: 11, display_type: 'LCD', refresh_hz: 90, battery_mah: 7040, sim_type: 'nano', camera_rear_mp: 8, camera_front_mp: 5, port: 'Type-C', expandable: true } }, cost: 61000, asking_price: 68500 }], paid: 61000 }).catch((e) => { console.log(e.message); return null })
    tabletId = tp?.lines?.[0]?.device_id ?? ''
  }
  const apple = brand('Apple'); const watchModel = apple ? await model(apple, 'Watch Series 9') : null
  let watchId = ''
  if (apple && watchModel) watchId = (await post('/devices/opening-stock', { category: 'watch', cellular: false, serial: 'H4KQ9X2LM1', brand_id: apple.id, model_id: watchModel.id, condition: 'used', grade: 'a', size_mm: 45, battery_health: 92, cost_price: 62000, asking_price: 71000, lock_checks: { activation: 'cleared', paired: 'cleared' }, specs: { os: 'watchOS 10', water: 'WR50', sensors: ['hr', 'spo2', 'ecg'], aod: true } }).catch((e) => { console.log(e.message); return {} })).id ?? ''
  await post('/accessories', { name: 'Tempered glass', category: 'glass', price: 300, reorder_level: 10, opening_qty: 4, opening_cost: 120 }).catch(() => undefined)
  await post('/repairs', { party_id: ali.id, device_desc: 'Samsung A54 — screen', imei: '490154203237526', fault_codes: ['screen'], estimate: 9500, advance: 3000 }).catch(() => undefined)
  const cats = await get('/expenses/categories').catch(() => [])
  const cat = (k) => (Array.isArray(cats) ? cats.find((c) => c.key === k) : null)
  for (const [k, amount, desc, n] of [['electricity', 6200, null, 8], ['tea', 800, null, 3], ['transport', 1500, null, 1]]) {
    if (cat(k)) await post('/expenses', { category_id: cat(k).id, amount, description: desc, date: day(n) }).catch(() => undefined)
  }
  return { phone: PHONE, deviceId: ids[1], itemId: cable.id, tabletId, watchId, headers: h }
}

async function login(page, locale) {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale)
  await page.goto(`${WEB}/login`)
  await page.locator('input[type="tel"]').first().fill(PHONE)
  await page.locator('input[type="password"]').fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/$/)
  await page.waitForLoadState('networkidle')
}

async function shots(browser, locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await login(page, locale)
  const take = async (name, path, prep) => {
    await page.goto(`${WEB}${path}`)
    await page.waitForLoadState('networkidle')
    if (prep) await prep()
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, `${name}-${locale}.png`) })
  }
  await take('home', '/', async () => { await page.getByRole('button', { name: /This month|یہ مہینہ/ }).first().click().catch(() => undefined); await page.waitForTimeout(700) })
  await take('sale', '/sale/new', async () => { await page.getByRole('button', { name: /Galaxy A55|iPhone 13/ }).first().click(); await page.waitForTimeout(500) })
  await take('stock', '/stock')
  await take('khata', '/khata')
  await take('reports', '/reports')
  await take('invoice', '/invoices')
  await take('audit', '/audit?preset=this_month')
  await take('finance', '/audit/finance?preset=this_month')
  await take('bulk', '/more/bulk', async () => { await page.getByTestId('bulk-page').getByRole('button', { name: /Phones|موبائل/ }).first().click(); await page.waitForTimeout(400) })
  await take('history', `/stock/${seeded.deviceId}`, async () => { await page.mouse.wheel(0, 1250); await page.waitForTimeout(700) })
  await take('items', `/accessories/${seeded.itemId}`, async () => { await page.mouse.wheel(0, 520); await page.waitForTimeout(600) })
  if (seeded.tabletId) await take('tablet', `/stock/${seeded.tabletId}`, async () => { await page.mouse.wheel(0, 760); await page.waitForTimeout(600) })
  await take('itemreports', '/accessories/reports')
  await take('count', '/stock/count', async () => { for (const code of ['MS000001', 'MS000002', '350123451234560']) { await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press('Enter'); await page.waitForTimeout(500) } await page.getByRole('button', { name: /Check against stock|اسٹاک سے ملائیں|جانچ/ }).first().click().catch(() => undefined); await page.waitForTimeout(900) })
  // the printed stickers: the label page the sheet opens, shown at a readable size
  {
    const ids = [seeded.deviceId, seeded.tabletId, seeded.watchId].filter(Boolean).join(',')
    const q = new URLSearchParams({ ids, size: '50x30', copies: '1', fields: 'shop,name,specs,price,barcode,imei,condition', lang: locale })
    const html = await (await fetch(`${API}/labels/devices?${q}`, { headers: seeded.headers })).text()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: 'body{background:#eef2f7;display:flex;flex-direction:column;align-items:center;gap:18px;padding:40px 0;margin:0}.label{box-shadow:0 6px 18px rgba(14,22,19,.15);background:#fff;transform:scale(1.55);transform-origin:top center;margin-bottom:105px}' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `label-${locale}.png`) })
  }
  await ctx.close()
}

// the web application on a laptop (the side menu with F-keys shows from 1024px)
async function webShots(browser, locale) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 })
  const page = await ctx.newPage()
  await login(page, locale)
  const take = async (name, path, prep) => {
    await page.goto(`${WEB}${path}`)
    await page.waitForLoadState('networkidle')
    if (prep) await prep()
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, `web-${name}-${locale}.png`) })
  }
  await take('home', '/', async () => { await page.getByRole('button', { name: /This month|یہ مہینہ/ }).first().click().catch(() => undefined); await page.waitForTimeout(700) })
  await take('sale', '/sale/new', async () => { await page.getByRole('button', { name: /Galaxy A55|iPhone 13/ }).first().click(); await page.waitForTimeout(500) })
  await take('stock', '/stock')
  await take('khata', '/khata')
  await take('reports', '/reports')
  await take('invoice', '/invoices')
  await take('audit', '/audit?preset=this_month')
  await take('finance', '/audit/finance?preset=this_month')
  await take('bulk', '/more/bulk', async () => { await page.getByTestId('bulk-page').getByRole('button', { name: /Phones|موبائل/ }).first().click(); await page.waitForTimeout(400) })
  await take('items', `/accessories/${seeded.itemId}`)
  await ctx.close()
}

async function video(browser) {
  const dir = join(OUT, '_video')
  mkdirSync(dir, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: { dir, size: { width: 390, height: 844 } } })
  const page = await ctx.newPage()
  const pause = (ms) => page.waitForTimeout(ms)
  await login(page, 'en')
  await pause(2500)
  await page.getByRole('link', { name: /^Sell/ }).click()
  await pause(1800)
  await page.getByRole('button', { name: /Galaxy A55/ }).first().click()
  await pause(2200)
  await page.mouse.wheel(0, 500)
  await pause(1500)
  const skip = page.getByRole('button', { name: /Skip, I know this person|Skip and sell/ })
  if (await skip.count()) { await skip.click(); await pause(1200) }
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await pause(2000)
  const confirm = page.getByRole('button', { name: 'Confirm and make the bill' })
  if (await confirm.count()) { await confirm.click(); await pause(3000) }
  await page.goto(`${WEB}/audit?preset=this_month`)
  await pause(3000)
  await page.goto(`${WEB}/stock`)
  await pause(2500)
  await page.goto(`${WEB}/khata`)
  await pause(2500)
  await page.goto(`${WEB}/hisaab`)
  await pause(3000)
  await page.goto(`${WEB}/reports`)
  await pause(2500)
  await ctx.close()
  const files = readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!files.length) return
  const webm = join(OUT, 'demo.webm')
  copyFileSync(files[0], webm)
  // Safari needs mp4: try Playwright's ffmpeg (it may lack an H.264 encoder; then webm only)
  const ff = [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright', 'ffmpeg-1010', 'ffmpeg-win64.exe')].filter((p) => p && existsSync(p))
  for (const bin of ff) {
    try {
      execFileSync(bin, ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, 'demo.mp4')], { stdio: 'ignore' })
      console.log('mp4 ok')
      break
    } catch {
      console.log('no mp4 (ffmpeg without H.264); webm only')
    }
  }
}

const browser = await chromium.launch()
let seeded = { phone: PHONE, deviceId: '', itemId: '', tabletId: '', watchId: '', headers: {} }
const only = process.argv[2] // "shots" skips the video
try {
  seeded = await seed()
  await shots(browser, 'en')
  await shots(browser, 'ur')
  await webShots(browser, 'en')
  await webShots(browser, 'ur')
  if (only !== 'shots') await video(browser)
  console.log('done', readdirSync(OUT))
} finally {
  await browser.close()
}
