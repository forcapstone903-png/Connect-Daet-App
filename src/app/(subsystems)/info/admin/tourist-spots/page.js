// app/(subsystems)/info/admin/tourist-spots/page.js
'use client';

import { startTransition, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Bookmark, Eye, LayoutGrid, List, MapPin, MoreHorizontal, Pencil, Share2, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload';
import Comments from '@/app/(subsystems)/info/components/user/Comments';
import {
  getCacheKey,
  getPersistentCache,
  invalidatePersistentCache,
  setPersistentCache,
} from '@/lib/cache';
import {
  normalizeCoordinates,
  touristSpotGeocodeCacheKey,
  TOURIST_SPOT_GEOCODE_CACHE_TTL_MS,
} from '@/lib/touristSpotGeocoding.mjs';
import {
  DAET_BARANGAYS,
  DEFAULT_CATEGORIES,
  LISTINGS_CACHE_VERSION,
  LISTING_TYPES,
  PRICE_RANGES,
  getListingTypeLabel,
} from '@/lib/listings.mjs';
import { notifyToast } from '@/lib/toast.mjs';
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminLoadingScreen,
  AdminPagination,
  AdminPanel,
  AdminSearch,
  AdminShell,
  AdminStatCard,
  AdminToolbar,
} from '@/app/(subsystems)/info/components/admin';

const CATEGORY_COLORS = {
  beach: 'bg-cyan-100 text-cyan-700',
  historical: 'bg-amber-100 text-amber-700',
  nature: 'bg-emerald-100 text-emerald-700',
  cultural: 'bg-purple-100 text-purple-700',
  religious: 'bg-indigo-100 text-indigo-700',
  park: 'bg-green-100 text-green-700',
  market: 'bg-orange-100 text-orange-700',
};

const toCategoryOption = (value) => ({
  value,
  label: String(value).replace(/\b\w/g, (letter) => letter.toUpperCase()),
  color: CATEGORY_COLORS[value] || 'bg-gray-100 text-gray-700',
});

const DEFAULT_SPOT_CATEGORIES = [...new Set(Object.values(DEFAULT_CATEGORIES).flat())].map(toCategoryOption);

const EMPTY_SPOT_FORM = {
  name: '',
  listing_type: 'attraction',
  description: '',
  location: '',
  barangay: '',
  latitude: '',
  longitude: '',
  category: '',
  tags: '',
  opening_hours: '',
  entrance_fee: '',
  price_range: '',
  contact_number: '',
  email: '',
  website: '',
  facebook_url: '',
  image_url: '',
  gallery_images: [],
  status: 'active',
  featured: false,
};

const DEFAULT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Under Maintenance' },
  { value: 'closed', label: 'Closed' },
];

const PUBLIC_SPOTS_CACHE_KEY = getCacheKey('places', 'public', 'all', LISTINGS_CACHE_VERSION);

const invalidatePublicSpotsCache = () => invalidatePersistentCache(PUBLIC_SPOTS_CACHE_KEY);

function splitSpotName(name) {
  const words = String(name || 'Unnamed tourist spot')
    .split(/\s+/)
    .map((word) => word.length > 17 ? `${word.slice(0, 16)}…` : word);
  const lines = [''];

  for (const word of words) {
    const lastLine = lines.length - 1;
    const nextLine = lines[lastLine] ? `${lines[lastLine]} ${word}` : word;
    if (nextLine.length <= 17) {
      lines[lastLine] = nextLine;
    } else if (lines.length < 2) {
      lines.push(word);
    } else {
      lines[1] = `${lines[1].slice(0, 14)}…`;
      break;
    }
  }

  return lines;
}

