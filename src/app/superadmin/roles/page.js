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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formState, setFormState] = useState({ full_name: '', email: '', password: '', user_type: 'superadmin' });

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

  const createPrivilegedUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/superadmin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formState.full_name,
          email: formState.email,
          password: formState.password,
          user_type: formState.user_type,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to create account');

      setFormState({ full_name: '', email: '', password: '', user_type: 'superadmin' });
      setMessage(`Created ${formState.user_type} account for ${formState.email}.`);
      const { data: refreshed, error } = await supabase.from('info_users').select('id, full_name, email, user_type, status').order('created_at', { ascending: false });
      if (!error) setUsers((refreshed || []).filter((entry) => entry.user_type === 'admin' || entry.user_type === 'superadmin' || entry.user_type === 'moderator'));
    } catch (err) {
      setMessage(err.message || 'Unable to create account');
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
        <form onSubmit={createPrivilegedUser} className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Create Privileged Account</h2>
              <p className="text-sm text-gray-500">Create an admin, superadmin, or moderator account directly from this page.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
              <input required value={formState.full_name} onChange={(e) => setFormState((prev) => ({ ...prev, full_name: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2" placeholder="e.g. Juan Dela Cruz" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
              <select value={formState.user_type} onChange={(e) => setFormState((prev) => ({ ...prev, user_type: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2">
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input required type="email" value={formState.email} onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2" placeholder="new-admin@example.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Temporary Password</label>
              <input required type="password" value={formState.password} onChange={(e) => setFormState((prev) => ({ ...prev, password: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2" placeholder="Minimum 6 characters" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button disabled={saving} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
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
                    onChange={(e) => updateRole(entry.id, e.target.value)}
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
