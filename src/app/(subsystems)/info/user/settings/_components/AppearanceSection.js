'use client'

import { Moon, MonitorSmartphone, Sun, X } from 'lucide-react'
import { ChoiceCards, SettingsCard, ToggleRow } from './SettingsControls'
import { THEME_OPTIONS } from '@/lib/userSettings'

function AppearanceHeaderActions({ onDone, onClose }) {
  return (
    <div className="settings-appearance-header-actions">
      <button type="button" className="settings-appearance-close" onClick={onClose} aria-label="Close Appearance settings">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className="settings-appearance-done" onClick={onDone}>Done</button>
    </div>
  )
}

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: MonitorSmartphone,
}

export default function AppearanceSection({ settings, t, resolvedTheme, onThemeChange, onReduceMotionChange, onDone, onClose }) {
  const themeOptions = THEME_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    hint: t(option.hintKey),
    icon: THEME_ICONS[option.value],
  }))

  return (
    <SettingsCard
      icon={Sun}
      title={t('settings.appearance.title')}
      description={t('settings.appearance.description')}
      headerAction={onDone ? <AppearanceHeaderActions onDone={onDone} onClose={onClose} /> : null}
    >
      <div className="settings-theme-block">
        <p className="settings-theme-title">{t('settings.appearance.theme')}</p>
        <p className="settings-theme-hint">{t('settings.appearance.themeHint')}</p>
        <div className="settings-theme-options">
          <ChoiceCards
            name={t('settings.appearance.theme')}
            options={themeOptions}
            value={settings.theme}
            onChange={onThemeChange}
          />
        </div>
        <p className="settings-current-theme">
          {t('settings.appearance.currentTheme')}: {t(resolvedTheme === 'dark' ? 'settings.appearance.dark' : 'settings.appearance.light')}
        </p>
      </div>

      <ToggleRow
        id="settings-reduce-motion"
        label={t('settings.appearance.reduceMotion')}
        hint={t('settings.appearance.reduceMotionHint')}
        checked={settings.reduceMotion}
        onChange={onReduceMotionChange}
      />
    </SettingsCard>
  )
}