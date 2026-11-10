'use client'

import { PauseCircle, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { ActionRow, PrimaryButton, SettingsCard } from './SettingsControls'

export default function AccountManagementSection({
  t,
  accountLifecycle,
  accountActionPending,
  onDeactivate,
  onReactivate,
  onScheduleDeletion,
}) {
  const deletionPending = Boolean(accountLifecycle?.deletionScheduledFor)
  const deactivated = Boolean(accountLifecycle?.accountDeactivatedAt) && !deletionPending
  const deletionDate = accountLifecycle?.deletionScheduledFor
    ? new Date(accountLifecycle.deletionScheduledFor).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })
    : ''

  return (
    <SettingsCard
      icon={ShieldAlert}
      title="Account Management"
      description="Temporarily deactivate your account or schedule its permanent deletion."
    >
      {deletionPending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <h3 className="text-sm font-bold">{t('settings.security.deletionScheduled')}</h3>
          <p className="mt-1 text-sm leading-6">
            Your account is scheduled for permanent deletion on {deletionDate}. You have {accountLifecycle.remainingDays} day{accountLifecycle.remainingDays === 1 ? '' : 's'} to change your mind and restore your account.
          </p>
          <p className="mt-2 text-xs leading-5">You are signed out while deletion is pending. Use the secure recovery page to restore your account.</p>
          <Link href="/info/account-recovery" className="mt-3 inline-flex min-h-10 items-center rounded-full bg-white px-4 py-2 text-sm font-bold text-blue-700 ring-1 ring-amber-200 hover:bg-amber-100">
            Cancel deletion request
          </Link>
        </div>
      ) : (
        <>
          <ActionRow
            icon={deactivated ? RotateCcw : PauseCircle}
            label={deactivated ? t('settings.security.reactivate') : t('settings.security.deactivate')}
            hint={deactivated ? t('settings.security.reactivateHint') : t('settings.security.deactivateHint')}
          >
            <PrimaryButton
              onClick={deactivated ? onReactivate : onDeactivate}
              disabled={accountActionPending}
              tone={deactivated ? 'primary' : 'neutral'}
            >
              {accountActionPending
                ? t('common.saving')
                : deactivated ? t('settings.security.reactivate') : t('settings.security.deactivate')}
            </PrimaryButton>
          </ActionRow>

          {!deactivated ? (
            <div className="settings-danger-zone">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-red-800">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Danger zone
                </h3>
                <p className="mt-1 text-xs leading-5 text-red-700">{t('settings.security.deleteAccountHint')}</p>
              </div>
              <PrimaryButton onClick={onScheduleDeletion} disabled={accountActionPending} tone="danger">
                {t('settings.security.deleteAccount')}
              </PrimaryButton>
            </div>
          ) : null}
        </>
      )}
    </SettingsCard>
  )
}
