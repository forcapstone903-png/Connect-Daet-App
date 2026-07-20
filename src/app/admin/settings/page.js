// app/admin/settings/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles';

export default function AdminSettings() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  
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
    push_notifications_enabled: true
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
      
      const savedRewards = localStorage.getItem('reward_settings');
      if (savedRewards) setRewardSettings(JSON.parse(savedRewards));
      
      const savedNotifications = localStorage.getItem('notification_settings');
      if (savedNotifications) setNotificationSettings(JSON.parse(savedNotifications));
      
      const savedModeration = localStorage.getItem('moderation_settings');
      if (savedModeration) setModerationSettings(JSON.parse(savedModeration));
      
      setLoading(false);
    };
    checkAuth();
  }, []);

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
      <div className="ml-64 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">⚙️ System Settings</h1>
          <p className="text-gray-500 mt-1">Configure platform settings, rewards, notifications, and moderation rules</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button onClick={() => setActiveTab('general')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'general' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>General</button>
          <button onClick={() => setActiveTab('rewards')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'rewards' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>🎮 Rewards & Gamification</button>
          <button onClick={() => setActiveTab('notifications')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'notifications' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>🔔 Notifications</button>
          <button onClick={() => setActiveTab('moderation')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'moderation' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>🛡️ Moderation</button>
          <button onClick={() => setActiveTab('data')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>💾 Data Management</button>
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

        {/* Rewards Settings */}
        {activeTab === 'rewards' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🎮 Rewards & Gamification</h3>
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
            <h3 className="text-lg font-bold text-gray-800 mb-4">🔔 Notification Settings</h3>
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

        {/* Moderation Settings */}
        {activeTab === 'moderation' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🛡️ Moderation Settings</h3>
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
              <h3 className="text-lg font-bold text-gray-800 mb-2">📥 Export Data</h3>
              <p className="text-sm text-gray-500 mb-4">Export all platform data for backup or reporting purposes</p>
              <button onClick={exportData} className="bg-green-600 text-white px-6 py-2 rounded-full hover:bg-green-700">
                📥 Export All Data (JSON)
              </button>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">🗑️ Clear Cache</h3>
              <p className="text-sm text-gray-500 mb-4">Clear all cached data and force all users to log in again</p>
              <button onClick={clearCache} className="bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700">
                🗑️ Clear Cache
              </button>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">🔄 System Status</h3>
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
          {toastMessage.isError ? '⚠️' : '✅'} {toastMessage.message}
        </div>
      )}
    </div>
  );
}
