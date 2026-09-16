'use client'

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  SETTINGS_STORAGE_KEY,
  applySettingsToDocument,
  createDefaultSettings,
  createSettingsTranslator,
  getSystemPrefersDark,
  mergeSettings,
  readStoredSettings,
  resetUserSettings,
  resolveThemeMode,
  writeStoredSettings,
} from '@/lib/userSettings'

const UserSettingsContext = createContext(null)
const serverSettings = createDefaultSettings()
const getServerSnapshot = () => serverSettings
const getServerTheme = () => false

function subscribeSystemTheme(listener) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

// One store per provider. The server snapshot stays deterministic; persisted
// browser preferences are read only by React's client snapshot mechanism.
function createSettingsStore() {
  let snapshot = null
  const listeners = new Set()
  const publish = (next) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
  const getSnapshot = () => {
    if (!snapshot) snapshot = readStoredSettings()
    return snapshot
  }
  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      const handleStorage = (event) => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
          publish(readStoredSettings())
        }
      }
      window.addEventListener('storage', handleStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', handleStorage)
      }
    },
    updateSettings(patch) {
      const next = mergeSettings(getSnapshot(), patch)
      writeStoredSettings(next)
      publish(next)
      return next
    },
    resetSettings() {
      const next = resetUserSettings()
      publish(next)
      return next
    },
  }
}

export default function UserSettingsProvider({ children }) {
  const [store] = useState(createSettingsStore)
  const settings = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot)
  const prefersDark = useSyncExternalStore(subscribeSystemTheme, getSystemPrefersDark, getServerTheme)
  const resolvedTheme = resolveThemeMode(settings.theme, prefersDark)

  useEffect(() => {
    applySettingsToDocument(settings)
  }, [settings, resolvedTheme])

  const value = useMemo(() => ({
    settings,
    resolvedTheme,
    t: createSettingsTranslator(settings),
    updateSettings: store.updateSettings,
    resetSettings: store.resetSettings,
  }), [settings, resolvedTheme, store])

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>
}

export function useUserSettings() {
  const value = useContext(UserSettingsContext)
  if (!value) throw new Error('useUserSettings must be used within UserSettingsProvider')
  return value
}
