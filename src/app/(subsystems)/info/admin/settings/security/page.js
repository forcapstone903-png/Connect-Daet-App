'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SettingsShell from '../_components/SettingsShell';
import { DEFAULT_SECURITY_SETTINGS, passwordPolicyFromSecurity } from '@/lib/siteSettings.mjs';
import { describePasswordPolicy } from '@/lib/passwordPolicy';

const SETTINGS_API = '/info/api/admin/settings';

function NumberField({ label, value, onChange, min, max, suffix, hint }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-28 rounded-xl border border-slate-200 px-3 py-2" />
        <span className="text-sm font-normal text-slate-500">{suffix}</span>
      </span>
      {hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

export default function AdminSettingsSecurity() {
  const [form, setForm] = useState(DEFAULT_SECURITY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(SETTINGS_API, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load settings.');
        if (active) setForm({ ...DEFAULT_SECURITY_SETTINGS, ...data.settings?.security });
      })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <SettingsShell title="Security Policy" subtitle="Password rules, session lifetime and sign-in lockout for every account.">
      {(showToast) => {
        const save = async () => {
          setSaving(true);
          try {
            const response = await fetch(SETTINGS_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'security', value: form }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save.');
            setForm({ ...DEFAULT_SECURITY_SETTINGS, ...data.setting?.value });
            showToast('Security policy saved. Password and lockout rules apply now; session lengths apply at each user’s next sign-in.');
          } catch (error) {
            showToast(error.message || 'Unable to save the security policy.', true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
            {loadError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p> : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Password policy</h2>
              <p className="mt-1 text-sm text-slate-600">Checked whenever a password is set: registration, password change, reset and admin-created accounts. Existing passwords are not affected until they are changed.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <NumberField label="Minimum length" value={form.password_min_length} onChange={set('password_min_length')} min={8} max={64} suffix="characters" hint="8 to 64" />
                <div className="space-y-2 pt-1">
                  <Toggle label="Require a lowercase letter" checked={form.password_require_lowercase} onChange={set('password_require_lowercase')} />
                  <Toggle label="Require an uppercase letter" checked={form.password_require_uppercase} onChange={set('password_require_uppercase')} />
                  <Toggle label="Require a number" checked={form.password_require_number} onChange={set('password_require_number')} />
                  <Toggle label="Require a special character" checked={form.password_require_symbol} onChange={set('password_require_symbol')} />
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Users will see: {describePasswordPolicy(passwordPolicyFromSecurity(form))}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Sessions</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <NumberField label="Session length" value={form.session_hours} onChange={set('session_hours')} min={1} max={168} suffix="hours" hint="1 to 168" />
                <NumberField label="With “Remember me”" value={form.remember_days} onChange={set('remember_days')} min={1} max={90} suffix="days" hint="1 to 90" />
                <NumberField label="Idle sign-out" value={form.idle_timeout_minutes} onChange={set('idle_timeout_minutes')} min={0} max={1440} suffix="minutes" hint="0 turns it off; otherwise 5 to 1440. Opening pages or saving counts as activity." />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Failed sign-in lockout</h2>
              <p className="mt-1 text-sm text-slate-600">Attempts are counted per email address (stored as a keyed hash). <Link href="/info/admin/settings/login-security" className="font-semibold text-blue-600 hover:underline">View failed sign-ins</Link></p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <NumberField label="Lock after" value={form.lockout_max_attempts} onChange={set('lockout_max_attempts')} min={3} max={20} suffix="failed attempts" hint="3 to 20" />
                <NumberField label="Counted within" value={form.lockout_window_minutes} onChange={set('lockout_window_minutes')} min={5} max={120} suffix="minutes" hint="5 to 120" />
                <NumberField label="Lock for" value={form.lockout_duration_minutes} onChange={set('lockout_duration_minutes')} min={5} max={1440} suffix="minutes" hint="5 to 1440" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-lg font-bold text-slate-800">Always on</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Passwords are hashed by Supabase Auth and never stored by the application.</li>
                <li>Sessions use a signed, HTTP-only cookie; role, password and permission changes sign the user out everywhere.</li>
                <li>Every administrator API checks the signed session and the caller’s permissions on the server.</li>
                <li>Password history and two-factor authentication are not enforced.</li>
              </ul>
            </section>

            <button type="button" onClick={() => void save()} disabled={loading || saving || Boolean(loadError)} className="rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save security policy'}
            </button>
          </div>
        );
      }}
    </SettingsShell>
  );
}
