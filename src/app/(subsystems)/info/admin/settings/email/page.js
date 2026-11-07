'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';

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
      title="Email & Notifications"
      subtitle="Check server-side email delivery and send a real test message."
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
              <h2 className="text-lg font-bold text-slate-800">Notification preferences</h2>
              <p className="mt-2 text-sm text-slate-600">
                Per-admin email alerts and weekly summaries are not implemented. Their previous browser-only toggles did not change notification delivery and have been removed.
              </p>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
