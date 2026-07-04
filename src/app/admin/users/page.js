// app/admin/users/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const USER_TYPES = ['tourist', 'artisan', 'operator'];
const USER_STATUSES = ['active', 'inactive', 'suspended', 'pending'];

// Post statuses for moderation
const POST_STATUSES = ['pending', 'approved', 'rejected', 'flagged'];

export default function ManageUsersPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, tourists: 0, artisans: 0, operators: 0, active: 0, suspended: 0, pending: 0 });

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
  const [activityTab, setActivityTab] = useState('posts'); // posts, feedback, ratings
  const [userPosts, setUserPosts] = useState([]);
  const [userFeedback, setUserFeedback] = useState([]);
  const [userRatings, setUserRatings] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [moderationNotes, setModerationNotes] = useState('');
  const [showModerateModal, setShowModerateModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);

  // User form
  const [userForm, setUserForm] = useState({
    full_name: '', email: '', password: '', user_type: 'tourist', status: 'active', points: 0
  });

  const [pointsAdjust, setPointsAdjust] = useState({ amount: '', reason: '', mode: 'add' });
  const [toastMessage, setToastMessage] = useState(null);

  // ─── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) { router.push('/login'); return; }
      const userData = JSON.parse(session);
      if (userData.role !== 'admin') { router.push('/dashboard'); return; }
      setAdminUser(userData);
      await fetchUsers();
      setLoading(false);
    };
    checkAuth();
  }, []);

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load users');
      const users = (data.users || []).filter((user) => user.user_type !== 'admin');
      setUsers(users);
      computeStats(users);
    } catch (err) {
      showToast('Failed to load users: ' + err.message, true);
    }
  };

  const computeStats = (data) => {
    setStats({
      total: data.length,
      tourists: data.filter(u => u.user_type === 'tourist').length,
      artisans: data.filter(u => u.user_type === 'artisan').length,
      operators: data.filter(u => u.user_type === 'operator').length,
      active: data.filter(u => u.status === 'active').length,
      suspended: data.filter(u => u.status === 'suspended').length,
      pending: data.filter(u => u.status === 'pending').length,
    });
  };

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

  const fetchUserFeedback = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('info_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Enrich feedback with target names
      const enrichedFeedback = await Promise.all((data || []).map(async (fb) => {
        let targetName = fb.target_id;
        let targetTable = '';
        
        switch (fb.target_type) {
          case 'event':
            targetTable = 'info_events';
            break;
          case 'spot':
            targetTable = 'info_tourist_spots';
            break;
          case 'amenity':
            targetTable = 'info_amenities';
            break;
          case 'blog':
            targetTable = 'info_blogs';
            break;
        }
        
        if (targetTable) {
          const { data: targetData } = await supabase
            .from(targetTable)
            .select('name, title')
            .eq('id', fb.target_id)
            .single();
          
          if (targetData) {
            targetName = targetData.name || targetData.title || fb.target_id;
          }
        }
        
        return { ...fb, target_name: targetName };
      }));
      
      setUserFeedback(enrichedFeedback);
    } catch (err) {
      showToast('Failed to load feedback: ' + err.message, true);
    }
  };

  const fetchUserRatings = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('info_feedback')
        .select('*')
        .eq('user_id', userId)
        .not('rating', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const enrichedRatings = await Promise.all((data || []).map(async (fb) => {
        let targetName = fb.target_id;
        let targetTable = '';
        
        switch (fb.target_type) {
          case 'event':
            targetTable = 'info_events';
            break;
          case 'spot':
            targetTable = 'info_tourist_spots';
            break;
          case 'amenity':
            targetTable = 'info_amenities';
            break;
          case 'blog':
            targetTable = 'info_blogs';
            break;
        }
        
        if (targetTable) {
          const { data: targetData } = await supabase
            .from(targetTable)
            .select('name, title')
            .eq('id', fb.target_id)
            .single();
          
          if (targetData) {
            targetName = targetData.name || targetData.title || fb.target_id;
          }
        }
        
        return { ...fb, target_name: targetName };
      }));
      
      setUserRatings(enrichedRatings);
    } catch (err) {
      showToast('Failed to load ratings: ' + err.message, true);
    }
  };

  const openActivityModal = async (user) => {
    setSelectedUser(user);
    setActivityTab('posts');
    setShowActivityModal(true);
    setLoadingActivity(true);
    
    await Promise.all([
      fetchUserPosts(user.id),
      fetchUserFeedback(user.id),
      fetchUserRatings(user.id)
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

  const deleteFeedback = async (feedbackId) => {
    if (!confirm('Are you sure you want to delete this feedback/rating?')) return;
    
    try {
      const { error } = await supabase
        .from('info_feedback')
        .delete()
        .eq('id', feedbackId);
      
      if (error) throw error;
      
      showToast('Feedback deleted successfully!');
      await fetchUserFeedback(selectedUser.id);
      await fetchUserRatings(selectedUser.id);
    } catch (err) {
      showToast('Failed to delete feedback: ' + err.message, true);
    }
  };

  const deletePost = async (postId) => {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return;
    
    try {
      const { error } = await supabase
        .from('info_user_posts')
        .delete()
        .eq('id', postId);
      
      if (error) throw error;
      
      showToast('Post deleted successfully!');
      await fetchUserPosts(selectedUser.id);
    } catch (err) {
      showToast('Failed to delete post: ' + err.message, true);
    }
  };

  // ─── Filter + Sort ─────────────────────────────────────────────────────────
  useEffect(() => {
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

    setFilteredUsers(result);
    setCurrentPage(1);
  }, [users, searchQuery, filterType, filterStatus, sortBy]);

  const paginatedUsers = filteredUsers.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ─── Modal helpers ─────────────────────────────────────────────────────────
  const openCreateModal = () => {
    setSelectedUser(null);
    setUserForm({ full_name: '', email: '', password: '', user_type: 'tourist', status: 'active', points: 0 });
    setShowUserModal(true);
  };

  const openEditModal = (u) => {
    setSelectedUser(u);
    setUserForm({ full_name: u.full_name || '', email: u.email || '', password: '', user_type: u.user_type, status: u.status || 'active', points: u.points || 0 });
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
      const payload = {
        full_name: userForm.full_name.trim(),
        email: userForm.email.trim(),
        user_type: userForm.user_type,
        status: userForm.status,
        points: parseInt(userForm.points) || 0,
        updated_at: new Date().toISOString(),
      };
      if (userForm.password.trim()) payload.password = userForm.password.trim();

      let error;
      if (selectedUser) {
        ({ error } = await supabase.from('info_users').update(payload).eq('id', selectedUser.id));
      } else {
        ({ error } = await supabase.from('info_users').insert([{ ...payload, created_at: new Date().toISOString() }]));
      }
      if (error) throw error;
      showToast(selectedUser ? 'User updated successfully!' : 'User created successfully!');
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
      const { error } = await supabase.from('info_users').delete().eq('id', selectedUser.id);
      if (error) throw error;
      showToast(`"${selectedUser.full_name}" has been removed.`);
      closeAllModals();
      await fetchUsers();
    } catch (err) {
      showToast('Failed to delete user: ' + err.message, true);
    } finally {
      setSaving(false);
    }
  };

  // ─── Quick status change ───────────────────────────────────────────────────
  const updateStatus = async (userId, newStatus) => {
    try {
      const { error } = await supabase.from('info_users').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
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
      const { error } = await supabase.from('info_users').update({ points: newPoints, updated_at: new Date().toISOString() }).eq('id', selectedUser.id);
      if (error) throw error;

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

  const handleLogout = async () => {
    sessionStorage.removeItem('user_session');
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const getTypeBadge = (type) => {
    const map = {
      tourist: 'bg-blue-100 text-blue-800',
      artisan: 'bg-yellow-100 text-yellow-800',
      operator: 'bg-purple-100 text-purple-800',
    };
    return map[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status) => {
    const map = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-600',
      suspended: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
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
    const map = { active: 'bg-green-500', inactive: 'bg-gray-400', suspended: 'bg-red-500', pending: 'bg-yellow-400' };
    return map[status] || 'bg-gray-400';
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <span key={star} className={star <= rating ? 'text-yellow-400' : 'text-gray-300'}>
            ★
          </span>
        ))}
        <span className="text-xs text-gray-500 ml-1">({rating})</span>
      </div>
    );
  };

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

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-20 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm">
              <span className="text-xl">🗺️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 tracking-wide">DAET·TOURISM</h1>
              <p className="text-xs text-gray-500">Administrator Console</p>
            </div>
          </div>
          <div className="mt-4 pt-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {adminUser?.user_name || adminUser?.full_name || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">System Administrator</p>
          </div>
        </div>
        <nav className="mt-4 px-3">
          <Link href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📊</span>
            <span className="font-medium text-gray-700">Dashboard</span>
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-700 mb-1">
            <span className="text-xl">👥</span>
            <span className="font-medium text-blue-700">Manage Users</span>
          </Link>
          <Link href="/admin/events" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📅</span>
            <span className="font-medium text-gray-700">Events & Activities</span>
          </Link>
          <Link href="/admin/moderation" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">⏳</span>
            <span className="font-medium text-gray-700">Moderation</span>
          </Link>
          <Link href="/admin/announcement" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📢</span>
            <span className="font-medium text-gray-700">Announcement</span>
          </Link>
          <Link href="/admin/tourist-spots" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">🗺️</span>
            <span className="font-medium text-gray-700">Tourist Spots</span>
          </Link>
          <Link href="/admin/blog" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📝</span>
            <span className="font-medium text-gray-700">Blog & News</span>
          </Link>
          <Link href="/admin/amenities" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">🏨</span>
            <span className="font-medium text-gray-700">Amenities</span>
          </Link>
          <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">⚙️</span>
            <span className="font-medium text-gray-700">Settings</span>
          </Link>
        </nav>
        <button onClick={handleLogout} className="absolute bottom-5 left-5 right-5 bg-red-50 hover:bg-red-100 text-red-700 py-2.5 rounded-full transition-all duration-200 flex items-center justify-center gap-2">
          <span>🚪</span><span>Logout</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manage Users</h1>
            <p className="text-gray-500 text-sm mt-1">View, create, and manage all registered users and their content</p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full flex items-center gap-2 shadow-sm transition-all duration-200"
          >
            <span>➕</span>
            <span className="text-sm font-medium">Add New User</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[
            { label: 'Total Users', value: stats.total, color: 'text-blue-600', bg: 'bg-blue-50', icon: '👥' },
            { label: 'Tourists', value: stats.tourists, color: 'text-blue-500', bg: 'bg-blue-50', icon: '🧳' },
            { label: 'Artisans', value: stats.artisans, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '🎨' },
            { label: 'Operators', value: stats.operators, color: 'text-purple-600', bg: 'bg-purple-50', icon: '🏢' },
            { label: 'Active', value: stats.active, color: 'text-green-600', bg: 'bg-green-50', icon: '✅' },
            { label: 'Suspended', value: stats.suspended, color: 'text-red-600', bg: 'bg-red-50', icon: '🚫' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '⏳' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
              <div className={`${s.bg} w-8 h-8 rounded-xl flex items-center justify-center text-sm mb-2`}>{s.icon}</div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
              />
            </div>

            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Types</option>
              {USER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Statuses</option>
              {USER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="created_at_desc">Newest First</option>
              <option value="created_at_asc">Oldest First</option>
              <option value="name_asc">Name A→Z</option>
              <option value="name_desc">Name Z→A</option>
              <option value="points_desc">Most Points</option>
            </select>

            <span className="text-xs text-gray-400 ml-auto">
              {filteredUsers.length} of {users.length} users
            </span>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-gray-400">
                      <span className="text-4xl block mb-2">👤</span>
                      <p className="text-sm">No users found matching your filters.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{u.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium capitalize ${getTypeBadge(u.user_type)}`}>
                          {u.user_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(u.status)}`}></span>
                          <select
                            value={u.status || 'active'}
                            onChange={e => updateStatus(u.id, e.target.value)}
                            className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${getStatusBadge(u.status)}`}
                          >
                            {USER_STATUSES.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-500 text-xs">⭐</span>
                          <span className="text-sm font-semibold text-gray-700">{(u.points || 0).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.last_login ? formatDate(u.last_login) : <span className="text-gray-300">Never</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openActivityModal(u)}
                            title="View Activity (Posts, Feedback, Ratings)"
                            className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600 transition-colors text-sm"
                          >📋</button>
                          <button
                            onClick={() => openPointsModal(u)}
                            title="Adjust Points"
                            className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors text-sm"
                          >⭐</button>
                          <button
                            onClick={() => openEditModal(u)}
                            title="Edit User"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors text-sm"
                          >✏️</button>
                          <button
                            onClick={() => openDeleteModal(u)}
                            title="Delete User"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors text-sm"
                          >🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Page {currentPage} of {totalPages} · {filteredUsers.length} results
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >← Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={idx} className="px-2 py-1.5 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`px-3 py-1.5 text-xs border rounded-full transition-colors ${p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >{p}</button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >Next →</button>
            </div>
          </div>
        )}
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
                { id: 'posts', label: 'Posts', icon: '📝', count: userPosts.length },
                { id: 'feedback', label: 'Feedback', icon: '💬', count: userFeedback.length },
                { id: 'ratings', label: 'Ratings', icon: '⭐', count: userRatings.filter(r => r.rating).length }
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
                  <span>{tab.icon}</span>
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
                          <span className="text-4xl block mb-2">📝</span>
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
                              <span>💬 {post.comments_count || 0} comments</span>
                              <span>📅 {formatDateTime(post.created_at)}</span>
                              {post.location && <span>📍 {post.location}</span>}
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

                  {activityTab === 'feedback' && (
                    <div className="space-y-4">
                      {userFeedback.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <span className="text-4xl block mb-2">💬</span>
                          <p className="text-sm">No feedback from this user.</p>
                        </div>
                      ) : (
                        userFeedback.map(fb => (
                          <div key={fb.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                    {fb.target_type}
                                  </span>
                                  <span className="text-sm font-medium text-gray-700">
                                    on: {fb.target_name}
                                  </span>
                                </div>
                                {fb.rating && renderStars(fb.rating)}
                              </div>
                              <button
                                onClick={() => deleteFeedback(fb.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 text-sm"
                                title="Delete Feedback"
                              >🗑️</button>
                            </div>
                            {fb.comment && (
                              <p className="text-sm text-gray-600 mt-2">{fb.comment}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">📅 {formatDateTime(fb.created_at)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activityTab === 'ratings' && (
                    <div className="space-y-4">
                      {userRatings.filter(r => r.rating).length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <span className="text-4xl block mb-2">⭐</span>
                          <p className="text-sm">No ratings from this user.</p>
                        </div>
                      ) : (
                        userRatings.filter(r => r.rating).map(rating => (
                          <div key={rating.id} className="border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                    {rating.target_type}
                                  </span>
                                  <span className="text-sm font-medium text-gray-700">
                                    {rating.target_name}
                                  </span>
                                </div>
                                {renderStars(rating.rating)}
                              </div>
                              <button
                                onClick={() => deleteFeedback(rating.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 text-sm"
                                title="Delete Rating"
                              >🗑️</button>
                            </div>
                            {rating.comment && (
                              <p className="text-sm text-gray-600 mt-2">{rating.comment}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">📅 {formatDateTime(rating.created_at)}</p>
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
                ✅ Approve
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
                <span className="text-2xl">{selectedUser ? '✏️' : '➕'}</span>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800 bg-white"
                  >
                    {USER_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={userForm.status}
                    onChange={e => setUserForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-800 bg-white"
                  >
                    {USER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
              <h3 className="text-lg font-bold text-gray-800">Delete User?</h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to permanently delete <strong className="text-gray-700">{selectedUser.full_name || selectedUser.email}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={closeAllModals} className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={deleteUser} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Deleting...' : 'Yes, Delete'}
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
                >➕ Add Points</button>
                <button
                  onClick={() => setPointsAdjust(p => ({ ...p, mode: 'deduct' }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${pointsAdjust.mode === 'deduct' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >➖ Deduct Points</button>
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
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-full text-white text-sm z-50 shadow-lg animate-slide-in ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.isError ? '⚠️' : '✅'} {toastMessage.message}
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