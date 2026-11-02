// A demo shop with sample data in every module, for the owner to try every screen (owner
// 2026-11-02). Everything goes through the real API, so the app's own rules apply (ledger,
// device events, stock batches, verification, price rules). Run with the backend up:
//   node scripts/demo-shop.mjs                       (local backend on :8000)
//   API=https://<domain>/api/v1 node scripts/demo-shop.mjs   (another server — only with the owner's say-so)
// Optional: PHONE=03xxxxxxxxx PASS=... SHOP="..." to choose the login.

const API = (process.env.API ?? 'http://localhost:8000/api/v1').replace(/\/$/, '')
const PASS = process.env.PASS ?? 'demo12345'
const SHOP = process.env.SHOP ?? 'Demo Mobile Centre'
const PHONE = process.env.PHONE ?? `0311${Math.floor(1_000_000 + Math.random() * 8_999_999)}`
const failed = []

// the shop's local day n days ago (PKT, never a UTC slice)
const day = (n) => {
  const d = new Date(Date.now() + 5 * 3600_000 - n * 86400_000)
  return d.toISOString().slice(0, 10)
}

async function session(phone, password) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, password }) })
  if (!r.ok) throw new Error(`login ${phone}: ${await r.text()}`)
  return r.json()
}

function client(tokens, shopId) {
  const h = { 'content-type': 'application/json', Authorization: `Bearer ${tokens.access_token}`, 'X-Shop-Id': shopId }
  const call = async (method, p, body) => {
    const res = await fetch(`${API}${p}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b), patch: (p, b) => call('PATCH', p, b) }
}

// one step: a failure is logged and the rest carries on
async function step(name, fn) {
  try {
    const v = await fn()
    console.log(`  ✓ ${name}`)
    return v
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`)
    failed.push(name)
    return null
  }
}

