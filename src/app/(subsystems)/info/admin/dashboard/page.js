// app/(subsystems)/info/admin/dashboard/page.js
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FilePlus2,
  MapPinned,
  Megaphone,
  MessageSquare,
  Newspaper,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import '@/app/(subsystems)/info/components/admin/AdminCalendar.css';
import './AdminDashboard.css';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { toCalendarSchedule, fromCalendarSchedule } from '@/lib/eventCalendar';
import interactionPlugin from '@fullcalendar/interaction';
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload';
import AdminAvatar from '@/app/(subsystems)/info/components/admin/AdminAvatar';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
import { hasAdminAccess, canAccessAdminDashboard } from '@/lib/adminRoles'
import { getStoredSession, getStoredSessionObject } from '@/lib/authCookies';
import { performLogout } from '@/lib/clientLogout';
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'

// Weather advisories persist for one week before expiring.
const WEATHER_ALERT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Timestamps are generated at publish time in module scope, never during render.
const createWeatherAnnouncementTimestamps = () => {
  const publishedAt = new Date();
  return {
    published_at: publishedAt.toISOString(),
    expires_at: new Date(publishedAt.getTime() + WEATHER_ALERT_TTL_MS).toISOString(),
  };
};

// Venues (fetched from DB) will populate location suggestions
const EVENT_CATEGORIES = ['festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'];

// ---------------------------------------------------------------------------
// Notification persistence (client-side dashboard notification bell)
// ---------------------------------------------------------------------------
// Notifications are kept in localStorage so they survive a page refresh, and
// so that "Clear all" stays cleared even after reloading the page.
const NOTIFICATIONS_STORAGE_KEY = 'admin_dashboard_notifications';
const WELCOME_NOTIFICATION_SHOWN_KEY = 'admin_dashboard_welcome_shown';
const SENT_EVENT_NOTIFICATIONS_KEY = 'sent_event_notifications';
const SENT_WEATHER_ALERTS_KEY = 'sent_weather_alerts';
const ERROR_COOLDOWNS_KEY = 'admin_dashboard_error_cooldowns';
const MAX_NOTIFICATIONS = 20;
const DASHBOARD_LOAD_TIMEOUT_MS = 15000;

const withTimeout = (promise, timeoutMs, label) => Promise.race([
  promise,
  new Promise((resolve) => {
    setTimeout(() => {
      console.warn(`${label} timed out after ${timeoutMs}ms`);
      resolve();
    }, timeoutMs);
  }),
]);


const loadStoredNotifications = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((n) => ({ ...n, timestamp: n.timestamp ? new Date(n.timestamp) : new Date() }))
      .slice(0, MAX_NOTIFICATIONS);
  } catch (e) {
    return [];
  }
};

const loadSentCache = (key) => {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) {
    return {};
  }
};

const saveSentCache = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore storage write errors
  }
};


