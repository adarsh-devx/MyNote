import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  isNotificationEnabled,
  setNotificationEnabled,
  isTauri,
} from '../lib/notifications'
import { checkForAppUpdates, type AppUpdateInfo } from '../lib/updater'

interface SettingsModalProps {
  onClose: () => void
}

const APP_VERSION = '0.1.0'

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [notificationsOn, setNotificationsOn] = useState(() =>
    isNotificationEnabled(),
  )
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null)
  const [installingUpdate, setInstallingUpdate] = useState(false)

  // Keeps keyboard focus inside the dialog and restores it to the trigger
  // when the modal closes.
  const dialogRef = useFocusTrap<HTMLDivElement>()

  // Escape closes the modal.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function toggleNotifications() {
    const next = !notificationsOn
    setNotificationsOn(next)
    setNotificationEnabled(next)
  }

  async function handleCheckUpdate() {
    if (updateInfo?.available && updateInfo.installAndRelaunch) {
      setInstallingUpdate(true)
      setUpdateStatusMsg('Downloading and installing update...')
      try {
        await updateInfo.installAndRelaunch()
      } catch (err) {
        setInstallingUpdate(false)
        setUpdateStatusMsg('Failed to install update. Please try again.')
      }
      return
    }

    setCheckingUpdate(true)
    setUpdateStatusMsg(null)
    try {
      const info = await checkForAppUpdates()
      setUpdateInfo(info)
      if (info.available) {
        setUpdateStatusMsg(`New version v${info.version} is ready to install!`)
      } else {
        setUpdateStatusMsg("You're on the latest version.")
      }
    } catch (err) {
      setUpdateStatusMsg('Could not check for updates.')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const isDesktop = isTauri()

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={dialogRef}
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="profile-modal-top">
          <button
            className="profile-back-button"
            onClick={onClose}
            aria-label="Back"
            type="button"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="profile-modal-title">Settings</h2>
        </div>

        {/* Appearance */}
        <section className="settings-section">
          <h3 className="settings-section-title">Appearance</h3>
          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-label">Theme</span>
              <span className="settings-value">Light</span>
            </div>
          </div>
        </section>

        {/* Notifications — only relevant on desktop (Tauri) */}
        {isDesktop && (
          <section className="settings-section">
            <h3 className="settings-section-title">Notifications</h3>
            <div className="settings-card">
              <div className="settings-row">
                <div className="settings-row-text">
                  <Bell size={18} className="settings-icon" />
                  <div>
                    <span className="settings-label">
                      Desktop Notifications
                    </span>
                    <p className="settings-hint">
                      Get notified about new tasks on your PC
                    </p>
                  </div>
                </div>
                <button
                  className={`settings-toggle ${notificationsOn ? 'on' : ''}`}
                  role="switch"
                  aria-checked={notificationsOn}
                  aria-label="Desktop notifications"
                  onClick={toggleNotifications}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Shortcuts */}
        <section className="settings-section">
          <h3 className="settings-section-title">Shortcuts</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <span className="settings-label">Quick Note</span>
                <p className="settings-hint">
                  {isDesktop ? 'Global shortcut anywhere on desktop' : 'Keyboard shortcut'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span className="shortcut-badge">Alt + N</span>
                {isDesktop && <span className="shortcut-badge">Ctrl + Shift + N</span>}
              </div>
            </div>
          </div>
        </section>

        {/* About & Updates */}
        <section className="settings-section">
          <h3 className="settings-section-title">About & Updates</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-text">
                <Info size={18} className="settings-icon" />
                <div>
                  <span className="settings-label">MyNotes</span>
                  <p className="settings-hint">Version {APP_VERSION}</p>
                </div>
              </div>
              {isDesktop && (
                <button
                  type="button"
                  className="check-update-btn"
                  disabled={checkingUpdate || installingUpdate}
                  onClick={handleCheckUpdate}
                >
                  {checkingUpdate
                    ? 'Checking...'
                    : installingUpdate
                      ? 'Installing...'
                      : updateInfo?.available
                        ? `Update to v${updateInfo.version}`
                        : 'Check for updates'}
                </button>
              )}
            </div>
            {updateStatusMsg && (
              <div className="update-status-row">
                <span className="update-status-text">{updateStatusMsg}</span>
              </div>
            )}
          </div>
        </section>
      </motion.div>
    </motion.div>
  )
}
