'use client';

import { useEffect, useState } from 'react';
import SettingsShell from '../_components/SettingsShell';

const MAINTENANCE_API = '/info/api/admin/settings/maintenance';
const DEFAULT_MESSAGE = 'We are currently performing scheduled maintenance. Please check back soon.';

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

export default function AdminSettingsMaintenance() {
  const [settings, setSettings] = useState({ enabled: false, message: DEFAULT_MESSAGE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const response = await fetch(MAINTENANCE_API, { cache: 'no-store' });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Unable to load maintenance settings (${response.status}).`);
        }
        if (active) {
          setSettings({
            enabled: data.settings.enabled,
            message: data.settings.message,
          });
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load maintenance settings.');
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
      title="Maintenance Mode"
      subtitle="Persist and enforce public-site maintenance mode across the application."
    >
      {(showToast) => {
        const saveSettings = async (nextSettings = settings) => {
          setSaving(true);
          try {
            const response = await fetch(MAINTENANCE_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(nextSettings),
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) {
              throw new Error(data.message || `Unable to save maintenance settings (${response.status}).`);
            }
            setSettings(data.settings);
            setLoadError('');
            showToast(data.settings.enabled ? 'Maintenance mode is enabled for public visitors.' : 'Maintenance mode is disabled.');
          } catch (error) {
            showToast(error.message || 'Unable to save maintenance settings.', true);
          } finally {
            setSaving(false);
          }
        };

        const toggleMaintenanceMode = () => {
          saveSettings({ ...settings, enabled: !settings.enabled });
        };

        return (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Maintenance Mode</h2>
              {loadError && (
                <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {loadError}
                </p>
              )}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-slate-50 p-5">
                <div>
                  <p className="font-semibold text-slate-800">
                    {loading
                      ? 'Checking site status…'
                      : loadError
                        ? 'Unable to load site status'
                        : `Public site is ${settings.enabled ? 'in maintenance' : 'online'}`}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Public pages and non-admin APIs are blocked while maintenance is enabled. Signed-in administrators retain access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleMaintenanceMode}
                  disabled={loading || saving || Boolean(loadError)}
                  className={`rounded-full px-6 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 ${settings.enabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {saving ? 'Saving…' : settings.enabled ? 'Disable maintenance mode' : 'Enable maintenance mode'}
                </button>
              </div>

              <div className="max-w-2xl space-y-3">
                <label htmlFor="maintenance-message" className="block text-sm font-medium text-gray-700">
                  Message shown to visitors
                </label>
                <textarea
                  id="maintenance-message"
                  value={settings.message}
                  maxLength={500}
                  onChange={(event) => setSettings((current) => ({ ...current, message: event.target.value }))}
                  rows={3}
                  disabled={loading || saving || Boolean(loadError)}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 disabled:bg-slate-100"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">{settings.message.length}/500 characters</span>
                  <button
                    type="button"
                    onClick={() => saveSettings(settings)}
                    disabled={loading || saving || Boolean(loadError)}
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save message'}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-slate-800">Backup scheduling</h2>
              <p className="text-sm text-slate-600">
                Automated backup schedules, cloud locations, media inclusion, and retention are not configured by this page. Use the on-demand database snapshot tool; it does not create scheduled backups.
              </p>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
