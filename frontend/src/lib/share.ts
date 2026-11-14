/** Download and share for every report and invoice (owner, 2026-10-28: "har kisam ki report mein
 *  download aur share"). A PDF is made on the phone from the server's print page, drawn by the
 *  browser so Urdu (Nastaliq) comes out right; Excel/CSV come from the server as they are.
 *  Browser: download link / the phone's share sheet. Android app: saved in Documents / shared
 *  through Capacitor's Share (WhatsApp, Gmail...). */

import { Capacitor } from '@capacitor/core'
import { withDocLang } from './docLang'
import { BASE, authHeaders } from './files'

export interface DocFile {
  blob: Blob
  name: string
}

async function fetchOk(path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res
}

/** an Excel / CSV export with the server's file name */
export async function fetchFile(path: string, fallbackName: string): Promise<DocFile> {
  const res = await fetchOk(path)
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  return { blob: await res.blob(), name }
}

const MM = 96 / 25.4 // CSS px per mm
const fontData = new Map<string, Promise<string>>()

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => fail(r.error)
    r.readAsDataURL(blob)
  })
}

/** The page's Google font stylesheets with the font files inside them: a picture drawn from SVG
 *  may not load anything from outside, and without Nastaliq the Urdu would fall apart. */
async function inlineFonts(doc: Document): Promise<void> {
  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]'))) {
    try {
      let css = await (await fetch(link.href)).text()
      const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) ?? [])]
      const inline = await Promise.all(urls.map((u) => {
        if (!fontData.has(u)) fontData.set(u, fetch(u).then((r) => r.blob()).then(dataUrl))
        return fontData.get(u)!
      }))
      urls.forEach((u, i) => { css = css.split(u).join(inline[i]) })
      const style = doc.createElement('style')
      style.textContent = css
      link.replaceWith(style)
    } catch {
      link.remove() // offline: the phone's own fonts
    }
  }
}

/** The server's print page (receipt, job sheet, report "pdf") as a PDF file, drawn by the browser
 *  itself so Urdu reads exactly as on screen. Thermal receipts become one long 80 mm page;
 *  everything else A4 pages, cut between lines of text. */
