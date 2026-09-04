// app/admin/announcement/page.js
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import ConfirmationModal from '@/app/components/ConfirmationModal';
import MediaUpload from '@/app/components/MediaUpload';

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Info', icon: 'notifications', color: 'blue' },
  { value: 'important', label: 'Important', icon: 'warning', color: 'yellow' },
  { value: 'urgent', label: 'Urgent', icon: 'warning', color: 'red' },
  { value: 'event', label: 'Event', icon: 'events', color: 'purple' },
  { value: 'weather', label: 'Weather', icon: 'analytics', color: 'orange' },
];

const PRIORITY_LEVELS = [
  { value: 1, label: 'Normal' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Critical' },
];

const SEVERITY_LEVELS = [
  { value: 'info', label: 'Info', color: 'blue' },
  { value: 'warning', label: 'Warning', color: 'yellow' },
  { value: 'critical', label: 'Critical', color: 'red' },
];

const TARGET_GROUPS = [
  { value: 'all', label: 'All Users' },
  { value: 'tourists', label: 'Tourists' },
  { value: 'businesses', label: 'Businesses' },
  { value: 'admins', label: 'Admins' },
];

const STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

export default function AdminAnnouncementPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    announcement_type: 'info',
    priority: 1,
    severity: 'info',
    status: 'published',
    audience: 'all',
    scheduled_for: '',
    expires_at: '',
    image_url: '',
    video_url: '',
  });

  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewAnnouncement, setPreviewAnnouncement] = useState(null);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    critical: 0,
    draft: 0,
    totalViews: 0,
    totalOpens: 0,
  });

  // File input refs
  const imageInputRef = useRef(null);

  const showToast = useCallback((message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('info_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalized = (data || []).map((announcement) => ({
        ...announcement,
        announcement_type: announcement.announcement_type || 'info',
        type: announcement.announcement_type || 'info',
        severity: announcement.severity || 'info',
        priority: announcement.priority || 1,
        scheduled_for: announcement.scheduled_for || null,
        view_count: Number(announcement.view_count || 0),
        open_count: Number(announcement.open_count || 0),
        views: Number(announcement.view_count || 0),
        opens: Number(announcement.open_count || 0),
        engagement: Number(announcement.engagement || 0),
      }));

      setAnnouncements(normalized);

      const active = normalized.filter((a) => a.status === 'published' && (!a.expires_at || new Date(a.expires_at) > new Date())).length;
      const critical = normalized.filter((a) => a.severity === 'critical' && a.status === 'published').length;
      const draft = normalized.filter((a) => a.status === 'draft').length;
      const totalViews = normalized.reduce((sum, a) => sum + Number(a.view_count || 0), 0);
      const totalOpens = normalized.reduce((sum, a) => sum + Number(a.open_count || 0), 0);

      setStats({
        total: normalized.length,
        active,
        critical,
        draft,
        totalViews,
        totalOpens,
      });
    } catch (err) {
      console.error('Error fetching announcements:', err);
      showToast('Failed to load announcements', true);
    }
  }, [showToast]);

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

        if (!isActive) return;
        setUser(userData);
        await fetchAnnouncements();
      } catch (err) {
        console.error('Error loading admin session:', err);
        if (isActive) {
          router.push('/login');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      isActive = false;
    };
  }, [fetchAnnouncements, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchAnnouncements();
    }, 30000);

    return () => clearInterval(timer);
  }, [fetchAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    let filtered = [...announcements];

    if (filterType !== 'all') {
      filtered = filtered.filter(a => a.announcement_type === filterType);
    }
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(a => a.severity === filterSeverity);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(a => a.status === filterStatus);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [announcements, filterType, filterSeverity, filterStatus, searchQuery]);

  const handleImageUpload = async (file) => {
    if (!file) return null;
    
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `announcements/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('announcements')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('announcements')
        .getPublicUrl(filePath);
      
      return publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Failed to upload image', true);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      showToast('Please enter a title', true);
      return;
    }
    if (!formData.content.trim()) {
      showToast('Please enter a message', true);
      return;
    }

    setSaving(true);

    try {
      const resolvedStatus = formData.scheduled_for && new Date(formData.scheduled_for) > new Date() ? 'draft' : formData.status;
      const announcementData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        announcement_type: formData.announcement_type,
        priority: Number(formData.priority) || 1,
        severity: formData.severity,
        status: resolvedStatus,
        audience: TARGET_GROUPS.some(t => t.value === formData.audience) ? formData.audience : 'all',
        image_url: formData.image_url || null,
        video_url: formData.video_url || null,
        created_by: user?.id,
        published_at: resolvedStatus === 'published' ? new Date().toISOString() : null,
        scheduled_for: formData.scheduled_for ? new Date(formData.scheduled_for).toISOString() : null,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      };

      let result;

      if (editingAnnouncement) {
        result = await supabase
          .from('info_announcements')
          .update(announcementData)
          .eq('id', editingAnnouncement.id);
      } else {
        result = await supabase
          .from('info_announcements')
          .insert([announcementData]);
      }

      if (result.error) throw result.error;

      showToast(editingAnnouncement ? 'Announcement updated!' : formData.scheduled_for ? 'Announcement scheduled!' : 'Announcement published!', false);
      closeModal();
      await fetchAnnouncements();

      if (resolvedStatus === 'published' && (formData.severity === 'critical' || formData.severity === 'warning')) {
        await createPushNotification();
      }
    } catch (err) {
      console.error('Save error:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const createPushNotification = async () => {
    try {
      // Would typically call an edge function or create notification records
      console.log('Push notification would be sent:', {
        title: formData.title,
        message: formData.content,
        severity: formData.severity,
      });
    } catch (err) {
      console.error('Notification error:', err);
    }
  };

  const handleDelete = async (announcement) => {
    try {
      const { error } = await supabase
        .from('info_announcements')
        .delete()
        .eq('id', announcement.id);
      
      if (error) throw error;
      
      showToast('Announcement deleted', false);
      setShowDeleteConfirm(null);
      await fetchAnnouncements();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete', true);
    }
  };

  const handleToggleStatus = async (announcement, newStatus) => {
    try {
      const { error } = await supabase
        .from('info_announcements')
        .update({ 
          status: newStatus,
          published_at: newStatus === 'published' ? new Date().toISOString() : announcement.published_at
        })
        .eq('id', announcement.id);
      
      if (error) throw error;
      
      showToast(`Announcement ${newStatus === 'published' ? 'published' : newStatus === 'archived' ? 'archived' : 'saved as draft'}`, false);
      await fetchAnnouncements();
    } catch (err) {
      console.error('Status update error:', err);
      showToast('Failed to update status', true);
    }
  };

  const openCreateModal = () => {
    setEditingAnnouncement(null);
    setFormData({
      title: '',
      content: '',
      announcement_type: 'info',
      priority: 1,
      severity: 'info',
      status: 'published',
      audience: 'all',
      scheduled_for: '',
      expires_at: '',
      image_url: '',
      video_url: '',
    });
    setShowModal(true);
  };

  const openEditModal = (announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content || announcement.message || '',
      announcement_type: announcement.announcement_type || 'info',
      priority: announcement.priority || 1,
      severity: announcement.severity || 'info',
      status: announcement.status,
      audience: announcement.audience || 'all',
      scheduled_for: announcement.scheduled_for?.split('T')[0] || '',
      expires_at: announcement.expires_at?.split('T')[0] || '',
      image_url: announcement.image_url || '',
      video_url: announcement.video_url || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setPreviewAnnouncement(null);
    setEditingAnnouncement(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeConfig = (type) => {
    return ANNOUNCEMENT_TYPES.find(t => t.value === type) || ANNOUNCEMENT_TYPES[0];
  };

  const getSeverityConfig = (severity) => {
    return SEVERITY_LEVELS.find(s => s.value === severity) || SEVERITY_LEVELS[0];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAudienceLabel = (audience) => TARGET_GROUPS.find((item) => item.value === audience)?.label || 'All Users';

  const getTypeIcon = (type) => {
    const config = getTypeConfig(type);
    return config.icon || 'notifications';
  };

  const openPreview = (announcement) => {
    setPreviewAnnouncement(announcement);
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-medium">Loading announcements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)]">
      <AdminSidebar user={user} roleLabel="Announcements Manager" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 rounded-[2rem] border border-sky-100 bg-white/80 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-sky-700">Announcements & Alerts</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">Announcements Manager</h1>
              <p className="mt-2 text-sm text-slate-600">Create and manage official communications, safety advisories, and traffic updates</p>
            </div>
            <button
              onClick={openCreateModal}
              className="rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_15px_30px_rgba(14,165,233,0.25)] transition hover:-translate-y-0.5 flex items-center gap-2"
            >
              <Icon name="plus" className="w-4 h-4" /> New Announcement
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-[1.6rem] border border-sky-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Icon name="notifications" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-emerald-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Active</p>
                <p className="mt-3 text-3xl font-black text-emerald-600">{stats.active}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Icon name="check" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-rose-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Critical</p>
                <p className="mt-3 text-3xl font-black text-rose-600">{stats.critical}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <Icon name="warning" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-amber-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Draft</p>
                <p className="mt-3 text-3xl font-black text-amber-600">{stats.draft}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Icon name="edit" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-violet-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Views</p>
                <p className="mt-3 text-3xl font-black text-violet-600">{stats.totalViews.toLocaleString()}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Icon name="analytics" className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-[2rem] border border-sky-100 bg-white/80 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="w-4 h-4" /></span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search announcements..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Types</option>
              {ANNOUNCEMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Severities</option>
              {SEVERITY_LEVELS.map(sev => (
                <option key={sev.value} value={sev.value}>{sev.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(stat => (
                <option key={stat.value} value={stat.value}>{stat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Announcements List */}
        <div className="space-y-3">
          {filteredAnnouncements.length === 0 ? (
            <div className="rounded-[2rem] border border-sky-100 bg-white p-12 text-center shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
              <p className="text-5xl opacity-30 mb-3 block">🔔</p>
              <p className="text-slate-500">No announcements found</p>
              <button
                onClick={openCreateModal}
                className="mt-3 text-sky-600 hover:underline text-sm flex items-center gap-2 mx-auto"
              >
                Create your first announcement <Icon name="arrow" className="w-4 h-4" />
              </button>
            </div>
          ) : (
            filteredAnnouncements.map((announcement) => {
              const typeConfig = getTypeConfig(announcement.announcement_type);
              const severityConfig = getSeverityConfig(announcement.severity);
              const expired = isExpired(announcement.expires_at);
              
              return (
                <div
                  key={announcement.id}
                  className={`rounded-[1.8rem] border bg-white transition-all hover:shadow-md ${
                    announcement.severity === 'critical' ? 'border-red-200 bg-red-50/30' :
                    announcement.severity === 'warning' ? 'border-yellow-200 bg-yellow-50/30' :
                    'border-sky-100'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Icon name={getTypeIcon(announcement.announcement_type)} className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 text-lg">{announcement.title}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                              {typeConfig.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              announcement.severity === 'critical' ? 'bg-red-100 text-red-800' :
                              announcement.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {severityConfig.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(announcement.status)}`}>
                              {announcement.status}
                            </span>
                            {expired && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                                Expired
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openPreview(announcement)}
                          className="p-2 text-slate-500 hover:text-sky-600 transition-colors rounded-full hover:bg-sky-50"
                          title="Preview"
                        >
                          <Icon name="search" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(announcement)}
                          className="p-2 text-slate-500 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                          title="Edit"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        {announcement.status === 'published' ? (
                          <button
                            onClick={() => handleToggleStatus(announcement, 'archived')}
                            className="p-2 text-slate-500 hover:text-yellow-600 transition-colors rounded-full hover:bg-yellow-50"
                            title="Archive"
                          >
                            <Icon name="save" className="w-4 h-4" />
                          </button>
                        ) : announcement.status === 'draft' ? (
                          <button
                            onClick={() => handleToggleStatus(announcement, 'published')}
                            className="p-2 text-slate-500 hover:text-green-600 transition-colors rounded-full hover:bg-green-50"
                            title="Publish"
                          >
                            <Icon name="check" className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => setShowDeleteConfirm(announcement)}
                          className="p-2 text-slate-500 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                          title="Delete"
                        >
                          <Icon name="delete" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2 py-1">Priority: {PRIORITY_LEVELS.find(p => p.value === announcement.priority)?.label || 'Normal'}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1">Target: {getAudienceLabel(announcement.audience)}</span>
                      {announcement.scheduled_for && (
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                          Scheduled: {formatDate(announcement.scheduled_for)}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-slate-600 mt-3 text-sm leading-relaxed whitespace-pre-line">{announcement.content}</p>
                    
                    {announcement.image_url && (
                      <div className="mt-3">
                        <img 
                          src={announcement.image_url} 
                          alt={announcement.title}
                          className="h-32 w-auto rounded-xl object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>Created: {formatDate(announcement.created_at)}</span>
                        {announcement.expires_at && (
                          <span>Expires: {formatDate(announcement.expires_at)}</span>
                        )}
                        <span>Views: {announcement.view_count || 0}</span>
                        <span>Open rate: {Math.min(100, Math.round(((announcement.open_count || 0) / Math.max(1, announcement.view_count || 1)) * 100))}%</span>
                      </div>
                      {announcement.severity === 'critical' && announcement.status === 'published' && !expired && (
                        <span className="text-red-500 font-medium flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          Active Alert
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center rounded-t-[2rem]">
              <h2 className="text-xl font-bold text-slate-800">
                {editingAnnouncement ? 'Edit Announcement' : 'Create New Announcement'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-sm">
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Announcement Type *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {ANNOUNCEMENT_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, announcement_type: type.value })}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        formData.announcement_type === type.value
                          ? type.color === 'blue'
                            ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                            : type.color === 'yellow'
                              ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                              : type.color === 'red'
                                ? 'bg-red-100 text-red-800 border-2 border-red-300'
                                : type.color === 'orange'
                                  ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
                                  : 'bg-purple-100 text-purple-800 border-2 border-purple-300'
                          : 'bg-gray-50 text-slate-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priority *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORITY_LEVELS.map((priority) => (
                      <button
                        key={priority.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: priority.value })}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border ${
                          formData.priority === priority.value
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-slate-600 hover:bg-gray-100'
                        }`}
                      >
                        {priority.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Severity Level *
                  </label>
                  <div className="flex gap-3">
                    {SEVERITY_LEVELS.map((sev) => (
                      <button
                        key={sev.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, severity: sev.value })}
                        className={`flex-1 px-3 py-2 rounded-xl font-medium transition-all ${
                          formData.severity === sev.value
                            ? sev.color === 'blue'
                              ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                              : sev.color === 'yellow'
                                ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-300'
                                : 'bg-red-100 text-red-800 border-2 border-red-300'
                            : 'bg-gray-50 text-slate-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {TARGET_GROUPS.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, audience: group.value })}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border ${
                        formData.audience === group.value
                          ? 'border-green-300 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-gray-50 text-slate-600 hover:bg-gray-100'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  placeholder="e.g., Typhoon Warning Signal No. 2"
                  maxLength="100"
                />
                <p className="text-xs text-slate-400 mt-1">{formData.title.length}/100 characters</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows="5"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                  placeholder="Detailed announcement message..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Announcement Image
                  </label>
                  <MediaUpload
                    bucket="announcements"
                    folder="images"
                    mediaType="image"
                    existingMediaUrl={formData.image_url}
                    onUploadComplete={(url) => setFormData({ ...formData, image_url: url || '' })}
                    onUploadError={(error) => showToast(error, true)}
                    buttonText="Upload Image"
                    maxSizeMB={5}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Video URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                    placeholder="https://youtube.com/..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                  >
                    {STATUS_OPTIONS.filter(s => s.value !== 'archived').map(stat => (
                      <option key={stat.value} value={stat.value}>{stat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Schedule for future publish
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduled_for}
                    onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expiration Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-xs text-slate-400 mt-1">Leave empty for no expiration</p>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 border border-gray-300 rounded-full text-slate-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-6 py-2 bg-gradient-to-r from-sky-600 to-emerald-500 text-white rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving || uploading ? 'Saving...' : (editingAnnouncement ? 'Update' : 'Publish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Announcement Preview</h3>
                <button type="button" onClick={() => setPreviewAnnouncement(null)} className="text-slate-500 hover:text-slate-700">
                  <Icon name="close" className="w-5 h-5" />
                </button>
            </div>

            <div className={`rounded-2xl border p-4 ${previewAnnouncement.severity === 'critical' ? 'border-red-200 bg-red-50' : previewAnnouncement.severity === 'warning' ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{getTypeConfig(previewAnnouncement.announcement_type).label}</p>
                  <h4 className="mt-1 text-2xl font-bold text-slate-800">{previewAnnouncement.title}</h4>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(previewAnnouncement.status)}`}>
                  {previewAnnouncement.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-white px-2 py-1">Priority: {PRIORITY_LEVELS.find(p => p.value === previewAnnouncement.priority)?.label || 'Normal'}</span>
                <span className="rounded-full bg-white px-2 py-1">Audience: {getAudienceLabel(previewAnnouncement.audience)}</span>
                <span className="rounded-full bg-white px-2 py-1">{getSeverityConfig(previewAnnouncement.severity).label}</span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-700 whitespace-pre-line">{previewAnnouncement.content}</p>

              {previewAnnouncement.image_url && (
                <img src={previewAnnouncement.image_url} alt={previewAnnouncement.title} className="mt-4 h-48 w-full rounded-xl object-cover" />
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Created: {formatDate(previewAnnouncement.created_at)}</span>
                <span>Expires: {previewAnnouncement.expires_at ? formatDate(previewAnnouncement.expires_at) : 'No expiration'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!showDeleteConfirm}
        title="Delete Announcement"
        message={`Are you sure you want to delete "${showDeleteConfirm?.title || ''}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={() => handleDelete(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm shadow-lg max-w-[90vw] animate-toast-in ${
          toastMessage.isError ? 'bg-red-600' : 'bg-green-500'
        }`}>
          <span className="shrink-0 inline-flex items-center">
            {toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}
          </span>
          <span className="break-words">{toastMessage.message}</span>
        </div>
      )}

      <style jsx global>{`
        @keyframes toast-in {
          from { transform: translateY(-12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-toast-in {
          animation: toast-in 0.25s ease-out;
        }
        .animate-ping {
          animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}