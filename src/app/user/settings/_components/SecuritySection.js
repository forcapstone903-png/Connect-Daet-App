'use client'

import { KeyRound, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { ActionRow, LinkButton, PrimaryButton, SettingsCard } from './SettingsControls'

export default function SecuritySection({ t, email, onResetPassword, onSignOutAll, resetStatus, signingOut }) {
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

      {resetStatus ? <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{resetStatus}</p> : null}
    </SettingsCard>
  )
}