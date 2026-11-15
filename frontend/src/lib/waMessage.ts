/** WhatsApp entry messages (owner 2026-11-15, ADR-079). The shop's staff post every sale, purchase,
 *  payment and len-den in WhatsApp groups; whoever keeps the software enters them. One standard
 *  message per entry — a title line, then "Key: value" lines — that people can write by hand or make
 *  in the app, and that the app reads back. The reader is forgiving: Roman Urdu / Urdu keys, any
 *  order, WhatsApp bold (*…*), amounts like 1,25,000 / 125k / 1.25 lakh, and an IMEI or a mobile
 *  number found anywhere in the text. Nothing is saved from here: the reader only fills the usual
 *  forms, which check everything as always. */

export type WaKind = 'sale' | 'purchase' | 'received' | 'paid' | 'lending'
export type WaMethod = 'cash' | 'online' | 'cheque'
export type WaCondition = 'box_pack' | 'open_box' | 'used' | 'patched'
export type WaPta = 'pta_approved' | 'non_pta' | 'jv' | 'cpid'

export interface WaFields {
  mobile?: string
  imeis: string[]
  person?: string
  phone?: string
  cnic?: string
  price?: number
  paid?: number
  method?: WaMethod
  udhaar?: number
  cost?: number
  asking?: number
  condition?: WaCondition
  pta?: WaPta
  battery?: number
  storage?: string
  ram?: number
  amount?: number
  /** len-den: the shop gave (out) or took (in) */
  lendDir?: 'out' | 'in'
  due?: string
  by?: string
  note?: string
}
export interface WaParsed extends WaFields {
  kind: WaKind | null
  /** lines the reader did not understand, shown to the person entering */
  unknown: string[]
}

export const KINDS: WaKind[] = ['sale', 'purchase', 'received', 'paid', 'lending']
const TITLE: Record<WaKind, string> = { sale: 'SALE', purchase: 'PURCHASE', received: 'PAYMENT RECEIVED', paid: 'PAYMENT PAID', lending: 'LEN DEN' }

/** the lines of each message, in order: [key written in the message, field] */
const LINES: Record<WaKind, [string, keyof WaFields][]> = {
  sale: [['Mobile', 'mobile'], ['IMEI', 'imeis'], ['Customer', 'person'], ['Phone', 'phone'], ['Price', 'price'], ['Paid', 'paid'], ['Udhaar', 'udhaar'], ['By', 'by'], ['Note', 'note']],
  purchase: [['Mobile', 'mobile'], ['IMEI', 'imeis'], ['Condition', 'condition'], ['PTA', 'pta'], ['Battery', 'battery'], ['From', 'person'], ['Phone', 'phone'], ['CNIC', 'cnic'], ['Cost', 'cost'], ['Asking', 'asking'], ['Paid', 'paid'], ['Udhaar', 'udhaar'], ['By', 'by'], ['Note', 'note']],
  received: [['Name', 'person'], ['Phone', 'phone'], ['Amount', 'amount'], ['Method', 'method'], ['By', 'by'], ['Note', 'note']],
  paid: [['Name', 'person'], ['Phone', 'phone'], ['Amount', 'amount'], ['Method', 'method'], ['By', 'by'], ['Note', 'note']],
  lending: [['Name', 'person'], ['Phone', 'phone'], ['Diya', 'amount'], ['Liya', 'amount'], ['Method', 'method'], ['Wapsi', 'due'], ['By', 'by'], ['Note', 'note']],
}

