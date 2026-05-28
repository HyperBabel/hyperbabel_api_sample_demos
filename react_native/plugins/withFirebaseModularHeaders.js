const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// react-native-firebase v24 + Expo SDK 56 + RN 0.85 + useFrameworks: 'static' integration.
// Patches the generated Podfile in three places:
//
//   1) Top-level: $RNFirebaseAsStaticFramework = true
//      RNFB podspecs read this global and build their own pods as static frameworks,
//      consistent with the workspace's `use_frameworks!` mode.
//
//   2) Inside the main target: use_modular_headers!
//      Builds React pods as modular frameworks so cross-module macros / types
//      (RCT_EXTERN, RCTPromiseRejectBlock, RCTConvert) are visible to RNFB's .m files.
//
//   3) post_install: CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES
//      Defensive fallback for any remaining non-modular include that the two flags
//      above don't cover.

const MARKER_STATIC = '# >>> withFirebaseModularHeaders: RNFB static framework';
const MARKER_MODULAR = '# >>> withFirebaseModularHeaders: use_modular_headers';
const MARKER_POST_INSTALL = '# >>> withFirebaseModularHeaders: allow non-modular';

module.exports = function withFirebaseModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile'
      );
      let contents = fs.readFileSync(podfilePath, 'utf-8');
      let changed = false;

      if (!contents.includes(MARKER_STATIC)) {
        contents = `${MARKER_STATIC}\n$RNFirebaseAsStaticFramework = true\n\n${contents}`;
        changed = true;
        console.log(
          '[withFirebaseModularHeaders] ✓ $RNFirebaseAsStaticFramework = true injected'
        );
      }

      if (!contents.includes(MARKER_MODULAR)) {
        const patched = contents.replace(
          /^(\s+)use_expo_modules!/m,
          `$1${MARKER_MODULAR}\n$1use_modular_headers!\n$1use_expo_modules!`
        );
        if (patched === contents) {
          throw new Error(
            '[withFirebaseModularHeaders] failed to locate use_expo_modules! line'
          );
        }
        contents = patched;
        changed = true;
        console.log(
          '[withFirebaseModularHeaders] ✓ use_modular_headers! injected'
        );
      }

      if (!contents.includes(MARKER_POST_INSTALL)) {
        const postInstallBlock = `
    ${MARKER_POST_INSTALL}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
`;
        const match = contents.match(/post_install do \|installer\|/);
        if (match) {
          contents = contents.replace(
            /(post_install do \|installer\|\n)/,
            `$1${postInstallBlock}`
          );
        } else {
          contents = contents.replace(
            /(\nend\s*)$/,
            `\n  post_install do |installer|${postInstallBlock}  end\n$1`
          );
        }
        changed = true;
        console.log(
          '[withFirebaseModularHeaders] ✓ CLANG_ALLOW_NON_MODULAR_INCLUDES injected'
        );
      }

      if (changed) {
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
