// app/admin/dashboard/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import MediaUpload from '@/app/components/MediaUpload';
import AdminSidebar from '@/app/components/AdminSidebar';

// Weather API configuration
const WEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY || 'eb04fa7f82400a4f1de5b71301e52119';
const DAET_COORDS = { lat: 14.1122, lon: 122.9553 };

// Real venues in Daet, Camarines Norte
const REAL_VENUES = [
  'Bagasbas Beach', 'Daet Plaza (Plaza Rizal)', 'Bicol University - Daet Campus',
  'Daet Public Market', 'Camarines Norte Provincial Capitol', 'St. John the Baptist Cathedral',
  'Museo de Daet', 'Daet Municipal Hall', 'Bagasbas Lighthouse', 'Mampurog River',
  'Daet Church', 'Bagasbas View Deck', 'Daet Convention Center',
  'Camarines Norte State College', 'Mabini Street', 'Daet Sports Complex',
  'Mangrove Eco-Park', 'Cabusao Wetland', 'Mercedes Beach', 'Paradise Beach',
  'Calasgasan Bay', 'Daet Baywalk'
];

const EVENT_CATEGORIES = ['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'];

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Weather State
  const [weather, setWeather] = useState({
    current: null, forecast: [], loading: true, error: null, lastUpdated: null, alert: null
  });
  
  // Analytics Stats
  const [stats, setStats] = useState({
    totalUsers: 0, totalTourists: 0, totalArtisans: 0, totalOperators: 0, onlineUsers: 0,
    totalEvents: 0, totalSpots: 0, totalBlogs: 0, pendingPosts: 0
  });
  
  const [recentUsers, setRecentUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
  const [unreadInquiries, setUnreadInquiries] = useState([]);
  const [calendarStats, setCalendarStats] = useState({ upcomingEvents: 0, totalEvents: 0, totalActivities: 0 });
  
  // Modal States
  const [showEventModal, setShowEventModal] = useState(false);
  const [showQuickPublishModal, setShowQuickPublishModal] = useState(false);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [showWeatherAlertModal, setShowWeatherAlertModal] = useState(false);
  const [weatherAlertMessage, setWeatherAlertMessage] = useState('');
  
  const [eventForm, setEventForm] = useState({
    id: '', title: '', description: '', location: '', start_date: '', end_date: '',
    start_time: '', end_time: '', category: '', is_free: true, ticket_price: '',
    max_attendees: '', organizer: '', status: 'published', imageUrl: '', videoUrl: ''
  });
  
  const [quickPublish, setQuickPublish] = useState({
    type: 'announcement', title: '', message: '', severity: 'info', imageUrl: '', videoUrl: ''
  });
  
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarKey, setCalendarKey] = useState(0);

  const calendarRef = useRef(null);
  const eventsRef = useRef([]);
  const locationInputRef = useRef(null);

  const getCategoryColor = (category) => {
    const colors = { 
      'festival': '#8B5CF6', 
      'concert': '#EF4444', 
      'exhibition': '#F59E0B', 
      'workshop': '#3B82F6', 
      'sports': '#06B6D4', 
      'cultural': '#EC4899' 
    };
    return colors[category] || '#0f3b2c';
  };

  const fetchEventsFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('info_events')
        .select('*')
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      
      const formattedEvents = data.map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        start: event.start_date,
        end: event.end_date,
        category: event.category,
        is_free: event.is_free,
        ticket_price: event.ticket_price,
        max_attendees: event.max_attendees,
        organizer: event.organizer,
        start_time: event.start_time,
        end_time: event.end_time,
        status: event.status,
        image_url: event.image_url,
        video_url: event.video_url
      }));
      
      setEvents(formattedEvents);
      setCalendarKey(prev => prev + 1);
      return formattedEvents;
    } catch (err) {
      console.error('Error fetching events:', err);
      addNotification('Database Error', `Failed to load events: ${err.message}`, 'error', null, 0);
      return [];
    }
  };

  const saveEventToDB = async (eventData) => {
    setSaving(true);
    try {
      const dbEvent = {
        title: eventData.title,
        description: eventData.description || '',
        location: eventData.location || '',
        start_date: eventData.start_date,
        end_date: eventData.end_date || eventData.start_date,
        start_time: eventData.start_time || null,
        end_time: eventData.end_time || null,
        category: eventData.category || 'festival',
        is_free: eventData.is_free === true || eventData.is_free === 'true',
        ticket_price: eventData.is_free ? null : (eventData.ticket_price ? parseFloat(eventData.ticket_price) : null),
        max_attendees: eventData.max_attendees ? parseInt(eventData.max_attendees) : null,
        organizer: eventData.organizer || 'Daet Tourism Office',
        status: eventData.status || 'published',
        image_url: eventData.imageUrl || null,
        video_url: eventData.videoUrl || null
      };

      let result;
      if (eventData.id) {
        result = await supabase
          .from('info_events')
          .update(dbEvent)
          .eq('id', eventData.id)
          .select();
      } else {
        result = await supabase
          .from('info_events')
          .insert([dbEvent])
          .select();
      }

      if (result.error) throw result.error;
      
      await fetchEventsFromDB();
      
      return result.data[0];
    } catch (err) {
      console.error('Error saving event:', err);
      addNotification('Save Error', `Failed to save event: ${err.message}`, 'error', null, 0);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const deleteEventFromDB = async (eventId) => {
    try {
      const { error } = await supabase
        .from('info_events')
        .delete()
        .eq('id', eventId);
      
      if (error) throw error;
      await fetchEventsFromDB();
      return true;
    } catch (err) {
      console.error('Error deleting event:', err);
      addNotification('Delete Error', `Failed to delete event: ${err.message}`, 'error', null, 0);
      return false;
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
      
      await fetchEventsFromDB();
      showToast('Event rescheduled successfully!', false);
      addNotification('Event Rescheduled', `Event has been moved to ${formattedStart}`, 'info', null, 0);
      return true;
    } catch (err) {
      console.error('Error updating event dates:', err);
      showToast(`Failed to reschedule: ${err.message}`, true);
      return false;
    }
  };

  const generateNotificationId = () => Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  
  const MAX_NOTIFICATIONS = 20;

  const addNotification = (title, message, type = 'info', link = null, duration = 0) => {
    const newNotification = {
      id: generateNotificationId(), title, message, type, link,
      timestamp: new Date(), read: false
    };
    
    setNotifications(prev => [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS));
    showToast(message, type === 'error');
    
    return newNotification.id;
  };
  
  const markAsRead = (id) => {
    setNotifications(prev => prev.map(notif => notif.id === id ? { ...notif, read: true } : notif));
  };
  
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
  };
  
  const clearAllNotifications = () => {
    setNotifications([]);
    setShowNotifications(false);
    addNotification('Notifications Cleared', 'All notifications have been cleared', 'info', null, 0);
  };
  
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const checkUpcomingEvents = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(now.getDate() + 3);
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(now.getDate() + 7);
    
    events.forEach(event => {
      if (event.status !== 'published') return;
      const eventDate = new Date(event.start);
      const eventTitle = event.title;
      const sentNotifications = JSON.parse(sessionStorage.getItem('sent_event_notifications') || '{}');
      const notificationKey = `${event.id}_${eventDate.toDateString()}`;
      
      if (!sentNotifications[notificationKey]) {
        if (eventDate.toDateString() === now.toDateString()) {
          addNotification('Event Today! 🎉', `"${eventTitle}" is happening today at ${event.location || 'venue TBA'}`, 'event', null, 0);
          sentNotifications[notificationKey] = true;
          sessionStorage.setItem('sent_event_notifications', JSON.stringify(sentNotifications));
        } else if (eventDate.toDateString() === tomorrow.toDateString()) {
          addNotification('Event Tomorrow! 📅', `"${eventTitle}" is happening tomorrow at ${event.location || 'venue TBA'}`, 'event', null, 0);
          sentNotifications[notificationKey] = true;
          sessionStorage.setItem('sent_event_notifications', JSON.stringify(sentNotifications));
        } else if (eventDate.toDateString() === threeDaysLater.toDateString()) {
          addNotification('Upcoming Event 📅', `"${eventTitle}" will take place in 3 days at ${event.location || 'venue TBA'}`, 'event', null, 0);
          sentNotifications[notificationKey] = true;
          sessionStorage.setItem('sent_event_notifications', JSON.stringify(sentNotifications));
        } else if (eventDate > now && eventDate <= sevenDaysLater) {
          const daysDiff = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
          addNotification('Upcoming Event 📅', `"${eventTitle}" is in ${daysDiff} days at ${event.location || 'venue TBA'}`, 'event', null, 0);
          sentNotifications[notificationKey] = true;
          sessionStorage.setItem('sent_event_notifications', JSON.stringify(sentNotifications));
        }
      }
    });
  };

  const checkWeatherNotifications = (weatherData) => {
    if (!weatherData?.current) return;
    const condition = weatherData.current.condition;
    const temp = weatherData.current.temp;
    const windSpeed = weatherData.current.windSpeed;
    let alertType = null;
    let alertMsg = '';
    
    if (condition === 'Thunderstorm') {
      alertType = 'critical';
      alertMsg = '⚠️ THUNDERSTORM WARNING: Postpone outdoor events. Advise tourists to stay safe indoors.';
    } else if (condition === 'Rain' || condition === 'Drizzle') {
      if (weatherData.current.rainAmount && weatherData.current.rainAmount > 10) {
        alertType = 'warning';
        alertMsg = '🌧️ HEAVY RAIN ADVISORY: Expect flooding in low-lying areas. Consider indoor alternatives for scheduled events.';
      } else {
        alertType = 'warning';
        alertMsg = '🌧️ RAIN ADVISORY: Rain expected today. Bring umbrellas and prepare indoor alternatives.';
      }
    } else if (temp > 35) {
      alertType = 'warning';
      alertMsg = '🔥 EXTREME HEAT ADVISORY: Temperature above 35°C. Remind tourists to stay hydrated and avoid midday sun exposure.';
    } else if (temp > 32) {
      alertType = 'warning';
      alertMsg = '🔥 HEAT ADVISORY: High temperature today. Stay hydrated and avoid prolonged sun exposure.';
    } else if (windSpeed > 30) {
      alertType = 'critical';
      alertMsg = '💨 TYPHOON SIGNAL: Strong winds detected. Water activities are UNSAFE. Consider evacuating beach areas.';
    } else if (windSpeed > 20) {
      alertType = 'warning';
      alertMsg = '💨 STRONG WIND WARNING: Water activities may be unsafe. Exercise caution at Bagasbas Beach.';
    }
    
    if (alertType) {
      setWeather(prev => ({ ...prev, alert: { type: alertType, message: alertMsg } }));
      
      const sentAlerts = JSON.parse(sessionStorage.getItem('sent_weather_alerts') || '{}');
      const todayKey = new Date().toDateString();
      if (!sentAlerts[todayKey + '_weather']) {
        addNotification('Weather Alert', alertMsg, alertType === 'critical' ? 'error' : 'warning', null, 0);
        sentAlerts[todayKey + '_weather'] = true;
        sessionStorage.setItem('sent_weather_alerts', JSON.stringify(sentAlerts));
      }
    } else {
      setWeather(prev => ({ ...prev, alert: null }));
    }
  };

  const getWeatherIcon = (condition) => {
    const icons = { 'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️', 'Drizzle': '💧', 'Thunderstorm': '⛈️', 'Snow': '❄️', 'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🔥' };
    return icons[condition] || '🌡️';
  };

  const getWeatherRecommendation = (condition, temp) => {
    if (condition.includes('Rain') || condition === 'Drizzle') return { text: 'Indoor activities recommended. Bring umbrella!', type: 'warning' };
    if (condition === 'Thunderstorm') return { text: 'Severe weather! Avoid outdoor activities.', type: 'error' };
    if (temp > 32) return { text: 'Heat advisory! Stay hydrated, avoid midday sun.', type: 'warning' };
    if (temp < 24) return { text: 'Cool weather - perfect for outdoor tours!', type: 'success' };
    if (condition === 'Clear' || condition === 'Clouds') return { text: 'Great weather for tourism activities!', type: 'success' };
    return { text: 'Moderate conditions suitable for tourism.', type: 'info' };
  };

  const fetchWeather = async () => {
    setWeather(prev => ({ ...prev, loading: true, error: null }));
    try {
      const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${DAET_COORDS.lat}&lon=${DAET_COORDS.lon}&units=metric&appid=${WEATHER_API_KEY}`);
      if (!currentRes.ok) throw new Error('Failed to fetch current weather');
      const currentData = await currentRes.json();

      const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${DAET_COORDS.lat}&lon=${DAET_COORDS.lon}&units=metric&appid=${WEATHER_API_KEY}`);
      if (!forecastRes.ok) throw new Error('Failed to fetch forecast');
      const forecastData = await forecastRes.json();

      const dailyForecast = [];
      const daysMap = new Map();
      forecastData.list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!daysMap.has(date) && dailyForecast.length < 5) {
          daysMap.set(date, { 
            date, 
            temp_min: item.main.temp_min, 
            temp_max: item.main.temp_max,
            temp: item.main.temp, 
            condition: item.weather[0].main, 
            description: item.weather[0].description, 
            icon: item.weather[0].icon 
          });
          dailyForecast.push(daysMap.get(date));
        }
      });

      const weatherData = {
        current: {
          temp: Math.round(currentData.main.temp), feelsLike: Math.round(currentData.main.feels_like),
          condition: currentData.weather[0].main, description: currentData.weather[0].description,
          humidity: currentData.main.humidity, windSpeed: currentData.wind.speed,
          pressure: currentData.main.pressure, sunrise: currentData.sys.sunrise, sunset: currentData.sys.sunset,
          icon: currentData.weather[0].icon, rainAmount: currentData.rain ? currentData.rain['1h'] || 0 : 0
        },
        forecast: dailyForecast.slice(0, 5),
        lastUpdated: new Date()
      };
      setWeather(prev => ({ ...weatherData, loading: false, error: null, alert: prev.alert }));
      checkWeatherNotifications(weatherData);
    } catch (err) {
      console.error('Weather fetch error:', err);
      setWeather(prev => ({ ...prev, error: 'Unable to fetch weather data', loading: false }));
      addNotification('Weather Service Error', 'Failed to fetch weather data.', 'error', null, 0);
    }
  };

  const handleIssueWeatherAlert = () => {
    if (weather.alert) {
      setWeatherAlertMessage(weather.alert.message);
      setShowWeatherAlertModal(true);
      setShowWeatherDetails(false);
    }
  };

  const publishWeatherAlert = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('info_announcements')
        .insert([{
          title: 'Weather Advisory',
          message: weatherAlertMessage,
          type: 'safety',
          severity: weather.alert?.type === 'critical' ? 'critical' : 'warning',
          created_by: user?.id,
          status: 'published'
        }]);
      
      if (error) throw error;
      
      showToast('Weather alert published!', false);
      addNotification('Weather Alert Published', 'A weather advisory has been sent to all users.', 'warning', null, 0);
      setShowWeatherAlertModal(false);
      setWeather(prev => ({ ...prev, alert: null }));
    } catch (err) {
      console.error('Publish error:', err);
      showToast('Failed to publish alert', true);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      checkUpcomingEvents();
      const eventCheckInterval = setInterval(checkUpcomingEvents, 60 * 60 * 1000);
      return () => clearInterval(eventCheckInterval);
    }
  }, [events]);

  useEffect(() => {
    if (user) {
      addNotification('Welcome to Admin Dashboard', `Hello ${user.user_name || 'Admin'}! You have full control over events and tourism activities.`, 'success', null, 0);
    }
  }, [user]);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 2500);
  };

  const updateCalendarStats = (eventsList) => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(now); thirtyDaysLater.setDate(now.getDate() + 30);
    const upcoming = eventsList.filter(ev => new Date(ev.start) >= now && new Date(ev.start) <= thirtyDaysLater && ev.status === 'published').length;
    const activities = eventsList.filter(ev => (ev.category === 'workshop' || ev.category === 'exhibition') && ev.status === 'published').length;
    setCalendarStats({ upcomingEvents: upcoming, totalEvents: eventsList.filter(ev => ev.status === 'published').length, totalActivities: activities });
  };

  const openCreateModal = (startStr, endStr) => {
    setSelectedDate(startStr);
    setEventForm({ 
      id: '', title: '', description: '', location: '', start_date: startStr, end_date: endStr || startStr,
      start_time: '', end_time: '', category: '', is_free: true, ticket_price: '', max_attendees: '', 
      organizer: 'Daet Tourism Office', status: 'published', imageUrl: '', videoUrl: ''
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const openEditModal = (eventObj) => {
    setEventForm({
      id: eventObj.id, title: eventObj.title.replace(/\s*\([^)]*\)\s*$/, ''), description: eventObj.extendedProps?.description || '',
      location: eventObj.extendedProps?.location || '', start_date: eventObj.startStr || eventObj.start,
      end_date: eventObj.endStr || eventObj.end || eventObj.startStr, start_time: eventObj.extendedProps?.start_time || '',
      end_time: eventObj.extendedProps?.end_time || '', category: eventObj.extendedProps?.category || '',
      is_free: eventObj.extendedProps?.is_free !== undefined ? eventObj.extendedProps.is_free : true,
      ticket_price: eventObj.extendedProps?.ticket_price || '', max_attendees: eventObj.extendedProps?.max_attendees || '',
      organizer: eventObj.extendedProps?.organizer || 'Daet Tourism Office', status: eventObj.extendedProps?.status || 'published',
      imageUrl: eventObj.extendedProps?.image_url || '', videoUrl: eventObj.extendedProps?.video_url || ''
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setShowQuickPublishModal(false);
    setShowInquiryModal(false);
    setShowWeatherAlertModal(false);
    setSelectedInquiry(null);
    setEventForm({ id: '', title: '', description: '', location: '', start_date: '', end_date: '', start_time: '', end_time: '', category: '', is_free: true, ticket_price: '', max_attendees: '', organizer: '', status: 'published', imageUrl: '', videoUrl: '' });
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const deleteEventById = async (eventId) => {
    const eventToDelete = eventsRef.current.find(e => e.id === eventId);
    if (eventToDelete) {
      if (confirm(`Delete "${eventToDelete.title}" permanently?`)) {
        const success = await deleteEventFromDB(eventId);
        if (success) {
          showToast(`"${eventToDelete.title}" deleted`, true);
          addNotification('Event Deleted', `"${eventToDelete.title}" has been removed.`, 'warning', null, 0);
        }
        return success;
      }
    }
    return false;
  };

  const saveEvent = async () => {
    const { id, title, start_date, end_date, location, description, category, start_time, end_time, is_free, ticket_price, max_attendees, organizer, status, imageUrl, videoUrl } = eventForm;
    if (!title.trim()) { showToast('Please enter an event title', true); return; }
    if (!start_date) { showToast('Please select a start date', true); return; }
    if (!category) { showToast('Please select a category', true); return; }
    
    try {
      const savedEvent = await saveEventToDB({ id, title, description, location, start_date, end_date: end_date || start_date, start_time, end_time, category, is_free, ticket_price, max_attendees, organizer, status, imageUrl, videoUrl });
      if (savedEvent) {
        if (id) {
          showToast('Event updated!', false);
          addNotification('Event Updated', `"${title}" has been modified.`, 'info', null, 0);
        } else {
          showToast('Event created!', false);
          addNotification('New Event Created', `"${title}" has been added.`, 'success', null, 0);
        }
        closeModal();
      }
    } catch (err) {
      console.error('Save failed:', err);
      showToast(`Failed to save event: ${err.message}`, true);
    }
  };

  const handleQuickPublish = async () => {
    if (!quickPublish.title.trim() || !quickPublish.message.trim()) {
      showToast('Please fill in all fields', true);
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('info_announcements')
        .insert([{
          title: quickPublish.title,
          message: quickPublish.message,
          type: quickPublish.type,
          severity: quickPublish.severity,
          image_url: quickPublish.imageUrl || null,
          video_url: quickPublish.videoUrl || null,
          created_by: user?.id,
          status: 'published'
        }]);
      
      if (error) throw error;
      
      showToast('Announcement published!', false);
      addNotification('Announcement Published', `"${quickPublish.title}" has been sent to all users.`, 'success', null, 0);
      setQuickPublish({ type: 'announcement', title: '', message: '', severity: 'info', imageUrl: '', videoUrl: '' });
      closeModal();
    } catch (err) {
      console.error('Publish error:', err);
      showToast('Failed to publish announcement', true);
    } finally {
      setSaving(false);
    }
  };

  const handleReplyToInquiry = async (inquiryId, reply) => {
    if (!reply.trim()) {
      showToast('Please enter a reply', true);
      return;
    }
    
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({ 
          admin_response: reply, 
          status: 'answered',
          responded_at: new Date(),
          responded_by: user?.id
        })
        .eq('id', inquiryId);
      
      if (error) throw error;
      
      showToast('Reply sent successfully!', false);
      addNotification('Inquiry Answered', 'A tourist inquiry has been responded to.', 'success', null, 0);
      closeModal();
      fetchUnreadInquiries();
    } catch (err) {
      console.error('Reply error:', err);
      showToast('Failed to send reply', true);
    }
  };

  const handleLocationChange = (value) => {
    setEventForm(p => ({ ...p, location: value }));
    if (value.length > 0) {
      const filtered = REAL_VENUES.filter(venue => venue.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
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

  useEffect(() => {
    eventsRef.current = events;
    updateCalendarStats(events);
  }, [events]);

  useEffect(() => {
    fetchEventsFromDB();
    fetchPendingPosts();
    fetchUnreadInquiries();
    fetchTouristSpotsCount();
    fetchBlogsCount();
  }, []);

  const fetchPendingPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('info_user_posts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPendingPosts(data || []);
      setStats(prev => ({ ...prev, pendingPosts: data?.length || 0 }));
    } catch (err) {
      console.error('Error fetching pending posts:', err);
    }
  };

  const fetchUnreadInquiries = async () => {
    try {
      const { data, error } = await supabase
        .from('info_inquiries')
        .select('*')
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUnreadInquiries(data || []);
    } catch (err) {
      console.error('Error fetching inquiries:', err);
    }
  };

  const fetchTouristSpotsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('info_tourist_spots')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');
      
      if (error) throw error;
      setStats(prev => ({ ...prev, totalSpots: count || 0 }));
    } catch (err) {
      console.error('Error fetching spots count:', err);
    }
  };

  const fetchBlogsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('info_blogs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');
      
      if (error) throw error;
      setStats(prev => ({ ...prev, totalBlogs: count || 0 }));
    } catch (err) {
      console.error('Error fetching blogs count:', err);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) { router.push('/login'); return; }
      const userData = JSON.parse(session);
      if (userData.role !== 'admin') { router.push('/dashboard'); return; }
      setUser(userData);
      await fetchDashboardData();
      setLoading(false);
    };
    checkAuth();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load users');
      const users = data.users || [];
      setStats(prev => ({
        ...prev,
        totalUsers: users.length, totalTourists: users.filter(u => u.user_type === 'tourist').length,
        totalArtisans: users.filter(u => u.user_type === 'artisan').length,
        totalOperators: users.filter(u => u.user_type === 'operator').length,
        onlineUsers: users.filter(u => u.is_online === true).length
      }));
      setRecentUsers(users.filter(u => u.user_type !== 'admin').slice(0, 5));
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const handleLogout = async () => {
    addNotification('Logged Out', 'You have been logged out successfully.', 'info', null, 0);
    sessionStorage.removeItem('user_session');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return 'bg-red-600';
      case 'warning': return 'bg-yellow-500';
      case 'info': return 'bg-blue-600';
      default: return 'bg-blue-600';
    }
  };

  const calendarEvents = events.filter(ev => ev.status === 'published').map(ev => ({
    id: String(ev.id), title: ev.title + (ev.category ? ` (${ev.category})` : ''),
    start: ev.start, end: ev.end, allDay: true,
    extendedProps: { 
      location: ev.location || '', description: ev.description || '', category: ev.category || '', 
      start_time: ev.start_time, end_time: ev.end_time, is_free: ev.is_free, ticket_price: ev.ticket_price, 
      max_attendees: ev.max_attendees, organizer: ev.organizer, status: ev.status,
      image_url: ev.image_url, video_url: ev.video_url
    },
    backgroundColor: getCategoryColor(ev.category), borderColor: '#ffffff', textColor: '#ffffff',
  }));

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'success': return '✅'; case 'warning': return '⚠️'; case 'error': return '🔴';
      case 'weather': return '🌤️'; case 'event': return '📅'; case 'user': return '👤';
      default: return 'ℹ️';
    }
  };
  
  const getNotificationColor = (type) => {
    switch(type) {
      case 'success': return 'bg-green-50 border-green-200'; case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'error': return 'bg-red-50 border-red-200'; case 'weather': return 'bg-sky-50 border-sky-200';
      case 'event': return 'bg-violet-50 border-violet-200'; case 'user': return 'bg-indigo-50 border-indigo-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getUpcomingEvents = () => {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(now.getDate() + 7);
    return events.filter(ev => {
      const evDate = new Date(ev.start);
      return ev.status === 'published' && evDate >= now && evDate <= sevenDaysLater;
    }).sort((a, b) => new Date(a.start) - new Date(b.start));
  };

  const getTrendingEvents = () => {
    return events
      .filter(ev => ev.status === 'published')
      .slice(0, 5);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="System Administrator" />

      {/* Main Content */}
      <div className="ml-64 p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Administrator Command Center</h1>
              <p className="text-gray-500 mt-1 text-sm">Complete control over Daet's tourism ecosystem • Events • Users • Content • Analytics</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Quick Publish Button */}
              <button onClick={() => setShowQuickPublishModal(true)} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-all duration-200 shadow-sm">
                <span>📢</span>
                <span className="text-sm font-medium">Quick Publish</span>
              </button>

              {/* Weather Widget */}
              <div className="relative">
                <button onClick={() => setShowWeatherDetails(!showWeatherDetails)} className="bg-white p-2 rounded-2xl shadow-sm hover:shadow transition-all duration-200 flex items-center gap-2 border border-gray-200">
                  {weather.loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  ) : weather.current ? (
                    <>
                      <img src={`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`} alt={weather.current.condition} className="w-6 h-6" />
                      <span className="font-semibold text-gray-700">{weather.current.temp}°C</span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600">{getWeatherIcon(weather.current.condition)}</span>
                    </>
                  ) : (<span className="text-gray-400">🌤️</span>)}
                </button>

                {showWeatherDetails && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-lg z-50 border border-gray-200 overflow-hidden">
                    <div className="bg-blue-600 px-4 py-3 text-white flex justify-between items-center">
                      <div><h3 className="font-bold">Daet Weather Center</h3><p className="text-blue-100 text-xs">Real-time conditions & forecasts</p></div>
                      <button onClick={() => setShowWeatherDetails(false)} className="text-white/80 hover:text-white">✕</button>
                    </div>
                    
                    {weather.alert && (
                      <div className={`mx-4 mt-3 p-3 rounded-2xl ${weather.alert.type === 'critical' ? 'bg-red-100 border border-red-300' : 'bg-yellow-100 border border-yellow-300'}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-xl">{weather.alert.type === 'critical' ? '⚠️' : '🌧️'}</span>
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${weather.alert.type === 'critical' ? 'text-red-700' : 'text-yellow-700'}`}>{weather.alert.message}</p>
                            <button onClick={handleIssueWeatherAlert} className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700">
                              Issue Safety Alert →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {weather.current ? (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <img src={`https://openweathermap.org/img/wn/${weather.current.icon}@4x.png`} className="w-14 h-14" />
                            <div>
                              <div className="text-2xl font-bold text-gray-800">{weather.current.temp}°C</div>
                              <div className="text-gray-500 capitalize text-sm">{weather.current.description}</div>
                              <div className="text-xs text-gray-400">Feels like {weather.current.feelsLike}°C</div>
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-400">
                            Updated {weather.lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-gray-50 rounded-2xl p-2 text-center">
                            <div className="text-lg">💧</div>
                            <div className="font-semibold">{weather.current.humidity}%</div>
                            <div className="text-xs text-gray-500">Humidity</div>
                          </div>
                          <div className="bg-gray-50 rounded-2xl p-2 text-center">
                            <div className="text-lg">🌬️</div>
                            <div className="font-semibold">{weather.current.windSpeed} m/s</div>
                            <div className="text-xs text-gray-500">Wind Speed</div>
                          </div>
                          <div className="bg-gray-50 rounded-2xl p-2 text-center">
                            <div className="text-lg">📊</div>
                            <div className="font-semibold">{weather.current.pressure} hPa</div>
                            <div className="text-xs text-gray-500">Pressure</div>
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">📅 3-Day Forecast</p>
                          <div className="grid grid-cols-3 gap-2">
                            {weather.forecast.slice(0, 3).map((day, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-2xl p-2 text-center">
                                <p className="text-xs font-medium text-gray-600">
                                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                </p>
                                <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} className="w-8 h-8 mx-auto" />
                                <p className="text-xs font-semibold">{Math.round(day.temp)}°C</p>
                                <p className="text-xs text-gray-500 capitalize">{day.condition}</p>
                                <p className="text-xs text-gray-400">{Math.round(day.temp_min)}°/{Math.round(day.temp_max)}°</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className={`p-2 rounded-2xl text-center text-xs font-medium ${
                          getWeatherRecommendation(weather.current.condition, weather.current.temp).type === 'success' ? 'bg-green-100 text-green-800' : 
                          getWeatherRecommendation(weather.current.condition, weather.current.temp).type === 'warning' ? 'bg-yellow-100 text-yellow-800' : 
                          getWeatherRecommendation(weather.current.condition, weather.current.temp).type === 'error' ? 'bg-red-100 text-red-800' : 
                          'bg-sky-100 text-sky-800'
                        }`}>
                          {getWeatherRecommendation(weather.current.condition, weather.current.temp).text}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Notification Bell */}
              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative bg-white p-2 rounded-2xl shadow-sm hover:shadow transition-all duration-200">
                  <span className="text-xl">🔔</span>
                  {notifications.length > 0 && (<span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm">{notifications.length > 9 ? '9+' : notifications.length}</span>)}
                </button>
                
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-lg z-50 border border-gray-200 overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm"><span>🔔</span> Notifications</h3>
                      <div className="flex gap-3">
                        {notifications.length > 0 && (<><button onClick={markAllAsRead} className="text-xs text-blue-600">Mark all read</button><button onClick={clearAllNotifications} className="text-xs text-red-600">Clear all</button></>)}
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="text-center py-8 text-gray-400"><span className="text-3xl">🔕</span><p className="mt-1 text-sm">No notifications</p></div>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className={`p-3 border-b cursor-pointer ${!notif.read ? 'bg-blue-50/30' : ''} ${getNotificationColor(notif.type)}`} onClick={() => markAsRead(notif.id)}>
                            <div className="flex items-start gap-2">
                              <div className="text-xl">{getNotificationIcon(notif.type)}</div>
                              <div className="flex-1">
                                <div className="flex justify-between"><h4 className="font-semibold text-gray-800 text-sm">{notif.title}</h4><button onClick={(e) => { e.stopPropagation(); removeNotification(notif.id) }} className="text-gray-400 text-xs">✕</button></div>
                                <p className="text-gray-600 text-xs mt-1">{notif.message}</p>
                                <p className="text-xs text-gray-400 mt-1">{notif.timestamp.toLocaleTimeString()}</p>
                              </div>
                              {!notif.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1"></div>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Total Users</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalUsers}</p>
                <span className="text-xs text-green-600">+12%</span>
              </div>
              <div className="text-3xl opacity-70">👥</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Active Events</p>
                <p className="text-2xl font-bold text-green-600">{calendarStats.totalEvents}</p>
                <span className="text-xs text-green-600">+5%</span>
              </div>
              <div className="text-3xl opacity-70">📅</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Tourist Spots</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.totalSpots}</p>
                <span className="text-xs text-green-600">+2%</span>
              </div>
              <div className="text-3xl opacity-70">🗺️</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">Blog Posts</p>
                <p className="text-2xl font-bold text-purple-600">{stats.totalBlogs}</p>
                <span className="text-xs text-green-600">+8%</span>
              </div>
              <div className="text-3xl opacity-70">📝</div>
            </div>
          </div>
        </div>

        {/* Calendar and Upcoming Events Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>📅</span> Interactive Event Calendar
              </h2>
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
                💡 Click any date to create event
              </div>
            </div>

            <FullCalendar
              key={calendarKey}
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              height={500}
              selectable={true}
              editable={true}
              eventStartEditable={true}
              eventDurationEditable={true}
              eventResizableFromStart={true}
              events={calendarEvents}
              select={(info) => openCreateModal(info.startStr, info.endStr)}
              eventClick={(info) => { openEditModal({ id: info.event.id, title: info.event.title, startStr: info.event.startStr, endStr: info.event.endStr, extendedProps: info.event.extendedProps }); }}
              eventDrop={async (info) => {
                const eventEl = info.el;
                const originalOpacity = eventEl.style.opacity;
                eventEl.style.opacity = '0.5';
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr);
                eventEl.style.opacity = originalOpacity;
                if (!success) { info.revert(); showToast('Failed to reschedule event. Please try again.', true); }
              }}
              eventResize={async (info) => {
                const eventEl = info.el;
                const originalOpacity = eventEl.style.opacity;
                eventEl.style.opacity = '0.5';
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr);
                eventEl.style.opacity = originalOpacity;
                if (!success) { info.revert(); showToast('Failed to resize event. Please try again.', true); }
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,dayGridDay' }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
              nowIndicator={true}
            />
          </div>

          {/* Upcoming Events Widget */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span>⏰</span> Upcoming Events
              <span className="text-xs font-normal text-gray-400">(Next 7 days)</span>
            </h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {getUpcomingEvents().length > 0 ? (
                getUpcomingEvents().map((ev, idx) => {
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
                          {ev.location && (
                            <p className="text-xs text-gray-400 mt-0.5">📍 {ev.location}</p>
                          )}
                          {ev.image_url && (
                            <img src={ev.image_url} alt={ev.title} className="w-full h-24 object-cover rounded-xl mt-2" />
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                            {daysDiff === 0 ? 'Today' : daysDiff === 1 ? 'Tomorrow' : `${daysDiff} days`}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button 
                          onClick={() => openEditModal({ id: ev.id, title: ev.title, startStr: ev.start, endStr: ev.end, extendedProps: ev })} 
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => deleteEventById(ev.id)} 
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

        {/* Recent Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span>👥</span> Recent Registrations
            </h3>
            <Link href="/admin/users" className="text-xs text-blue-600 hover:underline font-medium">View all users →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 rounded-2xl">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.full_name || u.user_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        u.user_type === 'tourist' ? 'bg-blue-100 text-blue-800' : 
                        u.user_type === 'artisan' ? 'bg-yellow-100 text-yellow-800' : 
                        u.user_type === 'operator' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {u.user_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        u.status === 'active' ? 'bg-green-100 text-green-800' : 
                        u.status === 'suspended' ? 'bg-red-100 text-red-800' :
                        u.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {u.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trending Events + Pending Moderation Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Trending Events */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span>🔥</span> Trending Events
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {getTrendingEvents().length > 0 ? (
                getTrendingEvents().map((ev, idx) => {
                  const eventDate = new Date(ev.start);
                  const categoryColors = {
                    'festival': 'bg-purple-100 text-purple-700',
                    'concert': 'bg-red-100 text-red-700',
                    'exhibition': 'bg-yellow-100 text-yellow-700',
                    'workshop': 'bg-blue-100 text-blue-700',
                    'sports': 'bg-cyan-100 text-cyan-700',
                    'cultural': 'bg-pink-100 text-pink-700',
                  };
                  const catColor = categoryColors[ev.category] || 'bg-gray-100 text-gray-700';
                  return (
                    <div key={ev.id} className="p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="bg-orange-100 text-orange-600 font-bold text-sm w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{ev.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            📅 {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          {ev.location && <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {ev.location}</p>}
                          {ev.category && (
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
                              {ev.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-3xl">📊</span>
                  <p className="mt-2 text-sm">No events yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending Moderation */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>⏳</span> Pending Moderation
                {stats.pendingPosts > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">{stats.pendingPosts}</span>
                )}
              </h3>
              {stats.pendingPosts > 0 && (
                <Link href="/admin/moderation" className="text-xs text-blue-600 hover:underline font-medium">Review all →</Link>
              )}
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingPosts.length > 0 ? (
                <>
                  {pendingPosts.slice(0, 5).map((post) => (
                    <div key={post.id} className="flex items-start justify-between p-3 bg-yellow-50 border border-yellow-100 rounded-2xl hover:bg-yellow-100 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{post.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{post.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {post.post_type && <span className="text-xs capitalize bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{post.post_type}</span>}
                          <span className="text-xs text-gray-400">{new Date(post.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Link href="/admin/moderation" className="ml-3 text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 whitespace-nowrap flex-shrink-0">
                        Review
                      </Link>
                    </div>
                  ))}
                  {pendingPosts.length > 5 && (
                    <p className="text-xs text-center text-gray-400 pt-1">+{pendingPosts.length - 5} more posts awaiting review</p>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-3xl">✅</span>
                  <p className="mt-2 text-sm">All caught up! No pending posts.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Message Envelope for Inquiries */}
      <button 
        onClick={() => {
          if (unreadInquiries.length > 0) {
            setSelectedInquiry(unreadInquiries[0]);
            setShowInquiryModal(true);
          } else {
            showToast('No unread inquiries at this time', false);
          }
        }}
        className="fixed bottom-5 right-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 z-30 group"
      >
        <div className="relative">
          <span className="text-2xl">💬</span>
          {unreadInquiries.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {unreadInquiries.length > 9 ? '9+' : unreadInquiries.length}
            </span>
          )}
        </div>
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {unreadInquiries.length > 0 
            ? `${unreadInquiries.length} unread ${unreadInquiries.length === 1 ? 'inquiry' : 'inquiries'}`
            : 'No unread inquiries'}
        </span>
      </button>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{eventForm.id ? '✏️ Edit Event' : '📅 Create New Event'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
                <input autoFocus type="text" value={eventForm.title} onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500" placeholder="e.g., Pinyasan Festival" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select value={eventForm.category} onChange={e => setEventForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500">
                  <option value="">Select category</option>
                  {EVENT_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" value={eventForm.start_date} onChange={e => setEventForm(p => ({ ...p, start_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={eventForm.end_date} onChange={e => setEventForm(p => ({ ...p, end_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Location / Venue</label>
                <input type="text" ref={locationInputRef} value={eventForm.location} onChange={e => handleLocationChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500" placeholder="Type to search venues in Daet..." autoComplete="off" />
                {showLocationSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-40 overflow-y-auto">
                    {locationSuggestions.map((venue, idx) => (
                      <button key={idx} type="button" onClick={() => selectLocation(venue)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
                        <span className="text-gray-400">📍</span> {venue}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input type="time" value={eventForm.start_time} onChange={e => setEventForm(p => ({ ...p, start_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" value={eventForm.end_time} onChange={e => setEventForm(p => ({ ...p, end_time: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
                </div>
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
              </div>
              
              {/* Promo Video Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Promo Video (Optional)</label>
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
              </div>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={eventForm.is_free} onChange={e => setEventForm(p => ({ ...p, is_free: e.target.checked, ticket_price: e.target.checked ? '' : p.ticket_price }))} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700">Free Event</span>
                </label>
                {!eventForm.is_free && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (PHP)</label>
                    <input type="number" value={eventForm.ticket_price} onChange={e => setEventForm(p => ({ ...p, ticket_price: e.target.value }))} className="w-28 px-3 py-2 border border-gray-300 rounded-2xl" placeholder="0.00" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={eventForm.status} onChange={e => setEventForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl">
                  <option value="published">Published</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={eventForm.description} onChange={e => setEventForm(p => ({ ...p, description: e.target.value }))} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-2xl resize-none" placeholder="Brief description..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              {eventForm.id && <button onClick={() => deleteEventById(eventForm.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 text-sm">Delete</button>}
              <button onClick={saveEvent} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm disabled:opacity-50">{saving ? 'Saving...' : (eventForm.id ? 'Update' : 'Create')}</button>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">💡 Tip: Drag events on the calendar to reschedule. Drag edges to resize multi-day events.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Publish Modal */}
      {showQuickPublishModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-100 p-3 rounded-2xl">
                <span className="text-2xl">📢</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Quick Publish</h3>
                <p className="text-xs text-gray-500">Broadcast to all users instantly</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={quickPublish.type} onChange={e => setQuickPublish(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl">
                  <option value="announcement">📢 General Announcement</option>
                  <option value="safety">⚠️ Safety Advisory</option>
                  <option value="traffic">🚗 Traffic Update</option>
                  <option value="disaster">🌊 Disaster Warning</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select value={quickPublish.severity} onChange={e => setQuickPublish(p => ({ ...p, severity: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl">
                  <option value="info">ℹ️ Informational (Blue)</option>
                  <option value="warning">⚠️ Caution (Yellow)</option>
                  <option value="critical">🔴 Critical (Red)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={quickPublish.title} onChange={e => setQuickPublish(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" maxLength="60" placeholder="Short title..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea value={quickPublish.message} onChange={e => setQuickPublish(p => ({ ...p, message: e.target.value }))} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-2xl" maxLength="200" placeholder="Your announcement message..." />
              </div>
              
              {/* Announcement Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Announcement Image (Optional)</label>
                <MediaUpload
                  bucket="announcements"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={quickPublish.imageUrl}
                  onUploadComplete={(url) => setQuickPublish(p => ({ ...p, imageUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="📷 Add Image"
                  maxSizeMB={5}
                />
              </div>
              
              {/* Announcement Video Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Announcement Video (Optional)</label>
                <MediaUpload
                  bucket="announcements"
                  folder="videos"
                  mediaType="video"
                  existingMediaUrl={quickPublish.videoUrl}
                  onUploadComplete={(url) => setQuickPublish(p => ({ ...p, videoUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="🎥 Add Video (max 30 sec)"
                  maxSizeMB={20}
                />
                <p className="text-xs text-gray-400 mt-1">Videos will be embedded in the announcement</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={handleQuickPublish} disabled={saving} className="px-5 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 text-sm disabled:opacity-50">{saving ? 'Publishing...' : '📢 Publish Now'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Weather Alert Modal */}
      {showWeatherAlertModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-yellow-100 p-3 rounded-2xl">
                <span className="text-2xl">🌧️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Issue Weather Alert</h3>
                <p className="text-xs text-gray-500">Pre-filled advisory based on conditions</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alert Message</label>
                <textarea value={weatherAlertMessage} onChange={e => setWeatherAlertMessage(e.target.value)} rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={publishWeatherAlert} disabled={saving} className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 text-sm disabled:opacity-50">{saving ? 'Publishing...' : '⚠️ Issue Alert'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Reply Modal */}
      {showInquiryModal && selectedInquiry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">💬 Respond to Inquiry</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <p className="font-medium text-gray-800">{selectedInquiry.title}</p>
              <p className="text-sm text-gray-600 mt-2">{selectedInquiry.message}</p>
              <p className="text-xs text-gray-400 mt-2">From: {selectedInquiry.user_name || 'Anonymous'} • {new Date(selectedInquiry.created_at).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Response</label>
              <textarea rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-2xl" placeholder="Type your official response here..." id="inquiryReply"></textarea>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600">Cancel</button>
              <button onClick={() => {
                const reply = document.getElementById('inquiryReply').value;
                handleReplyToInquiry(selectedInquiry.id, reply);
              }} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700">Send Reply</button>
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
