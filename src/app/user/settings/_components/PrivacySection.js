'use client'

import Link from 'next/link'
import { Lock, ShieldCheck } from 'lucide-react'
import { ActionRow, ChoiceCards, SelectField, SettingsCard, ToggleRow } from './SettingsControls'
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
            columns={2}
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
        id="settings-privacy-online"
        label={t('settings.privacy.showOnlineStatus')}
        hint={t('settings.privacy.showOnlineStatusHint')}
        checked={settings.privacy.showOnlineStatus}
        onChange={(next) => onPrivacyChange('showOnlineStatus', next)}
      />

      <ToggleRow
        id="settings-privacy-activity"
        label={t('settings.privacy.showActivity')}
        hint={t('settings.privacy.showActivityHint')}
        checked={settings.privacy.showActivity}
        onChange={(next) => onPrivacyChange('showActivity', next)}
      />

      <ToggleRow
        id="settings-privacy-mentions"
        label={t('settings.privacy.allowMentions')}
        hint={t('settings.privacy.allowMentionsHint')}
        checked={settings.privacy.allowMentions}
        onChange={(next) => onPrivacyChange('allowMentions', next)}
      />

      <ToggleRow
        id="settings-privacy-searchable"
        label={t('settings.privacy.searchable')}
        hint={t('settings.privacy.searchableHint')}
        checked={settings.privacy.searchable}
        onChange={(next) => onPrivacyChange('searchable', next)}
      />

      <ActionRow
        icon={ShieldCheck}
        label={t('settings.legal.privacy')}
        hint={t('settings.legal.description')}
      >
        <Link href="/legal/privacy-policy" className="text-xs font-bold text-sky-700">{t('settings.legal.privacy')}</Link>
      </ActionRow>
    </SettingsCard>
  )
}