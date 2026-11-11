'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SettingsShell from './_components/SettingsShell';

const HEALTH_API = '/info/api/admin/system-health';
const BACKUP_API = '/info/api/admin/data-management/backup';

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

export default function AdminSettingsOverview() {
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [exporting, setExporting] = useState(false);

  const requestHealth = useCallback(async () => {
    const response = await fetch(HEALTH_API, { cache: 'no-store' });
    const data = await readJsonResponse(response);
    if (!response.ok || !data.success) {
      throw new Error(data.message || `Unable to check system health (${response.status}).`);
    }
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    const loadHealth = async () => {
      try {
        const data = await requestHealth();
        if (active) {
          setHealth(data);
          setHealthError('');
        }
      } catch (error) {
        if (active) {
          setHealthError(error.message || 'Unable to check system health.');
          setHealth(null);
        }
      } finally {
        if (active) setHealthLoading(false);
      }
    };
    loadHealth();
    return () => {
      active = false;
    };
  }, [requestHealth]);

  const refreshHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await requestHealth();
      setHealth(data);
      setHealthError('');
    } catch (error) {
      setHealthError(error.message || 'Unable to check system health.');
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <SettingsShell
      title="System Settings"
      subtitle="Current service connectivity, supported configuration, and data management."
    >
      {(showToast) => {
        const exportData = async () => {
          setExporting(true);
          try {
            const response = await fetch(BACKUP_API, { cache: 'no-store' });
            if (!response.ok) {
              const data = await readJsonResponse(response);
              throw new Error(data.message || `Export failed (${response.status}).`);
            }

            const blob = await response.blob();
            if (!blob.size) throw new Error('The server returned an empty snapshot; no export was downloaded.');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1]
              || `connect-daet-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('Database snapshot downloaded. Store it in encrypted, access-restricted storage.');
          } catch (error) {
            console.error('Admin settings export failed:', error);
            showToast(error.message || 'Failed to export database data.', true);
          } finally {
            setExporting(false);
          }
        };

        const statusTone = (status) => status === 'Available' || status === 'Configured'
          ? 'text-emerald-700'
          : status === 'Unavailable' || status === 'Not configured'
            ? 'text-amber-800'
            : 'text-slate-700';

        return (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Live service checks</h2>
                  <p className="mt-1 text-sm text-slate-600">Connectivity checks run against the database and storage service. Provider configuration is not a delivery test.</p>
                </div>
                <button type="button" onClick={refreshHealth} disabled={healthLoading} className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
                  {healthLoading ? 'Checking…' : 'Check now'}
                </button>
              </div>
              {healthError && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{healthError}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(health?.checks || {}).map(([key, check]) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className={`mt-2 font-bold ${statusTone(check.status)}`}>{check.status}</p>
                    <p className="mt-1 text-xs text-slate-600">{check.detail}</p>
                  </div>
                ))}
                {!health && healthLoading && <p className="text-sm text-slate-500">Running connectivity checks…</p>}
              </div>
              {health?.checkedAt && <p className="mt-3 text-xs text-slate-500">Checked {new Date(health.checkedAt).toLocaleString()}</p>}
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-lg font-bold text-amber-900">Provider-managed metrics</h2>
              <p className="mt-2 text-sm text-amber-900">
                Database size, uptime, live table count, optimization state, and last automated backup are not exposed by this application. They are unavailable here; view infrastructure metrics in the hosting and Supabase provider consoles.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Export database snapshot</h2>
              <p className="mt-2 text-sm text-slate-600">
                This uses the administrator-only versioned backup endpoint. Any failed table read stops the export instead of producing a partial snapshot.
              </p>
              <button type="button" onClick={exportData} disabled={exporting} className="mt-4 rounded-full bg-emerald-700 px-6 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {exporting ? 'Creating snapshot…' : 'Export database snapshot (JSON)'}
              </button>
              <p className="mt-3 text-xs text-amber-800">
                Snapshots may include private and personal records. The application does not encrypt downloaded files: store them only in encrypted, access-restricted storage, and remove unsecured copies.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800">Administrator activity</h2>
              <p className="mt-2 text-sm text-slate-600">View recorded activity in the database-backed activity log. This overview does not display fabricated audit entries.</p>
              <Link href="/info/admin/activity-logs" className="mt-4 inline-flex rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Open activity logs
              </Link>
            </section>
          </div>
        );
      }}
    </SettingsShell>
  );
}
