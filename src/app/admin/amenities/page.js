// app/admin/amenities/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import MediaUpload from '@/app/components/MediaUpload';

const AMENITY_TYPES = [
  { value: 'accommodation', label: '🏨 Accommodation', color: 'bg-blue-100 text-blue-700' },
  { value: 'restaurant', label: '🍽️ Restaurant', color: 'bg-orange-100 text-orange-700' },
  { value: 'transport', label: '🚗 Transport', color: 'bg-green-100 text-green-700' },
  { value: 'shop', label: '🛍️ Shop', color: 'bg-purple-100 text-purple-700' },
  { value: 'service', label: '⚙️ Service', color: 'bg-gray-100 text-gray-700' },
  { value: 'facility', label: '🏥 Facility', color: 'bg-red-100 text-red-700' },
];

const AMENITY_FEATURES = ['wifi', 'parking', 'aircon', 'pet_friendly', 'wheelchair_access', 'outdoor_seating', 'delivery', 'takeout', 'reservations'];

export default function AmenitiesManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amenities, setAmenities] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [amenityForm, setAmenityForm] = useState({
    name: '',
    type: '',
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
    featured: false
  });

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchAmenities = async () => {
    try {
      const { data, error } = await supabase
        .from('info_amenities')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAmenities(data || []);
    } catch (err) {
      console.error('Error fetching amenities:', err);
      showToast('Failed to load amenities', true);
    }
  };

  const saveAmenity = async () => {
    if (!amenityForm.name.trim() || !amenityForm.location.trim() || !amenityForm.type) {
      showToast('Please fill in all required fields', true);
      return;
    }

    setSaving(true);
    try {
      const amenityData = {
        name: amenityForm.name,
        type: amenityForm.type,
        description: amenityForm.description || '',
        location: amenityForm.location,
        latitude: amenityForm.latitude ? parseFloat(amenityForm.latitude) : null,
        longitude: amenityForm.longitude ? parseFloat(amenityForm.longitude) : null,
        contact_number: amenityForm.contact_number || '',
        website: amenityForm.website || '',
        opening_hours: amenityForm.opening_hours || '',
        price_range: amenityForm.price_range || '',
        amenities: amenityForm.amenities,
        images: amenityForm.images.filter(url => url),
        status: amenityForm.status,
        featured: amenityForm.featured,
        created_by: user?.id
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

      showToast(editingAmenity ? 'Amenity updated!' : 'Amenity added!');
      fetchAmenities();
      closeModal();
    } catch (err) {
      console.error('Error saving amenity:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const deleteAmenity = async (amenity) => {
    if (!confirm(`Delete "${amenity.name}" permanently?`)) return;

    try {
      const { error } = await supabase
        .from('info_amenities')
        .delete()
        .eq('id', amenity.id);

      if (error) throw error;
      showToast(`"${amenity.name}" deleted`);
      fetchAmenities();
    } catch (err) {
      console.error('Error deleting amenity:', err);
      showToast('Failed to delete amenity', true);
    }
  };

  const toggleFeature = (amenityId, currentValue) => {
    // This would require a separate API call
    console.log('Toggle feature:', amenityId, currentValue);
  };

  const openCreateModal = () => {
    setEditingAmenity(null);
    setAmenityForm({
      name: '',
      type: '',
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
      featured: false
    });
    setShowModal(true);
  };

  const openEditModal = (amenity) => {
    setEditingAmenity(amenity);
    setAmenityForm({
      name: amenity.name || '',
      type: amenity.type || '',
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
      featured: amenity.featured || false
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAmenity(null);
  };

  const toggleAmenityFeature = (feature) => {
    setAmenityForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(feature)
        ? prev.amenities.filter(f => f !== feature)
        : [...prev.amenities, feature]
    }));
  };

  const getTypeDisplay = (type) => {
    const found = AMENITY_TYPES.find(t => t.value === type);
    return found || { label: type || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      'active': 'bg-green-100 text-green-700',
      'inactive': 'bg-gray-100 text-gray-700',
      'temporarily_closed': 'bg-yellow-100 text-yellow-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredAmenities = amenities.filter(amenity => {
    const matchesSearch = amenity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          amenity.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || amenity.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || amenity.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
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
      await fetchAmenities();
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
            <h1 className="text-2xl font-bold text-gray-800">🏨 Amenities Directory</h1>
            <p className="text-gray-500 mt-1">Manage accommodations, restaurants, transport, and services</p>
          </div>
          <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <span>+</span> Add Amenity
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input type="text" placeholder="🔍 Search by name or location..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-2xl" />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Types</option>
              {AMENITY_TYPES.map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="temporarily_closed">Temporarily Closed</option>
            </select>
            <div className="text-sm text-gray-500">{filteredAmenities.length} amenities</div>
          </div>
        </div>

        {/* Amenities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAmenities.map((amenity) => {
            const type = getTypeDisplay(amenity.type);
            return (
              <div key={amenity.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-40 bg-gray-100">
                  {amenity.images && amenity.images[0] ? (
                    <img src={amenity.images[0]} alt={amenity.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">🏪</div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${type.color}`}>
                      {type.label}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusBadge(amenity.status)}`}>
                      {amenity.status === 'temporarily_closed' ? 'Temp Closed' : amenity.status}
                    </span>
                  </div>
                  {amenity.featured && (
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">⭐ Featured</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 text-lg mb-1">{amenity.name}</h3>
                  <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">📍 {amenity.location}</p>
                  {amenity.rating > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-yellow-400">★</span>
                      <span className="text-sm font-medium">{amenity.rating}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{amenity.description || 'No description provided'}</p>
                  {amenity.opening_hours && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">🕒 {amenity.opening_hours}</p>
                  )}
                  {amenity.contact_number && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">📞 {amenity.contact_number}</p>
                  )}
                  {amenity.amenities && amenity.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {amenity.amenities.slice(0, 3).map(feat => (
                        <span key={feat} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {feat}
                        </span>
                      ))}
                      {amenity.amenities.length > 3 && (
                        <span className="text-xs text-gray-400">+{amenity.amenities.length - 3}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => openEditModal(amenity)} className="flex-1 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-100">Edit</button>
                    <button onClick={() => deleteAmenity(amenity)} className="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-100">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAmenities.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <span className="text-5xl">🏨</span>
            <p className="text-gray-400 mt-2">No amenities found</p>
            <button onClick={openCreateModal} className="mt-4 text-blue-600 underline">Add your first amenity</button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{editingAmenity ? '✏️ Edit Amenity' : '🏪 Add New Amenity'}</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={amenityForm.name} onChange={e => setAmenityForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Business/Establishment name" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input type="text" value={amenityForm.location} onChange={e => setAmenityForm(p => ({ ...p, location: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Street address, Daet" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select value={amenityForm.type} onChange={e => setAmenityForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  <option value="">Select type</option>
                  {AMENITY_TYPES.map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={amenityForm.status} onChange={e => setAmenityForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="temporarily_closed">Temporarily Closed</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
                <select value={amenityForm.price_range} onChange={e => setAmenityForm(p => ({ ...p, price_range: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                  <option value="">Select</option>
                  <option value="$">$ - Budget</option>
                  <option value="$$">$$ - Moderate</option>
                  <option value="$$$">$$$ - Expensive</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input type="text" value={amenityForm.contact_number} onChange={e => setAmenityForm(p => ({ ...p, contact_number: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="(054) 123-4567" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input type="url" value={amenityForm.website} onChange={e => setAmenityForm(p => ({ ...p, website: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="https://..." />
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Hours</label>
                <input type="text" value={amenityForm.opening_hours} onChange={e => setAmenityForm(p => ({ ...p, opening_hours: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="e.g., Mon-Sat: 9AM-9PM, Sun: Closed" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 col-span-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input type="text" value={amenityForm.latitude} onChange={e => setAmenityForm(p => ({ ...p, latitude: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="14.1122" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input type="text" value={amenityForm.longitude} onChange={e => setAmenityForm(p => ({ ...p, longitude: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="122.9553" />
                </div>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities & Features</label>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_FEATURES.map(feature => (
                    <button
                      key={feature}
                      type="button"
                      onClick={() => toggleAmenityFeature(feature)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        amenityForm.amenities.includes(feature)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {feature.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Images</label>
                <MediaUpload
                  bucket="amenities"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={amenityForm.images[0] || ''}
                  onUploadComplete={(url) => {
                    if (url) {
                      setAmenityForm(p => ({ ...p, images: [...p.images, url] }));
                    }
                  }}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="📷 Upload Image"
                  maxSizeMB={5}
                />
                {amenityForm.images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {amenityForm.images.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden">
                        <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setAmenityForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                          className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="col-span-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={amenityForm.featured} onChange={e => setAmenityForm(p => ({ ...p, featured: e.target.checked }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">⭐ Feature this amenity (appears prominently)</span>
                </label>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={amenityForm.description} onChange={e => setAmenityForm(p => ({ ...p, description: e.target.value }))} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-xl resize-none" placeholder="Describe the establishment, services offered, etc." />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveAmenity} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : (editingAmenity ? 'Update' : 'Create')}
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
