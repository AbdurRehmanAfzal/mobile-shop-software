/** TanStack Query hooks over the API. Keys are per shop so switching shops never shows stale data. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, patch, post, api } from './api'
import { useAuth } from './auth'
import type {
  Brand, CashAccount, Colour, Device, DeviceDetail, DeviceEvent, ImeiLookup, Invoice, Loan, Message, Model,
  NotificationSettings, Party, Payment, Purchase, ReturnDoc, Statement, Storage, Verification,
} from './types'

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v))
  const s = u.toString()
  return s ? `?${s}` : ''
}

export function useShopKey() {
  return useAuth((s) => s.activeShopId) ?? 'none'
}

// ---- catalogue ------------------------------------------------------------------------------
/** `category` tablet / watch: only brands that make those (phone = all brands) */
export const useBrands = (category?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'brands', category ?? ''], queryFn: () => get<Brand[]>(`/api/v1/catalogue/brands${qs({ category })}`), staleTime: 5 * 60_000 })
}
export const useModels = (brandId?: string, q?: string, category?: string) => {
  const k = useShopKey()
  return useQuery({
    queryKey: [k, 'models', brandId ?? '', q ?? '', category ?? ''],
    queryFn: () => get<Model[]>(`/api/v1/catalogue/models${qs({ brand_id: brandId, q, category })}`),
    enabled: !!brandId || !!q,
    staleTime: 5 * 60_000,
  })
}
export const useStorages = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'storages'], queryFn: () => get<Storage[]>('/api/v1/catalogue/storages'), staleTime: 5 * 60_000 })
}
export const useColours = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'colours'], queryFn: () => get<Colour[]>('/api/v1/catalogue/colours'), staleTime: 5 * 60_000 })
}

export type CatalogueKind = 'brands' | 'models' | 'storages' | 'colours'
/** Add / rename / delete catalogue rows; refreshes every catalogue list afterwards. */
export function useCatalogueEdit() {
  const inv = useInvalidate()
  const refresh = () => inv('brands', 'models', 'storages', 'colours')
  return {
    add: async <T,>(kind: CatalogueKind, body: Record<string, unknown>) => {
      const row = await post<T>(`/api/v1/catalogue/${kind}`, body)
      await refresh()
      return row
    },
    rename: async (kind: CatalogueKind, id: string, body: { name: string; gigabytes?: number }) => {
      await patch(`/api/v1/catalogue/${kind}/${id}`, body)
      await refresh()
    },
    remove: async (kind: CatalogueKind, id: string) => {
      await api('DELETE', `/api/v1/catalogue/${kind}/${id}`)
      await refresh()
    },
  }
}

/** "128 gb" -> { name: "128GB", gigabytes: 128 }; "1tb" -> 1024 GB; "4mb" -> counts as 1. */
export function parseStorage(text: string): { name: string; gigabytes: number } | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)\s*(tb|gb|mb)?$/i)
  if (!m) return null
  const n = Number(m[1])
  const unit = (m[2] ?? 'gb').toUpperCase()
  const gigabytes = unit === 'TB' ? Math.round(n * 1024) : unit === 'MB' ? 1 : Math.max(1, Math.round(n))
  return { name: `${m[1]}${unit}`, gigabytes }
}

// ---- parties ---------------------------------------------------------------------------------
export const useParties = (params: { q?: string; kind?: string; with_balance?: boolean } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'parties', params], queryFn: () => get<Party[]>(`/api/v1/parties${qs(params)}`) })
}
export const useParty = (id?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'party', id], queryFn: () => get<Party>(`/api/v1/parties/${id}`), enabled: !!id })
}
export const useStatement = (partyId?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'statement', partyId], queryFn: () => get<Statement>(`/api/v1/ledger/parties/${partyId}/statement`), enabled: !!partyId })
}
export function useInvalidate() {
  const qc = useQueryClient()
  const k = useShopKey()
  return (...prefixes: string[]) => {
    if (!prefixes.length) return qc.invalidateQueries({ queryKey: [k] })
    return Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [k, p] })))
  }
}
export const useCreateParty = () => {
  const inv = useInvalidate()
  return useMutation({ mutationFn: (body: Partial<Party>) => post<Party>('/api/v1/parties', body), onSuccess: () => inv('parties') })
}
export const useUpdateParty = () => {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Party> & { id: string }) => patch<Party>(`/api/v1/parties/${id}`, body),
    onSuccess: () => inv('parties', 'party'),
  })
}

