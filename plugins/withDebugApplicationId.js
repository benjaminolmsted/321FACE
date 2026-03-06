const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Adds applicationIdSuffix ".debug" to the debug buildType so debug and release
 * install as separate apps (debug: com.anonymous.x321FACE.debug, release: com.anonymous.x321FACE).
 * This lets you have both the release APK and dev build installed at once.
 */
const withDebugApplicationId = (config) => {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes('applicationIdSuffix ".debug"')) {
      return config;
    }
    config.modResults.contents = contents.replace(
      /(\s+debug \{\s*\n)(\s+signingConfig)/,
      '$1            applicationIdSuffix ".debug"\n$2'
    );
    return config;
  });
};

module.exports = withDebugApplicationId;