const COND_TXT: Record<WaCondition, string> = { box_pack: 'Box pack', open_box: 'Open box', used: 'Used', patched: 'Patched' }
const PTA_TXT: Record<WaPta, string> = { pta_approved: 'PTA', non_pta: 'Non-PTA', jv: 'JV', cpid: 'CP ID' }
const METHOD_TXT: Record<WaMethod, string> = { cash: 'cash', online: 'online', cheque: 'cheque' }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** the standard message: filled lines only, or every line empty for a blank template */
export function buildMessage(kind: WaKind, f: Partial<WaFields>, blank = false): string {
  const out = [`*${TITLE[kind]}*`]
  for (const [key, field] of LINES[kind]) {
    if (kind === 'lending' && field === 'amount' && !blank && ((key === 'Diya') !== (f.lendDir !== 'in'))) continue
    let v = ''
    const x = f[field]
    if (field === 'imeis') v = (f.imeis ?? []).join(', ')
    else if (field === 'condition' && x) v = COND_TXT[x as WaCondition]
    else if (field === 'pta' && x) v = PTA_TXT[x as WaPta]
    else if (field === 'battery' && x != null) v = `${x}%`
    else if (field === 'paid' && x != null) v = `${fmt(x as number)}${f.method ? ` ${METHOD_TXT[f.method]}` : ''}`
    else if (field === 'method' && x) v = METHOD_TXT[x as WaMethod]
    else if (typeof x === 'number') v = fmt(x)
    else if (typeof x === 'string') v = x.trim()
    if (v || blank) out.push(`${key}: ${v}`)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------- reading

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '')

/** written key → field; Roman Urdu and Urdu words people use */
const KEYS: [string[], keyof WaFields | 'kind' | 'diya' | 'liya'][] = [
  [['type', 'kind', 'entry', 'qisam'], 'kind'],
  [['mobile', 'model', 'set', 'device', 'handset', 'mobilemodel', 'phonemodel', 'موبائل', 'ماڈل'], 'mobile'],
  [['imei', 'imei1', 'imei2', 'imeino', 'imeinumber', 'imeis'], 'imeis'],
  [['customer', 'gahak', 'gahk', 'grahak', 'buyer', 'kharidar', 'khareedar', 'name', 'naam', 'party', 'person', 'banda', 'seller', 'dealer', 'supplier', 'from', 'bechnewala', 'to', 'گاہک', 'نام', 'ڈیلر'], 'person'],
  [['phone', 'phoneno', 'number', 'no', 'mobileno', 'mobilenumber', 'cell', 'contact', 'fon', 'whatsapp', 'نمبر', 'فون'], 'phone'],
  [['cnic', 'idcard', 'id', 'shanakhti', 'nic', 'شناختی'], 'cnic'],
  [['price', 'rate', 'qeemat', 'qimat', 'keemat', 'sale', 'bill', 'total', 'قیمت'], 'price'],
  [['paid', 'paidnow', 'diye', 'advance', 'jama', 'cash', 'adaigi', 'payment', 'وصول', 'ادا'], 'paid'],
  [['udhaar', 'udhar', 'udhaar', 'baqi', 'baki', 'remaining', 'balance', 'credit', 'ادھار', 'باقی'], 'udhaar'],
  [['cost', 'costprice', 'purchaseprice', 'khareed', 'kharid', 'buyprice', 'purchase', 'خرید'], 'cost'],
  [['asking', 'askingprice', 'saleprice', 'sellprice', 'bechna', 'farokht'], 'asking'],
  [['condition', 'halat', 'haalat', 'حالت'], 'condition'],
  [['pta', 'ptastatus'], 'pta'],
  [['battery', 'bh', 'batteryhealth', 'bat', 'بیٹری'], 'battery'],
  [['storage', 'memory', 'rom', 'gb', 'space'], 'storage'],
  [['ram'], 'ram'],
  [['amount', 'raqam', 'rakam', 'rupay', 'rupees', 'rs', 'رقم'], 'amount'],
  [['diya', 'diye', 'gave', 'given', 'dia', 'دیا'], 'diya'],
  [['liya', 'liye', 'took', 'taken', 'lia', 'لیا'], 'liya'],
  [['method', 'via', 'mode', 'tareeqa', 'tariqa', 'zariya', 'paymentmethod', 'طریقہ'], 'method'],
  [['wapsi', 'returndate', 'due', 'duedate', 'date', 'tareekh', 'واپسی'], 'due'],
  [['by', 'staff', 'salesman', 'bheja', 'entryby', 'سیلزمین'], 'by'],
  [['note', 'notes', 'remarks', 'detail', 'details', 'nota', 'نوٹ'], 'note'],
]
const KEY_OF = new Map<string, (typeof KEYS)[number][1]>()
for (const [words, f] of KEYS) for (const w of words) if (!KEY_OF.has(norm(w))) KEY_OF.set(norm(w), f)

export function kindOf(text: string): WaKind | null {
  const t = text.toLowerCase()
  if (/len\s*-?\s*den|lending|qarz|قرض|لین\s*دین/.test(t)) return 'lending'
  if (/purchase|bought|\bbuy\b|khar[e]?ed[ae]?|kharida|خرید/.test(t)) return 'purchase'
  if (/\bsale\b|\bsold\b|\bsell\b|becha|bechi|farokht|فروخت/.test(t)) return 'sale'
  if (/received|recieved|wusool|wasool|mile\b|aaye|وصول/.test(t)) return 'received'
  if (/\bpaid\b|payment\s*paid|adaigi|ada\s*kiy|\bgave\b|ادا/.test(t)) return 'paid'
  return null
}

/** 1,25,000 · 125000 · 125k · 1.25 lakh · Rs. 25,000/- → a number of rupees */
export function parseAmount(s: string): number | undefined {
  const t = s.toLowerCase().replace(/rs\.?|pkr|\/-|rupees?|rupay/g, ' ')
  const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(lakh|lac|lacs|lakhs|l\b|k\b|hazar|hazaar|thousand)?/)
  if (!m) return undefined
  const n = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return undefined
  const unit = m[2] ?? ''
  const v = /^l/.test(unit) ? n * 100_000 : /^(k|hazar|hazaar|thousand)/.test(unit) ? n * 1000 : n
  return Math.round(v)
}

