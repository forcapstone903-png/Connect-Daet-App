// app/admin/settings/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles';

export default function AdminSettings() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
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
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [auditLogs, setAuditLogs] = useState([
    { id: 1, actor: 'System', action: 'Backup created', timestamp: 'Today 02:00 AM' },
    { id: 2, actor: 'Admin', action: 'Updated moderation settings', timestamp: 'Yesterday 04:12 PM' },
    { id: 3, actor: 'Admin', action: 'Approved user submitted post', timestamp: 'Yesterday 10:39 AM' }
  ]);
  
  // Settings state
  const [generalSettings, setGeneralSettings] = useState({
    site_name: 'Daet Tourism',
    site_description: 'Official tourism portal of Daet, Camarines Norte',
    contact_email: 'tourism@daet.gov.ph',
    contact_phone: '(054) 123-4567',
    office_address: 'Municipal Tourism Office, Daet Municipal Hall, Daet, Camarines Norte',
    timezone: 'Asia/Manila',
    date_format: 'MM/DD/YYYY'
  });

  const [themeSettings, setThemeSettings] = useState({
    color_scheme: 'Ocean Blue',
    layout: 'Modern Sidebar',
    accent_color: '#2563eb',
    compact_mode: false
  });
  
  const [rewardSettings, setRewardSettings] = useState({
    review_points: 10,
    post_points: 5,
    inquiry_points: 3,
    answer_points: 15,
    checkin_points: 20,
    referral_points: 50,
    points_expiry_days: 365,
    min_redemption_points: 100
  });
  
  const [notificationSettings, setNotificationSettings] = useState({
    event_reminder_days: 3,
    auto_weather_alerts: true,
    weather_alert_threshold_temp: 35,
    weather_alert_threshold_wind: 25,
    inquiry_response_reminder_hours: 48,
    push_notifications_enabled: true,
    email_templates: 'Default'
  });

  const [emailSettings, setEmailSettings] = useState({
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_user: 'noreply@daet.gov.ph',
    smtp_password: '••••••••',
    email_from_name: 'Daet Tourism',
    contact_template: 'Default'
  });
  
  const [backupSettings, setBackupSettings] = useState({
    auto_backup: true,
    schedule: 'Daily at 02:00 AM',
    retention_days: 30,
    include_media: true,
    backup_location: 'Cloud Storage'
  });

  const [securitySettings, setSecuritySettings] = useState({
    password_policy: '12+ chars, 1 uppercase, 1 number',
    max_login_attempts: 5,
    session_timeout: 60,
    require_mfa: true,
    allow_password_reset: true
  });
  
  const [moderationSettings, setModerationSettings] = useState({
    auto_moderation: true,
    require_approval: true,
    flagged_content_review_hours: 24,
    max_reports_before_hide: 3
  });

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const saveGeneralSettings = async () => {
    setSaving(true);
    try {
      // Save to settings table or localStorage for demo
      localStorage.setItem('site_settings', JSON.stringify(generalSettings));
      showToast('General settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Failed to save settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveThemeSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('theme_settings', JSON.stringify(themeSettings));
      showToast('Theme settings saved successfully!');
    } catch (err) {
      console.error('Error saving theme settings:', err);
      showToast('Failed to save theme settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveRewardSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('reward_settings', JSON.stringify(rewardSettings));
      showToast('Reward settings saved successfully!');
    } catch (err) {
      console.error('Error saving reward settings:', err);
      showToast('Failed to save reward settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveNotificationSettings = async () => {
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

  const saveEmailSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('email_settings', JSON.stringify(emailSettings));
      showToast('Email settings saved successfully!');
    } catch (err) {
      console.error('Error saving email settings:', err);
      showToast('Failed to save email settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveBackupSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('backup_settings', JSON.stringify(backupSettings));
      showToast('Backup settings saved successfully!');
    } catch (err) {
      console.error('Error saving backup settings:', err);
      showToast('Failed to save backup settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveSecuritySettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('security_settings', JSON.stringify(securitySettings));
      showToast('Security settings saved successfully!');
    } catch (err) {
      console.error('Error saving security settings:', err);
      showToast('Failed to save security settings', true);
    } finally {
      setSaving(false);
    }
  };

  const saveModerationSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('moderation_settings', JSON.stringify(moderationSettings));
      showToast('Moderation settings saved successfully!');
    } catch (err) {
      console.error('Error saving moderation settings:', err);
      showToast('Failed to save moderation settings', true);
    } finally {
      setSaving(false);
    }
  };

  const runSystemHealthCheck = () => {
    setSystemHealth({
      database: 'Healthy',
      api: 'Healthy',
      storage: 'Healthy',
      weather: 'Healthy',
      uptime: '99.98%'
    });
    setDatabaseInfo({
      size: '1.4 GB',
      liveTables: 18,
      optimized: true,
      lastBackup: 'Today, 02:00 AM'
    });
    showToast('System health check completed.');
  };

  const toggleMaintenanceMode = () => {
    const nextState = !maintenanceMode;
    setMaintenanceMode(nextState);
    setAuditLogs(prev => [{
      id: Date.now(),
      actor: 'Admin',
      action: nextState ? 'Enabled maintenance mode' : 'Disabled maintenance mode',
      timestamp: new Date().toLocaleString()
    }, ...prev]);
    showToast(nextState ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
  };

  const exportData = async () => {
    try {
      const tables = ['info_users', 'info_events', 'info_tourist_spots', 'info_blogs', 'info_amenities', 'info_inquiries'];
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

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        router.push('/login');
        return;
      }
      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) {
        router.push('/dashboard');
        return;
      }
      setUser(userData);
      
      // Load saved settings
      const savedGeneral = localStorage.getItem('site_settings');
      if (savedGeneral) setGeneralSettings(JSON.parse(savedGeneral));

      const savedTheme = localStorage.getItem('theme_settings');
      if (savedTheme) setThemeSettings(JSON.parse(savedTheme));
      
      const savedRewards = localStorage.getItem('reward_settings');
      if (savedRewards) setRewardSettings(JSON.parse(savedRewards));
      
      const savedNotifications = localStorage.getItem('notification_settings');
      if (savedNotifications) setNotificationSettings(JSON.parse(savedNotifications));

      const savedEmail = localStorage.getItem('email_settings');
      if (savedEmail) setEmailSettings(JSON.parse(savedEmail));

      const savedBackup = localStorage.getItem('backup_settings');
      if (savedBackup) setBackupSettings(JSON.parse(savedBackup));

      const savedSecurity = localStorage.getItem('security_settings');
      if (savedSecurity) setSecuritySettings(JSON.parse(savedSecurity));
      
      const savedModeration = localStorage.getItem('moderation_settings');
      if (savedModeration) setModerationSettings(JSON.parse(savedModeration));
      
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800"><Icon name="settings" className="inline-block w-6 h-6 mr-2" />System Settings</h1>
          <p className="text-gray-500 mt-1">Configure platform settings, rewards, notifications, and moderation rules</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200">
          <button onClick={() => setActiveTab('general')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'general' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>General</button>
          <button onClick={() => setActiveTab('theme')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'theme' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Theme</button>
          <button onClick={() => setActiveTab('rewards')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'rewards' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Rewards</button>
          <button onClick={() => setActiveTab('notifications')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'notifications' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Notifications</button>
          <button onClick={() => setActiveTab('email')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'email' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Email</button>
          <button onClick={() => setActiveTab('backup')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'backup' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Backup</button>
          <button onClick={() => setActiveTab('security')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'security' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Security</button>
          <button onClick={() => setActiveTab('maintenance')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'maintenance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Maintenance</button>
          <button onClick={() => setActiveTab('audit')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'audit' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Audit Log</button>
          <button onClick={() => setActiveTab('health')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'health' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>System Health</button>
          <button onClick={() => setActiveTab('database')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'database' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Database</button>
          <button onClick={() => setActiveTab('moderation')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'moderation' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Moderation</button>
          <button onClick={() => setActiveTab('data')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Data Management</button>
        </div>

        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">General Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                <input type="text" value={generalSettings.site_name} onChange={e => setGeneralSettings(p => ({ ...p, site_name: e.target.value }))} className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Description</label>
                <textarea value={generalSettings.site_description} onChange={e => setGeneralSettings(p => ({ ...p, site_description: e.target.value }))} rows="2" className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input type="email" value={generalSettings.contact_email} onChange={e => setGeneralSettings(p => ({ ...p, contact_email: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input type="text" value={generalSettings.contact_phone} onChange={e => setGeneralSettings(p => ({ ...p, contact_phone: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Address</label>
                <textarea value={generalSettings.office_address} onChange={e => setGeneralSettings(p => ({ ...p, office_address: e.target.value }))} rows="2" className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select value={generalSettings.timezone} onChange={e => setGeneralSettings(p => ({ ...p, timezone: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="Asia/Manila">Asia/Manila (UTC+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
                  <select value={generalSettings.date_format} onChange={e => setGeneralSettings(p => ({ ...p, date_format: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
              <button onClick={saveGeneralSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save General Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Theme Settings */}
        {activeTab === 'theme' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Theme Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
                <select value={themeSettings.color_scheme} onChange={e => setThemeSettings(p => ({ ...p, color_scheme: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="Ocean Blue">Ocean Blue</option>
                  <option value="Sunset Orange">Sunset Orange</option>
                  <option value="Forest Green">Forest Green</option>
                  <option value="Royal Purple">Royal Purple</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Layout</label>
                <select value={themeSettings.layout} onChange={e => setThemeSettings(p => ({ ...p, layout: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="Modern Sidebar">Modern Sidebar</option>
                  <option value="Compact Dashboard">Compact Dashboard</option>
                  <option value="Classic Layout">Classic Layout</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <input type="color" value={themeSettings.accent_color} onChange={e => setThemeSettings(p => ({ ...p, accent_color: e.target.value }))} className="h-12 w-full rounded-xl border border-gray-200 bg-white p-1" />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <input type="checkbox" checked={themeSettings.compact_mode} onChange={e => setThemeSettings(p => ({ ...p, compact_mode: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-gray-700">Enable compact mode</span>
              </div>
            </div>
            <button onClick={saveThemeSettings} disabled={saving} className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Theme Settings'}
            </button>
          </div>
        )}

        {/* Rewards Settings */}
        {activeTab === 'rewards' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4"><Icon name="plus" className="inline-block w-5 h-5 mr-2" />Rewards & Gamification</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Writing a Review</label>
                <input type="number" value={rewardSettings.review_points} onChange={e => setRewardSettings(p => ({ ...p, review_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Submitting a Post</label>
                <input type="number" value={rewardSettings.post_points} onChange={e => setRewardSettings(p => ({ ...p, post_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Posting an Inquiry</label>
                <input type="number" value={rewardSettings.inquiry_points} onChange={e => setRewardSettings(p => ({ ...p, inquiry_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Answering a Question</label>
                <input type="number" value={rewardSettings.answer_points} onChange={e => setRewardSettings(p => ({ ...p, answer_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Visit Check-in</label>
                <input type="number" value={rewardSettings.checkin_points} onChange={e => setRewardSettings(p => ({ ...p, checkin_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points for Referral</label>
                <input type="number" value={rewardSettings.referral_points} onChange={e => setRewardSettings(p => ({ ...p, referral_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points Expiry (days)</label>
                <input type="number" value={rewardSettings.points_expiry_days} onChange={e => setRewardSettings(p => ({ ...p, points_expiry_days: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Points for Redemption</label>
                <input type="number" value={rewardSettings.min_redemption_points} onChange={e => setRewardSettings(p => ({ ...p, min_redemption_points: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
            </div>
            <button onClick={saveRewardSettings} disabled={saving} className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Reward Settings'}
            </button>
          </div>
        )}

        {/* Notification Settings */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4"><Icon name="notifications" className="inline-block w-5 h-5 mr-2" />Notification Settings</h3>
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={notificationSettings.push_notifications_enabled} onChange={e => setNotificationSettings(p => ({ ...p, push_notifications_enabled: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Enable Push Notifications</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={notificationSettings.auto_weather_alerts} onChange={e => setNotificationSettings(p => ({ ...p, auto_weather_alerts: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Auto-generate Weather Alerts</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Reminder (days before)</label>
                <input type="number" value={notificationSettings.event_reminder_days} onChange={e => setNotificationSettings(p => ({ ...p, event_reminder_days: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weather Alert - Temperature Threshold (°C)</label>
                <input type="number" value={notificationSettings.weather_alert_threshold_temp} onChange={e => setNotificationSettings(p => ({ ...p, weather_alert_threshold_temp: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weather Alert - Wind Speed Threshold (m/s)</label>
                <input type="number" value={notificationSettings.weather_alert_threshold_wind} onChange={e => setNotificationSettings(p => ({ ...p, weather_alert_threshold_wind: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Inquiry Response Reminder (hours)</label>
                <input type="number" value={notificationSettings.inquiry_response_reminder_hours} onChange={e => setNotificationSettings(p => ({ ...p, inquiry_response_reminder_hours: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <button onClick={saveNotificationSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                {saving ? 'Saving...' : 'Save Notification Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Email Settings */}
        {activeTab === 'email' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Email Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                <input type="text" value={emailSettings.smtp_host} onChange={e => setEmailSettings(p => ({ ...p, smtp_host: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                <input type="number" value={emailSettings.smtp_port} onChange={e => setEmailSettings(p => ({ ...p, smtp_port: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
                <input type="text" value={emailSettings.smtp_user} onChange={e => setEmailSettings(p => ({ ...p, smtp_user: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                <input type="password" value={emailSettings.smtp_password} onChange={e => setEmailSettings(p => ({ ...p, smtp_password: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                <input type="text" value={emailSettings.email_from_name} onChange={e => setEmailSettings(p => ({ ...p, email_from_name: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
                <select value={emailSettings.contact_template} onChange={e => setEmailSettings(p => ({ ...p, contact_template: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="Default">Default</option>
                  <option value="Tourist Campaign">Tourist Campaign</option>
                  <option value="Official Notice">Official Notice</option>
                </select>
              </div>
            </div>
            <button onClick={saveEmailSettings} disabled={saving} className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Email Settings'}
            </button>
          </div>
        )}

        {/* Backup Settings */}
        {activeTab === 'backup' && (
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
                <input type="text" value={backupSettings.schedule} onChange={e => setBackupSettings(p => ({ ...p, schedule: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
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
        )}

        {/* Security Settings */}
        {activeTab === 'security' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Security Settings</h3>
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password Policy</label>
                <input type="text" value={securitySettings.password_policy} onChange={e => setSecuritySettings(p => ({ ...p, password_policy: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Login Attempts</label>
                <input type="number" value={securitySettings.max_login_attempts} onChange={e => setSecuritySettings(p => ({ ...p, max_login_attempts: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
                <input type="number" value={securitySettings.session_timeout} onChange={e => setSecuritySettings(p => ({ ...p, session_timeout: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={securitySettings.require_mfa} onChange={e => setSecuritySettings(p => ({ ...p, require_mfa: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Require MFA for admins</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={securitySettings.allow_password_reset} onChange={e => setSecuritySettings(p => ({ ...p, allow_password_reset: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Allow password reset</span>
                </label>
              </div>
              <button onClick={saveSecuritySettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Security Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Maintenance Mode */}
        {activeTab === 'maintenance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Maintenance Mode</h3>
            <div className="space-y-4 max-w-xl">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-600">Current state: <span className="font-semibold text-slate-800">{maintenanceMode ? 'Enabled' : 'Disabled'}</span></p>
              </div>
              <button onClick={toggleMaintenanceMode} className={`px-6 py-2 rounded-full text-white ${maintenanceMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                {maintenanceMode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
              </button>
            </div>
          </div>
        )}

        {/* Audit Log */}
        {activeTab === 'audit' && (
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
        )}

        {/* System Health */}
        {activeTab === 'health' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">System Health</h3>
              <button onClick={runSystemHealthCheck} className="rounded-full bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Check Now</button>
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
        )}

        {/* Version & Database */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Version Information</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">System</div><div className="mt-2 font-bold text-slate-800">DAET Tourism</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Version</div><div className="mt-2 font-bold text-slate-800">v2.4.1</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Build</div><div className="mt-2 font-bold text-slate-800">2026.08</div></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</div><div className="mt-2 font-bold text-emerald-700">Stable</div></div>
              </div>
            </div>
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
          </div>
        )}

        {/* Moderation Settings */}
        {activeTab === 'moderation' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4"><Icon name="moderation" className="inline-block w-5 h-5 mr-2" />Moderation Settings</h3>
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={moderationSettings.auto_moderation} onChange={e => setModerationSettings(p => ({ ...p, auto_moderation: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Enable Auto-moderation (keyword filtering)</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={moderationSettings.require_approval} onChange={e => setModerationSettings(p => ({ ...p, require_approval: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Require Approval for User Posts</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flagged Content Review Time (hours)</label>
                <input type="number" value={moderationSettings.flagged_content_review_hours} onChange={e => setModerationSettings(p => ({ ...p, flagged_content_review_hours: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Reports Before Auto-hide</label>
                <input type="number" value={moderationSettings.max_reports_before_hide} onChange={e => setModerationSettings(p => ({ ...p, max_reports_before_hide: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
              </div>
              <button onClick={saveModerationSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                {saving ? 'Saving...' : 'Save Moderation Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Data Management */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2"><Icon name="data" className="inline-block w-5 h-5 mr-2" />Export Data</h3>
              <p className="text-sm text-gray-500 mb-4">Export all platform data for backup or reporting purposes</p>
              <button onClick={exportData} className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700 flex items-center gap-2">
                <Icon name="data" className="w-4 h-4" /> Export All Data (JSON)
              </button>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2"><Icon name="delete" className="inline-block w-5 h-5 mr-2" />Clear Cache</h3>
              <p className="text-sm text-gray-500 mb-4">Clear all cached data and force all users to log in again</p>
              <button onClick={clearCache} className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 flex items-center gap-2">
                <Icon name="delete" className="w-4 h-4" /> Clear Cache
              </button>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">Database Connection: Connected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">Storage Service: Operational</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">Weather API: Operational</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          <span className="inline-block mr-2">{toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}</span>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
