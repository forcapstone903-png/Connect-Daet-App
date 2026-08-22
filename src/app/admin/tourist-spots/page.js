// app/admin/tourist-spots/page.js
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminSidebar from '@/app/components/AdminSidebar';
import ConfirmationModal from '@/app/components/ConfirmationModal';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles';
import MediaUpload from '@/app/components/MediaUpload';

const DEFAULT_SPOT_CATEGORIES = [
  { value: 'beach', label: 'Beach', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'historical', label: 'Historical', color: 'bg-amber-100 text-amber-700' },
  { value: 'nature', label: 'Nature', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cultural', label: 'Cultural', color: 'bg-purple-100 text-purple-700' },
  { value: 'religious', label: 'Religious', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'park', label: 'Park', color: 'bg-green-100 text-green-700' },
  { value: 'market', label: 'Market', color: 'bg-orange-100 text-orange-700' },
];

const DEFAULT_STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'maintenance', label: 'Under Maintenance' },
  { value: 'closed', label: 'Closed' },
];

export default function TouristSpotsManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState([]);
  const [spotCategories, setSpotCategories] = useState(DEFAULT_SPOT_CATEGORIES);
  const [spotStatuses, setSpotStatuses] = useState(DEFAULT_STATUS_OPTIONS);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewSpot, setPreviewSpot] = useState(null);
  const [editingSpot, setEditingSpot] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSpotIds, setSelectedSpotIds] = useState(new Set());
  const [categoryDraft, setCategoryDraft] = useState('');
  const [galleryUrls, setGalleryUrls] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [confirmingSpot, setConfirmingSpot] = useState(null);

  const [spotForm, setSpotForm] = useState({
    name: '',
    description: '',
    location: '',
    latitude: '',
    longitude: '',
    category: '',
    opening_hours: '',
    entrance_fee: '',
    contact_number: '',
    image_url: '',
    gallery_images: [],
    rating: 0,
    status: 'published',
    featured: false,
    view_count: 0
  });

  const showToast = useCallback((message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const fetchSpots = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/admin/tourist-spots?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch spots');
      
      const result = await response.json();
      if (result.success) {
        setSpots(result.spots || []);
      } else {
        throw new Error(result.message || 'Failed to fetch spots');
      }
    } catch (err) {
      console.error('Error fetching spots:', err);
      showToast('Failed to load tourist spots', true);
    }
  }, [showToast, searchTerm, categoryFilter, statusFilter]);

  // Load distinct categories and statuses from DB to replace hardcoded lists
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const { data, error } = await supabase.from('info_tourist_spots').select('category, status');
        if (error) throw error;
        const cats = Array.from(new Set((data || []).map(r => r.category).filter(Boolean)));
        if (cats.length) {
          setSpotCategories(cats.map(v => ({ value: v, label: String(v).charAt(0).toUpperCase() + String(v).slice(1), color: 'bg-gray-100 text-gray-700' })));
        }
        const stats = Array.from(new Set((data || []).map(r => r.status).filter(Boolean)));
        if (stats.length) setSpotStatuses(stats.map(v => ({ value: v, label: String(v).charAt(0).toUpperCase() + String(v).slice(1) })));
      } catch (e) {
        console.error('Error loading tourist spots lookups:', e);
      }
    };
    loadLookups();
  }, []);

  const saveSpot = async () => {
    if (!spotForm.name.trim() || !spotForm.location.trim() || !spotForm.category) {
      showToast('Please fill in all required fields', true);
      return;
    }

    setSaving(true);
    try {
      const spotData = {
        name: spotForm.name,
        description: spotForm.description || '',
        location: spotForm.location,
        latitude: spotForm.latitude ? parseFloat(spotForm.latitude) : null,
        longitude: spotForm.longitude ? parseFloat(spotForm.longitude) : null,
        category: spotForm.category,
        opening_hours: spotForm.opening_hours || '',
        entrance_fee: spotForm.entrance_fee ? parseFloat(spotForm.entrance_fee) : null,
        contact_number: spotForm.contact_number || '',
        image_url: spotForm.image_url || null,
        gallery_images: spotForm.gallery_images?.length ? spotForm.gallery_images : null,
        rating: spotForm.rating || 0,
        status: spotForm.status,
        featured: !!spotForm.featured,
        view_count: spotForm.view_count || 0,
        created_by: user?.id
      };

      let response;
      if (editingSpot) {
        response = await fetch(`/api/admin/tourist-spots/${editingSpot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spotData)
        });
      } else {
        response = await fetch('/api/admin/tourist-spots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spotData)
        });
      }

      if (!response.ok) throw new Error('Failed to save spot');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to save spot');

      showToast(editingSpot ? 'Spot updated successfully!' : 'Spot created successfully!');
      fetchSpots();
      closeModal();
    } catch (err) {
      console.error('Error saving spot:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const archiveSpot = async (spot) => {
    setConfirmingSpot(spot)
    setShowArchiveConfirm(true)
  }

  const handleConfirmArchive = async () => {
    setShowArchiveConfirm(false)
    if (!confirmingSpot) return

    try {
      const response = await fetch(`/api/admin/tourist-spots/${confirmingSpot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...confirmingSpot, status: 'draft' })
      });

      if (!response.ok) throw new Error('Failed to archive spot');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to archive spot');

      showToast(`"${confirmingSpot.name}" archived`);
      fetchSpots();
      setConfirmingSpot(null)
    } catch (err) {
      console.error('Error archiving spot:', err);
      showToast('Failed to archive spot', true);
      setConfirmingSpot(null)
    }
  }

  const deleteSpot = async (spot) => {
    setConfirmingSpot(spot)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    if (!confirmingSpot) return

    try {
      const response = await fetch(`/api/admin/tourist-spots/${confirmingSpot.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete spot');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to delete spot');

      showToast(`"${confirmingSpot.name}" deleted`);
      fetchSpots();
      setConfirmingSpot(null)
    } catch (err) {
      console.error('Error deleting spot:', err);
      showToast('Failed to delete spot', true);
      setConfirmingSpot(null)
    }
  }

  const bulkUpdateSpots = async (newStatus) => {
    if (selectedSpotIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('info_tourist_spots')
        .update({ status: newStatus })
        .in('id', Array.from(selectedSpotIds));

      if (error) throw error;
      showToast(`${selectedSpotIds.size} spots updated`, false);
      setSelectedSpotIds(new Set());
      setBulkAction('');
      setShowBulkModal(false);
      fetchSpots();
    } catch (err) {
      console.error('Error bulk updating spots:', err);
      showToast(`Failed to update spots: ${err.message}`, true);
    }
  };

  const bulkDeleteSpots = async () => {
    if (selectedSpotIds.size === 0) return;

    try {
      const ids = Array.from(selectedSpotIds);
      const { error } = await supabase
        .from('info_tourist_spots')
        .delete()
        .in('id', ids);

      if (error) throw error;
      showToast(`${ids.length} spots deleted`, false);
      setSelectedSpotIds(new Set());
      setShowBulkModal(false);
      fetchSpots();
    } catch (err) {
      console.error('Error deleting spots:', err);
      showToast(`Failed to delete spots: ${err.message}`, true);
    }
  };

  const openCreateModal = () => {
    setEditingSpot(null);
    setGalleryUrls([]);
    setSpotForm({
      name: '',
      description: '',
      location: '',
      latitude: '',
      longitude: '',
      category: '',
      opening_hours: '',
      entrance_fee: '',
      contact_number: '',
      image_url: '',
      gallery_images: [],
      rating: 0,
      status: 'published',
      featured: false,
      view_count: 0
    });
    setShowModal(true);
  };

  const openEditModal = (spot) => {
    setEditingSpot(spot);
    setGalleryUrls(spot.gallery_images || []);
    setSpotForm({
      name: spot.name || '',
      description: spot.description || '',
      location: spot.location || '',
      latitude: spot.latitude || '',
      longitude: spot.longitude || '',
      category: spot.category || '',
      opening_hours: spot.opening_hours || '',
      entrance_fee: spot.entrance_fee || '',
      contact_number: spot.contact_number || '',
      image_url: spot.image_url || '',
      gallery_images: spot.gallery_images || [],
      rating: spot.rating || 0,
      status: spot.status || 'published',
      featured: spot.featured || false,
      view_count: spot.view_count || 0
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setShowCategoryModal(false);
    setShowPreviewModal(false);
    setEditingSpot(null);
    setPreviewSpot(null);
    setGalleryUrls([]);
    setCategoryDraft('');
  };

  const previewSpotPublic = (spot) => {
    setPreviewSpot(spot);
    setShowPreviewModal(true);
  };

  const addGalleryImage = (url) => {
    if (!url) return;
    setGalleryUrls((prev) => [...prev, url]);
    setSpotForm((prev) => ({ ...prev, gallery_images: [...(prev.gallery_images || []), url] }));
  };

  const removeGalleryImage = (index) => {
    setGalleryUrls((prev) => prev.filter((_, idx) => idx !== index));
    setSpotForm((prev) => ({
      ...prev,
      gallery_images: (prev.gallery_images || []).filter((_, idx) => idx !== index)
    }));
  };

  const addCategory = () => {
    const value = categoryDraft.trim();
    if (!value) return;
    const newCategory = value.toLowerCase().replace(/\s+/g, '-');
    const alreadyExists = (spotCategories || []).some((cat) => cat.value === newCategory);
    if (alreadyExists) {
      showToast('Category already exists', true);
      return;
    }
    setSpotCategories(prev => [...(prev || []), { value: newCategory, label: value, color: 'bg-gray-100 text-gray-700' }]);
    setCategoryDraft('');
    setShowCategoryModal(false);
    showToast('Category added');
  };

  const removeCategory = (categoryValue) => {
    if ((spotCategories || []).length <= 1) {
      showToast('At least one category must remain', true);
      return;
    }
    const updated = (spotCategories || []).filter((cat) => cat.value !== categoryValue);
    setSpotCategories(updated);
    if (spotForm.category === categoryValue) {
      setSpotForm((prev) => ({ ...prev, category: '' }));
    }
    showToast('Category removed');
  };

  const getCategoryDisplay = (category) => {
    const found = (spotCategories || []).find(c => c.value === category);
    return found || { label: category || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      'published': 'bg-green-100 text-green-700',
      'draft': 'bg-yellow-100 text-yellow-700',
      'maintenance': 'bg-orange-100 text-orange-700',
      'closed': 'bg-red-100 text-red-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  const toggleSelectSpot = (spotId) => {
    const next = new Set(selectedSpotIds);
    if (next.has(spotId)) next.delete(spotId);
    else next.add(spotId);
    setSelectedSpotIds(next);
  };

  const selectAllSpots = () => {
    if (selectedSpotIds.size === filteredSpots.length) {
      setSelectedSpotIds(new Set());
      return;
    }
    setSelectedSpotIds(new Set(filteredSpots.map((spot) => spot.id)));
  };

  const filteredSpots = spots.filter(spot => {
    const matchesSearch = spot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          spot.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || spot.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || spot.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const analyticsSummary = useMemo(() => {
    const safeNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const totalViews = spots.reduce((sum, spot) => sum + safeNumber(spot.view_count), 0);
    const totalSaves = spots.reduce((sum, spot) => sum + safeNumber(spot.save_count), 0);
    const totalShares = spots.reduce((sum, spot) => sum + safeNumber(spot.share_count), 0);
    const avgRating = spots.length
      ? (spots.reduce((sum, spot) => sum + safeNumber(spot.rating), 0) / spots.length).toFixed(1)
      : '0.0';

    const topSpots = [...spots]
      .map((spot) => ({
        id: spot.id,
        name: spot.name,
        views: safeNumber(spot.view_count),
        saves: safeNumber(spot.save_count),
        shares: safeNumber(spot.share_count),
        totalEngagement: safeNumber(spot.view_count) + safeNumber(spot.save_count) + safeNumber(spot.share_count),
      }))
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, 5);

    return {
      totalViews,
      totalSaves,
      totalShares,
      avgRating,
      totalSpots: spots.length,
      topSpots,
      hasSaveShareTracking: spots.some((spot) => Object.prototype.hasOwnProperty.call(spot, 'save_count') || Object.prototype.hasOwnProperty.call(spot, 'share_count'))
    };
  }, [spots]);

  useEffect(() => {
    let isActive = true;

    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        setLoading(false);
        router.push('/login');
        return;
      }

      try {
        const userData = JSON.parse(session);
        if (!hasAdminAccess(userData.role)) {
          setLoading(false);
          router.push('/dashboard');
          return;
        }

        if (!isActive) return;
        setUser(userData);
        await fetchSpots();
      } catch (error) {
        console.error('Error loading admin user session:', error);
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
  }, [router]);

  // Refetch spots when filters/search change
  useEffect(() => {
    fetchSpots();
  }, [fetchSpots, searchTerm, categoryFilter, statusFilter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Tourist Spots Management</h1>
            <p className="text-gray-500 mt-1">Manage Daet&apos;s tourist attractions and destinations</p>
          </div>
          <div className="flex gap-2 items-center">
            {selectedSpotIds.size > 0 && (
              <select
                value={bulkAction}
                onChange={(e) => {
                  if (e.target.value === 'delete') setShowBulkModal(true);
                  else if (e.target.value) bulkUpdateSpots(e.target.value);
                  setBulkAction('');
                }}
                className="px-3 py-2 border border-gray-200 rounded-full bg-white text-sm"
              >
                <option value="">Bulk Actions</option>
                <option value="published">Publish</option>
                <option value="draft">Archive</option>
                <option value="maintenance">Maintenance</option>
                <option value="delete">Delete</option>
              </select>
            )}
            <button onClick={() => setShowCategoryModal(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-full flex items-center gap-2">
              Categories
            </button>
            <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <span>+</span> Add New Spot
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-sm border border-blue-500/20 p-5 mb-6 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Attraction analytics</p>
              <h2 className="text-2xl font-bold mt-2">Engagement overview</h2>
            </div>
            <div className="text-sm text-blue-100">
              {analyticsSummary.hasSaveShareTracking ? 'Save/share tracking is enabled' : 'Current schema only tracks views; add save/share columns to enable full engagement metrics'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="text-sm text-blue-100">Total views</div>
              <div className="text-3xl font-bold mt-2">{analyticsSummary.totalViews.toLocaleString()}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="text-sm text-blue-100">Saved</div>
              <div className="text-3xl font-bold mt-2">{analyticsSummary.totalSaves.toLocaleString()}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="text-sm text-blue-100">Shared</div>
              <div className="text-3xl font-bold mt-2">{analyticsSummary.totalShares.toLocaleString()}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
              <div className="text-sm text-blue-100">Avg. rating</div>
              <div className="text-3xl font-bold mt-2">{analyticsSummary.avgRating}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-50">
              <input type="text" placeholder="Search by name or location..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Categories</option>
              {(spotCategories || []).map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Status</option>
              {(spotStatuses || []).map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <div className="text-sm text-gray-500">{filteredSpots.length} spots found</div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Top attractions</h3>
              <span className="text-xs text-gray-500">By total engagement</span>
            </div>
            <div className="space-y-4">
              {analyticsSummary.topSpots.length ? analyticsSummary.topSpots.map((spot, index) => {
                const max = Math.max(...analyticsSummary.topSpots.map(item => item.totalEngagement), 1);
                const width = (spot.totalEngagement / max) * 100;
                return (
                  <div key={spot.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span className="font-medium text-gray-700">#{index + 1} {spot.name}</span>
                      <span>{spot.totalEngagement} engagement</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${width}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Views: {spot.views}</span>
                      <span>Saves: {spot.saves}</span>
                      <span>Shares: {spot.shares}</span>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-gray-500">No attraction data yet.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Performance summary</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-sm">
                <span className="text-blue-700">Active attractions</span>
                <span className="font-semibold text-blue-800">{analyticsSummary.totalSpots}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-700">Engagement rate</span>
                <span className="font-semibold text-emerald-800">
                  {analyticsSummary.totalSpots ? ((analyticsSummary.totalViews / Math.max(analyticsSummary.totalSpots, 1)) * 10).toFixed(1) : '0.0'}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-purple-50 px-3 py-2 text-sm">
                <span className="text-purple-700">Favorite category</span>
                <span className="font-semibold text-purple-800">
                  {(() => {
                    const counts = spots.reduce((acc, spot) => {
                      acc[spot.category || 'general'] = (acc[spot.category || 'general'] || 0) + 1;
                      return acc;
                    }, {});
                    const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                    return topCategory ? topCategory[0] : '—';
                  })()}
                </span>
              </div>
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                Tip: add save_count and share_count fields in Supabase if you want full engagement analytics beyond views.
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 overflow-x-auto">
          <table className="min-w-full bg-white rounded-2xl border border-gray-200">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3"><input type="checkbox" checked={selectedSpotIds.size === filteredSpots.length && filteredSpots.length > 0} onChange={selectAllSpots} /></th>
                <th className="p-3 text-xs uppercase text-gray-500">Name</th>
                <th className="p-3 text-xs uppercase text-gray-500">Category</th>
                <th className="p-3 text-xs uppercase text-gray-500">Status</th>
                <th className="p-3 text-xs uppercase text-gray-500">Views</th>
                <th className="p-3 text-xs uppercase text-gray-500">Rating</th>
                <th className="p-3 text-xs uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpots.map((spot) => (
                <tr key={spot.id} className="border-t border-gray-100">
                  <td className="p-3"><input type="checkbox" checked={selectedSpotIds.has(spot.id)} onChange={() => toggleSelectSpot(spot.id)} /></td>
                  <td className="p-3">
                    <div className="font-medium text-gray-800">{spot.name}</div>
                    <div className="text-xs text-gray-500">{spot.location}</div>
                  </td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${getCategoryDisplay(spot.category).color}`}>{getCategoryDisplay(spot.category).label}</span></td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(spot.status)}`}>{spot.status}</span></td>
                  <td className="p-3 text-sm text-gray-700">{spot.view_count || 0}</td>
                  <td className="p-3 text-sm text-gray-700">{spot.rating ? `${spot.rating}/5` : '—'}</td>
                  <td className="p-3">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEditModal(spot)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => previewSpotPublic(spot)} className="text-xs text-purple-600 hover:underline">Preview</button>
                      <button onClick={() => archiveSpot(spot)} className="text-xs text-yellow-600 hover:underline">Archive</button>
                      <button onClick={() => deleteSpot(spot)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Spots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSpots.map((spot) => {
            const category = getCategoryDisplay(spot.category);
            return (
              <div key={spot.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-48 bg-gray-100">
                  {spot.image_url ? (
                    <img src={spot.image_url} alt={spot.name} className="w-full h-full object-cover" />
                    ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No image</div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${category.color}`}>
                      {category.label}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusBadge(spot.status)}`}>
                      {spot.status}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 text-lg mb-1">{spot.name}</h3>
                  <p className="text-sm text-gray-500 mb-2">Location: {spot.location}</p>
                  {spot.rating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-sm font-medium">Rating:</span>
                      <span className="text-sm font-medium">{spot.rating}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{spot.description || 'No description provided'}</p>
                  {spot.opening_hours && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mb-2">Hours: {spot.opening_hours}</p>
                  )}
                  {spot.entrance_fee && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">Entrance fee: ₱{spot.entrance_fee}</p>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => openEditModal(spot)} className="flex-1 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-100">Edit</button>
                    <button onClick={() => previewSpotPublic(spot)} className="flex-1 bg-purple-50 text-purple-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-purple-100">Preview</button>
                    <button onClick={() => archiveSpot(spot)} className="flex-1 bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-yellow-100">Archive</button>
                    <button onClick={() => deleteSpot(spot)} className="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-100">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredSpots.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <p className="text-gray-400 mt-2">No tourist spots found</p>
            <button onClick={openCreateModal} className="mt-4 text-blue-600 underline">Create your first spot</button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{editingSpot ? 'Edit Tourist Spot' : 'Add New Tourist Spot'}</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Spot Name *</label>
                <input type="text" value={spotForm.name} onChange={e => setSpotForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="e.g., Bagasbas Beach" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input type="text" value={spotForm.location} onChange={e => setSpotForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Barangay, Daet" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select value={spotForm.category} onChange={e => setSpotForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  <option value="">Select category</option>
                  {(spotCategories || []).map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={spotForm.status} onChange={e => setSpotForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  {(spotStatuses || []).map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!spotForm.featured} onChange={e => setSpotForm(p => ({ ...p, featured: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Featured</span>
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Hours</label>
                <input type="text" value={spotForm.opening_hours} onChange={e => setSpotForm(p => ({ ...p, opening_hours: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="e.g., 8:00 AM - 6:00 PM" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entrance Fee (PHP)</label>
                <input type="number" value={spotForm.entrance_fee} onChange={e => setSpotForm(p => ({ ...p, entrance_fee: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="0 for free" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input type="text" value={spotForm.latitude} onChange={e => setSpotForm(p => ({ ...p, latitude: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="14.1122" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input type="text" value={spotForm.longitude} onChange={e => setSpotForm(p => ({ ...p, longitude: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="122.9553" />
                </div>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input type="text" value={spotForm.contact_number} onChange={e => setSpotForm(p => ({ ...p, contact_number: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="(054) 123-4567" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Image</label>
                <MediaUpload
                  bucket="tourist-spots"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={spotForm.image_url}
                  onUploadComplete={(url) => setSpotForm(p => ({ ...p, image_url: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Upload Image"
                  maxSizeMB={5}
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Images</label>
                <MediaUpload
                  bucket="tourist-spots"
                  folder="gallery"
                  mediaType="image"
                  existingMediaUrl=""
                  onUploadComplete={(url) => addGalleryImage(url)}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Add Gallery Image"
                  maxSizeMB={5}
                />
                {galleryUrls.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {galleryUrls.map((img, idx) => (
                      <div key={`${img}-${idx}`} className="relative group">
                        <img src={img} alt={`Gallery ${idx + 1}`} className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                        <button type="button" onClick={() => removeGalleryImage(idx)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5">Close</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">View Count</label>
                <input type="number" value={spotForm.view_count || 0} onChange={e => setSpotForm(p => ({ ...p, view_count: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="0" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating (out of 5)</label>
                <input type="number" step="0.1" min="0" max="5" value={spotForm.rating || 0} onChange={e => setSpotForm(p => ({ ...p, rating: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="4.8" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={spotForm.description} onChange={e => setSpotForm(p => ({ ...p, description: e.target.value }))} rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-xl resize-none" placeholder="Detailed description of the tourist spot..." />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveSpot} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : (editingSpot ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Manage Categories</h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Add new category"
                />
                <button onClick={addCategory} className="bg-blue-600 text-white px-4 py-2 rounded-xl">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(spotCategories || []).map((category) => (
                  <span key={category.value} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${category.color}`}>
                    {category.label}
                    <button type="button" onClick={() => removeCategory(category.value)} className="text-current opacity-70 hover:opacity-100">Remove</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600">Close</button>
            </div>
          </div>
        </div>
      )}

      {showPreviewModal && previewSpot && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden">
            <div className="relative h-64 bg-gray-100">
              {previewSpot.image_url ? <img src={previewSpot.image_url} alt={previewSpot.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No image</div>}
              <button onClick={() => setShowPreviewModal(false)} className="absolute top-3 right-3 bg-white/90 px-3 py-1 rounded-full text-sm">Close</button>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-2xl font-bold text-gray-800">{previewSpot.name}</h3>
                <span className={`text-xs px-3 py-1 rounded-full ${getStatusBadge(previewSpot.status)}`}>{previewSpot.status}</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">Location: {previewSpot.location}</p>
              <p className="text-gray-700 mb-3">{previewSpot.description || 'No description available.'}</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>Opening Hours: {previewSpot.opening_hours || 'Not set'}</div>
                <div>Entrance Fee: {previewSpot.entrance_fee ? `₱${previewSpot.entrance_fee}` : 'Free'}</div>
                <div>Rating: {previewSpot.rating ? `${previewSpot.rating}/5` : 'Not rated'}</div>
                <div>Views: {previewSpot.view_count || 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-2">Bulk Action</h3>
            <p className="text-gray-600 mb-4">Apply an action to {selectedSpotIds.size} selected attraction(s)?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBulkModal(false)} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600">Cancel</button>
              <button onClick={bulkDeleteSpots} className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Tourist Spot"
        message={`Are you sure you want to permanently delete "${confirmingSpot?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setConfirmingSpot(null)
        }}
      />

      <ConfirmationModal
        isOpen={showArchiveConfirm}
        title="Archive Tourist Spot"
        message={`Are you sure you want to archive "${confirmingSpot?.name}"? You can restore it later from drafts.`}
        confirmText="Archive"
        cancelText="Cancel"
        isDangerous={false}
        onConfirm={handleConfirmArchive}
        onCancel={() => {
          setShowArchiveConfirm(false)
          setConfirmingSpot(null)
        }}
      />

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.isError ? 'Warning' : 'Success'} {toastMessage.message}
        </div>
      )}
    </div>
  );
}
