import { isTauri } from './notifications'

export interface AppUpdateInfo {
  available: boolean
  version?: string
  body?: string
  installAndRelaunch?: () => Promise<void>
}

/**
 * Checks for updates against GitHub Releases via tauri-plugin-updater.
 * No-op in browser mode.
 */
export async function checkForAppUpdates(): Promise<AppUpdateInfo> {
  if (!isTauri()) {
    return { available: false }
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const { relaunch } = await import('@tauri-apps/plugin-process')

    const update = await check()
    if (update) {
      return {
        available: true,
        version: update.version,
        body: update.body ?? 'A new version of MyNotes is available.',
        installAndRelaunch: async () => {
          await update.downloadAndInstall()
          await relaunch()
        },
      }
    }
    return { available: false }
  } catch (error) {
    console.warn('[updater] Update check failed:', error)
    throw error
  }
}