function PopularTouristSpotsLineChart({ data }) {
  const chartData = data.map((spot) => {
    const views = Number(spot.views);
    return {
      ...spot,
      name: spot.name || 'Unnamed tourist spot',
      views: Number.isFinite(views) ? Math.max(0, views) : 0,
    };
  });
  const maxViews = Math.max(...chartData.map((spot) => spot.views), 0);
  let axisMax = Math.max(maxViews, 1);
  let tickCount = axisMax <= 3 ? axisMax : 4;
  if (tickCount === 4) axisMax = Math.ceil(axisMax / tickCount) * tickCount;

  const plot = { left: 58, right: 620, top: 20, bottom: 176 };
  const points = chartData.map((spot, index) => {
    const x = chartData.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + (index / (chartData.length - 1)) * (plot.right - plot.left);
    const y = plot.bottom - (spot.views / axisMax) * (plot.bottom - plot.top);
    return { ...spot, x, y };
  });
  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ');
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => (
    axisMax - (index * axisMax / tickCount)
  ));

  return (
    <figure className="min-w-0" aria-label="Popular tourist spots by unique account views">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
        <span className="h-0.5 w-4 bg-blue-600" aria-hidden="true" />
        Unique account views
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          className="block h-auto min-w-[560px] w-full"
          viewBox="0 0 680 232"
          role="img"
          aria-labelledby="popular-spots-line-title popular-spots-line-description"
        >
          <title id="popular-spots-line-title">Popular tourist spots</title>
          <desc id="popular-spots-line-description">
            A line chart comparing unique account views for the top tourist spots over the last 90 days.
          </desc>

          {ticks.map((tick) => {
            const y = plot.bottom - (tick / axisMax) * (plot.bottom - plot.top);
            return (
              <g key={tick}>
                <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={plot.left - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">
                  {tick.toLocaleString()}
                </text>
              </g>
            );
          })}

          <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((spot) => (
            <g key={spot.id || spot.name}>
              <circle cx={spot.x} cy={spot.y} r="5" fill="white" stroke="#2563eb" strokeWidth="3">
                <title>{`${spot.name}: ${spot.views.toLocaleString()} views`}</title>
              </circle>
              <text
                x={spot.x}
                y={spot.y <= plot.top + 12 ? spot.y + 20 : spot.y - 9}
                textAnchor="middle"
                fill="#334155"
                fontSize="10"
              >
                {spot.views.toLocaleString()}
              </text>
              <text x={spot.x} y={plot.bottom + 18} textAnchor="middle" fill="#475569" fontSize="10">
                {splitSpotName(spot.name).map((line, index) => (
                  <tspan key={`${spot.name}-${index}`} x={spot.x} dy={index === 0 ? 0 : 12}>{line}</tspan>
                ))}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul className="sr-only">
        {points.map((spot) => (
          <li key={spot.id || spot.name}>{spot.name}: {spot.views.toLocaleString()} unique account views.</li>
        ))}
      </ul>
    </figure>
  );
}

export default function TouristSpotsManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spotsLoading, setSpotsLoading] = useState(true);
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
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedSpotIds, setSelectedSpotIds] = useState(new Set());
  const [categoryDraft, setCategoryDraft] = useState('');
  const [categoryType, setCategoryType] = useState('attraction');
  // Managed list from listing_categories (null = API unavailable, free text allowed).
  const [managedCategories, setManagedCategories] = useState(null);
  const [galleryUrls, setGalleryUrls] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [confirmingSpot, setConfirmingSpot] = useState(null);
  const [currentSpotPage, setCurrentSpotPage] = useState(1);
  const SPOTS_PER_PAGE = 9;

  const [typeFilter, setTypeFilter] = useState('all');
  const [spotForm, setSpotForm] = useState(EMPTY_SPOT_FORM);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState('');
  const geocodeRequestRef = useRef(0);
  const resolvedGeocodeKeyRef = useRef('');

  const showToast = useCallback((message, isError = false) => {
    setToastMessage(null);
    notifyToast(message, isError ? 'error' : undefined);
  }, []);

  const lookupCoordinates = async ({ refresh = false } = {}) => {
    const location = spotForm.location.trim();
    const barangay = spotForm.barangay.trim();
    if (!location) return;

    const cacheKey = touristSpotGeocodeCacheKey(location, barangay);
    if (!refresh && cacheKey === resolvedGeocodeKeyRef.current
      && String(spotForm.latitude) !== '' && String(spotForm.longitude) !== '') return;

    const requestId = ++geocodeRequestRef.current;
    setGeocoding(true);
    setGeocodeMessage('Looking up coordinates from the address...');

    try {
      if (refresh) invalidatePersistentCache(cacheKey);
      const cachedCoordinates = refresh
        ? null
        : normalizeCoordinates(getPersistentCache(cacheKey)?.data);
      if (cachedCoordinates) {
        resolvedGeocodeKeyRef.current = cacheKey;
        setSpotForm((previous) => ({
          ...previous,
          latitude: String(cachedCoordinates.latitude),
          longitude: String(cachedCoordinates.longitude),
        }));
        setGeocodeMessage('Coordinates loaded from the saved address lookup.');
        return;
      }

      const params = new URLSearchParams({ location, barangay });
      if (refresh) params.set('refresh', '1');
      const response = await fetch(`/info/api/admin/tourist-spots/geocode?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (requestId !== geocodeRequestRef.current) return;

      if (response.status === 404) {
        setGeocodeMessage(result.message || 'No matching address found. Enter coordinates manually.');
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Address lookup is temporarily unavailable.');
      }

      const coordinates = normalizeCoordinates(result.coordinates);
      if (!coordinates) throw new Error('The address lookup returned invalid coordinates.');

      setPersistentCache(cacheKey, coordinates, TOURIST_SPOT_GEOCODE_CACHE_TTL_MS);
      resolvedGeocodeKeyRef.current = cacheKey;
      setSpotForm((previous) => (
        previous.location.trim() === location && previous.barangay.trim() === barangay
          ? {
            ...previous,
            latitude: String(coordinates.latitude),
            longitude: String(coordinates.longitude),
          }
          : previous
      ));
      setGeocodeMessage('Coordinates filled from the address. Review them before saving.');
    } catch (error) {
      if (requestId === geocodeRequestRef.current) {
        console.error('Tourist-spot address lookup failed:', error);
        setGeocodeMessage(error.message || 'Address lookup is temporarily unavailable. Enter coordinates manually.');
      }
    } finally {
      if (requestId === geocodeRequestRef.current) setGeocoding(false);
    }
  };

  const updateAddressField = (field, value) => {
    geocodeRequestRef.current += 1;
    resolvedGeocodeKeyRef.current = '';
    setGeocoding(false);
    setGeocodeMessage('');
    setSpotForm((previous) => ({
      ...previous,
      [field]: value,
      latitude: '',
      longitude: '',
    }));
  };

  const updateCoordinateField = (field, value) => {
    geocodeRequestRef.current += 1;
    setGeocoding(false);
    const nextForm = { ...spotForm, [field]: value };
    resolvedGeocodeKeyRef.current = nextForm.latitude !== '' && nextForm.longitude !== ''
      ? touristSpotGeocodeCacheKey(nextForm.location, nextForm.barangay)
      : '';
    setSpotForm(nextForm);
    setGeocodeMessage('');
  };

  const fetchSpots = useCallback(async () => {
    setSpotsLoading(true);
    try {
      const response = await fetch('/info/api/admin/tourist-spots', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Failed to fetch spots (${response.status})`);
      
      const result = await response.json();
      if (result.success) {
        setSpots(result.spots || []);
      } else {
        throw new Error(result.message || 'Failed to fetch spots');
      }
    } catch (err) {
      console.error('Error fetching spots:', err);
      showToast('Failed to load tourist spots', true);
    } finally {
      setSpotsLoading(false);
    }
  }, [showToast]);

  const loadManagedCategories = useCallback(async () => {
    try {
      const response = await fetch('/info/api/admin/listing-categories', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Categories unavailable');
      setManagedCategories(result.categories || []);
    } catch (error) {
      console.error('Managed listing categories unavailable:', error);
      setManagedCategories(null);
    }
  }, []);

  // Load distinct categories and statuses from DB to replace hardcoded lists
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const { data, error } = await supabase.from('info_tourist_spots').select('category, status');
        if (error) throw error;
        // Keep the suggested categories for every listing type and add any
        // custom ones already used in the database.
        const cats = Array.from(new Set([
          ...DEFAULT_SPOT_CATEGORIES.map((cat) => cat.value),
          ...(data || []).map(r => r.category).filter(Boolean),
        ]));
        setSpotCategories(cats.map(toCategoryOption));
        const discoveredStatuses = (data || []).map(r => r.status).filter(Boolean);
        const statusOptions = new Map(DEFAULT_STATUS_OPTIONS.map((status) => [status.value, status]));
        for (const value of discoveredStatuses) {
          if (!statusOptions.has(value)) {
            statusOptions.set(value, {
              value,
              label: String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            });
          }
        }
        setSpotStatuses([...statusOptions.values()]);
      } catch (e) {
        console.error('Error loading tourist spots lookups:', e);
      }
      await loadManagedCategories();
    };
    loadLookups();
  }, [loadManagedCategories]);

  const saveSpot = async () => {
    if (geocoding) return;
    if (!spotForm.name.trim() || !spotForm.location.trim() || !spotForm.category) {
      showToast('Please fill in all required fields', true);
      return;
    }

    setSaving(true);
    try {
      // Validation and normalisation happen server-side (src/lib/listings.mjs).
      // Rating is not sent: it is calculated from visitor reviews.
      const spotData = {
        ...spotForm,
        gallery_images: spotForm.gallery_images?.length ? spotForm.gallery_images : [],
      };

      let response;
      if (editingSpot) {
        response = await fetch(`/info/api/admin/tourist-spots/${editingSpot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spotData)
        });
      } else {
        response = await fetch('/info/api/admin/tourist-spots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spotData)
        });
      }

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Request failed (${response.status})`);
      }

      invalidatePublicSpotsCache();
      showToast(editingSpot ? 'Listing updated successfully!' : 'Listing created successfully!');
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

    const nextStatus = confirmingSpot.status === 'inactive' ? 'active' : 'inactive'
    try {
      const response = await fetch(`/info/api/admin/tourist-spots/${confirmingSpot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextStatus === 'inactive' ? 'archive' : 'restore' })
      });

      if (!response.ok) throw new Error('Failed to archive spot');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to archive spot');

      invalidatePublicSpotsCache();
      showToast(nextStatus === 'inactive' ? `"${confirmingSpot.name}" archived` : `"${confirmingSpot.name}" reactivated`);
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
      const response = await fetch(`/info/api/admin/tourist-spots/${confirmingSpot.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete spot');
      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to delete spot');

      invalidatePublicSpotsCache();
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
      const response = await fetch('/info/api/admin/tourist-spots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedSpotIds),
          action: newStatus === 'featured' ? 'feature' : newStatus === 'inactive' ? 'archive' : 'restore',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
      invalidatePublicSpotsCache();
      showToast(newStatus === 'featured' ? `${selectedSpotIds.size} spots featured` : `${selectedSpotIds.size} spots updated`, false);
      setSelectedSpotIds(new Set());
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
      const response = await fetch('/info/api/admin/tourist-spots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');
      invalidatePublicSpotsCache();
      showToast(`${ids.length} spots deleted`, false);
      setSelectedSpotIds(new Set());
      setShowBulkModal(false);
      fetchSpots();
    } catch (err) {
      console.error('Error deleting spots:', err);
      showToast(`Failed to delete spots: ${err.message}`, true);
    }
  };

  const openCreateModal = useCallback((initialType = 'attraction') => {
    geocodeRequestRef.current += 1;
    resolvedGeocodeKeyRef.current = '';
    setGeocoding(false);
    setGeocodeMessage('');
    setEditingSpot(null);
    setGalleryUrls([]);
    const listingType = LISTING_TYPES.some((type) => type.value === initialType) ? initialType : 'attraction';
    setSpotForm({ ...EMPTY_SPOT_FORM, listing_type: listingType });
    setShowModal(true);
  }, []);

  const openEditModal = (spot) => {
    geocodeRequestRef.current += 1;
    resolvedGeocodeKeyRef.current = String(spot.latitude ?? '') !== '' && String(spot.longitude ?? '') !== ''
      ? touristSpotGeocodeCacheKey(spot.location || '', spot.barangay || '')
      : '';
    setGeocoding(false);
    setGeocodeMessage('');
    setEditingSpot(spot);
    setGalleryUrls(spot.gallery_images || []);
    setSpotForm({
      name: spot.name || '',
      listing_type: spot.listing_type || 'attraction',
      description: spot.description || '',
      location: spot.location || '',
      barangay: spot.barangay || '',
      latitude: spot.latitude ?? '',
      longitude: spot.longitude ?? '',
      category: spot.category || '',
      tags: (spot.tags || []).join(', '),
      opening_hours: spot.opening_hours || '',
      entrance_fee: spot.entrance_fee ?? '',
      price_range: spot.price_range || '',
      contact_number: spot.contact_number || '',
      email: spot.email || '',
      website: spot.website || '',
      facebook_url: spot.facebook_url || '',
      image_url: spot.image_url || '',
      gallery_images: spot.gallery_images || [],
      status: spot.status || 'active',
      featured: spot.featured || false
    });
    setShowModal(true);
  };

  const closeModal = () => {
    geocodeRequestRef.current += 1;
    resolvedGeocodeKeyRef.current = '';
    setGeocoding(false);
    setGeocodeMessage('');
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

  const callCategoriesApi = async (method, body) => {
    const response = await fetch('/info/api/admin/listing-categories', {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || 'Category request failed.');
    return result;
  };

  const addCategory = async () => {
    const value = categoryDraft.trim();
    if (!value) return;
    try {
      await callCategoriesApi('POST', { listing_type: categoryType, name: value });
      setCategoryDraft('');
      await loadManagedCategories();
      showToast('Category saved');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  const setCategoryActive = async (category, isActive) => {
    try {
      await callCategoriesApi('PATCH', { id: category.id, is_active: isActive });
      await loadManagedCategories();
      showToast(isActive ? 'Category shown again' : 'Category hidden from new listings');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete the category "${category.name}"?`)) return;
    try {
      await callCategoriesApi('DELETE', { id: category.id });
      await loadManagedCategories();
      showToast('Category deleted');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  const getCategoryDisplay = (category) => {
    const found = (spotCategories || []).find(c => c.value === category);
    return found || { label: category || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const toggleSelectSpot = (spotId) => {
    const next = new Set(selectedSpotIds);
    if (next.has(spotId)) next.delete(spotId);
    else next.add(spotId);
    setSelectedSpotIds(next);
  };

  const selectAllSpots = () => {
    const visibleIds = paginatedSpots.map((spot) => spot.id);
    if (visibleIds.length && visibleIds.every((id) => selectedSpotIds.has(id))) {
      setSelectedSpotIds((current) => new Set([...current].filter((id) => !visibleIds.includes(id))));
      return;
    }
    setSelectedSpotIds((current) => new Set([...current, ...visibleIds]));
  };

  const filteredSpots = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const filtered = spots.filter(spot => {
      const matchesSearch = [spot.name, spot.location, spot.barangay, ...(spot.tags || [])]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const matchesType = typeFilter === 'all' || (spot.listing_type || 'attraction') === typeFilter;
      const matchesCategory = categoryFilter === 'all' || spot.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || spot.status === statusFilter;
      return matchesSearch && matchesType && matchesCategory && matchesStatus;
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sortBy === 'views') return Number(b.view_count || 0) - Number(a.view_count || 0);
      if (sortBy === 'rating') return Number(b.rating || 0) - Number(a.rating || 0);
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
  }, [spots, searchTerm, typeFilter, categoryFilter, statusFilter, sortBy]);

  const typeCounts = useMemo(() => spots.reduce((counts, spot) => {
    const type = spot.listing_type || 'attraction';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {}), [spots]);

  const totalSpotPages = Math.ceil(filteredSpots.length / SPOTS_PER_PAGE);
  const paginatedSpots = filteredSpots.slice(
    (currentSpotPage - 1) * SPOTS_PER_PAGE,
    currentSpotPage * SPOTS_PER_PAGE
  );

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
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    return {
      totalViews,
      totalSaves,
      totalShares,
      avgRating,
      totalSpots: spots.length,
      activeSpots: spots.filter((spot) => spot.status === 'active').length,
      featuredSpots: spots.filter((spot) => spot.featured).length,
      topSpots,
      hasSaveShareTracking: spots.some((spot) => Object.prototype.hasOwnProperty.call(spot, 'save_count') || Object.prototype.hasOwnProperty.call(spot, 'share_count'))
    };
  }, [spots]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('action') !== 'create') return undefined
    const frame = window.requestAnimationFrame(() => openCreateModal())
    return () => window.cancelAnimationFrame(frame)
  }, [openCreateModal])

  useEffect(() => {
    let isActive = true;

    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        setLoading(false);
        router.push('/info/login');
        return;
      }

      try {
        const userData = JSON.parse(session);
        if (!hasAdminAccess(userData.role)) {
          setLoading(false);
          router.push('/info/admin/dashboard');
          return;
        }

        if (!isActive) return;
        setUser(userData);
      } catch (error) {
        console.error('Error loading admin user session:', error);
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
  }, [router]);

  // Filters are applied in the request; pagination is clamped when results arrive.
  useEffect(() => {
    if (!user) return;
    startTransition(() => {
      void fetchSpots();
    });
  }, [fetchSpots, user]);

  if (loading) {
    return <AdminLoadingScreen label="Loading tourist spots..." />;
  }

  return (
    <AdminShell
      user={user}
      eyebrow="Content"
      title="Places Directory"
      description="Manage Daet's attractions, accommodations, restaurants, and local businesses."
      headerIcon="attractions"
      actions={(
        <>
          <AdminButton variant="secondary" size="sm" onClick={() => setShowCategoryModal(true)}>Categories</AdminButton>
          <AdminButton variant="primary" icon="plus" onClick={() => openCreateModal(typeFilter)}>Add Listing</AdminButton>
        </>
      )}
    >
      <div className="admin-page-shell">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <AdminStatCard label="Total tourist spots" value={spotsLoading && !spots.length ? null : analyticsSummary.totalSpots} loading={spotsLoading && !spots.length} icon="attractions" tone="brand" />
            <AdminStatCard label="Active" value={spotsLoading && !spots.length ? null : analyticsSummary.activeSpots} loading={spotsLoading && !spots.length} icon="check" tone="success" />
            <AdminStatCard label="Featured" value={spotsLoading && !spots.length ? null : analyticsSummary.featuredSpots} loading={spotsLoading && !spots.length} icon="star" tone="info" />
            <AdminStatCard label="Unique account views" value={spotsLoading && !spots.length ? null : analyticsSummary.totalViews.toLocaleString()} loading={spotsLoading && !spots.length} icon="analytics" tone="violet" />
            <AdminStatCard label="Saves" value={spotsLoading && !spots.length ? null : analyticsSummary.totalSaves.toLocaleString()} loading={spotsLoading && !spots.length} icon="content" tone="danger" />
            <AdminStatCard label="Shares" value={spotsLoading && !spots.length ? null : analyticsSummary.totalShares.toLocaleString()} loading={spotsLoading && !spots.length} icon="analytics" tone="warning" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
            <AdminPanel
              title="Popular tourist spots"
              description="Destinations ranked by unique signed-in accounts over the last 90 days."
              bodyClassName="!pt-0"
            >
              {analyticsSummary.topSpots.length
                ? <PopularTouristSpotsLineChart data={analyticsSummary.topSpots} />
                : <p className="text-sm text-slate-500">No tourist spots to rank yet.</p>}
            </AdminPanel>

            <AdminPanel
              title="Performance summary"
              description="At-a-glance destination performance."
              className="flex h-full flex-col"
              bodyClassName="!flex-1 !pt-0"
            >
              <dl className="flex h-full flex-col divide-y divide-slate-100">
                <div className="flex flex-1 items-center justify-between gap-3 py-3 first:pt-0">
                  <dt className="text-sm text-slate-600">Active attractions</dt>
                  <dd className="font-bold tabular-nums text-slate-900">{analyticsSummary.activeSpots}</dd>
                </div>
                <div className="flex flex-1 items-center justify-between gap-3 py-3">
                  <dt className="text-sm text-slate-600">Engagement rate</dt>
                  <dd className="font-bold tabular-nums text-slate-900">
                    {analyticsSummary.totalSpots ? ((analyticsSummary.totalViews / analyticsSummary.totalSpots) * 10).toFixed(1) : '0.0'}%
                  </dd>
                </div>
                <div className="flex flex-1 items-center justify-between gap-3 py-3 last:pb-0">
                  <dt className="text-sm text-slate-600">Favorite category</dt>
                  <dd className="max-w-[55%] truncate font-bold capitalize text-slate-900">
                    {(() => {
                      const counts = spots.reduce((acc, spot) => {
                        acc[spot.category || 'general'] = (acc[spot.category || 'general'] || 0) + 1;
                        return acc;
                      }, {});
                      const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                      return topCategory ? String(topCategory[0]).replace(/[_-]/g, ' ') : '—';
                    })()}
                  </dd>
                </div>
              </dl>
              {!analyticsSummary.hasSaveShareTracking ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                  Save and share totals are unavailable in the current data schema.
                </p>
              ) : null}
            </AdminPanel>
          </div>

          <AdminPanel
            title={typeFilter === 'all' ? 'All listings' : getListingTypeLabel(typeFilter, { plural: true })}
            description={`${filteredSpots.length} ${filteredSpots.length === 1 ? 'listing' : 'listings'} found`}
            actions={(
              <div className="flex rounded-xl border border-slate-200 p-1" role="group" aria-label="Tourist spot view">
                <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <LayoutGrid className="h-4 w-4" />Grid
                </button>
                <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <List className="h-4 w-4" />List
                </button>
              </div>
            )}
            bodyClassName="!p-0"
          >
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2 sm:px-5" role="tablist" aria-label="Listing type">
              {[{ value: 'all', label: 'All' }, ...LISTING_TYPES].map((type) => {
                const count = type.value === 'all' ? spots.length : (typeCounts[type.value] || 0);
                const selected = typeFilter === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => { setCurrentSpotPage(1); setSelectedSpotIds(new Set()); setTypeFilter(type.value); }}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${selected ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {type.value === 'all' ? 'All' : type.plural} <span className="tabular-nums text-slate-400">{count}</span>
                  </button>
                );
              })}
            </div>
            <AdminToolbar className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <AdminSearch
                value={searchTerm}
                onChange={(value) => { setCurrentSpotPage(1); setSelectedSpotIds(new Set()); setSearchTerm(value); }}
                placeholder="Search by name or location..."
                label="Search tourist spots"
                className="min-w-[220px] flex-1"
              />
              <label className="sr-only" htmlFor="spot-category-filter">Filter by category</label>
              <select id="spot-category-filter" value={categoryFilter} onChange={(event) => { setCurrentSpotPage(1); setSelectedSpotIds(new Set()); setCategoryFilter(event.target.value); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="all">All Categories</option>
                {spotCategories.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
              </select>
              <label className="sr-only" htmlFor="spot-status-filter">Filter by status</label>
              <select id="spot-status-filter" value={statusFilter} onChange={(event) => { setCurrentSpotPage(1); setSelectedSpotIds(new Set()); setStatusFilter(event.target.value); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="all">All Status</option>
                {spotStatuses.map((status) => <option key={status.value} value={status.value}>{status.value === 'inactive' ? 'Archived' : status.label}</option>)}
              </select>
              <label className="sr-only" htmlFor="spot-sort">Sort tourist spots</label>
              <select id="spot-sort" value={sortBy} onChange={(event) => { setCurrentSpotPage(1); setSelectedSpotIds(new Set()); setSortBy(event.target.value); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="newest">Recently updated</option>
                <option value="name">Name</option>
                <option value="views">Most viewed</option>
                <option value="rating">Highest rated</option>
              </select>
            </AdminToolbar>

            {selectedSpotIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-4 py-3 sm:px-5">
                <span className="mr-auto text-sm font-semibold text-blue-900">{selectedSpotIds.size} selected</span>
                <AdminButton size="sm" variant="secondary" onClick={() => bulkUpdateSpots('featured')}>Feature</AdminButton>
                <AdminButton size="sm" variant="secondary" onClick={() => bulkUpdateSpots('inactive')}>Archive</AdminButton>
                <AdminButton size="sm" variant="outline-danger" icon="delete" onClick={() => setShowBulkModal(true)}>Delete</AdminButton>
                <button type="button" onClick={() => setSelectedSpotIds(new Set())} className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>
              </div>
            ) : null}

            {spotsLoading && !spots.length ? (
              <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Loading tourist spots">
                {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : !filteredSpots.length ? (
              <div className="p-8 sm:p-12">
                <AdminEmptyState
                  icon="attractions"
                  title={spots.length ? 'No tourist spots found' : 'No Tourist Spots'}
                  description={spots.length ? 'Try adjusting your search or filters.' : 'There are currently no tourist destinations in the system.'}
                  action={!spots.length ? <AdminButton variant="primary" icon="plus" onClick={() => openCreateModal(typeFilter)}>Add Listing</AdminButton> : null}
                />
              </div>
            ) : viewMode === 'grid' ? (
              <div className="p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <input
                    type="checkbox"
                    checked={paginatedSpots.length > 0 && paginatedSpots.every((spot) => selectedSpotIds.has(spot.id))}
                    onChange={selectAllSpots}
                    aria-label="Select all tourist spots on this page"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  <span className="text-xs font-semibold text-slate-500">Select visible spots</span>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                  {paginatedSpots.map((spot) => {
                    const category = getCategoryDisplay(spot.category);
                    return (
                      <article key={spot.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
                        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                          {spot.image_url ? (
                            <img src={spot.image_url} alt={spot.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
                              <MapPin className="h-7 w-7 text-blue-400" />
                              <span className="text-xs font-medium">No image available</span>
                            </div>
                          )}
                          <label className="absolute left-2 top-2 rounded-md bg-white/95 p-1 shadow-sm" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" checked={selectedSpotIds.has(spot.id)} onChange={() => toggleSelectSpot(spot.id)} aria-label={`Select ${spot.name}`} className="h-3.5 w-3.5 accent-blue-600" />
                          </label>
                          <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${category.color}`}>{category.label}</span>
                            <AdminBadge status={spot.status} dot>{spot.status === 'inactive' ? 'Archived' : spot.status}</AdminBadge>
                          </div>
                          {spot.featured ? <span className="absolute bottom-2 left-2"><AdminBadge tone="brand"><Star className="mr-1 h-3 w-3 fill-current" />Featured</AdminBadge></span> : null}
                        </div>
                        <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">{getListingTypeLabel(spot.listing_type)}</p>
                          <h3 className="truncate text-sm font-bold text-slate-900">{spot.name}</h3>
                          <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500"><MapPin className="h-3 w-3 shrink-0 text-slate-400" />{spot.location}</p>
                          <p className="mt-2 min-h-8 line-clamp-2 text-[11px] leading-4 text-slate-600">{spot.description || 'No description provided.'}</p>
                          <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2.5">
                            <span className="flex items-center gap-1 text-[10px] text-slate-500"><Eye className="h-3 w-3 text-blue-500" />{Number(spot.view_count || 0).toLocaleString()}</span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-500"><Bookmark className="h-3 w-3 text-blue-500" />{Number(spot.save_count || 0).toLocaleString()}</span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-500"><Share2 className="h-3 w-3 text-blue-500" />{Number(spot.share_count || 0).toLocaleString()}</span>
                          </div>
                          <div className="mt-auto flex items-center gap-1.5 pt-3">
                            <AdminButton size="sm" variant="primary" icon="edit" onClick={() => openEditModal(spot)}>Edit</AdminButton>
                            <AdminButton size="sm" variant="secondary" icon="eye" onClick={() => previewSpotPublic(spot)}>Preview</AdminButton>
                            <details className="relative ml-auto">
                              <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label={`More actions for ${spot.name}`}><MoreHorizontal className="h-4 w-4" /></summary>
                              <div className="absolute bottom-9 right-0 z-20 min-w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                <button type="button" onClick={() => archiveSpot(spot)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Archive className="h-3.5 w-3.5" />{spot.status === 'inactive' ? 'Reactivate' : 'Archive'}</button>
                                <button type="button" onClick={() => deleteSpot(spot)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                              </div>
                            </details>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-2 sm:px-4">
                <div className="mb-3 flex items-center gap-2 px-2 pt-3">
                  <input type="checkbox" checked={paginatedSpots.length > 0 && paginatedSpots.every((spot) => selectedSpotIds.has(spot.id))} onChange={selectAllSpots} aria-label="Select all tourist spots on this page" className="h-4 w-4 accent-blue-600" />
                  <span className="text-xs font-semibold text-slate-500">Select visible spots</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Tourist Spot</th>
                        <th className="px-3 py-3">Location</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Views</th>
                        <th className="px-3 py-3">Rating</th>
                        <th className="px-3 py-3">Updated</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedSpots.map((spot) => (
                        <tr key={spot.id} className="transition hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <input type="checkbox" checked={selectedSpotIds.has(spot.id)} onChange={() => toggleSelectSpot(spot.id)} aria-label={`Select ${spot.name}`} className="h-4 w-4 accent-blue-600" />
                              {spot.image_url ? <img src={spot.image_url} alt="" className="h-10 w-14 rounded-lg border border-slate-200 object-cover" /> : <span className="flex h-10 w-14 items-center justify-center rounded-lg bg-slate-100 text-blue-500"><MapPin className="h-4 w-4" /></span>}
                              <span className="font-semibold text-slate-800">{spot.name}</span>
                            </div>
                          </td>
                          <td className="max-w-48 truncate px-3 py-3 text-sm text-slate-600">{spot.location}</td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${getCategoryDisplay(spot.category).color}`}>{getCategoryDisplay(spot.category).label}</span></td>
                          <td className="px-3 py-3"><AdminBadge status={spot.status} dot>{spot.status === 'inactive' ? 'Archived' : spot.status}</AdminBadge></td>
                          <td className="px-3 py-3 text-sm tabular-nums text-slate-600">{Number(spot.view_count || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-sm tabular-nums text-slate-600">{spot.rating ? `${spot.rating}/5` : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{spot.updated_at ? new Date(spot.updated_at).toLocaleDateString() : '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => openEditModal(spot)} aria-label={`Edit ${spot.name}`} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                              <button type="button" onClick={() => previewSpotPublic(spot)} aria-label={`Preview ${spot.name}`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                              <button type="button" onClick={() => archiveSpot(spot)} aria-label={`${spot.status === 'inactive' ? 'Reactivate' : 'Archive'} ${spot.name}`} className="rounded-lg p-2 text-amber-700 hover:bg-amber-50"><Archive className="h-4 w-4" /></button>
                              <button type="button" onClick={() => deleteSpot(spot)} aria-label={`Delete ${spot.name}`} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {totalSpotPages > 1 ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 sm:px-5">
                <AdminPagination
                  page={currentSpotPage}
                  totalPages={totalSpotPages}
                  totalItems={filteredSpots.length}
                  pageSize={SPOTS_PER_PAGE}
                  itemLabel="spots"
                  onPageChange={setCurrentSpotPage}
                />
              </div>
            ) : null}
          </AdminPanel>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              {editingSpot ? `Edit ${getListingTypeLabel(spotForm.listing_type)}` : `Add ${getListingTypeLabel(spotForm.listing_type)}`}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <p className="sm:col-span-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Basic information</p>
              <div>
                <label htmlFor="spot-listing-type" className="block text-sm font-medium text-gray-700 mb-1">Listing type *</label>
                <select id="spot-listing-type" value={spotForm.listing_type} onChange={e => setSpotForm(p => ({ ...p, listing_type: e.target.value, category: '' }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  {LISTING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="spot-category" className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                {managedCategories ? (
                  <select
                    id="spot-category"
                    value={spotForm.category}
                    onChange={e => setSpotForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white"
                  >
                    <option value="">Choose a category</option>
                    {managedCategories
                      .filter((cat) => cat.listing_type === spotForm.listing_type && (cat.is_active || cat.slug === spotForm.category))
                      .map((cat) => <option key={cat.id} value={cat.slug}>{cat.name}{cat.is_active ? '' : ' (hidden)'}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      id="spot-category"
                      list="spot-category-options"
                      value={spotForm.category}
                      onChange={e => setSpotForm(p => ({ ...p, category: e.target.value.toLowerCase() }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                      placeholder={`e.g., ${(DEFAULT_CATEGORIES[spotForm.listing_type] || [])[0] || 'beach'}`}
                    />
                    <datalist id="spot-category-options">
                      {[...new Set([...(DEFAULT_CATEGORIES[spotForm.listing_type] || []), ...(spotCategories || []).map((cat) => cat.value)])].map((value) => <option key={value} value={value} />)}
                    </datalist>
                  </>
                )}
                <button type="button" onClick={() => { setCategoryType(spotForm.listing_type); setShowCategoryModal(true); }} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">Manage categories</button>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="spot-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input id="spot-name" type="text" value={spotForm.name} onChange={e => setSpotForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="e.g., Bagasbas Beach" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="spot-tags" className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <input id="spot-tags" type="text" value={spotForm.tags} onChange={e => setSpotForm(p => ({ ...p, tags: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="surfing, family friendly, sunset view" />
                <p className="mt-1 text-xs text-gray-500">Separate with commas. Used in search.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={spotForm.description} onChange={e => setSpotForm(p => ({ ...p, description: e.target.value }))} rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-xl resize-none" placeholder="Detailed description of the tourist spot..." />
              </div>

              <p className="sm:col-span-2 mt-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Location</p>
              <div>
                <label htmlFor="spot-location" className="block text-sm font-medium text-gray-700 mb-1">Address / Area *</label>
                <input
                  id="spot-location"
                  type="text"
                  value={spotForm.location}
                  onChange={(e) => updateAddressField('location', e.target.value)}
                  onBlur={(e) => {
                    if (!['spot-barangay', 'refresh-spot-geocode'].includes(e.relatedTarget?.id)) {
                      void lookupCoordinates();
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Street, Daet"
                />
              </div>
              <div>
                <label htmlFor="spot-barangay" className="block text-sm font-medium text-gray-700 mb-1">Barangay</label>
                <select
                  id="spot-barangay"
                  value={spotForm.barangay}
                  onChange={(e) => updateAddressField('barangay', e.target.value)}
                  onBlur={(e) => {
                    if (e.relatedTarget?.id !== 'refresh-spot-geocode') void lookupCoordinates();
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                >
                  <option value="">Not set</option>
                  {DAET_BARANGAYS.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input type="text" value={spotForm.latitude} onChange={e => updateCoordinateField('latitude', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="14.1122" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input type="text" value={spotForm.longitude} onChange={e => updateCoordinateField('longitude', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="122.9553" />
                </div>
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-500" aria-live="polite">
                  {geocoding ? 'Looking up coordinates from the address...' : geocodeMessage || 'Coordinates are suggested when you leave the address fields.'}
                  {' '}© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>
                </p>
                <button
                  id="refresh-spot-geocode"
                  type="button"
                  onClick={() => void lookupCoordinates({ refresh: true })}
                  disabled={geocoding || !spotForm.location.trim()}
                  className="text-xs font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refresh coordinates
                </button>
              </div>

              <p className="sm:col-span-2 mt-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Visitor information</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Hours</label>
                <input type="text" value={spotForm.opening_hours} onChange={e => setSpotForm(p => ({ ...p, opening_hours: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="e.g., 8:00 AM - 6:00 PM" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entrance Fee (PHP)</label>
                <input type="number" value={spotForm.entrance_fee} onChange={e => setSpotForm(p => ({ ...p, entrance_fee: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="0 for free" />
              </div>
              {spotForm.listing_type !== 'attraction' ? (
                <div>
                  <label htmlFor="spot-price-range" className="block text-sm font-medium text-gray-700 mb-1">Price range</label>
                  <select id="spot-price-range" value={spotForm.price_range} onChange={e => setSpotForm(p => ({ ...p, price_range: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                    <option value="">Not set</option>
                    {PRICE_RANGES.map((range) => <option key={range} value={range}>{range}</option>)}
                  </select>
                </div>
              ) : null}

              <p className="sm:col-span-2 mt-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Contact details</p>
              <div>
                <label htmlFor="spot-contact" className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input id="spot-contact" type="tel" value={spotForm.contact_number} onChange={e => setSpotForm(p => ({ ...p, contact_number: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="(054) 123-4567" />
              </div>
              <div>
                <label htmlFor="spot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input id="spot-email" type="email" value={spotForm.email} onChange={e => setSpotForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="info@example.com" />
              </div>
              <div>
                <label htmlFor="spot-website" className="block text-sm font-medium text-gray-700 mb-1">Website (optional)</label>
                <input id="spot-website" type="url" value={spotForm.website} onChange={e => setSpotForm(p => ({ ...p, website: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="https://" />
              </div>
              <div>
                <label htmlFor="spot-facebook" className="block text-sm font-medium text-gray-700 mb-1">Facebook page (optional)</label>
                <input id="spot-facebook" type="url" value={spotForm.facebook_url} onChange={e => setSpotForm(p => ({ ...p, facebook_url: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="https://facebook.com/..." />
              </div>

              <p className="sm:col-span-2 mt-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Media</p>
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
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

              <p className="sm:col-span-2 mt-2 border-b border-gray-100 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Publication</p>
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

              <p className="sm:col-span-2 text-xs text-gray-500">
                Rating is calculated automatically from visitor reviews{editingSpot ? ` (currently ${Number(editingSpot.rating || 0).toFixed(1)} from ${Number(editingSpot.review_count || 0)} reviews)` : ''}.
              </p>

            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveSpot} disabled={saving || geocoding} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : geocoding ? 'Finding coordinates...' : (editingSpot ? 'Save Changes' : 'Save Listing')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Manage Categories</h3>
            <p className="mb-4 text-xs text-gray-500">Saved for everyone. Hidden categories stay on existing listings but cannot be picked for new ones.</p>
            {managedCategories ? (
              <div className="space-y-3">
                <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white">
                  {LISTING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.plural}</option>)}
                </select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={categoryDraft}
                    onChange={(e) => setCategoryDraft(e.target.value)}
                    maxLength={60}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-xl"
                    placeholder="Add new category"
                  />
                  <button type="button" onClick={() => void addCategory()} className="bg-blue-600 text-white px-4 py-2 rounded-xl">Add</button>
                </div>
                <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                  {managedCategories.filter((category) => category.listing_type === categoryType).map((category) => (
                    <li key={category.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className={category.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}>
                        {category.name} <span className="text-xs text-gray-400">· {category.usage} listing{category.usage === 1 ? '' : 's'}</span>
                      </span>
                      <span className="flex gap-2">
                        <button type="button" onClick={() => void setCategoryActive(category, !category.is_active)} className="text-xs font-semibold text-blue-600">{category.is_active ? 'Hide' : 'Show'}</button>
                        {!category.usage ? <button type="button" onClick={() => void deleteCategory(category)} className="text-xs font-semibold text-red-600">Delete</button> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The managed category list is unavailable (apply database migration 102). Categories can still be typed freely.</p>
            )}
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600">Close</button>
            </div>
          </div>
        </div>
      )}

      {showPreviewModal && previewSpot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tourist-spot-preview-title"
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="relative h-48 shrink-0 overflow-hidden bg-slate-100 sm:h-64 lg:h-72">
              {previewSpot.image_url ? (
                <img
                  src={previewSpot.image_url}
                  alt={previewSpot.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
                  <MapPin className="h-8 w-8 text-blue-400" />
                  No image available
                </div>
              )}
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close tourist spot preview"
                className="absolute right-3 top-3 rounded-lg border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${getCategoryDisplay(previewSpot.category).color}`}>
                      {getCategoryDisplay(previewSpot.category).label}
                    </span>
                  </div>
                  <h2 id="tourist-spot-preview-title" className="text-xl font-bold text-slate-900 sm:text-2xl">{previewSpot.name}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {previewSpot.location}
                  </p>
                </div>
                <AdminBadge status={previewSpot.status} dot>
                  {previewSpot.status === 'inactive' ? 'Archived' : previewSpot.status}
                </AdminBadge>
              </div>

              <p className="mb-4 text-sm leading-6 text-slate-700">{previewSpot.description || 'No description available.'}</p>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3 sm:p-4">
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Opening hours</span>{previewSpot.opening_hours || 'Not set'}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entrance fee</span>{previewSpot.entrance_fee ? `₱${previewSpot.entrance_fee}` : 'Free'}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rating</span>{previewSpot.rating ? `${previewSpot.rating}/5` : 'Not rated'}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Views</span>{Number(previewSpot.view_count || 0).toLocaleString()}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saves</span>{Number(previewSpot.save_count || 0).toLocaleString()}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Shares</span>{Number(previewSpot.share_count || 0).toLocaleString()}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Created</span>{previewSpot.created_at ? new Date(previewSpot.created_at).toLocaleDateString() : '—'}</div>
                <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Updated</span>{previewSpot.updated_at ? new Date(previewSpot.updated_at).toLocaleDateString() : '—'}</div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <Comments
                  contentType="tourist_spot"
                  contentId={previewSpot.id}
                  userId={user?.id}
                  contentOwnerId={previewSpot.created_by}
                  contentTitle={previewSpot.name}
                  compact
                  replyOnly
                />
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 bg-white p-3 sm:px-6 sm:py-4">
              <AdminButton variant="primary" icon="edit" onClick={() => { setShowPreviewModal(false); openEditModal(previewSpot); }}>Edit</AdminButton>
              <AdminButton variant="secondary" onClick={() => { setShowPreviewModal(false); archiveSpot(previewSpot); }}>{previewSpot.status === 'inactive' ? 'Reactivate' : 'Archive'}</AdminButton>
              <AdminButton variant="outline-danger" icon="delete" onClick={() => { setShowPreviewModal(false); deleteSpot(previewSpot); }}>Delete</AdminButton>
            </footer>
          </section>
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
        title={confirmingSpot?.status === 'inactive' ? 'Reactivate Tourist Spot' : 'Archive Tourist Spot'}
        message={confirmingSpot?.status === 'inactive'
          ? `Are you sure you want to reactivate "${confirmingSpot?.name}"? It will be visible to visitors again.`
          : `Are you sure you want to archive "${confirmingSpot?.name}"? You can activate it again later.`}
        confirmText={confirmingSpot?.status === 'inactive' ? 'Reactivate' : 'Archive'}
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
        <div role={toastMessage.isError ? 'alert' : 'status'} aria-live={toastMessage.isError ? 'assertive' : 'polite'} className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          {toastMessage.isError ? 'Warning' : 'Success'} {toastMessage.message}
        </div>
      )}
    </AdminShell>
  );
}
