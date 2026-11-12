'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import { DEFAULT_EMAIL_SETTINGS } from '@/lib/siteSettings.mjs';

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

export default function AdminSettingsEmail() {
  const [emailStatus, setEmailStatus] = useState({ status: 'loading', fromEmail: null, error: '' });
  const [sending, setSending] = useState(false);
  const [emailForm, setEmailForm] = useState(DEFAULT_EMAIL_SETTINGS);
  const [savingEmail, setSavingEmail] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/info/api/admin/settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load email settings.');
        if (active) setEmailForm({ ...DEFAULT_EMAIL_SETTINGS, ...data.settings?.email });
      })
      .catch((error) => { if (active) setSettingsError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    const loadEmailStatus = async () => {
      try {
        const response = await fetch('/info/api/admin/settings/email', { cache: 'no-store' });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Unable to load email settings (${response.status}).`);
        }
        if (active) {
          setEmailStatus({
            status: data.configured ? 'configured' : 'missing',
            fromEmail: data.fromEmail,
            error: '',
          });
        }
      } catch (error) {
        if (active) setEmailStatus({ status: 'error', fromEmail: null, error: error.message });
      }
    };

    loadEmailStatus();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsShell
      title="Email"
      subtitle="Sender details, which emails are sent, and a delivery test."
    >
      {(showToast) => {
        const sendTestEmail = async () => {
          setSending(true);
          try {
            const response = await fetch('/info/api/admin/settings/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) {
              throw new Error(data.message || `Unable to send test email (${response.status}).`);
            }
            showToast(data.message);
          } catch (error) {
            showToast(error.message || 'Unable to send test email.', true);
          } finally {
            setSending(false);
          }
        };

        const configured = emailStatus.status === 'configured';

        const saveEmailSettings = async () => {
          setSavingEmail(true);
          try {
            const response = await fetch('/info/api/admin/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'email', value: emailForm }),
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save email settings.');
            setEmailForm({ ...DEFAULT_EMAIL_SETTINGS, ...data.setting?.value });
            showToast('Email settings saved.');
          } catch (error) {
            showToast(error.message || 'Unable to save email settings.', true);
          } finally {
            setSavingEmail(false);
          }
        };

        return (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Server email delivery</h2>
              <p className="mt-2 text-sm text-slate-600">
                Email is sent through SendGrid using server-only environment variables. Provider secrets are not collected or stored in this page or the browser.
              </p>

              <div className={`mt-4 rounded-xl border p-4 ${configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} aria-live="polite">
                <p className={`font-semibold ${configured ? 'text-emerald-800' : 'text-amber-900'}`}>
                  {emailStatus.status === 'loading' && 'Checking provider configuration…'}
                  {emailStatus.status === 'configured' && 'SendGrid is configured'}
                  {emailStatus.status === 'missing' && 'SendGrid is not configured'}
                  {emailStatus.status === 'error' && 'Unable to check email configuration'}
                </p>
                {emailStatus.fromEmail && (
                  <p className="mt-1 text-sm text-slate-700">Verified sender setting: {emailStatus.fromEmail}</p>
                )}
                {emailStatus.status === 'missing' && (
                  <p className="mt-1 text-sm text-amber-900">
                    Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in the server deployment environment, then redeploy.
                  </p>
                )}
                {emailStatus.error && <p className="mt-1 text-sm text-red-700">{emailStatus.error}</p>}
              </div>

              <button
                type="button"
                onClick={sendTestEmail}
                disabled={!configured || sending}
                className="mt-4 rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? 'Sending test email…' : 'Send test email to my admin account'}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                The test message is sent to the email address on the currently signed-in administrator account.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Sender and content</h2>
              {settingsError ? <p role="alert" className="mt-2 text-sm text-red-700">{settingsError}</p> : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Sender name
                  <input value={emailForm.sender_name} onChange={(event) => setEmailForm((current) => ({ ...current, sender_name: event.target.value }))} maxLength={80} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Shown as the “From” name; the address stays the verified SendGrid sender.</span>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Reply-to address
                  <input type="email" value={emailForm.reply_to} onChange={(event) => setEmailForm((current) => ({ ...current, reply_to: event.target.value }))} maxLength={254} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" placeholder="tourism@daet.gov.ph" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Optional. Where replies to system emails go.</span>
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  Footer text
                  <textarea value={emailForm.footer_text} onChange={(event) => setEmailForm((current) => ({ ...current, footer_text: event.target.value }))} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" placeholder="Daet Municipal Tourism Office · Daet, Camarines Norte" />
                </label>
              </div>
              <fieldset className="mt-4 space-y-2">
                <legend className="text-sm font-medium text-slate-700">Optional emails</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={emailForm.security_emails_enabled} onChange={(event) => setEmailForm((current) => ({ ...current, security_emails_enabled: event.target.checked }))} />
                  Password changed / reset notices
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={emailForm.event_reminder_emails_enabled} onChange={(event) => setEmailForm((current) => ({ ...current, event_reminder_emails_enabled: event.target.checked }))} />
                  Event reminder emails sent by staff
                </label>
                <p className="text-xs text-slate-500">Account deletion notices are always sent. Password-recovery links are sent by Supabase Auth and configured there.</p>
              </fieldset>
              <button type="button" onClick={() => void saveEmailSettings()} disabled={savingEmail || Boolean(settingsError)} className="mt-4 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingEmail ? 'Saving…' : 'Save email settings'}
              </button>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
