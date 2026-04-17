const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix react-native-share FileProvider paths on Android.
 *
 * The library's share_download_paths.xml only includes external-path and
 * cache-path, but files in documentDirectory (expo-file-system) live under
 * the app's internal files/ dir which requires <files-path>.
 *
 * This plugin overwrites share_download_paths.xml in the app's resources
 * (takes precedence over the library's copy via Android resource merging).
 *
 * See: https://github.com/react-native-share/react-native-share/issues/1683
 */

const SHARE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <files-path name="rnshare_files" path="." />
  <cache-path name="rnshare_cache" path="." />
  <external-path name="rnshare_external" path="." />
  <external-cache-path name="rnshare_external_cache" path="." />
</paths>
`;

module.exports = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resXmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml'
      );
      await fs.promises.mkdir(resXmlDir, { recursive: true });

      const xmlPath = path.join(resXmlDir, 'share_download_paths.xml');
      await fs.promises.writeFile(xmlPath, SHARE_PATHS_XML);
      console.log('[withReactNativeShare] Wrote share_download_paths.xml with files-path');

      return config;
    },
  ]);
};
