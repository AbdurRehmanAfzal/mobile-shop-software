/** Owner (2026-11-09, ADR-054): the super admin deletes a customer into Deleted; its owner can no
 *  longer sign in; Bring it back restores it as it was. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(120_000)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
}

test('delete a customer into Deleted, its owner cannot sign in, bring it back', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Bin Shop ${owner.slice(-4)}`
  expect((await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Bin Owner', phone: owner, password: 'owner1234' } })).ok()).toBeTruthy()

  await login(page, SUPER.phone, SUPER.password)
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/admin')
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()

  const bin = page.getByTestId('shop-bin')
  await bin.getByTestId('shop-delete').click()
  await expect(bin.getByTestId('bin-delete')).toBeDisabled()
  await bin.getByTestId('bin-confirm').fill(shopName.toLowerCase())
  await page.getByLabel('Reason (only you see it)').fill('Shop closed')
  await page.screenshot({ path: 'test-results/shop-bin-confirm.png', fullPage: true })
  await bin.getByTestId('bin-delete').click()
  await expect(page.getByTestId('shop-in-bin')).toContainText('Shop closed')
  await page.keyboard.press('Escape')

  // gone from the list, found under Deleted
  await expect(page.getByRole('button', { name: new RegExp(shopName) })).toHaveCount(0)
  await page.getByRole('button', { name: /^Deleted/ }).click()
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  await expect(page.getByTestId('shop-in-bin')).toBeVisible()

  // the owner cannot sign in
  const r = await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'owner1234' } })
  expect(r.status()).toBe(401)
  expect((await r.json()).error.code).toBe('shop_closed')

  await page.getByTestId('shop-restore').click()
  await expect(page.getByTestId('shop-bin')).toBeVisible()
  expect((await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'owner1234' } })).ok()).toBeTruthy()
})
