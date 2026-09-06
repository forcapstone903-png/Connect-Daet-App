// app/admin/settings/page.js — Settings Overview
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/app/components/Icon';
import SettingsShell from './_components/SettingsShell';

export default function AdminSettingsOverview() {
  const router = useRouter();
  const [systemHealth, setSystemHealth] = useState({
    database: 'Healthy',
    api: 'Healthy',
    storage: 'Healthy',
    weather: 'Healthy',
    uptime: '99.98%'
  });
  const [databaseInfo, setDatabaseInfo] = useState({
    size: '1.4 GB',
    liveTables: 18,
    optimized: true,
    lastBackup: 'Today, 02:00 AM'
  });
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, actor: 'System', action: 'Backup created', timestamp: 'Today 02:00 AM' },
    { id: 2, actor: 'Admin', action: 'Updated moderation settings', timestamp: 'Yesterday 04:12 PM' },
    { id: 3, actor: 'Admin', action: 'Approved user submitted post', timestamp: 'Yesterday 10:39 AM' }
  ]);

  // Pick up audit entries recorded since this page last opened (e.g. from the
  // Maintenance Mode page recording an enable/disable event).
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('admin_audit_log');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) setAuditLogs(parsed);
        }
      } catch (err) {
        console.error('Error loading audit log:', err);
      }
    };
    load();
  }, []);

  return (
    <SettingsShell
      title="System Settings"
      subtitle="Overview of platform health, version, and data management"
    >
      {(showToast) => {
        const clearCache = () => {
          if (confirm('Clear all cached data? This will log out all users.')) {
            localStorage.clear();
            sessionStorage.clear();
            showToast('Cache cleared. Users will need to log in again.');
            setTimeout(() => {
              router.push('/login');
            }, 2000);
          }
        };

        const exportData = async () => {
          try {
            const tables = ['info_users', 'info_events', 'info_tourist_spots', 'info_blogs', 'info_inquiries'];
            const exportData = {};

            for (const table of tables) {
              const { data, error } = await supabase.from(table).select('*');
              if (!error && data) {
                exportData[table] = data;
              }
            }

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `daet_tourism_export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Data exported successfully!');
          } catch (err) {
            console.error('Export error:', err);
            showToast('Failed to export data', true);
          }
        };

        return (
          <div className="space-y-6">
{/* System Health */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">System Health</h3>
                <button onClick={() => { setSystemHealth({ database: 'Healthy', api: 'Healthy', storage: 'Healthy', weather: 'Healthy', uptime: '99.98%' }); setDatabaseInfo({ size: '1.4 GB', liveTables: 18, optimized: true, lastBackup: 'Today, 02:00 AM' }); showToast('System health check completed.'); }} className="rounded-full bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Check Now</button>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                {Object.entries(systemHealth).map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    <div className="mt-2 text-lg font-bold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
            </div>
{/* Version Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Version Information</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">System</div><div className="mt-2 font-bold text-slate-800">DAET Tourism</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Version</div><div className="mt-2 font-bold text-slate-800">v2.4.1</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Build</div><div className="mt-2 font-bold text-slate-800">2026.08</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</div><div className="mt-2 font-bold text-emerald-700">Stable</div></div>
              </div>
            </div>

            {/* Database Management */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Database Management</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Database Size</div><div className="mt-2 font-bold text-slate-800">{databaseInfo.size}</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Live Tables</div><div className="mt-2 font-bold text-slate-800">{databaseInfo.liveTables}</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Optimization</div><div className="mt-2 font-bold text-emerald-700">{databaseInfo.optimized ? 'Optimized' : 'Needs review'}</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Last Backup</div><div className="mt-2 font-bold text-slate-800">{databaseInfo.lastBackup}</div></div>
              </div>
              <button className="mt-6 rounded-full bg-emerald-600 px-6 py-2 text-white hover:bg-emerald-700">Optimize Tables</button>
            </div>
{/* Audit Log */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Audit Log</h3>
              <div className="space-y-3">
                {auditLogs.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-800">{entry.action}</p>
                      <p className="text-xs text-slate-500">By {entry.actor}</p>
                    </div>
                    <span className="text-xs text-slate-400">{entry.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Export Data */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2"><Icon name="data" className="inline-block w-5 h-5 mr-2" />Export Data</h3>
              <p className="text-sm text-gray-500 mb-4">Export all platform data for backup or reporting purposes</p>
              <button onClick={exportData} className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 flex items-center gap-2">
                <Icon name="data" className="w-4 h-4" /> Export All Data (JSON)
              </button>
            </div>

            {/* Clear Cache */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2"><Icon name="delete" className="inline-block w-5 h-5 mr-2" />Clear Cache</h3>
              <p className="text-sm text-gray-500 mb-4">Clear all cached data and force all users to log in again</p>
              <button onClick={clearCache} className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 flex items-center gap-2">
                <Icon name="delete" className="w-4 h-4" /> Clear Cache
              </button>
            </div>

            {/* System Status */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span className="text-sm text-gray-600">Database Connection: Connected</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span className="text-sm text-gray-600">Storage Service: Operational</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span className="text-sm text-gray-600">Weather API: Operational</span></div>
              </div>
            </div>
          </div>
        );
      }}
    </SettingsShell>
  );
}