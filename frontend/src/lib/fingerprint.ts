/** Fingerprint login (owner, 2026-10-28), for the owner and for staff when the owner allows it.
 *  - Android app: the server gives this phone a random key; it is kept in the phone's Keystore and
 *    only comes out after the fingerprint prompt (@capgo/capacitor-native-biometric).
 *  - Website: a passkey (WebAuthn): fingerprint, face or Windows Hello of that device.
 *  The fingerprint itself never leaves the phone. */

import { Capacitor } from '@capacitor/core'
import { post } from './api'
import type { MeOut } from './auth'

export interface AuthResponse {
  tokens: { access_token: string; refresh_token: string }
  me: MeOut
}

const SERVER = 'pk.mobileshop.app'
const FLAG = 'mobileshop.fingerprint'

export const isNative = () => Capacitor.isNativePlatform()

/** this phone / browser was set up for fingerprint login (shows the button on the login page) */
export function isOnHere(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}
function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1')
    else localStorage.removeItem(FLAG)
  } catch {
    /* private mode: the button just won't show */
  }
}

/** does this device have a fingerprint / screen lock that can be used */
export async function canUseHere(): Promise<boolean> {
  try {
    if (isNative()) {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      return (await NativeBiometric.isAvailable()).isAvailable
    }
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

const prompt = { reason: 'Mobile Shop', title: 'Mobile Shop', subtitle: 'Fingerprint', description: '' }

export async function turnOnHere(): Promise<void> {
  if (isNative()) {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    await NativeBiometric.verifyIdentity(prompt)
    const key = await post<{ key_id: string; secret: string }>('/api/v1/auth/fingerprint/device', { name: 'Android phone' })
    await NativeBiometric.setCredentials({ username: key.key_id, password: key.secret, server: SERVER })
  } else {
    const { startRegistration } = await import('@simplewebauthn/browser')
    const { options, token } = await post<{ options: never; token: string }>('/api/v1/auth/passkey/register-options')
    const credential = await startRegistration({ optionsJSON: options })
    await post('/api/v1/auth/passkey/register', { credential, token, name: browserName() })
  }
  remember(true)
}

export async function turnOffHere(): Promise<void> {
  if (isNative()) {
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
      await NativeBiometric.deleteCredentials({ server: SERVER })
    } catch {
      /* nothing stored */
    }
  }
  remember(false)
}

export async function fingerprintLogin(): Promise<AuthResponse> {
  if (isNative()) {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    await NativeBiometric.verifyIdentity(prompt)
    const c = await NativeBiometric.getCredentials({ server: SERVER })
    return post<AuthResponse>('/api/v1/auth/fingerprint/device-login', { key_id: c.username, secret: c.password }, { auth: false })
  }
  const { startAuthentication } = await import('@simplewebauthn/browser')
  const { options, token } = await post<{ options: never; token: string }>('/api/v1/auth/passkey/login-options', undefined, { auth: false })
  const credential = await startAuthentication({ optionsJSON: options })
  return post<AuthResponse>('/api/v1/auth/passkey/login', { credential, token }, { auth: false })
}

function browserName(): string {
  const ua = navigator.userAgent
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser'
  return `${br} on ${os}`
}
