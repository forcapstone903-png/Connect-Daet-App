'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';

const STORAGE_KEY = 'daet_announcement_settings';

const defaultCategories = [
  { id: 1, name: 'General', color: 'blue', enabled: true },
  { id: 2, name: 'Travel Alerts', color: 'amber', enabled: true },
  { id: 3, name: 'Safety', color: 'red', enabled: true },
  { id: 4, name: 'Events', color: 'purple', enabled: true },
];

const defaultTemplates = [
  { id: 1, name: 'Festival Reminder', type: 'event', subject: 'Upcoming Festival Reminder', body: 'Hello {{firstName}}, this is a reminder that the {{eventName}} will begin on {{date}}. Please plan your travel early.' },
  { id: 2, name: 'Weather Alert', type: 'safety', subject: 'Weather Advisory', body: 'Hello {{firstName}}, a weather advisory is in effect for the next few hours. Please follow local safety guidance.' },
  { id: 3, name: 'Service Notice', type: 'announcement', subject: 'Service Update', body: 'We have updated our service schedule and transportation support. Please check the latest updates before visiting.' },
];

const defaultState = {
  categories: defaultCategories,
  priorityLevels: ['Urgent', 'High', 'Normal', 'Low'],
  expirationDays: 7,
  notificationTemplates: defaultTemplates,
  pushSettings: {
    enabled: true,
    digestFrequency: 'daily',
    quietHours: '22:00-06:00',
    emergencyEscalation: true,
  },
  emailDigest: {
    daily: true,
    weekly: true,
    includeTopEvents: true,
    sendTime: '08:00',
  },
  emergencyProtocol: {
    enabled: true,
    contacts: 'DMO Emergency Desk, Local Police, Municipal Disaster Office',
    escalationMinutes: 15,
    requireApproval: true,
  },
};

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = getStoredSession();
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

