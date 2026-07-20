'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasSuperAdminAccess, getAdminRoleLabel } from '@/lib/adminRoles';
import { supabase } from '@/lib/supabase';

export default function SuperAdminRolesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [pendingRole, setPendingRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
        const { data, error } = await supabase.from('info_users').select('id, full_name, email, user_type, status').order('created_at', { ascending: false });
        if (error) throw error;
        setUsers((data || []).filter((entry) => entry.user_type === 'admin' || entry.user_type === 'superadmin' || entry.user_type === 'moderator'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [router]);

  const updateRole = async (targetId, role) => {
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.from('info_users').update({ user_type: role, updated_at: new Date().toISOString() }).eq('id', targetId);
      if (error) throw error;
      setUsers((prev) => prev.map((entry) => entry.id === targetId ? { ...entry, user_type: role } : entry));
      setMessage('Role updated successfully.');
    } catch (err) {
      setMessage(err.message || 'Unable to update role');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={{ ...user, full_name: user?.user_name || user?.full_name || user?.email }} roleLabel={getAdminRoleLabel(user?.role)} />
      <div className="ml-64 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Role Management</h1>
          <p className="mt-1 text-sm text-gray-500">Assign or refine elevated permissions without cluttering the main admin pages.</p>
        </div>
        {message && <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-800">Privileged Accounts</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {users.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-800">{entry.full_name || entry.email}</p>
                  <p className="text-sm text-gray-500">{entry.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm capitalize text-gray-700">{entry.user_type}</span>
                  <select
                    value={entry.user_type}
                    onChange={(e) => {
                      setPendingRole({ id: entry.id, role: e.target.value });
                      updateRole(entry.id, e.target.value);
                    }}
                    className="rounded-full border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                    <option value="moderator">Moderator</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
