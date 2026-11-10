'use client'

import { Lock } from 'lucide-react'
import { ChoiceCards, SelectField, SettingsCard, StatusBanner, ToggleRow } from './SettingsControls'
import { MESSAGE_PRIVACY_LEVELS, PRIVACY_LEVEL_OPTIONS } from '@/lib/userSettings'

export default function PrivacySection({ settings, t, onPrivacyChange }) {
  const messageOptions = [
    { value: 'everyone', label: t('settings.privacy.everyone') },
    { value: 'connections', label: t('settings.privacy.connections') },
  ]

  return (
    <SettingsCard
      icon={Lock}
      title={t('settings.privacy.title')}
      description={t('settings.privacy.description')}
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{t('settings.privacy.profileVisibility')}</p>
        <div className="mt-2">
          <ChoiceCards
            name={t('settings.privacy.profileVisibility')}
            options={PRIVACY_LEVEL_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
              hint: t(option.hintKey),
            }))}
            value={settings.privacy.privacyLevel}
            onChange={(value) => onPrivacyChange('privacyLevel', value)}
            columns={3}
          />
        </div>
      </div>

      <SelectField
        id="settings-message-privacy"
        label={t('settings.privacy.allowMessagesFrom')}
        value={settings.privacy.allowMessagesFrom}
        onChange={(value) => onPrivacyChange('allowMessagesFrom', value)}
        options={messageOptions.filter((option) => MESSAGE_PRIVACY_LEVELS.includes(option.value))}
      />

      <ToggleRow
        id="settings-privacy-searchable"
        label={t('settings.privacy.searchable')}
        hint={t('settings.privacy.searchableHint')}
        checked={settings.privacy.searchable}
        onChange={(next) => onPrivacyChange('searchable', next)}
      />

      <StatusBanner tone="info">{t('settings.privacy.unavailable')}</StatusBanner>
    </SettingsCard>
  )
}