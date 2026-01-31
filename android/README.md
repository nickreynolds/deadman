# Deadman's Drop (Android)

Android app for the Deadman's Drop service — record videos, set a distribution timer, and check in to reset or allow distribution to recipients.

## Prerequisites

- **Android Studio** (Ladybug or newer recommended) or **Android command-line tools**
- **JDK 17**
- **Android SDK** with:
  - API level 34 (compile/target)
  - API level 26+ (minSdk for devices/emulators)
- **Firebase** (for push notifications): a `google-services.json` file in `app/` (see [Firebase setup](#firebase-setup))

## Firebase setup

The app uses Firebase Cloud Messaging. To build and run (including local development):

1. Create or use an existing [Firebase project](https://console.firebase.google.com/) and add an Android app with package name `com.deadmansdrop.app` (debug builds use `com.deadmansdrop.app.debug` — add both if you want FCM in debug).
2. Download `google-services.json` from the Firebase Console (Project settings → Your apps).
3. Place it at:
   ```
   android/app/google-services.json
   ```
4. Do **not** commit `google-services.json` if it contains secrets; keep it in `.gitignore` and document how to obtain it (e.g. from team or CI).

Without `google-services.json`, the Gradle sync/build may fail when the Google services plugin runs.

---

## Local development

### 1. Open the project

- **Android Studio:** File → Open → select the `android` folder (or the repo root; Android Studio will detect the `android` module).
- **Command line:** all commands below are run from the `android` directory.

### 2. Run on an emulator (simulator)

1. **Create an AVD (Android Virtual Device)**  
   In Android Studio: Tools → Device Manager → Create Device. Pick a device (e.g. Pixel 6), then a system image with **API 26 or higher** (e.g. API 34). Download the image if needed.

2. **Start the emulator**  
   Select the AVD and click Run, or from the project root:
   ```bash
   cd android
   ./gradlew installDebug
   ```
   Then launch the app from the emulator launcher, or use “Run” in Android Studio with the emulator selected.

3. **Point the app at your local server**  
   On the login screen, set **Server URL** to:
   - **Emulator → host machine:** `http://10.0.2.2:3000`  
     (Use your server’s port if not 3000.)
   - Do not use `localhost` or `127.0.0.1` on the emulator; those refer to the emulator itself.

4. **Run the backend**  
   Start the Deadman’s Drop server (e.g. from the repo’s `server/` directory) so the app can log in and use the API.

### 3. Run on a physical device

1. **Enable Developer options and USB debugging** on the device (Settings → About phone → tap Build number 7 times, then Settings → Developer options → USB debugging).

2. **Connect the device** via USB and allow USB debugging when prompted.

3. **Install and run the app:**
   ```bash
   cd android
   ./gradlew installDebug
   ```
   Or in Android Studio: choose your device in the device dropdown and click Run.

4. **Server URL on device**  
   The device cannot use `localhost`. Use your computer’s LAN IP and the server port, e.g.:
   - `http://192.168.1.100:3000`  
   Ensure the device and the machine running the server are on the same network, and that the server listens on `0.0.0.0` (not only `127.0.0.1`).

### 4. Build types (local dev)

- **Debug (default):** unoptimized, `com.deadmansdrop.app.debug`, good for development.
  ```bash
  ./gradlew assembleDebug
  # Output: app/build/outputs/apk/debug/app-debug.apk
  ```
- **Release:** optimized and minified; requires signing for install/store (see [Production builds](#production-builds)).
  ```bash
  ./gradlew assembleRelease
  # Fails until signing is configured; see below.
  ```

---

## Production builds

Release builds are minified and resource-shrunk. They must be signed.

### 1. Create a keystore (once)

```bash
keytool -genkey -v -keystore deadmans-drop-release.keystore -alias deadmans-drop -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore and passwords securely (e.g. secrets manager, not in git).

### 2. Configure signing in the project

**Option A — `keystore.properties` (recommended; keep out of version control):**

Create `android/keystore.properties`:

```properties
storePassword=your-store-password
keyPassword=your-key-password
keyAlias=deadmans-drop
storeFile=../deadmans-drop-release.keystore
```

Path is relative to the `android` directory; adjust if your keystore lives elsewhere.

In `app/build.gradle.kts`, inside `android { ... }`, add (before `buildTypes`):

```kotlin
signingConfigs {
    create("release") {
        val keystorePropertiesFile = rootProject.file("keystore.properties")
        if (keystorePropertiesFile.exists()) {
            val keystoreProperties = java.util.Properties()
            keystoreProperties.load(keystorePropertiesFile.inputStream())
            storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
        }
    }
}
buildTypes {
    release {
        signingConfig = signingConfigs.getByName("release")
        isMinifyEnabled = true
        // ... rest unchanged
    }
}
```

**Option B — Environment variables:**  
Use environment variables in `signingConfigs` instead of `keystore.properties` (e.g. in CI); same `storeFile`, `storePassword`, `keyAlias`, `keyPassword` fields.

### 3. Build the release APK

From the `android` directory:

```bash
./gradlew assembleRelease
```

Output:

```
app/build/outputs/apk/release/app-release.apk
```

### 4. Build an App Bundle (for Play Store)

For Google Play you typically upload an AAB, not the APK:

```bash
./gradlew bundleRelease
```

Output:

```
app/build/outputs/bundle/release/app-release.aab
```

Upload `app-release.aab` in Play Console.

### 5. Install a release build locally

If you’ve configured signing:

```bash
./gradlew installRelease
```

Or install the APK manually:

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

---

## Summary

| Goal                     | Command / step                                                                 |
|--------------------------|-------------------------------------------------------------------------------|
| Run on emulator          | Create AVD (API 26+), start it, `./gradlew installDebug`, Server URL: `http://10.0.2.2:3000` |
| Run on device            | USB debugging on, `./gradlew installDebug`, Server URL: `http://<your-pc-ip>:3000` |
| Debug APK                | `./gradlew assembleDebug`                                                     |
| Release APK (signed)     | Configure signing, then `./gradlew assembleRelease`                          |
| Release AAB (Play Store) | Configure signing, then `./gradlew bundleRelease`                            |

Server URL is set in the app at login and stored securely; it is not baked into the build.