export default function AnnouncementSettingsPage() {
  const router = useRouter();
  const [user] = useState(() => readStoredSession());
  const [settings, setSettings] = useState(() => {
    if (typeof window === 'undefined') return defaultState;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved || defaultState;
    } catch {
      return defaultState;
    }
  });
  const [newCategory, setNewCategory] = useState('');
  const [templateForm, setTemplateForm] = useState({ name: '', type: 'announcement', subject: '', body: '' });
  const [toast, setToast] = useState(null);

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

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2600);
  };

  const addCategory = () => {
    if (!newCategory.trim()) {
      showToast('Please enter a category name.', true);
      return;
    }

    setSettings((prev) => ({
      ...prev,
      categories: [...prev.categories, { id: Date.now(), name: newCategory.trim(), color: 'blue', enabled: true }],
    }));
    setNewCategory('');
    showToast('Category added successfully.');
  };

  const toggleCategory = (id) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.map((category) => category.id === id ? { ...category, enabled: !category.enabled } : category),
    }));
    showToast('Category status updated.');
  };

  const addTemplate = () => {
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      showToast('Please fill in the template details.', true);
      return;
    }

    setSettings((prev) => ({
      ...prev,
      notificationTemplates: [{ id: Date.now(), ...templateForm, name: templateForm.name.trim() }, ...prev.notificationTemplates],
    }));
    setTemplateForm({ name: '', type: 'announcement', subject: '', body: '' });
    showToast('Template saved successfully.');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Announcement Settings" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Announcement & Alert Settings</h1>
            <p className="text-sm text-slate-500">Configure categories, priorities, notifications, and emergency protocols.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 p-4 text-white shadow-sm">
            <div className="text-sm text-sky-100">Categories</div>
            <div className="mt-2 text-3xl font-bold">{settings.categories.length}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 p-4 text-white shadow-sm">
            <div className="text-sm text-violet-100">Priority Levels</div>
            <div className="mt-2 text-3xl font-bold">{settings.priorityLevels.length}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-sm">
            <div className="text-sm text-amber-100">Expiration</div>
            <div className="mt-2 text-3xl font-bold">{settings.expirationDays}d</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 p-4 text-white shadow-sm">
            <div className="text-sm text-emerald-100">Emergency</div>
            <div className="mt-2 text-3xl font-bold">{settings.emergencyProtocol.enabled ? 'On' : 'Off'}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Category Management</h2>
              <div className="flex gap-3">
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New announcement category" className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                <button onClick={addCategory} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Add</button>
              </div>

              <div className="mt-4 space-y-3">
                {settings.categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="font-medium text-slate-800">{category.name}</p>
                      <p className="text-xs text-slate-500">{category.color} category</p>
                    </div>
                    <button onClick={() => toggleCategory(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      {category.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Priority & Expiration</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Priority levels</label>
                  <input value={settings.priorityLevels.join(', ')} onChange={(e) => setSettings((prev) => ({ ...prev, priorityLevels: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Default expiration (days)</label>
                  <input type="number" value={settings.expirationDays} onChange={(e) => setSettings((prev) => ({ ...prev, expirationDays: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Push Notifications & Email Digest</h2>

              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <span>Push notifications enabled</span>
                  <input type="checkbox" checked={settings.pushSettings.enabled} onChange={(e) => setSettings((prev) => ({ ...prev, pushSettings: { ...prev.pushSettings, enabled: e.target.checked } }))} className="h-4 w-4 accent-blue-600" />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Digest frequency</label>
                    <select value={settings.pushSettings.digestFrequency} onChange={(e) => setSettings((prev) => ({ ...prev, pushSettings: { ...prev.pushSettings, digestFrequency: e.target.value } }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Quiet hours</label>
                    <input value={settings.pushSettings.quietHours} onChange={(e) => setSettings((prev) => ({ ...prev, pushSettings: { ...prev.pushSettings, quietHours: e.target.value } }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <span>Daily digest</span>
                    <input type="checkbox" checked={settings.emailDigest.daily} onChange={(e) => setSettings((prev) => ({ ...prev, emailDigest: { ...prev.emailDigest, daily: e.target.checked } }))} className="h-4 w-4 accent-blue-600" />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <span>Weekly digest</span>
                    <input type="checkbox" checked={settings.emailDigest.weekly} onChange={(e) => setSettings((prev) => ({ ...prev, emailDigest: { ...prev.emailDigest, weekly: e.target.checked } }))} className="h-4 w-4 accent-blue-600" />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <span>Top events included</span>
                    <input type="checkbox" checked={settings.emailDigest.includeTopEvents} onChange={(e) => setSettings((prev) => ({ ...prev, emailDigest: { ...prev.emailDigest, includeTopEvents: e.target.checked } }))} className="h-4 w-4 accent-blue-600" />
                  </label>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Send time</label>
                    <input type="time" value={settings.emailDigest.sendTime} onChange={(e) => setSettings((prev) => ({ ...prev, emailDigest: { ...prev.emailDigest, sendTime: e.target.value } }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Notification Templates</h2>

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Template name</label>
                    <input value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                    <select value={templateForm.type} onChange={(e) => setTemplateForm((prev) => ({ ...prev, type: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="announcement">Announcement</option>
                      <option value="event">Event</option>
                      <option value="safety">Safety</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
                  <input value={templateForm.subject} onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Message body</label>
                  <textarea value={templateForm.body} onChange={(e) => setTemplateForm((prev) => ({ ...prev, body: e.target.value }))} rows="4" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>

                <button onClick={addTemplate} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">Save Template</button>
              </div>

              <div className="mt-5 space-y-3">
                {settings.notificationTemplates.map((template) => (
                  <div key={template.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{template.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{template.subject}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Emergency Alert Protocol</h2>

              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span>Emergency alerts enabled</span>
                <input type="checkbox" checked={settings.emergencyProtocol.enabled} onChange={(e) => setSettings((prev) => ({ ...prev, emergencyProtocol: { ...prev.emergencyProtocol, enabled: e.target.checked } }))} className="h-4 w-4 accent-red-600" />
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Escalation window (minutes)</label>
                  <input type="number" value={settings.emergencyProtocol.escalationMinutes} onChange={(e) => setSettings((prev) => ({ ...prev, emergencyProtocol: { ...prev.emergencyProtocol, escalationMinutes: Number(e.target.value) || 0 } }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <span>Require approval</span>
                  <input type="checkbox" checked={settings.emergencyProtocol.requireApproval} onChange={(e) => setSettings((prev) => ({ ...prev, emergencyProtocol: { ...prev.emergencyProtocol, requireApproval: e.target.checked } }))} className="h-4 w-4 accent-red-600" />
                </label>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Alert contacts</label>
                <textarea value={settings.emergencyProtocol.contacts} onChange={(e) => setSettings((prev) => ({ ...prev, emergencyProtocol: { ...prev.emergencyProtocol, contacts: e.target.value } }))} rows="3" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
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
