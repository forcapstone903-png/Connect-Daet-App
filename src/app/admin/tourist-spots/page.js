// app/admin/tourist-spots/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import MediaUpload from '@/app/components/MediaUpload';

const SPOT_CATEGORIES = [
  { value: 'beach', label: '🏖️ Beach', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'historical', label: '🏛️ Historical', color: 'bg-amber-100 text-amber-700' },
  { value: 'nature', label: '🌿 Nature', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cultural', label: '🎭 Cultural', color: 'bg-purple-100 text-purple-700' },
  { value: 'religious', label: '⛪ Religious', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'park', label: '🌳 Park', color: 'bg-green-100 text-green-700' },
  { value: 'market', label: '🛍️ Market', color: 'bg-orange-100 text-orange-700' },
];

export default function TouristSpotsManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSpot, setEditingSpot] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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
    rating: 0,
    status: 'published'
  });

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchSpots = async () => {
    try {
      let query = supabase
        .from('info_tourist_spots')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setSpots(data || []);
    } catch (err) {
      console.error('Error fetching spots:', err);
      showToast('Failed to load tourist spots', true);
    }
  };

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
        rating: spotForm.rating || 0,
        status: spotForm.status,
        created_by: user?.id
      };

      let result;
      if (editingSpot) {
        result = await supabase
          .from('info_tourist_spots')
          .update(spotData)
          .eq('id', editingSpot.id);
      } else {
        result = await supabase
          .from('info_tourist_spots')
          .insert([spotData]);
      }

      if (result.error) throw result.error;

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

  const deleteSpot = async (spot) => {
    if (!confirm(`Delete "${spot.name}" permanently?`)) return;

    try {
      const { error } = await supabase
        .from('info_tourist_spots')
        .delete()
        .eq('id', spot.id);

      if (error) throw error;
      showToast(`"${spot.name}" deleted`);
      fetchSpots();
    } catch (err) {
      console.error('Error deleting spot:', err);
      showToast('Failed to delete spot', true);
    }
  };

  const openCreateModal = () => {
    setEditingSpot(null);
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
      rating: 0,
      status: 'published'
    });
    setShowModal(true);
  };

  const openEditModal = (spot) => {
    setEditingSpot(spot);
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
      rating: spot.rating || 0,
      status: spot.status || 'published'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSpot(null);
  };

  const getCategoryDisplay = (category) => {
    const found = SPOT_CATEGORIES.find(c => c.value === category);
    return found || { label: category || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      'published': 'bg-green-100 text-green-700',
      'draft': 'bg-yellow-100 text-yellow-700',
      'closed': 'bg-red-100 text-red-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredSpots = spots.filter(spot => {
    const matchesSearch = spot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          spot.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || spot.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || spot.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        router.push('/login');
        return;
      }
      const userData = JSON.parse(session);
      if (userData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      setUser(userData);
      await fetchSpots();
      setLoading(false);
    };
    checkAuth();
  }, []);

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
      <div className="ml-64 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🗺️ Tourist Spots Management</h1>
            <p className="text-gray-500 mt-1">Manage Daet's tourist attractions and destinations</p>
          </div>
          <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <span>+</span> Add New Spot
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input type="text" placeholder="🔍 Search by name or location..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Categories</option>
              {SPOT_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="closed">Closed</option>
            </select>
            <div className="text-sm text-gray-500">{filteredSpots.length} spots found</div>
          </div>
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
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">🗺️</div>
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
                  <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">📍 {spot.location}</p>
                  {spot.rating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-yellow-400">★</span>
                      <span className="text-sm font-medium">{spot.rating}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{spot.description || 'No description provided'}</p>
                  {spot.opening_hours && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mb-2">🕒 {spot.opening_hours}</p>
                  )}
                  {spot.entrance_fee && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">💰 ₱{spot.entrance_fee}</p>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => openEditModal(spot)} className="flex-1 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-100">Edit</button>
                    <button onClick={() => deleteSpot(spot)} className="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-100">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredSpots.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <span className="text-5xl">🗺️</span>
            <p className="text-gray-400 mt-2">No tourist spots found</p>
            <button onClick={openCreateModal} className="mt-4 text-blue-600 underline">Create your first spot</button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{editingSpot ? '✏️ Edit Tourist Spot' : '📌 Add New Tourist Spot'}</h3>
            
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
                  {SPOT_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={spotForm.status} onChange={e => setSpotForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
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
                  buttonText="📷 Upload Image"
                  maxSizeMB={5}
                />
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

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.isError ? '⚠️' : '✅'} {toastMessage.message}
        </div>
      )}
    </div>
  );
}