export function methodOf(s: string): WaMethod | 'udhaar' | undefined {
  const t = s.toLowerCase()
  if (/udh?aa?r|credit|ادھار/.test(t)) return 'udhaar'
  if (/cheque|check|چیک/.test(t)) return 'cheque'
  if (/online|bank|jazz|easy\s*paisa|easypaisa|ibft|transfer|raast|sadapay|nayapay|آن\s*لائن|بینک/.test(t)) return 'online'
  if (/cash|naqd|naqad|نقد/.test(t)) return 'cash'
  return undefined
}

function conditionOf(s: string): WaCondition | undefined {
  const t = s.toLowerCase()
  if (/open\s*box/.test(t)) return 'open_box'
  if (/box\s*pack|sealed|new\b|naya/.test(t)) return 'box_pack'
  if (/patch/.test(t)) return 'patched'
  if (/used|use\b|purana|second/.test(t)) return 'used'
  return undefined
}

function ptaOf(s: string): WaPta | undefined {
  const t = s.toLowerCase()
  if (/non\s*-?\s*pta|nonpta|not\s*pta/.test(t)) return 'non_pta'
  if (/\bjv\b/.test(t)) return 'jv'
  if (/cp\s*-?\s*id/.test(t)) return 'cpid'
  if (/pta/.test(t)) return 'pta_approved'
  return undefined
}

/** a valid IMEI: 15 digits with the right check digit */
export function isImei(s: string): boolean {
  if (!/^\d{15}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let x = Number(s[i])
    if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 }
    sum += x
  }
  return sum % 10 === 0
}

function imeisIn(s: string): string[] {
  const joined = s.replace(/(\d)[\s-]+(?=\d)/g, '$1')
  return (joined.match(/\d{15,17}/g) ?? []).map((x) => x.slice(0, 15)).filter(isImei)
}

function phoneIn(s: string): string | undefined {
  const m = s.replace(/[\s-]/g, '').match(/(?:\+?92|0092|0)?(3\d{9})(?!\d)/)
  return m ? `0${m[1]}` : undefined
}

function storageOf(s: string): { storage?: string; ram?: number } {
  const pair = s.match(/(\d{1,2})\s*\/\s*(\d{2,4})\b/)
  if (pair) return { ram: Number(pair[1]), storage: `${pair[2]}GB` }
  const one = s.match(/(\d{2,4})\s*(gb|tb)\b/i)
  if (one) return { storage: one[2].toLowerCase() === 'tb' ? `${one[1]}TB` : `${one[1]}GB` }
  return {}
}

