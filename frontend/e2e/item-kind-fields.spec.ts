/** Accessories Easy Mode, phase D (ADR-127):
 *  1. a new item is asked the one or two details that matter for its kind — a charger its watts and
 *     plug, a cover the phone it fits — in the form itself, not under "More details";
 *  2. colours and sizes together: tick the colours, tick the lengths, every pair is an item of its
 *     own with its count. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('a kind asks its own details; colour and size together make an item per pair', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Kind Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  await page.goto('/accessories')
  await page.getByRole('button', { name: 'New item' }).click()
  const form = page.getByTestId('item-form')
  await form.getByLabel('Name', { exact: true }).fill('Braided Cable')
  // 1. the kind decides what is asked beside it
  await form.getByRole('button', { name: 'Charger', exact: true }).click()
  const details = form.getByTestId('kind-details')
  await expect(details.getByLabel('Watts')).toBeVisible()
  await expect(details.getByLabel('Connector')).toBeVisible()
  await form.getByRole('button', { name: 'Cover', exact: true }).click()
  await expect(details.getByLabel('Fits (phone / model)')).toBeVisible()
  await expect(details.getByLabel('Watts')).toHaveCount(0)
  await form.getByRole('button', { name: 'Other', exact: true }).click()
  await expect(form.getByTestId('kind-details')).toHaveCount(0) // nothing special: all under "More details"
  await form.getByRole('button', { name: 'Cable', exact: true }).click()
  await details.getByLabel('Connector').fill('Type-C')
  // the same field is not there twice once "More details" is open
  await form.getByTestId('item-more').click()
  await expect(form.getByLabel('Connector')).toHaveCount(1)
  await expect(form.getByLabel('Watts')).toHaveCount(1)
  await form.getByTestId('item-more').click()

  // 2. colour and size together
  const variants = form.getByTestId('variants')
  await variants.getByTestId('var-by-both').click()
  const colours = variants.getByTestId('var-both-c')
  const sizes = variants.getByTestId('var-both-s')
  await colours.getByRole('checkbox', { name: 'Black' }).click()
  await colours.getByRole('checkbox', { name: 'White' }).click()
  await expect(variants.getByTestId('var-count')).toHaveCount(0) // colours alone are not items yet
  await sizes.getByRole('checkbox', { name: '1m' }).click()
  await sizes.getByRole('checkbox', { name: '2m' }).click()
  await expect(variants.getByTestId('var-count')).toContainText('4 items will be made')
  await variants.getByLabel('On the shelf now · Black · 1m').fill('4')
  await variants.getByLabel('On the shelf now · White · 2m').fill('1')
  // a length of the shop's own, then a pair it does not keep taken off
  await sizes.getByLabel('Add your own · Size or length').fill('3m')
  await sizes.getByRole('button', { name: 'Add · Size or length' }).click()
  await expect(variants.getByTestId('var-count')).toContainText('6 items will be made')
  await expect(variants.getByLabel('On the shelf now · Black · 1m')).toHaveValue('4') // counts kept
  await sizes.getByRole('checkbox', { name: '3m' }).click()
  await expect(variants.getByTestId('var-count')).toContainText('4 items will be made')
  await form.getByLabel('Sale price').fill('500')
  await form.getByLabel('Cost each').fill('200')
  await page.screenshot({ path: 'test-results/item-both.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await form.getByTestId('item-save').click()

  await expect(page.getByTestId('item-variant')).toHaveCount(4)
  const items = await (await request.get('/api/v1/accessories?q=Braided Cable', { headers: h })).json()
  expect(items.map((x: { variant: string; color: string; size: string; qty: number; connector: string }) => `${x.variant}|${x.color}|${x.size}|${x.qty}|${x.connector}`).sort()).toEqual([
    'Black · 1m|Black|1m|4|Type-C', 'Black · 2m|Black|2m|0|Type-C', 'White · 1m|White|1m|0|Type-C', 'White · 2m|White|2m|1|Type-C',
  ])
})
