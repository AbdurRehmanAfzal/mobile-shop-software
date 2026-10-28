# 13 — Mobile apps (Android now, iOS later)

Two ways shopkeepers get the app on a phone:

## 1. PWA (works today, no store)
- Built into the web app (`vite-plugin-pwa`): manifest, icons (`public/pwa-*.png`), service worker that caches **only the app shell** (never API data or uploads — they are per-shop and sensitive).
- On Android Chrome: open the site → menu → **Install app / Add to Home screen**. Full install + offline shell need **HTTPS**, i.e. after the VPS deploy (docs/12). Over plain Wi-Fi dev (`npm run dev:lan`) "Add to Home screen" gives a shortcut only.

## 2. Android app via Capacitor (Play Store)
Scaffold is in `frontend/android` (Capacitor 6, appId `pk.mobileshop.app`, plugins: camera, share). The app bundles the same React build and talks to the cloud API.

### Download link (2026-10-28)
Every release builds the signed APK (deploy.yml calls android.yml) and puts it into the web image, so the latest app is always at **https://mobileshop.oopsolutions.com/app.apk** (Caddy serves it as an Android package download). On an Android phone's browser the login page shows **Download the Android app**. Version code = minutes since 1970 (always higher than the last build, so it installs over the old app); version name = date + commit.

### Build in GitHub Actions (no Android Studio needed)
`.github/workflows/android.yml` runs on every release (push to `main`, when `frontend/` changed) or by hand (**Actions → Android → Run workflow**):
`npm run build:native` (= `vite build --mode native` with `VITE_API_URL=vars.APP_URL`, no service worker, then `cap sync android`) → `gradlew assembleRelease` signed with the release key → the APK is a **build artifact** of the run (`mobile-shop-android-1.<run>`), downloadable from the run page while logged in to GitHub. Version code = run number, so every build installs over the previous one.

**Release key (one time, keep it forever).** Every update must be signed with the same key, or phones refuse it. Make it on the VPS (Docker has Java):
```
mkdir -p /root/android-key
docker run --rm -it -v /root/android-key:/k eclipse-temurin:17-jdk   keytool -genkeypair -v -keystore /k/mobileshop-release.jks -alias mobileshop   -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=OOP Solutions, O=OOP Solutions, C=PK"
base64 -w0 /root/android-key/mobileshop-release.jks; echo
```
GitHub secrets: `ANDROID_KEYSTORE_BASE64` (the base64 line), `ANDROID_KEYSTORE_PASSWORD` (the password typed above), `ANDROID_KEY_ALIAS` = `mobileshop`. Keep a copy of `mobileshop-release.jks` and the password off the server (e.g. in a password manager). Without these secrets the workflow makes a debug-signed **test** APK.

**Install on a phone:** download the artifact zip on the phone (or on the PC and send the .apk by WhatsApp/USB), open the .apk, allow "Install unknown apps" for that app once.

Icons and splash: sources in `frontend/assets/` (dark ground, gold phone, same as the PWA icon), generated with `npx @capacitor/assets generate --android`.

### Known gaps in the app (v1)
- Solved 2026-10-28: **print and download** open in Chrome through a 2-minute link for that one address (`POST /api/v1/auth/link`, `dl=` token, `autoprint=1` for print pages; `@capacitor/app-launcher`). The WebView itself still has no print dialog or download manager.

### Build on a PC with Android Studio
1. Install Android Studio (bundles JDK 17 and the Android SDK).
2. Build the web app against the live API, then sync:
   ```
   cd frontend
   set VITE_API_URL=https://mobileshop.oopsolutions.com
   npm run build
   npx cap sync android
   npx cap open android
   ```
3. In Android Studio: **Build → Generate Signed App Bundle/APK** (create and back up the keystore; losing it means you can never update the Play Store app).
4. Test the APK on a phone, then upload the `.aab` to Play Console (internal testing track first).

### Requirements on the server
- `CORS_ORIGINS` must include `https://localhost` and `capacitor://localhost` (already in `deploy/docker-compose.yml`).

### Status
- 2026-10-27: CI build added (this PC still has no Java/Android SDK; GitHub builds it). API: https://mobileshop.oopsolutions.com.
- iOS: same Capacitor project (`npx cap add ios`) but needs a Mac with Xcode and an Apple developer account.
