// app/admin/amenities/page.js
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { supabase } from '@/lib/supabase';
import MediaUpload from '@/app/components/MediaUpload';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';

// Lookup lists (populated from DB where possible)

// Amenity type master list. Used by the filter dropdown, the create/edit form,
// and getTypeDisplay() for badge colors. Kept in sync with the types used in
// seed data / docs (accommodation, resort, hotel, cafe, restaurant, transport,
// shop, service, facility, ...). Unknown types still render via the fallback
// in getTypeDisplay().
const AMENITY_TYPES = [
  { value: 'accommodation', label: 'Accommodation', color: 'bg-blue-100 text-blue-700' },
  { value: 'resort', label: 'Resort', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'hotel', label: 'Hotel', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'inn', label: 'Inn', color: 'bg-sky-100 text-sky-700' },
  { value: 'cafe', label: 'Cafe', color: 'bg-amber-100 text-amber-700' },
  { value: 'restaurant', label: 'Restaurant', color: 'bg-orange-100 text-orange-700' },
  { value: 'transport', label: 'Transport', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'shop', label: 'Shop', color: 'bg-pink-100 text-pink-700' },
  { value: 'service', label: 'Service', color: 'bg-violet-100 text-violet-700' },
  { value: 'facility', label: 'Facility', color: 'bg-slate-200 text-slate-700' },
];

// Amenity status master list. Used by the status filter dropdown and the
// create/edit form. Mirrors the values in getStatusBadge() and the DB lookup.
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'temporarily_closed', label: 'Temporarily Closed' },
];