export function parseMessage(text: string): WaParsed {
  const out: WaParsed = { kind: null, imeis: [], unknown: [] }
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/[*_~`]/g, '').trim()).filter(Boolean)
  let lendAmount: number | undefined
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^([^:=\-–]{1,30}?)\s*[:=\-–]\s*(.*)$/)
    const key = m ? KEY_OF.get(norm(m[1])) : undefined
    const value = m ? m[2].trim() : line
    for (const x of imeisIn(line)) if (!out.imeis.includes(x)) out.imeis.push(x)
    if (!key) {
      if (i === 0 || !out.kind) {
        const k = kindOf(line)
        if (k && !out.kind) { out.kind = k; continue }
      }
      if (!imeisIn(line).length && !phoneIn(line)) out.unknown.push(line)
      else if (!out.phone) out.phone = phoneIn(line)
      continue
    }
    if (!value) continue
    switch (key) {
      case 'kind': out.kind = kindOf(value) ?? out.kind; break
      case 'mobile': {
        if (/^[\d\s+-]+$/.test(value) && phoneIn(value)) { out.phone = phoneIn(value); break }
        out.mobile = value
        const st = storageOf(value)
        out.storage ??= st.storage
        out.ram ??= st.ram
        break
      }
      case 'imeis': break // read above, from every line
      case 'person': out.person = value; break
      case 'phone': out.phone = phoneIn(value) ?? out.phone; break
      case 'cnic': out.cnic = value.replace(/[^\d-]/g, '') || undefined; break
      case 'price': out.price = parseAmount(value); break
      case 'paid': {
        const mt = methodOf(value)
        if (mt === 'udhaar') { out.paid = parseAmount(value) ?? 0; break }
        out.paid = parseAmount(value)
        if (mt) out.method = mt
        break
      }
      case 'udhaar': out.udhaar = parseAmount(value); break
      case 'cost': out.cost = parseAmount(value); break
      case 'asking': out.asking = parseAmount(value); break
      case 'condition': out.condition = conditionOf(value); break
      case 'pta': out.pta = ptaOf(value); break
      case 'battery': out.battery = parseAmount(value); break
      case 'storage': Object.assign(out, { storage: storageOf(value).storage ?? (/^\d+$/.test(value) ? `${value}GB` : value) }); break
      case 'ram': out.ram = parseAmount(value); break
      case 'amount': lendAmount = out.amount = parseAmount(value); { const mt = methodOf(value); if (mt && mt !== 'udhaar') out.method ??= mt } break
      case 'diya': out.lendDir = 'out'; lendAmount = out.amount = parseAmount(value); break
      case 'liya': out.lendDir = 'in'; lendAmount = out.amount = parseAmount(value); break
      case 'method': { const mt = methodOf(value); if (mt && mt !== 'udhaar') out.method = mt; break }
      case 'due': out.due = value; break
      case 'by': out.by = value; break
      case 'note': out.note = value; break
    }
  }
  // the details people put in the model line
  if (out.mobile) {
    out.condition ??= conditionOf(out.mobile)
    out.pta ??= ptaOf(out.mobile)
  }
  if (!out.kind) out.kind = kindOf(text)
  // a purchase: "Price" is what the shop paid for it
  if (out.kind === 'purchase' && out.cost == null && out.price != null) { out.cost = out.price; out.price = undefined }
  // a payment / len-den: the amount may be written as Price / Paid
  if ((out.kind === 'received' || out.kind === 'paid' || out.kind === 'lending') && out.amount == null) out.amount = lendAmount ?? out.paid ?? out.price
  if (out.kind === 'lending' && !out.lendDir) out.lendDir = /liya|took|taken|لیا/i.test(text) ? 'in' : 'out'
  // the udhaar line, when Paid is missing
  const bill = out.kind === 'purchase' ? out.cost : out.price
  if (out.paid == null && bill != null && out.udhaar != null) out.paid = Math.max(0, bill - out.udhaar)
  return out
}
