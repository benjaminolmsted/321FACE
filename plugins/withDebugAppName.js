const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Creates android/app/src/debug/res/values/strings.xml with app_name "_321FACE"
 * so debug builds show "_321FACE" in the launcher while release shows "321FACE".
 */
const withDebugAppName = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const debugStringsDir = path.join(
        platformRoot,
        'app',
        'src',
        'debug',
        'res',
        'values'
      );
      const debugStringsPath = path.join(debugStringsDir, 'strings.xml');
      const content = `<resources>
  <string name="app_name">_321FACE</string>
</resources>
`;

      await fs.promises.mkdir(debugStringsDir, { recursive: true });
      await fs.promises.writeFile(debugStringsPath, content);
      console.log('[withDebugAppName] Created debug app name override at', debugStringsPath);

      return config;
    },
  ]);
};

module.exports = withDebugAppName;
