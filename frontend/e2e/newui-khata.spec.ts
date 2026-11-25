/** ADR-134: a person's khata in the new product, first drawn from `06-person-khata.html`, now from its full
 *  version `21-party-khata-full-ledger.html` (newui-party-khata.spec.ts tests what 21 adds). The balance and
 *  the ledger are the server's statement; "paisa aya / diya" are payments (against bills, or len-den
 *  with no bill), an old balance is the opening balance (ADR-110); undo keeps the entry as Deleted;
 *  the switcher moves between people; a dealer's phones come from the journey. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: a person\'s khata — old balance, money in and out, len-den, wallet, undo, switching people, as file 21 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Khata Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const asif = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Asif Khata', phone: '03215550021', kinds: ['customer'] } })).json()
  const dealer = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Hall Road Traders', phone: '03215550022', kinds: ['supplier'] } })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const I1 = imei(`3569380${String(Date.now()).slice(-4)}011`)
  const buy = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer.id, paid: 0, devices: [{ device: { imei1: I1, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 22000 }] } })
  expect(buy.ok(), await buy.text()).toBeTruthy()
  const balOf = async (id: string) => Number((await get(`/parties/${id}`)).balance)

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // F4's address opens the person with the biggest open balance (the dealer here)
  await page.goto('/new/khata')
  await expect(page).toHaveURL(new RegExp(`/new/parties/${dealer.id}$`))
  await expect(page.getByTestId('nkh-name')).toHaveText('Hall Road Traders')
  await expect(page.getByTestId('nkh-bal')).toContainText('20,000')
  await expect(page.getByTestId('nkh-status')).toContainText('give')
  await expect(page.getByTestId('nkh-stock-in_shop')).toContainText('1')
  await page.getByTestId('nkh-tab-items').click()
  await expect(page.getByTestId('nkh-items')).toContainText(I1)

  // an empty khata, then an old balance
  await page.goto(`/new/parties/${asif.id}`)
  await expect(page.getByTestId('nkh-empty')).toBeVisible()
  await expect(page.getByTestId('nkh-status')).toContainText('Settled')
  await page.getByTestId('nkh-old').click()
  await expect(page.getByTestId('nkh-drawer-badge')).toContainText('OLD BALANCE')
  await page.getByTestId('nkh-old-lena').click()
  await page.getByTestId('nkh-amount').fill('12000')
  await page.getByTestId('nkh-note').fill('From the old register')
  await page.getByTestId('nkh-save').click()
  await expect(page.getByTestId('nkh-bal')).toContainText('12,000')
  await expect(page.getByTestId('nkh-status')).toContainText('I will get')
  await expect(page.getByTestId('nkh-ledger')).toContainText('From the old register')
  expect(await balOf(asif.id)).toBe(12000)
  await page.screenshot({ path: 'test-results/newui-khata.png', fullPage: true })

  // money received in cash
  await page.getByTestId('nkh-in').click()
  await page.getByTestId('nkh-amount').fill('2000')
  await page.getByTestId('nkh-save').click()
  await expect(page.getByTestId('nkh-bal')).toContainText('10,000')
  expect(await balOf(asif.id)).toBe(10000)

  // money given with no bill: len-den
  await page.getByTestId('nkh-out').click()
  await page.getByTestId('nkh-kind-lenden').click()
  await page.getByTestId('nkh-amount').fill('3000')
  await page.getByTestId('nkh-save').click()
  await expect(page.getByTestId('nkh-bal')).toContainText('13,000')

  // money received on a mobile wallet
  await page.getByTestId('nkh-in').click()
  await page.getByTestId('nkh-mode-wallet').click()
  await page.getByTestId('nkh-amount').fill('1000')
  await page.getByTestId('nkh-save').click()
  await expect(page.getByTestId('nkh-bal')).toContainText('12,000')
  expect(await balOf(asif.id)).toBe(12000)

  // the len-den tab: the old balance and the len-den; undo the old balance with a reason
  await page.getByTestId('nkh-tab-lenden').click()
  await expect(page.getByTestId('nkh-lenden')).toContainText('From the old register')
  await expect(page.getByTestId('nkh-lenden')).toContainText('No-bill len-den')
  await page.getByTestId('nkh-old-undo').click()
  await expect(page.getByTestId('nkh-undo-yes')).toBeDisabled()
  await page.getByTestId('nkh-undo-why').fill('entered by mistake')
  await page.getByTestId('nkh-undo-yes').click()
  await expect(page.getByTestId('nkh-bal')).toContainText('0')
  await expect(page.getByTestId('nkh-status')).toContainText('Settled')
  expect(await balOf(asif.id)).toBe(0)

  // WhatsApp hisaab and edit
  await page.getByTestId('nkh-wa').click()
  await expect(page.getByTestId('nkh-wa-text')).toHaveValue(/Account clear/)
  await page.getByTestId('nkh-wa-window').getByRole('button', { name: 'Close' }).first().click()
  await page.getByTestId('nkh-edit').click()
  await page.getByTestId('nkh-edit-name').fill('Asif Bhai')
  await page.getByTestId('nkh-edit-save').click()
  await expect(page.getByTestId('nkh-name')).toHaveText('Asif Bhai')

  // the switcher goes to the dealer
  await page.getByTestId('nkh-switcher').getByRole('button', { name: /Hall Road Traders/ }).click()
  await expect(page).toHaveURL(new RegExp(`/new/parties/${dealer.id}$`))

  // Urdu: one language, right to left
  await page.getByTestId('nkh-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-khata-ur.png', fullPage: true })
})
