// ============================================
// DL Chat API - App Update Routes
// Provides version checking and update manifests
// for all platforms (Electron, Android, iOS)
// ============================================
import { Hono } from 'hono';
import type { Env, Variables } from '../types';

const updates = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Current app versions (managed via system_settings table) ────────────────
const DEFAULT_VERSIONS = {
  android: {
    latest: '1.0.0',
    minimum: '1.0.0',
    build: 1,
    url: 'https://download.dlchat.app/android/dlchat-latest.apk',
    changelog: 'Initial release of DL Chat for Android.',
    force_update: false,
    size_bytes: 52428800, // 50 MB
  },
  ios: {
    latest: '1.0.0',
    minimum: '1.0.0',
    build: 1,
    url: 'https://apps.apple.com/app/dl-chat/id0000000000',
    changelog: 'Initial release of DL Chat for iOS.',
    force_update: false,
    size_bytes: 45000000, // ~43 MB
  },
  windows: {
    latest: '1.0.0',
    build: 1,
    url: 'https://download.dlchat.app/windows/dlchat-setup-1.0.0.exe',
    changelog: 'Initial release of DL Chat Desktop for Windows.',
    sha512: '',
    size_bytes: 78643200, // 75 MB
  },
  macos: {
    latest: '1.0.0',
    build: 1,
    url: 'https://download.dlchat.app/macos/dlchat-1.0.0.dmg',
    changelog: 'Initial release of DL Chat Desktop for macOS.',
    sha512: '',
    size_bytes: 85000000, // ~81 MB
  },
  linux: {
    latest: '1.0.0',
    build: 1,
    url: 'https://download.dlchat.app/linux/dlchat-1.0.0.deb',
    changelog: 'Initial release of DL Chat Desktop for Linux.',
    sha512: '',
    size_bytes: 72000000, // ~69 MB
  },
  web: {
    latest: '1.0.0',
    build: 1,
    url: 'https://app.dlchat.app',
    changelog: 'Initial release.',
  },
};

