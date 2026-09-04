// Shared layout for the admin Settings section. Each settings page (Overview,
// General, Email & Notifications, Security, Maintenance Mode) renders through
// this shell so auth, the admin sidebar, the page header, and toasts stay
// consistent. Children are rendered as a function that receives { showToast }.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles';
import { getStoredSession } from '@/lib/authCookies';

export default function SettingsShell({ title, subtitle, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    let isActive = true;

    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        router.push('/login');
        return;
      }

      try {
        const userData = JSON.parse(session);
        if (!hasAdminAccess(userData.role)) {
          router.push('/dashboard');
          return;
        }
        if (isActive) setUser(userData);
      } catch (err) {
        console.error('Error loading admin user session:', err);
        if (isActive) router.push('/login');
      } finally {
        if (isActive) setLoading(false);
      }
    };

    checkAuth();

    return () => {
      isActive = false;
    };
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
          <h1 className="text-2xl font-bold text-gray-800"><Icon name="settings" className="inline-block w-6 h-6 mr-2" />{title}</h1>
          {subtitle ? <p className="text-gray-500 mt-1">{subtitle}</p> : null}
        </div>

        {typeof children === 'function' ? children(showToast) : children}
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