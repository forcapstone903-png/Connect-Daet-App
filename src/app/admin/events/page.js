// app/admin/events/page.js
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import FullCalendar from '@fullcalendar/react';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import MediaUpload from '@/app/components/MediaUpload';

const EVENT_CATEGORIES = [
  { value: 'festival', label: 'Festival' },
  { value: 'concert', label: 'Concert' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'sports', label: 'Sports' },
  { value: 'cultural', label: 'Cultural' },
];

const EVENT_STATUSES = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

const RECURRENCE_OPTIONS = [
  { value: '', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const getCategoryColor = (category) => {
  const colors = {
    'festival': '#8B5CF6',
    'concert': '#EF4444',
    'exhibition': '#F59E0B',
    'workshop': '#3B82F6',
    'sports': '#06B6D4',
    'cultural': '#EC4899',
  };
  return colors[category] || '#0f3b2c';
};

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
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const [showTrashDropZone, setShowTrashDropZone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [calendarKey, setCalendarKey] = useState(0);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [venues, setVenues] = useState([]);
  const [stats, setStats] = useState({
    total: 0, published: 0, draft: 0, cancelled: 0, completed: 0, upcoming: 0
  });
  const [registrationsByEvent, setRegistrationsByEvent] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('event_registrations_cache') || '{}');
    } catch (error) {
      return {};
    }
  });
  const [newRegistrant, setNewRegistrant] = useState({ name: '', email: '', status: 'confirmed' });
  
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  
  const [eventForm, setEventForm] = useState({
    id: '', title: '', description: '', location: '', start_date: '', end_date: '',
    start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
    max_attendees: '', current_attendees: 0, organizer: 'Daet Tourism Office', status: 'draft',
    imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: [],
    recurrence: '', tags: [], featured: false
  });

  const calendarRef = useRef(null);
  const [tagInput, setTagInput] = useState('');
  const locationInputRef = useRef(null);
  const trashRef = useRef(null);
  const eventElListenersRef = useRef(new Map());

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const saveRegistrationsCache = useCallback((nextMap) => {
    setRegistrationsByEvent(nextMap);
    if (typeof window !== 'undefined') {
      localStorage.setItem('event_registrations_cache', JSON.stringify(nextMap));
    }
  }, []);

  const getRegistrationsForEvent = useCallback((eventId) => {
    const eventRegistrations = registrationsByEvent[eventId] || [];
    return eventRegistrations.map((registration) => ({
      id: registration.id || `${eventId}-${Date.now()}-${Math.random()}`,
      name: registration.name || 'Guest',
      email: registration.email || 'noreply@local',
      status: registration.status || 'confirmed',
      created_at: registration.created_at || new Date().toISOString()
    }));
  }, [registrationsByEvent]);

  const addNotification = (title, message, type = 'info') => {
    const notifications = JSON.parse(localStorage.getItem('admin_notifications') || '[]');
    notifications.unshift({ id: Date.now(), title, message, type, timestamp: new Date().toISOString(), read: false });
    localStorage.setItem('admin_notifications', JSON.stringify(notifications.slice(0, 50)));
  };

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
        current_attendees: event.current_attendees || getRegistrationsForEvent(event.id).length || 0,
        organizer: event.organizer,
        start_time: event.start_time,
        end_time: event.end_time,
        status: event.status,
        image_url: event.featured_image || (event.images && event.images[0]) || null,
        video_url: (event.videos && event.videos[0]) || null,
        gallery_images: event.images || [],
        gallery_videos: event.videos || [],
        recurrence: event.recurrence || '',
        tags: event.tags || [],
        featured: !!event.featured,
        views: Number(event.views || event.view_count || 0),
        shares: Number(event.share_count || 0)
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
  }, [filters, getRegistrationsForEvent]);

  const saveEvent = async () => {
    const { id, title, start_date, end_date, location, description, category, 
            start_time, end_time, is_free, ticket_price, max_attendees, current_attendees, organizer, 
            status, imageUrl, videoUrl, galleryImages, galleryVideos } = eventForm;
    
    if (!title.trim()) { showToast('Please enter an event title', true); return; }
    if (!start_date) { showToast('Please select a start date', true); return; }
    if (!category) { showToast('Please select a category', true); return; }
    
    // Session stores the id as user_id; fall back to .id for safety
    const adminId = user?.user_id || user?.id;
    if (!adminId) {
      showToast('Unable to save: missing admin user session', true);
      return;
    }

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
        current_attendees: current_attendees ? parseInt(current_attendees) : getRegistrationsForEvent(id || 'new').length,
        organizer: organizer || 'Daet Tourism Office',
        status: status || 'draft',
        featured_image: imageUrl || null,
        images: galleryImages?.length > 0 ? galleryImages : (imageUrl ? [imageUrl] : null),
        videos: galleryVideos?.length > 0 ? galleryVideos : (videoUrl ? [videoUrl] : null),
        recurrence: eventForm.recurrence || null,
        tags: (eventForm.tags && eventForm.tags.length > 0) ? eventForm.tags : null,
        featured: !!eventForm.featured,
        created_by: adminId
      };

      let data, error;
      if (id) {
        ({ data, error } = await supabase
          .from('info_events')
          .update(dbEvent)
          .eq('id', id)
          .select());
      } else {
        ({ data, error } = await supabase
          .from('info_events')
          .insert([dbEvent])
          .select());
      }

      if (error) throw error;
      
      await fetchEvents();
      showToast(id ? 'Event updated successfully!' : 'Event created successfully!', false);
      addNotification(id ? 'Event Updated' : 'Event Created', 
        `${title} has been ${id ? 'updated' : 'added'} to the calendar.`, 'success');
      closeModal();
    } catch (err) {
      try {
        console.error('Error saving event:', err, JSON.stringify(err));
      } catch (e) {
        console.error('Error saving event (stringify failed):', err);
      }
      const message = err?.message || err?.msg || err?.error || (typeof err === 'string' ? err : null) || JSON.stringify(err) || 'Unknown error';
      showToast(`Failed to save event: ${message}`, true);
    } finally {
      setSaving(false);
    }
  };

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

  const handleEventDragStart = () => {
    setShowTrashDropZone(true);
  };

  const handleEventDragStop = async (info) => {
    try {
      setShowTrashDropZone(false);
      if (!trashRef.current) return;
      const rect = trashRef.current.getBoundingClientRect();
      const x = info.jsEvent.clientX;
      const y = info.jsEvent.clientY;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const evt = events.find(e => String(e.id) === String(info.event.id));
        if (evt) {
          setSelectedEvent(evt);
          setShowDeleteConfirm(true);
        }
      }
    } catch (err) {
      console.error('Error in dragStop handler:', err);
    }
  };

  const exportToCSV = () => {
    const exportEvents = events.filter(ev => {
      if (filters.status !== 'all' && ev.status !== filters.status) return false;
      if (filters.category !== 'all' && ev.category !== filters.category) return false;
      return true;
    });
    
    const headers = ['Title', 'Category', 'Start Date', 'End Date', 'Location', 'Organizer', 'Status', 'Free', 'Ticket Price', 'Max Attendees'];
    const rows = exportEvents.map(ev => [
      ev.title, ev.category, ev.start, ev.end || ev.start, ev.location || '',
      ev.organizer, ev.status, ev.is_free ? 'Yes' : 'No', ev.ticket_price || '', ev.max_attendees || ''
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

  const exportToICS = () => {
    const exportEvents = events.filter(ev => {
      if (filters.status !== 'all' && ev.status !== filters.status) return false;
      if (filters.category !== 'all' && ev.category !== filters.category) return false;
      return true;
    });

    const formatDateTime = (d) => {
      const dt = new Date(d);
      const pad = (n) => String(n).padStart(2, '0');
      return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`;
    };

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Daet Connect//Events//EN'
    ];

    exportEvents.forEach(ev => {
      const uid = ev.id || `${Date.now()}@daet.local`;
      const dtstart = formatDateTime(ev.start);
      const dtend = formatDateTime(ev.end || ev.start);
      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`UID:${uid}`);
      icsLines.push(`SUMMARY:${(ev.title || '').replace(/\n/g, ' ')}`);
      icsLines.push(`DTSTART:${dtstart}`);
      icsLines.push(`DTEND:${dtend}`);
      if (ev.location) icsLines.push(`LOCATION:${ev.location.replace(/\n/g, ' ')}`);
      if (ev.description) icsLines.push(`DESCRIPTION:${(ev.description || '').replace(/\n/g, ' ')}`);
      icsLines.push('END:VEVENT');
    });

    icsLines.push('END:VCALENDAR');

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events_${new Date().toISOString().split('T')[0]}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('iCal exported successfully!', false);
  };

  const printCalendar = () => {
    window.print();
  };

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
    setSelectedEventDetails(null);
    setEventForm({
      id: '', title: '', description: '', location: '', start_date: startStr || '', end_date: startStr || '',
      start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
      max_attendees: '', current_attendees: 0, organizer: 'Daet Tourism Office', status: 'draft',
      imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: [],
      recurrence: '', tags: [], featured: false
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const openEditModal = (eventObj) => {
    setSelectedEvent(eventObj);
    setSelectedEventDetails(eventObj);
    setEventForm({
      id: eventObj.id, title: eventObj.title, description: eventObj.description || '',
      location: eventObj.location || '', start_date: eventObj.start, end_date: eventObj.end || eventObj.start,
      start_time: eventObj.start_time || '', end_time: eventObj.end_time || '',
      category: eventObj.category || 'festival', is_free: eventObj.is_free !== false,
      ticket_price: eventObj.ticket_price || '', max_attendees: eventObj.max_attendees || '', 
      current_attendees: eventObj.current_attendees || getRegistrationsForEvent(eventObj.id).length || 0,
      organizer: eventObj.organizer || 'Daet Tourism Office', status: eventObj.status || 'draft',
      imageUrl: eventObj.image_url || '', videoUrl: eventObj.video_url || '',
      galleryImages: eventObj.gallery_images || [],
      galleryVideos: eventObj.gallery_videos || [],
      recurrence: eventObj.recurrence || '',
      tags: eventObj.tags || [],
      featured: !!eventObj.featured
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
    setTagInput('');
    setNewRegistrant({ name: '', email: '', status: 'confirmed' });
    setEventForm({
      id: '', title: '', description: '', location: '', start_date: '', end_date: '',
      start_time: '', end_time: '', category: 'festival', is_free: true, ticket_price: '',
      max_attendees: '', current_attendees: 0, organizer: 'Daet Tourism Office', status: 'draft',
      imageUrl: '', videoUrl: '', galleryImages: [], galleryVideos: [],
      recurrence: '', tags: [], featured: false
    });
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const addTag = () => {
    const cleanTag = tagInput.trim();
    if (!cleanTag) return;
    if (eventForm.tags.includes(cleanTag)) {
      setTagInput('');
      return;
    }
    setEventForm(prev => ({ ...prev, tags: [...(prev.tags || []), cleanTag] }));
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    setEventForm(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove)
    }));
  };

  const handleLocationChange = (value) => {
    setEventForm(p => ({ ...p, location: value }));
    if (value.length > 0) {
      const filtered = venues.filter(venue => 
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

  const handleEventSelection = (eventObj) => {
    if (!eventObj) return;
    setSelectedEventDetails(eventObj);
  };

  const addRegistration = (eventId) => {
    const trimmedName = newRegistrant.name.trim();
    const trimmedEmail = newRegistrant.email.trim();
    if (!trimmedName || !trimmedEmail) {
      showToast('Please enter attendee name and email', true);
      return;
    }

    const eventRegistrations = getRegistrationsForEvent(eventId);
    const nextList = [
      ...eventRegistrations,
      {
        id: `reg-${Date.now()}`,
        name: trimmedName,
        email: trimmedEmail,
        status: newRegistrant.status || 'confirmed',
        created_at: new Date().toISOString(),
      }
    ];

    const nextMap = {
      ...registrationsByEvent,
      [eventId]: nextList,
    };

    saveRegistrationsCache(nextMap);
    setNewRegistrant({ name: '', email: '', status: 'confirmed' });
    if (selectedEventDetails && selectedEventDetails.id === eventId) {
      setSelectedEventDetails({
        ...selectedEventDetails,
        current_attendees: nextList.length,
      });
    }
    showToast('Attendee added successfully', false);
  };

  const updateRegistrationStatus = (eventId, registrationId, nextStatus) => {
    const nextMap = {
      ...registrationsByEvent,
      [eventId]: (registrationsByEvent[eventId] || []).map((registration) =>
        registration.id === registrationId ? { ...registration, status: nextStatus } : registration
      )
    };
    saveRegistrationsCache(nextMap);
    if (selectedEventDetails && selectedEventDetails.id === eventId) {
      setSelectedEventDetails({
        ...selectedEventDetails,
        current_attendees: (nextMap[eventId] || []).length,
      });
    }
    showToast(`Registration marked as ${nextStatus}`, false);
  };

  const sendReminder = (eventId) => {
    const event = events.find((item) => item.id === eventId);
    const registrations = getRegistrationsForEvent(eventId);
    const reminderCount = registrations.length;

    addNotification('Reminder Sent', `${event?.title || 'Event'} reminder was sent to ${reminderCount} attendee${reminderCount === 1 ? '' : 's'}.`, 'info');
    showToast(`Reminder sent to ${reminderCount} attendee${reminderCount === 1 ? '' : 's'}`, false);
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

  const getStatusBadge = (status) => {
    const config = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: 'edit' },
      published: { bg: 'bg-green-100', text: 'text-green-700', icon: 'check' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: 'delete' },
      completed: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'check' }
    };
    const style = config[status] || config.draft;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon name={style.icon} className="w-3 h-3 inline-block mr-1" /> {status}
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
      video_url: ev.video_url,
      recurrence: ev.recurrence || '',
      tags: ev.tags || [],
      featured: !!ev.featured
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

  const eventAnalytics = useMemo(() => {
    const analyticsByEvent = events.map((event) => {
      const registrations = getRegistrationsForEvent(event.id);
      const confirmedCount = registrations.filter((entry) => entry.status === 'confirmed').length;
      const pendingCount = registrations.filter((entry) => entry.status === 'pending').length;
      const totalViews = Number(event.views || 0);
      const totalShares = Number(event.shares || 0);
      const capacity = Number(event.max_attendees || 0);
      const fillRate = capacity > 0 ? Math.min((confirmedCount / capacity) * 100, 100) : 0;

      return {
        id: event.id,
        title: event.title,
        registrations,
        confirmedCount,
        pendingCount,
        totalViews,
        totalShares,
        fillRate,
        capacity,
      };
    });

    const totals = analyticsByEvent.reduce((acc, item) => {
      acc.views += item.totalViews;
      acc.registrations += item.registrations.length;
      acc.shares += item.totalShares;
      acc.confirmed += item.confirmedCount;
      return acc;
    }, { views: 0, registrations: 0, shares: 0, confirmed: 0 });

    return {
      totals,
      byEvent: analyticsByEvent,
    };
  }, [events, getRegistrationsForEvent]);

  const upcomingEvents = events
    .filter(ev => ev.status === 'published' && new Date(ev.start) >= new Date())
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 10);

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const spotsRes = await supabase.from('info_tourist_spots').select('name').eq('status', 'published');
        const spots = (spotsRes?.data || []).map(s => s.name).filter(Boolean);
        setVenues(Array.from(new Set(spots)));
      } catch (err) {
        console.error('Error fetching venues:', err);
      }
    };
    fetchVenues();
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) { router.push('/login'); return; }
      const userData = JSON.parse(session);
      // Normalize session: login stores the user id as user_id, but the page expects .id
      if (!userData.id && userData.user_id) userData.id = userData.user_id;
      if (!hasAdminAccess(userData.role)) { router.push('/admin/dashboard'); return; }
      setUser(userData);
      await fetchEvents();
      setLoading(false);
    };
    checkAuth();
  }, [router, fetchEvents]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-medium">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)]">
      <AdminSidebar user={user} roleLabel="Events Manager" onLogout={async () => { await supabase.auth.signOut(); }} />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 rounded-[2rem] border border-sky-100 bg-white/80 p-5 shadow-[0_25px_60px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-sky-700">Events Management</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">Events & Activities Manager</h1>
              <p className="mt-2 text-sm text-slate-600">Create, manage, and schedule all tourism events in Daet with photos and videos</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
                    <option value="published">Publish</option>
                    <option value="draft">Move to Draft</option>
                    <option value="cancelled">Cancel</option>
                    <option value="delete">Delete</option>
                  </select>
                </div>
              )}
              <button onClick={exportToCSV} className="rounded-full bg-gray-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 flex items-center gap-2">
                <Icon name="save" className="w-4 h-4" /> Export CSV
              </button>
              <button onClick={exportToICS} className="rounded-full bg-gray-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-700 flex items-center gap-2">
                <Icon name="events" className="w-4 h-4" /> Export iCal
              </button>
              <button onClick={printCalendar} className="rounded-full bg-gray-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-600 flex items-center gap-2">
                <Icon name="expand" className="w-4 h-4" /> Print
              </button>
              <button onClick={() => openCreateModal()} className="rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_15px_30px_rgba(14,165,233,0.25)] transition hover:-translate-y-0.5 flex items-center gap-2">
                <Icon name="plus" className="w-4 h-4" /> Create Event
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards - Matching Dashboard Design */}
        <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-[1.6rem] border border-sky-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{stats.total}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Icon name="events" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-emerald-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Published</p>
                <p className="mt-3 text-3xl font-black text-emerald-600">{stats.published}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Icon name="check" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-amber-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
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
          <div className="rounded-[1.6rem] border border-rose-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Cancelled</p>
                <p className="mt-3 text-3xl font-black text-rose-600">{stats.cancelled}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <Icon name="delete" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-violet-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Completed</p>
                <p className="mt-3 text-3xl font-black text-violet-600">{stats.completed}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Icon name="check" className="w-5 h-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-purple-100 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Upcoming</p>
                <p className="mt-3 text-3xl font-black text-purple-600">{stats.upcoming}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <Icon name="events" className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar - Matching Dashboard Design */}
        <div className="mb-6 rounded-[2rem] border border-sky-100 bg-white/80 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Icon name="search" className="w-4 h-4" /></span>
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
              {EVENT_STATUSES.map(s => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {EVENT_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
            </select>
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className="px-3 py-2 border border-gray-200 rounded-full text-sm hover:bg-gray-50 flex items-center gap-1"
            >
              <Icon name="calendar" className="w-4 h-4" /> Date Filter
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

        {/* Calendar and Events List - Matching Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Section - Matching Dashboard Design */}
          <div className="lg:col-span-2 bg-white rounded-[2rem] border border-sky-100 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap justify-between items-center mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700">Calendar</p>
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  Event Calendar
                </h2>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
                Click any date to create event • Drag to reschedule
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
                if (event) {
                  setSelectedEventDetails(event);
                  openEditModal(event);
                }
              }}
              eventDidMount={(info) => {
                try {
                  const handler = () => {
                    const event = events.find(e => String(e.id) === String(info.event.id));
                    if (event) openEditModal(event);
                  };
                  info.el.addEventListener('dblclick', handler);
                  eventElListenersRef.current.set(info.event.id, handler);
                } catch (err) {}
              }}
              eventWillUnmount={(info) => {
                try {
                  const handler = eventElListenersRef.current.get(info.event.id);
                  if (handler) info.el.removeEventListener('dblclick', handler);
                  eventElListenersRef.current.delete(info.event.id);
                } catch (err) {}
              }}
              dayCellDidMount={(info) => {
                const hasEvents = info.el.querySelector('.fc-daygrid-day-events') &&
                  info.el.querySelector('.fc-daygrid-day-events')?.childElementCount > 0;
                if (hasEvents) {
                  info.el.style.background = '#dbeafe';
                  info.el.style.border = '1px solid #93c5fd';
                  info.el.style.boxShadow = 'inset 0 0 0 1px rgba(59,130,246,0.15)';
                }
              }}
              eventDragStart={handleEventDragStart}
              eventDragStop={handleEventDragStop}
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
            />
          </div>

          {/* Upcoming Events Widget - Matching Dashboard Design */}
          <div className="bg-white rounded-[2rem] border border-sky-100 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Upcoming</p>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  Upcoming Events
                </h3>
              </div>
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
                    <div
                      key={ev.id}
                      className={`p-3 rounded-2xl transition-colors cursor-pointer ${selectedEventDetails?.id === ev.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                      onClick={() => handleEventSelection(ev)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 text-sm">{ev.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          {ev.location && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <Icon name="attractions" className="w-3 h-3" /> {ev.location}
                            </p>
                          )}
                          {ev.image_url && (
                            <img 
                              src={ev.image_url} 
                              alt={ev.title} 
                              className="w-full h-24 object-cover rounded-xl mt-2 cursor-pointer hover:opacity-90"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMedia({ type: 'image', url: ev.image_url, title: ev.title });
                                setShowMediaPreviewModal(true);
                              }}
                            />
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${getCategoryColor(ev.category)}20`, color: getCategoryColor(ev.category) }}>
                              {ev.category}
                            </span>
                            {ev.video_url && <span className="text-xs text-blue-600">Video</span>}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(ev);
                          }} 
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
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
                  <span className="text-3xl">📅</span>
                  <p className="mt-2 text-sm">No upcoming events</p>
                  <p className="text-xs">Click on any date in the calendar to create one</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Event Details Panel - Matching Dashboard Design */}
        <div className="mt-6 bg-white rounded-[2rem] border border-sky-100 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700">Details</p>
              <h3 className="text-lg font-bold text-gray-800">Event Details</h3>
            </div>
            {selectedEventDetails && (
              <button onClick={() => openEditModal(selectedEventDetails)} className="text-sm text-blue-600 hover:underline">
                Edit Event
              </button>
            )}
          </div>

          {selectedEventDetails ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Title</p>
                <p className="font-semibold text-gray-900">{selectedEventDetails.title}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Category</p>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${getCategoryColor(selectedEventDetails.category)}20`, color: getCategoryColor(selectedEventDetails.category) }}>
                  {selectedEventDetails.category}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Status</p>
                <select
                  value={selectedEventDetails.status}
                  onChange={async (e) => {
                    const nextStatus = e.target.value;
                    const { error } = await supabase
                      .from('info_events')
                      .update({ status: nextStatus })
                      .eq('id', selectedEventDetails.id);

                    if (!error) {
                      const updatedEvent = { ...selectedEventDetails, status: nextStatus };
                      setSelectedEventDetails(updatedEvent);
                      await fetchEvents();
                      showToast(`Status changed to ${nextStatus}`, false);
                    } else {
                      showToast(`Failed to update status: ${error.message}`, true);
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-full text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {EVENT_STATUSES.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Date</p>
                <p>{new Date(selectedEventDetails.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 
                  {selectedEventDetails.start !== selectedEventDetails.end && ` → ${new Date(selectedEventDetails.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </p>
              </div>
              {selectedEventDetails.location && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Location</p>
                  <p>{selectedEventDetails.location}</p>
                </div>
              )}
              {selectedEventDetails.organizer && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Organizer</p>
                  <p>{selectedEventDetails.organizer}</p>
                </div>
              )}
              {selectedEventDetails.description && (
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Description</p>
                  <p className="text-gray-600 leading-relaxed">{selectedEventDetails.description}</p>
                </div>
              )}
              
              {/* Capacity */}
              <div className="md:col-span-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Capacity</p>
                  <span className="text-xs font-medium text-gray-600">
                    {getRegistrationsForEvent(selectedEventDetails.id).filter((entry) => entry.status === 'confirmed').length}/{selectedEventDetails.max_attendees || 0} filled
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                    style={{
                      width: `${selectedEventDetails.max_attendees ? Math.min(((getRegistrationsForEvent(selectedEventDetails.id).filter((entry) => entry.status === 'confirmed').length / Number(selectedEventDetails.max_attendees)) * 100), 100) : 0}%`,
                    }}
                  />
                </div>
                <button
                  onClick={() => sendReminder(selectedEventDetails.id)}
                  className="mt-3 w-full bg-blue-600 text-white rounded-full px-3 py-1.5 text-xs font-medium hover:bg-blue-700"
                >
                  Send reminder to {getRegistrationsForEvent(selectedEventDetails.id).length} attendees
                </button>
              </div>

              {/* Registrations */}
              <div className="md:col-span-2 rounded-2xl border border-gray-200 bg-white p-3">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Registrations</p>
                  <span className="text-xs text-gray-500">{getRegistrationsForEvent(selectedEventDetails.id).length} total</span>
                </div>

                <div className="grid grid-cols-[1fr_1fr_80px] gap-2 mb-2 text-[10px] uppercase tracking-wide text-gray-400">
                  <span>Name</span>
                  <span>Status</span>
                  <span className="text-right">Action</span>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {getRegistrationsForEvent(selectedEventDetails.id).length > 0 ? (
                    getRegistrationsForEvent(selectedEventDetails.id).map((registration) => (
                      <div key={registration.id} className="grid grid-cols-[1fr_1fr_80px] gap-2 items-center rounded-xl bg-gray-50 px-2 py-1.5 text-xs">
                        <div>
                          <p className="font-medium text-gray-700">{registration.name}</p>
                          <p className="text-[10px] text-gray-400">{registration.email}</p>
                        </div>
                        <select
                          value={registration.status}
                          onChange={(e) => updateRegistrationStatus(selectedEventDetails.id, registration.id, e.target.value)}
                          className="px-1.5 py-1 border border-gray-200 rounded-full text-[10px] bg-white"
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button
                          onClick={() => updateRegistrationStatus(selectedEventDetails.id, registration.id, 'cancelled')}
                          className="text-right text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 py-2">No registrations yet.</p>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newRegistrant.name}
                    onChange={(e) => setNewRegistrant((prev) => ({ ...prev, name: e.target.value }))}
                    className="px-2 py-1.5 border border-gray-200 rounded-full text-xs"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newRegistrant.email}
                    onChange={(e) => setNewRegistrant((prev) => ({ ...prev, email: e.target.value }))}
                    className="px-2 py-1.5 border border-gray-200 rounded-full text-xs"
                  />
                  <button
                    onClick={() => addRegistration(selectedEventDetails.id)}
                    className="bg-emerald-600 text-white rounded-full px-3 py-1.5 text-xs font-medium hover:bg-emerald-700"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tags */}
              {(selectedEventDetails.tags || []).length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEventDetails.tags.map((tag, idx) => (
                      <span key={`${tag}-${idx}`} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <span className="text-3xl">📋</span>
              <p className="mt-2 text-sm">Select an event to view details</p>
              <p className="text-xs">Click on any event in the calendar or list above</p>
            </div>
          )}
        </div>

        {/* Events List Table - Matching Dashboard Design */}
        <div className="mt-6 bg-white rounded-[2rem] border border-sky-100 shadow-[0_20px_50px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">All Events</p>
              <h3 className="font-semibold text-gray-800">All Events</h3>
            </div>
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
                  <tr key={ev.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => handleEventSelection(ev)}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMedia({ type: 'image', url: ev.image_url, title: ev.title });
                              setShowMediaPreviewModal(true);
                            }}
                            className="p-1 hover:bg-gray-100 rounded-lg transition"
                            title="View image"
                          >
                            <Icon name="image" className="w-5 h-5 text-gray-500" />
                          </button>
                        )}
                        {ev.video_url && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMedia({ type: 'video', url: ev.video_url, title: ev.title });
                              setShowMediaPreviewModal(true);
                            }}
                            className="p-1 hover:bg-gray-100 rounded-lg transition"
                            title="View video"
                          >
                            <Icon name="video" className="w-5 h-5 text-gray-500" />
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
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEditModal(ev)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                          title="Edit"
                        >
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEvent(ev);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          title="Delete"
                        >
                          <Icon name="delete" className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEvents.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <span className="text-4xl">📅</span>
                <p className="mt-2">No events found matching your criteria</p>
                <button onClick={() => openCreateModal()} className="mt-3 text-blue-600 hover:underline">
                  Create your first event →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                {eventForm.id ? 'Edit Event' : 'Create New Event'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
                <input
                  autoFocus
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
                        <Icon name="attractions" className="w-4 h-4 text-gray-400" /> {venue}
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Image</label>
                <MediaUpload
                  bucket="events"
                  folder="featured"
                  mediaType="image"
                  existingMediaUrl={eventForm.imageUrl}
                  onUploadComplete={(url) => setEventForm(p => ({ ...p, imageUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Upload Featured Image"
                  maxSizeMB={5}
                />
                <p className="text-xs text-gray-400 mt-1">This image will appear as the event thumbnail (max 5MB)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Promo Video</label>
                <MediaUpload
                  bucket="events"
                  folder="videos"
                  mediaType="video"
                  existingMediaUrl={eventForm.videoUrl}
                  onUploadComplete={(url) => setEventForm(p => ({ ...p, videoUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Upload Promo Video"
                  maxSizeMB={20}
                />
                <p className="text-xs text-gray-400 mt-1">Short promotional video (MP4, MOV, WebM, max 20MB)</p>
              </div>
              
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
                  buttonText="Add Image to Gallery"
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
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
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
                  buttonText="Add Video to Gallery"
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
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
                  <select
                    value={eventForm.recurrence || ''}
                    onChange={e => setEventForm(p => ({ ...p, recurrence: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                  >
                    {RECURRENCE_OPTIONS.map(option => (
                      <option key={option.value || 'one-time'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-center h-full pt-6">
                  <label className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-2xl w-full justify-center">
                    <input
                      type="checkbox"
                      checked={!!eventForm.featured}
                      onChange={e => setEventForm(p => ({ ...p, featured: e.target.checked }))}
                      className="w-4 h-4 text-yellow-600"
                    />
                    <span className="text-sm font-medium text-yellow-800">Featured Event</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                    placeholder="Add tag and press Enter"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-3 py-2 bg-gray-100 rounded-2xl text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 min-h-8">
                  {(eventForm.tags || []).length > 0 ? (
                    (eventForm.tags || []).map((tag, idx) => (
                      <span key={`${tag}-${idx}`} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium">
                        #{tag}
                        <button type="button" onClick={() => removeTag(tag)} className="text-blue-800 hover:text-blue-900">✕</button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400">No tags yet</span>
                  )}
                </div>
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
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Attendees</label>
                  <input
                    type="number"
                    value={eventForm.current_attendees || 0}
                    onChange={e => setEventForm(p => ({ ...p, current_attendees: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
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
              {eventForm.id && (
                <button 
                  onClick={() => {
                    setSelectedEvent({ id: eventForm.id, title: eventForm.title });
                    setShowDeleteConfirm(true);
                    setShowEventModal(false);
                  }} 
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 text-sm"
                >
                  Delete
                </button>
              )}
              <button onClick={saveEvent} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm disabled:opacity-50">
                {saving ? 'Saving...' : (eventForm.id ? 'Update Event' : 'Create Event')}
              </button>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">Tip: Drag events on the calendar to reschedule. Add images and videos to make your events more engaging.</p>
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
              ✕
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
        <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm shadow-lg max-w-[90vw] animate-toast-in ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
            <span className="shrink-0">{toastMessage.isError ? '⚠️' : '✅'}</span>
            <span className="break-words">{toastMessage.message}</span>
          </div>
        </div>
      )}

      {/* Trash Drop Zone */}
      {showTrashDropZone && (
        <div ref={trashRef} className="fixed bottom-5 right-20 z-30 flex items-center gap-2 bg-red-600 text-white rounded-full p-3 shadow-lg transition-all animate-pulse">
          <span className="text-sm font-medium">🗑️ Drop to delete</span>
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
        .fc-daygrid-day-events {
          padding: 0.2rem 0.4rem 0.4rem;
        }
        .fc-daygrid-event {
          border-radius: 10px !important;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.18);
          font-weight: 600 !important;
        }
        .fc .fc-daygrid-day-frame {
          background: rgba(255, 255, 255, 0.75);
          border-radius: 12px;
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
        .fc .fc-daygrid-day-number {
          font-size: 0.85rem !important;
          font-weight: 500 !important;
          color: #1e293b !important;
        }
        .fc .fc-col-header-cell-cushion {
          font-weight: 600 !important;
          color: #475569 !important;
          text-transform: uppercase !important;
          font-size: 0.7rem !important;
          letter-spacing: 0.05em !important;
        }
      `}</style>
    </div>
  );
}