'use client'

import { Bell, Mail, MessageSquare, ShieldCheck } from 'lucide-react'
import { ActionRow, SettingsCard, ToggleRow } from './SettingsControls'
import EnableNotificationsButton from '@/components/EnableNotificationsButton'
import AlertPreferences from './AlertPreferences'
import { NOTIFICATION_OPTIONS } from '@/lib/userSettings'

const IN_APP_NOTIFICATION_KEYS = new Set(['newFollowers', 'forumMentions', 'announcementAlerts'])

export default function NotificationsSection({ settings, t, userId, onNotificationChange }) {
  return (
    <SettingsCard
      icon={Bell}
      title={t('settings.notifications.title')}
      description={t('settings.notifications.description')}
    >
      {NOTIFICATION_OPTIONS.filter((option) => IN_APP_NOTIFICATION_KEYS.has(option.key)).map((option) => (
        <ToggleRow
          key={option.key}
          id={`settings-notification-${option.key}`}
          label={t(option.labelKey)}
          checked={Boolean(settings.notifications[option.key])}
          onChange={(next) => onNotificationChange(option.key, next)}
        />
      ))}
      <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
        {t('settings.notifications.filterHint')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Email notifications
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">Email marketing and activity digests are not configured. Important security emails are sent when the email service is available.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <MessageSquare className="h-4 w-4 text-slate-500" aria-hidden="true" />
            SMS notifications
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">SMS delivery and member phone verification are not configured, so no SMS preference is offered.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Important account alerts
        </div>
        <p className="mt-1 text-xs leading-5 text-blue-800">Security and account-lifecycle notices are sent to your registered email when delivery is configured. These essential alerts are not disabled by notification preferences.</p>
      </div>

      <ActionRow label={t('settings.notifications.push')} hint={t('settings.notifications.pushHint')}>
        {userId ? <EnableNotificationsButton userId={userId} /> : null}
      </ActionRow>

      {userId ? <AlertPreferences /> : null}
    </SettingsCard>
  )
}