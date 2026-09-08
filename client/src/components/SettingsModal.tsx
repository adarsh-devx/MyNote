import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  isNotificationEnabled,
  setNotificationEnabled,
  isTauri,
} from '../lib/notifications'

interface SettingsModalProps {
  onClose: () => void
}

const APP_VERSION = '0.1.0'

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [notificationsOn, setNotificationsOn] = useState(() =>
    isNotificationEnabled(),
  )

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

        {/* About */}
        <section className="settings-section">
          <h3 className="settings-section-title">About</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row-text">
                <Info size={18} className="settings-icon" />
                <div>
                  <span className="settings-label">MyNotes</span>
                  <p className="settings-hint">Version {APP_VERSION}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </motion.div>
    </motion.div>
  )
}
