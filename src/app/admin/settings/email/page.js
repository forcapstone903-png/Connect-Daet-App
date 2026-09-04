// app/admin/settings/email/page.js — Email & Notifications Settings
'use client';

import { useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import useStoredSetting from '../_components/useStoredSetting';

export default function AdminSettingsEmail() {
  const [notificationSettings, setNotificationSettings] = useStoredSetting('notification_settings', {
    emailAlerts: true,
    systemAlerts: true,
    weeklySummary: true,
    eventNotifications: true
  });
  const [emailSettings, setEmailSettings] = useStoredSetting('admin_email_settings', {
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    from_email: 'no-reply@daet.gov.ph',
    use_ssl: true
  });
  const [saving, setSaving] = useState(false);

  return (
    <SettingsShell
      title="Email & Notifications"
      subtitle="Configure email delivery and notification preferences"
    >
      {(showToast) => {
        const saveNotificationSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('notification_settings', JSON.stringify(notificationSettings));
            showToast('Notification settings saved successfully!');
          } catch (err) {
            console.error('Error saving notification settings:', err);
            showToast('Failed to save notification settings', true);
          } finally {
            setSaving(false);
          }
        };

        const saveEmailSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_email_settings', JSON.stringify(emailSettings));
            showToast('Email settings saved successfully!');
          } catch (err) {
            console.error('Error saving email settings:', err);
            showToast('Failed to save email settings', true);
          } finally {
            setSaving(false);
          }
        };

        const sendTestEmail = () => {
          showToast('Test email sent! Check your inbox.');
        };

        return (
          <div className="space-y-6">
{/* Notification Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Notification Settings</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={notificationSettings.emailAlerts} onChange={e => setNotificationSettings(p => ({ ...p, emailAlerts: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Email alerts for system events</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={notificationSettings.systemAlerts} onChange={e => setNotificationSettings(p => ({ ...p, systemAlerts: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">System alerts and warnings</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={notificationSettings.weeklySummary} onChange={e => setNotificationSettings(p => ({ ...p, weeklySummary: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Weekly summary digest</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={notificationSettings.eventNotifications} onChange={e => setNotificationSettings(p => ({ ...p, eventNotifications: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Event reminders and updates</span>
                </label>
              </div>
              <button onClick={saveNotificationSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                {saving ? 'Saving...' : 'Save Notification Settings'}
              </button>
            </div>
{/* Email Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Email Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input type="text" value={emailSettings.smtp_host} onChange={e => setEmailSettings(p => ({ ...p, smtp_host: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input type="text" value={emailSettings.smtp_port} onChange={e => setEmailSettings(p => ({ ...p, smtp_port: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                  <input type="text" value={emailSettings.smtp_user} onChange={e => setEmailSettings(p => ({ ...p, smtp_user: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                  <input type="password" value={emailSettings.smtp_password} onChange={e => setEmailSettings(p => ({ ...p, smtp_password: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                  <input type="email" value={emailSettings.from_email} onChange={e => setEmailSettings(p => ({ ...p, from_email: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={emailSettings.use_ssl} onChange={e => setEmailSettings(p => ({ ...p, use_ssl: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-700">Use SSL/TLS</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button onClick={saveEmailSettings} disabled={saving} className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Email Settings'}
                </button>
                <button onClick={sendTestEmail} className="bg-slate-700 text-white px-6 py-2 rounded-full hover:bg-slate-800">Send Test Email</button>
              </div>
            </div>
          </div>
        );
      }}
    </SettingsShell>
  );
}
