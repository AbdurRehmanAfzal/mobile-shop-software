import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Role = 'owner' | 'manager' | 'salesman' | 'technician'

export interface UserOut {
  id: string
  organisation_id: string
  name: string
  phone: string
  email: string | null
  role: Role
  locale: 'en' | 'ur'
  is_active: boolean
  has_pin?: boolean
  /** the product owner: may open shops (super admin) */
  is_superuser?: boolean
}

export interface ShopOut {
  id: string
  name: string
  name_ur: string | null
  city: string | null
  phone: string | null
  default_locale: 'en' | 'ur'
  tax_enabled: boolean
  is_active: boolean
}

export interface MeOut {
  user: UserOut
  shops: ShopOut[]
  active_shop_id: string | null
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  me: MeOut | null
  activeShopId: string | null
  setSession: (tokens: { access_token: string; refresh_token: string }, me: MeOut) => void
  setTokens: (tokens: { access_token: string; refresh_token: string }) => void
  setActiveShop: (shopId: string) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      me: null,
      activeShopId: null,
      setSession: (tokens, me) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          me,
          activeShopId: me.active_shop_id ?? me.shops[0]?.id ?? null,
        }),
      setTokens: (tokens) => set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
      setActiveShop: (shopId) => set({ activeShopId: shopId }),
      logout: () => set({ accessToken: null, refreshToken: null, me: null, activeShopId: null }),
    }),
    { name: 'mobileshop.auth' },
  ),
)

export const activeShop = (s: AuthState): ShopOut | undefined =>
  s.me?.shops.find((x) => x.id === s.activeShopId)
