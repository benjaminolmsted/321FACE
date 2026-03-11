const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MAVEN_BLOCK = `    // AsyncStorage storage-android (bundled in package)
    maven {
      url "$rootDir/../node_modules/@react-native-async-storage/async-storage/android/local_repo"
    }`;

/**
 * Injects AsyncStorage's local Maven repo into android/build.gradle so
 * org.asyncstorage.shared_storage:storage-android:1.0.0 can be resolved.
 * Required for @react-native-async-storage/async-storage 3.x on Android.
 */
const withAsyncStorageMaven = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const buildGradlePath = path.join(platformRoot, 'build.gradle');

      let content = await fs.promises.readFile(buildGradlePath, 'utf8');

      if (content.includes('@react-native-async-storage/async-storage/android/local_repo')) {
        return config;
      }

      // Insert before the closing "  }" of allprojects.repositories
      const insertMarker = "maven { url 'https://www.jitpack.io' }";
      const insertPoint = content.indexOf(insertMarker);
      if (insertPoint === -1) {
        console.warn('[withAsyncStorageMaven] Could not find jitpack repo to insert after');
        return config;
      }

      const afterJitpack = content.indexOf('\n', insertPoint) + 1;
      content =
        content.slice(0, afterJitpack) +
        MAVEN_BLOCK +
        '\n' +
        content.slice(afterJitpack);

      await fs.promises.writeFile(buildGradlePath, content);
      console.log('[withAsyncStorageMaven] Added AsyncStorage local_repo to build.gradle');

      return config;
    },
  ]);
};

module.exports = withAsyncStorageMaven;
