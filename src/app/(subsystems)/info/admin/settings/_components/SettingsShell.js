// Shared layout for admin settings pages so auth, navigation, headers, and
// toasts stay consistent. Children may receive { showToast } as a function.
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLoadingScreen, AdminShell } from '@/app/(subsystems)/info/components/admin';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
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
        router.push('/info/login');
        return;
      }

      try {
        const userData = JSON.parse(session);
        if (!hasAdminAccess(userData.role)) {
          router.push('/info/admin/dashboard');
          return;
        }
        if (isActive) setUser(userData);
      } catch (err) {
        console.error('Error loading admin user session:', err);
        if (isActive) router.push('/info/login');
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
    return <AdminLoadingScreen label="Loading settings…" />;
  }

  return (
    <AdminShell
      user={user}
      roleLabel="Admin Console"
      eyebrow="Configuration"
      title={title}
      description={subtitle}
      headerIcon="settings"
    >
      {typeof children === 'function' ? children(showToast) : children}
      {toastMessage && (
        <div
          className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}
          role="status"
        >
          <Icon name={toastMessage.isError ? 'warning' : 'check'} className="h-4 w-4" />
          {toastMessage.message}
        </div>
      )}
    </AdminShell>
  );
}