// app/(subsystems)/info/admin/moderation/page.js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminBadge, AdminPageHeader } from '@/app/(subsystems)/info/components/admin';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';

const isUrgentInquiry = (inquiry) => {
  if (!inquiry?.created_at) return false;
  const cutoff = new Date();
  cutoff.setTime(cutoff.getTime() - 2 * 24 * 60 * 60 * 1000);
  return new Date(inquiry.created_at) < cutoff;
};

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
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [moderationLog, setModerationLog] = useState([]);
  const [reportQueue, setReportQueue] = useState([]);
  const [accountReportSeverities, setAccountReportSeverities] = useState({});
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [editingReport, setEditingReport] = useState(null);
  const [reportEditValues, setReportEditValues] = useState({});
  const [reportEditReason, setReportEditReason] = useState('');
  const [savingReportEdit, setSavingReportEdit] = useState(false);
  const [appeals, setAppeals] = useState([]);
  const [profanityTerms, setProfanityTerms] = useState([]);
  const [profanityTermsText, setProfanityTermsText] = useState('');
  const [savingProfanityTerms, setSavingProfanityTerms] = useState(false);
  const [historyUser, setHistoryUser] = useState(null);
  const [postingHistory, setPostingHistory] = useState([]);
  const [loadingPostingHistory, setLoadingPostingHistory] = useState(false);
  const [historyMeta, setHistoryMeta] = useState({ warnings: [], warningCount: 0, activeRestriction: null });
  const [restrictDialog, setRestrictDialog] = useState(null);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (!['posts', 'inquiries', 'reports'].includes(tab)) return

    const timeoutId = window.setTimeout(() => setActiveTab(tab), 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const showToast = useCallback((message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const loadModerationState = useCallback(async () => {
    const response = await fetch('/info/api/admin/moderation', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load moderation records.');
    setBlockedUsers(result.blockedUsers || []);
    setModerationLog(result.logs || []);
    setReportQueue(result.reports || []);
    setPendingSubmissions(result.pendingSubmissions || []);
    setAppeals(result.appeals || []);
    setProfanityTerms(result.profanityTerms || []);
    setProfanityTermsText((result.profanityTerms || []).join('\n'));
  }, []);

  const appendModerationLog = async (_actor, action, details, targetType = 'content') => {
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record-action', label: action, details, targetType }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save the moderation log.');
      await loadModerationState();
      return true;
    } catch (error) {
      console.error('Moderation audit log save failed:', error);
      return false;
    }
  };

  const blockUser = async (userId, reason = 'Content violation', durationDays = null, banType = 'posting') => {
    if (!userId) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban-user', userId, reason, durationDays, banType }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to block this user.');
      await loadModerationState();
      showToast(banType === 'suspension' ? 'Account suspended and signed out.' : 'User has been blocked from publishing.');
    } catch (error) {
      showToast(error.message || 'Unable to block this user.', true);
    }
  };

  const unblockUser = async (userId) => {
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban-user', userId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to unblock this user.');
      await loadModerationState();
      showToast('User has been unblocked.');
    } catch (error) {
      showToast(error.message || 'Unable to unblock this user.', true);
    }
  };

  const resolveReport = async (reportId, action = 'resolve-report') => {
    const reason = window.prompt(action === 'reject-report' ? 'Reason for dismissing this report:' : 'Resolution note:', 'Reviewed by a moderator.')?.trim();
    if (!reason) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reportId, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to resolve this report.');
      await loadModerationState();
      showToast(action === 'reject-report' ? 'Report dismissed.' : 'Report marked as resolved.');
    } catch (error) {
      showToast(error.message || 'Unable to resolve this report.', true);
    }
  };

  const approveAccountReport = async (report) => {
    const severity = accountReportSeverities[report.id] || report.severity || 'medium';
    const reason = window.prompt('Reason for suspending this account:', report.reason || '')?.trim();
    if (!reason) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve-account-report',
          reportId: report.id,
          reason,
          severity,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to approve this account report.');
      await loadModerationState();
      if (result.sessionRevocationWarning) {
        showToast(result.sessionRevocationWarning, true);
      } else {
        const suspension = result.suspension || {};
        showToast(suspension.expires_at
          ? `Account suspended until ${new Date(suspension.expires_at).toLocaleDateString()}.`
          : 'Account suspended permanently.');
      }
    } catch (error) {
      showToast(error.message || 'Unable to approve this account report.', true);
    }
  };

  const warnUser = async (userId, reportId = null) => {
    const reason = window.prompt('Warning to send to this user:')?.trim();
    if (!reason) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'warn-user', userId, reason, reportId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send this warning.');
      await loadModerationState();
      showToast('Warning sent to the user.');
    } catch (error) {
      showToast(error.message || 'Unable to send this warning.', true);
    }
  };

  const moderateReportedContent = async (report, disposition) => {
    const isBlogUnpublish = disposition === 'hide' && report.reported_item_table === 'info_blogs';
    const actionLabel = disposition === 'hide'
      ? isBlogUnpublish ? 'Unpublish' : 'Hide'
      : 'Delete';
    if (!window.confirm(`${actionLabel} this reported content?`)) return;
    const promptedReason = window.prompt(
      isBlogUnpublish ? 'Optional comment about why this blog is being unpublished:' : `${actionLabel} reason:`,
    );
    if (promptedReason === null) return;
    const reason = promptedReason.trim();
    if (!reason && !isBlogUnpublish) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'moderate-content', reportId: report.id, disposition, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || `Unable to ${actionLabel.toLowerCase()} this content.`);
      await loadModerationState();
      const successMessage = isBlogUnpublish
        ? 'Blog unpublished and report resolved.'
        : `Content ${disposition === 'hide' ? 'hidden' : 'deleted'} and report resolved.`;
      const warnings = [result.notificationWarning, result.mediaCleanupWarning].filter(Boolean)
      showToast(warnings.join(' ') || successMessage, warnings.length > 0);
    } catch (error) {
      showToast(error.message || `Unable to ${actionLabel.toLowerCase()} this content.`, true);
    }
  };

  const reviewSubmission = async (submission, decision) => {
    const reason = window.prompt(
      decision === 'approve' ? 'Approval note:' : 'Reason for rejecting this submission:'
    )?.trim();
    if (!reason) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-submission',
          submissionId: submission.id,
          tableName: submission.table,
          decision,
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to review this submission.');
      await loadModerationState();
      await fetchModerationData();
      showToast(decision === 'approve' ? 'Submission approved.' : 'Submission rejected.');
    } catch (error) {
      showToast(error.message || 'Unable to review this submission.', true);
    }
  };

  const openReportedContentEditor = (report) => {
    setEditingReport(report);
    setReportEditValues({ ...report.reportedContent.editable });
    setReportEditReason('');
  };

  const saveReportedContentEdit = async () => {
    if (!editingReport || !reportEditReason.trim()) {
      showToast('Add a reason for the edit before saving.', true);
      return;
    }
    setSavingReportEdit(true);
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit-reported-content',
          reportId: editingReport.id,
          edits: reportEditValues,
          reason: reportEditReason.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to edit this content.');
      setEditingReport(null);
      await loadModerationState();
      await fetchModerationData();
      showToast(result.notificationWarning || 'Content updated and report resolved.', Boolean(result.notificationWarning));
    } catch (error) {
      showToast(error.message || 'Unable to edit this content.', true);
    } finally {
      setSavingReportEdit(false);
    }
  };

  const reviewAppeal = async (appeal, decision) => {
    const reason = window.prompt(
      decision === 'approve' ? 'Reason for approving this appeal:' : 'Reason for rejecting this appeal:'
    )?.trim();
    if (!reason) return;
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review-appeal', appealId: appeal.id, decision, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to review this appeal.');
      await loadModerationState();
      showToast(decision === 'approve' ? 'Appeal approved; restriction lifted.' : 'Appeal rejected.');
    } catch (error) {
      showToast(error.message || 'Unable to review this appeal.', true);
    }
  };

  const saveProfanityTerms = async () => {
    const terms = profanityTermsText.split(/\r?\n/).map((term) => term.trim()).filter(Boolean);
    setSavingProfanityTerms(true);
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-profanity-terms', terms }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save the word filter.');
      setProfanityTerms(result.profanityTerms || []);
      setProfanityTermsText((result.profanityTerms || []).join('\n'));
      showToast('Profanity filter saved.');
    } catch (error) {
      showToast(error.message || 'Unable to save the word filter.', true);
    } finally {
      setSavingProfanityTerms(false);
    }
  };

  const showPostingHistory = async (person) => {
    if (!person?.id) return;
    setHistoryUser(person);
    setPostingHistory([]);
    setHistoryMeta({ warnings: [], warningCount: 0, activeRestriction: null });
    setLoadingPostingHistory(true);
    try {
      const response = await fetch(`/info/api/admin/moderation?userId=${encodeURIComponent(person.id)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load posting history.');
      setPostingHistory(result.postingHistory || []);
      setHistoryMeta({
        warnings: result.warnings || [],
        warningCount: result.warningCount || 0,
        activeRestriction: result.activeRestriction || null,
      });
    } catch (error) {
      showToast(error.message || 'Unable to load posting history.', true);
      setHistoryUser(null);
    } finally {
      setLoadingPostingHistory(false);
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

  const fetchModerationData = useCallback(async () => {
    try {
      // Fetch pending posts
      const { data: pending, error: pendingErr } = await supabase
        .from('info_user_posts')
        .select(`
          *,
          user:user_id (full_name, profile_image_url)
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
          user:user_id (full_name, profile_image_url)
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
          user:user_id (full_name, profile_image_url)
        `)
        .eq('status', 'published')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (approvedErr) throw approvedErr;
      setApprovedPosts(approved || []);

      const currentSession = getStoredSession();
      const currentRole = currentSession ? JSON.parse(currentSession).role : '';
      if (currentRole === 'moderator') {
        setStats({
          pendingCount: pending?.length || 0,
          flaggedCount: flagged?.length || 0,
          openInquiries: 0,
          inProgressInquiries: 0,
          avgResponseTime: null,
        });
        return;
      }
      
      // Fetch open inquiries
      const { data: open, error: openErr } = await supabase
        .from('info_inquiries')
        .select(`
          *,
          user:user_id (full_name, profile_image_url)
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
          user:user_id (full_name, profile_image_url)
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
          user:user_id (full_name, profile_image_url)
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
  }, [showToast]);

  // Fetch moderation data
  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        router.push('/info/login');
        return;
      }
      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) {
        router.push('/info/admin/dashboard');
        return;
      }
      setUser(userData);
      try {
        await Promise.all([loadModerationState(), fetchModerationData()]);
      } catch (error) {
        console.error('Moderation data load failed:', error);
        showToast(error.message || 'Failed to load moderation data.', true);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [fetchModerationData, loadModerationState, router, showToast]);

  // Approve a post
  const handleApprovePost = async (post) => {
    setProcessing(true);
    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-submission',
          submissionId: post.id,
          tableName: 'info_user_posts',
          decision: 'approve',
          reason: 'Approved by moderator.',
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'This post could not be approved.');
      showToast(`Post "${post.title}" approved.`);
      await loadModerationState();
      await fetchModerationData();
    } catch (err) {
      console.error('Error approving post:', err);
      showToast(err.message || 'Failed to approve post.', true);
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
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-submission',
          submissionId: postToReject.id,
          tableName: 'info_user_posts',
          decision: 'reject',
          reason: rejectionReason.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'This post could not be rejected.');
      showToast(`Post "${postToReject.title}" rejected.`);
      setShowRejectionModal(false);
      setRejectionReason('');
      setPostToReject(null);
      await loadModerationState();
      await fetchModerationData();
    } catch (err) {
      console.error('Error rejecting post:', err);
      showToast(err.message || 'Failed to reject post.', true);
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
      
      const logged = await appendModerationLog(user?.full_name || 'Admin', 'Flag Content', `Flagged post for review: ${post.title}`, 'content');
      showToast(logged
        ? 'Post flagged for review.'
        : 'Post flagged, but its moderation log could not be saved.',
      !logged);
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
      let approvedCount = 0;
      for (const submissionId of selectedPosts) {
        const response = await fetch('/info/api/admin/moderation', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'review-submission',
            submissionId,
            tableName: 'info_user_posts',
            decision: 'approve',
            reason: 'Bulk approved by moderator.',
          }),
        });
        const result = await response.json();
        if (response.ok && result.success) approvedCount += 1;
      }
      if (approvedCount !== selectedPosts.length) {
        await loadModerationState();
        await fetchModerationData();
        setSelectedPosts([]);
        setBulkSelectMode(false);
        showToast(`Approved ${approvedCount} of ${selectedPosts.length} selected posts. The remaining posts may no longer be pending.`, true);
        return;
      }

      showToast(`${approvedCount} posts approved.`, false);
      setSelectedPosts([]);
      setBulkSelectMode(false);
      await loadModerationState();
      await fetchModerationData();
    } catch (err) {
      console.error('Error bulk approving:', err);
      showToast('Failed to bulk approve posts', true);
    } finally {
      setProcessing(false);
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
      'general': 'note',
      'review': 'star',
      'question': 'question',
      'tip': 'idea',
      'photo_share': 'photo'
    };
    return icons[type] || 'file';
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
      <AdminSidebar user={user} roleLabel="Content Moderator" />

      {/* Main Content */}
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Trust & safety"
          title="Content moderation center"
          description="Review user posts, manage forum inquiries, and keep community content quality high."
          icon="moderation"
          meta={
            <>
              <AdminBadge tone="warning">Pending posts {stats.pendingCount}</AdminBadge>
              <AdminBadge tone="danger">Flagged posts {stats.flaggedCount}</AdminBadge>
              <AdminBadge tone="info">Open inquiries {stats.openInquiries}</AdminBadge>
              <AdminBadge tone="success">Avg response {stats.avgResponseTime || 'N/A'}</AdminBadge>
            </>
          }
        />

        {/* Tab Navigation */}
        <div className="admin-panel mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'posts'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Post Moderation
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
              Inquiry Forum
              {stats.openInquiries > 0 && (
                <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                  {stats.openInquiries}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'reports'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Reports & restrictions
              {reportQueue.length > 0 && (
                <span className="ml-2 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">
                  {reportQueue.length}
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
                    Approve Selected
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
                    Bulk Approve Mode
                  </button>
                )}
              </div>
            </div>

            {/* Pending Posts Queue */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  Pending Approval
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
                                <div key={idx} className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-600">
                                  Image
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
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setPostToReject(post);
                                setShowRejectionModal(true);
                              }}
                              disabled={processing}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-full text-xs hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPost(post);
                                setShowPostModal(true);
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-full text-xs hover:bg-gray-50"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-5xl mb-3">Success</div>
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
                    Flagged for Review
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
                  <h2 className="text-lg font-semibold text-gray-800">Recently Approved (Last 30 Days)</h2>
                </div>
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {approvedPosts.slice(0, 10).map((post) => (
                    <div key={post.id} className="p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
                          Approved
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

        {activeTab === 'reports' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800">Profanity filter</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter one word per line. Matching content stays published under post-moderation and is added to the review queue.
              </p>
              <textarea
                value={profanityTermsText}
                onChange={(event) => setProfanityTermsText(event.target.value)}
                rows={5}
                maxLength={10000}
                aria-label="Profanity filter terms"
                placeholder="Add one word per line"
                className="mt-3 w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 outline-none focus:border-blue-400"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {profanityTermsText.split(/\r?\n/).map((term) => term.trim()).filter(Boolean).length} terms entered; max 250.
                </p>
                <button
                  type="button"
                  onClick={saveProfanityTerms}
                  disabled={savingProfanityTerms}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingProfanityTerms ? 'Saving...' : 'Save filter'}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Open user reports</h2>
              {reportQueue.length ? (
                <div className="space-y-3">
                  {reportQueue.map((report) => (
                    <article key={report.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">{report.reason}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {report.report_type === 'profanity'
                              ? 'Automatic profanity filter'
                              : report.reporter?.full_name || report.reporter?.email || 'Unknown reporter'} · {report.report_type} · {new Date(report.created_at).toLocaleString()}
                          </p>
                          <p className="mt-2 text-sm text-gray-600">{report.description || 'No additional details provided.'}</p>
                          <p className="mt-2 text-xs text-gray-500">
                            {report.reportedContent?.label || report.reported_item_table || 'Unknown content'} · {report.reported_item_id || 'Unavailable'}
                          </p>
                          {report.reportedUser && (
                            <p className="mt-1 text-xs text-gray-500">
                              Reported account: {report.reportedUser.full_name || report.reportedUser.email || 'Community member'}
                            </p>
                          )}
                          {report.reportedContent && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <p className="text-sm font-semibold text-slate-800">{report.reportedContent.title}</p>
                              {report.reportedContent.excerpt && (
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{report.reportedContent.excerpt}</p>
                              )}
                              {report.reportedContent.photoUrl && (
                                <img src={report.reportedContent.photoUrl} alt="Reported review photo" loading="lazy" className="mt-2 max-h-48 w-full rounded-lg object-cover sm:max-w-sm" />
                              )}
                              {report.reportedContent.href && (
                                <Link href={report.reportedContent.href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:underline">
                                  Open reported content
                                </Link>
                              )}
                            </div>
                          )}
                          {report.reported_item_table === 'info_users' && (
                            <label className="mt-3 block max-w-xs text-xs font-semibold text-slate-700">
                              Violation severity
                              <select
                                value={accountReportSeverities[report.id] || report.severity || 'medium'}
                                onChange={(event) => setAccountReportSeverities((current) => ({
                                  ...current,
                                  [report.id]: event.target.value,
                                }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
                              >
                                <option value="low">Minor — 7-day suspension</option>
                                <option value="medium">Moderate — 30-day suspension</option>
                                <option value="high">Severe — 90-day suspension</option>
                                <option value="critical">Critical — permanent suspension</option>
                              </select>
                            </label>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {report.reported_user_id && (
                            <>
                              <button
                                type="button"
                                onClick={() => void showPostingHistory(report.reportedUser)}
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                              >
                                Posting history
                              </button>
                              <button
                                type="button"
                                onClick={() => void warnUser(report.reported_user_id, report.id)}
                                className="rounded-full bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-800"
                              >
                                {report.reported_item_table === 'info_users' ? 'Warn user' : 'Warn author'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRestrictDialog({
                                  userId: report.reported_user_id,
                                  reason: report.reason || '',
                                  durationDays: '7',
                                  banType: 'posting',
                                })}
                                className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
                              >
                                {report.reported_item_table === 'info_users' ? 'Restrict user' : 'Restrict author'}
                              </button>
                            </>
                          )}
                          {report.reportedContent?.editable && (
                            <button
                              type="button"
                              onClick={() => openReportedContentEditor(report)}
                              className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                            >
                              Edit content
                            </button>
                          )}
                          {report.reportedContent?.canHide && (
                            <button
                              type="button"
                              onClick={() => void moderateReportedContent(report, 'hide')}
                              className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800"
                            >
                              {report.reported_item_table === 'info_blogs' ? 'Unpublish blog' : 'Hide content'}
                            </button>
                          )}
                          {report.reportedContent?.canDelete && (
                            <button
                              type="button"
                              onClick={() => void moderateReportedContent(report, 'delete')}
                              className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                            >
                              Delete content
                            </button>
                          )}
                          {report.reported_item_table === 'info_users' ? (
                            <button
                              type="button"
                              onClick={() => void approveAccountReport(report)}
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Approve &amp; suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void resolveReport(report.id)}
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Resolve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void resolveReport(report.id, 'reject-report')}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No open reports.</p>}
            </section>

            <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Pending community submissions</h2>
              {pendingSubmissions.filter((item) => item.table !== 'info_user_posts').length ? (
                <div className="space-y-3">
                  {pendingSubmissions.filter((item) => item.table !== 'info_user_posts').map((submission) => (
                    <article key={`${submission.table}-${submission.id}`} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-800">{submission.label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {submission.author?.full_name || submission.author?.email || 'Community member'} · {new Date(submission.created_at).toLocaleString()}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{submission.title}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">{submission.content}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => void reviewSubmission(submission, 'approve')}
                            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void reviewSubmission(submission, 'reject')}
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No pending forum replies or comments.</p>}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Restricted users</h2>
              {blockedUsers.length ? (
                <div className="space-y-2">
                  {blockedUsers.map((entry) => (
                    <div key={entry.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
                      <div>
                        <p className="font-medium text-gray-800">
                          {entry.user?.full_name || entry.user?.email || 'Account holder'}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${entry.ban_type === 'suspension' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                            {entry.ban_type === 'suspension' ? 'Suspended' : 'Posting ban'}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {entry.reason} · Restricted {new Date(entry.banned_at).toLocaleDateString()} ·
                          {' '}{entry.expires_at ? `until ${new Date(entry.expires_at).toLocaleDateString()}` : 'permanent'}
                        </p>
                      </div>
                      <button type="button" onClick={() => void unblockUser(entry.user_id)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                        {entry.ban_type === 'suspension' ? 'Lift suspension' : 'Restore publishing'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No users are currently restricted.</p>}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Restriction appeals</h2>
              {appeals.length ? (
                <div className="space-y-3">
                  {appeals.map((appeal) => (
                    <article key={appeal.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 p-4">
                      <div>
                        <p className="font-semibold text-gray-800">{appeal.user?.full_name || appeal.user?.email || 'Account holder'}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{appeal.reason}</p>
                        <p className="mt-1 text-xs text-gray-500">Submitted {new Date(appeal.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void reviewAppeal(appeal, 'approve')} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve appeal</button>
                        <button type="button" onClick={() => void reviewAppeal(appeal, 'reject')} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">Reject appeal</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No pending appeals.</p>}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-800">Moderation history</h2>
              {moderationLog.length ? (
                <div className="divide-y divide-gray-100">
                  {moderationLog.map((entry) => (
                    <div key={entry.id} className="py-3">
                      <p className="text-sm font-medium text-gray-800">{entry.action}</p>
                      <p className="text-xs text-gray-500">
                        {entry.actor?.full_name || entry.actor?.email || 'Moderator'} · {entry.table_name} · {new Date(entry.created_at).toLocaleString()}
                      </p>
                      {entry.changes?.details && <p className="mt-1 text-sm text-gray-600">{entry.changes.details}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No moderation actions recorded yet.</p>}
            </section>
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
                  <option value="accommodation">Accommodation</option>
                  <option value="transport">Transport</option>
                  <option value="events">Events</option>
                  <option value="safety">Safety</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>

            {/* Open Inquiries (Urgent) */}
            <div className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-orange-200 bg-orange-50">
                  <h2 className="text-lg font-semibold text-orange-800">Open Inquiries - Awaiting Response <span className="text-sm font-normal text-orange-600">({getFilteredInquiries(openInquiries).length})</span></h2>
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
                            {isUrgentInquiry(inquiry) && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Urgent</span>
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
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs hover:bg-blue-700 flex items-center gap-2"
                            >
                              Reply Now <Icon name="arrow" className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedInquiryForNote(inquiry);
                                setInternalNote('');
                                setShowInternalNoteModal(true);
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-full text-xs hover:bg-gray-50"
                            >
                              Add Internal Note
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
                    <div className="text-5xl mb-3">Inbox</div>
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
                  <h2 className="text-lg font-semibold text-blue-800">In Progress <span className="text-sm font-normal text-blue-600">({inProgressInquiries.length})</span></h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {inProgressInquiries.slice(0, 10).map((inquiry) => (
                    <div key={inquiry.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg flex-shrink-0">
                          Message
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
                  <h2 className="text-lg font-semibold text-green-800">Recently Answered</h2>
                </div>
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {answeredInquiries.slice(0, 10).map((inquiry) => (
                    <div key={inquiry.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">
                          Answered
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
                <h3 className="text-xl font-bold text-gray-800">Post Details</h3>
              <button onClick={() => { setShowPostModal(false); setSelectedPost(null); }} className="text-gray-400 hover:text-gray-600">Close</button>
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
                        Image
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
              <h3 className="text-xl font-bold text-gray-800">Reply to Inquiry</h3>
              <button onClick={() => { setShowInquiryModal(false); setSelectedInquiry(null); }} className="text-gray-400 hover:text-gray-600">Close</button>
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
              Tip: Your response will be marked as &quot;Official Response&quot; on the public inquiry page
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
                <span className="text-2xl">Reject</span>
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
                <span className="text-2xl">Note</span>
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

      {restrictDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="restrict-user-title">
          <form
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = restrictDialog.reason.trim();
              const durationDays = restrictDialog.durationDays.trim() ? Number(restrictDialog.durationDays) : null;
              if (!reason) { showToast('Enter a reason.', true); return; }
              if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
                showToast('Use a whole number between 1 and 365 days, or leave it blank for permanent.', true);
                return;
              }
              const { userId, banType } = restrictDialog;
              setRestrictDialog(null);
              void blockUser(userId, reason, durationDays, banType);
            }}
          >
            <h2 id="restrict-user-title" className="text-lg font-bold text-gray-900">Restrict this user</h2>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium text-gray-700">Restriction type</legend>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="radio" name="ban-type" checked={restrictDialog.banType === 'posting'} onChange={() => setRestrictDialog((current) => ({ ...current, banType: 'posting' }))} className="mt-1" />
                <span><strong>Posting ban</strong> — can still sign in and browse, but cannot publish posts, comments or replies. Can appeal.</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="radio" name="ban-type" checked={restrictDialog.banType === 'suspension'} onChange={() => setRestrictDialog((current) => ({ ...current, banType: 'suspension' }))} className="mt-1" />
                <span><strong>Suspension</strong> — signed out now and cannot sign in until it ends.</span>
              </label>
            </fieldset>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Reason (shown to the user)
              <textarea value={restrictDialog.reason} onChange={(event) => setRestrictDialog((current) => ({ ...current, reason: event.target.value }))} maxLength={1000} rows={3} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" required />
            </label>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              Duration in days (blank = permanent)
              <input type="number" min="1" max="365" value={restrictDialog.durationDays} onChange={(event) => setRestrictDialog((current) => ({ ...current, durationDays: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setRestrictDialog(null)} className="flex-1 rounded-full border border-gray-300 py-2 text-sm">Cancel</button>
              <button type="submit" className="flex-1 rounded-full bg-amber-600 py-2 text-sm font-semibold text-white">Apply restriction</button>
            </div>
          </form>
        </div>
      )}

      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="posting-history-title">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="posting-history-title" className="text-lg font-bold text-gray-900">Posting history</h2>
                <p className="text-sm text-gray-500">{historyUser.full_name || historyUser.email || 'Account holder'}</p>
              </div>
              <button type="button" onClick={() => setHistoryUser(null)} className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700">Close</button>
            </div>
            {!loadingPostingHistory && (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-yellow-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-yellow-800">Warnings</p>
                  <p className="text-2xl font-bold text-yellow-900">{historyMeta.warningCount}</p>
                  {historyMeta.warnings[0] ? <p className="mt-1 text-xs text-yellow-800">Latest: {historyMeta.warnings[0].reason} ({new Date(historyMeta.warnings[0].created_at).toLocaleDateString()})</p> : null}
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Current restriction</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {historyMeta.activeRestriction
                      ? `${historyMeta.activeRestriction.ban_type === 'suspension' ? 'Suspended' : 'Posting ban'} · ${historyMeta.activeRestriction.expires_at ? `until ${new Date(historyMeta.activeRestriction.expires_at).toLocaleDateString()}` : 'permanent'}`
                      : 'None'}
                  </p>
                </div>
              </div>
            )}
            {loadingPostingHistory ? (
              <p className="py-8 text-center text-sm text-gray-500">Loading history...</p>
            ) : postingHistory.length ? (
              <div className="divide-y divide-gray-100">
                {postingHistory.map((item) => (
                  <article key={`${item.type}-${item.id}`} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-gray-800">{item.type}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.approval_status || item.status || 'submitted'}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{item.title || 'Untitled content'}</p>
                    <p className="mt-1 text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p>
                  </article>
                ))}
              </div>
            ) : <p className="py-8 text-center text-sm text-gray-500">No posting history was found.</p>}
          </div>
        </div>
      )}

      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-reported-content-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="edit-reported-content-title" className="text-lg font-bold text-gray-900">Edit reported {editingReport.reportedContent.label.toLowerCase()}</h2>
            <div className="mt-4 space-y-4">
              {Object.entries(reportEditValues).map(([field, value]) => (
                <label key={field} className="block text-sm font-medium capitalize text-gray-700">
                  {field}
                  {field === 'title' ? (
                    <input
                      value={value}
                      onChange={(event) => setReportEditValues((current) => ({ ...current, [field]: event.target.value }))}
                      maxLength={200}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                    />
                  ) : (
                    <textarea
                      value={value}
                      onChange={(event) => setReportEditValues((current) => ({ ...current, [field]: event.target.value }))}
                      maxLength={field === 'excerpt' ? 5000 : 50000}
                      rows={field === 'excerpt' ? 3 : 7}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                    />
                  )}
                </label>
              ))}
              <label className="block text-sm font-medium text-gray-700">
                Moderator note
                <textarea
                  value={reportEditReason}
                  onChange={(event) => setReportEditReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingReport(null)} className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700">
                Cancel
              </button>
              <button type="button" onClick={() => void saveReportedContentEdit()} disabled={savingReportEdit} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {savingReportEdit ? 'Saving...' : 'Save edit and resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div role={toastMessage.isError ? 'alert' : 'status'} aria-live={toastMessage.isError ? 'assertive' : 'polite'} className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          <span className="inline-block align-middle mr-2">{toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}</span>
          <span className="align-middle">{toastMessage.message}</span>
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
