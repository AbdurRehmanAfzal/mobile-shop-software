/** Shopkeepers 2026-11-20 (ADR-114): a phone's page —
 *  Details: one table of everything about the phone, each line with its action and a "?", every
 *  line always there so it can be filled in, "Edit all details" at the top, the money and what came
 *  with it in the same table; 80 mm slip and A4 page: the phone's details as they print, with the
 *  lines ticked, to print, download or share. (Smart / Tabs / Tiles / Compact are gone.) */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEI = '356938035641234'

test('phone page: details table, edit all, 80 mm slip and A4 preview', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
    if (localStorage.getItem('device.style') === null) localStorage.setItem('device.style', 'smart') // a style saved before ADR-114
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Style Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const colours = await (await request.get('/api/v1/catalogue/colours', { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Bilal Traders', phone: '03213333333', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: IMEI, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', location: 'Rack A2' }, cost: 20000, asking_price: 25000, accessories: [{ kind: 'box', came_with: true }, { kind: 'charger', came_with: false, pending_from: 'vendor' }] }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto(`/stock/${dev}`)

  // three views; an old saved style opens as Details
  await expect(page.getByTestId('dstyle-classic')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('device-styles').getByRole('radio')).toHaveCount(3)
  for (const gone of ['smart', 'tabs', 'tiles', 'compact']) await expect(page.getByTestId(`dstyle-${gone}`)).toHaveCount(0)

  // the table: identity, details, money, people, what came with it
  const table = page.getByTestId('device-table')
  await expect(table.getByTestId('dline-imei1')).toContainText(IMEI)
  await expect(table.getByTestId('dline-shelf')).toContainText('Rack A2')
  await expect(table.getByTestId('dline-asking')).toContainText('25,000')
  await expect(table.getByTestId('dline-cost')).toContainText('20,000')
  await expect(table.getByTestId('dline-payable')).toContainText('20,000') // bought on udhaar
  await expect(table.getByTestId('dline-seller')).toContainText('Bilal Traders')
  await expect(table.getByTestId('dline-acc')).toHaveCount(2)
  await expect(table.getByTestId('dline-acc').first()).toContainText('Box')
  await expect(table.getByTestId('dline-acc').nth(1)).toContainText('Charger')
  await expect(table).toContainText('Money on this phone')
  // lines not written yet are there with "—" and a way to fill them in
  await expect(table.getByTestId('dline-imei2')).toContainText('—')
  await expect(table.getByTestId('dline-imei2').getByRole('button', { name: 'Add' })).toBeVisible()
  await expect(table.getByTestId('dline-colour')).toContainText('—')
  await page.screenshot({ path: 'test-results/device-table.png', fullPage: true })
  // the table and both previews fit the narrowest phone and a laptop
  for (const [w, hgt] of [[320, 568], [1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: hgt })
    for (const view of ['classic', 'thermal', 'a4'] as const) {
      await page.getByTestId(`dstyle-${view}`).click()
      await expect(page.getByTestId(view === 'classic' ? 'device-table' : 'device-sheet')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${view} at ${w}px`).toBeLessThanOrEqual(1)
    }
    if (w === 320) { await page.getByTestId('dstyle-classic').click(); await page.screenshot({ path: 'test-results/device-table-se.png' }) }
  }
  await page.setViewportSize({ width: 412, height: 900 })
  await page.getByTestId('dstyle-classic').click()

  // a line's own job; the colour's Edit and "Edit all details" open the whole form
  await table.getByTestId('dline-asking').getByRole('button', { name: 'Change' }).click()
  await expect(page.getByLabel('Asking price')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await table.getByTestId('dline-colour').getByRole('button', { name: 'Edit' }).click()
  const form = page.getByTestId('sheet-backdrop')
  await expect(form.getByText('Edit details')).toBeVisible()
  await form.locator('select').nth(1).selectOption({ label: colours[0].name })
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(table.getByTestId('dline-colour')).toContainText(colours[0].name)
  await page.getByTestId('device-edit-all').click()
  await expect(form.getByText('Edit details')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  // the bought-from card is a calm white card, with its pay button
  await expect(page.getByTestId('unit-bought')).toContainText('Bilal Traders')
  await expect(page.getByTestId('unit-tiles')).toHaveCount(0)

  // 80 mm slip: the server's own print page, the lines ticked like a sticker
  await page.getByTestId('dstyle-thermal').click()
  const sheet = page.getByTestId('device-sheet')
  const doc = () => sheet.getByTestId('device-sheet-frame').getAttribute('srcdoc')
  await expect.poll(doc, { timeout: 15_000 }).toContain('size: 80mm auto')
  expect(await doc()).toContain(IMEI)
  expect(await doc()).toContain('Rs. 25,000')
  expect(await doc()).toContain('Charger (to come)')
  expect(await doc()).not.toContain('20,000') // the cost is not on it until ticked
  await sheet.getByTestId('dsheet-f-price').click()
  await expect.poll(doc).not.toContain('Rs. 25,000')
  await sheet.getByTestId('dsheet-f-cost').click()
  await expect.poll(doc).toContain('Rs. 20,000')
  await expect(sheet.getByTestId('device-sheet-print')).toBeEnabled()
  await expect(sheet.getByRole('button', { name: /Share|WhatsApp|PDF/ }).first()).toBeVisible()
  await expect(page.getByTestId('sheet-act-sell')).toBeVisible() // the jobs are here too
  await page.screenshot({ path: 'test-results/device-slip.png', fullPage: true })

  // A4: its own ticks; the choice of view and of lines is remembered
  await page.getByTestId('dstyle-a4').click()
  await expect.poll(doc, { timeout: 15_000 }).toContain('size: A4')
  expect(await doc()).toContain('Rs. 25,000') // the slip's ticks did not change the page's
  await page.screenshot({ path: 'test-results/device-a4.png', fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dstyle-a4')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('dstyle-thermal').click()
  await expect.poll(doc, { timeout: 15_000 }).toContain('Rs. 20,000')
  await page.getByTestId('sheet-act-sell').click()
  await expect(page).toHaveURL(/\/sale\/new\?device=/)
})
