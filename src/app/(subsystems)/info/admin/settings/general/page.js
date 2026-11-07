// app/admin/settings/general/page.js — General Settings
'use client';

import { useState } from 'react';
import SettingsShell from '../_components/SettingsShell';
import useStoredSetting from '../_components/useStoredSetting';

export default function AdminSettingsGeneral() {
  const [generalSettings, setGeneralSettings] = useState({
    site_name: 'DAET Tourism',
    contact_email: 'tourism@daet.gov.ph',
    timezone: 'Asia/Manila',
    language: 'English',
    date_format: 'MM/DD/YYYY'
  });
  const [themeSettings, setThemeSettings] = useStoredSetting('admin_theme_settings', {
    dark_mode: false,
    primary_color: 'blue',
    accent_color: 'emerald',
    theme_mode: 'light'
  });
  const [rewardSettings, setRewardSettings] = useStoredSetting('admin_reward_settings', {
    enable_points: true,
    points_per_post: 10,
    points_per_comment: 0.01,
    points_for_profile_complete: 20,
    daily_streak_bonus: 5,
    leaderboard_enabled: true,
    badge_display: true,
    referral_bonus: 15
  });
  const [moderationSettings, setModerationSettings] = useStoredSetting('admin_moderation_settings', {
    auto_moderation: true,
    require_approval: false,
    flagged_content_review_hours: 24,
    max_reports_before_hide: 3
  });
  const [saving, setSaving] = useState(false);

  return (
    <SettingsShell
      title="General Settings"
      subtitle="Site configuration, theme, rewards, and moderation rules"
    >
      {(showToast) => {
        const saveGeneralSettings = async () => {
          setSaving(true);
          try {
            localStorage.setItem('site_settings', JSON.stringify(generalSettings));
            showToast('General settings saved successfully!');
          } catch (err) {
            console.error('Error saving general settings:', err);
            showToast('Failed to save general settings', true);
          } finally {
            setSaving(false);
          }
        };

        const saveThemeSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_theme_settings', JSON.stringify(themeSettings));
            showToast('Theme settings saved successfully!');
          } catch (err) {
            console.error('Error saving theme settings:', err);
            showToast('Failed to save theme settings', true);
          } finally {
            setSaving(false);
          }
        };

        const saveRewardSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_reward_settings', JSON.stringify(rewardSettings));
            showToast('Reward settings saved successfully!');
          } catch (err) {
            console.error('Error saving reward settings:', err);
            showToast('Failed to save reward settings', true);
          } finally {
            setSaving(false);
          }
        };

        const saveModerationSettings = () => {
          setSaving(true);
          try {
            localStorage.setItem('admin_moderation_settings', JSON.stringify(moderationSettings));
            showToast('Moderation settings saved successfully!');
          } catch (err) {
            console.error('Error saving moderation settings:', err);
            showToast('Failed to save moderation settings', true);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="space-y-6">
{/* General Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">General Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                  <input type="text" value={generalSettings.site_name} onChange={e => setGeneralSettings(p => ({ ...p, site_name: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input type="email" value={generalSettings.contact_email} onChange={e => setGeneralSettings(p => ({ ...p, contact_email: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select value={generalSettings.timezone} onChange={e => setGeneralSettings(p => ({ ...p, timezone: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                  <select value={generalSettings.language} onChange={e => setGeneralSettings(p => ({ ...p, language: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                    <option value="English">English</option>
                    <option value="Filipino">Filipino</option>
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
{/* Theme Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Theme Settings</h3>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={themeSettings.dark_mode} onChange={e => setThemeSettings(p => ({ ...p, dark_mode: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Enable dark mode</span>
                </label>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme Mode</label>
                <select value={themeSettings.theme_mode} onChange={e => setThemeSettings(p => ({ ...p, theme_mode: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System default</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <select value={themeSettings.primary_color} onChange={e => setThemeSettings(p => ({ ...p, primary_color: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="blue">Blue</option>
                  <option value="emerald">Emerald</option>
                  <option value="violet">Violet</option>
                  <option value="rose">Rose</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <select value={themeSettings.accent_color} onChange={e => setThemeSettings(p => ({ ...p, accent_color: e.target.value }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl">
                  <option value="emerald">Emerald</option>
                  <option value="amber">Amber</option>
                  <option value="sky">Sky</option>
                  <option value="pink">Pink</option>
                </select>
              </div>
              <button onClick={saveThemeSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Theme Settings'}
              </button>
            </div>
{/* Rewards & Gamification */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Rewards & Gamification</h3>
              <div>
                <label className="flex items-center gap-2 mb-4">
                  <input type="checkbox" checked={rewardSettings.enable_points} onChange={e => setRewardSettings(p => ({ ...p, enable_points: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Enable points system</span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points per Post</label>
                  <input type="number" value={rewardSettings.points_per_post} onChange={e => setRewardSettings(p => ({ ...p, points_per_post: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points per Comment</label>
                  <input type="number" min="0" step="0.01" value={rewardSettings.points_per_comment} onChange={e => setRewardSettings(p => ({ ...p, points_per_comment: parseFloat(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points for Completed Profile</label>
                  <input type="number" value={rewardSettings.points_for_profile_complete} onChange={e => setRewardSettings(p => ({ ...p, points_for_profile_complete: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Daily Streak Bonus</label>
                  <input type="number" value={rewardSettings.daily_streak_bonus} onChange={e => setRewardSettings(p => ({ ...p, daily_streak_bonus: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referral Bonus</label>
                  <input type="number" value={rewardSettings.referral_bonus} onChange={e => setRewardSettings(p => ({ ...p, referral_bonus: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-2 border border-gray-200 rounded-xl" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={rewardSettings.leaderboard_enabled} onChange={e => setRewardSettings(p => ({ ...p, leaderboard_enabled: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Enable leaderboard</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={rewardSettings.badge_display} onChange={e => setRewardSettings(p => ({ ...p, badge_display: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Display badges on profiles</span>
                </label>
              </div>
              <button onClick={saveRewardSettings} disabled={saving} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Reward Settings'}
              </button>
            </div>

{/* Moderation Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Moderation Settings</h3>
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
          </div>
        );
      }}
    </SettingsShell>
  );
}