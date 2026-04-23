# After a clean Android prebuild

Use this when you delete and regenerate the native project, e.g.:

```bash
rm -rf android
npx expo prebuild --platform android
```

`android/` is gitignored, so anything you only kept **inside** that folder is gone. The steps below put back what Expo does not generate for you.

## 1. MediaPipe model (if `assets/face_landmarker.task` is missing)

The prebuild plugin copies it from the repo `assets/` folder. If you don’t have the file yet:

```bash
npm run download-face-landmarker
```

## 2. Release signing (Play / signed `.aab`)

Prebuild does **not** create these; restore your **backup copy** (kept outside `android/`, e.g. repo root or a secrets folder):

| File | Where it must end up |
|------|----------------------|
| `keystore.properties` (real secrets, not the `.example`) | `android/keystore.properties` |
| `upload-key.jks` (or whatever `storeFile` points to) | `android/` (or path your properties file uses) |

Values in `keystore.properties` must match the keystore you created with `keytool` (`storePassword`, `keyPassword`, `keyAlias`, `storeFile`). See `keystore.properties.example` at the project root.

**Without** these files, `bundleRelease` can still run, but release is signed with the **debug** key, which is not what you use for Play uploads.

The Expo config plugin **`withAndroidReleaseKeystore`** re-applies the Gradle signing wiring on each prebuild; you only re-copy the **files** above.

## 3. Gradle JVM memory (release build / Metaspace)

A fresh `android/gradle.properties` may use smaller defaults. If `bundleRelease` fails with **`OutOfMemoryError: Metaspace`** (or similar during Java compile or `lintVital`), set the Gradle daemon args in **`android/gradle.properties`**:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

Then pick up the new settings:

```bash
cd android && ./gradlew --stop
```

## 4. Build the App Bundle

From the repo root:

```bash
npm run android:bundle
```

Output:

`android/app/build/outputs/bundle/release/app-release.aab`

## 5. Version bumps (store uploads)

Before a new Play upload, bump `version` / Android `versionCode` as your release process requires (e.g. `app.json` for Expo, then prebuild or sync `android/app/build.gradle` if you edit native files directly).

---

**Summary:** After clean prebuild, usually **copy signing files into `android/`**, **restore Gradle `jvmargs` if the release build OOMs**, ensure **`face_landmarker.task` exists in `assets/`**, then **`npm run android:bundle`**.
