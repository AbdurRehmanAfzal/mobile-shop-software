import { Capacitor } from '@capacitor/core'
import { ApiError, post } from './api'
import { useAuth } from './auth'
import { withDocLang } from './docLang'

export const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

/** In the Android app the WebView has no print dialog and does not save downloads. There the
 *  page or file opens in Chrome through a 2-minute link made for this one address (backend
 *  `POST /auth/link`); print pages get `autoprint=1` so Chrome shows the print dialog by itself,
 *  where "Save as PDF" also works (owner, 2026-10-28). */
async function openInChrome(path: string, print: boolean): Promise<void> {
  const target = print ? `${path}${path.includes('?') ? '&' : '?'}autoprint=1` : path
  const { url } = await post<{ url: string }>('/api/v1/auth/link', { path: target })
  const { AppLauncher } = await import('@capacitor/app-launcher')
  await AppLauncher.openUrl({ url: `${BASE}${url}` })
}

/** the signed-in user's token and shop, for fetches outside the api client */
export function authHeaders(): Record<string, string> {
  const { accessToken, activeShopId } = useAuth.getState()
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (activeShopId) headers['X-Shop-Id'] = activeShopId
  return headers
}

/** Upload a photo/PDF; returns the shop-scoped relative path to store on records. */
export async function uploadFile(file: File, purpose = 'misc'): Promise<string> {
  const fd = new FormData()
  fd.append('file', file, file.name)
  const headers = authHeaders()
  const res = await fetch(`${BASE}/api/v1/files?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', headers, body: fd })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json?.error ?? { code: 'upload_failed', message_en: 'Upload failed', message_ur: 'اپ لوڈ ناکام' })
  return json.path as string
}

export function fileUrl(path: string | null | undefined): string | undefined {
  return path ? `${BASE}/api/v1/files/${path}` : undefined
}

/** Fetch a protected file as an object URL for <img src>. */
export async function fileObjectUrl(path: string, shopId?: string): Promise<string> {
  const headers = authHeaders()
  if (shopId) headers['X-Shop-Id'] = shopId // the super admin looking at a shop's file
  const res = await fetch(`${BASE}/api/v1/files/${path}`, { headers })
  return URL.createObjectURL(await res.blob())
}

/** Open an authenticated HTML document (receipt, declaration) in a new tab for printing. */
export async function openPrintable(path: string): Promise<void> {
  path = withDocLang(path)
  if (Capacitor.isNativePlatform()) return openInChrome(path, true)
  const headers = authHeaders()
  const res = await fetch(`${BASE}${path}`, { headers })
  const html = await res.text()
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

/** Download an authenticated file (CSV export) and save it with the server's filename. */
export async function downloadFile(path: string, fallbackName = 'export.csv'): Promise<void> {
  if (Capacitor.isNativePlatform()) return openInChrome(path, false)
  const headers = authHeaders()
  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const cd = res.headers.get('content-disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** AI photo reading (owner 2026-10-30): the CNIC front or a phone box label → fields. */
export async function readPhotoAi<T>(file: File, kind: 'cnic' | 'imei'): Promise<T> {
  const fd = new FormData()
  fd.append('file', file, file.name || 'photo.jpg')
  const res = await fetch(`${BASE}/api/v1/ai/read-photo?kind=${kind}`, { method: 'POST', headers: authHeaders(), body: fd })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json?.error ?? { code: 'ai_failed', message_en: 'Could not read the photo', message_ur: 'تصویر پڑھی نہیں جا سکی' })
  return json as T
}
