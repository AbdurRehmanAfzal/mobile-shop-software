/** Reading IMEI barcodes (box label, *#06# screen). A box has several barcodes (IMEI 1, IMEI 2, EAN,
 *  serial), so every code found is kept and only 15-digit numbers that pass the IMEI check count. */

import { toLatinDigits } from './format'

/** Luhn check, the same one the backend uses for IMEIs */
export function luhnOk(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** "IMEI1:490154203237518" / "490154203237518" -> the IMEI, else null. Exactly 15 digits in a row,
 *  so the 32-digit EID or a 13-digit shop code on the same screen/label never passes. */
export function imeiFrom(text: string): string | null {
  for (const m of toLatinDigits(text).match(/(?<!\d)\d{15}(?!\d)/g) ?? []) if (luhnOk(m)) return m
  return null
}

type Reader = InstanceType<typeof import('@zxing/browser').BrowserMultiFormatReader>

/** `hard`: zxing's slow, thorough mode, for a last try on the whole picture */
async function reader(hard = false): Promise<Reader> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  // IMEI barcodes are Code 128 (a few older boxes Code 39); looking only for those is much faster
  const hints = new Map<number, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39]]])
  if (hard) hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints as never)
}

function decodeStrip(r: Reader, img: ImageBitmap, y: number, h: number, scale: number): string | null {
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(Math.min(h, img.height - y) * scale)
  c.getContext('2d')!.drawImage(img, 0, y, img.width, c.height / scale, 0, 0, c.width, c.height)
  try {
    return r.decodeFromCanvas(c).getText()
  } catch {
    return null // no code in this strip
  }
}

/** Live camera (needs https or localhost): a frame every 1/3 s goes through the same strip reading as
 *  a photo, so a label full of barcodes still gives the IMEI. Calls onImei once and stops. */
/** `exclude`: an IMEI already filled in (IMEI 1 when scanning IMEI 2): it is skipped, so the box label's
 *  second barcode is taken instead of the first one again (owner, 2026-10-28). */
export async function scanLive(video: HTMLVideoElement, onImei: (imei: string) => void, exclude?: string): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
  video.srcObject = stream
  await video.play()
  let stopped = false
  let timer: number | undefined
  const stop = () => {
    stopped = true
    window.clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
  }
  const tick = async () => {
    if (stopped) return
    if (video.videoWidth) {
      const frame = await createImageBitmap(video)
      const found = (await scanBitmap(frame, false)).filter((x) => x !== exclude)
      frame.close()
      if (found.length && !stopped) {
        stop()
        onImei(found[0])
        return
      }
    }
    timer = window.setTimeout(tick, 330)
  }
  void tick()
  return stop
}

export const canScanLive = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

/** From a photo: the whole picture, then overlapping strips, so a label with many barcodes still gives
 *  each one a turn. Returns the IMEIs found (first = best guess). */
/** `any`: return every code read (shop labels, maker's barcodes), not only IMEIs */
export async function scanPhoto(file: File, any = false): Promise<string[]> {
  const img = await createImageBitmap(file)
  try {
    return await scanBitmap(img, true, any)
  } finally {
    img.close()
  }
}

/** `thorough`: one last slow pass over the whole picture (photos; too slow for every video frame) */
async function scanBitmap(img: ImageBitmap, thorough = true, any = false): Promise<string[]> {
  const keep = (text: string | null) => (any ? (text?.trim() || null) : text ? imeiFrom(text) : null)
  const found = new Set<string>()
  // the browser's own detector (Chrome on Android) finds every code at once
  const BD = (window as unknown as { BarcodeDetector?: new () => { detect: (s: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (BD) {
    try {
      for (const c of await new BD().detect(img)) {
        const imei = keep(c.rawValue)
        if (imei) found.add(imei)
      }
    } catch {
      /* fall through to zxing */
    }
  }
  if (!found.size) {
    const [fast, hard] = await Promise.all([reader(false), reader(true)])
    // the picture is cut into thin strips, one barcode each (a label stacks EID, serial, IMEI 1, IMEI 2);
    // narrow pictures are widened so each bar is wide enough to read
    const scale = Math.min(2, Math.max(1, 1200 / img.width))
    const band = Math.max(24, Math.round(img.height / 16))
    for (let y = 0; y + band / 2 < img.height && found.size < 2; ) {
      const text = decodeStrip(fast, img, y, band, scale)
      const imei = keep(text)
      if (imei) found.add(imei)
      // after a code is read, jump past it; otherwise slide half a strip
      y += text ? band : Math.round(band / 2)
    }
    if (!found.size && thorough) {
      const text = decodeStrip(hard, img, 0, img.height, scale)
      const imei = keep(text)
      if (imei) found.add(imei)
    }
  }
  return [...found]
}
