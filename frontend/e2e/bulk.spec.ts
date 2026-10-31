/** Owner 2026-10-31 (docs/18): bulk Excel — template with samples, preview that writes nothing,
 *  import through the normal services, export in the same layout. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('bulk: people and stock come in from a sheet, with a preview first', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Bulk Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()

  // the More page shows the entry
  await page.goto('/more')
  await page.getByRole('button', { name: 'Bulk Excel' }).click()
  await expect(page).toHaveURL(/\/more\/bulk/)
  await expect(page.getByTestId('bulk-page')).toBeVisible()

  // people: the template downloads; a CSV with one good, one known-sample and one bad row
  await page.getByRole('button', { name: 'People', exact: true }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download the sheet' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^people-template-.*\.xlsx$/)
  const people = [
    'Name,Phone,Type,City,Opening balance (Rs.),Who owes',
    'Ahmed Khan,03001112233,Customer,Lahore,15000,They owe us',
    'Rehman Traders,03211112233,Supplier,Karachi,60000,We owe them',
    'Ahmed Khan,03001234567,Customer,,,',
    'Lost,03121112233,Customer,,500,',
  ].join('\n')
  await page.getByTestId('bulk-file').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(people, 'utf-8') })
  await page.getByRole('button', { name: 'Check the file' }).click()
  const counts = page.getByTestId('bulk-counts')
  await expect(counts).toContainText('2 ok')
  await expect(counts).toContainText('1 error')
  await expect(counts).toContainText('1 skipped')
  await expect(page.getByTestId('bulk-rows')).toContainText('Say who owes')
  await expect(page.getByTestId('bulk-import')).toBeDisabled()
  expect(await get('/parties')).toEqual([])
  // a row opens with every message and value
  await page.getByTestId('bulk-rows').getByRole('button').nth(0).click()
  await expect(page.getByText('Row 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Lahore', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.screenshot({ path: 'test-results/bulk-preview.png', fullPage: true })

  // skip the bad row and import
  await page.getByRole('switch', { name: 'Skip rows with errors, import the rest' }).click()
  await page.getByRole('button', { name: 'Check the file' }).click()
  await expect(page.getByTestId('bulk-import')).toBeEnabled()
  await page.getByTestId('bulk-import').click()
  await expect(page.getByTestId('bulk-done')).toContainText('2 people')
  await expect(page.getByTestId('bulk-done')).toContainText('2 opening balances')
  await expect(page.getByTestId('bulk-history')).toContainText('People')
  const parties = await get('/parties')
  expect(parties.find((p: { phone: string }) => p.phone === '03001112233').balance).toBe('15000.00')
  expect(parties.find((p: { phone: string }) => p.phone === '03211112233').balance).toBe('-60000.00')

  // stock: a supplier row makes a purchase bill, a new brand is created on the way
  await page.getByRole('button', { name: 'Phones (stock)' }).click()
  const stock = [
    'IMEI 1,Brand,Model,Condition,PTA,SIM time (months),Cost (Rs.),Asking price (Rs.),Supplier phone,Supplier name,Paid now (Rs.)',
    '359568073814231,Nokia,105 4G,New,PTA approved,,3000,3500,,,',
    '861536030196001,Zyrex,Z1,Used,Non-PTA,4,22000,26000,03211112233,,20000',
  ].join('\n')
  await page.getByTestId('bulk-file').setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(stock, 'utf-8') })
  await page.getByRole('button', { name: 'Check the file' }).click()
  await expect(page.getByTestId('bulk-rows')).toContainText("Brand 'Zyrex' is new")
  await page.getByTestId('bulk-import').click()
  await expect(page.getByTestId('bulk-done')).toContainText('2 phones')
  await expect(page.getByTestId('bulk-done')).toContainText('1 purchase bills')
  await page.screenshot({ path: 'test-results/bulk-done.png', fullPage: true })
  const devices = await get('/devices')
  expect(devices.map((d: { imei1: string }) => d.imei1).sort()).toEqual(['359568073814231', '861536030196001'])
  const sup = (await get('/parties')).find((p: { phone: string }) => p.phone === '03211112233')
  expect(sup.balance).toBe('-62000.00')

  // export in the same layout
  const ex = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel', exact: true }).click()
  expect((await ex).suggestedFilename()).toMatch(/^stock-export-.*\.xlsx$/)
})
