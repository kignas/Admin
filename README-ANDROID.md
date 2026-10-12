# Eatswada Admin Android wrapper

This package preserves the existing Admin frontend and adds a Capacitor Android wrapper.

## Build the APK
1. Upload these files to a GitHub repository (or merge them into the existing Admin repository).
2. Open **Settings → Secrets and variables → Actions**.
3. Add repository secret `FIREBASE_GOOGLE_SERVICES_JSON_BASE64`.
   - In Firebase Console, open the `eatswada` project → Project settings → Your apps.
   - Register an Android app with package name `com.eatswada.admin`.
   - Download its `google-services.json`.
   - Base64-encode the file and store the result as the secret. Do not commit the raw file or a service-account key.
4. Run **Actions → Build Eatswada Admin APK → Run workflow**.
5. Download the `Eatswada-Admin-APK-debug` artifact.

Without the secret, the workflow can produce an APK for UI testing, but native FCM registration/background alerts will not work. The notification integration needs the Android app registered in the same Firebase project as the backend.

## Notification behavior
- Android/FCM system notifications are used when the app is backgrounded, based on the backend's Android notification payload.
- Foreground pushes are converted into local notifications with sound/vibration.
- Users must grant notification permission and may need to enable sound/vibration for the `Eatswada order alerts` channel in Android Settings.
- Force-stopped apps, offline devices, disabled notifications, and some battery restrictions can delay or prevent delivery. Test on real devices before relying on this for live orders.

## Important
This is a build-ready source package, not a prebuilt APK. It does not change the deployed backend by itself. Backend CORS and Android push payload changes must be applied and deployed separately; see `integration-patches/` in the companion integration ZIP.
