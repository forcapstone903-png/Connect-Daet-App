'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = getStoredSession();
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

const defaultSessions = [
  { id: 1, device: 'Windows Desktop', location: 'Daet, Camarines Norte', current: true, lastActive: 'Now' },
  { id: 2, device: 'Chrome on iPhone', location: 'Naga City', current: false, lastActive: '2 hours ago' },
  { id: 3, device: 'MacBook Pro', location: 'Manila', current: false, lastActive: '1 day ago' },
];

const defaultActivity = [
  { id: 1, action: 'Updated event settings', time: 'Today at 9:42 AM' },
  { id: 2, action: 'Approved tourist spot submission', time: 'Yesterday at 4:18 PM' },
  { id: 3, action: 'Changed messaging template', time: 'Mon at 10:12 AM' },
];

export default function AdminProfilePage() {
  const router = useRouter();
  const [user] = useState(() => readStoredSession());
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return JSON.parse(localStorage.getItem('admin_dark_mode') || 'false');
    } catch {
      return false;
    }
  });
  const [profile, setProfile] = useState(() => {
    const baseProfile = {
      fullName: 'System Administrator',
      email: 'admin@daet.gov.ph',
      phone: '+63 912 345 6789',
      role: 'Administrator',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      bio: 'Responsible for platform oversight, content moderation, and tourism communications.',
    };

    if (typeof window === 'undefined') return baseProfile;

    try {
      const savedProfile = JSON.parse(localStorage.getItem('admin_profile') || 'null');
      const sessionUser = readStoredSession();
      return {
        ...baseProfile,
        ...(savedProfile || {}),
        fullName: sessionUser?.full_name || (savedProfile?.fullName || baseProfile.fullName),
        email: sessionUser?.email || (savedProfile?.email || baseProfile.email),
        role: sessionUser?.role || (savedProfile?.role || baseProfile.role),
      };
    } catch {
      return baseProfile;
    }
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [twoFactor, setTwoFactor] = useState(true);
  const [sessions, setSessions] = useState(() => {
    if (typeof window === 'undefined') return defaultSessions;
    try {
      const stored = JSON.parse(localStorage.getItem('admin_sessions') || 'null');
      return Array.isArray(stored) && stored.length ? stored : defaultSessions;
    } catch {
      return defaultSessions;
    }
  });
  const [activityLog, setActivityLog] = useState(() => {
    if (typeof window === 'undefined') return defaultActivity;
    try {
      const stored = JSON.parse(localStorage.getItem('admin_activity_log') || 'null');
      return Array.isArray(stored) && stored.length ? stored : defaultActivity;
    } catch {
      return defaultActivity;
    }
  });
  const [notifications, setNotifications] = useState(() => {
    if (typeof window === 'undefined') return { emailAlerts: true, systemAlerts: true, weeklySummary: true, eventNotifications: true };
    try {
      const stored = JSON.parse(localStorage.getItem('admin_notification_preferences') || 'null');
      return stored || { emailAlerts: true, systemAlerts: true, weeklySummary: true, eventNotifications: true };
    } catch {
      return { emailAlerts: true, systemAlerts: true, weeklySummary: true, eventNotifications: true };
    }
  });
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2500);
  };

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
    localStorage.setItem('admin_profile', JSON.stringify(profile));
    localStorage.setItem('admin_dark_mode', JSON.stringify(darkMode));
    localStorage.setItem('admin_notification_preferences', JSON.stringify(notifications));
    localStorage.setItem('admin_sessions', JSON.stringify(sessions));
    localStorage.setItem('admin_activity_log', JSON.stringify(activityLog));
  }, [activityLog, darkMode, notifications, profile, sessions]);

  const saveProfile = () => {
    setProfile((prev) => ({ ...prev }));
    setActivityLog((prev) => [{ id: Date.now(), action: 'Updated administrative profile', time: 'Just now' }, ...prev]);
    showToast('Profile updated successfully.');
  };

  const savePassword = () => {
    if (!passwordForm.current || !passwordForm.next || passwordForm.next !== passwordForm.confirm) {
      showToast('Please confirm your new password accurately.', true);
      return;
    }

    setPasswordForm({ current: '', next: '', confirm: '' });
    setActivityLog((prev) => [{ id: Date.now(), action: 'Changed account password', time: 'Just now' }, ...prev]);
    showToast('Password changed successfully.');
  };

  const toggleSession = (id) => {
    setSessions((prev) => prev.map((session) => session.id === id ? { ...session, current: !session.current } : session));
  };

  if (!user) {
    return null;
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-800'}`}>
      <AdminSidebar user={user} roleLabel="System Administrator" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Profile & Account</h1>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>View and manage your account profile, sessions, and preferences.</p>
          </div>
          <button onClick={() => setDarkMode((prev) => !prev)} className={`rounded-full px-4 py-2 text-sm font-medium ${darkMode ? 'bg-amber-500 text-slate-900 hover:bg-amber-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className={`${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
            <div className="mb-5 flex items-center gap-4">
              <Image src={profile.avatar} alt={profile.fullName} width={80} height={80} className="h-20 w-20 rounded-full object-cover ring-4 ring-blue-100" />
              <div>
                <h2 className="text-2xl font-bold">{profile.fullName}</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{profile.role}</p>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{profile.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Full name</label>
                <input value={profile.fullName} onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input value={profile.email} onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Phone</label>
                <input value={profile.phone} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Bio</label>
                <textarea value={profile.bio} onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))} rows="4" className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
              </div>
              <button onClick={saveProfile} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Save profile</button>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
              <h3 className="mb-4 text-lg font-bold">Security</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Current password</label>
                  <input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">New password</label>
                    <input type="password" value={passwordForm.next} onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Confirm password</label>
                    <input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))} className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <p className="font-medium">Two-factor authentication</p>
                    <p className="text-xs text-slate-500">Protect your account with 2FA</p>
                  </div>
                  <button onClick={() => setTwoFactor((prev) => !prev)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${twoFactor ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {twoFactor ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <button onClick={savePassword} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Change password</button>
              </div>
            </div>

            <div className={`${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
              <h3 className="mb-4 text-lg font-bold">Notifications</h3>
              <div className="space-y-3 text-sm">
                {Object.entries(notifications).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <input type="checkbox" checked={value} onChange={() => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-4 w-4 accent-blue-600" />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className={`${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
            <h3 className="mb-4 text-lg font-bold">Active Sessions</h3>
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className={`flex items-center justify-between rounded-xl ${darkMode ? 'bg-slate-950' : 'bg-slate-50'} p-3`}>
                  <div>
                    <p className="font-medium">{session.device}</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{session.location} · {session.lastActive}</p>
                  </div>
                  <button onClick={() => toggleSession(session.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${session.current ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {session.current ? 'Current' : 'Switch'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={`${darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'} rounded-2xl border p-6 shadow-sm`}>
            <h3 className="mb-4 text-lg font-bold">Activity Log</h3>
            <div className="space-y-3">
              {activityLog.map((entry) => (
                <div key={entry.id} className={`rounded-xl ${darkMode ? 'bg-slate-950' : 'bg-slate-50'} p-3`}>
                  <p className="font-medium">{entry.action}</p>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{entry.time}</p>
                </div>
              ))}
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