async function main() {
  console.log(`API ${API}`)
  const r = await fetch(`${API}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shop_name: SHOP, owner_name: 'Abdur Rehman', phone: PHONE, password: PASS, city: 'Lahore' }) })
  if (!r.ok) throw new Error(`signup: ${await r.text()}`)
  const { tokens, me } = await r.json()
  const shopId = me.active_shop_id ?? me.shops[0].id
  const api = client(tokens, shopId)
  const { get, post, put, patch } = api

  // ---- catalogue helpers
  const brands = await get('/catalogue/brands')
  const storages = await get('/catalogue/storages')
  const colours = await get('/catalogue/colours')
  const brand = (n) => brands.find((b) => b.name === n)
  const model = async (b, q) => (b ? (await get(`/catalogue/models?brand_id=${b.id}&q=${encodeURIComponent(q)}`))[0] : null)
  const st = (gb) => storages.find((s) => s.name.startsWith(String(gb))) ?? storages[0]
  const col = (n) => colours.find((c) => c.name === n) ?? colours[0]
  let imeiN = 0
  // valid 15-digit IMEIs (Luhn check digit)
  const imei = () => {
    const body = `35${String(4100000000000 + ++imeiN * 7919).slice(0, 12)}`
    let sum = 0
    for (let i = 0; i < 14; i++) { let d = Number(body[i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 } sum += d }
    return body + ((10 - (sum % 10)) % 10)
  }
  const phone = async (b, m, gb, c, cond, pta = 'pta_approved', extra = {}) => {
    const br = brand(b); const md = await model(br, m)
    if (!br || !md) return null
    // non-PTA / JV phones carry their SIM time (the app asks for it)
    const sim = pta === 'pta_approved' ? {} : { sim_time_months: 2 }
    return { imei1: imei(), brand_id: br.id, model_id: md.id, storage_id: st(gb).id, colour_id: col(c).id, condition: cond, pta_status: pta, ...sim, ...extra }
  }

  console.log('\nSettings, accounts, staff')
  await step('shop profile + tax registration', () => patch('/shops/current', { address: 'Shop 14, Hafeez Centre, Gulberg III, Lahore', whatsapp: '03001234567', email: 'demo@example.com', legal_name: 'Demo Mobile Centre (Pvt) Ltd', tagline_en: 'New and used mobiles, tablets, watches', ntn: '1234567-8', owner_name: 'Abdur Rehman', terms_en: 'Checked phones only. 7-day checking warranty on used phones.' }))
  const bank = await step('bank account (HBL)', () => post('/ledger/accounts', { kind: 'bank', name: 'HBL Current', opening_balance: 900000, opening_date: day(58) }))
  const ep = await step('Easypaisa account', () => post('/ledger/accounts', { kind: 'easypaisa', name: 'Shop Easypaisa' }))
  const accounts = (await get('/ledger/accounts').catch(() => [])) ?? []
  const cash = accounts.find((a) => a.kind === 'cash')
  // the galla starts with cash drawn from the bank (the default cash account takes no opening balance)
  if (cash && bank) await step('opening cash: 450,000 drawn from HBL into the galla', () => post('/ledger/transfers', { from_account_id: bank.id, to_account_id: cash.id, amount: 450000, date: day(58), note: 'opening cash' }))
  await step('manager (Imran)', () => post('/staff', { name: 'Imran Manager', phone: '0322' + PHONE.slice(4), password: PASS, role: 'manager' }))
  await step('salesman (Kashif)', () => post('/staff', { name: 'Kashif Salesman', phone: '0333' + PHONE.slice(4), password: PASS, role: 'salesman' }))

  console.log('\nPeople')
  const P = async (name, ph, kinds, extra = {}) => step(`person ${name}`, () => post('/parties', { name, phone: ph, kinds, ...extra }))
  const ali = await P('Ali Raza', '03215550001', ['customer'], { cnic: '35202-1234567-1' })
  const bilal = await P('Bilal Ahmed', '03215550002', ['customer'])
  const usman = await P('Usman Tariq', '03215550003', ['customer'])
  const sana = await P('Sana Khan', '03215550004', ['customer'])
  const hamza = await P('Hamza Iqbal', '03215550005', ['customer'], { wholesale: true })
  const rehman = await P('Rehman Traders', '03005550101', ['supplier'])
  const madina = await P('Madina Telecom', '03005550102', ['supplier'])
  const otherShop = await P('Star Mobiles (Hall Road)', '03005550103', ['shop'])

  console.log('\nStock: opening, supplier purchases, used phones from customers')
  const opening = {}
  for (const [key, b, m, gb, c, cond, cost, ask, pta] of [
    ['a55', 'Samsung', 'Galaxy A55', 128, 'Black', 'box_pack', 92000, 99500, 'pta_approved'],
    ['ip13', 'Apple', 'iPhone 13', 128, 'Blue', 'used', 148000, 162000, 'pta_approved'],
    ['ip12', 'Apple', 'iPhone 12', 64, 'White', 'used', 98000, 112000, 'non_pta'],
    ['hot40', 'Infinix', 'Hot 40', 128, 'Green', 'box_pack', 31000, 34500, 'pta_approved'],
    ['y28', 'Vivo', 'Y28', 128, 'Black', 'box_pack', 42000, 46000, 'pta_approved'],
    ['redmi', 'Xiaomi', 'Redmi Note 13', 256, 'Blue', 'used', 55000, 61000, 'jv'],
    ['a78', 'Oppo', 'A78', 128, 'Black', 'box_pack', 47000, 52000, 'pta_approved'],
    ['s23', 'Samsung', 'Galaxy S23', 256, 'Black', 'used', 165000, 185000, 'pta_approved'],
  ]) {
    const d = await phone(b, m, gb, c, cond, pta)
    if (!d) continue
    const x = await step(`opening stock ${b} ${m}`, () => post('/devices/opening-stock', { ...d, cost_price: cost, asking_price: ask }))
    if (x) opening[key] = x.id
  }
  const purchase = async (name, body) => step(name, () => post('/purchases', { kind: 'supplier', ...body }))
  const tecno = brand('Tecno') ? 'Tecno' : 'Infinix'
  const tecnoModel = tecno === 'Tecno' ? 'Spark' : 'Smart'
  const p1 = await purchase('purchase 1 — Rehman Traders, 4 phones, fully paid', { party_id: rehman?.id, date: day(55), supplier_invoice_no: 'RT-2201', devices: await Promise.all([1, 2, 3, 4].map(async () => ({ device: await phone(tecno, tecnoModel, 128, 'Black', 'box_pack'), cost: 28500, asking_price: 32000 }))), paid: 114000 })
  const p2 = await purchase('purchase 2 — Madina Telecom, 3 phones, part paid (udhaar to supplier)', { party_id: madina?.id, date: day(40), supplier_invoice_no: 'MT-778', due_date: day(-5), devices: await Promise.all([1, 2, 3].map(async () => ({ device: await phone('Samsung', 'Galaxy A15', 128, 'Blue', 'box_pack'), cost: 41000, asking_price: 46500 }))), paid: 60000, cash_account_id: bank?.id })
  const p3 = await purchase('purchase 3 — Rehman Traders, 2 Vivo on full credit', { party_id: rehman?.id, date: day(20), devices: await Promise.all([1, 2].map(async () => ({ device: await phone('Vivo', 'Y17s', 128, 'Green', 'box_pack'), cost: 33000, asking_price: 37000 }))), paid: 0, due_date: day(-10) })
  // used phones bought from walk-in customers: one checked later, one left pending, one flagged
  const usedFromCustomer = async (who, b, m, cost, ask) => step(`used ${b} ${m} bought from ${who?.name}`, async () => post('/purchases', { kind: 'walk_in', party_id: who.id, date: day(15), devices: [{ device: await phone(b, m, 128, 'Black', 'used', 'pta_approved'), cost, asking_price: ask }], paid: cost }))
  const u1 = await usedFromCustomer(usman, 'Apple', 'iPhone 11', 62000, 72000)
  const u2 = await usedFromCustomer(sana, 'Samsung', 'Galaxy A54', 58000, 66000)
  const u3 = await usedFromCustomer(bilal, 'Vivo', 'Y28', 30000, 36000)
  const u1Id = u1?.lines?.[0]?.device_id, u2Id = u2?.lines?.[0]?.device_id, u3Id = u3?.lines?.[0]?.device_id
  if (u3Id) await step('ID check: eGadget flagged on the used Vivo Y28', () => put(`/devices/${u3Id}/verification`, { egadget_result: 'flagged', egadget_ref: 'EG-55120' }))
  if (u2Id) await step('ID check: CNIC + eGadget clear on the A54 (still pending selfie)', () => put(`/devices/${u2Id}/verification`, { seller_party_id: sana?.id, cnic_no: '35202-7654321-2', egadget_result: 'clear' }))

  console.log('\nTablets and watches')
  const sam = brand('Samsung'); const tab = await model(sam, 'Galaxy Tab A9')
  if (sam && tab) await purchase('Samsung Galaxy Tab A9+ (SIM) with spec sheet', { party_id: madina?.id, date: day(25), devices: [{ device: { category: 'tablet', cellular: true, imei1: imei(), brand_id: sam.id, model_id: tab.id, storage_id: st(128).id, colour_id: col('Black').id, condition: 'box_pack', pta_status: 'pta_approved', ram_gb: 8, warranty_months: 12, warranty_by: 'brand', model_number: 'SM-X216B', specs: { os: 'Android 14', display_in: 11, battery_mah: 7040 } }, cost: 61000, asking_price: 68500 }], paid: 61000 })
  const apple = brand('Apple'); const watch = await model(apple, 'Watch Series 9')
  if (apple && watch) await step('used Apple Watch Series 9 (lock checked)', () => post('/devices/opening-stock', { category: 'watch', cellular: false, serial: 'H4KQ9X2LM1', brand_id: apple.id, model_id: watch.id, condition: 'used', grade: 'a', size_mm: 45, battery_health: 92, cost_price: 62000, asking_price: 71000, lock_checks: { activation: 'cleared', paired: 'cleared' } }))

  console.log('\nAccessories (batches, dozen units)')
  const cable = await step('Baseus Type-C cable', () => post('/accessories', { name: 'Baseus Type-C cable 1m', category: 'cable', price: 300, reorder_level: 20, brand: 'Baseus', grade: 'original', color: 'Black', wholesale_price: 220, min_price: 200, warranty_days: 30, location: 'Rack A2' }))
  const charger = await step('25W charger (opening 12)', () => post('/accessories', { name: 'Samsung 25W charger', category: 'charger', price: 1800, reorder_level: 5, brand: 'Samsung', grade: 'original', opening_qty: 12, opening_cost: 1150 }))
  await step('tempered glass (low stock)', () => post('/accessories', { name: 'Tempered glass 9H', category: 'glass', price: 300, reorder_level: 10, opening_qty: 4, opening_cost: 110 }))
  await step('silicone covers', () => post('/accessories', { name: 'Silicone cover iPhone 13', category: 'cover', price: 650, reorder_level: 6, opening_qty: 15, opening_cost: 280 }))
  if (cable) {
    await purchase('cables: 3 dozen @ 1,200', { party_id: rehman?.id, date: day(45), supplier_invoice_no: 'RT-2230', misc: [{ description: cable.name, accessory_id: cable.id, qty: 3, unit: 'dozen', unit_cost: 1200 }], paid: 3600 })
    await purchase('cables: 2 dozen @ 1,320 + freight', { party_id: rehman?.id, date: day(12), misc: [{ description: cable.name, accessory_id: cable.id, qty: 2, unit: 'dozen', unit_cost: 1320 }], extra_costs: 240, paid: 1500 })
  }

  console.log('\nSales: cash, udhaar, part paid, discount, tax, installments, wholesale')
  const pDevs = (p) => (p?.lines ?? []).filter((l) => l.device_id).map((l) => l.device_id)
  const [t1, t2, t3, t4] = pDevs(p1)
  const [a1, a2, a3] = pDevs(p2)
  const [v1] = pDevs(p3)
  const sale = (name, body) => step(name, () => post('/sales', body))
  await sale('cash sale (walk-in) Tecno', { date: day(50), devices: [{ device_id: t1, price: 32000 }], paid: 32000 })
  await sale('sale to Ali with 500 discount', { party_id: ali?.id, date: day(46), devices: [{ device_id: t2, price: 32000 }], discount: 500, paid: 31500 })
  await sale('udhaar sale to Bilal, 10,000 now, due in 7 days', { party_id: bilal?.id, date: day(35), due_date: day(28), devices: [{ device_id: a1, price: 46500 }], paid: 10000 })
  await sale('sale on bank transfer with 18% tax', { party_id: sana?.id, date: day(30), devices: [{ device_id: a2, price: 46000 }], tax_rate: 18, paid: 54280, cash_account_id: bank?.id })
  await sale('installment sale to Usman (advance 15,000, 5 months)', { party_id: usman?.id, date: day(28), devices: [{ device_id: opening.a55, price: 99500 }], paid: 15000, installments: { months: 5, due_day: 10 } })
  // used phones need their ID check before a sale; this one is sold on the owner's say-so (shows in the bypass audit)
  await sale('Easypaisa sale iPhone 13 (owner skips the ID check)', { party_id: ali?.id, date: day(22), devices: [{ device_id: opening.ip13, price: 160000 }], paid: 160000, cash_account_id: ep?.id, override_reason: 'Old customer, bought his last phone here' })
  await sale('wholesale sale to Hamza (dealer price)', { party_id: hamza?.id, date: day(18), devices: [{ device_id: t3, price: 31000 }], paid: 31000 })
  await sale('cash sale Infinix Hot 40', { date: day(9), devices: [{ device_id: opening.hot40, price: 34500 }], paid: 34500 })
  await sale('today: Vivo Y28 cash', { devices: [{ device_id: opening.y28, price: 46000 }], paid: 46000 })
  await sale('today: udhaar Vivo Y17s to Bilal (nothing paid)', { party_id: bilal?.id, devices: [{ device_id: v1, price: 37000 }], paid: 0, due_date: day(-7) })
  if (cable) {
    await sale('accessories: 6 cables + charger', { party_id: ali?.id, date: day(14), misc: [{ description: cable.name, accessory_id: cable.id, qty: 6, unit_price: 300 }, ...(charger ? [{ description: charger.name, accessory_id: charger.id, qty: 1, unit_price: 1800 }] : [])], paid: 3600 })
    await sale('accessories: 4 cables today', { misc: [{ description: cable.name, accessory_id: cable.id, qty: 4, unit_price: 300 }], paid: 1200 })
  }
  // a used phone still under ID check, sold with "I know this customer" (a bypass for the audit)
  if (u2Id) await sale('A54 sold before the ID check finished (bypass with reason)', { party_id: hamza?.id, date: day(6), devices: [{ device_id: u2Id, price: 66000 }], paid: 66000, override_reason: 'I know this customer — regular dealer' })

  console.log('\nSalesman activity (as Kashif)')
  const sm = await step('salesman login', () => session('0333' + PHONE.slice(4), PASS))
  if (sm) {
    const k = client(sm.tokens, shopId)
    await step('Kashif sells a Tecno', () => k.post('/sales', { date: day(4), devices: [{ device_id: t4, price: 32000 }], paid: 32000 }))
    await step('Kashif sells Oppo A78 part paid', () => k.post('/sales', { party_id: sana?.id, date: day(3), devices: [{ device_id: opening.a78, price: 52000 }], paid: 40000 }))
    const wrong = await step('Kashif types a bill twice', () => k.post('/sales', { date: day(2), devices: [{ device_id: a3, price: 46500 }], paid: 46500 }))
    if (wrong) await step('owner voids the duplicate bill', () => post(`/sales/${wrong.id}/void`, { reason: 'typed twice by mistake' }))
  }

  console.log('\nPrice change, returns, payments, transfer')
  if (opening.s23) await step('asking price of the S23 lowered', () => patch(`/devices/${opening.s23}`, { asking_price: 179000 }))
  const ret = await sale('Redmi sold then returned (refund)', { party_id: usman?.id, date: day(11), devices: [{ device_id: opening.redmi, price: 61000 }], paid: 61000, override_reason: 'Seller CNIC seen at the counter' })
  if (ret) await step('sale return with refund', () => post('/returns/sale', { invoice_id: ret.id, line_ids: [ret.lines[0].id], settlement: 'refund', refund_amount: 61000, kept_amount: 0, reason: 'speaker fault' }))
  if (p2?.lines?.[2]) {
    // a3 was voided above, so it is in stock and can go back to the supplier
    await step('purchase return to Madina Telecom', () => post('/returns/purchase', { purchase_id: p2.id, line_ids: [p2.lines[2].id], refund_amount: 0, reason: 'box damaged' }))
  }
  if (bilal) await step('Bilal pays 15,000 of his udhaar (bank)', () => post('/payments', { party_id: bilal.id, direction: 'in', amount: 15000, cash_account_id: bank?.id, date: day(8) }))
  if (usman) await step('Usman pays his first installment', () => post('/payments', { party_id: usman.id, direction: 'in', amount: 16900, date: day(2) }))
  if (madina) await step('paid Madina Telecom 30,000 (bank)', () => post('/payments', { party_id: madina.id, direction: 'out', amount: 30000, cash_account_id: bank?.id, date: day(10) }))
  if (rehman) await step('paid Rehman Traders 20,000 cash', () => post('/payments', { party_id: rehman.id, direction: 'out', amount: 20000, date: day(5) }))
  if (cash && bank) await step('cash deposited in HBL (transfer)', () => post('/ledger/transfers', { from_account_id: cash.id, to_account_id: bank.id, amount: 100000, date: day(7), note: 'weekly deposit' }))

  console.log('\nLen-den (money given / taken with no bill, docs/32)')
  const tariq = await P('Tariq Bhai (neighbour)', '03215550009', ['customer'])
  const lend = (name, party, direction, amount, n, notes, extra = {}) => party && step(name, () => post('/payments', { party_id: party.id, direction, purpose: 'lending', amount, date: day(n), notes, ...extra }))
  await lend('lent Tariq 25,000', tariq, 'out', 25000, 20, 'for his daughter\'s fee')
  await lend('Tariq paid back 10,000', tariq, 'in', 10000, 4, 'first part back')
  await lend('borrowed 50,000 from Star Mobiles (bank)', otherShop, 'in', 50000, 15, 'short for the Madina bill', { cash_account_id: bank?.id })
  await lend('Usman left 15,000 with the shop', usman, 'in', 15000, 12, 'keep it, he will buy later')
  await lend('lent Bilal 3,000 today', bilal, 'out', 3000, 0, null)

  console.log('\nLoan, repairs, expenses')
  if (otherShop && opening.ip12) await step('iPhone 12 lent to Star Mobiles', () => post('/loans', { device_id: opening.ip12, party_id: otherShop.id, expected_back_at: day(-3), notes: 'customer wants to see it' }))
  await step('repair: Samsung A54 screen (advance 3,000)', () => post('/repairs', { party_id: ali?.id, device_desc: 'Samsung A54 — screen broken', imei: '490154203237526', fault_codes: ['screen'], estimate: 9500, advance: 3000 }))
  await step('repair: iPhone 11 battery', () => post('/repairs', { party_id: sana?.id, device_desc: 'iPhone 11 — battery drains', fault_codes: ['battery'], estimate: 7000, advance: 0 }))
  const cats = (await get('/expenses/categories').catch(() => [])) ?? []
  const cat = (k) => cats.find((c) => c.key === k)
  for (const [k, amount, n, desc] of [['rent', 85000, 30, 'shop rent'], ['salary', 45000, 29, 'Kashif salary'], ['electricity', 18200, 20, null], ['mobile_bill', 3500, 19, null], ['tea', 1200, 6, null], ['transport', 1500, 3, 'Hall Road trip'], ['tea', 900, 1, null], ['other', 4500, 12, 'AC service'], ['owner_drawing', 20000, 9, 'home expenses'], ['advance', 5000, 8, 'Kashif advance'],
    // this month and today, so the 'today' and 'this month' screens have expenses too
    ['electricity', 2600, 0, 'generator fuel'], ['tea', 450, 0, null], ['transport', 700, 0, 'parcel to customer'], ['other', 1500, 0, 'shop cleaning'], ['advance', 2000, 0, 'Imran advance'], ['mobile_bill', 1200, 1, 'internet']]) {
    const c = cat(k)
    if (c) await step(`expense ${c.key} ${amount}`, () => post('/expenses', { category_id: c.id, amount, date: day(n), description: desc }))
  }

  console.log('\n────────────────────────────────────────')
  console.log(`Demo shop "${SHOP}" ready.`)
  console.log(`  Owner     ${PHONE} / ${PASS}`)
  console.log(`  Manager   0322${PHONE.slice(4)} / ${PASS}`)
  console.log(`  Salesman  0333${PHONE.slice(4)} / ${PASS}`)
  console.log(failed.length ? `  ${failed.length} step(s) skipped: ${failed.join('; ')}` : '  every step went through')
}

main().catch((e) => { console.error(e); process.exit(1) })
