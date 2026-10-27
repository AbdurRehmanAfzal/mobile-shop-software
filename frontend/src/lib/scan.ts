/** Reading IMEI barcodes (box label, *#06# screen). A box has several barcodes (IMEI 1, IMEI 2, EAN,
 *  serial), so every code found is kept and only 15-digit numbers that pass the IMEI check count. */

import type { Result } from '@zxing/library'
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

async function reader() {
  const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  // look harder: phone screens and box labels have thin bars
  return new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER, true]]))
}

/** Live camera (needs https or localhost). Calls onImei once and stops. */
export async function scanLive(video: HTMLVideoElement, onImei: (imei: string) => void): Promise<() => void> {
  const r = await reader()
  let done = false
  const controls = await r.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res?: Result) => {
    const imei = res ? imeiFrom(res.getText()) : null
    if (imei && !done) {
      done = true
      controls.stop()
      onImei(imei)
    }
  })
  return () => controls.stop()
}

export const canScanLive = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

/** From a photo: the whole picture, then overlapping strips, so a label with many barcodes still gives
 *  each one a turn. Returns the IMEIs found (first = best guess). */
export async function scanPhoto(file: File): Promise<string[]> {
  const img = await createImageBitmap(file)
  const found = new Set<string>()
  // the browser's own detector (Chrome on Android) finds every code at once
  const BD = (window as unknown as { BarcodeDetector?: new () => { detect: (s: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (BD) {
    try {
      for (const c of await new BD().detect(img)) {
        const imei = imeiFrom(c.rawValue)
        if (imei) found.add(imei)
      }
    } catch {
      /* fall through to zxing */
    }
  }
  if (!found.size) {
    const r = await reader()
    // small pictures (screenshots) are blown up 2x so each bar is wide enough to read
    const scale = Math.min(Math.max(1, 1000 / img.width), 2, 1600 / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const tries: [number, number][] = [[0, h]]
    for (const parts of [4, 8]) {
      const band = Math.round(h / parts)
      for (let y = 0; y + band <= h; y += Math.round(band / 2)) tries.push([y, band])
    }
    for (const [y, bh] of tries) {
      if (found.size >= 2) break // IMEI 1 and 2: nothing more to look for
      const c = document.createElement('canvas')
      c.width = w
      c.height = bh
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = false
      g.drawImage(img, 0, y / scale, img.width, bh / scale, 0, 0, w, bh)
      try {
        const imei = imeiFrom(r.decodeFromCanvas(c).getText())
        if (imei) found.add(imei)
      } catch {
        /* no code in this strip */
      }
    }
  }
  img.close()
  return [...found]
}
