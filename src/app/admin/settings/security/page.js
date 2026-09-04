// app/admin/settings/security/page.js — Security Settings
'use client';

import { useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import useStoredSetting from '../_components/useStoredSetting';

export default function AdminSettingsSecurity() {
  const [securitySettings, setSecuritySettings] = useStoredSetting('admin_security_settings', {
    two_factor_auth: true,
    password_min_length: 8,
    max_login_attempts: 5,
    lockout_duration: 15,
    session_timeout: 30,
    password_reuse_limit: 5,
    require_admin_approval: true
  });
  const [saving, setSaving] = useState(false);

  return (
    <SettingsShell
      title="Security Settings"
      subtitle="Password policy, session management, and authentication"
    >
      {(showToast) => {
        const saveSecuritySettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_security_settings', JSON.stringify(securitySettings));
            showToast('Security settings saved successfully!');
          } catch (err) {
            console.error('Error saving security settings:', err);
            showToast('Failed to save security settings', true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
{/* Security Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Password & Authentication</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Password Length</label>
                  <input type="number" value={securitySettings.password_min_length} onChange={e => setSecuritySettings(p => ({ ...p, password_min_length: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Login Attempts</label>
                  <input type="number" value={securitySettings.max_login_attempts} onChange={e => setSecuritySettings(p => ({ ...p, max_login_attempts: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lockout Duration (minutes)</label>
                  <input type="number" value={securitySettings.lockout_duration} onChange={e => setSecuritySettings(p => ({ ...p, lockout_duration: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password Reuse Limit</label>
                  <input type="number" value={securitySettings.password_reuse_limit} onChange={e => setSecuritySettings(p => ({ ...p, password_reuse_limit: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Session & Access</h3>
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
                  <input type="number" value={securitySettings.session_timeout} onChange={e => setSecuritySettings(p => ({ ...p, session_timeout: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={securitySettings.two_factor_auth} onChange={e => setSecuritySettings(p => ({ ...p, two_factor_auth: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Require two-factor authentication for admins</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={securitySettings.require_admin_approval} onChange={e => setSecuritySettings(p => ({ ...p, require_admin_approval: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Require admin approval for new user registrations</span>
                </label>
              </div>
              <button onClick={saveSecuritySettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Security Settings'}
              </button>
            </div>
          </div>
        );
      }}
    </SettingsShell>
  );
}
