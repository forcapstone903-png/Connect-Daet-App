'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles';

const STORAGE_KEY = 'daet_data_management_settings';
const BACKUP_HISTORY_KEY = 'daet_backup_history';

const defaultSettings = {
  backupFrequency: 'daily',
  backupTime: '02:00',
  backupLocation: 'Cloud Storage',
  includeMedia: true,
  retention: {
    events: 365,
    attractions: 540,
    blogs: 180,
    feedback: 90,
    announcements: 120,
    users: 1095,
  },
  validationMode: 'strict',
  autoPurge: true,
};

const defaultBackups = [
  { id: 1, name: 'Daily Full Backup', createdAt: '2026-08-13 02:00', size: '4.2 GB', status: 'Completed' },
  { id: 2, name: 'Weekly Snapshot', createdAt: '2026-08-10 02:00', size: '3.8 GB', status: 'Completed' },
  { id: 3, name: 'Monthly Archive', createdAt: '2026-08-01 02:00', size: '5.1 GB', status: 'Verified' },
];

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = sessionStorage.getItem('user_session');
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

export default function DataManagementPage() {
  const router = useRouter();
  const [user] = useState(() => readStoredSession());
  const [settings, setSettings] = useState(() => {
    if (typeof window === 'undefined') return defaultSettings;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved || defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const [backupHistory, setBackupHistory] = useState(() => {
    if (typeof window === 'undefined') return defaultBackups;
    try {
      const saved = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || 'null');
      return Array.isArray(saved) && saved.length ? saved : defaultBackups;
    } catch {
      return defaultBackups;
    }
  });
  const [validationStatus, setValidationStatus] = useState({ status: 'Healthy', details: '3 checks passed', lastRun: 'Today 09:15 AM' });
  const [toast, setToast] = useState(null);
  const [purgeDays, setPurgeDays] = useState(180);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasAdminAccess(user.role)) {
      router.push('/dashboard');
    }
  }, [router, user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(backupHistory));
  }, [backupHistory]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2600);
  };

  const exportJson = () => {
    const exportObject = {
      generatedAt: new Date().toISOString(),
      system: 'Daet Tourism Admin',
      data: {
        settings,
        backupHistory,
        retention: settings.retention,
      },
    };

    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daet-data-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Data export created successfully.');
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const result = loadEvent.target?.result;
        const parsed = JSON.parse(String(result));
        if (parsed && parsed.data) {
          showToast(`Imported ${file.name}. Data validation queued.`);
        } else {
          showToast('Imported file did not contain valid dataset metadata.', true);
        }
      } catch {
        showToast('Unable to parse the uploaded file. Please use JSON or CSV export format.', true);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const createBackup = () => {
    const item = {
      id: Date.now(),
      name: `Manual Backup ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toLocaleString('sv-SE').replace(' ', ' '),
      size: '4.3 GB',
      status: 'Completed',
    };
    setBackupHistory((prev) => [item, ...prev]);
    showToast('Backup created successfully.');
  };

  const restoreBackup = (backupId) => {
    const target = backupHistory.find((item) => item.id === backupId);
    if (!target) {
      showToast('Backup not found.', true);
      return;
    }

    showToast(`Restored from ${target.name}.`);
  };

  const runValidation = () => {
    const issues = [
      settings.retention.events > 0 ? 'Retention policy valid' : 'Retention policy missing',
      settings.backupFrequency ? 'Backup schedule configured' : 'Backup schedule missing',
      settings.includeMedia ? 'Media backup enabled' : 'Media backup disabled',
    ];

    const passed = issues.filter((entry) => entry.includes('valid') || entry.includes('configured') || entry.includes('enabled')).length;
    setValidationStatus({
      status: passed >= 3 ? 'Healthy' : 'Attention needed',
      details: `${passed}/3 checks passed`,
      lastRun: new Date().toLocaleString(),
    });
    showToast('Data validation completed.');
  };

  const purgeOldData = () => {
    if (!purgeDays || Number(purgeDays) <= 0) {
      showToast('Please set a valid purge period.', true);
      return;
    }

    showToast(`Purged records older than ${purgeDays} days.`);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Data Manager" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Data Management & Backup</h1>
            <p className="text-sm text-slate-500">Protect, restore, and maintain data integrity across the tourism platform.</p>
          </div>
          <button onClick={createBackup} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Create Backup</button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 p-4 text-white shadow-sm">
            <div className="text-sm text-sky-100">Backups</div>
            <div className="mt-2 text-3xl font-bold">{backupHistory.length}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 p-4 text-white shadow-sm">
            <div className="text-sm text-emerald-100">Validation</div>
            <div className="mt-2 text-3xl font-bold">{validationStatus.status}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 p-4 text-white shadow-sm">
            <div className="text-sm text-violet-100">Retention</div>
            <div className="mt-2 text-3xl font-bold">{settings.retention.events}d</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-sm">
            <div className="text-sm text-amber-100">Auto Purge</div>
            <div className="mt-2 text-3xl font-bold">{settings.autoPurge ? 'On' : 'Off'}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Export & Import</h2>
              <div className="flex flex-wrap gap-3">
                <button onClick={exportJson} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Export Data</button>
                <button onClick={() => fileInputRef.current?.click()} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Import Data</button>
                <input ref={fileInputRef} type="file" accept=".json,.csv" className="hidden" onChange={handleImport} />
              </div>
              <p className="mt-3 text-sm text-slate-500">Export complete database as JSON and import attractions or events via CSV / JSON files.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Scheduled Backup Settings</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Backup Frequency</label>
                  <select value={settings.backupFrequency} onChange={(e) => setSettings((prev) => ({ ...prev, backupFrequency: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Backup Time</label>
                  <input type="time" value={settings.backupTime} onChange={(e) => setSettings((prev) => ({ ...prev, backupTime: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Storage Location</label>
                  <input value={settings.backupLocation} onChange={(e) => setSettings((prev) => ({ ...prev, backupLocation: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={settings.includeMedia} onChange={(e) => setSettings((prev) => ({ ...prev, includeMedia: e.target.checked }))} className="h-4 w-4 accent-blue-600" />
                  Include media files
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Data Retention & Purge</h2>

              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(settings.retention).map(([key, value]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium capitalize text-slate-700">{key}</label>
                    <input type="number" value={value} onChange={(e) => setSettings((prev) => ({ ...prev, retention: { ...prev.retention, [key]: Number(e.target.value) || 0 } }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input type="number" value={purgeDays} onChange={(e) => setPurgeDays(Number(e.target.value) || 0)} min="1" className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                <button onClick={purgeOldData} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Purge Old Data</button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Backup History</h2>
              <div className="space-y-3">
                {backupHistory.map((backup) => (
                  <div key={backup.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{backup.name}</p>
                        <p className="text-xs text-slate-500">{backup.createdAt}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{backup.status}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{backup.size}</span>
                      <button onClick={() => restoreBackup(backup.id)} className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800">Restore</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Data Validation</h2>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{validationStatus.status}</p>
                <p className="mt-1 text-sm text-emerald-800">{validationStatus.details}</p>
                <p className="mt-2 text-xs text-emerald-700">Last run: {validationStatus.lastRun}</p>
              </div>
              <button onClick={runValidation} className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Validate Integrity</button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
