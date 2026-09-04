// app/admin/settings/maintenance/page.js — Maintenance Mode & Backup
'use client';

import { useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import useStoredSetting from '../_components/useStoredSetting';

export default function AdminSettingsMaintenance() {
  const [maintenanceMode, setMaintenanceMode] = useStoredSetting('admin_maintenance_mode', {
    enabled: false,
    message: 'We are currently performing scheduled maintenance. Please check back soon.',
    allow_admin_access: true
  });
  const [backupSettings, setBackupSettings] = useStoredSetting('admin_backup_settings', {
    auto_backup: true,
    schedule: 'daily',
    retention_days: 30,
    backup_location: 'Cloud Storage',
    include_media: true
  });
  const [saving, setSaving] = useState(false);

  return (
    <SettingsShell
      title="Maintenance Mode"
      subtitle="Temporarily take the site offline and manage backup settings"
    >
      {(showToast) => {
        const toggleMaintenanceMode = () => {
          const next = { ...maintenanceMode, enabled: !maintenanceMode.enabled };
          setMaintenanceMode(next);
          try {
            localStorage.setItem('admin_maintenance_mode', JSON.stringify(next));
            // Record an audit entry surfaced on the Overview page.
            const entry = { id: Date.now(), actor: 'Admin', action: next.enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled', timestamp: new Date().toLocaleString() };
            const existing = JSON.parse(localStorage.getItem('admin_audit_log') || '[]');
            existing.unshift(entry);
            localStorage.setItem('admin_audit_log', JSON.stringify(existing.slice(0, 20)));
          } catch (err) {
            console.error('Error saving maintenance mode:', err);
          }
          showToast(next.enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
        };

        const saveBackupSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_backup_settings', JSON.stringify(backupSettings));
            showToast('Backup settings saved successfully!');
          } catch (err) {
            console.error('Error saving backup settings:', err);
            showToast('Failed to save backup settings', true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
{/* Maintenance Mode */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Maintenance Mode</h3>
              <div className="mb-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-slate-50 p-5">
                <div>
                  <p className="font-semibold text-slate-800">Site currently {maintenanceMode.enabled ? 'in maintenance' : 'online'}</p>
                  <p className="text-sm text-slate-500 mt-1">{maintenanceMode.enabled ? 'Visitors see a maintenance message.' : 'Visitors can access the site normally.'}</p>
                </div>
                <button onClick={toggleMaintenanceMode} className={`px-6 py-2 rounded-full text-white ${maintenanceMode.enabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {maintenanceMode.enabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
                </button>
              </div>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Message</label>
                  <textarea value={maintenanceMode.message} onChange={e => setMaintenanceMode(p => ({ ...p, message: e.target.value }))} rows={3} className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2" />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={maintenanceMode.allow_admin_access} onChange={e => setMaintenanceMode(p => ({ ...p, allow_admin_access: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Allow admin access during maintenance</span>
                </label>
              </div>
            </div>
{/* Backup Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Backup Settings</h3>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="flex items-center gap-2 mb-4">
                    <input type="checkbox" checked={backupSettings.auto_backup} onChange={e => setBackupSettings(p => ({ ...p, auto_backup: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-700">Enable automated backups</span>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                  <select value={backupSettings.schedule} onChange={e => setBackupSettings(p => ({ ...p, schedule: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retention (days)</label>
                  <input type="number" value={backupSettings.retention_days} onChange={e => setBackupSettings(p => ({ ...p, retention_days: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Backup Location</label>
                  <select value={backupSettings.backup_location} onChange={e => setBackupSettings(p => ({ ...p, backup_location: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="Cloud Storage">Cloud Storage</option>
                    <option value="Local Drive">Local Drive</option>
                    <option value="Remote Server">Remote Server</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-4">
                    <input type="checkbox" checked={backupSettings.include_media} onChange={e => setBackupSettings(p => ({ ...p, include_media: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-700">Include media files in backup</span>
                  </label>
                </div>
                <button onClick={saveBackupSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Backup Settings'}
                </button>
              </div>
            </div>
          </div>
        );
      }}
    </SettingsShell>
  );
}
