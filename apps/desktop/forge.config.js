const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'DL Chat',
    executableName: 'dl-chat',
    icon: './assets/icon',
    appBundleId: 'com.deathlegion.dlchat',
    appCategoryType: 'public.app-category.social-networking',
    win32metadata: {
      CompanyName: 'DEATH LEGION Team',
      FileDescription: 'DL Chat - The Securest Messaging App',
      OriginalFilename: 'DLChat.exe',
      ProductName: 'DL Chat',
      InternalName: 'DLChat',
    },
    osxSign: {
      identity: 'Developer ID Application: DEATH LEGION Team',
      'hardened-runtime': true,
      entitlements: 'entitlements.plist',
      'entitlements-inherit': 'entitlements.plist',
    },
    extraResource: ['./assets/tray-icon.png'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'DLChat',
        authors: 'DEATH LEGION Team',
        exe: 'DLChat.exe',
        setupExe: 'DLChat-Setup.exe',
        setupIcon: './assets/icon.ico',
        noDelta: false,
        noMsi: false,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO',
        name: 'DL Chat',
        icon: './assets/icon.icns',
        background: './assets/dmg-background.png',
        window: {
          size: {
            width: 540,
            height: 380,
          },
        },
        contents: [
          {
            x: 130,
            y: 180,
            type: 'file',
            path: '${appPath}',
          },
          {
            x: 410,
            y: 180,
            type: 'link',
            path: '/Applications',
          },
        ],
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'dl-chat',
          productName: 'DL Chat',
          maintainer: 'DEATH LEGION Team',
          homepage: 'https://dlchat.app',
          categories: ['Network', 'InstantMessaging'],
          icon: './assets/icon.png',
          genericName: 'Messaging',
          description: 'DL Chat - The Securest Messaging App by DEATH LEGION Team',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              name: 'main_window',
              html: './src/renderer/index.html',
              js: './src/renderer/index.ts',
              preload: {
                js: './src/main/preload.ts',
              },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
