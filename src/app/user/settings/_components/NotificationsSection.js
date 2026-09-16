'use client'

import { Bell } from 'lucide-react'
import { ActionRow, SettingsCard, ToggleRow } from './SettingsControls'
import EnableNotificationsButton from '@/components/EnableNotificationsButton'
import { NOTIFICATION_OPTIONS } from '@/lib/userSettings'

export default function NotificationsSection({ settings, t, userId, onNotificationChange }) {
  return (
    <SettingsCard
      icon={Bell}
      title={t('settings.notifications.title')}
      description={t('settings.notifications.description')}
    >
      <p role="note" className="text-sm text-slate-500">{t('settings.notifications.unavailable')}</p>
      {NOTIFICATION_OPTIONS.map((option) => (
        <ToggleRow
          key={option.key}
          disabled
          id={`settings-notification-${option.key}`}
          label={t(option.labelKey)}
          checked={Boolean(settings.notifications[option.key])}
          onChange={(next) => onNotificationChange(option.key, next)}
        />
      ))}

      <ActionRow label={t('settings.notifications.push')} hint={t('settings.notifications.pushHint')}>
        {userId ? <EnableNotificationsButton userId={userId} /> : null}
      </ActionRow>
    </SettingsCard>
  )
}