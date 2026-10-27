/** Minimal typed API client: bearer token, X-Shop-Id, one automatic refresh on 401, bilingual errors. */

import { useAuth } from './auth'

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  code: string
  messageEn: string
  messageUr: string
  status: number
  details: unknown

  constructor(status: number, body: { code: string; message_en: string; message_ur: string; details?: unknown }) {
    super(body.message_en)
    this.status = status
    this.code = body.code
    this.messageEn = body.message_en
    this.messageUr = body.message_ur
    this.details = body.details
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

async function rawRequest<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
  const state = useAuth.getState()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`
  if (auth && state.activeShopId) headers['X-Shop-Id'] = state.activeShopId

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = json?.error ?? {
      code: 'http_error',
      message_en: res.statusText || 'Request failed',
      message_ur: 'درخواست ناکام ہوئی',
    }
    throw new ApiError(res.status, err)
  }
  return json as T
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const { refreshToken, setTokens, logout } = useAuth.getState()
      if (!refreshToken) return false
      try {
        const tokens = await rawRequest<{ access_token: string; refresh_token: string }>(
          'POST',
          '/api/v1/auth/refresh',
          { refresh_token: refreshToken },
          false,
        )
        setTokens(tokens)
        return true
      } catch {
        logout()
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

export async function api<T>(method: Method, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const auth = opts.auth ?? true
  try {
    return await rawRequest<T>(method, path, body, auth)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && auth && e.code !== 'bad_credentials') {
      if (await tryRefresh()) return rawRequest<T>(method, path, body, auth)
    }
    throw e
  }
}

export const get = <T>(path: string) => api<T>('GET', path)
export const post = <T>(path: string, body?: unknown, opts?: { auth?: boolean }) => api<T>('POST', path, body, opts)
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body)
