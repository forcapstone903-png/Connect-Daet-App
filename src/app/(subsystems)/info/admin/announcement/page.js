// app/(subsystems)/info/admin/announcement/page.js
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal';
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload';
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminLoadingScreen,
  AdminPanel,
  AdminSearch,
  AdminShell,
  AdminStatCard,
  AdminToolbar,
} from '@/app/(subsystems)/info/components/admin';
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'

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
  const [currentTime, setCurrentTime] = useState(0);
  const [engagementByAnnouncement, setEngagementByAnnouncement] = useState({});

  // Modal states
  const [showModal, setShowModal] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'send'
  );
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [previewAnnouncement, setPreviewAnnouncement] = useState(null);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [announcementView, setAnnouncementView] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'scheduled' || tab === 'history' ? tab : 'all';
  });
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
  const realtime = useRealtimeRefresh({
    channelName: 'admin-announcements',
    tables: ['info_announcements'],
    enabled: Boolean(user),
  })
  const { setRefreshCallback } = realtime

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
      setCurrentTime(Date.now());

      const announcementIds = normalized.map((announcement) => announcement.id).filter(Boolean);
      if (announcementIds.length) {
        const [{ data: reactionRows, error: reactionError }, { data: commentRows, error: commentError }] = await Promise.all([
          supabase
            .from('content_reactions')
            .select('content_id, reaction_type')
            .eq('content_type', 'announcement')
            .in('content_id', announcementIds),
          supabase
            .from('content_comments')
            .select('id, content_id, body, created_at, user_id, info_users(full_name, email)')
            .eq('content_type', 'announcement')
            .eq('status', 'active')
            .in('content_id', announcementIds)
            .order('created_at', { ascending: false }),
        ]);

        if (reactionError) throw reactionError;
        if (commentError) throw commentError;

        const engagement = {};
        announcementIds.forEach((id) => {
          const reactions = (reactionRows || []).filter((row) => row.content_id === id);
          const comments = (commentRows || []).filter((row) => row.content_id === id);
          engagement[id] = {
            reactionCount: reactions.length,
            commentCount: comments.length,
            reactionBreakdown: reactions.reduce((counts, row) => ({ ...counts, [row.reaction_type]: (counts[row.reaction_type] || 0) + 1 }), {}),
            comments,
          };
        });
        setEngagementByAnnouncement(engagement);
      } else {
        setEngagementByAnnouncement({});
      }

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
      return true
    } catch (err) {
      console.error('Error fetching announcements:', err);
      showToast('Failed to load announcements', true);
      return false
    }
  }, [showToast]);

  useEffect(() => {
    setRefreshCallback(fetchAnnouncements)
  }, [fetchAnnouncements, setRefreshCallback])

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

        if (!isActive) return;
        setUser(userData);
        await fetchAnnouncements();
      } catch (err) {
        console.error('Error loading admin session:', err);
        if (isActive) {
          router.push('/info/login');
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
    if (announcementView === 'scheduled') {
      filtered = filtered.filter((announcement) =>
        announcement.scheduled_for && new Date(announcement.scheduled_for).getTime() > currentTime
      );
    } else if (announcementView === 'history') {
      filtered = filtered.filter((announcement) =>
        ['published', 'archived'].includes(announcement.status)
        && (!announcement.scheduled_for || new Date(announcement.scheduled_for).getTime() <= currentTime)
      );
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.content.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [announcements, currentTime, filterType, filterSeverity, filterStatus, announcementView, searchQuery]);

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
        created_by: user?.user_id || user?.id,
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
          .insert([announcementData])
          .select('id');
      }

      if (result.error) throw result.error;

      const insertedAnnouncement = Array.isArray(result.data) ? result.data[0] : null
      if (!editingAnnouncement && resolvedStatus === 'published' && insertedAnnouncement?.id) {
        await createPushNotification({
          id: insertedAnnouncement.id,
          title: formData.title.trim(),
          message: formData.content.trim(),
          link: `/info/user/announcements/${insertedAnnouncement.id}`,
          audience: announcementData.audience,
        })
      }

      showToast(editingAnnouncement ? 'Announcement updated!' : formData.scheduled_for ? 'Announcement scheduled!' : 'Announcement published!', false);
      closeModal();
      await fetchAnnouncements();
    } catch (err) {
      console.error('Save error:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const createPushNotification = async ({ id, title, message, link, audience }) => {
    try {
      const response = await fetch('/info/api/admin/content-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type: 'announcement',
          contentType: 'announcement',
          contentId: id,
          title,
          message,
          link,
          audience,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        console.warn('Announcement notification broadcast failed:', result.message || response.statusText)
      }
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

  const openCreateModal = useCallback(() => {
    setAnnouncementView('all');
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
  }, []);

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
    return <AdminLoadingScreen label="Loading announcements..." />;
  }

  return (
    <AdminShell
      user={user}
      roleLabel="Announcements Manager"
      eyebrow="Content"
      title="Announcements & Alerts"
      description="Create and manage official communications, safety advisories, and traffic updates."
      headerIcon="notifications"
      actions={(
        <AdminButton variant="primary" icon="plus" onClick={openCreateModal}>
          New Announcement
        </AdminButton>
      )}
    >
      <div className="space-y-5">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-4" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
          <AdminStatCard label="Total" value={stats.total} meta="All announcements" icon="notifications" />
          <AdminStatCard label="Active" value={stats.active} meta="Currently published" icon="check" tone="success" />
          <AdminStatCard label="Critical" value={stats.critical} meta="Published critical alerts" icon="warning" tone="danger" />
          <AdminStatCard label="Draft" value={stats.draft} meta="Not yet published" icon="edit" tone="warning" />
          <AdminStatCard label="Views" value={stats.totalViews.toLocaleString()} meta="Total announcement views" icon="analytics" tone="violet" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
          <AdminPanel title="Most viewed announcements" description="Announcements receiving the most visitor attention." bodyClassName="!pt-0">
            {announcements.length ? (
              <div className="space-y-4">
                {[...announcements]
                  .sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0))
                  .slice(0, 5)
                  .map((announcement) => {
                    const maxViews = Math.max(...announcements.map((item) => Number(item.view_count || 0)), 1);
                    const views = Number(announcement.view_count || 0);
                    const width = views ? Math.max((views / maxViews) * 100, 2) : 0;
                    return (
                      <div key={announcement.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-semibold text-slate-800">{announcement.title}</span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-500">{views.toLocaleString()} views</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : <p className="text-sm text-slate-500">No announcements to rank yet.</p>}
          </AdminPanel>

          <AdminPanel title="Performance summary" description="At-a-glance announcement performance." bodyClassName="!pt-0">
            <dl className="divide-y divide-slate-100">
              <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <dt className="text-sm text-slate-600">Active announcements</dt>
                <dd className="font-bold tabular-nums text-slate-900">{stats.active}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-sm text-slate-600">Total opens</dt>
                <dd className="font-bold tabular-nums text-slate-900">{stats.totalOpens.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
                <dt className="text-sm text-slate-600">Open rate</dt>
                <dd className="font-bold tabular-nums text-slate-900">
                  {stats.totalViews ? `${Math.min(100, Math.round((stats.totalOpens / stats.totalViews) * 100))}%` : '0%'}
                </dd>
              </div>
            </dl>
          </AdminPanel>
        </div>

        <AdminPanel
          title="Announcements"
          description={`${filteredAnnouncements.length} ${filteredAnnouncements.length === 1 ? 'announcement' : 'announcements'} found`}
          actions={(
            <div className="flex rounded-xl border border-slate-200 p-1" role="group" aria-label="Announcement view">
              {[
                ['all', 'All'],
                ['scheduled', 'Scheduled'],
                ['history', 'History'],
              ].map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setAnnouncementView(view)}
                  aria-pressed={announcementView === view}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${announcementView === view ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          bodyClassName="!p-0"
        >
          <AdminToolbar className="flex-wrap border-b border-slate-100 px-4 py-3 sm:px-5">
            <AdminSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search announcements..."
              label="Search announcements"
              className="min-w-[220px] flex-1"
            />
            <label className="sr-only" htmlFor="announcement-type-filter">Filter by type</label>
            <select id="announcement-type-filter" value={filterType} onChange={(event) => setFilterType(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <option value="all">All Types</option>
              {ANNOUNCEMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="announcement-severity-filter">Filter by severity</label>
            <select id="announcement-severity-filter" value={filterSeverity} onChange={(event) => setFilterSeverity(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <option value="all">All Severities</option>
              {SEVERITY_LEVELS.map((severity) => <option key={severity.value} value={severity.value}>{severity.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="announcement-status-filter">Filter by status</label>
            <select id="announcement-status-filter" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </AdminToolbar>

          {announcementView !== 'all' && (
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 sm:px-5" role="status">
              <span>{announcementView === 'scheduled' ? 'Showing future scheduled announcements.' : 'Showing published and archived announcement history.'}</span>
              <button type="button" onClick={() => setAnnouncementView('all')} className="shrink-0 font-semibold underline">Show all</button>
            </div>
          )}

          {filteredAnnouncements.length === 0 ? (
            <div className="p-8 sm:p-12">
              <AdminEmptyState
                icon="notifications"
                title="No announcements found"
                description="Try adjusting your search or filters, or create a new announcement."
                action={<AdminButton variant="primary" icon="plus" onClick={openCreateModal}>New Announcement</AdminButton>}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-3 sm:p-4 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredAnnouncements.map((announcement) => {
              const typeConfig = getTypeConfig(announcement.announcement_type);
              const severityConfig = getSeverityConfig(announcement.severity);
              const expired = isExpired(announcement.expires_at);
              
              return (
                <article
                  key={announcement.id}
                  className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md ${
                    announcement.severity === 'critical' ? 'border-red-200 border-l-4 border-l-red-500' :
                    announcement.severity === 'warning' ? 'border-amber-200 border-l-4 border-l-amber-500' :
                    'border-slate-200 border-l-4 border-l-blue-500'
                  }`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                    {announcement.image_url ? (
                      <img src={announcement.image_url} alt={announcement.title} loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                        <Icon name={getTypeIcon(announcement.announcement_type)} className="h-7 w-7 text-blue-400" />
                        <span className="text-xs font-medium">No image available</span>
                      </div>
                    )}
                    <span className="absolute left-2 top-2">
                      <AdminBadge tone={announcement.severity === 'critical' ? 'danger' : announcement.severity === 'warning' ? 'warning' : 'info'}>
                        {severityConfig.label}
                      </AdminBadge>
                    </span>
                    <span className="absolute right-2 top-2">
                      <AdminBadge status={announcement.status} dot>{announcement.status}</AdminBadge>
                    </span>
                    {expired ? <span className="absolute bottom-2 left-2"><AdminBadge tone="neutral">Expired</AdminBadge></span> : null}
                  </div>
                  <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-900">{announcement.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <AdminBadge tone="neutral">{typeConfig.label}</AdminBadge>
                          <AdminBadge tone="neutral">{PRIORITY_LEVELS.find((item) => item.value === announcement.priority)?.label || 'Normal'} priority</AdminBadge>
                        </div>
                      </div>
                      <details className="relative shrink-0">
                        <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label={`More actions for ${announcement.title}`}>
                          <span aria-hidden="true">···</span>
                        </summary>
                        <div className="absolute right-0 top-8 z-20 min-w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                          {announcement.status === 'published' ? (
                            <button type="button" onClick={() => handleToggleStatus(announcement, 'archived')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Icon name="save" className="h-3.5 w-3.5" />Archive</button>
                          ) : announcement.status === 'draft' ? (
                            <button type="button" onClick={() => handleToggleStatus(announcement, 'published')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-green-700 hover:bg-green-50"><Icon name="check" className="h-3.5 w-3.5" />Publish</button>
                          ) : null}
                          <button type="button" onClick={() => setShowDeleteConfirm(announcement)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"><Icon name="delete" className="h-3.5 w-3.5" />Delete</button>
                        </div>
                      </details>
                    </div>
                    <p className="mt-2 min-h-8 line-clamp-2 text-[11px] leading-4 text-slate-600">{announcement.content}</p>
                    <p className="mt-2 flex items-center gap-1 truncate text-[10px] text-slate-500">
                      <Icon name="users" className="h-3 w-3 shrink-0 text-slate-400" />
                      {getAudienceLabel(announcement.audience)}
                      {announcement.scheduled_for ? ` · Scheduled ${formatDate(announcement.scheduled_for)}` : ''}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2.5">
                      <span className="text-[10px] text-slate-500">Views <strong className="ml-0.5 text-slate-700">{Number(announcement.view_count || 0).toLocaleString()}</strong></span>
                      <span className="text-[10px] text-slate-500">Opens <strong className="ml-0.5 text-slate-700">{Number(announcement.open_count || 0).toLocaleString()}</strong></span>
                      <span className="text-[10px] text-slate-500">Rate <strong className="ml-0.5 text-slate-700">{Math.min(100, Math.round((Number(announcement.open_count || 0) / Math.max(1, Number(announcement.view_count || 0))) * 100))}%</strong></span>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                      <AdminButton size="sm" variant="primary" icon="search" onClick={() => openPreview(announcement)}>Preview</AdminButton>
                      <AdminButton size="sm" variant="secondary" icon="edit" onClick={() => openEditModal(announcement)}>Edit</AdminButton>
                      <span className="ml-auto text-[9px] text-slate-400">Created {formatDate(announcement.created_at)}</span>
                    </div>
                    {announcement.expires_at ? <p className="pt-1.5 text-[9px] text-slate-400">Expires {formatDate(announcement.expires_at)}</p> : null}
                  </div>
                </article>
              );
              })}
            </div>
          )}
        </AdminPanel>
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

              {(() => {
                const engagement = engagementByAnnouncement[previewAnnouncement.id] || { reactionCount: 0, commentCount: 0, reactionBreakdown: {}, comments: [] };
                return (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Reactions</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{engagement.reactionCount}</p>
                        <p className="text-xs text-slate-500">{Object.entries(engagement.reactionBreakdown).map(([type, count]) => `${type}: ${count}`).join(' · ') || 'No reactions yet'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-sky-600">Comments</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">{engagement.commentCount}</p>
                        <p className="text-xs text-slate-500">Community responses</p>
                      </div>
                    </div>
                    {engagement.comments.length > 0 && (
                      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Latest comments</p>
                        {engagement.comments.map((comment) => (
                          <div key={comment.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                            <p className="text-xs font-bold text-slate-800">{comment.info_users?.full_name || comment.info_users?.email || 'Community member'}</p>
                            <p className="mt-1 text-sm text-slate-600">{comment.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

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
    </AdminShell>
  );
}