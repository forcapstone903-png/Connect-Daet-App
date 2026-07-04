// app/admin/events/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import MediaUpload from '@/app/components/MediaUpload';

// Event categories matching the database schema
const EVENT_CATEGORIES = [
  { value: 'festival', label: '🎉 Festival', color: '#8B5CF6' },
  { value: 'concert', label: '🎵 Concert', color: '#EF4444' },
  { value: 'exhibition', label: '🖼️ Exhibition', color: '#F59E0B' },
  { value: 'workshop', label: '🔧 Workshop', color: '#3B82F6' },
  { value: 'sports', label: '⚽ Sports', color: '#06B6D4' },
  { value: 'cultural', label: '🎭 Cultural', color: '#EC4899' }
];

const EVENT_STATUSES = [
  { value: 'draft', label: '📝 Draft', color: 'gray' },
  { value: 'published', label: '✓ Published', color: 'green' },
  { value: 'cancelled', label: '✗ Cancelled', color: 'red' },
  { value: 'completed', label: '🏁 Completed', color: 'blue' }
];

// Real venues in Daet, Camarines Norte
const VENUES = [
  'Bagasbas Beach', 'Daet Plaza (Plaza Rizal)', 'Bicol University - Daet Campus',
  'Daet Convention Center', 'Camarines Norte Provincial Capitol', 'St. John the Baptist Cathedral',
  'Museo de Daet', 'Daet Sports Complex', 'Bagasbas Lighthouse', 'Mangrove Eco-Park',
  'Camarines Norte State College', 'Daet Municipal Hall', 'Bagasbas View Deck',
  'Mampurog River', 'Cabusao Wetland', 'Paradise Beach', 'Mercedes Beach', 'Calasgasan Bay'
];