// Rate-limit recurring error notifications so they do not repopulate the
// notification bell on every page refresh.
const markErrorNotified = (key, cooldownMs = 10 * 60 * 1000) => {
  if (typeof window === 'undefined') return true;
  try {
    const cooldowns = JSON.parse(localStorage.getItem(ERROR_COOLDOWNS_KEY) || '{}');
    const lastNotified = cooldowns[key] ? new Date(cooldowns[key]).getTime() : 0;
    if (Date.now() - lastNotified < cooldownMs) return true;
    cooldowns[key] = new Date().toISOString();
    localStorage.setItem(ERROR_COOLDOWNS_KEY, JSON.stringify(cooldowns));
    return false;
  } catch (e) {
    return false;
  }
};

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
    totalUsers: 0, totalTourists: 0, totalBusinesses: 0, totalModerators: 0, onlineUsers: 0,
    totalEvents: 0, totalSpots: 0, totalBlogs: 0, totalAnnouncements: 0, totalForumThreads: 0,
  });
  const [visitorMetrics, setVisitorMetrics] = useState({
    daily: [],
    loading: true,
    error: '',
    popularDestinations: [],
    popularDestinationsLoading: true,
    popularDestinationsError: '',
  });
  const [blogModerationStats, setBlogModerationStats] = useState(null);
  const [latestBlogSubmission, setLatestBlogSubmission] = useState(null);
  const [systemHealth, setSystemHealth] = useState({ loading: true, checks: null });
  const [notificationsAvailable, setNotificationsAvailable] = useState(null);
  const [dailyFeedbackQuestion, setDailyFeedbackQuestion] = useState(null);
  const [dailyFeedbackVotes, setDailyFeedbackVotes] = useState([]);
  const [dailyFeedbackDraft, setDailyFeedbackDraft] = useState('');
  const [publishingFeedback, setPublishingFeedback] = useState(false);
  
  const [recentUsers, setRecentUsers] = useState([]);
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [unreadInquiries, setUnreadInquiries] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  
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
  const [notifications, setNotifications] = useState(() => loadStoredNotifications());
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    const loadVisitorMetrics = async () => {
      try {
        const response = await fetch('/info/api/analytics/visits', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !Array.isArray(result.metrics?.daily)) {
          throw new Error(result.message || 'Unable to load visitor statistics.');
        }
        if (active) setVisitorMetrics({
          daily: result.metrics.daily,
          loading: false,
          error: '',
          popularDestinations: Array.isArray(result.popularDestinations) ? result.popularDestinations : [],
          popularDestinationsLoading: false,
          popularDestinationsError: Array.isArray(result.popularDestinations)
            ? ''
            : 'Destination view analytics are unavailable.',
        });
      } catch (error) {
        console.error('Admin dashboard visitor statistics load failed:', error);
        if (active) setVisitorMetrics({
          daily: [],
          loading: false,
          error: 'Visitor statistics are unavailable.',
          popularDestinations: [],
          popularDestinationsLoading: false,
          popularDestinationsError: 'Destination view analytics are unavailable.',
        });
      }
    };

    void loadVisitorMetrics();
    return () => { active = false; };
  }, [user]);

  const calendarRef = useRef(null);
  const eventsRef = useRef([]);
  const eventElListenersRef = useRef(new Map());
  const locationInputRef = useRef(null);
  const weatherPopoverRef = useRef(null);
  const notificationsPopoverRef = useRef(null);
  const realtime = useRealtimeRefresh({
    channelName: `admin-dashboard-content-${user?.user_id || user?.id || 'unknown'}`,
    tables: ['info_announcements', 'info_events', 'info_tourist_spots', 'forum_threads', 'forum_replies'],
    enabled: Boolean(user),
  })

  useEffect(() => {
    if (!user?.user_id && !user?.id) return undefined

    let active = true
    const loadBlogModerationStats = async () => {
      try {
        const response = await fetch('/info/api/admin/blogs?status=all&pageSize=1', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load blog moderation statistics.')
        }
        if (active) {
          setBlogModerationStats(result.stats)
          setLatestBlogSubmission(result.posts?.[0] || null)
        }
      } catch (error) {
        console.error('Blog moderation statistics load failed:', error)
      }
    }

    void loadBlogModerationStats()
    return () => { active = false }
  }, [user?.id, user?.user_id])

  useEffect(() => {
    if (!user) return undefined

    let active = true
    const loadSystemHealth = async () => {
      try {
        const response = await fetch('/info/api/admin/system-health', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success || !result.checks) {
          throw new Error(result.message || 'System health checks are unavailable.')
        }
        if (active) setSystemHealth({ loading: false, checks: result.checks })
      } catch (error) {
        console.error('Admin dashboard system health check failed:', error)
        if (active) setSystemHealth({ loading: false, checks: null })
      }
    }

    void loadSystemHealth()
    return () => { active = false }
  }, [user?.id, user?.user_id])

  useEffect(() => {
    if (!showWeatherDetails && !showNotifications) return undefined;

    const handleOutsidePointerDown = (event) => {
      if (showWeatherDetails && !weatherPopoverRef.current?.contains(event.target)) {
        setShowWeatherDetails(false);
      }
      if (showNotifications && !notificationsPopoverRef.current?.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [showWeatherDetails, showNotifications]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const loadDailyFeedback = async () => {
      const response = await fetch('/info/api/daily-feedback', { credentials: 'same-origin' });
      const result = await response.json();
      const question = result.success ? result.question : null;
      if (!active) return;
      setDailyFeedbackQuestion(question || null);
      setDailyFeedbackDraft(question?.question || '');
      if (!question) {
        setDailyFeedbackVotes([]);
        return;
      }
      if (active) setDailyFeedbackVotes(result.votes || []);
    };
    void loadDailyFeedback();
    return () => { active = false };
  }, [user]);

  const saveDailyFeedbackQuestion = async () => {
    if (publishingFeedback) return;
    const questionText = dailyFeedbackDraft.trim();
    if (!questionText) return;
    setPublishingFeedback(true);
    try {
      const response = await fetch('/info/api/daily-feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', question: questionText }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        showToast(`Failed to save feedback question: ${result.message || 'Unable to publish'}`, true);
        return;
      }
      setDailyFeedbackQuestion(result.question);
      showToast('Daily feedback question published.', false);
    } finally {
      setPublishingFeedback(false);
    }
  };

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

  const fetchEventsFromDB = async ({ throwOnError = false } = {}) => {
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
        image_url: event.featured_image || (event.images && event.images[0]) || null,
        video_url: (event.videos && event.videos[0]) || null
      }));
      
      setEvents(formattedEvents);
      return formattedEvents;
    } catch (err) {
      console.error('Error fetching events:', err);
      if (!supabase) {
        if (!markErrorNotified('supabase_unhealthy')) {
          addNotification('Supabase Unhealthy', 'Supabase data service is unavailable. Admin dashboard data could not be loaded.', 'error', null, 0);
        }
      } else if (!markErrorNotified('fetch_events_error')) {
        addNotification('Database Error', `Failed to load events: ${err.message}`, 'error', null, 0);
      }
      if (throwOnError) throw err
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
        created_by: user?.id || null,
        status: eventData.status || 'published',
          featured_image: eventData.imageUrl || null,
          images: eventData.imageUrl ? [eventData.imageUrl] : [],
          videos: eventData.videoUrl ? [eventData.videoUrl] : []
      };

      let data, error;
      if (eventData.id) {
        ({ data, error } = await supabase
          .from('info_events')
          .update(dbEvent)
          .eq('id', eventData.id)
          .select());
      } else {
        ({ data, error } = await supabase
          .from('info_events')
          .insert([dbEvent])
          .select());
      }

      if (error) throw error;

      await fetchEventsFromDB();

      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      try { console.error('Error saving event:', err, JSON.stringify(err)); } catch (e) { console.error('Error saving event (stringify failed):', err); }
      const msg = err?.message || err?.error || (typeof err === 'string' ? err : null) || JSON.stringify(err) || 'Unknown error';
      addNotification('Save Error', `Failed to save event: ${msg}`, 'error', null, 0);
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

  const updateEventDates = async (eventId, newStartDate, newEndDate, allDay) => {
    try {
      const schedule = fromCalendarSchedule(newStartDate, newEndDate, allDay);
      const formattedStart = schedule.start_date;
      if (!formattedStart) throw new Error('Invalid start date');
      
      const { error } = await supabase
        .from('info_events')
        .update({ ...schedule, start_time: schedule.start_time || null, end_time: schedule.end_time || null })
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
    void fetch('/info/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  };
  
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    void fetch('/info/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
  };

  const openNotification = (notification) => {
    markAsRead(notification.id);
    setShowNotifications(false);
    if (notification.link) router.push(notification.link);
  };
  
  const clearAllNotifications = () => {
    setNotifications([]);
    setShowNotifications(false);
    try {
      localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    } catch (e) {
      // ignore storage errors
    }
    void fetch('/info/api/notifications', { method: 'DELETE' });
    showToast('All notifications have been cleared', false);
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

    const sentNotifications = loadSentCache(SENT_EVENT_NOTIFICATIONS_KEY);

    events.forEach(event => {
      if (event.status !== 'published') return;
      const eventDate = new Date(event.start);
      const eventTitle = event.title;
      const notificationKey = `${event.id}_${eventDate.toDateString()}`;

      if (!sentNotifications[notificationKey]) {
        if (eventDate.toDateString() === now.toDateString()) {
          addNotification('Event Today', `"${eventTitle}" is happening today at ${event.location || 'venue TBA'}`, 'event', '/info/admin/events', 0);
          sentNotifications[notificationKey] = true;
        } else if (eventDate.toDateString() === tomorrow.toDateString()) {
          addNotification('Event Tomorrow', `"${eventTitle}" is happening tomorrow at ${event.location || 'venue TBA'}`, 'event', '/info/admin/events', 0);
          sentNotifications[notificationKey] = true;
        } else if (eventDate.toDateString() === threeDaysLater.toDateString()) {
          addNotification('Upcoming Event', `"${eventTitle}" will take place in 3 days at ${event.location || 'venue TBA'}`, 'event', '/info/admin/events', 0);
          sentNotifications[notificationKey] = true;
        } else if (eventDate > now && eventDate <= sevenDaysLater) {
          const daysDiff = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
          addNotification('Upcoming Event', `"${eventTitle}" is in ${daysDiff} days at ${event.location || 'venue TBA'}`, 'event', '/info/admin/events', 0);
          sentNotifications[notificationKey] = true;
        }
      }
    });

    saveSentCache(SENT_EVENT_NOTIFICATIONS_KEY, sentNotifications);
  };

  const persistWeatherAnnouncement = async (alertType, alertMsg) => {
    const sentAlerts = loadSentCache(SENT_WEATHER_ALERTS_KEY);
    const alertCacheKey = `${new Date().toDateString()}_${alertType}_${alertMsg.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;

    if (sentAlerts[alertCacheKey]) return;

    try {
      const { error } = await supabase
        .from('info_announcements')
        .insert([{
          title: 'Weather Advisory',
          content: alertMsg,
          announcement_type: 'weather',
          severity: alertType === 'critical' ? 'critical' : 'warning',
          audience: 'all',
          priority: alertType === 'critical' ? 3 : 2,
          created_by: user?.user_id || user?.id || null,
          status: 'published',
          ...createWeatherAnnouncementTimestamps(),
        }])
        .select()
        .single();

      if (error) throw error;

      sentAlerts[alertCacheKey] = true;
      saveSentCache(SENT_WEATHER_ALERTS_KEY, sentAlerts);
    } catch (err) {
      console.error('Weather announcement persist error:', err);
      addNotification('Weather Announcement Sync Failed', 'Weather advisory could not be stored in the announcement page.', 'error', '/info/admin/announcement', 0);
    }
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
      alertMsg = 'THUNDERSTORM WARNING: Postpone outdoor events. Advise tourists to stay safe indoors.';
    } else if (condition === 'Rain' || condition === 'Drizzle') {
      if (weatherData.current.rainAmount && weatherData.current.rainAmount > 10) {
        alertType = 'warning';
        alertMsg = 'HEAVY RAIN ADVISORY: Expect flooding in low-lying areas. Consider indoor alternatives for scheduled events.';
      } else {
        alertType = 'warning';
        alertMsg = 'RAIN ADVISORY: Rain expected today. Bring umbrellas and prepare indoor alternatives.';
      }
    } else if (temp > 35) {
      alertType = 'warning';
      alertMsg = 'EXTREME HEAT ADVISORY: Temperature above 35°C. Remind tourists to stay hydrated and avoid midday sun exposure.';
    } else if (temp > 32) {
      alertType = 'warning';
      alertMsg = 'HEAT ADVISORY: High temperature today. Stay hydrated and avoid prolonged sun exposure.';
    } else if (windSpeed > 30) {
      alertType = 'critical';
      alertMsg = 'TYPHOON SIGNAL: Strong winds detected. Water activities are UNSAFE. Consider evacuating beach areas.';
    } else if (windSpeed > 20) {
      alertType = 'warning';
      alertMsg = 'STRONG WIND WARNING: Water activities may be unsafe. Exercise caution at Bagasbas Beach.';
    }
    
    if (alertType) {
      setWeather(prev => ({ ...prev, alert: { type: alertType, message: alertMsg } }));

      const sentAlerts = loadSentCache(SENT_WEATHER_ALERTS_KEY);
      const alertCacheKey = `${new Date().toDateString()}_${alertType}_${alertMsg.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
      const alreadyHaveWeatherNotification = notifications.some((n) => n.title === 'Weather Alert' && n.message === alertMsg);

      if (!sentAlerts[alertCacheKey] && !alreadyHaveWeatherNotification) {
        addNotification('Weather Alert', alertMsg, alertType === 'critical' ? 'error' : 'warning', null, 0);
      }

      sentAlerts[alertCacheKey] = true;
      saveSentCache(SENT_WEATHER_ALERTS_KEY, sentAlerts);

      void persistWeatherAnnouncement(alertType, alertMsg);
    } else {
      setWeather(prev => ({ ...prev, alert: null }));
    }
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
      const response = await fetch('/info/api/admin/weather', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success || !result.weather?.current) {
        throw new Error(result.message || 'Live weather data is temporarily unavailable.');
      }

      const weatherData = {
        ...result.weather,
        lastUpdated: new Date(result.weather.lastUpdated),
      };
      setWeather(prev => ({ ...weatherData, loading: false, error: null, alert: prev.alert }));
      checkWeatherNotifications(weatherData);
    } catch (err) {
      console.error('Weather fetch error:', err);
      setWeather(prev => ({ ...prev, current: null, forecast: [], loading: false, error: 'Live weather data is unavailable. No forecast is being shown.', alert: null }));
      if (!markErrorNotified('weather_api_error')) {
        addNotification('Weather API Disconnected', 'Live weather data could not be reached. No weather conditions or forecast are being shown.', 'error', null, 0);
      }
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
      const normalizedMessage = (weatherAlertMessage || '').trim();
      const alertType = weather.alert?.type === 'critical' ? 'critical' : 'warning';
      const { data, error } = await supabase
        .from('info_announcements')
        .insert([{
          title: 'Weather Advisory',
          content: normalizedMessage || weather.alert?.message || 'Weather advisory is active.',
          announcement_type: 'weather',
          severity: alertType,
          audience: 'all',
          priority: alertType === 'critical' ? 3 : 2,
          created_by: user?.user_id || user?.id,
          status: 'published',
          ...createWeatherAnnouncementTimestamps(),
        }])
        .select()
        .single();

      if (error) throw error;

      showToast('Weather alert published!', false);
      addNotification('Weather Alert Published', `"Weather Advisory" has been sent to all users.`, 'warning', null, 0);
      setShowWeatherAlertModal(false);
      setWeather(prev => ({ ...prev, alert: null }));
    } catch (err) {
      try {
        console.error('Publish error:', err, JSON.stringify(err));
      } catch (e) {
        console.error('Publish error (stringify failed):', err);
      }
      const msg = err?.message || err?.error || (typeof err === 'string' ? err : null) || JSON.stringify(err) || 'Unknown error';
      showToast(`Failed to publish alert: ${msg}`, true);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadWeather = async () => {
      if (!active) return;
      await fetchWeather();
    };

    void loadWeather();
    const interval = setInterval(() => {
      void loadWeather();
    }, 30 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (events.length === 0) return undefined;

    let active = true;
    const runChecks = () => {
      if (!active) return;
      checkUpcomingEvents();
    };

    runChecks();
    const eventCheckInterval = setInterval(runChecks, 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(eventCheckInterval);
    };
  }, [events]);

  // Show the welcome notification only once per admin so it does not come
  // back on every page refresh after the user clears their notifications.
  useEffect(() => {
    if (user) {
      const userId = user.id || user.user_id || user.sub || user.email || 'admin';
      try {
        const welcomeKey = `${WELCOME_NOTIFICATION_SHOWN_KEY}_${userId}`;
        if (!localStorage.getItem(welcomeKey)) {
          addNotification('Welcome to Admin Dashboard', `Hello ${user.full_name || user.user_name || 'Admin'}! You have full control over events and tourism activities.`, 'success', null, 0);
          localStorage.setItem(welcomeKey, '1');
        }
      } catch (e) {
        // ignore storage errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Persist the notification list whenever it changes so cleared / unread
  // state is preserved across page refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch (e) {
      // ignore storage errors
    }
  }, [notifications]);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 2500);
  };

  const calendarStats = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(now); thirtyDaysLater.setDate(now.getDate() + 30);
    const upcoming = events.filter(ev => new Date(ev.start) >= now && new Date(ev.start) <= thirtyDaysLater && ev.status === 'published').length;
    const activities = events.filter(ev => (ev.category === 'workshop' || ev.category === 'exhibition') && ev.status === 'published').length;
    return { upcomingEvents: upcoming, totalEvents: events.filter(ev => ev.status === 'published').length, totalActivities: activities };
  }, [events]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const openCreateModal = (startStr, endStr, allDay = true) => {
    const schedule = fromCalendarSchedule(startStr, endStr, allDay);
    setSelectedDate(schedule.start_date);
    setEventForm({ 
      id: '', title: '', description: '', location: '', ...schedule,
      category: '', is_free: true, ticket_price: '', max_attendees: '',
      organizer: 'Daet Tourism Office', status: 'published', imageUrl: '', videoUrl: ''
    });
    setShowEventModal(true);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const openEditModal = (eventObj) => {
    // Details can arrive two ways: a FullCalendar event object (details live
    // under .extendedProps) or a raw canonical event record straight from the
    // DB (details live as flat fields on the object itself). Support both so
    // description/location/times/etc. are never lost depending on which UI
    // path (single-click, double-click, upcoming-events list) opened the modal.
    const props = eventObj.extendedProps || eventObj || {};
    setEventForm({
      id: eventObj.id, title: (eventObj.title || '').replace(/\s*\([^)]*\)\s*$/, ''), description: props.description || '',
      location: props.location || '', start_date: eventObj.startStr || eventObj.start,
      end_date: eventObj.endStr || eventObj.end || eventObj.startStr || eventObj.start, start_time: props.start_time || '',
      end_time: props.end_time || '', category: props.category || '',
      is_free: props.is_free !== undefined ? props.is_free : true,
      ticket_price: props.ticket_price || '', max_attendees: props.max_attendees || '',
      organizer: props.organizer || 'Daet Tourism Office', status: props.status || 'published',
      imageUrl: props.image_url || '', videoUrl: props.video_url || ''
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
      try { console.error('Save failed:', err, JSON.stringify(err)); } catch (e) { console.error('Save failed (stringify failed):', err); }
      const msg = err?.message || err?.error || (typeof err === 'string' ? err : null) || JSON.stringify(err) || 'Unknown error';
      showToast(`Failed to save event: ${msg}`, true);
    }
  };

  const handleQuickPublish = async () => {
    if (!quickPublish.title.trim() || !quickPublish.message.trim()) {
      showToast('Please fill in all fields', true);
      return;
    }
    
    setSaving(true);
    try {
      const announcementTypeByQuickType = {
        announcement: 'info',
        safety: quickPublish.severity === 'critical' ? 'urgent' : 'important',
        traffic: 'important',
        disaster: 'urgent',
      }
      const normalizedAnnouncementType = announcementTypeByQuickType[quickPublish.type] || 'info'

      const { error } = await supabase
        .from('info_announcements')
        .insert([{
          title: quickPublish.title,
          content: quickPublish.message,
          announcement_type: normalizedAnnouncementType,
          severity: quickPublish.severity || 'info',
          audience: 'all',
          priority: quickPublish.severity === 'critical' ? 3 : quickPublish.severity === 'warning' ? 2 : 1,
          image_url: quickPublish.imageUrl || null,
          video_url: quickPublish.videoUrl || null,
          created_by: user?.user_id || user?.id,
          status: 'published',
          published_at: new Date().toISOString()
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
          responded_at: new Date().toISOString(),
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
      const filtered = (venues || []).filter(venue => venue.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
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

  const fetchTouristSpotsCount = async ({ throwOnError = false } = {}) => {
    try {
      const { count, error } = await supabase
        .from('info_tourist_spots')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      
      if (error) throw error;
      setStats(prev => ({ ...prev, totalSpots: count || 0 }));
    } catch (err) {
      console.error('Error fetching spots count:', err);
      if (throwOnError) throw err
    }
  };

  const fetchAnnouncementsCount = async ({ throwOnError = false } = {}) => {
    try {
      const { count, error } = await supabase
        .from('info_announcements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (error) throw error;
      setStats((prev) => ({ ...prev, totalAnnouncements: count || 0 }));
    } catch (err) {
      console.error('Error fetching announcements count:', err);
      if (throwOnError) throw err;
    }
  };

  const fetchForumThreadsCount = async ({ throwOnError = false } = {}) => {
    try {
      const { count, error } = await supabase
        .from('forum_threads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published');

      if (error) throw error;
      setStats((prev) => ({ ...prev, totalForumThreads: count || 0 }));
    } catch (err) {
      console.error('Error fetching forum threads count:', err);
      if (throwOnError) throw err;
    }
  };

  const fetchBlogsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('info_blogs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('approval_status', 'approved');
      
      if (error) throw error;
      setStats(prev => ({ ...prev, totalBlogs: count || 0 }));
    } catch (err) {
      console.error('Error fetching blogs count:', err);
    }
  };

  const fetchVenues = async ({ throwOnError = false } = {}) => {
    try {
      const spotsRes = await supabase
        .from('info_tourist_spots')
        .select('name')
        .eq('status', 'active');

      if (spotsRes.error) throw spotsRes.error
      const spots = (spotsRes?.data || []).map(s => s.name).filter(Boolean);
      setVenues(Array.from(new Set(spots)));
    } catch (err) {
      console.error('Error fetching venues:', err);
      if (throwOnError) throw err
    }
  };

  const fetchDashboardData = async (adminUserId = user?.id) => {
    try {
      const [usersResult, notificationsResult] = await Promise.all([
        supabase
          .from('info_users')
          .select('id, email, full_name, profile_image_url, user_type, status, is_online, created_at')
          .order('created_at', { ascending: false }),
        adminUserId
          ? fetch('/info/api/notifications', { credentials: 'same-origin' }).then(async (response) => {
              const result = await response.json()
              return { data: response.ok && result.success ? result.notifications || [] : [], error: response.ok ? null : new Error(result.message || 'Unable to load notifications') }
            })
          : Promise.resolve({ data: [] })
      ]);

      const { data: users, error } = usersResult;

      setNotificationsAvailable(!notificationsResult.error)
      if (error) throw error;
      const list = users || [];
      setStats(prev => ({
        ...prev,
        totalUsers: list.length,
        totalTourists: list.filter(u => u.user_type === 'tourist').length,
        totalBusinesses: list.filter(u => u.user_type === 'business').length,
        totalModerators: list.filter(u => u.user_type === 'moderator').length,
        onlineUsers: list.filter(u => u.is_online === true).length
      }));
      setRecentUsers(list.filter(u => u.user_type !== 'admin').slice(0, 5));

      if (!notificationsResult.error && Array.isArray(notificationsResult.data)) {
        const serverNotifications = notificationsResult.data.map((notification) => ({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type || 'info',
          link: notification.link || null,
          read: Boolean(notification.is_read),
          timestamp: new Date(notification.created_at || Date.now()),
        }));

        setNotifications((localNotifications) => {
          const merged = new Map(localNotifications.map((notification) => [String(notification.id), notification]));
          serverNotifications.forEach((notification) => {
            merged.set(String(notification.id), notification);
          });
          return [...merged.values()]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, MAX_NOTIFICATIONS);
        });
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  function formatActivityTime(value) {
    if (!value) return 'Just now';
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) return 'Now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function fetchRecentActivity({ throwOnError = false } = {}) {
    try {
      const response = await fetch('/info/api/activity/track?scope=recent', { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load activity')
      const data = result.activities || []

      const normalized = (data || []).map((item) => {
        const actorName = item.info_users?.full_name || item.info_users?.email?.split('@')[0] || 'A user';
        const typeLabel = item.activity_type || 'activity';
        const contentTitle = item.metadata?.contentTitle || item.entity_type || 'content';
        const colorMap = {
          comment: 'bg-sky-100 text-sky-700',
          react_content: 'bg-violet-100 text-violet-700',
          share_content: 'bg-emerald-100 text-emerald-700',
          save_content: 'bg-amber-100 text-amber-700',
        };

        return {
          id: item.id || `${item.user_id || 'user'}-${item.created_at || Date.now()}-${typeLabel}`,
          title: `${actorName} ${typeLabel === 'comment' ? 'commented' : typeLabel === 'react_content' ? 'reacted' : typeLabel === 'share_content' ? 'shared' : typeLabel === 'save_content' ? 'saved' : 'interacted'}`,
          detail: item.description || `${actorName} interacted with ${contentTitle}.`,
          time: formatActivityTime(item.created_at),
          color: colorMap[typeLabel] || 'bg-slate-100 text-slate-700',
        };
      });

      setActivityFeed(normalized.length > 0 ? normalized : [
        { id: 'no-recent-activity', title: 'No recent activity', detail: 'User engagement will appear here as actions happen.', time: 'Now', color: 'bg-slate-100 text-slate-700' },
      ]);
    } catch (err) {
      console.error('Error fetching recent activity:', err);
      setActivityFeed([{ id: 'recent-activity-unavailable', title: 'Recent activity unavailable', detail: 'The activity stream could not be loaded.', time: 'Now', color: 'bg-slate-100 text-slate-700' }]);
      if (throwOnError) throw err
    }
  }

  useEffect(() => {
    realtime.setRefreshCallback(async () => {
      if (!user) return false
      await Promise.all([
        fetchEventsFromDB({ throwOnError: true }),
        fetchTouristSpotsCount({ throwOnError: true }),
        fetchAnnouncementsCount({ throwOnError: true }),
        fetchForumThreadsCount({ throwOnError: true }),
        fetchVenues({ throwOnError: true }),
        fetchRecentActivity({ throwOnError: true }),
      ])
      return true
    })
  })

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        if (active) {
          setLoading(false);
          router.push('/info/login');
        }
        return;
      }

      let userData = null;
      try {
        userData = JSON.parse(session);
      } catch (error) {
        if (active) {
          setLoading(false);
          router.push('/info/login');
        }
        return;
      }

      const sessionUser = getStoredSessionObject() || userData;
      if (!canAccessAdminDashboard({ ...sessionUser, role: sessionUser.role || sessionUser.user_type })) {
        if (active) {
          setLoading(false);
          router.push('/info/access-denied');
        }
        return;
      }

      if (active) setUser(sessionUser);

      const loadDashboardData = async () => {
        if (!active) return;
        if (supabase?.auth) {
          await withTimeout(supabase.auth.getSession(), 5000, 'Supabase admin session restore');
        }
        const loaders = [
          fetchEventsFromDB(),
          fetchUnreadInquiries(),
          fetchTouristSpotsCount(),
          fetchAnnouncementsCount(),
          fetchForumThreadsCount(),
          fetchBlogsCount(),
          fetchVenues(),
          fetchRecentActivity(),
          fetchDashboardData(sessionUser.user_id || sessionUser.id),
        ];
        await withTimeout(Promise.allSettled(loaders), DASHBOARD_LOAD_TIMEOUT_MS, 'Admin dashboard data load');
      };

      try {
        await loadDashboardData();
      } finally {
        if (active) setLoading(false);
      }
    };

    void checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    addNotification('Logged Out', 'You have been logged out successfully.', 'info', null, 0);
    await performLogout();
    router.push('/info/login');
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return 'bg-red-600';
      case 'warning': return 'bg-yellow-500';
      case 'info': return 'bg-blue-600';
      default: return 'bg-blue-600';
    }
  };

  const calendarEvents = events.filter(ev => ev.status === 'published').map(ev => {
    return {
      id: String(ev.id),
      title: ev.title + (ev.category ? ` (${ev.category})` : ''),
      ...toCalendarSchedule(ev),
      extendedProps: {
        location: ev.location || '', description: ev.description || '', category: ev.category || '',
        start_time: ev.start_time, end_time: ev.end_time, is_free: ev.is_free, ticket_price: ev.ticket_price,
        max_attendees: ev.max_attendees, organizer: ev.organizer, status: ev.status,
        image_url: ev.image_url, video_url: ev.video_url
      },
      backgroundColor: getCategoryColor(ev.category), borderColor: '#ffffff', textColor: '#ffffff',
    };
  });

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'success': return 'Success';
      case 'warning': return 'Warning';
      case 'error': return 'Error';
      case 'weather': return 'Weather';
      case 'event': return 'Event';
      case 'user': return 'User';
      default: return 'Info';
    }
  };
  
  const getUpcomingEvents = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(now.getDate() + 30);

    return events
      .filter((ev) => {
        const evDate = new Date(ev.start);
        return ev.status === 'published' && evDate >= now && evDate <= thirtyDaysLater;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 8);
  };

  const todayUtc = new Date().toISOString().slice(0, 10);
  const visitorsToday = visitorMetrics.daily.find((day) => day.date === todayUtc)?.uniqueVisitors;
  const dailyVisitorStats = visitorMetrics.daily.slice(-7);
  const maxDailyVisitors = Math.max(...dailyVisitorStats.map((day) => Number(day.uniqueVisitors) || 0), 1);
  const quickStats = [
    {
      label: 'Total Visitors',
      value: visitorMetrics.loading ? '…' : visitorMetrics.error ? '—' : Number(visitorsToday || 0).toLocaleString(),
      meta: visitorMetrics.error ? 'Live count unavailable' : 'Unique visitors today · UTC',
      status: visitorMetrics.error ? 'Unavailable' : 'Today',
      icon: Activity,
    },
    {
      label: 'Events',
      value: calendarStats.totalEvents.toLocaleString(),
      meta: 'Published in the event calendar',
      status: 'Published',
      icon: CalendarDays,
    },
    {
      label: 'Tourist Attractions',
      value: stats.totalSpots.toLocaleString(),
      meta: 'Active destinations',
      status: 'Active',
      icon: MapPinned,
    },
    {
      label: 'Pending Approvals',
      value: blogModerationStats ? Number(blogModerationStats.pendingApprovals || 0).toLocaleString() : '—',
      meta: 'Blog posts awaiting review',
      status: blogModerationStats?.pendingApprovals ? 'Needs review' : 'Review queue',
      icon: Newspaper,
    },
  ];

  const popularAttractions = visitorMetrics.popularDestinations;
  const maxDestinationViews = Math.max(...popularAttractions.map((item) => Number(item.pageViews) || 0), 1);

  const feedbackTotal = dailyFeedbackVotes.length;
  const feedbackTrend = [
    { label: 'Positive', pct: feedbackTotal ? Math.round((dailyFeedbackVotes.filter((vote) => vote.response === 'positive').length / feedbackTotal) * 100) : 0, color: 'bg-emerald-500' },
    { label: 'Neutral', pct: feedbackTotal ? Math.round((dailyFeedbackVotes.filter((vote) => vote.response === 'neutral').length / feedbackTotal) * 100) : 0, color: 'bg-sky-500' },
    { label: 'Concern', pct: feedbackTotal ? Math.round((dailyFeedbackVotes.filter((vote) => vote.response === 'concern').length / feedbackTotal) * 100) : 0, color: 'bg-amber-500' },
  ];

  const systemStatus = useMemo(() => {
    return [
      {
        name: 'Website',
        status: systemHealth.loading ? 'Checking' : systemHealth.checks?.api?.status === 'Available' ? 'Online' : 'Unavailable',
        detail: systemHealth.checks?.api?.detail || 'The health endpoint did not return a result.',
      },
      {
        name: 'Supabase',
        status: systemHealth.loading ? 'Checking' : systemHealth.checks?.database?.status === 'Available' ? 'Healthy' : 'Unavailable',
        detail: systemHealth.checks?.database?.detail || 'Database connectivity could not be verified.',
      },
      {
        name: 'Weather API',
        status: weather.loading ? 'Checking' : weather.current ? 'Connected' : 'Unavailable',
        detail: weather.current ? 'Live provider data loaded successfully.' : weather.error || 'Weather provider status is not available.',
      },
      {
        name: 'Notifications',
        status: notificationsAvailable === null ? 'Checking' : notificationsAvailable ? 'Active' : 'Unavailable',
        detail: notificationsAvailable
          ? 'The administrator notification inbox responded successfully.'
          : 'Notification inbox availability could not be verified.',
      },
    ];
  }, [systemHealth, weather.loading, weather.current, weather.error, notificationsAvailable]);

  if (loading) {
    return (
      <div className="admin-command-center flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500"></div>
          <p className="mt-4 font-medium text-slate-300">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-command-center">
      <AdminSidebar user={user} roleLabel="System Administrator" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page admin-command-main">
        {/* Header */}
        <div className="admin-command-header">
          <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="dc-eyebrow">Dashboard Home</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Administrator Command Center</h1>
              <p className="dc-muted mt-1 text-xs">Welcome back, Daet Tourism Admin — here’s a live view of your Daet tourism operations.</p>
            </div>

            <div className="admin-command-header-actions flex items-center gap-2">
              <button onClick={() => setShowQuickPublishModal(true)} className="dc-action dc-action-primary">
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                Quick Publish
              </button>

              {/* Weather Widget */}
              <div ref={weatherPopoverRef} className="relative">
                <button onClick={() => setShowWeatherDetails(!showWeatherDetails)} className="dc-action" aria-label="Show current weather">
                  {weather.loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  ) : weather.current ? (
                    <>
                      <img src={`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`} alt={weather.current.condition} className="w-6 h-6" />
                      <span className="font-semibold text-slate-200">{weather.current.temp}°C</span>
                    </>
                  ) : (<span className="text-gray-400">Weather</span>)}
                </button>

                {showWeatherDetails && (
                  <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-lg z-50 overflow-hidden">
                    <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
                      <div><h3 className="font-bold">Daet Weather Center</h3><p className="text-blue-100 text-xs">Live conditions & forecasts</p></div>
                      <button onClick={() => setShowWeatherDetails(false)} className="text-white/80 hover:text-white" aria-label="Close weather details"><Icon name="close" className="w-4 h-4" /></button>
                    </div>
                    
                    {weather.alert && (
                      <div className={`mx-4 mt-3 p-3 rounded-2xl ${weather.alert.type === 'critical' ? 'bg-red-100 border border-red-300' : 'bg-yellow-100 border border-yellow-300'}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-xl">{weather.alert.type === 'critical' ? 'Warning' : 'Rain'}</span>
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${weather.alert.type === 'critical' ? 'text-red-700' : 'text-yellow-700'}`}>{weather.alert.message}</p>
                            <button onClick={handleIssueWeatherAlert} className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-700 flex items-center gap-2">
                              Issue Safety Alert <Icon name="arrow" className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {weather.current ? (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <img src={`https://openweathermap.org/img/wn/${weather.current.icon}@4x.png`} alt={weather.current.description} className="w-14 h-14" />
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
                            <div className="text-lg">Humidity</div>
                            <div className="font-semibold">{weather.current.humidity}%</div>
                            <div className="text-xs text-gray-500">Humidity</div>
                          </div>
                          <div className="bg-gray-50 rounded-2xl p-2 text-center">
                            <div className="text-lg">Wind</div>
                            <div className="font-semibold">{weather.current.windSpeed} m/s</div>
                            <div className="text-xs text-gray-500">Wind Speed</div>
                          </div>
                          <div className="bg-gray-50 rounded-2xl p-2 text-center">
                            <div className="text-lg">Stats</div>
                            <div className="font-semibold">{weather.current.pressure} hPa</div>
                            <div className="text-xs text-gray-500">Pressure</div>
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">3-Day Forecast</p>
                          <div className="grid grid-cols-3 gap-2">
                            {weather.forecast.slice(0, 3).map((day, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-2xl p-2 text-center">
                                <p className="text-xs font-medium text-gray-600">
                                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                </p>
                                <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt={day.condition} className="w-8 h-8 mx-auto" />
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
                    ) : (
                      <div className="p-4" role={weather.error ? 'alert' : 'status'}>
                        <p className="text-sm text-slate-600">
                          {weather.loading ? 'Loading live weather…' : weather.error || 'Live weather data is unavailable.'}
                        </p>
                        {!weather.loading && (
                          <button
                            type="button"
                            onClick={fetchWeather}
                            className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notification Bell */}
              <div ref={notificationsPopoverRef} className="relative">
                <button type="button" onClick={() => setShowNotifications(!showNotifications)} className="dc-action relative h-9 w-9 justify-center p-0" aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}>
                  <Bell className="h-5 w-5 stroke-[2.25]" />
                  {unreadNotificationCount > 0 && (<span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white shadow-sm">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span>)}
                </button>
                
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12"><Icon name="notifications" className="w-4 h-4" /></span>
                        <h3 className="font-black text-sm">Notifications</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadNotificationCount > 0 && <button type="button" onClick={markAllAsRead} className="text-xs font-bold text-sky-200 hover:text-white">Mark all read</button>}
                        {notifications.length > 0 && <button type="button" onClick={clearAllNotifications} className="text-xs font-bold text-rose-200 hover:text-white">Clear all</button>}
                      </div>
                    </div>
                    <div className="max-h-[22rem] overflow-y-auto bg-slate-900">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                          <Icon name="notifications" className="w-6 h-6" />
                          <p className="text-sm font-semibold">No notifications</p>
                        </div>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className={`border-b border-slate-700 px-4 py-3 cursor-pointer transition ${!notif.read ? 'bg-slate-800' : 'bg-slate-900'}`} onClick={() => openNotification(notif)}>
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">{getNotificationIcon(notif.type).slice(0, 2).toUpperCase()}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-black text-sm text-slate-100">{notif.title}</h4>
                                  <button onClick={(e) => { e.stopPropagation(); removeNotification(notif.id) }} className="rounded-full px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-rose-600">Remove</button>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-slate-300">{notif.message}</p>
                                <p className="mt-2 text-[11px] font-semibold text-slate-400">{notif.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                              </div>
                              {!notif.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-600"></span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Link
                href="/info/admin/account"
                className="dc-action h-9 w-9 justify-center p-0"
                aria-label={`Administrator account${user?.full_name || user?.user_name ? `: ${user.full_name || user.user_name}` : ''}`}
                title="Administrator account"
              >
                <AdminAvatar user={user} size={28} />
              </Link>
            </div>
          </div>
        </div>

        <nav className="dc-actions" aria-label="Dashboard quick actions">
          <Link href="/info/admin/blogs?status=pending" className="dc-action"><Newspaper className="h-3.5 w-3.5" />Review approvals</Link>
          <Link href="/info/admin/blog" className="dc-action"><BookOpen className="h-3.5 w-3.5" />Create post</Link>
          <Link href="/info/admin/tourist-spots" className="dc-action"><MapPinned className="h-3.5 w-3.5" />Add tourist spot</Link>
          <button type="button" onClick={() => openCreateModal(new Date().toISOString().slice(0, 10))} className="dc-action"><CalendarDays className="h-3.5 w-3.5" />Create event</button>
          <Link href="/info/admin/announcement" className="dc-action"><Megaphone className="h-3.5 w-3.5" />Send announcement</Link>
        </nav>

        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-3" />
        <section className="dc-section" aria-labelledby="overview-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">Overview</p>
              <h2 id="overview-heading">Tourism performance at a glance</h2>
            </div>
          </div>
          <div className="dc-grid">
          {quickStats.map((stat) => (
            <div key={stat.label} className="dc-panel dc-kpi dc-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="dc-kpi-label">{stat.label}</p>
                  <p className="dc-kpi-value">{stat.value}</p>
                  <p className="dc-kpi-note">{stat.meta}</p>
                </div>
                <div className="dc-kpi-icon">
                  <stat.icon className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <span className={`mt-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] ${stat.status === 'Needs review' ? 'text-amber-300' : stat.status === 'Unavailable' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {['Needs review', 'Unavailable'].includes(stat.status)
                  ? <CircleAlert className="h-3 w-3" />
                  : <CheckCircle2 className="h-3 w-3" />}
                {stat.status}
              </span>
            </div>
          ))}
          </div>
        </section>

        <section className="dc-section" aria-labelledby="needs-attention-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">Needs attention</p>
              <h2 id="needs-attention-heading">Publication approvals</h2>
            </div>
          </div>
          <div className="dc-panel dc-attention">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="dc-panel-title">Blog moderation queue</p>
                <p className="dc-muted mt-1 text-xs">Review user-submitted posts before they appear publicly.</p>
              </div>
              <Link href="/info/admin/blogs?status=pending" className="dc-action dc-action-primary">
                Review pending posts <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="dc-approval-grid">
            {[
              { label: 'Total posts', value: blogModerationStats?.totalPosts, href: '/info/admin/blogs?status=all' },
              { label: 'Pending approvals', value: blogModerationStats?.pendingApprovals, href: '/info/admin/blogs?status=pending', pending: true },
              { label: 'Approved posts', value: blogModerationStats?.approvedPosts, href: '/info/admin/blogs?status=approved' },
              { label: 'Rejected posts', value: blogModerationStats?.rejectedPosts, href: '/info/admin/blogs?status=rejected' },
              { label: 'Reported posts', value: blogModerationStats?.reportedPosts, href: '/info/admin/moderation' },
            ].map((item) => (
              <Link key={item.label} href={item.href} className={`dc-approval-cell ${item.pending ? 'dc-approval-pending' : ''}`}>
                <span>{item.label}</span>
                <span className="dc-approval-value">{item.value ?? '—'}</span>
              </Link>
            ))}
            </div>
          </div>
        </section>

        <section className="dc-section" aria-labelledby="analytics-heading">
        <div className="dc-section-heading">
          <div>
            <p className="dc-section-label">Analytics</p>
            <h2 id="analytics-heading">Tourism performance and audience activity</h2>
          </div>
          <Link href="/info/admin/analytics/reports" className="dc-action">Export reports <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="dc-grid">
          <div className="dc-panel dc-panel-pad dc-chart dc-span-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="dc-section-label">Popular content</p>
                <h3 className="dc-panel-title mt-1">Most viewed attractions</h3>
              </div>
              <Link href="/info/admin/analytics/content" className="dc-muted inline-flex items-center gap-1 text-xs hover:text-blue-300">View report <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
            <p className="dc-muted mb-3 text-[11px]">Consented detail-page views in the last 30 days</p>
            {visitorMetrics.popularDestinationsError ? (
              <p className="dc-muted flex h-48 items-center justify-center text-sm text-rose-300" role="status">
                {visitorMetrics.popularDestinationsError}
              </p>
            ) : visitorMetrics.popularDestinationsLoading ? (
              <p className="dc-muted flex h-48 items-center justify-center text-sm" role="status">
                Loading destination views…
              </p>
            ) : popularAttractions.length ? (
              <div className="dc-chart-bars flex items-end gap-3 border-b border-slate-700 pb-8">
                {popularAttractions.map((item) => {
                  const value = Number(item.pageViews) || 0;
                  return (
                    <div key={item.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${item.name}: ${value.toLocaleString()} detail-page views from ${Number(item.uniqueVisitors || 0).toLocaleString()} estimated visitors`}>
                      <span className="text-[10px] font-semibold text-slate-300">{value.toLocaleString()}</span>
                      <div className={`w-full max-w-16 rounded-t-md ${value ? 'bg-blue-600' : 'bg-slate-700'}`} style={{ height: `${value ? Math.max(4, Math.round((value / maxDestinationViews) * 130)) : 2}px` }} />
                      <span className="line-clamp-2 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">{item.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dc-muted flex h-48 items-center justify-center text-center text-sm" role="status">
                No consented destination views recorded in the last 30 days.
              </p>
            )}
          </div>

          <div className="dc-panel dc-panel-pad dc-chart dc-span-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="dc-section-label">Visitor statistics</p>
                <h3 className="dc-panel-title mt-1">Daily unique visitors</h3>
              </div>
              <Link href="/info/admin/analytics/visitors" className="dc-muted inline-flex items-center gap-1 text-xs hover:text-blue-300">View details <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
            <p className="dc-muted mb-3 text-[11px]">Estimated distinct visitors per day · UTC</p>
            {visitorMetrics.error ? (
              <p className="dc-muted flex h-56 items-center justify-center text-sm text-rose-300" role="status">{visitorMetrics.error}</p>
            ) : visitorMetrics.loading ? (
              <p className="dc-muted flex h-56 items-center justify-center text-sm" role="status">Loading visitor statistics…</p>
            ) : dailyVisitorStats.length ? (
              <div className="dc-chart-bars flex items-end gap-3 border-b border-slate-700 pb-8">
                {dailyVisitorStats.map((day) => {
                  const value = Number(day.uniqueVisitors) || 0;
                  const date = new Date(`${day.date}T00:00:00Z`);
                  const label = Number.isNaN(date.getTime()) ? day.date : date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                  return (
                    <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${day.date}: ${value} unique visitors`}>
                      <span className="text-[10px] font-semibold text-slate-300">{value.toLocaleString()}</span>
                      <div className={`w-full max-w-10 rounded-t-md ${value ? 'bg-amber-500' : 'bg-slate-700'}`} style={{ height: `${value ? Math.max(4, Math.round((value / maxDailyVisitors) * 130)) : 2}px` }} />
                      <span className="text-[10px] font-medium text-slate-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dc-muted flex h-56 items-center justify-center text-sm" role="status">No visitor data recorded yet.</p>
            )}
          </div>
        </div>
        </section>

        <section className="dc-section" aria-labelledby="operations-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">Operations</p>
              <h2 id="operations-heading">Content and event management</h2>
            </div>
          </div>
          <div className="dc-panel dc-panel-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dc-section-label">Content overview</p>
                <h3 className="dc-panel-title mt-1">Publishing workspace</h3>
              </div>
              <Link href="/info/admin/content" className="dc-action">Open content overview <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="dc-content-summary">
              {[
                { label: 'Blog posts', value: stats.totalBlogs, href: '/info/admin/blogs' },
                { label: 'Tourist spots', value: stats.totalSpots, href: '/info/admin/tourist-spots' },
                { label: 'Published events', value: calendarStats.totalEvents, href: '/info/admin/events' },
                { label: 'Announcements', value: stats.totalAnnouncements, href: '/info/admin/announcement' },
                { label: 'Pending review', value: blogModerationStats?.pendingApprovals ?? '—', href: '/info/admin/blogs?status=pending' },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="dc-content-metric transition hover:border-blue-500">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Content actions">
              <Link href="/info/admin/blog" className="dc-action"><BookOpen className="h-3.5 w-3.5" />Create post</Link>
              <Link href="/info/admin/tourist-spots" className="dc-action"><MapPinned className="h-3.5 w-3.5" />Add tourist spot</Link>
              <button type="button" onClick={() => openCreateModal(new Date().toISOString().slice(0, 10))} className="dc-action"><CalendarDays className="h-3.5 w-3.5" />Create event</button>
              <Link href="/info/admin/announcement" className="dc-action"><Megaphone className="h-3.5 w-3.5" />Create announcement</Link>
            </nav>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-3">
              <div className="min-w-0">
                <p className="dc-section-label">Latest blog submission</p>
                {latestBlogSubmission ? (
                  <p className="mt-1 truncate text-xs font-semibold text-slate-200">
                    {latestBlogSubmission.title}
                    <span className="dc-muted ml-2 font-normal">
                      {formatActivityTime(latestBlogSubmission.submitted_at || latestBlogSubmission.created_at)}
                    </span>
                  </p>
                ) : (
                  <p className="dc-muted mt-1 text-xs">No recent blog submissions.</p>
                )}
              </div>
              {latestBlogSubmission ? (
                <Link
                  href={`/info/admin/blogs?status=${latestBlogSubmission.approval_status || 'all'}`}
                  className={`dc-status-badge ${
                    latestBlogSubmission.approval_status === 'approved'
                      ? 'dc-status-online'
                      : latestBlogSubmission.approval_status === 'rejected'
                        ? 'dc-status-offline'
                        : 'dc-status-warning'
                  }`}
                >
                  {latestBlogSubmission.approval_status || 'Unknown'}
                </Link>
              ) : null}
            </div>
          </div>

        {/* Event calendar and upcoming published events */}
        <div className="dc-grid mt-4">
          {/* Calendar Section */}
          <div className="admin-events-calendar dc-panel dc-panel-pad dc-calendar dc-calendar-panel dc-span-9">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div>
                <p className="dc-section-label">Event management</p>
                <h2 className="dc-panel-title mt-1 flex items-center gap-2">
                  Event Calendar
                </h2>
              </div>
              <div className="dc-muted rounded-lg border border-slate-700 px-3 py-1.5 text-[10px]">
                Click any date to create event • Drag to reschedule
              </div>
            </div>

            <div className="admin-events-calendar-scroll" role="region" aria-label="Dashboard event calendar" tabIndex={0}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              selectable={true}
              editable={true}
              eventStartEditable={true}
              eventDurationEditable={true}
              eventResizableFromStart={true}
              events={calendarEvents}
              fixedWeekCount={true}
              dayMaxEvents={3}
              eventDisplay="block"
              views={{ dayGridMonth: { displayEventTime: false }, timeGridWeek: { displayEventTime: true } }}
              slotDuration="00:30:00"
              slotLabelInterval="01:00:00"
              scrollTime="07:00:00"
              slotEventOverlap={false}
              eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
              height={620}
              select={(info) => openCreateModal(info.startStr, info.endStr, info.allDay)}
              eventClick={(info) => {
                // Look up the canonical event record (real inclusive start/end
                // straight from the DB) rather than FullCalendar's internal
                // event object, whose endStr is exclusive (one day past the
                // true end date) and would otherwise leak into the form.
                const rawEvent = eventsRef.current.find(e => String(e.id) === String(info.event.id));
                if (rawEvent) {
                  openEditModal(rawEvent);
                } else {
                  openEditModal({ id: info.event.id, title: info.event.title, startStr: info.event.startStr, endStr: info.event.endStr, extendedProps: info.event.extendedProps });
                }
              }}
              eventDidMount={(info) => {
                info.el.title = info.event.title;
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
              eventDrop={async (info) => {
                const eventEl = info.el;
                const originalOpacity = eventEl.style.opacity;
                eventEl.style.opacity = '0.5';
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr, info.event.allDay);
                eventEl.style.opacity = originalOpacity;
                if (!success) { info.revert(); showToast('Failed to reschedule event. Please try again.', true); }
              }}
              eventResize={async (info) => {
                const eventEl = info.el;
                const originalOpacity = eventEl.style.opacity;
                eventEl.style.opacity = '0.5';
                const success = await updateEventDates(info.event.id, info.event.startStr, info.event.endStr, info.event.allDay);
                eventEl.style.opacity = originalOpacity;
                if (!success) { info.revert(); showToast('Failed to resize event. Please try again.', true); }
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week' }}
              nowIndicator={true}
              weekends={true}
            />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted-ink)]" aria-label="Event categories">
              {[...EVENT_CATEGORIES, 'other'].map(category => (
                <span key={category} className="inline-flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getCategoryColor(category) }} aria-hidden="true" />
                  {category}
                </span>
              ))}
            </div>
          </div>

          {/* Upcoming Events Widget */}
          <div className="dc-panel dc-panel-pad dc-upcoming-panel dc-span-3">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="dc-section-label">Scheduled</p>
                <h3 className="dc-panel-title mt-1 flex items-center gap-2">
                  <Icon name="events" className="inline-block w-4 h-4" />Upcoming Events
                </h3>
              </div>
              <Link href="/info/admin/events" className="dc-muted text-xs hover:text-blue-300">View all</Link>
            </div>
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
                    <div key={ev.id} className="dc-upcoming-item">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-100">{ev.title}</p>
                          <p className="dc-muted mt-1 text-xs">
                            {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          {ev.location && (
                            <p className="dc-muted mt-0.5 text-xs">Location: {ev.location}</p>
                          )}
                          {ev.image_url && (
                            <img src={ev.image_url} alt={`${ev.title} event`} className="mt-2 h-24 w-full rounded-lg object-cover" />
                          )}
                          {ev.category && <span className="mt-2 inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold capitalize text-slate-300">{ev.category}</span>}
                          <span className="mt-2 inline-flex rounded-full bg-emerald-950 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">{ev.status}</span>
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
                <div className="dc-muted py-8 text-center">
                  <p className="mt-2 text-sm">No upcoming events</p>
                  <p className="text-xs">Click on any date in the calendar to create one</p>
                </div>
              )}
            </div>
          </div>
        </div>
        </section>

        <section className="dc-section" aria-labelledby="community-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">Community</p>
              <h2 id="community-heading">Forum activity and user engagement</h2>
            </div>
            <Link href="/info/admin/community" className="dc-action">View community <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="dc-grid">
            {[
              { label: 'Forum topics', value: stats.totalForumThreads, detail: 'Published discussions', href: '/info/admin/forum' },
              { label: 'Users online', value: `${stats.onlineUsers} / ${stats.totalUsers}`, detail: 'Current user presence', href: '/info/admin/engagement' },
              { label: 'Feedback', value: feedbackTotal, detail: 'Daily question responses', href: '/info/admin/feedback' },
              { label: 'Reported content', value: blogModerationStats?.reportedPosts ?? '—', detail: 'Reported blog posts', href: '/info/admin/moderation' },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="dc-panel dc-community-metric dc-span-3 transition hover:border-blue-500">
                <div>
                  <p className="dc-muted text-[11px] font-semibold">{item.label}</p>
                  <p className="dc-muted mt-1 text-[10px]">{item.detail}</p>
                </div>
                <span className="dc-community-value">{item.value}</span>
              </Link>
            ))}
            <div className="dc-panel dc-panel-pad dc-span-12">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="dc-section-label">Visitor sentiment</p>
                      <h3 className="dc-panel-title mt-1">Daily feedback</h3>
                      <p className="dc-muted mt-1 text-[11px]">{dailyFeedbackQuestion?.question || 'No daily question published'} · {feedbackTotal} responses</p>
                    </div>
                    <Link href="/info/admin/feedback" className="dc-muted inline-flex items-center gap-1 text-xs hover:text-blue-300">Feedback <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {feedbackTrend.map((item) => (
                      <div key={item.label} className="dc-sentiment-card rounded-lg border border-slate-700 bg-slate-800/60 p-2.5">
                        <div className="dc-sentiment-label mb-1 flex justify-between text-[10px] text-slate-300"><span>{item.label}</span><span>{item.pct}%</span></div>
                        <div className="dc-sentiment-track h-1.5 rounded-full bg-slate-700"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="dc-section-label" htmlFor="daily-feedback-question">Publish daily question</label>
                  <div className="mt-2 flex gap-2">
                    <input id="daily-feedback-question" value={dailyFeedbackDraft} onChange={(event) => setDailyFeedbackDraft(event.target.value)} placeholder="Ask visitors a question..." className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500" />
                    <button type="button" onClick={saveDailyFeedbackQuestion} disabled={publishingFeedback} className="dc-action dc-action-primary disabled:cursor-not-allowed disabled:opacity-60">{publishingFeedback ? 'Publishing...' : 'Publish'}</button>
                  </div>
                  <nav className="mt-3 flex flex-wrap gap-2" aria-label="Community destinations">
                    <Link href="/info/admin/forum" className="dc-action">Forum</Link>
                    <Link href="/info/admin/engagement" className="dc-action">Engagement</Link>
                    <Link href="/info/admin/users" className="dc-action"><Users className="h-3.5 w-3.5" />User management</Link>
                    <Link href="/info/admin/feedback" className="dc-action"><MessageSquare className="h-3.5 w-3.5" />Open inquiries ({unreadInquiries.length})</Link>
                    <Link href="/info/admin/activity-logs" className="dc-action">Activity logs</Link>
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dc-section" aria-labelledby="system-status-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">System status</p>
              <h2 id="system-status-heading">Operational health</h2>
            </div>
            <p>Current checks · administrator platform</p>
          </div>
          <div className="dc-grid">
            {systemStatus.map((item) => (
              <div key={item.name} className="dc-status-item dc-span-3" title={item.detail}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100">{item.name}</p>
                  <p className="dc-muted mt-1 truncate text-[10px]">{item.detail}</p>
                </div>
                <span className={`dc-status-badge ${['Online', 'Healthy', 'Connected', 'Active'].includes(item.status) ? 'dc-status-online' : item.status === 'Checking' ? 'dc-status-warning' : 'dc-status-offline'}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dc-section" aria-labelledby="recent-activity-heading">
          <div className="dc-section-heading">
            <div>
              <p className="dc-section-label">Recent activity</p>
              <h2 id="recent-activity-heading">Recent community activity and registrations</h2>
            </div>
            <Link href="/info/admin/activity-logs" className="dc-action">View all activity <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="dc-activity-layout">
            <div className="dc-panel dc-panel-pad">
              <div className="mb-1 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <h3 className="dc-panel-title">Community activity</h3>
              </div>
              {activityFeed.slice(0, 6).map((activity) => (
                <div key={activity.id} className="dc-activity-row">
                  <span className="dc-activity-dot" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-100">{activity.title}</p>
                    <p className="dc-muted mt-1 text-[11px]">{activity.detail}</p>
                  </div>
                  <span className="dc-muted shrink-0 text-[10px]">{activity.time}</span>
                </div>
              ))}
            </div>

            <div className="dc-panel dc-panel-pad min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  <h3 className="dc-panel-title">Recent registrations</h3>
                </div>
                <Link href="/info/admin/users" className="dc-muted inline-flex items-center gap-1 text-xs hover:text-blue-300">View all users <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div className="dc-registration-desktop overflow-x-auto">
                <table className="dc-registration-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentUsers.length ? recentUsers.map((u) => (
                      <tr key={u.id}>
                        <td>{u.full_name || u.user_name || 'Unnamed user'}</td>
                        <td>{u.email}</td>
                        <td className="capitalize">{u.user_type}</td>
                        <td className="capitalize">{u.status || 'active'}</td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="dc-muted py-6 text-center">No registrations available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="dc-registration-mobile">
                {recentUsers.map((u) => (
                  <div key={u.id} className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <div className="flex items-center gap-2">
                      <AdminAvatar user={u} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-100">{u.full_name || u.user_name || 'Unnamed user'}</p>
                        <p className="truncate text-[10px] text-slate-400">{u.email}</p>
                      </div>
                      <span className="rounded-full bg-blue-950 px-2 py-1 text-[9px] font-bold capitalize text-blue-300">{u.user_type}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                      <span className="capitalize">{u.status || 'active'}</span>
                      <span>{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* Floating Message Envelope for Inquiries - opens a separate page */}
      <button 
        onClick={() => router.push('/info/admin/feedback')}
        className="fixed bottom-5 right-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 z-30 group"
      >
        <div className="relative">
          <MessageSquare className="h-7 w-7" />
          {unreadInquiries.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {unreadInquiries.length > 9 ? '9+' : unreadInquiries.length}
            </span>
          )}
        </div>
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {unreadInquiries.length > 0 
            ? `${unreadInquiries.length} unread ${unreadInquiries.length === 1 ? 'inquiry' : 'inquiries'}`
            : 'View inquiries'}
        </span>
      </button>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{eventForm.id ? 'Edit Event' : 'Create New Event'}</h3>
            <div className="space-y-2">
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
                        <span className="text-gray-400"><Icon name="attractions" className="inline-block w-4 h-4 mr-1" /></span> {venue}
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
                  buttonText="Upload Featured Image"
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
                  buttonText="Upload Promo Video"
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
              <p className="text-xs text-gray-400 text-center">Tip: Drag events on the calendar to reschedule. Drag edges to resize multi-day events.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Publish Modal */}
      {showQuickPublishModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">!</div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Quick Publish</h3>
                  <p className="text-xs text-gray-500">Broadcast to all users instantly</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close quick publish dialog">X</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={quickPublish.type} onChange={e => setQuickPublish(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl">
                  <option value="announcement">General Announcement</option>
                  <option value="safety">Safety Advisory</option>
                  <option value="traffic">Traffic Update</option>
                  <option value="disaster">Disaster Warning</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select value={quickPublish.severity} onChange={e => setQuickPublish(p => ({ ...p, severity: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl">
                  <option value="info">Informational (Blue)</option>
                  <option value="warning">Caution (Yellow)</option>
                  <option value="critical">Critical (Red)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" value={quickPublish.title} onChange={e => setQuickPublish(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-2xl" maxLength="60" placeholder="Short title..." />
              </div>
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea value={quickPublish.message} onChange={e => setQuickPublish(p => ({ ...p, message: e.target.value }))} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-2xl" maxLength="200" placeholder="Your announcement message..." />
              </div>
              
              {/* Announcement Image Upload */}
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Announcement Image (Optional)</label>
                <MediaUpload
                  bucket="announcements"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={quickPublish.imageUrl}
                  onUploadComplete={(url) => setQuickPublish(p => ({ ...p, imageUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Add Image"
                  maxSizeMB={5}
                />
              </div>
              
              {/* Announcement Video Upload */}
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Announcement Video (Optional)</label>
                <MediaUpload
                  bucket="announcements"
                  folder="videos"
                  mediaType="video"
                  existingMediaUrl={quickPublish.videoUrl}
                  onUploadComplete={(url) => setQuickPublish(p => ({ ...p, videoUrl: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Add Video (max 30 sec)"
                  maxSizeMB={20}
                />
                <p className="text-xs text-gray-400 mt-1">Videos will be embedded in the announcement</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={handleQuickPublish} disabled={saving} className="px-5 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 text-sm disabled:opacity-50">{saving ? 'Publishing...' : 'Publish Now'}</button>
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
                <span className="text-2xl">Alert</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Issue Weather Alert</h3>
                <p className="text-xs text-gray-500">Pre-filled advisory based on conditions</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alert Message</label>
                <textarea value={weatherAlertMessage} onChange={e => setWeatherAlertMessage(e.target.value)} rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-2xl" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={publishWeatherAlert} disabled={saving} className="px-5 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 text-sm disabled:opacity-50">{saving ? 'Publishing...' : 'Issue Alert'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Reply Modal */}
      {showInquiryModal && selectedInquiry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">Respond to Inquiry</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">Close</button>
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
            <span className="shrink-0 inline-flex items-center">{toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}</span>
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
        .admin-upcoming-panel img {
          width: 100%;
          height: 96px;
          object-fit: cover;
        }
        .admin-upcoming-panel .flex-1 { min-width: 0; overflow-wrap: anywhere; }
        .admin-upcoming-panel .text-right { flex-shrink: 0; margin-left: 8px; }
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