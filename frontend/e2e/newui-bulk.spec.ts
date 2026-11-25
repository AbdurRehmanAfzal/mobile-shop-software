/** ADR-134 / ADR-034: bulk Excel in the new product — no file draws it, so it is drawn like files
 *  11 / 01. The template, the preview (writes nothing), the import (all or nothing unless skipping)
 *  and the export are the live bulk's. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: bulk Excel — template, drop a file, the preview table with filters, skip errors, import, export', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Bulk Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/more/bulk')
  await expect(page.getByTestId('nbulk')).toBeVisible()
  await expect(page.getByTestId('nbulk-kinds').getByRole('button')).toHaveCount(5)

  // people: the template downloads
  await page.getByTestId('nbulk-kind-people').click()
  const dl = page.waitForEvent('download')
  await page.getByTestId('nbulk-template').click()
  expect((await dl).suggestedFilename()).toMatch(/^people-template.*\.xlsx$/)

  // a sheet with two good rows, a known sample and a bad one: the preview writes nothing
  const people = [
    'Name,Phone,Type,City,Opening balance (Rs.),Who owes',
    'Ahmed Khan,03001112233,Customer,Lahore,15000,They owe us',
    'Rehman Traders,03211112233,Supplier,Karachi,60000,We owe them',
    'Ahmed Khan,03001234567,Customer,,,',
    'Lost,03121112233,Customer,,500,',
  ].join('\n')
  await page.getByTestId('nbulk-file').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(people, 'utf-8') })
  await expect(page.getByTestId('nbulk-file-name')).toHaveText('people.csv')
  await page.getByTestId('nbulk-check').click()
  await expect(page.getByTestId('nbulk-count-ok')).toContainText('2')
  await expect(page.getByTestId('nbulk-count-error')).toContainText('1')
  await expect(page.getByTestId('nbulk-count-skip')).toContainText('1')
  await expect(page.getByTestId('nbulk-table')).toContainText('Rehman Traders')
  await expect(page.getByTestId('nbulk-table')).toContainText('Say who owes')
  await expect(page.getByTestId('nbulk-import')).toBeDisabled()
  expect(await get('/parties')).toEqual([])
  await page.screenshot({ path: 'test-results/newui-bulk.png', fullPage: true })

  // the counts filter the table; a row opens with every value
  await page.getByTestId('nbulk-count-error').click()
  await expect(page.getByTestId('nbulk-row')).toHaveCount(1)
  await page.getByTestId('nbulk-row').click()
  await expect(page.getByTestId('nbulk-detail')).toContainText('Lost')
  await page.getByTestId('nbulk-detail').getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('nbulk-count-all').click()
  await expect(page.getByTestId('nbulk-row')).toHaveCount(4)

  // skip the bad row, check again, import
  await page.getByTestId('nbulk-skip').check()
  await page.getByTestId('nbulk-check').click()
  await expect(page.getByTestId('nbulk-import')).toBeEnabled()
  await page.getByTestId('nbulk-import').click()
  await expect(page.getByTestId('nbulk-done')).toContainText('2 people')
  await expect(page.getByTestId('nbulk-history')).toContainText('People')
  const parties = await get('/parties')
  expect(parties.find((p: { phone: string }) => p.phone === '03001112233').balance).toBe('15000.00')
  expect(parties.find((p: { phone: string }) => p.phone === '03211112233').balance).toBe('-60000.00')

  // stock: a new brand is made on the way, a supplier row makes a purchase bill
  await page.getByTestId('nbulk-kind-stock').click()
  const stock = [
    'IMEI 1,Brand,Model,Condition,PTA,SIM time (months),Cost (Rs.),Asking price (Rs.),Supplier phone,Supplier name,Paid now (Rs.)',
    '359568073814231,Nokia,105 4G,New,PTA approved,,3000,3500,,,',
    '861536030196001,Zyrex,Z1,Used,Non-PTA,4,22000,26000,03211112233,,20000',
  ].join('\n')
  await page.getByTestId('nbulk-file').setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(stock, 'utf-8') })
  await page.getByTestId('nbulk-check').click()
  await expect(page.getByTestId('nbulk-table')).toContainText("Brand 'Zyrex' is new")
  await page.getByTestId('nbulk-import').click()
  await expect(page.getByTestId('nbulk-done')).toContainText('2 phones')
  await expect(page.getByTestId('nbulk-done')).toContainText('1 purchase bills')
  const devices = await get('/devices')
  expect(devices.map((d: { imei1: string }) => d.imei1).sort()).toEqual(['359568073814231', '861536030196001'])

  // export in the same layout
  const ex = page.waitForEvent('download')
  await page.getByTestId('nbulk-export-xlsx').click()
  expect((await ex).suggestedFilename()).toMatch(/^stock-export.*\.xlsx$/)

  // Urdu: one language, right to left
  await page.getByTestId('nbulk-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-bulk-ur.png', fullPage: true })
})
