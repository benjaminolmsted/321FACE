const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copies face_landmarker.task from project assets to Android app assets
 * so MediaPipe Face Landmarker can load it at runtime.
 */
const withMediaPipeAssets = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const source = path.join(projectRoot, 'assets', 'face_landmarker.task');
      const targetDir = path.join(platformRoot, 'app', 'src', 'main', 'assets');
      const target = path.join(targetDir, 'face_landmarker.task');

      if (!fs.existsSync(source)) {
        console.warn(
          '[withMediaPipeAssets] face_landmarker.task not found at',
          source,
          '- skipping copy'
        );
        return config;
      }

      await fs.promises.mkdir(targetDir, { recursive: true });
      await fs.promises.copyFile(source, target);
      console.log('[withMediaPipeAssets] Copied face_landmarker.task to', target);

      return config;
    },
  ]);
};

module.exports = withMediaPipeAssets;
