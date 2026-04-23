const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'withAndroidReleaseKeystore';

const RELEASE_IN_SIGNING_SNIPPET = `        }
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias'] ?: "upload"
                keyPassword keystoreProperties['keyPassword'] ?: ""
                storeFile rootProject.file((keystoreProperties['storeFile'] ?: "upload-key.jks").toString().trim())
                storePassword keystoreProperties['storePassword'] ?: ""
            }
        }
    }
    buildTypes {`;

/**
 * Injects keystore.properties-based release signing into android/app/build.gradle
 * (optional; no file = keep debug key for local AAB only).
 */
const withAndroidReleaseKeystore = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const gradlePath = path.join(platformRoot, 'app', 'build.gradle');
      let src = (await fs.promises.readFile(gradlePath, 'utf8')).replace(/\r\n/g, '\n');
      let didWrite = false;

      const jsc = "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'";
      if (!src.includes(jsc)) {
        console.warn(
          '[withAndroidReleaseKeystore] jscFlavor line not found; prebuild template may have changed. Skipping.'
        );
        return config;
      }

      const propsBlock = `// [${MARKER}] optional android/keystore.properties
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

`;
      if (!src.includes('keystoreProperties = new Properties()')) {
        const a =
          "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\n\nandroid {";
        const b =
          "def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\nandroid {";
        if (src.includes(a)) {
          src = src.replace(
            a,
            `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\n\n${propsBlock}android {`
          );
          didWrite = true;
        } else if (src.includes(b)) {
          src = src.replace(
            b,
            `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'\n\n${propsBlock}android {`
          );
          didWrite = true;
        } else {
          console.warn(
            '[withAndroidReleaseKeystore] Could not find jscFlavor → android {; skipping keystore block.'
          );
        }
      }

      if (src.includes('// [withAndroidReleaseKeystore] no keystore.properties = debug key')) {
        if (didWrite) {
          await fs.promises.writeFile(gradlePath, src, 'utf8');
          console.log('[withAndroidReleaseKeystore] Updated (props only)', gradlePath);
        }
        return config;
      }

      // Unique slice: end of debug keystore, close signingConfigs, then buildTypes
      const endDebugKeystore = `        }
    }
    buildTypes {`;
      if (!src.includes("rootProject.file((keystoreProperties['storeFile']") && src.includes(endDebugKeystore)) {
        src = src.replace(endDebugKeystore, RELEASE_IN_SIGNING_SNIPPET);
        didWrite = true;
      }

      const buildTypesRelease = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
      if (src.includes('// Caution! In production, you need to generate your own keystore file.')) {
        if (src.includes('// [withAndroidReleaseKeystore] no keystore.properties = debug key')) {
          // already patched
        } else if (src.includes(buildTypesRelease)) {
          src = src.replace(
            buildTypesRelease,
            `        release {
            // [${MARKER}] no keystore.properties = debug key (not for Play upload)
            signingConfig (keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug)`
          );
          didWrite = true;
        } else {
          console.warn(
            '[withAndroidReleaseKeystore] buildTypes release block not recognized; add signing by hand or update plugin.'
          );
        }
      }

      if (didWrite) {
        await fs.promises.writeFile(gradlePath, src, 'utf8');
        console.log('[withAndroidReleaseKeystore] Updated', gradlePath);
      }
      return config;
    },
  ]);
};

module.exports = withAndroidReleaseKeystore;
