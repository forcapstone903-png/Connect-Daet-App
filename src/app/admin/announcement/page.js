// app/admin/announcement/page.js
'use client';

import { useState, useEffect, useRef } from 'react'; // Added useRef to the import
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles';

// Announcement type configuration
const ANNOUNCEMENT_TYPES = [
  { value: 'announcement', label: '📢 General Announcement', color: 'blue', icon: '📢' },
  { value: 'safety', label: '⚠️ Safety Advisory', color: 'yellow', icon: '⚠️' },
  { value: 'traffic', label: '🚗 Traffic Update', color: 'orange', icon: '🚗' },
  { value: 'disaster', label: '🌊 Disaster Warning', color: 'red', icon: '🌊' },
  { value: 'event', label: '🎉 Event Update', color: 'purple', icon: '🎉' },
];

const SEVERITY_LEVELS = [
  { value: 'info', label: 'ℹ️ Informational', color: 'blue' },
  { value: 'warning', label: '⚠️ Caution', color: 'yellow' },
  { value: 'critical', label: '🔴 Critical', color: 'red' },
];

const STATUS_OPTIONS = [
  { value: 'published', label: 'Published', color: 'green' },
  { value: 'draft', label: 'Draft', color: 'gray' },
  { value: 'archived', label: 'Archived', color: 'gray' },
];