// ─── GET /api/v1/updates/check ────────────────────────────────────────────────
// Check if an update is available for the requesting platform.
// Query: platform=android|ios|windows|macos|linux|web
//        current_version=1.0.0
//        current_build=1 (optional, for Android build codes)
updates.get('/check', async (c) => {
  const platform = c.req.query('platform') || 'android';
  const currentVersion = c.req.query('current_version') || '0.0.0';
  const currentBuild = parseInt(c.req.query('current_build') || '0', 10);

  // Validate platform
  const validPlatforms = ['android', 'ios', 'windows', 'macos', 'linux', 'web'];
  if (!validPlatforms.includes(platform)) {
    return c.json({ error: 'Invalid platform' }, 400);
  }

  try {
    // Try to load from DB system_settings
    let platformData: Record<string, unknown> | null = null;
    try {
      const settingKey = `app_version_${platform}`;
      const result = await c.env.DB.prepare(
        'SELECT value FROM system_settings WHERE key = ?'
      )
        .bind(settingKey)
        .first<{ value: string }>();

      if (result?.value) {
        platformData = JSON.parse(result.value);
      }
    } catch {
      // Fall back to defaults
    }

    const versionInfo = (platformData || DEFAULT_VERSIONS[platform as keyof typeof DEFAULT_VERSIONS]) as Record<string, unknown>;

    const latestVersion = versionInfo.latest as string;
    const minimumVersion = (versionInfo.minimum as string) || latestVersion;
    const latestBuild = (versionInfo.build as number) || 1;
    const forceUpdate = (versionInfo.force_update as boolean) || false;

    // Compare versions (semver-like comparison)
    const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0
      || (latestBuild > currentBuild && currentBuild > 0);
    const isCritical = forceUpdate || (compareVersions(minimumVersion, currentVersion) > 0);

    return c.json({
      success: true,
      data: {
        platform,
        current_version: currentVersion,
        latest_version: latestVersion,
        latest_build: latestBuild,
        minimum_version: minimumVersion,
        update_available: isUpdateAvailable,
        is_critical: isCritical,
        force_update: isCritical,
        download_url: versionInfo.url,
        changelog: versionInfo.changelog || '',
        size_bytes: versionInfo.size_bytes || 0,
        sha512: versionInfo.sha512 || '',
        release_date: versionInfo.release_date || new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[updates/check]', err);
    return c.json({ error: 'Failed to check for updates' }, 500);
  }
});

// ─── GET /api/v1/updates/latest ──────────────────────────────────────────────
// Returns the full latest version manifest for all platforms
updates.get('/latest', async (c) => {
  try {
    const manifest: Record<string, unknown> = {};

    for (const platform of Object.keys(DEFAULT_VERSIONS)) {
      let platformData = null;
      try {
        const result = await c.env.DB.prepare(
          'SELECT value FROM system_settings WHERE key = ?'
        )
          .bind(`app_version_${platform}`)
          .first<{ value: string }>();
        if (result?.value) {
          platformData = JSON.parse(result.value);
        }
      } catch {
        // use defaults
      }

      manifest[platform] = platformData || DEFAULT_VERSIONS[platform as keyof typeof DEFAULT_VERSIONS];
    }

    return c.json({
      success: true,
      data: manifest,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[updates/latest]', err);
    return c.json({ error: 'Failed to fetch version manifest' }, 500);
  }
});

// ─── GET /api/v1/updates/changelog/:platform ─────────────────────────────────
// Returns the full changelog for a platform (last 20 versions)
updates.get('/changelog/:platform', async (c) => {
  const platform = c.req.param('platform');
  const validPlatforms = ['android', 'ios', 'windows', 'macos', 'linux', 'web'];
  if (!validPlatforms.includes(platform)) {
    return c.json({ error: 'Invalid platform' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      "SELECT value FROM system_settings WHERE key = ?"
    )
      .bind(`app_changelog_${platform}`)
      .first<{ value: string }>();

    const changelog = result?.value
      ? JSON.parse(result.value)
      : [
          {
            version: '1.0.0',
            date: new Date().toISOString(),
            notes: 'Initial release.',
          },
        ];

    return c.json({ success: true, data: { platform, changelog } });
  } catch (err) {
    return c.json({ error: 'Failed to fetch changelog' }, 500);
  }
});

// ─── POST /api/v1/updates/version (admin only) ───────────────────────────────
// Update the version info for a platform (called from admin panel or CI/CD)
updates.post('/version', async (c) => {
  // Check for admin secret
  const adminSecret = c.req.header('X-Admin-Secret');
  const expectedSecret = c.env.ADMIN_SECRET || 'change-me-in-production';
  if (adminSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { platform, version_data } = body;

  if (!platform || !version_data) {
    return c.json({ error: 'platform and version_data required' }, 400);
  }

  try {
    await c.env.DB.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
      .bind(`app_version_${platform}`, JSON.stringify(version_data), new Date().toISOString())
      .run();

    return c.json({ success: true, message: `Version updated for ${platform}` });
  } catch (err) {
    return c.json({ error: 'Failed to update version' }, 500);
  }
});

// ─── GET /api/v1/updates/electron/latest.yml ─────────────────────────────────
// electron-updater YAML manifest (GitHub Releases compatible format)
// Used by electron-updater's autoUpdater.checkForUpdates()
updates.get('/electron/latest.yml', async (c) => {
  const platform = c.req.query('platform') || 'windows'; // windows, macos, linux

  let versionInfo: Record<string, unknown>;
  try {
    const result = await c.env.DB.prepare(
      'SELECT value FROM system_settings WHERE key = ?'
    )
      .bind(`app_version_${platform}`)
      .first<{ value: string }>();
    versionInfo = result?.value
      ? JSON.parse(result.value)
      : DEFAULT_VERSIONS[platform as keyof typeof DEFAULT_VERSIONS] as Record<string, unknown>;
  } catch {
    versionInfo = DEFAULT_VERSIONS[platform as keyof typeof DEFAULT_VERSIONS] as Record<string, unknown>;
  }

  const version = versionInfo.latest as string;
  const url = versionInfo.url as string;
  const sha512 = (versionInfo.sha512 as string) || '';
  const size = (versionInfo.size_bytes as number) || 0;
  const releaseDate = (versionInfo.release_date as string) || new Date().toISOString();

  // electron-updater expects YAML format
  const filename = url.split('/').pop() || `dlchat-setup-${version}.exe`;
  const yaml = `version: ${version}
files:
  - url: ${filename}
    sha512: ${sha512}
    size: ${size}
path: ${filename}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`;

  c.header('Content-Type', 'application/x-yaml');
  return c.text(yaml);
});

// ─── GET /api/v1/updates/android/latest.json ─────────────────────────────────
// Android update manifest (for in-app update downloader)
updates.get('/android/latest.json', async (c) => {
  let versionInfo: Record<string, unknown>;
  try {
    const result = await c.env.DB.prepare(
      "SELECT value FROM system_settings WHERE key = 'app_version_android'"
    )
      .first<{ value: string }>();
    versionInfo = result?.value
      ? JSON.parse(result.value)
      : DEFAULT_VERSIONS.android;
  } catch {
    versionInfo = DEFAULT_VERSIONS.android;
  }

  return c.json({
    version: versionInfo.latest,
    version_code: versionInfo.build,
    apk_url: versionInfo.url,
    changelog: versionInfo.changelog,
    size_bytes: versionInfo.size_bytes,
    minimum_version: versionInfo.minimum,
    force_update: versionInfo.force_update,
    release_date: versionInfo.release_date || new Date().toISOString(),
  });
});

// ─── Semver comparison helper ─────────────────────────────────────────────────
function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    (v || '0.0.0').split('.').map((p) => parseInt(p, 10) || 0);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

export default updates;
