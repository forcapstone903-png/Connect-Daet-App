'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';

const SETTINGS_API = '/info/api/admin/settings';
const DEFAULT_GENERAL = {
  site_name: 'DAET Tourism',
  contact_email: 'tourism@daet.gov.ph',
  timezone: 'Asia/Manila',
  language: 'English',
  date_format: 'MM/DD/YYYY',
};
const DEFAULT_MODERATION = {
  auto_moderation_enabled: false,
  review_window_hours: 24,
  hide_threshold_reports: 3,
};

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

export default function AdminSettingsGeneral() {
  const [generalSettings, setGeneralSettings] = useState(DEFAULT_GENERAL);
  const [moderationSettings, setModerationSettings] = useState(DEFAULT_MODERATION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const response = await fetch(SETTINGS_API, { cache: 'no-store' });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Unable to load settings (${response.status}).`);
        }
        if (active) {
          setGeneralSettings({ ...DEFAULT_GENERAL, ...data.settings?.general });
          setModerationSettings({ ...DEFAULT_MODERATION, ...data.settings?.moderation });
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load saved settings.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsShell
      title="General Settings"
      subtitle="Edit shared site information and saved moderation policy preferences."
    >
      {(showToast) => {
        const saveSetting = async (id, value, label) => {
          setSaving(true);
          try {
            const response = await fetch(SETTINGS_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, value }),
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) {
              throw new Error(data.message || `Unable to save ${label.toLowerCase()} (${response.status}).`);
            }
            showToast(`${label} saved to the shared administrator settings.`);
          } catch (error) {
            showToast(error.message || `Unable to save ${label.toLowerCase()}.`, true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
            {loadError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                {loadError} Changes cannot be saved until the settings store is available.
              </p>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Shared site information</h2>
              <p className="mt-1 text-sm text-slate-600">These values are stored on the server for administrators; they do not automatically change provider or deployment configuration.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Site name
                  <input value={generalSettings.site_name} onChange={(event) => setGeneralSettings((current) => ({ ...current, site_name: event.target.value }))} maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Contact email
                  <input type="email" value={generalSettings.contact_email} onChange={(event) => setGeneralSettings((current) => ({ ...current, contact_email: event.target.value }))} maxLength={254} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Timezone
                  <select value={generalSettings.timezone} onChange={(event) => setGeneralSettings((current) => ({ ...current, timezone: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2">
                    <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Language
                  <select value={generalSettings.language} onChange={(event) => setGeneralSettings((current) => ({ ...current, language: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2">
                    <option value="English">English</option>
                    <option value="Filipino">Filipino</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Date format
                  <select value={generalSettings.date_format} onChange={(event) => setGeneralSettings((current) => ({ ...current, date_format: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2">
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </label>
              </div>
              <button type="button" onClick={() => saveSetting('general', generalSettings, 'General settings')} disabled={loading || saving || Boolean(loadError)} className="mt-5 rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save general settings'}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Moderation preferences</h2>
              <p className="mt-1 text-sm text-amber-800">
                These preferences are persisted for administrator reference only. They do not enable automated keyword moderation, scheduled review, or automatic hiding. Blog and event approval workflows remain enforced separately.
              </p>
              <div className="mt-4 max-w-2xl space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={moderationSettings.auto_moderation_enabled} onChange={(event) => setModerationSettings((current) => ({ ...current, auto_moderation_enabled: event.target.checked }))} className="h-4 w-4 accent-blue-600" />
                  Record automated moderation as a preferred policy (not currently enforced)
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Preferred review window (hours)
                  <input type="number" min="1" max="720" value={moderationSettings.review_window_hours} onChange={(event) => setModerationSettings((current) => ({ ...current, review_window_hours: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Preferred report threshold
                  <input type="number" min="1" max="100" value={moderationSettings.hide_threshold_reports} onChange={(event) => setModerationSettings((current) => ({ ...current, hide_threshold_reports: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2" />
                </label>
              </div>
              <button type="button" onClick={() => saveSetting('moderation', moderationSettings, 'Moderation preferences')} disabled={loading || saving || Boolean(loadError)} className="mt-5 rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save moderation preferences'}
              </button>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
