const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FLATDIR_BLOCK = `    // expo-ffmpeg-local: local AAR (not on Maven)
    flatDir {
      dirs "$rootDir/../modules/expo-ffmpeg-local/android/libs"
    }`;

/**
 * Injects flatDir for expo-ffmpeg-local's bundled ffmpeg-kit-full-gpl.aar
 * into android/build.gradle. The AAR is not on Maven; Gradle must resolve it locally.
 */
const withFfmpegFlatDir = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const buildGradlePath = path.join(platformRoot, 'build.gradle');

      let content = await fs.promises.readFile(buildGradlePath, 'utf8');

      if (content.includes('expo-ffmpeg-local/android/libs')) {
        return config;
      }

      // Insert before the closing "  }" of allprojects.repositories
      const closingRepos = content.indexOf('  }\n}\n');
      if (closingRepos === -1) {
        console.warn('[withFfmpegFlatDir] Could not find repositories block end');
        return config;
      }
      content = content.slice(0, closingRepos) + FLATDIR_BLOCK + '\n' + content.slice(closingRepos);

      await fs.promises.writeFile(buildGradlePath, content);
      console.log('[withFfmpegFlatDir] Added flatDir for expo-ffmpeg-local/libs');

      return config;
    },
  ]);
};

module.exports = withFfmpegFlatDir;
