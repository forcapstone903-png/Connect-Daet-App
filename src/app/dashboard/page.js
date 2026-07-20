'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  Award,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Compass,
  Heart,
  LogOut,
  MapPin,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'

export default function TouristDashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [spots, setSpots] = useState([])
  const [events, setEvents] = useState([])
  const [posts, setPosts] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [bookmarkedSpotIds, setBookmarkedSpotIds] = useState([])
  const [likedPostIds, setLikedPostIds] = useState([])
  const [showComposer, setShowComposer] = useState(false)
  const [postDraft, setPostDraft] = useState('')
  const [submittingPost, setSubmittingPost] = useState(false)
  const [loading, setLoading] = useState(true)
  const [language, setLanguage] = useState('en')
  const [rewardSettings, setRewardSettings] = useState({
    post_points: 10,
    checkin_points: 5,
    share_points: 3,
    referral_points: 50,
  })
  const [rewardNotice, setRewardNotice] = useState('')
  const [sharedPostIds, setSharedPostIds] = useState([])
  const [activeSection, setActiveSection] = useState('explore')
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    bio: '',
    address: '',
    city: '',
    province: '',
    country: '',
    profile_image_url: '',
  })

  useEffect(() => {
    const loadDashboard = async () => {
      const sessionData = sessionStorage.getItem('user_session')
      if (!sessionData) {
        router.push('/login')
        return
      }

      const parsedSession = JSON.parse(sessionData)
      setUser(parsedSession)

      const savedRewards = localStorage.getItem('reward_settings')
      if (savedRewards) {
        setRewardSettings(JSON.parse(savedRewards))
      }

      const { data: userProfile } = await supabase
        .from('info_users')
        .select('*')
        .eq('id', parsedSession.user_id)
        .single()

      if (userProfile) {
        setProfile(userProfile)
        setProfileForm({
          full_name: userProfile.full_name || '',
          bio: userProfile.bio || '',
          address: userProfile.address || '',
          city: userProfile.city || '',
          province: userProfile.province || '',
          country: userProfile.country || '',
          profile_image_url: userProfile.profile_image_url || '',
        })
      }

      await awardDailyLogin(parsedSession.user_id, userProfile)

      await Promise.all([
        fetchSpots(),
        fetchEvents(),
        fetchPosts(parsedSession.user_id),
        fetchAnnouncements(),
        fetchBookmarks(parsedSession.user_id),
      ])

      setLoading(false)
    }

    loadDashboard()
  }, [router])

  const fetchSpots = async () => {
    const { data } = await supabase
      .from('info_tourist_spots')
      .select('*')
      .eq('status', 'published')
      .order('rating', { ascending: false })
      .limit(6)

    setSpots(data || [])
  }

  const fetchEvents = async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('info_events')
      .select('*')
      .eq('status', 'published')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .limit(4)

    setEvents(data || [])
  }

  const translateText = (text = '') => {
    if (language !== 'fil' || !text) return text

    const replacements = {
      explore: 'tuklasin',
      travel: 'paglalakbay',
      experience: 'karanasan',
      favorite: 'paborito',
      beach: 'beach',
      local: 'lokal',
      visit: 'bisitahin',
      share: 'ibahagi',
      beautiful: 'maganda',
      place: 'lugar',
      today: 'ngayon',
      adventure: 'pakikipagsapalaran',
      story: 'kwento',
      amazing: 'kahanga-hanga',
      great: 'magaling',
      community: 'komunidad',
      event: 'kaganapan',
      discover: 'tumuklas',
      enjoy: 'masiyahan',
    }

    return text
      .split(/(\s+)/)
      .map((chunk) => {
        if (/\s+/.test(chunk)) return chunk
        const key = chunk.toLowerCase().replace(/[^a-z]/g, '')
        return replacements[key] || chunk
      })
      .join('')
  }

  const awardPoints = async (userId, points, reason) => {
    if (!userId || !points) return

    try {
      const nextPoints = (profile?.points || 0) + points
      const { error } = await supabase.from('info_users').update({
        points: nextPoints,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      if (!error) {
        await supabase.from('reward_history').insert({
          user_id: userId,
          subsystem_source: reason,
          points_earned: points,
          description: reason,
        })

        setProfile((prev) => prev ? { ...prev, points: nextPoints } : prev)
        setRewardNotice(`You earned ${points} points for ${reason.replace(/_/g, ' ')}.`)
      }
    } catch (err) {
      console.error('Reward update failed:', err)
    }
  }

  const awardDailyLogin = async (userId, currentProfile = null) => {
    if (!userId) return

    const todayKey = `daily_reward_${new Date().toISOString().slice(0, 10)}`
    if (sessionStorage.getItem(todayKey)) return

    const points = rewardSettings.checkin_points || 5
    if (!points) return

    try {
      const nextPoints = (currentProfile?.points || profile?.points || 0) + points
      const { error } = await supabase.from('info_users').update({
        points: nextPoints,
        updated_at: new Date().toISOString(),
      }).eq('id', userId)

      if (!error) {
        await supabase.from('reward_history').insert({
          user_id: userId,
          subsystem_source: 'daily_login',
          points_earned: points,
          description: 'Daily sign-in reward',
        })

        setProfile((prev) => prev ? { ...prev, points: nextPoints } : prev)
        sessionStorage.setItem(todayKey, '1')
        setRewardNotice(`Welcome back! You earned ${points} points for signing in.`)
      }
    } catch (err) {
      console.error('Daily reward failed:', err)
    }
  }

  const fetchPosts = async (userId) => {
    const { data } = await supabase
      .from('info_user_posts')
      .select('*, spot:spot_id(name)')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(6)

    setPosts(data || [])
  }

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('info_announcements')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(4)

    setAnnouncements(data || [])
  }

  const fetchBookmarks = async (userId) => {
    const { data } = await supabase
      .from('info_bookings')
      .select('spot_id')
      .eq('user_id', userId)
      .eq('booking_type', 'spot')

    setBookmarkedSpotIds((data || []).map((item) => item.spot_id))
  }

  const handleBookmark = async (spotId) => {
    if (!user?.user_id || bookmarkedSpotIds.includes(spotId)) return

    const { error } = await supabase
      .from('info_bookings')
      .insert({
        user_id: user.user_id,
        spot_id: spotId,
        booking_type: 'spot',
        booking_date: new Date().toISOString().split('T')[0],
      })

    if (!error) {
      setBookmarkedSpotIds((prev) => [...prev, spotId])
    }
  }

  const handleCreatePost = async () => {
    if (!postDraft.trim() || !user?.user_id) return

    setSubmittingPost(true)

    const { error } = await supabase.from('info_user_posts').insert({
      user_id: user.user_id,
      title: postDraft.slice(0, 80),
      content: postDraft.trim(),
      post_type: 'photo_share',
      images: [],
      status: 'approved',
      likes: 0,
    })

    if (!error) {
      setPostDraft('')
      setShowComposer(false)
      await awardPoints(user.user_id, rewardSettings.post_points || 10, 'post_created')
      await fetchPosts(user.user_id)
    }

    setSubmittingPost(false)
  }

  const handleLikePost = async (postId, currentLikes) => {
    if (!postId || likedPostIds.includes(postId)) return

    const { error } = await supabase
      .from('info_user_posts')
      .update({ likes: currentLikes + 1 })
      .eq('id', postId)

    if (!error) {
      setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post)))
      setLikedPostIds((prev) => [...prev, postId])
    }
  }

  const handleSharePost = async (postId) => {
    if (!user?.user_id || sharedPostIds.includes(postId)) return

    await awardPoints(user.user_id, rewardSettings.share_points || 3, 'post_shared')
    setSharedPostIds((prev) => [...prev, postId])
  }

  const handleLogout = async () => {
    sessionStorage.removeItem('user_session')
    router.push('/login')
  }

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId)
    const targetId = sectionId === 'explore' ? 'explore-section' : sectionId
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const renderSectionContent = () => {
    if (activeSection === 'feed') {
      return (
        <div id="feed" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{language === 'en' ? 'Your travel feed' : 'Ang iyong travel feed'}</h3>
              <p className="text-sm text-slate-500">{language === 'en' ? 'Recent community posts and your own stories' : 'Mga kamakailang post ng komunidad at ang iyong sariling kwento'}</p>
            </div>
            <button onClick={() => setShowComposer(true)} className="text-sm font-medium text-teal-600">{language === 'en' ? 'Create post' : 'Gumawa ng post'}</button>
          </div>

          <div className="space-y-3">
            {posts.length > 0 ? posts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-teal-500 to-blue-600 text-sm font-semibold text-white">
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{profileName}</p>
                      <p className="text-sm text-slate-500">Shared a local experience</p>
                    </div>
                  </div>
                  <span className="text-sm text-slate-500">{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm leading-6 text-slate-700">{language === 'fil' ? translateText(post.content) : post.content}</p>
                <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
                  <button onClick={() => handleLikePost(post.id, post.likes || 0)} className={`flex items-center gap-1 ${likedPostIds.includes(post.id) ? 'text-rose-500' : 'hover:text-teal-600'}`}>
                    <Heart size={15} fill={likedPostIds.includes(post.id) ? 'currentColor' : 'none'} /> {post.likes || 0} likes
                  </button>
                  <button onClick={() => handleSharePost(post.id)} className={`flex items-center gap-1 ${sharedPostIds.includes(post.id) ? 'text-teal-600' : 'hover:text-teal-600'}`}>
                    <MessageSquare size={15} /> {sharedPostIds.includes(post.id) ? (language === 'en' ? 'Shared' : 'Naibahagi') : (language === 'en' ? 'Share' : 'Ibahagi')}
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No travel stories yet. Start sharing your favorite spots and experiences.
              </div>
            )}
          </div>
        </div>
      )
    }

    if (activeSection === 'events') {
      return (
        <div id="events" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Upcoming events</h3>
              <p className="text-sm text-slate-500">Events and gatherings happening soon</p>
            </div>
            <Calendar size={16} className="text-teal-500" />
          </div>
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-2xl bg-slate-50 p-3">
                <p className="font-medium text-slate-900">{event.title}</p>
                <p className="mt-1 text-sm text-slate-500">{event.location}</p>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                  <span>{new Date(event.start_date).toLocaleDateString()}</span>
                  <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-medium text-teal-700">{event.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <>
        <div id="explore-section" className="rounded-3xl border border-slate-200 bg-linear-to-r from-teal-600 to-blue-700 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-teal-100">{language === 'en' ? 'Welcome back' : 'Maligayang pagbabalik'}</p>
              <h2 className="text-2xl font-semibold">{language === 'en' ? 'Discover your next favorite place in Daet' : 'Tuklasin ang susunod mong paboritong lugar sa Daet'}</h2>
              <p className="mt-2 max-w-xl text-sm text-teal-50">
                {language === 'en'
                  ? 'Stay updated on local events, hidden gems, and community stories tailored for your travel plan.'
                  : 'Manatiling updated sa mga lokal na kaganapan, lihim na pook, at kwento ng komunidad na angkop sa iyong plano sa paglalakbay.'}
              </p>
            </div>
            <button onClick={() => setShowComposer(true)} className="rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/30">
              {language === 'en' ? 'Share an experience' : 'Ibahagi ang karanasan'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{language === 'en' ? "What's hot" : 'Ano ang uso'}</h3>
                <p className="text-sm text-slate-500">{language === 'en' ? 'Trending spots and experiences right now' : 'Mga uso na lugar at karanasan ngayon'}</p>
              </div>
              <TrendingUp size={16} className="text-rose-500" />
            </div>
            <div className="space-y-3">
              {spots.slice(0, 2).map((spot, index) => (
                <div key={spot.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-600">{index === 0 ? 'Trending' : 'New favorite'}</p>
                      <p className="mt-1 font-medium text-slate-900">{spot.name}</p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">{spot.rating || 4.7}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{spot.location}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{language === 'en' ? "What's new" : 'Ano ang bago'}</h3>
                <p className="text-sm text-slate-500">{language === 'en' ? 'Fresh updates, stories, and events' : 'Mga bagong update, kwento, at kaganapan'}</p>
              </div>
              <Sparkles size={16} className="text-blue-500" />
            </div>
            <div className="space-y-3">
              {announcements.slice(0, 2).map((announcement) => (
                <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">{announcement.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{announcement.message?.slice(0, 80)}...</p>
                </div>
              ))}
              {events[0] && (
                <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50 p-3">
                  <p className="font-medium text-slate-900">{events[0].title}</p>
                  <p className="mt-1 text-sm text-slate-600">{new Date(events[0].start_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">{language === 'en' ? 'Recommended for you' : 'Inirerekomenda para sa iyo'}</h3>
              <p className="text-sm text-slate-500">{language === 'en' ? 'Popular spots nearby and trending this week' : 'Mga sikat na lugar sa paligid at uso ngayong linggo'}</p>
            </div>
            <button className="text-sm font-medium text-teal-600">{language === 'en' ? 'View all' : 'Tingnan lahat'}</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {spots.map((spot) => (
              <div key={spot.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="h-32 bg-linear-to-br from-teal-400 to-blue-500" />
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">{spot.name}</h4>
                      <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                        <MapPin size={14} className="text-teal-500" /> {spot.location}
                      </p>
                    </div>
                    <button
                      onClick={() => handleBookmark(spot.id)}
                      className={`rounded-full p-2 shadow-sm ${bookmarkedSpotIds.includes(spot.id) ? 'bg-teal-600 text-white' : 'bg-white text-slate-500'}`}
                    >
                      <Bookmark size={15} />
                    </button>
                  </div>
                  <p className="mb-3 text-sm text-slate-600">{spot.description?.slice(0, 110)}...</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-sm text-amber-500">
                      <Star size={15} fill="currentColor" />
                      <span className="font-medium text-slate-700">{spot.rating || 4.7}</span>
                    </div>
                    <button className="text-sm font-medium text-teal-600">{language === 'en' ? 'Open details' : 'Buksan ang detalye'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  const profileName = profile?.full_name || user?.user_name || user?.email?.split('@')[0] || ''
  const profileType = profile?.user_type || user?.user_type || ''
  const profileLocation = [profileForm.city || profile?.city || '', profileForm.province || profile?.province || '', profileForm.country || profile?.country || '']
    .filter(Boolean)
    .join(', ')
  const pointsBalance = profile?.points || 0
  const levelInfo = pointsBalance >= 600
    ? { level: 4, label: 'Local Legend', next: 'Max level reached' }
    : pointsBalance >= 300
      ? { level: 3, label: 'Curator', next: 600 }
      : pointsBalance >= 100
        ? { level: 2, label: 'Adventurer', next: 300 }
        : { level: 1, label: 'Explorer', next: 100 }
  const initials = profileName
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="rounded-2xl bg-white px-8 py-6 shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-sm text-slate-600">Preparing your travel dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-teal-500 to-blue-600 text-white shadow-sm">
              <Compass size={20} />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">Daet Connect</p>
              <p className="text-sm text-slate-500">Travel profile for {profileName}</p>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-center px-6 md:flex">
            <label className="flex w-full max-w-xl items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search attractions, events, and stories"
                className="w-full border-0 bg-transparent outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex w-full items-center md:hidden">
            <label className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search"
                className="w-full border-0 bg-transparent outline-none"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage((prev) => prev === 'en' ? 'fil' : 'en')}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {language === 'en' ? 'Filipino' : 'English'}
            </button>
            <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100">
              <Bell size={18} />
            </button>
            <button onClick={handleLogout} className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 pb-24 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:px-6 lg:pb-6">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-20 bg-linear-to-r from-teal-500 to-blue-600" />
            <div className="px-4 pb-4">
              <div className="-mt-8 mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-linear-to-br from-teal-500 to-blue-600 text-lg font-semibold text-white">
                {profile?.profile_image_url || profileForm.profile_image_url ? (
                  <img src={profile?.profile_image_url || profileForm.profile_image_url} alt={profileName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{profileName}</h2>
                  {profileType ? <p className="mt-1 text-sm text-slate-500">{profileType}</p> : null}
                </div>
                <button
                  onClick={() => router.push('/profile/edit')}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Edit profile
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <MapPin size={16} className="text-teal-500" />
                <span>{profileLocation}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{language === 'en' ? 'Traveler Profile' : 'Profile ng Travelller'}</h3>
              <Award size={16} className="text-amber-500" />
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                <span>{language === 'en' ? 'Points' : 'Puntos'}</span>
                <span className="font-semibold text-slate-900">{pointsBalance}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                <span>{language === 'en' ? 'Level' : 'Antas'}</span>
                <span className="font-semibold text-slate-900">{levelInfo.level} - {levelInfo.label}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                <span>{language === 'en' ? 'Next reward' : 'Susunod na reward'}</span>
                <span className="font-semibold text-slate-900">{typeof levelInfo.next === 'number' ? `${levelInfo.next - pointsBalance} pts` : levelInfo.next}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-slate-900">{language === 'en' ? 'Quick Actions' : 'Mga Madaling Hakbang'}</h3>
            <div className="space-y-2">
              <button onClick={() => scrollToSection('explore')} className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <span>{language === 'en' ? 'Explore Spots' : 'Tuklasin ang mga Pook'}</span>
                <Sparkles size={16} className="text-teal-500" />
              </button>
              <button onClick={() => scrollToSection('events')} className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <span>{language === 'en' ? 'My Bookings' : 'Aking Bookings'}</span>
                <Calendar size={16} className="text-blue-500" />
              </button>
              <button
                onClick={() => router.push('/rewards')}
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <span>{language === 'en' ? 'Rewards' : 'Mga Reward'}</span>
                <Award size={16} className="text-amber-500" />
              </button>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          {renderSectionContent()}
        </section>

        <aside className="space-y-4">
          <div id="events" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Upcoming events</h3>
              <Calendar size={16} className="text-teal-500" />
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl bg-slate-50 p-3">
                  <p className="font-medium text-slate-900">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.location}</p>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                    <span>{new Date(event.start_date).toLocaleDateString()}</span>
                    <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-medium text-teal-700">{event.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{language === 'en' ? 'Local updates' : 'Mga update sa lokal'}</h3>
              <Shield size={16} className="text-blue-500" />
            </div>
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="rounded-2xl border border-slate-200 p-3">
                  <p className="font-medium text-slate-900">{announcement.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{announcement.message?.slice(0, 90)}...</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Coming next</h3>
              <Sparkles size={16} className="text-teal-500" />
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">Real profile image upload</p>
                <p className="mt-1 text-sm text-slate-500">Personalize your traveler profile with a custom photo and avatar.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">Comments on posts</p>
                <p className="mt-1 text-sm text-slate-500">Start conversations and react to stories shared by other explorers.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-900">Premium LinkedIn-style polish</p>
                <p className="mt-1 text-sm text-slate-500">Enjoy richer cards, animations, and a more refined travel experience.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-linear-to-br from-amber-400 to-orange-500 p-4 text-white shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{language === 'en' ? 'Rewards & perks' : 'Mga reward at perks'}</h3>
              <Zap size={16} />
            </div>
            <p className="text-sm text-white/90">{language === 'en' ? 'Keep exploring to unlock more badges and redeem your next travel reward.' : 'Magpatuloy sa pag-explore para makakuha ng higit pang badge at i-redeem ang susunod mong travel reward.'}</p>
            <div className="mt-4 rounded-2xl bg-white/20 p-3">
              <div className="flex items-center justify-between text-sm text-white">
                <span>Current points</span>
                <span className="font-semibold">{pointsBalance}</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-around px-2 py-2">
          {[
            { id: 'explore', label: 'Explore', icon: Compass },
            { id: 'feed', label: 'Feed', icon: Sparkles },
            { id: 'events', label: 'Events', icon: Calendar },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="flex flex-1 flex-col items-center rounded-2xl px-3 py-2 text-[11px] font-medium text-slate-600"
              >
                <Icon size={16} />
                <span className="mt-1">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Share your Daet moment</h3>
                <p className="text-sm text-slate-500">Tell the community about your favorite place or experience.</p>
              </div>
              <button onClick={() => setShowComposer(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                X
              </button>
            </div>

            <textarea
              value={postDraft}
              onChange={(e) => setPostDraft(e.target.value)}
              rows={6}
              placeholder="What made your trip special today?"
              className="w-full rounded-2xl border border-slate-200 p-3 text-sm text-slate-700 outline-none ring-0 focus:border-teal-500"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setShowComposer(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleCreatePost} disabled={!postDraft.trim() || submittingPost} className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-teal-300">
                {submittingPost ? 'Posting...' : 'Post now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}