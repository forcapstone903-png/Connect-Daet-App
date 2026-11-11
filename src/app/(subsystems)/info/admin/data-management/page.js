'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminButton, AdminPageHeader, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import { hasAdminAccess } from '@/lib/adminRoles';
import { getStoredSession } from '@/lib/authCookies';

const BACKUP_API = '/info/api/admin/data-management/backup';
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = getStoredSession();
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

export default function DataManagementPage() {
  const router = useRouter();
  const [user] = useState(() => readStoredSession());
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationStatus, setValidationStatus] = useState({
    status: 'Not checked',
    details: 'Check that backup tables are available before creating or restoring a snapshot.',
    lastRun: null,
  });
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) {
      router.push('/info/login');
      return;
    }

    if (!hasAdminAccess(user.role)) router.push('/info/admin/dashboard');
  }, [router, user]);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 5000);
  };

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const response = await fetch(BACKUP_API, { cache: 'no-store' });
      if (!response.ok) {
        const data = await readJsonResponse(response);
        throw new Error(data.message || `Backup failed (${response.status}).`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1]
        || `connect-daet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Database snapshot downloaded. Store the file securely.');
    } catch (error) {
      showToast(error.message || 'Unable to create a database snapshot.', true);
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreBusy(true);
    try {
      if (file.size > MAX_BACKUP_SIZE) {
        throw new Error('Backup files must be 50 MB or smaller.');
      }

      const response = await fetch(BACKUP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text(),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        const partialResult = data.partialRestore
          ? ` Partial progress: ${data.restoredRows} rows across ${data.restoredTables} tables were merged before the error. Retrying the same snapshot is safe.`
          : '';
        throw new Error(`${data.message || `Restore failed (${response.status}).`}${partialResult}`);
      }

      showToast(`Merged ${data.restoredRows} rows across ${data.restoredTables} tables from ${file.name}.`);
      setValidationStatus({
        status: 'Restore complete',
        details: `${data.restoredRows} rows merged across ${data.restoredTables} tables. Existing records were not deleted.`,
        lastRun: new Date().toLocaleString(),
      });
    } catch (error) {
      showToast(error.message || 'Unable to restore this backup.', true);
    } finally {
      setRestoreBusy(false);
      event.target.value = '';
    }
  };

  const validateBackupTables = async () => {
    setValidationBusy(true);
    try {
      const response = await fetch(`${BACKUP_API}?validate=1`, { cache: 'no-store' });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        const failures = data.failedTables?.length ? ` Unavailable: ${data.failedTables.join(', ')}.` : '';
        throw new Error(`${data.message || `Validation failed (${response.status}).`}${failures}`);
      }

      setValidationStatus({
        status: 'Available',
        details: `${data.tablesChecked} backup tables are accessible. This check does not inspect row-level data integrity.`,
        lastRun: new Date().toLocaleString(),
      });
      showToast('Backup table availability check completed.');
    } catch (error) {
      setValidationStatus({
        status: 'Check failed',
        details: error.message || 'Unable to check backup table availability.',
        lastRun: new Date().toLocaleString(),
      });
      showToast(error.message || 'Unable to check backup table availability.', true);
    } finally {
      setValidationBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Data Manager" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Data"
          title="Data management & backup"
          description="Create downloadable application-data snapshots and merge a verified snapshot into the database."
          icon="save"
          actions={
            <AdminButton variant="primary" icon="plus" onClick={downloadBackup} disabled={backupBusy}>
              {backupBusy ? 'Creating snapshot…' : 'Create backup'}
            </AdminButton>
          }
        />

        <AdminStatGrid>
          <AdminStatCard label="Backup type" value="On demand" icon="save" tone="brand" meta="Downloaded as JSON" />
          <AdminStatCard label="Backup scope" value="Application data" icon="data" tone="info" meta="Passwords and push credentials excluded" />
          <AdminStatCard label="Restore mode" value="Merge only" icon="check" tone="success" meta="Never deletes existing rows" />
          <AdminStatCard label="Automated backups" value="Not configured" icon="calendar" tone="warning" meta="No schedule or cloud archive" />
        </AdminStatGrid>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section id="backup" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-slate-800">Export and restore</h2>
              <p className="mb-4 text-sm text-slate-600">
                Export creates a snapshot from the current database. Restore accepts only this application&apos;s versioned JSON snapshot and inserts or updates matching records; it does not delete records absent from the file.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={downloadBackup}
                  disabled={backupBusy}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {backupBusy ? 'Creating snapshot…' : 'Export database snapshot'}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoreBusy}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restoreBusy ? 'Merging data…' : 'Restore from JSON'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Select a Connect Daet database snapshot"
                  onChange={restoreBackup}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Includes application tables, including user and community data. Password hashes, password-reset records, push-subscription credentials, page-view telemetry, and server-side maintenance settings are excluded. Media files are not included.
              </p>
              <p className="mt-2 text-xs font-medium text-amber-800">
                Snapshots may contain personal and private application data. Downloads are not encrypted by the application: store them only in encrypted, access-restricted storage and remove unsecured copies. Existing user passwords are preserved on restore; users newly added from a snapshot must reset their password before signing in.
              </p>
            </section>

            <section id="retention" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-slate-800">Backup behavior</h2>
              <p className="text-sm text-slate-600">
                Backups run only when an administrator downloads a snapshot. Scheduled backups, remote archival, media-file backups, automatic retention, and transactional restore are not available. Restore merges rows in batches, so a failure can leave a partial merge; retrying the same snapshot is safe for already-merged IDs. No existing records are removed by backup or restore.
              </p>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Backup table availability</h2>
              <div className={`rounded-xl border p-4 ${validationStatus.status === 'Check failed' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`} aria-live="polite">
                <p className={`text-sm font-semibold ${validationStatus.status === 'Check failed' ? 'text-red-700' : 'text-slate-700'}`}>
                  {validationStatus.status}
                </p>
                <p className="mt-1 text-sm text-slate-600">{validationStatus.details}</p>
                {validationStatus.lastRun && <p className="mt-2 text-xs text-slate-500">Last checked: {validationStatus.lastRun}</p>}
              </div>
              <button
                type="button"
                onClick={validateBackupTables}
                disabled={validationBusy}
                className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {validationBusy ? 'Checking tables…' : 'Check backup tables'}
              </button>
            </section>
          </div>
        </div>
      </div>

      {toast && (
        <div
          role={toast.isError ? 'alert' : 'status'}
          className={`fixed bottom-5 right-5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-emerald-600'}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