// Amenity sort options (matches the switch in filteredAmenities).
const SORT_OPTIONS = [
  { value: 'created_at_desc', label: 'Newest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'views_desc', label: 'Most viewed' },
  { value: 'saves_desc', label: 'Most saved' },
  { value: 'featured_first', label: 'Featured first' },
];

// Common amenity features used by the Features picker in the create/edit form.
// These are string values that map to entries in info_amenities.amenities[].
const AMENITY_FEATURES = [
  'Parking',
  'WiFi',
  'Free WiFi',
  'Restrooms',
  'Beach Access',
  'Coffee',
  'Breakfast',
  'Pool',
  'Air Conditioning',
  'Family Friendly',
  'Pet Friendly',
];

const normalizeAmenity = (amenity) => ({
  ...amenity,
  type: amenity.type || 'accommodation',
  status: amenity.status || 'active',
  featured: !!amenity.featured,
  images: Array.isArray(amenity.images) ? amenity.images.filter(Boolean) : [],
  amenities: Array.isArray(amenity.amenities) ? amenity.amenities : [],
  views: Number(amenity.views ?? amenity.view_count ?? 0),
  saves: Number(amenity.saves ?? amenity.save_count ?? amenity.saved_count ?? 0),
  rating: Number(amenity.rating ?? 0),
});

export default function AmenitiesManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amenities, setAmenities] = useState([]);
  const [amenityTypes, setAmenityTypes] = useState([]);
  const [amenityFeatures, setAmenityFeatures] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [sortOptions, setSortOptions] = useState([]);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [editingAmenity, setEditingAmenity] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at_desc');
  const [viewMode, setViewMode] = useState('grid');

  const [amenityForm, setAmenityForm] = useState({
    name: '',
    type: 'accommodation',
    description: '',
    location: '',
    latitude: '',
    longitude: '',
    contact_number: '',
    website: '',
    opening_hours: '',
    price_range: '',
    amenities: [],
    images: [],
    status: 'active',
    featured: false,
  });

  // Stable callback: showToast must not change identity every render, otherwise
  // fetchAmenities (which depends on it) gets a new identity each render, which
  // makes the auth useEffect re-run on every render, which calls setState again,
  // producing "Maximum update depth exceeded".
  const showToast = useCallback((message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [typesRes, annsRes] = await Promise.all([
          supabase.from('info_amenities').select('type').neq('type', ''),
          supabase.from('info_amenities').select('amenities').neq('amenities', null)
        ]);

        const types = Array.from(new Set((typesRes?.data || []).map(r => r.type).filter(Boolean)));
        setAmenityTypes(types.map(v => ({ value: v, label: String(v).charAt(0).toUpperCase() + String(v).slice(1) })));

        const featuresSet = new Set();
        (annsRes?.data || []).forEach(r => {
          if (Array.isArray(r.amenities)) r.amenities.forEach(a => a && featuresSet.add(a));
        });
        setAmenityFeatures(Array.from(featuresSet));

        setStatusOptions([
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'temporarily_closed', label: 'Temporarily Closed' }
        ]);

        setSortOptions([
          { value: 'created_at_desc', label: 'Newest first' },
          { value: 'name_asc', label: 'Name A–Z' },
          { value: 'views_desc', label: 'Most viewed' },
          { value: 'saves_desc', label: 'Most saved' },
          { value: 'featured_first', label: 'Featured first' }
        ]);
      } catch (e) {
        console.error('Error loading amenity lookups:', e);
      }
    };
    fetchLookups();
  }, []);

  const fetchAmenities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('info_amenities')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAmenities((data || []).map(normalizeAmenity));
    } catch (err) {
      console.error('Error fetching amenities:', err);
      showToast('Failed to load amenities', true);
    }
  }, [showToast]);

  const saveAmenity = async () => {
    if (!amenityForm.name.trim() || !amenityForm.location.trim() || !amenityForm.type) {
      showToast('Please fill in all required fields', true);
      return;
    }

    setSaving(true);
    try {
      const amenityData = {
        name: amenityForm.name.trim(),
        type: amenityForm.type,
        description: amenityForm.description || '',
        location: amenityForm.location.trim(),
        latitude: amenityForm.latitude ? parseFloat(amenityForm.latitude) : null,
        longitude: amenityForm.longitude ? parseFloat(amenityForm.longitude) : null,
        contact_number: amenityForm.contact_number || '',
        website: amenityForm.website || '',
        opening_hours: amenityForm.opening_hours || '',
        price_range: amenityForm.price_range || '',
        amenities: amenityForm.amenities,
        images: amenityForm.images.filter(Boolean),
        status: amenityForm.status,
        featured: amenityForm.featured,
        rating: amenityForm.rating || 0,
        views: editingAmenity?.views ?? 0,
        saves: editingAmenity?.saves ?? 0,
        created_by: user?.id,
      };

      let result;
      if (editingAmenity) {
        result = await supabase
          .from('info_amenities')
          .update(amenityData)
          .eq('id', editingAmenity.id);
      } else {
        result = await supabase
          .from('info_amenities')
          .insert([amenityData]);
      }

      if (result.error) throw result.error;

      showToast(editingAmenity ? 'Amenity updated successfully!' : 'Amenity added successfully!');
      await fetchAmenities();
      closeModal();
    } catch (err) {
      console.error('Error saving amenity:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const softDeleteAmenity = async (amenity) => {
    if (!window.confirm(`Archive "${amenity.name}" and mark it inactive?`)) return;

    try {
      const { error } = await supabase
        .from('info_amenities')
        .update({ status: 'inactive' })
        .eq('id', amenity.id);

      if (error) throw error;
      showToast(`"${amenity.name}" archived`);
      await fetchAmenities();
    } catch (err) {
      console.error('Error archiving amenity:', err);
      showToast('Failed to archive amenity', true);
    }
  };

  const deleteAmenity = async (amenity) => {
    if (!window.confirm(`Delete "${amenity.name}" permanently?`)) return;

    try {
      const { error } = await supabase
        .from('info_amenities')
        .delete()
        .eq('id', amenity.id);

      if (error) throw error;
      showToast(`"${amenity.name}" deleted`);
      await fetchAmenities();
    } catch (err) {
      console.error('Error deleting amenity:', err);
      showToast('Failed to delete amenity', true);
    }
  };

  const bulkUpdateStatus = async (nextStatus) => {
    if (selectedAmenityIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('info_amenities')
        .update({ status: nextStatus })
        .in('id', Array.from(selectedAmenityIds));

      if (error) throw error;
      showToast(`${selectedAmenityIds.size} amenities updated`);
      setSelectedAmenityIds(new Set());
      setBulkAction('');
      setShowBulkModal(false);
      await fetchAmenities();
    } catch (err) {
      console.error('Error bulk updating amenities:', err);
      showToast(`Failed to update amenities: ${err.message}`, true);
    }
  };

  const bulkDeleteAmenities = async () => {
    if (selectedAmenityIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('info_amenities')
        .delete()
        .in('id', Array.from(selectedAmenityIds));

      if (error) throw error;
      showToast(`${selectedAmenityIds.size} amenities deleted`);
      setSelectedAmenityIds(new Set());
      setBulkAction('');
      setShowBulkModal(false);
      await fetchAmenities();
    } catch (err) {
      console.error('Error deleting amenities:', err);
      showToast(`Failed to delete amenities: ${err.message}`, true);
    }
  };

  const openCreateModal = () => {
    setEditingAmenity(null);
    setAmenityForm({
      name: '',
      type: 'accommodation',
      description: '',
      location: '',
      latitude: '',
      longitude: '',
      contact_number: '',
      website: '',
      opening_hours: '',
      price_range: '',
      amenities: [],
      images: [],
      status: 'active',
      featured: false,
    });
    setShowModal(true);
  };

  const openEditModal = (amenity) => {
    setEditingAmenity(amenity);
    setAmenityForm({
      name: amenity.name || '',
      type: amenity.type || 'accommodation',
      description: amenity.description || '',
      location: amenity.location || '',
      latitude: amenity.latitude || '',
      longitude: amenity.longitude || '',
      contact_number: amenity.contact_number || '',
      website: amenity.website || '',
      opening_hours: amenity.opening_hours || '',
      price_range: amenity.price_range || '',
      amenities: amenity.amenities || [],
      images: amenity.images || [],
      status: amenity.status || 'active',
      featured: amenity.featured || false,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAmenity(null);
  };

  const toggleAmenityFeature = (feature) => {
    setAmenityForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(feature)
        ? prev.amenities.filter((item) => item !== feature)
        : [...prev.amenities, feature],
    }));
  };

  const getTypeDisplay = (type) => {
    const found = AMENITY_TYPES.find((item) => item.value === type);
    return found || { label: type || 'General', color: 'bg-slate-100 text-slate-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-slate-200 text-slate-700',
      temporarily_closed: 'bg-yellow-100 text-yellow-700',
    };
    return badges[status] || 'bg-slate-100 text-slate-700';
  };

  const filteredAmenities = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const items = amenities.filter((amenity) => {
      const matchesSearch =
        !search ||
        amenity.name?.toLowerCase().includes(search) ||
        amenity.location?.toLowerCase().includes(search) ||
        amenity.description?.toLowerCase().includes(search);

      const matchesType = typeFilter === 'all' || amenity.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || amenity.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });

    const sorted = [...items];
    switch (sortBy) {
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'views_desc':
        sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case 'saves_desc':
        sorted.sort((a, b) => (b.saves || 0) - (a.saves || 0));
        break;
      case 'featured_first':
        sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
        break;
      case 'created_at_desc':
      default:
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
    }

    return sorted;
  }, [amenities, searchTerm, typeFilter, statusFilter, sortBy]);

  const summary = useMemo(() => {
    const totalViews = amenities.reduce((sum, item) => sum + Number(item.views || 0), 0);
    const totalSaves = amenities.reduce((sum, item) => sum + Number(item.saves || 0), 0);
    return {
      total: amenities.length,
      active: amenities.filter((item) => item.status === 'active').length,
      inactive: amenities.filter((item) => item.status === 'inactive').length,
      featured: amenities.filter((item) => item.featured).length,
      totalViews,
      totalSaves,
    };
  }, [amenities]);

  useEffect(() => {
    let isActive = true;

    const checkAuth = async () => {
      const session = getStoredSession();
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
        await fetchAmenities();
      } catch (err) {
        console.error('Error loading admin user session:', err);
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
  }, [fetchAmenities, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Amenity Management</h1>
            <p className="text-gray-500 mt-1">View, manage, and monitor amenities across the destination.</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
              className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-full hover:bg-gray-50"
            >
              {viewMode === 'grid' ? 'Table View' : 'Grid View'}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full"
            >
              + Add Amenity
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-800">{summary.total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold text-green-600">{summary.active}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Featured</p>
            <p className="text-2xl font-bold text-yellow-600">{summary.featured}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Views</p>
            <p className="text-2xl font-bold text-blue-600">{summary.totalViews}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Saves</p>
            <p className="text-2xl font-bold text-purple-600">{summary.totalSaves}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col xl:flex-row gap-3 items-center">
            <input
              type="text"
              placeholder="Search by name, location, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full xl:flex-1 px-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-2xl"
            >
              <option value="all">All Categories</option>
              {AMENITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-2xl"
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-2xl"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {selectedAmenityIds.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <span className="text-sm font-medium text-blue-700">{selectedAmenityIds.size} selected</span>
              <button type="button" onClick={() => setShowBulkModal(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm">Bulk actions</button>
              <button type="button" onClick={() => setSelectedAmenityIds(new Set())} className="text-blue-700 text-sm">Clear</button>
            </div>
          )}
        </div>

        {viewMode === 'table' ? (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <input
                        type="checkbox"
                        checked={filteredAmenities.length > 0 && filteredAmenities.every((item) => selectedAmenityIds.has(item.id))}
                        onChange={(e) => {
                          const next = new Set(selectedAmenityIds);
                          if (e.target.checked) {
                            filteredAmenities.forEach((item) => next.add(item.id));
                          } else {
                            filteredAmenities.forEach((item) => next.delete(item.id));
                          }
                          setSelectedAmenityIds(next);
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Views</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Saves</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAmenities.map((amenity) => {
                    const type = getTypeDisplay(amenity.type);
                    return (
                      <tr key={amenity.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedAmenityIds.has(amenity.id)}
                            onChange={() => {
                              const next = new Set(selectedAmenityIds);
                              if (next.has(amenity.id)) next.delete(amenity.id);
                              else next.add(amenity.id);
                              setSelectedAmenityIds(next);
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                              {amenity.images?.[0] ? (
                                <img src={amenity.images[0]} alt={amenity.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">No image</div>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{amenity.name}</p>
                              <p className="text-sm text-gray-500">{amenity.location}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${type.color}`}>
                            {type.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(amenity.status)}`}>
                            {amenity.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{amenity.views}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{amenity.saves}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditModal(amenity)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                            <button type="button" onClick={() => softDeleteAmenity(amenity)} className="text-yellow-600 hover:text-yellow-800 text-sm font-medium">Archive</button>
                            <button type="button" onClick={() => deleteAmenity(amenity)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredAmenities.map((amenity) => {
              const type = getTypeDisplay(amenity.type);
              return (
                <div key={amenity.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative h-44 bg-gray-100">
                    {amenity.images?.[0] ? (
                      <img src={amenity.images[0]} alt={amenity.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-400">No image</div>
                    )}
                    <div className="absolute left-3 top-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${type.color}`}>
                        {type.label}
                      </span>
                    </div>
                    <div className="absolute right-3 top-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(amenity.status)}`}>
                        {amenity.status}
                      </span>
                    </div>
                    {amenity.featured && (
                      <div className="absolute bottom-3 left-3">
                        <span className="rounded-full bg-yellow-400 px-2 py-1 text-xs font-semibold text-yellow-900">Featured</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{amenity.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">Location: {amenity.location}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedAmenityIds.has(amenity.id)}
                        onChange={() => {
                          const next = new Set(selectedAmenityIds);
                          if (next.has(amenity.id)) next.delete(amenity.id);
                          else next.add(amenity.id);
                          setSelectedAmenityIds(next);
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                    </div>

                    {amenity.rating > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-sm text-gray-700">
                        <span className="font-medium">Rating:</span>
                        <span className="font-medium text-gray-700">{amenity.rating}</span>
                      </div>
                    )}

                    <p className="mt-3 text-sm text-gray-600 line-clamp-3">
                      {amenity.description || 'No description provided yet.'}
                    </p>

                    {amenity.amenities?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {amenity.amenities.slice(0, 3).map((feature) => (
                          <span key={feature} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                            {feature.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {amenity.amenities.length > 3 && (
                          <span className="text-[11px] text-gray-500">+{amenity.amenities.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
                      <div className="rounded-lg bg-blue-50 p-2">
                        <div className="text-gray-500">Views</div>
                        <div className="mt-1 font-bold text-blue-700">{amenity.views}</div>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-2">
                        <div className="text-gray-500">Saves</div>
                        <div className="mt-1 font-bold text-purple-700">{amenity.saves}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => openEditModal(amenity)} className="flex-1 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">Edit</button>
                      <button type="button" onClick={() => softDeleteAmenity(amenity)} className="flex-1 rounded-xl bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100">Archive</button>
                      <button type="button" onClick={() => deleteAmenity(amenity)} className="flex-1 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredAmenities.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <div className="text-5xl mb-3">Amenity</div>
            <p className="text-xl font-semibold text-gray-700">No amenities found</p>
            <p className="mt-2 text-gray-500">Try different filters or add your first amenity.</p>
            <button type="button" onClick={openCreateModal} className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-white">
              Add amenity
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">
                {editingAmenity ? 'Edit Amenity' : 'Add New Amenity'}
              </h3>
              <button type="button" onClick={closeModal} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  value={amenityForm.name}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Business or place name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category *</label>
                <select
                  value={amenityForm.type}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                >
                  {AMENITY_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={amenityForm.status}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Location *</label>
                <input
                  type="text"
                  value={amenityForm.location}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Street address or landmark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Contact</label>
                <input
                  type="text"
                  value={amenityForm.contact_number}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, contact_number: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="(054) 123-4567"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Website</label>
                <input
                  type="url"
                  value={amenityForm.website}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, website: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Opening Hours</label>
                <input
                  type="text"
                  value={amenityForm.opening_hours}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, opening_hours: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Mon-Sat 8AM-9PM"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Price Range</label>
                <select
                  value={amenityForm.price_range}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, price_range: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                >
                  <option value="">Select</option>
                  <option value="$">$</option>
                  <option value="$$">$$</option>
                  <option value="$$$">$$$</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  rows={3}
                  value={amenityForm.description}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2"
                  placeholder="Describe the venue, service, or business."
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">Features</label>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_FEATURES.map((feature) => (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleAmenityFeature(feature)}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        amenityForm.amenities.includes(feature)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {feature.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">Image Upload</label>
                <MediaUpload
                  bucket="amenities"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={amenityForm.images[0] || ''}
                  onUploadComplete={(url) => {
                    if (url) {
                      setAmenityForm((prev) => ({ ...prev, images: [...prev.images, url] }));
                    }
                  }}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Upload image"
                  maxSizeMB={5}
                />

                {amenityForm.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {amenityForm.images.map((image, index) => (
                      <div key={`${image}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        <img src={image} alt={`Amenity ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAmenityForm((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== index) }))}
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white"
                        >
                          Close
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-sm font-medium text-gray-700">Mark as featured</span>
                <input
                  type="checkbox"
                  checked={amenityForm.featured}
                  onChange={(e) => setAmenityForm((prev) => ({ ...prev, featured: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="rounded-full border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAmenity}
                disabled={saving}
                className="rounded-full bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingAmenity ? 'Update Amenity' : 'Create Amenity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-800">Bulk actions</h3>
            <p className="mt-2 text-sm text-gray-600">Apply actions to {selectedAmenityIds.size} selected amenities.</p>

            <div className="mt-5 space-y-3">
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
              >
                <option value="">Select action</option>
                <option value="active">Set to Active</option>
                <option value="inactive">Set to Inactive</option>
                <option value="temporarily_closed">Set to Temporarily Closed</option>
                <option value="delete">Delete permanently</option>
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowBulkModal(false)} className="rounded-full border border-gray-300 px-4 py-2 text-gray-700">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!bulkAction) {
                    showToast('Please choose a bulk action', true);
                    return;
                  }
                  if (bulkAction === 'delete') {
                    bulkDeleteAmenities();
                    return;
                  }
                  bulkUpdateStatus(bulkAction);
                }}
                className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className={`fixed bottom-5 right-5 rounded-full px-4 py-2 text-sm font-medium text-white ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
