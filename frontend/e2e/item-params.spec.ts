/** Owner addendum 5 (2026-10-31, docs/24): the item card with "More details" and the duplicate
 *  warning, a purchase by the dozen (stock in pieces, cost per piece), the item page with its
 *  batches and timeline, the dealer price at the counter, the item settings and the item reports. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const API = 'http://localhost:8000/api/v1'

test('items: more details, dozen purchase, item page, dealer price, settings, reports', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Items Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`${API}${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const sup = await post('/parties', { name: 'Rehman Traders', phone: phone(), kinds: ['supplier'] })
  const dealer = await post('/parties', { name: 'Bilal Mobiles', phone: phone(), kinds: ['customer', 'shop'], wholesale: true })

  // 1. a new item with the folded details; a second, similar name gets the duplicate warning
  await page.goto('/accessories')
  await page.getByRole('button', { name: 'New item' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Type-C cable 1m')
  await page.getByRole('button', { name: 'Cable', exact: true }).click()
  await page.getByLabel('Sale price').fill('300')
  await page.getByTestId('item-more').click()
  await page.getByLabel('Brand').fill('Baseus')
  await page.getByRole('button', { name: 'Original', exact: true }).click()
  await page.getByLabel('Wholesale price').fill('220')
  await page.getByLabel('Minimum sale price').fill('200')
  await page.getByLabel('Warranty (days)').fill('30')
  await page.getByLabel('Pieces in one box (this item)').fill('20')
  await page.screenshot({ path: 'test-results/items-form.png', fullPage: true })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('item-hero')).toBeVisible()
  await expect(page.getByTestId('item-hero')).toContainText('Baseus')
  await page.goto('/accessories')
  await page.getByRole('button', { name: 'New item' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Baseus type-c cable')
  await expect(page.getByTestId('similar-items')).toContainText('Type-C cable 1m')
  await page.getByLabel('Name', { exact: true }).fill('Iron earphones')
  await page.getByRole('button', { name: 'Earphones', exact: true }).click()
  await page.getByLabel('Sale price').fill('500')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('item-hero')).toBeVisible()

  // 2. buy two dozen from the supplier: the line is typed in dozens, stock becomes pieces
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer|From dealer/ }).first().click()
  await page.getByRole('button', { name: /Rehman Traders/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add accessory / watch' }).click()
  await page.getByRole('button', { name: /Type-C cable 1m/ }).first().click()
  await page.getByTestId('unit-chips').getByRole('button', { name: /Dozen/ }).click()
  await page.getByLabel('Qty', { exact: true }).fill('2')
  await page.getByLabel('Unit cost').fill('1200')
  await expect(page.getByText(/= 24 pieces/)).toBeVisible()
  await expect(page.getByText(/Rs\. 100 per piece/)).toBeVisible()
  await page.getByRole('button', { name: 'Discount, bill no.' }).click()
  await page.getByLabel('Supplier bill no.').fill('RT-77')
  await page.screenshot({ path: 'test-results/items-purchase.png', fullPage: true })
  await page.getByRole('button', { name: 'Put in stock' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print item labels' })).toBeVisible()

  // 3. the item page: 24 pieces, one batch of 24 left at 100, the purchase on the timeline
  await page.goto('/accessories')
  await page.getByRole('button', { name: /Type-C cable 1m/ }).first().click()
  await expect(page.getByTestId('item-hero')).toContainText('24')
  await expect(page.getByTestId('item-batches')).toContainText('Rehman Traders')
  await expect(page.getByTestId('item-batches')).toContainText('24 / 24')
  await expect(page.getByTestId('item-timeline')).toContainText('Bought · Rehman Traders')
  await expect(page.getByText('Avg cost', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/items-detail.png', fullPage: true })
  // an adjustment needs a reason
  await page.getByRole('button', { name: 'Adjust stock' }).click()
  await page.getByLabel('Change (+/−)').fill('-1')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByLabel('Reason (required)').fill('damaged')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('item-hero')).toContainText('23')

  // 4. at the counter a dealer gets the wholesale price, a walk-in the retail price
  await page.goto('/sale/new')
  await page.getByRole('button', { name: 'Accessory / watch' }).first().click()
  await page.getByRole('button', { name: /Type-C cable 1m/ }).first().click()
  await expect(page.getByLabel('Unit price')).toHaveValue('300')
  await page.getByRole('button', { name: 'Discount & customer' }).click()
  await page.getByRole('button', { name: /Bilal Mobiles/ }).first().click()
  await expect(page.getByLabel('Unit price')).toHaveValue('220')
  await expect(page.getByText('Dealer price')).toBeVisible()
  await page.getByLabel('Unit price').fill('150')
  await expect(page.getByText(/Below the minimum price/)).toBeVisible()
  await page.screenshot({ path: 'test-results/items-sale.png', fullPage: true })

  // 5. settings: valuation, negative stock, units
  await page.goto('/more/settings')
  await expect(page.getByText('Item settings')).toBeVisible()
  await page.getByRole('switch', { name: /Allow selling past zero stock/ }).click()
  await page.locator('section', { hasText: 'Item settings' }).getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('section', { hasText: 'Item settings' }).getByRole('button', { name: 'Saved' })).toBeVisible()

  // 6. reports: low stock by supplier, value, movers, profit, dead, suppliers
  await page.goto('/accessories/reports')
  await expect(page.getByTestId('r-low')).toContainText('Iron earphones')
  await page.getByRole('button', { name: 'Stock value' }).click()
  await expect(page.getByTestId('r-value')).toContainText('2,300')
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click()
  await expect(page.getByTestId('r-suppliers')).toContainText('Rehman Traders')
  await page.getByRole('button', { name: 'Dead stock' }).click()
  await page.getByLabel('Not sold for').fill('7')
  await expect(page.getByTestId('r-dead')).toContainText('Type-C cable 1m')
  await page.screenshot({ path: 'test-results/items-reports.png', fullPage: true })
  // bulk price +10% on cables → 330
  await page.getByTestId('bulk-price').click()
  await page.getByLabel('Change by %').fill('10')
  await page.getByRole('button', { name: 'Cable', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/Prices updated: 1/)).toBeVisible()
  void dealer; void sup
})
