'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SettingsShell from '../settings/_components/SettingsShell';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/siteSettings.mjs';

const SETTINGS_API = '/info/api/admin/settings';

const SWITCHES = [
  {
    key: 'alert_push_enabled',
    label: 'Browser push for real-time alerts',
    detail: 'When off, alerts still reach every subscriber’s in-app inbox, but no push notification is sent to phones or browsers.',
  },
  {
    key: 'general_push_enabled',
    label: 'Browser push for other notifications',
    detail: 'Replies, follows, approvals and similar notifications. In-app notifications are unaffected.',
  },
  {
    key: 'follower_notifications_enabled',
    label: 'Notify followers when staff publish content',
    detail: 'When off, publishing a place, event or blog no longer notifies the publisher’s followers. Announcement audiences are still notified.',
  },
];

export default function NotificationSettingsPage() {
  const [form, setForm] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(SETTINGS_API, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load notification settings.');
        if (active) setForm({ ...DEFAULT_NOTIFICATION_SETTINGS, ...data.settings?.notifications });
      })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <SettingsShell title="Notification Settings" subtitle="Site-wide delivery switches for push and in-app notifications.">
      {(showToast) => {
        const save = async () => {
          setSaving(true);
          try {
            const response = await fetch(SETTINGS_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'notifications', value: form }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save.');
            showToast('Notification settings saved. They apply to the next notification sent.');
          } catch (error) {
            showToast(error.message || 'Unable to save notification settings.', true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
            {loadError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p> : null}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Delivery</h2>
              <div className="mt-4 space-y-4">
                {SWITCHES.map((item) => (
                  <label key={item.key} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={form[item.key]}
                      onChange={(event) => setForm((current) => ({ ...current, [item.key]: event.target.checked }))}
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                      <span className="block text-sm text-slate-600">{item.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => void save()} disabled={loading || saving || Boolean(loadError)} className="mt-5 rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save notification settings'}
              </button>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              <p>Alert categories are managed under <Link href="/info/admin/settings/categories" className="font-semibold text-blue-600 hover:underline">Categories</Link>. Email senders and optional emails are under <Link href="/info/admin/settings/email" className="font-semibold text-blue-600 hover:underline">Email</Link>. Each user can still choose their own alert categories and notification types in their account settings.</p>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
