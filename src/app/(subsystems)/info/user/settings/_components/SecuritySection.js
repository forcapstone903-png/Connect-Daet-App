'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPasswordChecks, getPasswordStrength, isPasswordValid } from '@/lib/passwordPolicy'
import { ActionRow, LinkButton, PrimaryButton, SettingsCard } from './SettingsControls'

function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete }) {
  return (
    <div>
      <label htmlFor={id} className="settings-control-label">{label}</label>
      <div className="relative mt-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          maxLength={128}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="settings-select h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-blue-700"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

export default function SecuritySection({
  t,
  onSignOutAll,
  signingOut,
}) {
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [visibility, setVisibility] = useState({ current: false, next: false, confirm: false })
  const [signOutOthers, setSignOutOthers] = useState(false)
  const [passwordPending, setPasswordPending] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const strength = getPasswordStrength(passwords.next)
  const passwordChecks = getPasswordChecks(passwords.next)
  const strengthColor = {
    Weak: 'bg-red-500',
    Medium: 'bg-amber-500',
    Strong: 'bg-emerald-500',
  }[strength.label]

  const updatePassword = (key, value) => {
    setPasswords((current) => ({ ...current, [key]: value }))
    setPasswordMessage(null)
  }

  const resetPasswordForm = () => {
    setPasswords({ current: '', next: '', confirm: '' })
    setPasswordMessage(null)
  }

  const handlePasswordChange = async (event) => {
    event.preventDefault()
    setPasswordMessage(null)

    if (!passwords.current) {
      setPasswordMessage({ tone: 'error', text: 'Enter your current password.' })
      return
    }
    if (!isPasswordValid(passwords.next)) {
      setPasswordMessage({ tone: 'error', text: 'Meet all password requirements before saving.' })
      return
    }
    if (passwords.current === passwords.next) {
      setPasswordMessage({ tone: 'error', text: 'Your new password must be different from your current password.' })
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordMessage({ tone: 'error', text: 'The new passwords do not match.' })
      return
    }

    setPasswordPending(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (signOutOthers) {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw new Error('Unable to verify your active session. Refresh and try again.')
        if (!data.session?.access_token) throw new Error('Sign in again before revoking other sessions.')
        headers.Authorization = `Bearer ${data.session.access_token}`
      }

      const response = await fetch('/info/api/user/password', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.next,
          signOutOthers,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to change your password. Please try again.')
      }

      const notes = []
      notes.push(result.emailNotificationSent
        ? 'A security notification was sent to your registered email.'
        : 'Your password changed, but the security email could not be delivered.')
      if (signOutOthers) {
        notes.push(result.otherSessionsRevoked
          ? 'Other active sessions were signed out.'
          : 'Your password changed, but other sessions could not be signed out.')
      }
      setPasswordMessage({ tone: result.emailNotificationSent && (!signOutOthers || result.otherSessionsRevoked) ? 'success' : 'warning', text: `Password updated. ${notes.join(' ')}` })
      setPasswords({ current: '', next: '', confirm: '' })
    } catch (error) {
      setPasswordMessage({ tone: 'error', text: error.message || 'Unable to change your password. Please try again.' })
    } finally {
      setPasswordPending(false)
    }
  }

  const statusTone = {
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }

  return (
    <SettingsCard
      icon={ShieldCheck}
      title="Security & Authentication"
      description="Protect your account, review sign-ins, and manage authentication sessions."
    >
      <section className="settings-control-panel" aria-labelledby="change-password-heading">
        <div className="flex items-start gap-3">
          <span className="settings-action-icon"><KeyRound className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 id="change-password-heading" className="settings-control-label">Change password</h3>
            <p className="settings-control-hint">Confirm your current password to protect this change.</p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
          <PasswordField
            id="settings-current-password"
            label="Current password"
            value={passwords.current}
            onChange={(value) => updatePassword('current', value)}
            visible={visibility.current}
            onToggle={() => setVisibility((current) => ({ ...current, current: !current.current }))}
            autoComplete="current-password"
          />

          <PasswordField
            id="settings-new-password"
            label="New password"
            value={passwords.next}
            onChange={(value) => updatePassword('next', value)}
            visible={visibility.next}
            onToggle={() => setVisibility((current) => ({ ...current, next: !current.next }))}
            autoComplete="new-password"
          />

          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Password strength</span>
              <span className="font-bold text-slate-700">{passwords.next ? strength.label : 'Not set'}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: `${(strength.score / passwordChecks.length) * 100}%` }} />
            </div>
            <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              {passwordChecks.map((check) => (
                <li key={check.key} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${check.valid ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                  {check.label}
                </li>
              ))}
            </ul>
          </div>

          <PasswordField
            id="settings-confirm-password"
            label="Confirm new password"
            value={passwords.confirm}
            onChange={(value) => updatePassword('confirm', value)}
            visible={visibility.confirm}
            onToggle={() => setVisibility((current) => ({ ...current, confirm: !current.confirm }))}
            autoComplete="new-password"
          />
          {passwords.confirm && passwords.next !== passwords.confirm ? (
            <p className="text-xs font-medium text-red-600">The new passwords do not match.</p>
          ) : null}

          <label className="flex items-start gap-2 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(event) => setSignOutOthers(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#2563EB]"
            />
            <span>Sign out all other active sessions after changing my password.</span>
          </label>

          {passwordMessage ? (
            <p role={passwordMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone[passwordMessage.tone]}`}>
              {passwordMessage.text}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton type="submit" disabled={passwordPending} tone="primary">
              {passwordPending ? 'Saving password...' : 'Save changes'}
            </PrimaryButton>
            <PrimaryButton onClick={resetPasswordForm} disabled={passwordPending} tone="neutral">Cancel</PrimaryButton>
            <LinkButton href="/info/forgot-password">Forgot your current password?</LinkButton>
          </div>
        </form>
      </section>

      <ActionRow
        icon={LogOut}
        label="Active sessions and devices"
        hint="Individual devices cannot currently be listed. This action revokes all other app sessions."
      >
        <PrimaryButton onClick={onSignOutAll} disabled={signingOut} tone="danger">
          {signingOut ? t('common.saving') : t('settings.security.signOutAll')}
        </PrimaryButton>
      </ActionRow>

    </SettingsCard>
  )
}
