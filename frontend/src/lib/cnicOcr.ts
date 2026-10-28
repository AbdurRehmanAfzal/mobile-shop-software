/** Read a Pakistani CNIC from a photo, on the phone itself (owner, 2026-10-28): the picture is never
 *  sent anywhere; only the OCR program (tesseract.js) is downloaded once. English fields are read
 *  well (number, names, dates, gender); the Urdu address on the back is not, so it is left for
 *  the shopkeeper to type. Always shown to the user to check before saving. */

export interface CnicData {
  cnic?: string // 35502-0193165-3
  name?: string
  fatherName?: string
  gender?: 'M' | 'F'
  dob?: string // DD.MM.YYYY as printed
  issue?: string
  expiry?: string
  expired?: boolean
}

const DATE = /\b(\d{2})[.\-/ ](\d{2})[.\-/ ](\d{4})\b/g

function toDate(d: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

/** "ABDUR REHMAN AFZAL" / "abdur rehman afzal" -> "Abdur Rehman Afzal" */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

const LABELS = /^(name|father|husband|gender|country|stay|identity|number|date|birth|issue|expiry|pakistan|islamic|republic|national|card|holder|signature)$/i

/** a name in a line: the longest run of name-like words (Abdur / ABDUR, 3+ letters), so OCR crumbs
 *  around it ("ee. Abdur Rehman Afzal Ca |") are dropped; at least two words */
function cleanName(line: string | undefined): string | undefined {
  if (!line) return undefined
  let best: string[] = []
  let run: string[] = []
  for (const w of line.split(/[^A-Za-z]+/)) {
    // a real name word has a vowel: "Bly" is the Urdu name next to it misread
    if (/^([A-Z][a-z]{2,}|[A-Z]{3,})$/.test(w) && /[aeiou]/i.test(w) && !LABELS.test(w)) run.push(w)
    else run = []
    if (run.length > best.length) best = [...run]
  }
  return best.length >= 2 ? titleCase(best.join(' ')) : undefined
}

/** the line after a label, e.g. "Name" -> "Abdur Rehman Afzal" (also "Name Abdur Rehman" on one line) */
function after(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i])
    if (!m) continue
    const rest = cleanName(lines[i].slice(m.index + m[0].length))
    if (rest && rest.split(' ').length >= 2) return rest
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const n = cleanName(lines[j])
      if (n) return n
    }
  }
  return undefined
}

/** pick the fields out of the OCR text of the card's front (and/or back) */
export function parseCnicText(text: string, today = new Date()): CnicData {
  const out: CnicData = {}
  const flat = text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[Il|](?=\d{4})/g, '1')
  // with dashes first: OCR often runs the number into the date printed next to it ("…-1 10.03.1990"
  // read as "…-10.03.1990"), so after a dash only one digit is taken; then 13 digits with or without spaces and dashes
  const num =
    /(\d{5})\s*[-–—~]\s*(\d{7})\s*[-–—~]\s*(\d)/.exec(flat) ??
    /(?<!\d)(\d{5})\s*[-–—~]?\s*(\d{7})\s*[-–—~]?\s*(\d)(?!\d)/.exec(flat)
  if (num) out.cnic = `${num[1]}-${num[2]}-${num[3]}`
  // take the number out before looking for dates: "…-1" glued to "10.03.1990" hides the date
  const rest = num ? flat.replace(num[0], ' ') : flat

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  out.name = after(lines, /(?<!father\s|husband\s)\bname\b/i)
  out.fatherName = after(lines, /(father|husband)\s*name/i)
  if (out.name && (!out.fatherName || out.fatherName === out.name)) {
    const i = lines.findIndex((l) => cleanName(l) === out.name)
    out.fatherName = undefined
    for (let j = i + 1; i >= 0 && j < Math.min(i + 4, lines.length); j++) {
      if (/gender|identity|\d{5}/i.test(lines[j])) break
      const n = cleanName(lines[j])
      if (n && n !== out.name) {
        out.fatherName = n
        break
      }
    }
  }

  const g = /gender[^A-Za-z]*([MF])\b/i.exec(text) ?? /\n\s*([MF])\s+(pakistan|country)/i.exec(text)
  if (g) out.gender = g[1].toUpperCase() as 'M' | 'F'

  // dates in print order are birth, issue, expiry; sorting them gives the same when one is missing
  const dates = [...rest.matchAll(DATE)]
    .map((m) => `${m[1]}.${m[2]}.${m[3]}`)
    .filter((d, i, a) => toDate(d) && a.indexOf(d) === i)
    .sort((a, b) => toDate(a)!.getTime() - toDate(b)!.getTime())
  // a CNIC is made at 18 or later, so only a date at least 18 years back can be the birth date;
  // of the others, one still ahead is the expiry and a past one the issue date (an expired card
  // whose expiry was not read cannot be told apart, so no "expired" claim then)
  const adult = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).getTime()
  if (dates.length && toDate(dates[0])!.getTime() <= adult) out.dob = dates.shift()
  if (dates.length >= 2) [out.issue, out.expiry] = [dates[dates.length - 2], dates[dates.length - 1]]
  else if (dates.length === 1) {
    if (toDate(dates[0])!.getTime() > today.getTime()) out.expiry = dates[0]
    else out.issue = dates[0]
  }
  if (out.expiry) out.expired = toDate(out.expiry)!.getTime() < today.getTime()
  return out
}

/** what does not fit a field of its own, for the person's notes: "S/O ... · Born ... · CNIC valid till ..." */
export function cnicNote(d: CnicData, pick: (k: string) => string): string {
  const bits = [
    d.fatherName ? `${pick('cnicScan.father')} ${d.fatherName}` : '',
    d.dob ? `${pick('cnicScan.born')} ${d.dob}` : '',
    d.expiry ? `${pick('cnicScan.validTill')} ${d.expiry}${d.expired ? ` (${pick('cnicScan.expiredShort')})` : ''}` : '',
  ].filter(Boolean)
  return bits.join(' · ')
}

/** run OCR on a photo (English) and parse it; `onProgress` gets 0..1 */
export async function readCnic(file: File, onProgress?: (p: number) => void): Promise<CnicData> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const clean = parseCnicText((await worker.recognize(await blackAndWhite(file))).data.text)
    if (clean.cnic || clean.name) return clean
    return parseCnicText((await worker.recognize(file)).data.text)
  } finally {
    await worker.terminate()
  }
}

/** about 2000 px wide, grey, then only the dark ink kept: on a scanned card this read the father's
 *  name and the expiry that the plain photo missed (tested 2026-10-28) */
async function blackAndWhite(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(2, 2000 / bmp.width)
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  const g = c.getContext('2d')!
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = y < 110 ? 0 : 255
  }
  g.putImageData(img, 0, 0)
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'))
}