// ---- devices ---------------------------------------------------------------------------------
export const useDevices = (params: { status?: string; q?: string; brand_id?: string; condition?: string; pta_status?: string; category?: string; limit?: number } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'devices', params], queryFn: () => get<Device[]>(`/api/v1/devices${qs(params)}`) })
}
export const useDevice = (id?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'device', id], queryFn: () => get<DeviceDetail>(`/api/v1/devices/${id}`), enabled: !!id })
}
export const useDeviceHistory = (id?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'history', id], queryFn: () => get<DeviceEvent[]>(`/api/v1/devices/${id}/history`), enabled: !!id })
}
export const useImeiLookup = (imei: string) => {
  const k = useShopKey()
  const digits = imei.replace(/\D/g, '')
  return useQuery({ queryKey: [k, 'imei', digits], queryFn: () => get<ImeiLookup>(`/api/v1/devices/imei/${digits}`), enabled: digits.length === 15 })
}
export const useVerification = (deviceId?: string) => {
  const k = useShopKey()
  return useQuery({
    queryKey: [k, 'verification', deviceId],
    queryFn: () => get<Verification>(`/api/v1/devices/${deviceId}/verification`).catch(() => null),
    enabled: !!deviceId,
  })
}
export const useDeviceEvent = () => {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; type: string; party_id?: string; note?: string; expected_back_at?: string }) =>
      post<Device>(`/api/v1/devices/${id}/events`, body),
    onSuccess: () => inv('devices', 'device', 'history'),
  })
}

// ---- ledger / documents -------------------------------------------------------------------------
export const useCashAccounts = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'cash'], queryFn: () => get<CashAccount[]>('/api/v1/ledger/accounts') })
}
export const useSales = (params: { party_id?: string; status?: string; date_from?: string } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'sales', params], queryFn: () => get<Invoice[]>(`/api/v1/sales${qs(params)}`) })
}
export const useSale = (id?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'sale', id], queryFn: () => get<Invoice>(`/api/v1/sales/${id}`), enabled: !!id })
}
export const usePurchases = (params: { party_id?: string } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'purchases', params], queryFn: () => get<Purchase[]>(`/api/v1/purchases${qs(params)}`).catch(() => [] as Purchase[]) })
}
export const usePurchase = (id?: string) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'purchase', id], queryFn: () => get<Purchase>(`/api/v1/purchases/${id}`), enabled: !!id })
}
export const usePayments = (params: { party_id?: string } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'payments', params], queryFn: () => get<Payment[]>(`/api/v1/payments${qs(params)}`) })
}
export const useLoans = (params: { status?: string } = {}) => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'loans', params], queryFn: () => get<Loan[]>(`/api/v1/loans${qs(params)}`) })
}
export const useReturns = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'returns'], queryFn: () => get<ReturnDoc[]>('/api/v1/returns') })
}
export const useNotificationSettings = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'notif-settings'], queryFn: () => get<NotificationSettings>('/api/v1/notifications/settings') })
}
export const useMessages = () => {
  const k = useShopKey()
  return useQuery({ queryKey: [k, 'messages'], queryFn: () => get<Message[]>('/api/v1/notifications') })
}

/** Generic mutation that invalidates everything for the shop (documents touch many lists). */
export function useDocMutation<TIn, TOut>(method: 'POST' | 'PUT' | 'PATCH', path: (input: TIn) => string, body?: (input: TIn) => unknown) {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (input: TIn) => api<TOut>(method, path(input), body ? body(input) : input),
    onSuccess: () => inv(),
  })
}

/** Generic shop-scoped GET for screens that don't need a dedicated hook. */
export function useGet<T>(key: unknown[], path: string | null) {
  const k = useShopKey()
  return useQuery({ queryKey: [k, ...key], queryFn: () => get<T>(path!), enabled: !!path })
}
