'use client'

import { Moon, MonitorSmartphone, Sun } from 'lucide-react'
import { ChoiceCards, SettingsCard, ToggleRow } from './SettingsControls'
import { THEME_OPTIONS } from '@/lib/userSettings'

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: MonitorSmartphone,
}

export default function AppearanceSection({ settings, t, resolvedTheme, onThemeChange, onReduceMotionChange }) {
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
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{t('settings.appearance.theme')}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{t('settings.appearance.themeHint')}</p>
        <div className="mt-2">
          <ChoiceCards
            name={t('settings.appearance.theme')}
            options={themeOptions}
            value={settings.theme}
            onChange={onThemeChange}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">
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