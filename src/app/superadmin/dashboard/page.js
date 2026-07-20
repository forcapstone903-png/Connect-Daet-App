'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasSuperAdminAccess, getAdminRoleLabel } from '@/lib/adminRoles';

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ admins: 0, totalUsers: 0, events: 0, posts: 0 });

  useEffect(() => {
    const initialize = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        router.push('/login');
        return;
      }

      const userData = JSON.parse(session);
      if (!hasSuperAdminAccess(userData.role)) {
        router.push('/admin/dashboard');
        return;
      }

      setUser(userData);

      try {
        const [{ data: usersData, error: usersError }, { data: eventsData, error: eventsError }, { data: postsData, error: postsError }] = await Promise.all([
          supabase.from('info_users').select('id, user_type, status').order('created_at', { ascending: false }),
          supabase.from('info_events').select('id').order('created_at', { ascending: false }),
          supabase.from('info_user_posts').select('id').order('created_at', { ascending: false })
        ]);

        if (usersError) throw usersError;
        if (eventsError) throw eventsError;
        if (postsError) throw postsError;

        setStats({
          admins: (usersData || []).filter((entry) => entry.user_type === 'admin' || entry.user_type === 'superadmin').length,
          totalUsers: (usersData || []).length,
          events: (eventsData || []).length,
          posts: (postsData || []).length,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={{ ...user, full_name: user?.user_name || user?.full_name || user?.email }} roleLabel={getAdminRoleLabel(user?.role)} />

      <div className="ml-64 p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Superadmin Control Center</h1>
            <p className="mt-1 text-sm text-gray-500">Manage privileged access, monitor system health, and keep the platform secure.</p>
          </div>
          <Link href="/superadmin/roles" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Manage Roles
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Admin Accounts', value: stats.admins, accent: 'bg-blue-50 text-blue-700' },
            { label: 'All Users', value: stats.totalUsers, accent: 'bg-emerald-50 text-emerald-700' },
            { label: 'Events', value: stats.events, accent: 'bg-violet-50 text-violet-700' },
            { label: 'Posts', value: stats.posts, accent: 'bg-amber-50 text-amber-700' }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">{item.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${item.accent}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
