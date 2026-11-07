'use client'

import { KeyRound, LogOut, Mail, PauseCircle, RotateCcw, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { ActionRow, LinkButton, PrimaryButton, SettingsCard } from './SettingsControls'

export default function SecuritySection({
  t,
  email,
  onResetPassword,
  onSignOutAll,
  onDeactivate,
  onReactivate,
  onScheduleDeletion,
  onCancelDeletion,
  accountLifecycle,
  accountActionPending,
  resetStatus,
  signingOut,
}) {
  const deletionDate = accountLifecycle?.deletionScheduledFor
    ? new Date(accountLifecycle.deletionScheduledFor).toLocaleDateString(undefined, { dateStyle: 'long' })
    : ''
  const deletionPending = Boolean(accountLifecycle?.deletionScheduledFor)
  const deactivated = Boolean(accountLifecycle?.accountDeactivatedAt) && !deletionPending

  return (
    <SettingsCard
      icon={ShieldCheck}
      title={t('settings.security.title')}
      description={t('settings.security.description')}
    >
      <ActionRow icon={Mail} label={t('settings.security.email')} hint={email || '—'} />

      <ActionRow
        icon={KeyRound}
        label={t('settings.security.resetPassword')}
        hint={t('settings.security.resetPasswordHint')}
      >
        <PrimaryButton onClick={onResetPassword} disabled={!email} tone="neutral">{t('settings.security.resetPassword')}</PrimaryButton>
      </ActionRow>

      <ActionRow
        icon={UserRound}
        label={t('settings.security.profile')}
        hint={t('settings.security.profileHint')}
      >
        <LinkButton href="/user/profile/edit">{t('settings.security.profile')}</LinkButton>
      </ActionRow>

      <ActionRow
        icon={LogOut}
        label={t('settings.security.signOutAll')}
        hint={t('settings.security.signOutAllHint')}
      >
        <PrimaryButton onClick={onSignOutAll} disabled={signingOut} tone="danger">
          {signingOut ? t('common.saving') : t('settings.security.signOutAll')}
        </PrimaryButton>
      </ActionRow>

      {deletionPending ? (
        <ActionRow
          icon={Trash2}
          label={t('settings.security.deletionScheduled')}
          hint={`${t('settings.security.deletionScheduledHint')} ${deletionDate}.`}
        >
          <PrimaryButton onClick={onCancelDeletion} disabled={accountActionPending} tone="neutral">
            {accountActionPending ? t('common.saving') : t('settings.security.cancelDeletion')}
          </PrimaryButton>
        </ActionRow>
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
            <ActionRow
              icon={Trash2}
              label={t('settings.security.deleteAccount')}
              hint={t('settings.security.deleteAccountHint')}
            >
              <PrimaryButton onClick={onScheduleDeletion} disabled={accountActionPending} tone="danger">
                {t('settings.security.deleteAccount')}
              </PrimaryButton>
            </ActionRow>
          ) : null}
        </>
      )}

      {resetStatus ? <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{resetStatus}</p> : null}
    </SettingsCard>
  )
}