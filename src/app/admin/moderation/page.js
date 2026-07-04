// app/admin/moderation/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AdminModerationPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // State for different moderation sections
  const [pendingPosts, setPendingPosts] = useState([]);
  const [flaggedPosts, setFlaggedPosts] = useState([]);
  const [approvedPosts, setApprovedPosts] = useState([]);
  const [openInquiries, setOpenInquiries] = useState([]);
  const [inProgressInquiries, setInProgressInquiries] = useState([]);
  const [answeredInquiries, setAnsweredInquiries] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState('posts');
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [postToReject, setPostToReject] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [inquiryFilter, setInquiryFilter] = useState('all');
  const [stats, setStats] = useState({
    pendingCount: 0,
    flaggedCount: 0,
    openInquiries: 0,
    inProgressInquiries: 0,
    avgResponseTime: null
  });
  const [toastMessage, setToastMessage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [showInternalNoteModal, setShowInternalNoteModal] = useState(false);
  const [selectedInquiryForNote, setSelectedInquiryForNote] = useState(null);
  const [autoFlagKeywords, setAutoFlagKeywords] = useState(['spam', 'scam', 'offensive', 'inappropriate', 'xxx', 'adult']);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState([]);

  // Fetch moderation data
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
      await fetchModerationData();
      setLoading(false);
    };
    checkAuth();
  }, []);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchModerationData = async () => {
    try {
      // Fetch pending posts
      const { data: pending, error: pendingErr } = await supabase
        .from('info_user_posts')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (pendingErr) throw pendingErr;
      setPendingPosts(pending || []);
      
      // Fetch flagged posts
      const { data: flagged, error: flaggedErr } = await supabase
        .from('info_user_posts')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'flagged')
        .order('created_at', { ascending: false });
      
      if (flaggedErr) throw flaggedErr;
      setFlaggedPosts(flagged || []);
      
      // Fetch approved/recent posts (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: approved, error: approvedErr } = await supabase
        .from('info_user_posts')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'approved')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (approvedErr) throw approvedErr;
      setApprovedPosts(approved || []);
      
      // Fetch open inquiries
      const { data: open, error: openErr } = await supabase
        .from('info_inquiries')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      
      if (openErr) throw openErr;
      setOpenInquiries(open || []);
      
      // Fetch in-progress inquiries
      const { data: inProgress, error: inProgressErr } = await supabase
        .from('info_inquiries')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false });
      
      if (inProgressErr) throw inProgressErr;
      setInProgressInquiries(inProgress || []);
      
      // Fetch answered inquiries (last 30 days)
      const { data: answered, error: answeredErr } = await supabase
        .from('info_inquiries')
        .select(`
          *,
          user:user_id (full_name, email, avatar_url)
        `)
        .eq('status', 'answered')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('responded_at', { ascending: false })
        .limit(50);
      
      if (answeredErr) throw answeredErr;
      setAnsweredInquiries(answered || []);
      
      // Calculate stats
      setStats({
        pendingCount: pending?.length || 0,
        flaggedCount: flagged?.length || 0,
        openInquiries: open?.length || 0,
        inProgressInquiries: inProgress?.length || 0,
        avgResponseTime: calculateAvgResponseTime(answered || [])
      });
      
    } catch (err) {
      console.error('Error fetching moderation data:', err);
      showToast('Failed to load moderation data', true);
    }
  };

  const calculateAvgResponseTime = (answeredInquiries) => {
    if (!answeredInquiries.length) return null;
    let totalMinutes = 0;
    let count = 0;
    answeredInquiries.forEach(inquiry => {
      if (inquiry.created_at && inquiry.responded_at) {
        const created = new Date(inquiry.created_at);
        const responded = new Date(inquiry.responded_at);
        const diffMinutes = (responded - created) / (1000 * 60);
        totalMinutes += diffMinutes;
        count++;
      }
    });
    if (count === 0) return null;
    const avgMinutes = Math.round(totalMinutes / count);
    if (avgMinutes < 60) return `${avgMinutes} minutes`;
    if (avgMinutes < 1440) return `${Math.round(avgMinutes / 60)} hours`;
    return `${Math.round(avgMinutes / 1440)} days`;
  };

  // Approve a post
  const handleApprovePost = async (post) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_user_posts')
        .update({
          status: 'approved',
          moderated_by: user?.id,
          moderated_at: new Date(),
          moderation_notes: 'Approved by moderator'
        })
        .eq('id', post.id);
      
      if (error) throw error;
      
      // Award points to user for approved post
      await awardPointsToUser(post.user_id, 10, 'post_approved');
      
      showToast(`Post "${post.title}" approved! User earned 10 points.`, false);
      await fetchModerationData();
    } catch (err) {
      console.error('Error approving post:', err);
      showToast('Failed to approve post', true);
    } finally {
      setProcessing(false);
    }
  };

  // Reject a post with reason
  const handleRejectPost = async () => {
    if (!postToReject) return;
    if (!rejectionReason.trim()) {
      showToast('Please provide a rejection reason', true);
      return;
    }
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_user_posts')
        .update({
          status: 'rejected',
          moderated_by: user?.id,
          moderated_at: new Date(),
          moderation_notes: rejectionReason
        })
        .eq('id', postToReject.id);
      
      if (error) throw error;
      
      // Notify user of rejection
      await createNotification(
        postToReject.user_id,
        'Post Rejected',
        `Your post "${postToReject.title}" was not approved. Reason: ${rejectionReason}`,
        'warning'
      );
      
      showToast(`Post "${postToReject.title}" rejected`, false);
      setShowRejectionModal(false);
      setRejectionReason('');
      setPostToReject(null);
      await fetchModerationData();
    } catch (err) {
      console.error('Error rejecting post:', err);
      showToast('Failed to reject post', true);
    } finally {
      setProcessing(false);
    }
  };

  // Flag a post for review (from admin)
  const handleFlagPost = async (post) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_user_posts')
        .update({
          status: 'flagged',
          moderated_by: user?.id,
          moderated_at: new Date(),
          moderation_notes: 'Flagged by moderator for review'
        })
        .eq('id', post.id);
      
      if (error) throw error;
      
      showToast(`Post flagged for review`, false);
      await fetchModerationData();
    } catch (err) {
      console.error('Error flagging post:', err);
      showToast('Failed to flag post', true);
    } finally {
      setProcessing(false);
    }
  };

  // Bulk approve posts
  const handleBulkApprove = async () => {
    if (selectedPosts.length === 0) {
      showToast('No posts selected', true);
      return;
    }
    
    setProcessing(true);
    try {
      for (const postId of selectedPosts) {
        const post = pendingPosts.find(p => p.id === postId);
        if (post) {
          await supabase
            .from('info_user_posts')
            .update({
              status: 'approved',
              moderated_by: user?.id,
              moderated_at: new Date(),
              moderation_notes: 'Bulk approved'
            })
            .eq('id', postId);
          
          await awardPointsToUser(post.user_id, 10, 'post_approved');
        }
      }
      
      showToast(`${selectedPosts.length} posts approved!`, false);
      setSelectedPosts([]);
      setBulkSelectMode(false);
      await fetchModerationData();
    } catch (err) {
      console.error('Error bulk approving:', err);
      showToast('Failed to bulk approve posts', true);
    } finally {
      setProcessing(false);
    }
  };

  // Award points to user
  const awardPointsToUser = async (userId, points, reason) => {
    try {
      const { data: userData } = await supabase
        .from('info_users')
        .select('points')
        .eq('id', userId)
        .single();
      
      const newPoints = (userData?.points || 0) + points;
      
      await supabase
        .from('info_users')
        .update({ points: newPoints })
        .eq('id', userId);
      
      await supabase
        .from('reward_history')
        .insert({
          user_id: userId,
          subsystem_source: reason,
          points_earned: points,
          description: `Points earned from ${reason}`
        });
      
    } catch (err) {
      console.error('Error awarding points:', err);
    }
  };

  // Create notification
  const createNotification = async (userId, title, message, type = 'info') => {
    try {
      await supabase
        .from('info_notifications')
        .insert({
          user_id: userId,
          title,
          message,
          type
        });
    } catch (err) {
      console.error('Error creating notification:', err);
    }
  };

  // Assign inquiry to staff member
  const handleAssignInquiry = async (inquiryId, staffId) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          assigned_to: staffId,
          status: 'in_progress',
          updated_at: new Date()
        })
        .eq('id', inquiryId);
      
      if (error) throw error;
      
      showToast('Inquiry assigned successfully', false);
      await fetchModerationData();
    } catch (err) {
      console.error('Error assigning inquiry:', err);
      showToast('Failed to assign inquiry', true);
    } finally {
      setProcessing(false);
    }
  };

  // Reply to inquiry
  const handleReplyToInquiry = async () => {
    if (!selectedInquiry) return;
    if (!replyText.trim()) {
      showToast('Please enter a reply', true);
      return;
    }
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          admin_response: replyText,
          status: 'answered',
          responded_by: user?.id,
          responded_at: new Date(),
          updated_at: new Date()
        })
        .eq('id', selectedInquiry.id);
      
      if (error) throw error;
      
      // Notify user
      await createNotification(
        selectedInquiry.user_id,
        'Your Inquiry Has Been Answered',
        `Response to: ${selectedInquiry.title}`,
        'success'
      );
      
      showToast('Reply sent successfully!', false);
      setReplyText('');
      setShowInquiryModal(false);
      setSelectedInquiry(null);
      await fetchModerationData();
    } catch (err) {
      console.error('Error replying to inquiry:', err);
      showToast('Failed to send reply', true);
    } finally {
      setProcessing(false);
    }
  };

  // Add internal note to inquiry
  const handleAddInternalNote = async () => {
    if (!selectedInquiryForNote) return;
    if (!internalNote.trim()) {
      showToast('Please enter a note', true);
      return;
    }
    
    setProcessing(true);
    try {
      const { data: existingNotes } = await supabase
        .from('info_inquiries')
        .select('internal_notes')
        .eq('id', selectedInquiryForNote.id)
        .single();
      
      const currentNotes = existingNotes?.internal_notes || [];
      const updatedNotes = [...currentNotes, {
        note: internalNote,
        created_by: user?.full_name || user?.user_name,
        created_at: new Date()
      }];
      
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          internal_notes: updatedNotes,
          updated_at: new Date()
        })
        .eq('id', selectedInquiryForNote.id);
      
      if (error) throw error;
      
      showToast('Internal note added', false);
      setInternalNote('');
      setShowInternalNoteModal(false);
      setSelectedInquiryForNote(null);
      await fetchModerationData();
    } catch (err) {
      console.error('Error adding note:', err);
      showToast('Failed to add note', true);
    } finally {
      setProcessing(false);
    }
  };

  // Mark inquiry as resolved/closed
  const handleCloseInquiry = async (inquiry) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          status: 'closed',
          updated_at: new Date()
        })
        .eq('id', inquiry.id);
      
      if (error) throw error;
      
      showToast('Inquiry closed', false);
      await fetchModerationData();
    } catch (err) {
      console.error('Error closing inquiry:', err);
      showToast('Failed to close inquiry', true);
    } finally {
      setProcessing(false);
    }
  };

  // Get filtered posts based on category
  const getFilteredPosts = (posts) => {
    if (filterCategory === 'all') return posts;
    return posts.filter(post => post.post_type === filterCategory);
  };

  // Get filtered inquiries
  const getFilteredInquiries = (inquiries) => {
    if (inquiryFilter === 'all') return inquiries;
    return inquiries.filter(inq => inq.category === inquiryFilter);
  };

  const getPostTypeIcon = (type) => {
    const icons = {
      'general': '📝',
      'review': '⭐',
      'question': '❓',
      'tip': '💡',
      'photo_share': '📸'
    };
    return icons[type] || '📄';
  };

  const getUrgencyColor = (inquiry) => {
    if (!inquiry.created_at) return '';
    const createdDate = new Date(inquiry.created_at);
    const now = new Date();
    const daysDiff = (now - createdDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 5) return 'bg-red-50 border-red-200';
    if (daysDiff > 2) return 'bg-yellow-50 border-yellow-200';
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading moderation panel...</p>
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
              <p className="text-xs text-gray-500">Moderation Console</p>
            </div>
          </div>
          <div className="mt-4 pt-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              {user?.user_name || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Content Moderator</p>
          </div>
        </div>
        <nav className="mt-4 px-3">
          <Link href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📊</span>
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">👥</span>
            <span className="font-medium">Manage Users</span>
          </Link>
          <Link href="/admin/events" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors mb-1">
            <span className="text-xl">📅</span>
            <span className="font-medium">Events &amp; Activities</span>
          </Link>
          <button 
            onClick={() => setActiveTab('posts')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 ${
              activeTab === 'posts' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl">⏳</span>
            <span className="font-medium">Post Moderation</span>
            {stats.pendingCount > 0 && (
              <span className="ml-auto bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {stats.pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('inquiries')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 ${
              activeTab === 'inquiries' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl">💬</span>
            <span className="font-medium">Inquiry Forum</span>
            {stats.openInquiries > 0 && (
              <span className="ml-auto bg-red-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {stats.openInquiries}
              </span>
            )}
          </button>
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
            <span className="font-medium">Blog &amp; News</span>
          </Link>
        </nav>
        <button 
          onClick={() => {
            sessionStorage.removeItem('user_session');
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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Content Moderation Center</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Review user posts • Manage forum inquiries • Maintain content quality
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Stats Cards */}
              <div className="flex gap-3">
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500">Pending Posts</p>
                  <p className="text-xl font-bold text-yellow-600">{stats.pendingCount}</p>
                </div>
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500">Flagged Posts</p>
                  <p className="text-xl font-bold text-red-600">{stats.flaggedCount}</p>
                </div>
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500">Open Inquiries</p>
                  <p className="text-xl font-bold text-orange-600">{stats.openInquiries}</p>
                </div>
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-200">
                  <p className="text-xs text-gray-500">Avg Response</p>
                  <p className="text-xl font-bold text-green-600">{stats.avgResponseTime || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'posts'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📝 Post Moderation
              {stats.pendingCount > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">
                  {stats.pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('inquiries')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'inquiries'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              💬 Inquiry Forum
              {stats.openInquiries > 0 && (
                <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                  {stats.openInquiries}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* POST MODERATION SECTION */}
        {activeTab === 'posts' && (
          <div className="space-y-6">
            {/* Bulk Actions Bar */}
            {bulkSelectMode && (
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-blue-800">
                    {selectedPosts.length} post(s) selected
                  </span>
                  <button
                    onClick={handleBulkApprove}
                    disabled={processing || selectedPosts.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-full text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    ✅ Approve Selected
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPosts([]);
                      setBulkSelectMode(false);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-full text-sm hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">Filter by type:</span>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="general">General Posts</option>
                    <option value="review">Reviews</option>
                    <option value="question">Questions</option>
                    <option value="tip">Tips</option>
                    <option value="photo_share">Photo Shares</option>
                  </select>
                </div>
                {!bulkSelectMode && pendingPosts.length > 0 && (
                  <button
                    onClick={() => setBulkSelectMode(true)}
                    className="px-4 py-1.5 border border-blue-600 text-blue-600 rounded-full text-sm hover:bg-blue-50"
                  >
                    📌 Bulk Approve Mode
                  </button>
                )}
              </div>
            </div>

            {/* Pending Posts Queue */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <span>⏳</span> Pending Approval
                  <span className="text-sm font-normal text-gray-500">({getFilteredPosts(pendingPosts).length} items)</span>
                </h2>
              </div>
              
              <div className="divide-y divide-gray-100">
                {getFilteredPosts(pendingPosts).length > 0 ? (
                  getFilteredPosts(pendingPosts).map((post) => (
                    <div key={post.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Checkbox for bulk select */}
                        {bulkSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedPosts.includes(post.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPosts([...selectedPosts, post.id]);
                              } else {
                                setSelectedPosts(selectedPosts.filter(id => id !== post.id));
                              }
                            }}
                            className="mt-1 w-4 h-4 text-blue-600 rounded"
                          />
                        )}
                        
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {post.user?.full_name?.charAt(0) || post.user?.email?.charAt(0) || 'U'}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-gray-900">{post.user?.full_name || post.user?.email}</span>
                            <span className="text-xs text-gray-400">{new Date(post.created_at).toLocaleString()}</span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full flex items-center gap-1">
                              {getPostTypeIcon(post.post_type)} {post.post_type}
                            </span>
                            {post.category && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                #{post.category}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-800 mb-1">{post.title}</h3>
                          <p className="text-gray-600 text-sm mb-2 line-clamp-2">{post.content}</p>
                          {post.images && post.images.length > 0 && (
                            <div className="flex gap-2 mb-3">
                              {post.images.slice(0, 3).map((img, idx) => (
                                <div key={idx} className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                                  📷
                                </div>
                              ))}
                              {post.images.length > 3 && (
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-500">
                                  +{post.images.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleApprovePost(post)}
                              disabled={processing}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-full text-xs hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              ✅ Approve
                            </button>
                            <button
                              onClick={() => {
                                setPostToReject(post);
                                setShowRejectionModal(true);
                              }}
                              disabled={processing}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-full text-xs hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              ❌ Reject
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPost(post);
                                setShowPostModal(true);
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-full text-xs hover:bg-gray-50"
                            >
                              👁️ View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-5xl mb-3">✅</div>
                    <p className="text-gray-500">No pending posts to review</p>
                    <p className="text-sm text-gray-400">All user content has been moderated</p>
                  </div>
                )}
              </div>
            </div>

            {/* Flagged Posts Section */}
            {flaggedPosts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-red-200 bg-red-50">
                  <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                    <span>🚩</span> Flagged for Review
                    <span className="text-sm font-normal text-red-600">({flaggedPosts.length} items)</span>
                  </h2>
                </div>
                
                <div className="divide-y divide-gray-100">
                  {flaggedPosts.map((post) => (
                    <div key={post.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {post.user?.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-gray-900">{post.user?.full_name || post.user?.email}</span>
                            <span className="text-xs text-gray-400">{new Date(post.created_at).toLocaleString()}</span>
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Flagged</span>
                          </div>
                          <h3 className="font-semibold text-gray-800 mb-1">{post.title}</h3>
                          <p className="text-gray-600 text-sm mb-2">{post.content}</p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleApprovePost(post)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-full text-xs"
                            >
                              Approve & Remove Flag
                            </button>
                            <button
                              onClick={() => {
                                setPostToReject(post);
                                setShowRejectionModal(true);
                              }}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-full text-xs"
                            >
                              Delete Post
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPost(post);
                                setShowPostModal(true);
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-full text-xs"
                            >
                              View Details
                            </button>
                          </div>
                          {post.moderation_notes && (
                            <p className="text-xs text-gray-400 mt-2">Note: {post.moderation_notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recently Approved Posts */}
            {approvedPosts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <span>📋</span> Recently Approved (Last 30 Days)
                  </h2>
                </div>
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {approvedPosts.slice(0, 10).map((post) => (
                    <div key={post.id} className="p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
                          ✅
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm truncate">{post.title}</p>
                          <p className="text-xs text-gray-400">
                            By {post.user?.full_name || 'User'} • {new Date(post.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedPost(post);
                            setShowPostModal(true);
                          }}
                          className="text-xs text-blue-600"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* INQUIRY FORUM SECTION */}
        {activeTab === 'inquiries' && (
          <div className="space-y-6">
            {/* Filter Bar for Inquiries */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-500">Filter by category:</span>
                <select
                  value={inquiryFilter}
                  onChange={(e) => setInquiryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-full text-sm"
                >
                  <option value="all">All Categories</option>
                  <option value="accommodation">🏨 Accommodation</option>
                  <option value="transport">🚗 Transport</option>
                  <option value="events">📅 Events</option>
                  <option value="safety">⚠️ Safety</option>
                  <option value="general">📝 General</option>
                </select>
              </div>
            </div>

            {/* Open Inquiries (Urgent) */}
            <div className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-orange-200 bg-orange-50">
                <h2 className="text-lg font-semibold text-orange-800 flex items-center gap-2">
                  <span>🆕</span> Open Inquiries - Awaiting Response
                  <span className="text-sm font-normal text-orange-600">({getFilteredInquiries(openInquiries).length})</span>
                </h2>
                <p className="text-xs text-orange-600 mt-1">Response required within 48 hours</p>
              </div>
              
              <div className="divide-y divide-gray-100">
                {getFilteredInquiries(openInquiries).length > 0 ? (
                  getFilteredInquiries(openInquiries).map((inquiry) => (
                    <div key={inquiry.id} className={`p-4 hover:bg-gray-50 transition-colors ${getUrgencyColor(inquiry)}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {inquiry.user_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-gray-900">{inquiry.user_name || 'Anonymous User'}</span>
                            <span className="text-xs text-gray-400">{new Date(inquiry.created_at).toLocaleString()}</span>
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Open</span>
                            {inquiry.category && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{inquiry.category}</span>
                            )}
                            {new Date(inquiry.created_at) < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">⚠️ Urgent</span>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-800 mb-1">{inquiry.title}</h3>
                          <p className="text-gray-600 text-sm mb-3">{inquiry.message}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedInquiry(inquiry);
                                setReplyText('');
                                setShowInquiryModal(true);
                              }}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs hover:bg-blue-700"
                            >
                              💬 Reply Now
                            </button>
                            <button
                              onClick={() => {
                                setSelectedInquiryForNote(inquiry);
                                setInternalNote('');
                                setShowInternalNoteModal(true);
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-full text-xs hover:bg-gray-50"
                            >
                              📝 Add Internal Note
                            </button>
                            <button
                              onClick={() => handleCloseInquiry(inquiry)}
                              className="px-3 py-1.5 text-gray-500 rounded-full text-xs hover:text-gray-700"
                            >
                              Mark as Closed
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-5xl mb-3">📭</div>
                    <p className="text-gray-500">No open inquiries</p>
                    <p className="text-sm text-gray-400">All questions have been answered</p>
                  </div>
                )}
              </div>
            </div>

            {/* In-Progress Inquiries */}
            {inProgressInquiries.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-blue-200 bg-blue-50">
                  <h2 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                    <span>🔄</span> In Progress
                    <span className="text-sm font-normal text-blue-600">({inProgressInquiries.length})</span>
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {inProgressInquiries.slice(0, 10).map((inquiry) => (
                    <div key={inquiry.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg flex-shrink-0">
                          💬
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium text-gray-900">{inquiry.user_name || 'Anonymous'}</span>
                            <span className="text-xs text-gray-400">{new Date(inquiry.created_at).toLocaleDateString()}</span>
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">In Progress</span>
                          </div>
                          <p className="font-medium text-gray-800 text-sm">{inquiry.title}</p>
                          <button
                            onClick={() => {
                              setSelectedInquiry(inquiry);
                              setReplyText(inquiry.admin_response || '');
                              setShowInquiryModal(true);
                            }}
                            className="mt-2 text-xs text-blue-600"
                          >
                            Continue Response →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recently Answered */}
            {answeredInquiries.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-green-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-green-200 bg-green-50">
                  <h2 className="text-lg font-semibold text-green-800 flex items-center gap-2">
                    <span>✅</span> Recently Answered
                  </h2>
                </div>
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {answeredInquiries.slice(0, 10).map((inquiry) => (
                    <div key={inquiry.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
                          ✅
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 text-sm">{inquiry.title}</p>
                          <p className="text-xs text-gray-400">
                            Asked by {inquiry.user_name || 'User'} • 
                            Responded {new Date(inquiry.responded_at).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">Response: {inquiry.admin_response}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedInquiry(inquiry);
                            setShowInquiryModal(true);
                          }}
                          className="text-xs text-blue-600"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post Details Modal */}
      {showPostModal && selectedPost && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">📄 Post Details</h3>
              <button onClick={() => { setShowPostModal(false); setSelectedPost(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {selectedPost.user?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedPost.user?.full_name || 'User'}</p>
                  <p className="text-xs text-gray-400">{selectedPost.user?.email}</p>
                  <p className="text-xs text-gray-400">Posted: {new Date(selectedPost.created_at).toLocaleString()}</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm px-2 py-0.5 bg-gray-200 rounded-full">{selectedPost.post_type}</span>
                  {selectedPost.category && <span className="text-sm px-2 py-0.5 bg-blue-100 rounded-full">{selectedPost.category}</span>}
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">{selectedPost.title}</h2>
                <p className="text-gray-600 whitespace-pre-wrap">{selectedPost.content}</p>
              </div>
              
              {selectedPost.images && selectedPost.images.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Attached Images:</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedPost.images.map((img, idx) => (
                      <div key={idx} className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                        📷
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                {selectedPost.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        handleApprovePost(selectedPost);
                        setShowPostModal(false);
                      }}
                      className="flex-1 py-2 bg-green-600 text-white rounded-full hover:bg-green-700"
                    >
                      Approve Post
                    </button>
                    <button
                      onClick={() => {
                        setShowPostModal(false);
                        setPostToReject(selectedPost);
                        setShowRejectionModal(true);
                      }}
                      className="flex-1 py-2 bg-red-600 text-white rounded-full hover:bg-red-700"
                    >
                      Reject Post
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-full hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Reply Modal */}
      {showInquiryModal && selectedInquiry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">💬 Reply to Inquiry</h3>
              <button onClick={() => { setShowInquiryModal(false); setSelectedInquiry(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{selectedInquiry.user_name || 'Anonymous User'}</span>
                <span className="text-xs text-gray-400">{new Date(selectedInquiry.created_at).toLocaleString()}</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-2">{selectedInquiry.title}</h4>
              <p className="text-gray-600 text-sm">{selectedInquiry.message}</p>
              {selectedInquiry.admin_response && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-blue-600 mb-1">Previous Response:</p>
                  <p className="text-gray-600 text-sm">{selectedInquiry.admin_response}</p>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Official Response</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows="5"
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Type your response here. This will be visible to the user and may be added to the public FAQ..."
              />
            </div>
            
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleReplyToInquiry}
                disabled={processing}
                className="flex-1 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
              >
                {processing ? 'Sending...' : 'Send Reply'}
              </button>
              <button
                onClick={() => { setShowInquiryModal(false); setSelectedInquiry(null); }}
                className="flex-1 py-2 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            
            <p className="text-xs text-gray-400 text-center mt-4">
              💡 Your response will be marked as "Official Response" on the public inquiry page
            </p>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {showRejectionModal && postToReject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-3 rounded-2xl">
                <span className="text-2xl">❌</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Reject Post</h3>
                <p className="text-xs text-gray-500">Provide a reason for the user</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rejection Reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-red-500"
                placeholder="Explain why this post was not approved..."
              />
              <p className="text-xs text-gray-400 mt-2">This reason will be sent to the user as a notification.</p>
            </div>
            
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleRejectPost}
                disabled={processing}
                className="flex-1 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Reject Post'}
              </button>
              <button
                onClick={() => { setShowRejectionModal(false); setPostToReject(null); setRejectionReason(''); }}
                className="flex-1 py-2 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Internal Note Modal */}
      {showInternalNoteModal && selectedInquiryForNote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-gray-100 p-3 rounded-2xl">
                <span className="text-2xl">📝</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Add Internal Note</h3>
                <p className="text-xs text-gray-500">Visible only to staff members</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500"
                placeholder="Add coordination notes, follow-up items, or internal comments..."
              />
            </div>
            
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleAddInternalNote}
                disabled={processing}
                className="flex-1 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
              >
                {processing ? 'Saving...' : 'Add Note'}
              </button>
              <button
                onClick={() => { setShowInternalNoteModal(false); setSelectedInquiryForNote(null); setInternalNote(''); }}
                className="flex-1 py-2 border border-gray-300 rounded-full hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-50 animate-slide-in shadow-lg ${
          toastMessage.isError ? 'bg-red-600' : 'bg-green-500'
        }`}>
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
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
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
