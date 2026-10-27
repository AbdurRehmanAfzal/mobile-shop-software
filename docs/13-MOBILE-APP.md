# 13 — Mobile apps (Android now, iOS later)

Two ways shopkeepers get the app on a phone:

## 1. PWA (works today, no store)
- Built into the web app (`vite-plugin-pwa`): manifest, icons (`public/pwa-*.png`), service worker that caches **only the app shell** (never API data or uploads — they are per-shop and sensitive).
- On Android Chrome: open the site → menu → **Install app / Add to Home screen**. Full install + offline shell need **HTTPS**, i.e. after the VPS deploy (docs/12). Over plain Wi-Fi dev (`npm run dev:lan`) "Add to Home screen" gives a shortcut only.

## 2. Android app via Capacitor (Play Store)
Scaffold is in `frontend/android` (Capacitor 6, appId `pk.mobileshop.app`, plugins: camera, share). The app bundles the same React build and talks to the cloud API.

### Build on a PC with Android Studio
1. Install Android Studio (bundles JDK 17 and the Android SDK).
2. Build the web app against the live API, then sync:
   ```
   cd frontend
   set VITE_API_URL=https://app.yourdomain.pk
   npm run build
   npx cap sync android
   npx cap open android
   ```
3. In Android Studio: **Build → Generate Signed App Bundle/APK** (create and back up the keystore; losing it means you can never update the Play Store app).
4. Test the APK on a phone, then upload the `.aab` to Play Console (internal testing track first).

### Requirements on the server
- `CORS_ORIGINS` must include `https://localhost` and `capacitor://localhost` (already in `deploy/docker-compose.yml`).

### Status
- Not yet built: this dev PC has no Java/Android SDK, and the app needs the live HTTPS API domain. Both are listed as owner inputs in docs/06.
- iOS: same Capacitor project (`npx cap add ios`) but needs a Mac with Xcode and an Apple developer account.
