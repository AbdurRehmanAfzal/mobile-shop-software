import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android/iOS shell around the same React build (ADR-004).
 * The bundled app talks to the cloud API: build with VITE_API_URL=https://<app-domain>.
 * The backend must allow the app origin `https://localhost` in CORS_ORIGINS.
 */
const config: CapacitorConfig = {
  appId: 'pk.mobileshop.app',
  appName: 'Mobile Shop',
  webDir: 'dist',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
}

export default config
