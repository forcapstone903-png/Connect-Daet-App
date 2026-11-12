"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  BadgeCheck,
  Briefcase,
  Check,
  Copy,
  FileText,
  Flag,
  MessageCircle,
  MessageSquareText,
  MapPin,
  MoreHorizontal,
  ShieldCheck,
  Share2,
  ShieldOff,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import ProfileFeedActions from "@/app/(subsystems)/info/components/user/ProfileFeedActions";
import PostMediaGallery from "@/app/(subsystems)/info/components/user/PostMediaGallery";
import QuoteRepostCard from "@/app/(subsystems)/info/components/user/QuoteRepostCard";
import { getPostImages, getPostVideos } from "@/lib/postMedia";
import { filterProfilePosts, getProfileContentTabs } from "@/lib/profileContent";
import { getPostPreview } from "@/lib/postContent";
import UserTopHeader from "@/app/(subsystems)/info/components/user/UserTopHeader";
import { SectionLoading } from "@/app/(subsystems)/info/components/user/UserSectionHeader";
import {
  getAuthCookieFromDocument,
  getStoredSessionObject,
} from "@/lib/authCookies";
import {
  invalidateCachePrefix,
} from "@/lib/cache";

function getInitials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "T"
  );
}

function formatPostDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMemberSince(value) {
  if (!value) return "New community member";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New community member";

  return `Joined ${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

function buildPostList(content) {
  const repostTypeMeta = {
    blog: {
      type: "Blog",
      text: "Shared a travel story with the community.",
      href: `/info/user/blogs/`,
      label: "Travel story",
    },
    forum_thread: {
      type: "Forum",
      text: "Started a community discussion.",
      href: `/info/user/forums/`,
      label: "Discussion",
    },
    event: {
      type: "Event",
      text: "Shared an upcoming community event.",
      href: `/info/user/events/`,
      label: "Event",
    },
    user_post: {
      type: "Post",
      text: "Shared a community post.",
      href: `/info/user/posts/`,
      label: "Community post",
    },
  };

  return [
    ...(content.user_posts || []).map((post) => ({
      id: post.id,
      type: "Post",
      title: post.title,
      text: post.content || "Shared a community post.",
      date: post.created_at,
      media: post.featured_image || (post.images || [])[0] || "",
      images: Array.isArray(post.images) ? post.images : [],
      videos: Array.isArray(post.videos) ? post.videos : [],
      video_url: post.video_url || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/info/user/posts/${post.id}`,
    })),
    ...(content.blogs || []).map((post) => ({
      id: post.id,
      type: "Blog",
      title: post.title,
      text: post.excerpt || "Shared a new story with the community.",
      date: post.published_at || post.created_at,
      media: post.featured_image || (post.images || [])[0] || "",
      images: Array.isArray(post.images) ? post.images : [],
      videos: Array.isArray(post.videos) ? post.videos : [],
      video_url: post.video_url || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/info/user/blogs/${post.id}`,
    })),
    ...(content.threads || []).map((post) => ({
      id: post.id,
      type: "Forum",
      title: post.title,
      text: post.content || "Started a community discussion.",
      date: post.created_at,
      images: [
        ...(Array.isArray(post.image_urls) ? post.image_urls : []),
        ...(Array.isArray(post.images) ? post.images : []),
      ],
      videos: Array.isArray(post.videos) ? post.videos : [],
      video_url: post.video_url || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/info/user/forums/${post.id}`,
    })),
    ...(content.events || []).map((post) => ({
      id: post.id,
      type: "Event",
      title: post.title,
      text: post.description || "Shared a community event.",
      date: post.start_date || post.created_at,
      media: post.featured_image || (post.images || [])[0] || "",
      images: Array.isArray(post.images) ? post.images : [],
      videos: Array.isArray(post.videos) ? post.videos : [],
      video_url: post.video_url || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/info/user/events/${post.id}`,
    })),
    ...(content.tourist_spots || []).map((spot) => ({
      id: spot.id,
      type: "Tourist Spot",
      title: spot.name || "Shared destination",
      text: spot.description || "A destination shared with the community.",
      date: spot.created_at,
      location: spot.location || "",
      latitude: spot.latitude,
      longitude: spot.longitude,
      category: spot.category || "Destination",
      media: spot.featured_image || (spot.images || [])[0] || "",
      images: Array.isArray(spot.images) ? spot.images : [],
      videos: Array.isArray(spot.videos) ? spot.videos : [],
      video_url: spot.video_url || "",
      reactionsCount: 0,
      commentsCount: 0,
      href: `/info/visitor/tourist-spots/${spot.id}`,
    })),
    ...(content.reposts || []).map((post) => {
      const meta =
        repostTypeMeta[post.original_content_type] || repostTypeMeta.user_post;
      return {
        id: `repost-${post.repost_id}`,
        repost_id: post.repost_id,
        reposted_by: post.reposted_by || post.user_id,
        original_content_id: post.original_content_id,
        original_content_type: post.original_content_type,
        type: meta.type,
        title: post.title,
        text: meta.text,
        date: post.created_at,
        media: post.featured_image || (post.images || [])[0] || "",
        images: Array.isArray(post.images) ? post.images : [],
        videos: Array.isArray(post.videos) ? post.videos : [],
        reactionsCount: 0,
        commentsCount: 0,
        href: `${meta.href}${post.original_content_id}`,
        isRepost: true,
        repostQuote: post.repost_quote,
        repost_quote: post.repost_quote,
        originalAuthor: post.original_author,
        original_post: post.original_post,
      };
    }),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = params?.id;
  const fromReactions = searchParams.get("from") === "reactions";
  const fromComments = searchParams.get("from") === "comments";

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [profileTab, setProfileTab] = useState("Overview");
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [viewerId, setViewerId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [followRequestPending, setFollowRequestPending] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportingProfile, setReportingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const menuRef = useRef(null);

  const showNotice = (text, tone = "success") => setNotice({ text, tone });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!profileId) return;

    const applyProfileResult = (profileResult) => {
      const currentViewerId = profileResult.viewer_id || null;
      const content = profileResult.content || {};
      setViewerId(currentViewerId);
      setProfile(profileResult.profile);
      setIsFollowing(Boolean(profileResult.is_following));
      setIsFollowedBy(Boolean(profileResult.is_followed_by));
      setIsMutual(Boolean(profileResult.is_mutual));
      setFollowRequestPending(Boolean(profileResult.follow_request_pending));
      setIsBlocked((profileResult.blocked_ids || []).includes(profileId));
      setFollowerCount(
        profileResult.followers_count ?? profileResult.followers?.length ?? 0,
      );
      setFollowingCount(
        profileResult.following_count ?? profileResult.following?.length ?? 0,
      );
      setFriendsCount(profileResult.friends_count ?? profileResult.friends?.length ?? 0);
      setPosts(buildPostList(content));
    };

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const storedSession = getStoredSessionObject();
        const currentViewerId =
          getAuthCookieFromDocument()?.user_id ||
          storedSession?.user_id ||
          storedSession?.id ||
          storedSession?.userId ||
          storedSession?.sub ||
          "anonymous";

        // The account owner keeps the private profile editor layout.
        if (currentViewerId === profileId) {
          router.replace("/info/user/profile");
          return;
        }

        const profileResponse = await fetch(`/info/api/users/${profileId}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const profileResult = await profileResponse.json();

        if (!profileResponse.ok || !profileResult.success) {
          setError(profileResult.message || "This profile could not be found.");
          return;
        }

        // Keep the account owner's profile on the same layout regardless of
        // whether it was opened from navigation, a post, or a notification.
        if (profileResult.viewer_id && profileResult.viewer_id === profileId) {
          router.replace("/info/user/profile");
          return;
        }

        applyProfileResult(profileResult);
      } catch (loadError) {
        console.error("Public profile load failed:", loadError);
        setError("Unable to load this profile right now.");
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [profileId, router, reloadKey]);

  const retryLoad = () => {
    invalidateCachePrefix("profile:user:");
    setError("");
    setLoading(true);
    setReloadKey((value) => value + 1);
  };

  const updatePublicRepost = async (post, action, quoteText) => {
    if (!post?.repost_id || post.reposted_by !== viewerId) return;

    const isNoteUpdate = action === "note";
    try {
      const response = await fetch(`/info/api/reposts/${encodeURIComponent(post.repost_id)}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        credentials: "same-origin",
        headers: action === "delete" ? undefined : { "Content-Type": "application/json" },
        body: action === "delete"
          ? undefined
          : JSON.stringify(isNoteUpdate ? { quoteText } : { status: "archived" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update this repost.");
      }

      invalidateCachePrefix("profile:user:");
      if (viewerId) invalidateCachePrefix(`feed:user:${viewerId}`);
      if (isNoteUpdate) {
        const nextQuote = result.repost?.quote_text ?? null;
        setPosts((previous) => previous.map((item) => item.repost_id === post.repost_id
          ? { ...item, repostQuote: nextQuote, repost_quote: nextQuote }
          : item));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("daet-repost-created", {
            detail: {
              action: "updated",
              repost: result.repost,
              original: post.original_post,
              contentType: post.original_content_type,
              contentId: post.original_content_id,
              userId: viewerId,
            },
          }));
        }
        showNotice("Repost note updated.");
        return;
      }

      setPosts((previous) => previous.filter((item) => item.repost_id !== post.repost_id));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("daet-repost-visibility-changed", {
          detail: { action, repost: result.repost },
        }));
      }
      showNotice(action === "delete" ? "Repost deleted." : "Repost archived.");
    } catch (repostError) {
      console.error("Public profile repost update failed:", repostError);
      showNotice(repostError?.message || "Unable to update this repost.", "error");
    }
  };

  const toggleFollow = async () => {
    if (!viewerId || viewerId === "anonymous") {
      showNotice("Please log in to follow this member.", "error");
      return;
    }

    setFollowLoading(true);
    try {
      const removingFollowOrRequest = isFollowing || followRequestPending;
      const response = await fetch(`/info/api/users/${profileId}/follow`, {
        method: removingFollowOrRequest ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            (isFollowing
              ? "Unable to unfollow this member."
              : "Unable to follow this member."),
        );
      }

      setIsFollowing(Boolean(result.is_following));
      setIsFollowedBy(Boolean(result.is_followed_by));
      setIsMutual(Boolean(result.is_mutual));
      setFollowRequestPending(Boolean(result.follow_request_pending));
      setFollowerCount(result.followers_count ?? 0);
      setFollowingCount(result.following_count ?? 0);
      setFriendsCount(result.friends_count ?? friendsCount);
      invalidateCachePrefix("profile:user:");
      if (viewerId) invalidateCachePrefix(`feed:user:${viewerId}`);
      if (!removingFollowOrRequest && result.is_following && typeof window !== "undefined") {
        window.dispatchEvent(new Event("daet-notifications-updated"));
      }
      showNotice(
        !removingFollowOrRequest && result.follow_request_pending
          ? `Your follow request was sent to ${profile?.full_name || "this member"}.`
          : followRequestPending && !result.follow_request_pending
            ? "Follow request cancelled."
            : isMutual
              ? `You are no longer friends with ${profile?.full_name || "this member"}.`
              : !isFollowing && result.is_mutual
            ? `You and ${profile?.full_name || "this member"} are now friends.`
            : isFollowing
          ? `You are no longer following ${profile?.full_name || "this member"}.`
          : `You are now following ${profile?.full_name || "this member"}.`,
      );
    } catch (followError) {
      console.error("Follow update failed:", followError?.message || followError);
      showNotice(
        followError?.message || "Unable to update your follow right now.",
        "error",
      );
    } finally {
      setFollowLoading(false);
    }
  };

  const toggleBlock = async () => {
    setMenuOpen(false);
    if (!viewerId || viewerId === "anonymous") {
      showNotice("Please log in to manage this member.", "error");
      return;
    }

    setBlockLoading(true);
    try {
      const response = await fetch(`/info/api/users/${profileId}/block`, {
        method: isBlocked ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to update this member.");
      }

      const nextBlocked = Boolean(result.blocked);
      setIsBlocked(nextBlocked);
      if (nextBlocked) {
        setIsFollowing(false);
        setIsMutual(false);
      }
      invalidateCachePrefix("profile:user:");
      if (viewerId) invalidateCachePrefix(`feed:user:${viewerId}`);
      showNotice(
        nextBlocked
          ? `${profile?.full_name || "This member"} is blocked. Their content is hidden from your feeds.`
          : `${profile?.full_name || "This member"} is unblocked.`,
      );
    } catch (blockError) {
      console.error("Block update failed:", blockError);
      showNotice(
        blockError?.message || "Unable to update this member right now.",
        "error",
      );
    } finally {
      setBlockLoading(false);
    }
  };

  const copyProfileLink = async () => {
    setMenuOpen(false);
    try {
      const url = typeof window === "undefined" ? "" : window.location.href;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const helper = document.createElement("textarea");
        helper.value = url;
        helper.setAttribute("readonly", "true");
        helper.style.position = "absolute";
        helper.style.left = "-9999px";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      showNotice("Profile link copied to your clipboard.");
    } catch (copyError) {
      console.error("Copy profile link failed:", copyError);
      showNotice(
        "Unable to copy the link. Please copy it from the address bar.",
        "error",
      );
    }
  };

  const shareProfile = async () => {
    setMenuOpen(false);
    const url = typeof window === "undefined" ? "" : window.location.href;
    const shareTitle = `${profile?.full_name || "Community member"} on Daet Connect`;

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url });
        return;
      }
      await copyProfileLink();
    } catch (shareError) {
      if (shareError?.name !== "AbortError") {
        console.error("Share profile failed:", shareError);
        showNotice("Unable to share this profile right now.", "error");
      }
    }
  };

  const reportProfile = async () => {
    setMenuOpen(false);
    if (!viewerId || viewerId === "anonymous") {
      showNotice("Please log in to report this account.", "error");
      return;
    }
    const reason = window.prompt("Why are you reporting this account?")?.trim();
    if (!reason) return;

    setReportingProfile(true);
    try {
      const response = await fetch("/info/api/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "account",
          reason,
          itemId: profileId,
          itemTable: "info_users",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to submit this account report.");
      }
      showNotice("Thank you. The account was reported for review.");
    } catch (reportError) {
      console.error("Account report submission failed:", reportError);
      showNotice(reportError?.message || "Unable to report this account right now.", "error");
    } finally {
      setReportingProfile(false);
    }
  };

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-profile min-h-screen text-slate-900">
        <UserTopHeader />
        <div className="usr-section-container mx-auto w-full max-w-5xl px-3 pb-24 pt-0 sm:px-4 lg:px-6 lg:pb-10">
          <SectionLoading label="Loading this community profile" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="tourism-shell usr-section-page usr-profile flex min-h-screen items-center justify-center p-6 text-slate-900">
        <div className="usr-empty-state max-w-xl">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {error || "Profile unavailable."}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Profiles can be private, removed, or temporarily unavailable.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={retryLoad} className="usr-section-secondary">
              Try again
            </button>
            <Link href="/info/visitor/search" className="usr-section-primary">
              Find other members
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const location =
    [profile.city, profile.country].filter(Boolean).join(", ") ||
    "Daet, Camarines Norte";
  const isOwnProfile = viewerId === profile.id;
  const displayName = profile.full_name || "Community member";
  const firstName = displayName.split(" ")[0];
  const visiblePosts = filterProfilePosts(posts, profileTab);
  const profileTabs = getProfileContentTabs(posts);

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen w-full overflow-x-clip text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto w-full max-w-5xl px-3 pb-24 pt-0 sm:px-4 lg:px-6 lg:pb-10">
        {(fromReactions || fromComments) && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={fromComments ? "Back to comments" : "Back to reactions"}
            title={fromComments ? "Back to comments" : "Back to reactions"}
            className="usr-section-secondary mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            {fromComments ? "Back to comments" : "Back to reactions"}
          </button>
        )}

        <section className="usr-enter mb-5">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-sky-800 via-cyan-800 to-slate-900 sm:h-56">
            {profile.cover_photo_url ? (
              <img
                src={profile.cover_photo_url}
                alt={`${displayName} cover`}
                className="profile-cover-image"
              />
            ) : null}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950/45 via-slate-950/10 to-transparent" />
          </div>

          <div className="profile-identity-strip border-b border-slate-200 px-3 pb-4 sm:px-5 sm:pb-5">
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 items-end gap-3">
                <div className="usr-profile-avatar -mt-14 flex shrink-0 items-center justify-center overflow-hidden sm:-mt-16">
                  {profile.profile_image_url ? (
                    <img
                      src={profile.profile_image_url}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(displayName)
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="flex flex-wrap items-center gap-1.5 break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    {displayName}
                    {profile.is_verified && <BadgeCheck aria-label="Verified account" className="h-5 w-5 shrink-0 fill-sky-600 text-white" />}
                  </h1>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-teal-700" />
                      {location}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 text-amber-500" />
                      Level {profile.level || 1} · {profile.points || 0} points
                    </span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {formatMemberSince(profile.created_at)}
                  </p>
                </div>
              </div>

              <div className="relative flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {isOwnProfile ? (
                  <>
                    <Link href="/info/user/profile" className="usr-section-secondary">
                      View my profile
                    </Link>
                    <Link href="/info/user/profile/edit" className="usr-section-primary">
                      Edit profile
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={followLoading || blockLoading}
                      className={isFollowing ? "usr-section-secondary" : "usr-section-primary"}
                    >
                      {isMutual ? <Users className="h-4 w-4" /> : isFollowing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                      {followLoading
                        ? "Updating…"
                        : isMutual
                          ? "Friends"
                          : followRequestPending
                            ? "Cancel request"
                          : isFollowing
                          ? "Following"
                          : isFollowedBy && !isMutual
                            ? "Follow back"
                            : "Follow"}
                    </button>
                    {(!profile.is_private || isFollowing) ? (
                      <Link
                        href={`/info/user/messaging/${encodeURIComponent(profile.id)}`}
                        className="usr-section-secondary"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Message
                      </Link>
                    ) : null}
                    <div className="relative" ref={menuRef}>
                      <button
                        type="button"
                        onClick={() => setMenuOpen((value) => !value)}
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label="More profile actions"
                        title="More actions"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-teal-700"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {menuOpen && (
                        <div
                          role="menu"
                          className="usr-pop-in absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={copyProfileLink}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Copy className="h-4 w-4" />
                            Copy profile link
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={shareProfile}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Share2 className="h-4 w-4" />
                            Share profile
                          </button>
                          {viewerId && viewerId !== "anonymous" ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void reportProfile()}
                              disabled={reportingProfile}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              <Flag className="h-4 w-4" />
                              {reportingProfile ? "Submitting report…" : "Report account"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={toggleBlock}
                            disabled={blockLoading}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-60 ${isBlocked ? "text-teal-700 hover:bg-teal-50" : "text-red-600 hover:bg-red-50"}`}
                          >
                            <ShieldOff className="h-4 w-4" />
                            {blockLoading
                              ? "Updating…"
                              : isBlocked
                                ? "Unblock this member"
                                : "Block this member"}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {notice ? (
              <p
                role="status"
                aria-live="polite"
                className={`usr-inline-note mt-4 ${notice.tone === "error" ? "usr-inline-note-error" : "usr-inline-note-success"}`}
              >
                {notice.text}
              </p>
            ) : null}
          </div>

          <div className="profile-stat-strip grid grid-cols-2 border-b border-slate-200 text-center sm:grid-cols-4">
            <div className="border-r border-slate-200 px-2 py-3">
              <p className="text-xl font-black text-slate-900">{posts.length}</p>
              <p className="usr-stat-label mt-0.5">Posts</p>
            </div>
            <Link
              href={`/info/user/profile/connections?user=${profile.id}&tab=followers`}
              className="border-r border-slate-200 px-2 py-3 transition hover:bg-sky-50"
            >
              <p className="text-xl font-black text-slate-900">{followerCount}</p>
              <p className="usr-stat-label mt-0.5">Followers</p>
            </Link>
            <Link
              href={`/info/user/profile/connections?user=${profile.id}&tab=friends`}
              className="border-r border-slate-200 px-2 py-3 transition hover:bg-sky-50"
            >
              <p className="text-xl font-black text-slate-900">{friendsCount}</p>
              <p className="usr-stat-label mt-0.5">Friends</p>
            </Link>
            <Link
              href={`/info/user/profile/connections?user=${profile.id}&tab=following`}
              className="px-2 py-3 transition hover:bg-sky-50"
            >
              <p className="text-xl font-black text-slate-900">{followingCount}</p>
              <p className="usr-stat-label mt-0.5">Following</p>
            </Link>
          </div>

          <div className="profile-content-layout px-3 py-4 sm:px-5 sm:py-5">
            <aside className="profile-content-sidebar">

        {isBlocked ? (
          <div className="usr-card usr-enter mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="usr-stat-icon" aria-hidden="true">
                <ShieldOff className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  You blocked {firstName}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Their content is hidden from your feed, search, and inbox while
                  the block is active.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleBlock}
              disabled={blockLoading}
              className="usr-section-secondary"
            >
              {blockLoading ? "Updating…" : "Unblock member"}
            </button>
          </div>
        ) : null}

            <section className="usr-card mb-5 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">About</p>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                  Level {profile.level || 1}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-700">
                {profile.bio ||
                  `Sharing local experiences and community discoveries from ${location}.`}
              </p>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span>{location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span>{followerCount} followers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  <span>{profile.points || 0} points</span>
                </div>
              </div>
            </section>

            </aside>

            <section className="profile-content-main min-w-0 space-y-4">
              {profile.is_private && !isFollowing ? (
                <div className="usr-card p-5">
                  <p className="text-sm font-bold text-slate-900">This account is private</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {followRequestPending
                      ? "Your follow request is waiting for approval. Posts, reposts, and messaging are only available to approved followers."
                      : "Follow this member to request access. Posts, reposts, and messaging are only available to approved followers."}
                  </p>
                </div>
              ) : (
                <>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Wall</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Shared content</h2>
                </div>
                {!isOwnProfile && (!profile.is_private || isFollowing) ? (
                  <Link
                    href={`/info/user/messaging/${encodeURIComponent(profile.id)}`}
                    className="usr-section-secondary min-w-0 flex-1 sm:flex-none"
                  >
                    <MessageCircle className="h-4 w-4" /> Send a message
                  </Link>
                ) : null}
              </div>

              <div className="profile-tabs" role="tablist" aria-label="Profile content">
                {profileTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={profileTab === tab}
                    onClick={() => setProfileTab(tab)}
                    className="profile-tab"
                  >
                    {tab}
                  </button>
                ))}
              </div>

          {profileTab === "Overview" ? (
            <div className="profile-overview">
              <section className="profile-overview-card profile-rewards-card">
                <div className="profile-overview-heading">
                  <div>
                    <p className="profile-overview-eyebrow">Community rewards</p>
                    <h3>Achievements</h3>
                  </div>
                  <Star aria-hidden="true" />
                </div>
                <div className="profile-reward-stats">
                  <div><strong>{Number(profile.points) || 0}</strong><span>Points</span></div>
                  <div><strong>Level {profile.level || 1}</strong><span>Current level</span></div>
                  <div><strong>{profile.earned_badges?.length || 0}</strong><span>Badges earned</span></div>
                </div>
                {profile.earned_badges?.length ? (
                  <div className="profile-badge-list">
                    {profile.earned_badges.slice(0, 4).map((badge) => (
                      <span key={badge.id} className="profile-badge-chip" title={badge.description || badge.badge_name}>
                        <Star aria-hidden="true" />
                        {badge.badge_name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="profile-overview-empty">No earned badges to display yet.</p>
                )}
              </section>

              <section className="profile-overview-card">
                <div className="profile-overview-heading">
                  <div>
                    <p className="profile-overview-eyebrow">Recent activity</p>
                    <h3>Community contributions</h3>
                  </div>
                  <Users aria-hidden="true" />
                </div>
                <div className="profile-contribution-grid">
                  {[
                    ["Posts", posts.filter((post) => post.type === "Post" && !post.isRepost).length, FileText],
                    ["Blogs", posts.filter((post) => post.type === "Blog" && !post.isRepost).length, Briefcase],
                    ["Forums", posts.filter((post) => post.type === "Forum" && !post.isRepost).length, MessageSquareText],
                    ["Places shared", posts.filter((post) => post.type === "Tourist Spot").length, MapPin],
                  ].map(([label, count, Icon]) => (
                    <div key={label} className="profile-contribution-stat">
                      <Icon aria-hidden="true" />
                      <strong>{count}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="profile-overview-caption">Counts reflect content currently available on this profile.</p>
              </section>

              <section className="profile-overview-card">
                <div className="profile-overview-heading">
                  <div>
                    <p className="profile-overview-eyebrow">Travel portfolio</p>
                    <h3>Destinations shared</h3>
                  </div>
                  <MapPin aria-hidden="true" />
                </div>
                {posts.some((post) => post.type === "Tourist Spot") ? (
                  <div className="profile-travel-preview">
                    {posts.filter((post) => post.type === "Tourist Spot").slice(0, 3).map((spot) => (
                      <Link key={spot.id} href={spot.href} className="profile-travel-item">
                        {spot.media ? <img src={spot.media} alt="" /> : <span className="profile-travel-placeholder"><MapPin aria-hidden="true" /></span>}
                        <span><strong>{spot.title}</strong><small>{spot.location || "Shared destination"}</small></span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="profile-overview-empty">No destination contributions to show. Visit tracking is not available on this profile.</p>
                )}
                {profileTabs.includes("Travel") ? (
                  <button type="button" className="profile-overview-link-button" onClick={() => setProfileTab("Travel")}>View travel contributions <span aria-hidden="true">→</span></button>
                ) : null}
              </section>
            </div>
          ) : null}

          {profileTab === "Travel" && !isBlocked ? (
            <section className="profile-travel-section">
              <div className="profile-overview-heading">
                <div>
                  <p className="profile-overview-eyebrow">Tourism contributions</p>
                  <h3>Destinations shared</h3>
                </div>
                <MapPin aria-hidden="true" />
              </div>
              {posts.filter((post) => post.type === "Tourist Spot").length ? (
                <div className="profile-travel-grid">
                  {posts.filter((post) => post.type === "Tourist Spot").map((spot) => (
                    <Link key={spot.id} href={spot.href} className="profile-travel-card">
                      {spot.media ? <img src={spot.media} alt="" /> : <span className="profile-travel-placeholder"><MapPin aria-hidden="true" /></span>}
                      <span className="profile-travel-card-copy">
                        <small>{spot.category}</small>
                        <strong>{spot.title}</strong>
                        <span>{spot.location || "Daet, Camarines Norte"}</span>
                      </span>
                      {spot.latitude != null && spot.longitude != null ? (
                        <span className="profile-travel-coordinates">
                          {Number(spot.latitude).toFixed(3)}, {Number(spot.longitude).toFixed(3)}
                          <a href={`https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`} target="_blank" rel="noreferrer">Map</a>
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="profile-overview-empty">No destinations shared yet. This profile does not infer visits from views.</p>
              )}
            </section>
          ) : null}

          {visiblePosts.length > 0 && !isBlocked ? (
            <div className="space-y-1.5">
              {visiblePosts.map((post) => {
                const mediaList = getPostImages(post);
                const videoList = getPostVideos(post);

                if (post.isRepost) {
                  return (
                    <article key={`${post.type}-${post.id}`} className="usr-card feed-card profile-repost-card">
                      <QuoteRepostCard
                        item={{ ...post, repost_quote: post.repost_quote ?? post.repostQuote, reposted_at: post.date, created_at: post.date }}
                        reposter={{ ...profile, full_name: displayName }}
                        reposterName={displayName}
                        userId={viewerId}
                        compactFeed
                        profileStyle
                        onEdit={(quoteText) => void updatePublicRepost(post, "note", quoteText)}
                        onRemoveNote={() => void updatePublicRepost(post, "note", null)}
                        onArchive={() => void updatePublicRepost(post, "archive")}
                        onDelete={() => void updatePublicRepost(post, "delete")}
                      />
                    </article>
                  );
                }

                return (
                  <article
                    key={`${post.type}-${post.id}`}
                    className="usr-card usr-content-card profile-post-card overflow-hidden"
                  >
                    <div className="profile-post-card-inner">
                    <div className="profile-post-header">
                      <span className="profile-post-avatar flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-50 text-xs font-black uppercase text-sky-700">
                        {profile.profile_image_url ? (
                          <img
                            src={profile.profile_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          getInitials(displayName)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                          <p className="truncate font-bold text-slate-900">
                            {displayName}
                          </p>
                          {profile.user_type === "admin" && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Verified organization" />}
                          <span aria-hidden="true">·</span>
                          <time className="text-slate-500" dateTime={post.date || undefined}>
                            {formatPostDate(post.date)}
                          </time>
                        </div>
                      </div>
                    </div>

                    {post.title ? (
                      <Link href={post.href} className="profile-post-title mt-4 block">
                        <h3>
                          {post.title}
                        </h3>
                      </Link>
                    ) : null}

                    {post.text ? (
                      <p className="profile-post-description line-clamp-3 break-words">
                        {getPostPreview(post.text)}
                      </p>
                    ) : null}

                    {profileTab !== "Videos" && mediaList.length ? (
                      <div className="mt-3 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100">
                        <PostMediaGallery images={mediaList} detailHref={post.href} />
                      </div>
                    ) : null}

                    {profileTab !== "Photos" ? videoList.map((url, index) => (
                      <video
                        key={`${url}-${index}`}
                        src={url}
                        controls
                        className="mt-3 aspect-[16/8.5] w-full rounded-[16px] object-cover"
                        preload="metadata"
                      />
                    )) : null}

                    <div className="profile-post-actions">
                      <ProfileFeedActions post={post} userId={viewerId} />
                    </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="usr-empty-state usr-pop-in m-4">
              <Sparkles className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-800">
                {isBlocked
                  ? "Content hidden while blocked"
                  : posts.length ? `No ${profileTab.toLowerCase()} to show` : "No published content yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isBlocked
                  ? `Unblock ${firstName} to see their stories, events, and discussions again.`
                  : posts.length ? `${firstName} has no ${profileTab.toLowerCase()} to show right now.` : `${firstName} has not shared a story, event, or discussion yet. Check back soon.`}
              </p>
            </div>
          )}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