export default function AdminAnnouncementPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState([]);
  
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
    message: '',
    type: 'announcement',
    severity: 'info',
    status: 'published',
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
  });

  // File input refs
  const imageInputRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        router.push('/login');
        return;
      }
      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) {
        router.push('/dashboard');
        return;
      }
      setUser(userData);
      await fetchAnnouncements();
      setLoading(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    filterAnnouncements();
  }, [announcements, filterType, filterSeverity, filterStatus, searchQuery]);

  const filterAnnouncements = () => {
    let filtered = [...announcements];
    
    if (filterType !== 'all') {
      filtered = filtered.filter(a => a.type === filterType);
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
        a.message.toLowerCase().includes(query)
      );
    }
    
    setFilteredAnnouncements(filtered);
  };

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('info_announcements')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setAnnouncements(data || []);
      
      // Calculate stats
      const active = (data || []).filter(a => a.status === 'published' && (!a.expires_at || new Date(a.expires_at) > new Date())).length;
      const critical = (data || []).filter(a => a.severity === 'critical' && a.status === 'published').length;
      const draft = (data || []).filter(a => a.status === 'draft').length;
      
      setStats({
        total: data?.length || 0,
        active,
        critical,
        draft,
      });
    } catch (err) {
      console.error('Error fetching announcements:', err);
      showToast('Failed to load announcements', true);
    }
  };

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
    if (!formData.message.trim()) {
      showToast('Please enter a message', true);
      return;
    }
    
    setSaving(true);
    
    try {
      const announcementData = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        type: formData.type,
        severity: formData.severity,
        status: formData.status,
        expires_at: formData.expires_at || null,
        image_url: formData.image_url || null,
        video_url: formData.video_url || null,
        created_by: user?.id,
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
      
      showToast(editingAnnouncement ? 'Announcement updated!' : 'Announcement published!', false);
      closeModal();
      await fetchAnnouncements();
      
      // If published and severity is critical or warning, also create a push notification record
      if (formData.status === 'published' && (formData.severity === 'critical' || formData.severity === 'warning')) {
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
      // This would typically call an edge function or create a notification record
      // For now, we'll just log it
      console.log('Push notification would be sent:', {
        title: formData.title,
        message: formData.message,
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
        .update({ status: newStatus })
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
      message: '',
      type: 'announcement',
      severity: 'info',
      status: 'published',
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
      message: announcement.message,
      type: announcement.type,
      severity: announcement.severity,
      status: announcement.status,
      expires_at: announcement.expires_at?.split('T')[0] || '',
      image_url: announcement.image_url || '',
      video_url: announcement.video_url || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAnnouncement(null);
  };

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
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
    switch(status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-gray-200 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading announcements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Announcements Manager" />

      {/* Main Content */}
      <div className="ml-64 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span>📢</span> Announcements & Alerts
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Create and manage official communications, safety advisories, and traffic updates
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 transition-all duration-200 shadow-sm"
            >
              <span className="text-lg">+</span>
              <span className="font-medium">New Announcement</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Total Announcements</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <div className="text-3xl opacity-70">📢</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Active Alerts</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <div className="text-3xl opacity-70">⚠️</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Critical Alerts</p>
                <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
              </div>
              <div className="text-3xl opacity-70">🔴</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Drafts</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
              </div>
              <div className="text-3xl opacity-70">📝</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                {ANNOUNCEMENT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Severities</option>
                {SEVERITY_LEVELS.map(sev => (
                  <option key={sev.value} value={sev.value}>{sev.label}</option>
                ))}
              </select>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map(stat => (
                  <option key={stat.value} value={stat.value}>{stat.label}</option>
                ))}
              </select>
            </div>
            
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search announcements..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm w-64 focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>
          </div>
        </div>

        {/* Announcements List */}
        <div className="space-y-3">
          {filteredAnnouncements.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
              <span className="text-5xl opacity-50 mb-3 block">📭</span>
              <p className="text-gray-500">No announcements found</p>
              <button
                onClick={openCreateModal}
                className="mt-3 text-blue-600 hover:underline text-sm"
              >
                Create your first announcement →
              </button>
            </div>
          ) : (
            filteredAnnouncements.map((announcement) => {
              const typeConfig = getTypeConfig(announcement.type);
              const severityConfig = getSeverityConfig(announcement.severity);
              const expired = isExpired(announcement.expires_at);
              
              return (
                <div
                  key={announcement.id}
                  className={`bg-white rounded-2xl shadow-sm border transition-all hover:shadow-md ${
                    announcement.severity === 'critical' ? 'border-red-200 bg-red-50/30' :
                    announcement.severity === 'warning' ? 'border-yellow-200 bg-yellow-50/30' :
                    'border-gray-200'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-2xl`}>{typeConfig.icon}</span>
                        <div>
                          <h3 className="font-semibold text-gray-800 text-lg">{announcement.title}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium`}
                              style={{ 
                                backgroundColor: typeConfig.color === 'blue' ? '#DBEAFE' : 
                                               typeConfig.color === 'yellow' ? '#FEF3C7' :
                                               typeConfig.color === 'red' ? '#FEE2E2' :
                                               typeConfig.color === 'orange' ? '#FFEDD5' :
                                               '#F3E8FF',
                                color: typeConfig.color === 'blue' ? '#1E40AF' : 
                                       typeConfig.color === 'yellow' ? '#92400E' :
                                       typeConfig.color === 'red' ? '#991B1B' :
                                       typeConfig.color === 'orange' ? '#9A3412' :
                                       '#6B21A5'
                              }}
                            >
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(announcement)}
                          className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        {announcement.status === 'published' ? (
                          <button
                            onClick={() => handleToggleStatus(announcement, 'archived')}
                            className="p-2 text-gray-500 hover:text-yellow-600 transition-colors"
                            title="Archive"
                          >
                            📦
                          </button>
                        ) : announcement.status === 'draft' ? (
                          <button
                            onClick={() => handleToggleStatus(announcement, 'published')}
                            className="p-2 text-gray-500 hover:text-green-600 transition-colors"
                            title="Publish"
                          >
                            ✅
                          </button>
                        ) : null}
                        <button
                          onClick={() => setShowDeleteConfirm(announcement)}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 mt-3 text-sm leading-relaxed">{announcement.message}</p>
                    
                    {announcement.image_url && (
                      <div className="mt-3">
                        <img 
                          src={announcement.image_url} 
                          alt={announcement.title}
                          className="h-32 w-auto rounded-xl object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
                      <div className="flex items-center gap-4">
                        <span>📅 Created: {formatDate(announcement.created_at)}</span>
                        {announcement.expires_at && (
                          <span>⏰ Expires: {formatDate(announcement.expires_at)}</span>
                        )}
                      </div>
                      {announcement.severity === 'critical' && announcement.status === 'published' && !expired && (
                        <span className="text-red-500 font-medium flex items-center gap-1">
                          <span className="animate-pulse">🔴</span> Active Alert
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
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800">
                {editingAnnouncement ? '✏️ Edit Announcement' : '📢 Create New Announcement'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Announcement Type *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {ANNOUNCEMENT_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: type.value })}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        formData.type === type.value
                          ? `bg-${type.color === 'blue' ? 'blue' : type.color === 'yellow' ? 'yellow' : type.color === 'red' ? 'red' : type.color === 'orange' ? 'orange' : 'purple'}-100 text-${type.color === 'blue' ? 'blue' : type.color === 'yellow' ? 'yellow' : type.color === 'red' ? 'red' : type.color === 'orange' ? 'orange' : 'purple'}-800 border-2 border-${type.color === 'blue' ? 'blue' : type.color === 'yellow' ? 'yellow' : type.color === 'red' ? 'red' : type.color === 'orange' ? 'orange' : 'purple'}-300`
                          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity Level *
                </label>
                <div className="flex gap-3">
                  {SEVERITY_LEVELS.map(sev => (
                    <button
                      key={sev.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, severity: sev.value })}
                      className={`flex-1 px-4 py-2 rounded-xl font-medium transition-all ${
                        formData.severity === sev.value
                          ? `bg-${sev.color === 'blue' ? 'blue' : sev.color === 'yellow' ? 'yellow' : 'red'}-100 text-${sev.color === 'blue' ? 'blue' : sev.color === 'yellow' ? 'yellow' : 'red'}-800 border-2 border-${sev.color === 'blue' ? 'blue' : sev.color === 'yellow' ? 'yellow' : 'red'}-300`
                          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Typhoon Warning Signal No. 2"
                  maxLength="100"
                />
                <p className="text-xs text-gray-400 mt-1">{formData.title.length}/100 characters</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows="5"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Detailed announcement message..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="px-3 py-2 bg-gray-100 rounded-xl hover:bg-gray-200"
                      title="Upload Image"
                    >
                      📁
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={imageInputRef}
                    accept="image/*"
                    onChange={async (e) => {
                      const url = await handleImageUpload(e.target.files[0]);
                      if (url) setFormData({ ...formData, image_url: url });
                    }}
                    className="hidden"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video URL (YouTube)
                  </label>
                  <input
                    type="text"
                    value={formData.video_url}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    placeholder="https://youtube.com/..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map(stat => (
                      <option key={stat.value} value={stat.value}>{stat.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Leave empty for no expiration</p>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving || uploading ? 'Saving...' : (editingAnnouncement ? 'Update' : 'Publish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Delete Announcement</h3>
              <p className="text-gray-500 mb-4">
                Are you sure you want to delete "{showDeleteConfirm.title}"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-5 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-3 rounded-full text-white text-sm z-40 animate-slide-in shadow-md ${
          toastMessage.isError ? 'bg-red-600' : 'bg-green-500'
        }`}>
          {toastMessage.isError ? '⚠️' : '✅'} {toastMessage.message}
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