export async function printPagePdf(path: string, name: string): Promise<DocFile> {
  path = withDocLang(path)
  const html = await (await fetchOk(path)).text()
  const thermal = /format=thermal/.test(path)
  const widthPx = Math.round((thermal ? 80 : 210) * MM)
  // laid out once in a hidden frame, with the fonts, to know how tall it is
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:100px;border:0;background:#fff`
  document.body.appendChild(frame)
  let heightPx: number
  let xhtml: string
  try {
    const win = frame.contentWindow!
    const doc = frame.contentDocument!
    const loaded = new Promise<void>((ok) => {
      win.addEventListener('load', () => ok(), { once: true })
      setTimeout(ok, 8000)
    })
    doc.open()
    doc.write(html)
    doc.close()
    await loaded
    await inlineFonts(doc)
    await Promise.race([doc.fonts.ready, new Promise((ok) => setTimeout(ok, 6000))])
    doc.documentElement.style.background = '#fff'
    doc.body.style.paddingBottom = '16px'
    heightPx = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.getBoundingClientRect().bottom + 16))
    xhtml = new XMLSerializer().serializeToString(doc.documentElement)
  } finally {
    frame.remove()
  }

  // phones refuse canvases much over ~16 million pixels
  const scale = Math.max(0.6, Math.min(2, Math.sqrt(16e6 / (widthPx * heightPx))))
  const W = Math.round(widthPx * scale)
  const H = Math.round(heightPx * scale)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${widthPx} ${heightPx}"><foreignObject x="0" y="0" width="${widthPx}" height="${heightPx}">${xhtml}</foreignObject></svg>`
  // a data: address (a blob: one would lock the canvas against export in Chrome)
  const img = new Image()
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok()
    img.onerror = () => fail(new Error('Could not draw the page'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)

  const { jsPDF } = await import('jspdf')
  let pdf: InstanceType<typeof jsPDF>
  if (thermal) {
    const w = 80
    const h = (H / W) * w
    pdf = new jsPDF({ unit: 'mm', format: [w, Math.max(h, 40)] })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h)
  } else {
    pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageW = 210
    const margin = 10
    const perPage = Math.floor(((297 - 2 * margin) / pageW) * W) // canvas px per page
    // owner 2026-11-14 (ADR-075): the whole page drawn once is shrunk to fit the phone's limit, so
    // a long report came out blurred. The pages are found on that drawing (never through a line),
    // then each page is drawn again on its own at twice the size, so every page stays sharp.
    const cuts: [number, number][] = []
    let top = 0
    while (top < H - 2) {
      const bottom = top + perPage >= H ? H : cutAt(canvas, top + perPage, Math.round(perPage * 0.15))
      cuts.push([top, bottom])
      top = bottom
    }
    const S = 2
    let first = true
    for (const [t, b] of cuts) {
      let data: string
      let hMm: number
      try {
        const y = t / scale
        const h = (b - t) / scale
        const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(widthPx * S)}" height="${Math.round(h * S)}" viewBox="0 ${y} ${widthPx} ${h}"><foreignObject x="0" y="0" width="${widthPx}" height="${heightPx}">${xhtml}</foreignObject></svg>`
        const pi = new Image()
        await new Promise<void>((ok, fail) => {
          pi.onload = () => ok()
          pi.onerror = () => fail(new Error('page'))
          pi.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(page)}`
        })
        const pc = document.createElement('canvas')
        pc.width = Math.round(widthPx * S)
        pc.height = Math.round(h * S)
        const px = pc.getContext('2d')!
        px.fillStyle = '#fff'
        px.fillRect(0, 0, pc.width, pc.height)
        px.drawImage(pi, 0, 0, pc.width, pc.height)
        data = pc.toDataURL('image/jpeg', 0.92)
        hMm = (h / widthPx) * pageW
      } catch {
        // the page could not be drawn on its own: the shrunk drawing, as before
        const slice = document.createElement('canvas')
        slice.width = W
        slice.height = b - t
        slice.getContext('2d')!.drawImage(canvas, 0, t, W, slice.height, 0, 0, W, slice.height)
        data = slice.toDataURL('image/jpeg', 0.92)
        hMm = (slice.height / W) * pageW
      }
      if (!first) pdf.addPage()
      pdf.addImage(data, 'JPEG', 0, margin, pageW, hMm)
      first = false
    }
  }
  return { blob: pdf.output('blob'), name: name.endsWith('.pdf') ? name : `${name}.pdf` }
}

/** a blank row at or above `y` (up to `look` px higher), so a page never cuts through a line */
function cutAt(canvas: HTMLCanvasElement, y: number, look: number): number {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const rows = ctx.getImageData(0, y - look, w, look).data
  for (let r = look - 1; r >= 0; r--) {
    let blank = true
    for (let x = 0; x < w; x += 2) {
      const i = (r * w + x) * 4
      if (rows[i] < 235 || rows[i + 1] < 235 || rows[i + 2] < 235) { blank = false; break }
    }
    if (blank) return y - look + r
  }
  return y
}

async function base64(blob: Blob): Promise<string> {
  return (await dataUrl(blob)).replace(/^data:[^,]*,/, '')
}

/** Save the file: the browser's downloads, or the phone's Documents folder in the app. */
export async function saveFile(f: DocFile): Promise<'downloads' | 'documents'> {
  if (Capacitor.isNativePlatform()) {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({ path: `MobileShop/${f.name}`, data: await base64(f.blob), directory: Directory.Documents, recursive: true })
    return 'documents'
  }
  const url = URL.createObjectURL(f.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloads'
}

/** Open the phone's share sheet with the file. 'saved' when this browser cannot share files
 *  (most computers): it is downloaded instead. Throws NotAllowedError when the browser wants a
 *  fresh tap (the file took a while to make); the caller then shows a "Share now" button. */
export async function shareFile(f: DocFile, title: string): Promise<'shared' | 'saved'> {
  if (Capacitor.isNativePlatform()) {
    const { Directory, Filesystem } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const { uri } = await Filesystem.writeFile({ path: f.name, data: await base64(f.blob), directory: Directory.Cache })
    await Share.share({ title, files: [uri], dialogTitle: title })
    return 'shared'
  }
  const file = new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared' // closed the sheet
      throw e
    }
    return 'shared'
  }
  await saveFile(f)
  return 'saved'
}
