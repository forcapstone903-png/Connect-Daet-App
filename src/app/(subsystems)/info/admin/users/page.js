// app/(subsystems)/info/admin/users/page.js
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Heart, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminAvatar from '@/app/(subsystems)/info/components/admin/AdminAvatar';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminButton, AdminPageHeader, AdminPagination, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
import { getAdminRoleLabel, hasAdminAccess, isSuperAdmin } from '@/lib/adminRoles'
import { GRANTABLE_PERMISSIONS, REVOCABLE_PERMISSIONS, hasPermission, isStaffRole } from '@/lib/staffRoles.mjs'
import { getStoredSession } from '@/lib/authCookies';
import { performLogout } from '@/lib/clientLogout';

// Lookup lists (populated from DB where available)
// Defaults provided as fallbacks
const SUPPORTED_USER_TYPES = ['tourist', 'business', 'tourism_officer', 'moderator', 'admin'];
const DEFAULT_USER_STATUSES = ['active', 'pending', 'suspended', 'banned', 'pending_deletion'];
const PERMISSION_LABELS = {
  'media.use': 'Upload to the media library',
  'content.notify': 'Notify followers about new content',
  'tourism.manage': 'Manage places and events',
  'alerts.broadcast': 'Send real-time alerts',
  'announcements.manage': 'Publish official announcements',
  'feedback.manage': 'Answer feedback, inquiries and reviews',
  'analytics.view': 'View analytics and exports',
  'moderation.manage': 'Moderate content and users',
  'forum.manage': 'Manage forum topics and categories',
  'users.view': 'View the user list',
};
const OVERRIDE_ROLES = ['tourism_officer', 'moderator'];
const EMPTY_OVERRIDES = { grant: [], revoke: [] };
const DEFAULT_POST_STATUSES = ['pending', 'approved', 'rejected', 'flagged'];
const formatStatusLabel = (status) => String(status)
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ManageUsersPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [userTypes] = useState(SUPPORTED_USER_TYPES);
  const [userStatuses, setUserStatuses] = useState(DEFAULT_USER_STATUSES);
  const [postStatuses, setPostStatuses] = useState(DEFAULT_POST_STATUSES);
  const [stats, setStats] = useState({ total: 0, tourists: 0, businesses: 0, moderators: 0, staff: 0, active: 0, suspended: 0, pending: 0 });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at_desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 10;

  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  // User Activity View
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityTab, setActivityTab] = useState('posts'); // posts, comments, hearts
  const [userPosts, setUserPosts] = useState([]);
  const [userComments, setUserComments] = useState([]);
  const [userHearts, setUserHearts] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [moderationNotes, setModerationNotes] = useState('');
  const [showModerateModal, setShowModerateModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);

  // User form
  const [userForm, setUserForm] = useState({
    full_name: '', email: '', password: '', user_type: 'tourist', status: 'active', points: 0, permissions: EMPTY_OVERRIDES
  });

  const [pointsAdjust, setPointsAdjust] = useState({ amount: '', reason: '', mode: 'add' });
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const computeStats = (data) => {
    setStats({
      total: data.length,
      tourists: data.filter(u => u.user_type === 'tourist').length,
      businesses: data.filter(u => u.user_type === 'business').length,
      moderators: data.filter(u => u.user_type === 'moderator').length,
      staff: data.filter(u => isStaffRole(u.user_type)).length,
      active: data.filter(u => u.status === 'active').length,
      suspended: data.filter(u => u.status === 'suspended').length,
      pending: data.filter(u => u.status === 'pending').length,
    });
  };

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/info/api/admin/users');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load users');
      // Show every account except the signed-in staff member's own, so an
      // administrator can manage other staff (tourism officers, moderators, admins).
      const currentUserId = (() => {
        try {
          const stored = JSON.parse(getStoredSession() || '{}');
          return stored.user_id || stored.id || null;
        } catch { return null; }
      })();
      const users = (data.users || []).filter((user) => user.id !== currentUserId);
      setUsers(users);
      computeStats(users);
    } catch (err) {
      showToast('Failed to load users: ' + err.message, true);
    }
  }, [showToast]);

  // ─── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) { router.push('/info/login'); return; }
      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) { router.push('/info/admin/dashboard'); return; }
      setAdminUser(userData);
      await fetchUsers();
      setLoading(false);
    };
    checkAuth();
  }, [fetchUsers, router]);

  // Populate lookup lists from DB where possible
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [{ data: statusesData }, { data: postsData }] = await Promise.all([
          supabase.from('info_users').select('status'),
          supabase.from('info_user_posts').select('status')
        ]);

        const statuses = (statusesData || []).map(r => r.status).filter(Boolean);
        setUserStatuses(Array.from(new Set([...DEFAULT_USER_STATUSES, ...statuses])));

        const postStats = Array.from(new Set((postsData || []).map(r => r.status).filter(Boolean)));
        if (postStats.length) setPostStatuses(postStats);
      } catch (e) {
        console.error('Error loading user lookups:', e);
      }
    };
    fetchLookups();
  }, []);

  // ─── Fetch User Activity Data ─────────────────────────────────────────────
  const fetchUserPosts = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('info_user_posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUserPosts(data || []);
    } catch (err) {
      showToast('Failed to load posts: ' + err.message, true);
    }
  };

  const fetchUserComments = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('content_comments')
        .select('id, content_type, content_id, body, parent_id, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const enrichedComments = await enrichActivityTargets(data || []);
      setUserComments(enrichedComments);
    } catch (err) {
      showToast('Failed to load comments: ' + err.message, true);
    }
  };

  const fetchUserHearts = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('content_reactions')
        .select('id, content_type, content_id, reaction_type, created_at')
        .eq('user_id', userId)
        .eq('reaction_type', 'love')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const enrichedHearts = await enrichActivityTargets(data || []);
      setUserHearts(enrichedHearts);
    } catch (err) {
      showToast('Failed to load hearts: ' + err.message, true);
    }
  };

  const enrichActivityTargets = async (rows) => {
    const targetTables = {
      blog: ['info_blogs', 'title'],
      event: ['info_events', 'title'],
      announcement: ['info_announcements', 'title'],
      forum_thread: ['forum_threads', 'title'],
      forum_reply: ['forum_replies', 'content'],
      user_post: ['info_user_posts', 'title'],
      post: ['info_user_posts', 'title'],
      tourist_spot: ['info_tourist_spots', 'name'],
      comment: ['content_comments', 'body'],
    };
    const targetsByType = new Map();

    for (const row of rows) {
      const [table, labelColumn] = targetTables[row.content_type] || [];
      if (!table) continue;
      const key = `${table}:${labelColumn}`;
      const target = targetsByType.get(key) || { table, labelColumn, ids: new Set() };
      target.ids.add(row.content_id);
      targetsByType.set(key, target);
    }

    const targetLabels = new Map();
    await Promise.all([...targetsByType.entries()].map(async ([key, target]) => {
      const { data, error } = await supabase
        .from(target.table)
        .select(`id, ${target.labelColumn}`)
        .in('id', [...target.ids]);
      if (error) throw error;
      targetLabels.set(key, new Map((data || []).map((item) => [`${target.table}:${item.id}`, item[target.labelColumn]])));
    }));

    return rows.map((row) => {
      const [table, labelColumn] = targetTables[row.content_type] || [];
      const label = table
        ? targetLabels.get(`${table}:${labelColumn}`)?.get(`${table}:${row.content_id}`)
        : null;
      const fallbackType = String(row.content_type || 'content').replaceAll('_', ' ');
      return {
        ...row,
        target_name: label || `${fallbackType} (${String(row.content_id).slice(0, 8)})`,
      };
    });
  };

  const openActivityModal = async (user) => {
    setSelectedUser(user);
    setActivityTab('posts');
    setUserPosts([]);
    setUserComments([]);
    setUserHearts([]);
    setShowActivityModal(true);
    setLoadingActivity(true);
    
    await Promise.all([
      fetchUserPosts(user.id),
      fetchUserComments(user.id),
      fetchUserHearts(user.id)
    ]);
    
    setLoadingActivity(false);
  };

  // ─── Moderation Functions ─────────────────────────────────────────────────
  const openModerateModal = (post) => {
    setSelectedPost(post);
    setModerationNotes(post.moderation_notes || '');
    setShowModerateModal(true);
  };

  const moderatePost = async (newStatus) => {
    if (!selectedPost) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('info_user_posts')
        .update({
          status: newStatus,
          moderated_by: adminUser?.id,
          moderated_at: new Date().toISOString(),
          moderation_notes: moderationNotes || null
        })
        .eq('id', selectedPost.id);
      
      if (error) throw error;
      
      showToast(`Post ${newStatus} successfully!`);
      setShowModerateModal(false);
      setSelectedPost(null);
      setModerationNotes('');
      
      await fetchUserPosts(selectedUser.id);
    } catch (err) {
      showToast('Failed to moderate post: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const deleteUserComment = async (commentId) => {
    if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) return;
    
    try {
      const response = await fetch('/info/api/admin/moderation/user-content', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'comment', contentId: commentId, userId: selectedUser.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete comment.')

      const warning = [result.notificationWarning, result.auditWarning].filter(Boolean).join(' ')
      showToast(warning || 'Comment deleted successfully!', Boolean(warning))
      await fetchUserComments(selectedUser.id);
    } catch (err) {
      showToast('Failed to delete comment: ' + err.message, true);
    }
  };

  const deletePost = async (postId) => {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;
    
    try {
      const response = await fetch('/info/api/admin/moderation/user-content', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'post', contentId: postId, userId: selectedUser.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete post.')

      const warning = [result.notificationWarning, result.auditWarning].filter(Boolean).join(' ')
      showToast(warning || 'Post deleted successfully!', Boolean(warning))
      await fetchUserPosts(selectedUser.id);
    } catch (err) {
      showToast('Failed to delete post: ' + err.message, true);
    }
  };

  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') result = result.filter(u => u.user_type === filterType);
    if (filterStatus !== 'all') result = result.filter(u => u.status === filterStatus);

    switch (sortBy) {
      case 'name_asc': result.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')); break;
      case 'name_desc': result.sort((a, b) => (b.full_name || '').localeCompare(a.full_name || '')); break;
      case 'points_desc': result.sort((a, b) => (b.points || 0) - (a.points || 0)); break;
      case 'created_at_asc': result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
      default: result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return result;
  }, [users, searchQuery, filterType, filterStatus, sortBy]);

  const paginatedUsers = filteredUsers.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);

  // ─── Modal helpers ─────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setSelectedUser(null);
    setUserForm({ full_name: '', email: '', password: '', user_type: 'tourist', status: 'active', points: 0, permissions: EMPTY_OVERRIDES });
    setShowUserModal(true);
  };

  const openEditModal = (u) => {
    setSelectedUser(u);
    setUserForm({
      full_name: u.full_name || '', email: u.email || '', password: '', user_type: u.user_type,
      status: u.status || 'active', points: u.points || 0,
      permissions: u.permission_overrides || EMPTY_OVERRIDES,
    });
    setShowUserModal(true);
  };

  const openDeleteModal = (u) => { setSelectedUser(u); setShowDeleteModal(true); };
  const openPointsModal = (u) => {
    setSelectedUser(u);
    setPointsAdjust({ amount: '', reason: '', mode: 'add' });
    setShowPointsModal(true);
  };

  const closeAllModals = () => {
    setShowUserModal(false);
    setShowDeleteModal(false);
    setShowPointsModal(false);
    setShowActivityModal(false);
    setShowModerateModal(false);
    setSelectedUser(null);
    setSelectedPost(null);
  };

  // ─── Save user ─────────────────────────────────────────────────────────────
  const saveUser = async () => {
    if (!userForm.full_name.trim()) { showToast('Full name is required', true); return; }
    if (!userForm.email.trim()) { showToast('Email is required', true); return; }
    if (!selectedUser && !userForm.password.trim()) { showToast('Password is required for new users', true); return; }

    setSaving(true);
    try {
      // Accounts, roles and passwords go through the admin API so that the
      // password is hashed by Supabase Auth (never stored in info_users) and
      // role changes are audited and force a fresh sign-in.
      const callUsersApi = async (method, body) => {
        const response = await fetch('/info/api/admin/users', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
        return result;
      };

      const password = userForm.password.trim();
      let resultMessage = 'User updated successfully!';

      if (!selectedUser) {
        const result = await callUsersApi('POST', {
          full_name: userForm.full_name.trim(),
          email: userForm.email.trim(),
          password,
          role: userForm.user_type,
        });
        resultMessage = result.message || 'User created successfully!';
      } else {
        // One audited server call: name/email (also the sign-in email),
        // status, points, role, password and custom permissions.
        const roleChanged = userForm.user_type !== selectedUser.user_type;
        const result = await callUsersApi('PATCH', {
          userId: selectedUser.id,
          full_name: userForm.full_name.trim(),
          email: userForm.email.trim(),
          ...(selectedUser.status === 'pending_deletion' ? {} : { status: userForm.status }),
          points: parseInt(userForm.points) || 0,
          ...(roleChanged ? { role: userForm.user_type } : {}),
          ...(password ? { password } : {}),
          ...(OVERRIDE_ROLES.includes(userForm.user_type) ? { permissions: userForm.permissions } : {}),
        });
        resultMessage = result.message || resultMessage;
      }
      showToast(resultMessage);
      closeAllModals();
      await fetchUsers();
    } catch (err) {
      showToast('Failed to save user: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete user ───────────────────────────────────────────────────────────
  const deleteUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const response = await fetch('/info/api/admin/users', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to schedule account deletion.')
      }
      const scheduledDate = formatDateTime(result.scheduledFor)
      const emailStatus = result.emailNotificationSent
        ? ' A notice was emailed to the user.'
        : ' The deletion was scheduled, but the email notice could not be delivered.'
      showToast(`"${selectedUser.full_name}" is deactivated and scheduled for deletion on ${scheduledDate}.${emailStatus}`)
      closeAllModals();
      await fetchUsers();
    } catch (err) {
      showToast('Failed to schedule account deletion: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  // ─── Quick status change ───────────────────────────────────────────────────
  const updateStatus = async (userId, newStatus) => {
    try {
      const response = await fetch('/info/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: newStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
      showToast(`Status updated to ${newStatus}`);
      await fetchUsers();
    } catch (err) {
      showToast('Failed to update status: ' + err.message, true);
    }
  };

  // ─── Points adjustment ─────────────────────────────────────────────────────
  const adjustPoints = async () => {
    if (!pointsAdjust.amount || isNaN(parseInt(pointsAdjust.amount))) { showToast('Enter a valid point amount', true); return; }
    const delta = parseInt(pointsAdjust.amount);
    const currentPoints = selectedUser?.points || 0;
    const newPoints = pointsAdjust.mode === 'add' ? currentPoints + delta : Math.max(0, currentPoints - delta);

    setSaving(true);
    try {
      const response = await fetch('/info/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, points: newPoints }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');

      if (pointsAdjust.reason.trim()) {
        await supabase.from('reward_history').insert([{
          user_id: selectedUser.id,
          subsystem_source: 'admin_adjustment',
          points_earned: pointsAdjust.mode === 'add' ? delta : -delta,
          description: pointsAdjust.reason,
        }]);
      }

      showToast(`Points ${pointsAdjust.mode === 'add' ? 'added' : 'deducted'} successfully!`);
      closeAllModals();
      await fetchUsers();
    } catch (err) {
      showToast('Failed to adjust points: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const exportUsersToCSV = () => {
    const rows = [
      ['Name', 'Email', 'Type', 'Status', 'Points', 'Joined', 'Last Login'],
      ...filteredUsers.map((user) => [
        user.full_name || '',
        user.email || '',
        user.user_type || '',
        user.status || '',
        String(user.points || 0),
        user.created_at || '',
        user.last_login || '',
      ])
    ];

    const csvContent = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daet_users_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('User export downloaded.');
  };

  const handleLogout = async () => {
    await performLogout();
    router.push('/info/login');
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const getTypeBadge = (type) => {
    const map = {
      tourist: 'bg-blue-100 text-blue-800',
      business: 'bg-yellow-100 text-yellow-800',
      admin: 'bg-red-100 text-red-800',
      tourism_officer: 'bg-emerald-100 text-emerald-800',
      moderator: 'bg-purple-100 text-purple-800',
    };
    return map[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status) => {
    const map = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-600',
      suspended: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      pending_deletion: 'bg-orange-100 text-orange-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const getPostStatusBadge = (status) => {
    const map = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      flagged: 'bg-orange-100 text-orange-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusDot = (status) => {
    const map = { active: 'bg-green-500', inactive: 'bg-gray-400', suspended: 'bg-red-500', pending: 'bg-yellow-400', pending_deletion: 'bg-orange-500' };
    return map[status] || 'bg-gray-400';
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <AdminSidebar user={adminUser} roleLabel="Administrator" onLogout={handleLogout} />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">

        <AdminPageHeader
          eyebrow="Community"
          title="Manage users"
          description="View, create, and manage all registered users, their roles, and the content they publish."
          icon="users"
          actions={
            <>
              <AdminButton icon="downloads" onClick={exportUsersToCSV}>Export CSV</AdminButton>
              <AdminButton variant="primary" icon="plus" onClick={openCreateModal}>Add new user</AdminButton>
            </>
          }
        />

        {/* Stats Cards */}
        <AdminStatGrid>
          <AdminStatCard label="Total users" value={stats.total} icon="users" tone="brand" meta="All accounts" />
          <AdminStatCard label="Tourists" value={stats.tourists} icon="profile" tone="info" />
          <AdminStatCard label="Businesses" value={stats.businesses} icon="edit" tone="warning" />
          <AdminStatCard label="Moderators" value={stats.moderators} icon="users" tone="violet" />
          <AdminStatCard label="Staff accounts" value={stats.staff} icon="users" tone="violet" meta="Administrators and municipal staff" />
          <AdminStatCard label="Active" value={stats.active} icon="check" tone="success" />
          <AdminStatCard label="Suspended" value={stats.suspended} icon="warning" tone="danger" />
          <AdminStatCard label="Pending" value={stats.pending} icon="arrow" tone="neutral" />
        </AdminStatGrid>

        {/* Filters */}
        <div className="admin-panel mb-4">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
              />
            </div>

            <select
              value={filterType}
              onChange={e => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Types</option>
              {userTypes.map(t => <option key={t} value={t}>{String(t).charAt(0).toUpperCase() + String(t).slice(1)}</option>)}
            </select>

            <select
              value={filterStatus}
              onChange={e => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Statuses</option>
              {userStatuses.map(s => <option key={s} value={s}>{formatStatusLabel(s)}</option>)}
            </select>

            <select
              value={sortBy}
              onChange={e => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="created_at_desc">Newest First</option>
              <option value="created_at_asc">Oldest First</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="points_desc">Most Points</option>
            </select>

            <span className="text-xs text-gray-400 ml-auto">
              {filteredUsers.length} of {users.length} users
            </span>
          </div>
        </div>

        {/* Users Table */}
        <div className="admin-panel mb-4">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="admin-table-actions-header px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-gray-400">
                      <Icon name="profile" className="w-10 h-10 block mb-2" />
                      <p className="text-sm">No users found matching your filters.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <AdminAvatar user={u} />
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{u.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium capitalize ${getTypeBadge(u.user_type)}`}>
                          {String(u.user_type || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(u.status)}`}></span>
                          {u.status === 'pending_deletion' ? (
                            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${getStatusBadge(u.status)}`}>
                              Deletion scheduled
                            </span>
                          ) : (
                            <select
                              value={u.status || 'active'}
                              onChange={e => updateStatus(u.id, e.target.value)}
                              className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${getStatusBadge(u.status)}`}
                            >
                              {userStatuses.filter(s => s !== 'pending_deletion').map(s => (
                                <option key={s} value={s}>{formatStatusLabel(s)}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        {u.status === 'pending_deletion' && u.deletion_scheduled_for ? (
                          <p className="mt-1 text-[11px] text-orange-700">
                            Permanently deleted after {formatDateTime(u.deletion_scheduled_for)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-current text-yellow-500" aria-hidden="true" />
                          <span className="text-sm font-semibold text-gray-700">{(u.points || 0).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.last_login ? formatDate(u.last_login) : <span className="text-gray-300">Never</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openActivityModal(u)}
                            title="View Activity (Posts, Feedback, Ratings)"
                            className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600 transition-colors text-sm"
                          ><ClipboardList className="h-4 w-4" aria-hidden="true" /></button>
                          <button
                            onClick={() => openPointsModal(u)}
                            title="Adjust Points"
                            className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors text-sm"
                          ><Star className="h-4 w-4" aria-hidden="true" /></button>
                          <button
                            onClick={() => openEditModal(u)}
                            title="Edit User"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors text-sm"
                          ><Icon name="edit" className="w-4 h-4" /></button>
                          {u.status !== 'pending_deletion' && !['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(u.user_type).toLowerCase()) ? (
                            <button
                              onClick={() => openDeleteModal(u)}
                              title="Schedule account deletion"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors text-sm"
                            ><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AdminPagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={filteredUsers.length}
          pageSize={USERS_PER_PAGE}
          itemLabel="users"
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Activity Modal */}
      {showActivityModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-2xl">
                  <span className="text-2xl">📋</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">User Activity</h3>
                  <p className="text-xs text-gray-500">{selectedUser.full_name} · {selectedUser.email}</p>
                </div>
              </div>
              <button onClick={closeAllModals} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="flex border-b border-gray-200 px-5 flex-shrink-0">
              {[
                { id: 'posts', label: 'Posts', icon: 'edit', count: userPosts.length },
                { id: 'comments', label: 'Comments', icon: 'feedback', count: userComments.length },
                { id: 'hearts', label: 'Hearts', count: userHearts.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActivityTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 ${
                    activityTab === tab.id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.id === 'hearts'
                    ? <Heart className="h-4 w-4" aria-hidden="true" />
                    : <Icon name={tab.icon} className="h-4 w-4" />}
                  <span>{tab.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activityTab === tab.id ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loadingActivity ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="mt-3 text-gray-500 text-sm">Loading activity...</p>
                </div>
              ) : (
                <>
                  {activityTab === 'posts' && (
                    <div className="space-y-4">
                      {userPosts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <Icon name="edit" className="w-10 h-10 block mb-2" />
                          <p className="text-sm">No posts from this user.</p>
                        </div>
                      ) : (
                        userPosts.map(post => (
                          <div key={post.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800">{post.title}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${getPostStatusBadge(post.status)}`}>
                                  {post.status}
                                </span>
                                <span className="text-xs text-gray-400">{post.post_type}</span>
                              </div>
                              <div className="flex gap-1">
                                {post.status !== 'approved' && post.status !== 'rejected' && (
                                  <button
                                    onClick={() => openModerateModal(post)}
                                    className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600 text-sm"
                                    title="Moderate"
                                  >⚖️</button>
                                )}
                                <button
                                  onClick={() => deletePost(post.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 text-sm"
                                  title="Delete"
                                >🗑️</button>
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 mt-2 line-clamp-3">{post.content}</p>
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                              <span>❤️ {post.likes || 0} likes</span>
                              <span><Icon name="feedback" className="w-4 h-4 inline-block mr-1" />{post.comments_count || 0} comments</span>
                              <span><Icon name="events" className="w-4 h-4 inline-block mr-1" />{formatDateTime(post.created_at)}</span>
                              {post.location && <span><Icon name="attractions" className="w-4 h-4 inline-block mr-1" />{post.location}</span>}
                            </div>
                            {post.moderation_notes && (
                              <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-gray-500">
                                <span className="font-medium">Moderation notes:</span> {post.moderation_notes}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activityTab === 'comments' && (
                    <div className="space-y-4">
                      {userComments.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <Icon name="feedback" className="w-10 h-10 block mb-2" />
                          <p className="text-sm">No comments from this user.</p>
                        </div>
                      ) : (
                        userComments.map(comment => (
                          <div key={comment.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                    {String(comment.content_type || 'content').replaceAll('_', ' ')}
                                  </span>
                                  <span className="text-sm font-medium text-gray-700">
                                    on: {comment.target_name}
                                  </span>
                                  {comment.status && <span className="text-xs text-gray-400">{comment.status}</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => deleteUserComment(comment.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 text-sm"
                                title="Delete Comment"
                                aria-label="Delete comment"
                              >🗑️</button>
                            </div>
                            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{comment.body}</p>
                            {comment.parent_id && <p className="mt-2 text-xs text-gray-400">Reply to a comment</p>}
                            <p className="text-xs text-gray-400 mt-2"><Icon name="events" className="w-3 h-3 inline-block mr-1" />{formatDateTime(comment.created_at)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activityTab === 'hearts' && (
                    <div className="space-y-4">
                      {userHearts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <Heart className="w-10 h-10 block mb-2 mx-auto" />
                          <p className="text-sm">No hearts from this user.</p>
                        </div>
                      ) : (
                        userHearts.map(heart => (
                          <div key={heart.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-2">
                              <Heart className="h-4 w-4 fill-current text-rose-500" aria-hidden="true" />
                              <span className="text-sm font-medium text-gray-700">Hearted {heart.content_type.replaceAll('_', ' ')}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">{heart.target_name}</p>
                            <p className="text-xs text-gray-400 mt-2"><Icon name="events" className="w-3 h-3 inline-block mr-1" />{formatDateTime(heart.created_at)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end flex-shrink-0">
              <button onClick={closeAllModals} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Modal */}
      {showModerateModal && selectedPost && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="bg-purple-100 p-3 rounded-2xl">
                <span className="text-2xl">⚖️</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Moderate Post</h3>
                <p className="text-xs text-gray-500">Review and take action on this content</p>
              </div>
              <button onClick={() => setShowModerateModal(false)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <p className="text-sm font-medium text-gray-700 mb-1">{selectedPost.title}</p>
              <p className="text-sm text-gray-600 line-clamp-4">{selectedPost.content}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moderation Notes</label>
              <textarea
                value={moderationNotes}
                onChange={e => setModerationNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none text-gray-800"
                rows="3"
                placeholder="Explain your decision (optional but recommended)"
              />
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowModerateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => moderatePost('approved')}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-full text-sm hover:bg-green-600 disabled:opacity-50"
              >
                <Icon name="check" className="w-4 h-4 inline-block mr-1" /> Approve
              </button>
              <button
                onClick={() => moderatePost('rejected')}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 disabled:opacity-50"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="bg-blue-100 p-3 rounded-2xl">
                <span className="text-2xl">{selectedUser ? <Icon name="edit" className="w-6 h-6" /> : <Icon name="plus" className="w-6 h-6" />}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">{selectedUser ? 'Edit User' : 'Add New User'}</h3>
                <p className="text-xs text-gray-500">{selectedUser ? 'Update user profile details' : 'Create a new user account'}</p>
              </div>
              <button onClick={closeAllModals} className="ml-auto text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={userForm.full_name}
                  onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  placeholder="Juan dela Cruz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  placeholder="juan@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {selectedUser && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
                  {!selectedUser && <span className="text-red-500"> *</span>}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  placeholder={selectedUser ? '••••••••' : 'Minimum 8 characters'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                  <select
                    value={userForm.user_type}
                    onChange={e => setUserForm(p => ({ ...p, user_type: e.target.value }))}
                    disabled={!isSuperAdmin(adminUser?.role)}
                    title={isSuperAdmin(adminUser?.role) ? undefined : 'Only an administrator can change roles'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    {userTypes.map(t => <option key={t} value={t}>{getAdminRoleLabel(t) === 'Staff' ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : getAdminRoleLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={userForm.status}
                    onChange={e => setUserForm(p => ({ ...p, status: e.target.value }))}
                    disabled={selectedUser?.status === 'pending_deletion'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800 bg-white"
                  >
                    {userStatuses.filter(s => s !== 'pending_deletion' || selectedUser?.status === 'pending_deletion').map(s => <option key={s} value={s}>{formatStatusLabel(s)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Starting Points</label>
                <input
                  type="number"
                  value={userForm.points}
                  onChange={e => setUserForm(p => ({ ...p, points: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  min="0"
                  placeholder="0"
                />
              </div>

              {selectedUser && OVERRIDE_ROLES.includes(userForm.user_type) && isSuperAdmin(adminUser?.role) && (
                <fieldset className="rounded-2xl border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-gray-700">Permissions</legend>
                  <p className="mb-2 text-xs text-gray-500">Ticked boxes follow the {getAdminRoleLabel(userForm.user_type)} role by default. Changes apply at the user&apos;s next sign-in. User management and system settings stay administrator-only.</p>
                  <div className="space-y-1.5">
                    {Object.entries(PERMISSION_LABELS).map(([permission, label]) => {
                      const fromRole = hasPermission(userForm.user_type, permission);
                      const granted = userForm.permissions.grant.includes(permission);
                      const revoked = userForm.permissions.revoke.includes(permission);
                      const checked = granted || (fromRole && !revoked);
                      const canToggle = checked ? REVOCABLE_PERMISSIONS.includes(permission) : GRANTABLE_PERMISSIONS.includes(permission);
                      return (
                        <label key={permission} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canToggle}
                            onChange={(event) => setUserForm((current) => {
                              const grant = current.permissions.grant.filter((item) => item !== permission);
                              const revoke = current.permissions.revoke.filter((item) => item !== permission);
                              if (event.target.checked && !fromRole) grant.push(permission);
                              if (!event.target.checked && fromRole) revoke.push(permission);
                              return { ...current, permissions: { grant, revoke } };
                            })}
                          />
                          <span>{label}</span>
                          {granted ? <span className="rounded-full bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700">added</span> : null}
                          {revoked ? <span className="rounded-full bg-red-50 px-2 text-[10px] font-semibold text-red-700">removed</span> : null}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeAllModals} className="px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveUser} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : selectedUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="text-center mb-5">
              <div className="bg-red-100 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-800">Schedule Account Deletion?</h3>
              <p className="text-sm text-gray-500 mt-2">
                <strong className="text-gray-700">{selectedUser.full_name || selectedUser.email}</strong> will lose access immediately. Their account and associated content will be permanently deleted after a 15-day grace period. They can restore the account before the scheduled deletion date.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={closeAllModals} className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={deleteUser} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Scheduling...' : 'Schedule Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Points Adjustment Modal */}
      {showPointsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="bg-yellow-100 p-3 rounded-2xl">
                <span className="text-2xl">⭐</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Adjust Points</h3>
                <p className="text-xs text-gray-500">{selectedUser.full_name} · Current: <strong>{(selectedUser.points || 0).toLocaleString()} pts</strong></p>
              </div>
              <button onClick={closeAllModals} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4">
              <div className="flex rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setPointsAdjust(p => ({ ...p, mode: 'add' }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${pointsAdjust.mode === 'add' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >Add Points</button>
                <button
                  onClick={() => setPointsAdjust(p => ({ ...p, mode: 'deduct' }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${pointsAdjust.mode === 'deduct' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >Deduct Points</button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  value={pointsAdjust.amount}
                  onChange={e => setPointsAdjust(p => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  min="1"
                  placeholder="e.g. 50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={pointsAdjust.reason}
                  onChange={e => setPointsAdjust(p => ({ ...p, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800"
                  placeholder="e.g. Special recognition"
                />
              </div>

              {pointsAdjust.amount && !isNaN(parseInt(pointsAdjust.amount)) && (
                <div className="bg-gray-50 rounded-2xl p-3 text-sm text-center">
                  <span className="text-gray-500">New balance: </span>
                  <span className="font-bold text-gray-800">
                    {pointsAdjust.mode === 'add'
                      ? ((selectedUser.points || 0) + parseInt(pointsAdjust.amount)).toLocaleString()
                      : Math.max(0, (selectedUser.points || 0) - parseInt(pointsAdjust.amount)).toLocaleString()
                    } pts
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeAllModals} className="px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={adjustPoints}
                disabled={saving}
                className={`px-5 py-2 text-white rounded-full text-sm disabled:opacity-50 ${pointsAdjust.mode === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {saving ? 'Saving...' : pointsAdjust.mode === 'add' ? 'Add Points' : 'Deduct Points'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div role={toastMessage.isError ? 'alert' : 'status'} aria-live={toastMessage.isError ? 'assertive' : 'polite'} className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          <span className="inline-block mr-2">{toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}</span> {toastMessage.message}
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .line-clamp-3 {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .line-clamp-4 {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
