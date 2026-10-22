import { ApiError } from './api'
import { useAuth } from './auth'

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

/** Upload a photo/PDF; returns the shop-scoped relative path to store on records. */
export async function uploadFile(file: File, purpose = 'misc'): Promise<string> {
  const { accessToken, activeShopId } = useAuth.getState()
  const fd = new FormData()
  fd.append('file', file, file.name)
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (activeShopId) headers['X-Shop-Id'] = activeShopId
  const res = await fetch(`${BASE}/api/v1/files?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', headers, body: fd })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json?.error ?? { code: 'upload_failed', message_en: 'Upload failed', message_ur: 'اپ لوڈ ناکام' })
  return json.path as string
}

export function fileUrl(path: string | null | undefined): string | undefined {
  return path ? `${BASE}/api/v1/files/${path}` : undefined
}

/** Fetch a protected file as an object URL for <img src>. */
export async function fileObjectUrl(path: string): Promise<string> {
  const { accessToken, activeShopId } = useAuth.getState()
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (activeShopId) headers['X-Shop-Id'] = activeShopId
  const res = await fetch(`${BASE}/api/v1/files/${path}`, { headers })
  return URL.createObjectURL(await res.blob())
}

/** Open an authenticated HTML document (receipt, declaration) in a new tab for printing. */
export async function openPrintable(path: string): Promise<void> {
  const { accessToken, activeShopId } = useAuth.getState()
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (activeShopId) headers['X-Shop-Id'] = activeShopId
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
  const { accessToken, activeShopId } = useAuth.getState()
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (activeShopId) headers['X-Shop-Id'] = activeShopId
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