export default function AdminEventsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showMediaPreviewModal, setShowMediaPreviewModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [stats, setStats] = useState({
    total: 0, published: 0, draft: 0, cancelled: 0, completed: 0, upcoming: 0
  });
  
  // Filter state
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Bulk actions state
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  
  // Form state with media support
  const [eventForm, setEventForm] = useState({
    id: '', title: '', description: '', location: '', start_date: '', end_date: '',
    start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
    max_attendees: '', organizer: 'Daet Tourism Office', status: 'draft',
    imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: []
  });

  const calendarRef = useRef(null);
  const locationInputRef = useRef(null);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const addNotification = (title, message, type = 'info') => {
    const notifications = JSON.parse(localStorage.getItem('admin_notifications') || '[]');
    notifications.unshift({ id: Date.now(), title, message, type, timestamp: new Date().toISOString(), read: false });
    localStorage.setItem('admin_notifications', JSON.stringify(notifications.slice(0, 50)));
  };

  // Fetch events from Supabase with filters
  const fetchEvents = useCallback(async () => {
    try {
      let query = supabase.from('info_events').select('*');
      
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location.ilike.%${filters.search}%`);
      }
      if (filters.dateFrom) {
        query = query.gte('start_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('start_date', filters.dateTo);
      }
      
      const { data, error } = await query.order('start_date', { ascending: true });
      
      if (error) throw error;
      
      const formattedEvents = data.map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        start: event.start_date,
        end: event.end_date || event.start_date,
        category: event.category,
        is_free: event.is_free,
        ticket_price: event.ticket_price,
        max_attendees: event.max_attendees,
        organizer: event.organizer,
        start_time: event.start_time,
        end_time: event.end_time,
        status: event.status,
        image_url: event.image_url,
        video_url: event.video_url,
        gallery_images: event.gallery_images || [],
        gallery_videos: event.gallery_videos || []
      }));
      
      setEvents(formattedEvents);
      updateStats(formattedEvents);
      setCalendarKey(prev => prev + 1);
      return formattedEvents;
    } catch (err) {
      console.error('Error fetching events:', err);
      showToast(`Failed to load events: ${err.message}`, true);
      return [];
    }
  }, [filters]);

  const updateStats = (eventsList) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcoming = eventsList.filter(ev => 
      ev.status === 'published' && new Date(ev.start) >= now
    ).length;
    
    setStats({
      total: eventsList.length,
      published: eventsList.filter(ev => ev.status === 'published').length,
      draft: eventsList.filter(ev => ev.status === 'draft').length,
      cancelled: eventsList.filter(ev => ev.status === 'cancelled').length,
      completed: eventsList.filter(ev => ev.status === 'completed').length,
      upcoming
    });
  };

  // Save event to Supabase with media
  const saveEvent = async () => {
    const { id, title, start_date, end_date, location, description, category, 
            start_time, end_time, is_free, ticket_price, max_attendees, organizer, 
            status, imageUrl, videoUrl, galleryImages, galleryVideos } = eventForm;
    
    if (!title.trim()) { showToast('Please enter an event title', true); return; }
    if (!start_date) { showToast('Please select a start date', true); return; }
    if (!category) { showToast('Please select a category', true); return; }
    
    setSaving(true);
    try {
      const dbEvent = {
        title: title.trim(),
        description: description || '',
        location: location || '',
        start_date,
        end_date: end_date || start_date,
        start_time: start_time || null,
        end_time: end_time || null,
        category,
        is_free: is_free === true || is_free === 'true',
        ticket_price: is_free ? null : (ticket_price ? parseFloat(ticket_price) : null),
        max_attendees: max_attendees ? parseInt(max_attendees) : null,
        organizer: organizer || 'Daet Tourism Office',
        status: status || 'draft',
        image_url: imageUrl || null,
        video_url: videoUrl || null,
        gallery_images: galleryImages?.length > 0 ? galleryImages : null,
        gallery_videos: galleryVideos?.length > 0 ? galleryVideos : null,
        created_by: user?.id
      };

      let result;
      if (id) {
        result = await supabase
          .from('info_events')
          .update(dbEvent)
          .eq('id', id)
          .select();
      } else {
        result = await supabase
          .from('info_events')
          .insert([dbEvent])
          .select();
      }

      if (result.error) throw result.error;
      
      await fetchEvents();
      showToast(id ? 'Event updated successfully!' : 'Event created successfully!', false);
      addNotification(id ? 'Event Updated' : 'Event Created', 
        `${title} has been ${id ? 'updated' : 'added'} to the calendar.`, 'success');
      closeModal();
    } catch (err) {
      console.error('Error saving event:', err);
      showToast(`Failed to save event: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  // Delete event
  const deleteEvent = async () => {
    if (!selectedEvent) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('info_events')
        .delete()
        .eq('id', selectedEvent.id);
      
      if (error) throw error;
      
      await fetchEvents();
      showToast(`"${selectedEvent.title}" deleted successfully`, false);
      addNotification('Event Deleted', `"${selectedEvent.title}" has been removed.`, 'warning');
      setShowDeleteConfirm(false);
      setSelectedEvent(null);
    } catch (err) {
      console.error('Error deleting event:', err);
      showToast(`Failed to delete event: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  // Bulk delete events
  const bulkDeleteEvents = async () => {
    if (selectedEventIds.size === 0) return;
    
    setSaving(true);
    try {
      const ids = Array.from(selectedEventIds);
      const { error } = await supabase
        .from('info_events')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
      
      await fetchEvents();
      showToast(`${ids.length} event(s) deleted successfully`, false);
      addNotification('Bulk Delete', `${ids.length} events have been removed.`, 'warning');
      setSelectedEventIds(new Set());
      setShowBulkModal(false);
    } catch (err) {
      console.error('Error bulk deleting events:', err);
      showToast(`Failed to delete events: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  // Bulk update status
  const bulkUpdateStatus = async (newStatus) => {
    if (selectedEventIds.size === 0) return;
    
    setSaving(true);
    try {
      const ids = Array.from(selectedEventIds);
      const { error } = await supabase
        .from('info_events')
        .update({ status: newStatus })
        .in('id', ids);
      
      if (error) throw error;
      
      await fetchEvents();
      showToast(`${ids.length} event(s) updated to ${newStatus}`, false);
      addNotification('Bulk Update', `${ids.length} events changed to ${newStatus}.`, 'info');
      setSelectedEventIds(new Set());
      setBulkAction('');
    } catch (err) {
      console.error('Error bulk updating events:', err);
      showToast(`Failed to update events: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  // Update event dates when dragged
  const updateEventDates = async (eventId, newStartDate, newEndDate) => {
    try {
      const formatDate = (date) => {
        if (!date) return null;
        let d = date;
        if (typeof date === 'string') {
          if (date.match(/^\d{4}-\d{2}-\d{2}/)) return date.split('T')[0];
          d = new Date(date);
        }
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
      };
      
      const formattedStart = formatDate(newStartDate);
      const formattedEnd = formatDate(newEndDate || newStartDate);
      
      if (!formattedStart) throw new Error('Invalid start date');
      
      const { error } = await supabase
        .from('info_events')
        .update({ start_date: formattedStart, end_date: formattedEnd })
        .eq('id', eventId);
      
      if (error) throw error;
      
      await fetchEvents();
      showToast('Event rescheduled successfully!', false);
      return true;
    } catch (err) {
      console.error('Error updating event dates:', err);
      showToast(`Failed to reschedule: ${err.message}`, true);
      return false;
    }
  };

  // Export events to CSV
  const exportToCSV = () => {
    const exportEvents = events.filter(ev => {
      if (filters.status !== 'all' && ev.status !== filters.status) return false;
      if (filters.category !== 'all' && ev.category !== filters.category) return false;
      return true;
    });
    
    const headers = ['Title', 'Category', 'Start Date', 'End Date', 'Location', 'Organizer', 'Status', 'Free', 'Ticket Price', 'Max Attendees', 'Has Image', 'Has Video'];
    const rows = exportEvents.map(ev => [
      ev.title, ev.category, ev.start, ev.end || ev.start, ev.location || '',
      ev.organizer, ev.status, ev.is_free ? 'Yes' : 'No', ev.ticket_price || '', ev.max_attendees || '',
      ev.image_url ? 'Yes' : 'No', ev.video_url ? 'Yes' : 'No'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Events exported successfully!', false);
  };

  // Gallery management functions
  const addGalleryImage = (url) => {
    setEventForm(prev => ({
      ...prev,
      galleryImages: [...prev.galleryImages, url]
    }));
  };

  const removeGalleryImage = (index) => {
    setEventForm(prev => ({
      ...prev,
      galleryImages: prev.galleryImages.filter((_, i) => i !== index)
    }));
  };

  const addGalleryVideo = (url) => {
    setEventForm(prev => ({
      ...prev,
      galleryVideos: [...prev.galleryVideos, url]
    }));
  };

  const removeGalleryVideo = (index) => {
    setEventForm(prev => ({
      ...prev,
      galleryVideos: prev.galleryVideos.filter((_, i) => i !== index)
    }));
  };

  const openCreateModal = (startStr = null) => {
    setSelectedEvent(null);
    setEventForm({
      id: '', title: '', description: '', location: '', start_date: startStr || '', end_date: startStr || '',
      start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
      max_attendees: '', organizer: 'Daet Tourism Office', status: 'draft',
      imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: []
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const openEditModal = (eventObj) => {
    setSelectedEvent(eventObj);
    setEventForm({
      id: eventObj.id, title: eventObj.title, description: eventObj.description || '',
      location: eventObj.location || '', start_date: eventObj.start, end_date: eventObj.end || eventObj.start,
      start_time: eventObj.start_time || '', end_time: eventObj.end_time || '',
      category: eventObj.category || 'festival', is_free: eventObj.is_free !== false,
      ticket_price: eventObj.ticket_price || '', max_attendees: eventObj.max_attendees || '',
      organizer: eventObj.organizer || 'Daet Tourism Office', status: eventObj.status || 'draft',
      imageUrl: eventObj.image_url || '', videoUrl: eventObj.video_url || '',
      galleryImages: eventObj.gallery_images || [],
      galleryVideos: eventObj.gallery_videos || []
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setShowDeleteConfirm(false);
    setShowBulkModal(false);
    setShowMediaPreviewModal(false);
    setSelectedEvent(null);
    setSelectedMedia(null);
    setBulkAction('');
    setEventForm({
      id: '', title: '', description: '', location: '', start_date: '', end_date: '',
      start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
      max_attendees: '', organizer: 'Daet Tourism Office', status: 'draft',
      imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: []
    });
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const handleLocationChange = (value) => {
    setEventForm(p => ({ ...p, location: value }));
    if (value.length > 0) {
      const filtered = VENUES.filter(venue => 
        venue.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 8);
      setLocationSuggestions(filtered);
      setShowLocationSuggestions(true);
    } else {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
    }
  };

  const selectLocation = (location) => {
    setEventForm(p => ({ ...p, location }));
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const toggleSelectEvent = (eventId) => {
    const newSet = new Set(selectedEventIds);
    if (newSet.has(eventId)) {
      newSet.delete(eventId);
    } else {
      newSet.add(eventId);
    }
    setSelectedEventIds(newSet);
  };

  const selectAllEvents = () => {
    if (selectedEventIds.size === filteredEvents.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(filteredEvents.map(ev => ev.id)));
    }
  };

  const getCategoryColor = (category) => {
    const cat = EVENT_CATEGORIES.find(c => c.value === category);
    return cat?.color || '#0f3b2c';
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: '📝' },
      published: { bg: 'bg-green-100', text: 'text-green-700', icon: '✓' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: '✗' },
      completed: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '🏁' }
    };
    const style = config[status] || config.draft;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {style.icon} {status}
      </span>
    );
  };

  const calendarEvents = events.filter(ev => ev.status !== 'cancelled').map(ev => ({
    id: String(ev.id),
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: true,
    extendedProps: {
      description: ev.description || '',
      location: ev.location || '',
      category: ev.category || '',
      status: ev.status,
      organizer: ev.organizer,
      image_url: ev.image_url,
      video_url: ev.video_url
    },
    backgroundColor: getCategoryColor(ev.category),
    borderColor: '#ffffff',
    textColor: '#ffffff',
    className: ev.status === 'cancelled' ? 'opacity-50 line-through' : ''
  }));

  const filteredEvents = events.filter(ev => {
    if (filters.status !== 'all' && ev.status !== filters.status) return false;
    if (filters.category !== 'all' && ev.category !== filters.category) return false;
    if (filters.search && !ev.title.toLowerCase().includes(filters.search.toLowerCase()) &&
        !(ev.location || '').toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const upcomingEvents = events
    .filter(ev => ev.status === 'published' && new Date(ev.start) >= new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 10);

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) { router.push('/login'); return; }
      const userData = JSON.parse(session);
      if (userData.role !== 'admin') { router.push('/dashboard'); return; }
      setUser(userData);
      await fetchEvents();
      setLoading(false);
    };
    checkAuth();
  }, [router, fetchEvents]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading events...</p>
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
              <p className="text-xs text-gray-500">Event Management</p>
            </div>
          </div>
          <div className="mt-4 pt-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {user?.full_name || user?.user_name || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Events Manager</p>
          </div>
        </div>
        <nav className="mt-4 px-3">
          <Link href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📊</span>
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link href="/admin/events" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-700 mb-1">
            <span className="text-xl">📅</span>
            <span className="font-medium text-blue-700">Events & Activities</span>
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">👥</span>
            <span className="font-medium">Manage Users</span>
          </Link>
          <Link href="/admin/moderation" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">⏳</span>
            <span className="font-medium">Moderation</span>
          </Link>
          <Link href="/admin/announcement" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📢</span>
            <span className="font-medium">Announcement</span>
          </Link>
          <Link href="/admin/tourist-spots" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">🗺️</span>
            <span className="font-medium">Tourist Spots</span>
          </Link>
          <Link href="/admin/blog" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📝</span>
            <span className="font-medium">Blog & News</span>
          </Link>
          <Link href="/admin/amenities" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">🏨</span>
            <span className="font-medium">Amenities</span>
          </Link>
        </nav>
        <button 
          onClick={async () => {
            sessionStorage.removeItem('user_session');
            await supabase.auth.signOut();
            router.push('/login');
          }} 
          className="absolute bottom-5 left-5 right-5 bg-red-50 hover:bg-red-100 text-red-700 py-2.5 rounded-full transition-all duration-200 flex items-center justify-center gap-2"
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Events & Activities Manager</h1>
              <p className="text-gray-500 mt-1 text-sm">Create, manage, and schedule all tourism events in Daet with photos and videos</p>
            </div>
            <div className="flex gap-3">
              {selectedEventIds.size > 0 && (
                <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1">
                  <span className="text-sm text-gray-600">{selectedEventIds.size} selected</span>
                  <select
                    value={bulkAction}
                    onChange={(e) => {
                      if (e.target.value === 'delete') setShowBulkModal(true);
                      else if (e.target.value) bulkUpdateStatus(e.target.value);
                      setBulkAction('');
                    }}
                    className="text-sm border-0 bg-transparent focus:ring-0"
                  >
                    <option value="">Bulk Actions</option>
                    <option value="published">✓ Publish</option>
                    <option value="draft">📝 Move to Draft</option>
                    <option value="cancelled">✗ Cancel</option>
                    <option value="delete">🗑️ Delete</option>
                  </select>
                </div>
              )}
              <button onClick={exportToCSV} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-all">
                <span>📎</span>
                <span className="text-sm font-medium">Export CSV</span>
              </button>
              <button onClick={() => openCreateModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-sm">
                <span>➕</span>
                <span className="text-sm font-medium">Create Event</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-gray-500 text-xs">Total</p>
            <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-green-600 text-xs">✓ Published</p>
            <p className="text-2xl font-bold text-green-600">{stats.published}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-yellow-600 text-xs">📝 Draft</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-red-600 text-xs">✗ Cancelled</p>
            <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-blue-600 text-xs">🏁 Completed</p>
            <p className="text-2xl font-bold text-blue-600">{stats.completed}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3 text-center">
            <p className="text-purple-600 text-xs">⏰ Upcoming</p>
            <p className="text-2xl font-bold text-purple-600">{stats.upcoming}</p>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search events..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="published">✓ Published</option>
              <option value="draft">📝 Draft</option>
              <option value="cancelled">✗ Cancelled</option>
              <option value="completed">🏁 Completed</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {EVENT_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm hover:bg-gray-50 flex items-center gap-1"
            >
              <span>📅</span> Date Filter
            </button>
            <button
              onClick={() => {
                setFilters({ status: 'all', category: 'all', search: '', dateFrom: '', dateTo: '' });
              }}
              className="px-3 py-2 text-gray-500 text-sm hover:text-gray-700"
            >
              Clear Filters
            </button>
          </div>
          {showFilterPanel && (
            <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="px-3 py-2 border border-gray-200 rounded-full text-sm"
                placeholder="From Date"
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="px-3 py-2 border border-gray-200 rounded-full text-sm"
                placeholder="To Date"
              />
            </div>
          )}
        </div>

        {/* Calendar and Events List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>📅</span> Event Calendar
              </h2>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
                💡 Click any date to create event • Drag to reschedule
              </div>
            </div>
            <FullCalendar
              key={calendarKey}
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              height={550}
              selectable={true}
              editable={true}
              eventStartEditable={true}
              eventDurationEditable={true}
              events={calendarEvents}
              select={(info) => openCreateModal(info.startStr)}
              eventClick={(info) => {
                const event = events.find(e => e.id === info.event.id);
                if (event) openEditModal(event);
              }}
              eventDrop={async (info) => {
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr);
                if (!success) info.revert();
              }}
              eventResize={async (info) => {
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr);
                if (!success) info.revert();
              }}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek,timeGridDay'
              }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
              nowIndicator={true}
              weekends={true}
              height="auto"
            />
          </div>

          {/* Upcoming Events Widget */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>⏰</span> Upcoming Events
              </h3>
              <button onClick={() => openCreateModal()} className="text-blue-600 text-sm hover:underline">
                + Add
              </button>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((ev) => {
                  const eventDate = new Date(ev.start);
                  const today = new Date();
                  const daysDiff = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
                  let badgeColor = 'bg-blue-100 text-blue-700';
                  if (daysDiff === 0) badgeColor = 'bg-red-100 text-red-700';
                  else if (daysDiff === 1) badgeColor = 'bg-orange-100 text-orange-700';
                  else if (daysDiff <= 3) badgeColor = 'bg-yellow-100 text-yellow-700';
                  
                  return (
                    <div key={ev.id} className="p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 text-sm">{ev.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            📅 {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          {ev.location && <p className="text-xs text-gray-400 mt-0.5">📍 {ev.location}</p>}
                          {ev.image_url && (
                            <img 
                              src={ev.image_url} 
                              alt={ev.title} 
                              className="w-full h-24 object-cover rounded-xl mt-2 cursor-pointer hover:opacity-90"
                              onClick={() => {
                                setSelectedMedia({ type: 'image', url: ev.image_url, title: ev.title });
                                setShowMediaPreviewModal(true);
                              }}
                            />
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${getCategoryColor(ev.category)}20`, color: getCategoryColor(ev.category) }}>
                              {ev.category}
                            </span>
                            {ev.video_url && <span className="text-xs text-blue-600">🎥 Video</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                            {daysDiff === 0 ? 'Today' : daysDiff === 1 ? 'Tomorrow' : `${daysDiff}d`}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button 
                          onClick={() => openEditModal(ev)} 
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedEvent(ev);
                            setShowDeleteConfirm(true);
                          }} 
                          className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-3xl">📭</span>
                  <p className="mt-2 text-sm">No upcoming events</p>
                  <p className="text-xs">Click on any date in the calendar to create one</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Events List Table */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">All Events</h3>
            <p className="text-xs text-gray-400">{filteredEvents.length} events</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-8 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedEventIds.size === filteredEvents.length && filteredEvents.length > 0}
                      onChange={selectAllEvents}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Media</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Organizer</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedEventIds.has(ev.id)}
                        onChange={() => toggleSelectEvent(ev.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                        {ev.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">{ev.description.substring(0, 60)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {ev.image_url && (
                          <button
                            onClick={() => {
                              setSelectedMedia({ type: 'image', url: ev.image_url, title: ev.title });
                              setShowMediaPreviewModal(true);
                            }}
                            className="text-lg hover:scale-110 transition-transform"
                            title="View image"
                          >
                            🖼️
                          </button>
                        )}
                        {ev.video_url && (
                          <button
                            onClick={() => {
                              setSelectedMedia({ type: 'video', url: ev.video_url, title: ev.title });
                              setShowMediaPreviewModal(true);
                            }}
                            className="text-lg hover:scale-110 transition-transform"
                            title="View video"
                          >
                            🎥
                          </button>
                        )}
                        {!ev.image_url && !ev.video_url && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${getCategoryColor(ev.category)}20`, color: getCategoryColor(ev.category) }}>
                        {ev.category}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-gray-700">
                        {new Date(ev.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      {ev.start !== ev.end && (
                        <p className="text-xs text-gray-400">to {new Date(ev.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-gray-600 max-w-[150px] truncate">{ev.location || '—'}</p>
                    </td>
                    <td className="px-3 py-3">
                      {getStatusBadge(ev.status)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-gray-600">{ev.organizer || 'Daet Tourism Office'}</p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEditModal(ev)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEvent(ev);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEvents.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <span className="text-4xl">📭</span>
                <p className="mt-2">No events found matching your criteria</p>
                <button onClick={() => openCreateModal()} className="mt-3 text-blue-600 hover:underline">
                  Create your first event →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Modal with Media Uploads */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                {eventForm.id ? '✏️ Edit Event' : '📅 Create New Event'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Pinyasan Festival 2025"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    value={eventForm.category}
                    onChange={e => setEventForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  >
                    {EVENT_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={eventForm.status}
                    onChange={e => setEventForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  >
                    {EVENT_STATUSES.map(st => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={eventForm.start_date}
                    onChange={e => setEventForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={eventForm.end_date}
                    onChange={e => setEventForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={eventForm.start_time}
                    onChange={e => setEventForm(p => ({ ...p, start_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={eventForm.end_time}
                    onChange={e => setEventForm(p => ({ ...p, end_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Location / Venue</label>
                <input
                  type="text"
                  ref={locationInputRef}
                  value={eventForm.location}
                  onChange={e => handleLocationChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  placeholder="Type to search venues in Daet..."
                  autoComplete="off"
                />
                {showLocationSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-40 overflow-y-auto">
                    {locationSuggestions.map((venue, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectLocation(venue)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                      >
                        <span className="text-gray-400">📍</span> {venue}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organizer</label>
                <input
                  type="text"
                  value={eventForm.organizer}
                  onChange={e => setEventForm(p => ({ ...p, organizer: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Daet Tourism Office"
                />
              </div>
              
              {/* Featured Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Image</label>
                <MediaUpload
                  bucket="events"
                  folder="featured"
                  mediaType="image"
                  existingMediaUrl={eventForm.imageUrl}
                  onUploadComplete={(url) => setEventForm(p => ({ ...p, imageUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="📷 Upload Featured Image"
                  maxSizeMB={5}
                />
                <p className="text-xs text-gray-400 mt-1">This image will appear as the event thumbnail (max 5MB)</p>
              </div>
              
              {/* Promo Video Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Promo Video</label>
                <MediaUpload
                  bucket="events"
                  folder="videos"
                  mediaType="video"
                  existingMediaUrl={eventForm.videoUrl}
                  onUploadComplete={(url) => setEventForm(p => ({ ...p, videoUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="🎥 Upload Promo Video"
                  maxSizeMB={20}
                />
                <p className="text-xs text-gray-400 mt-1">Short promotional video (MP4, MOV, WebM, max 20MB, max 30 seconds)</p>
              </div>
              
              {/* Gallery Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Images</label>
                <MediaUpload
                  bucket="events"
                  folder="gallery"
                  mediaType="image"
                  existingMediaUrl=""
                  onUploadComplete={(url) => {
                    if (url) addGalleryImage(url);
                  }}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="➕ Add Image to Gallery"
                  maxSizeMB={5}
                />
                
                {eventForm.galleryImages.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Gallery ({eventForm.galleryImages.length} images)</p>
                    <div className="flex flex-wrap gap-2">
                      {eventForm.galleryImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img 
                            src={img} 
                            alt={`Gallery ${idx + 1}`} 
                            className="w-20 h-20 object-cover rounded-xl border border-gray-200 cursor-pointer hover:opacity-80"
                            onClick={() => {
                              setSelectedMedia({ type: 'image', url: img, title: 'Gallery Image' });
                              setShowMediaPreviewModal(true);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Gallery Videos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Videos</label>
                <MediaUpload
                  bucket="events"
                  folder="gallery-videos"
                  mediaType="video"
                  existingMediaUrl=""
                  onUploadComplete={(url) => {
                    if (url) addGalleryVideo(url);
                  }}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="➕ Add Video to Gallery"
                  maxSizeMB={20}
                />
                
                {eventForm.galleryVideos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Video Gallery ({eventForm.galleryVideos.length} videos)</p>
                    <div className="flex flex-wrap gap-2">
                      {eventForm.galleryVideos.map((video, idx) => (
                        <div key={idx} className="relative group">
                          <video 
                            src={video} 
                            className="w-32 h-24 object-cover rounded-xl border border-gray-200 cursor-pointer hover:opacity-80"
                            onClick={() => {
                              setSelectedMedia({ type: 'video', url: video, title: 'Gallery Video' });
                              setShowMediaPreviewModal(true);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryVideo(idx)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={eventForm.is_free}
                    onChange={e => setEventForm(p => ({ ...p, is_free: e.target.checked, ticket_price: e.target.checked ? '' : p.ticket_price }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Free Event</span>
                </label>
                {!eventForm.is_free && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (PHP)</label>
                    <input
                      type="number"
                      value={eventForm.ticket_price}
                      onChange={e => setEventForm(p => ({ ...p, ticket_price: e.target.value }))}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Attendees</label>
                <input
                  type="number"
                  value={eventForm.max_attendees}
                  onChange={e => setEventForm(p => ({ ...p, max_attendees: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={eventForm.description}
                  onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl resize-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Event description, schedule, special instructions..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={saveEvent} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm disabled:opacity-50">
                {saving ? 'Saving...' : (eventForm.id ? 'Update Event' : 'Create Event')}
              </button>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">💡 Tip: Drag events on the calendar to reschedule. Add images and videos to make your events more engaging.</p>
            </div>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {showMediaPreviewModal && selectedMedia && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setShowMediaPreviewModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ✕ Close
            </button>
            <div className="bg-black rounded-2xl overflow-hidden">
              {selectedMedia.type === 'image' ? (
                <img src={selectedMedia.url} alt={selectedMedia.title} className="w-full h-auto max-h-[80vh] object-contain" />
              ) : (
                <video src={selectedMedia.url} controls autoPlay className="w-full max-h-[80vh]" />
              )}
              {selectedMedia.title && (
                <div className="p-3 bg-black/50 text-white text-center">
                  <p className="text-sm">{selectedMedia.title}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Delete Event</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete <strong>"{selectedEvent.title}"</strong>? 
                This action cannot be undone and will remove all associated media.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={deleteEvent} disabled={saving} className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Bulk Delete</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete <strong>{selectedEventIds.size} event(s)</strong>? 
                This action cannot be undone.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowBulkModal(false)} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={bulkDeleteEvents} disabled={saving} className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Deleting...' : 'Yes, Delete All'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 animate-slide-in shadow-md ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
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
        .fc-event {
          cursor: grab !important;
          border-radius: 12px !important;
          border: none !important;
          padding: 2px 6px !important;
          font-weight: 500 !important;
          font-size: 0.75rem !important;
        }
        .fc-event:active {
          cursor: grabbing !important;
        }
        .fc-daygrid-day-frame:hover {
          background-color: #eff6ff !important;
          cursor: pointer;
        }
        .fc-day-today {
          background-color: #fefce8 !important;
        }
        .fc .fc-button-primary {
          background-color: #2563eb !important;
          border-color: #2563eb !important;
          border-radius: 9999px !important;
        }
        .fc .fc-button-primary:hover {
          background-color: #1d4ed8 !important;
          border-color: #1d4ed8 !important;
        }
        .fc .fc-button {
          border-radius: 9999px !important;
        }
        .fc .fc-toolbar-title {
          font-size: 1.25rem !important;
          font-weight: 600 !important;
        }
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
