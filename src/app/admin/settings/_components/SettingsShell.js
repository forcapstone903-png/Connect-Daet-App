// Shared layout for the admin Settings section. Each settings page (Overview,
// General, Email & Notifications, Security, Maintenance Mode) renders through
// this shell so auth, the admin sidebar, the page header, and toasts stay
// consistent. Children are rendered as a function that receives { showToast }.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { AdminPageHeader } from '@/app/components/admin';
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
          router.push('/admin/dashboard');
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
      <div className="min-h-screen bg-gray-50">
        <div className="admin-loading">
          <span className="admin-loading-ring" aria-hidden="true" />
          <p className="text-sm">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Configuration"
          title={title}
          description={subtitle}
          icon="settings"
        />

        {typeof children === 'function' ? children(showToast) : children}
      </div>

      {/* Toast */}
      {toastMessage && (
        <div
          className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}
          role="status"
        >
          <Icon name={toastMessage.isError ? 'warning' : 'check'} className="h-4 w-4" />
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}