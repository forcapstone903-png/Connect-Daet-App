"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Copy,
  FileText,
  MessageCircle,
  MapPin,
  MoreHorizontal,
  Share2,
  ShieldOff,
  Sparkles,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import ProfileFeedActions from "@/app/components/user/ProfileFeedActions";
import UserTopHeader from "@/app/components/user/UserTopHeader";
import {
  SectionLoading,
  SectionStats,
} from "@/app/components/user/UserSectionHeader";
import {
  getAuthCookieFromDocument,
  getStoredSessionObject,
} from "@/lib/authCookies";
import {
  getCache,
  getCacheKey,
  invalidateCachePrefix,
  setCache,
} from "@/lib/cache";

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

// Visual identity per content type, matched to the dashboard feed badges.
const TYPE_META = {
  Post: {
    icon: MessageCircle,
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    label: "Community post",
  },
  Blog: {
    icon: FileText,
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    label: "Travel story",
  },
  Forum: {
    icon: MessageCircle,
    chip: "border-cyan-200 bg-cyan-50 text-cyan-700",
    label: "Discussion",
  },
  Event: {
    icon: CalendarDays,
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Event",
  },
};

const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.Post;

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
    year: "numeric",
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
      href: `/user/blogs/`,
      label: "Travel story",
    },
    forum_thread: {
      type: "Forum",
      text: "Started a community discussion.",
      href: `/user/forums/`,
      label: "Discussion",
    },
    event: {
      type: "Event",
      text: "Shared an upcoming community event.",
      href: `/user/events/`,
      label: "Event",
    },
    user_post: {
      type: "Post",
      text: "Shared a community post.",
      href: `/user/posts/`,
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
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/user/posts/${post.id}`,
    })),
    ...(content.blogs || []).map((post) => ({
      id: post.id,
      type: "Blog",
      title: post.title,
      text: post.excerpt || "Shared a new story with the community.",
      date: post.published_at || post.created_at,
      media: post.featured_image || (post.images || [])[0] || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/user/blogs/${post.id}`,
    })),
    ...(content.threads || []).map((post) => ({
      id: post.id,
      type: "Forum",
      title: post.title,
      text: post.content || "Started a community discussion.",
      date: post.created_at,
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/user/forums/${post.id}`,
    })),
    ...(content.events || []).map((post) => ({
      id: post.id,
      type: "Event",
      title: post.title,
      text: post.description || "Shared a community event.",
      date: post.start_date || post.created_at,
      media: post.featured_image || (post.images || [])[0] || "",
      reactionsCount: post.reactions_count || 0,
      commentsCount: post.comments_count || 0,
      href: `/user/events/${post.id}`,
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
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [viewerId, setViewerId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
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
      setIsBlocked((profileResult.blocked_ids || []).includes(profileId));
      setFollowerCount(
        profileResult.followers_count ?? profileResult.followers?.length ?? 0,
      );
      setFollowingCount(
        profileResult.following_count ?? profileResult.following?.length ?? 0,
      );
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
          router.replace("/user/profile");
          return;
        }

        const cacheKey = getCacheKey(
          "profile",
          "user",
          profileId,
          "viewer",
          currentViewerId,
        );
        const cachedProfile = getCache(cacheKey)?.data;
        if (cachedProfile) {
          if (cachedProfile.viewer_id === profileId) {
            router.replace("/user/profile");
            return;
          }
          applyProfileResult(cachedProfile);
          setLoading(false);
          return;
        }

        const profileResponse = await fetch(`/api/users/${profileId}`, {
          credentials: "same-origin",
        });
        const profileResult = await profileResponse.json();

        if (!profileResponse.ok || !profileResult.success) {
          setError(profileResult.message || "This profile could not be found.");
          return;
        }

        // Keep the account owner's profile on the same layout regardless of
        // whether it was opened from navigation, a post, or a notification.
        if (profileResult.viewer_id && profileResult.viewer_id === profileId) {
          router.replace("/user/profile");
          return;
        }

        setCache(
          getCacheKey(
            "profile",
            "user",
            profileId,
            "viewer",
            profileResult.viewer_id || currentViewerId,
          ),
          profileResult,
          PROFILE_CACHE_TTL_MS,
        );
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

  const toggleFollow = async () => {
    if (!viewerId || viewerId === "anonymous") {
      showNotice("Please log in to follow this member.", "error");
      return;
    }

    setFollowLoading(true);
    try {
      const response = await fetch(`/api/users/${profileId}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
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
      setFollowerCount(result.followers_count ?? 0);
      setFollowingCount(result.following_count ?? 0);
      invalidateCachePrefix(`profile:user:${profileId}`);
      if (viewerId) invalidateCachePrefix(`feed:user:${viewerId}`);
      if (!isFollowing && typeof window !== "undefined") {
        window.dispatchEvent(new Event("daet-notifications-updated"));
      }
      showNotice(
        isFollowing
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
      const response = await fetch(`/api/users/${profileId}/block`, {
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
      invalidateCachePrefix(`profile:user:${profileId}`);
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

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-profile min-h-screen text-slate-900">
        <UserTopHeader />
        <div className="usr-section-container mx-auto w-full max-w-5xl px-3 pb-24 pt-2 sm:px-4 lg:px-6 lg:pb-10">
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
            <Link href="/search" className="usr-section-primary">
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

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen w-full overflow-x-clip text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto w-full max-w-5xl px-3 pb-24 pt-2 sm:px-4 lg:px-6 lg:pb-10">
        {(fromReactions || fromComments) && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={fromComments ? "Back to comments" : "Back to reactions"}
            title={fromComments ? "Back to comments" : "Back to reactions"}
            className="usr-section-secondary mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {fromComments ? "Back to comments" : "Back to reactions"}
          </button>
        )}

        <section className="usr-surface usr-enter mb-5 overflow-hidden">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-teal-700 via-cyan-700 to-emerald-600 sm:h-56">
            {profile.cover_photo_url ? (
              <img
                src={profile.cover_photo_url}
                alt={`${displayName} cover`}
                className="profile-cover-image"
              />
            ) : null}
            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_28%),linear-gradient(135deg,_rgba(2,6,23,0.12),_rgba(15,23,42,0.35))]" />
          </div>

          <div className="border-b border-slate-200 bg-white px-3 pb-5 sm:px-5">
            <div className="flex flex-col gap-4 pt-4 lg:flex-row lg:items-end lg:justify-between">
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
                  <h1 className="break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    {displayName}
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

              <div className="relative flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                {isOwnProfile ? (
                  <>
                    <Link href="/user/profile" className="usr-section-secondary">
                      View my profile
                    </Link>
                    <Link href="/user/profile/edit" className="usr-section-primary">
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
                      {isFollowing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                      {followLoading
                        ? "Updating…"
                        : isFollowing
                          ? "Following"
                          : isFollowedBy && !isMutual
                            ? "Follow back"
                            : "Follow"}
                    </button>
                    <Link
                      href={`/user/messaging/${encodeURIComponent(profile.id)}`}
                      className="usr-section-secondary"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Message
                    </Link>
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
        </section>

        <SectionStats
          className="mb-5"
          items={[
            { label: "Shared content", value: posts.length, icon: FileText, tone: "usr-tone-sky" },
            {
              label: "Followers",
              value: followerCount,
              icon: Users,
              tone: "usr-tone-violet",
              href: `/user/profile/connections?user=${profile.id}&tab=followers`,
            },
            {
              label: "Following",
              value: followingCount,
              icon: UserPlus,
              tone: "usr-tone-emerald",
              href: `/user/profile/connections?user=${profile.id}&tab=following`,
            },
            {
              label: "Points",
              value: profile.points || 0,
              icon: Star,
              tone: "usr-tone-amber",
              hint: `Level ${profile.level || 1}`,
            },
          ]}
        />

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

        <section className="usr-card usr-enter mb-5 p-4 sm:p-5">
          <p className="usr-section-eyebrow">About</p>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
            {profile.bio ||
              `Sharing local experiences and community discoveries from ${location}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-teal-700" />
              {location}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Level {profile.level || 1}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              <Users className="h-3.5 w-3.5 text-violet-500" />
              {followerCount} followers
            </span>
          </div>
        </section>

        <section className="usr-card usr-enter overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="usr-section-eyebrow">Wall</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">
                Shared content{" "}
                <span className="ml-1 text-xs font-bold text-slate-400">
                  {posts.length}
                </span>
              </h2>
            </div>
            {isOwnProfile ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/user/blogs/new" className="usr-section-secondary">
                  <FileText className="h-4 w-4" />
                  Write a story
                </Link>
                <Link href="/user/forums" className="usr-section-primary">
                  <MessageCircle className="h-4 w-4" />
                  Start a discussion
                </Link>
              </div>
            ) : (
              <Link
                href={`/user/messaging/${encodeURIComponent(profile.id)}`}
                className="usr-section-secondary"
              >
                <MessageCircle className="h-4 w-4" />
                Send a message
              </Link>
            )}
          </div>

          {posts.length > 0 && !isBlocked ? (
            <div className="usr-stagger space-y-3 p-3 sm:p-4">
              {posts.map((post) => {
                const typeMeta = getTypeMeta(post.type);
                const TypeIcon = typeMeta.icon;
                const mediaList = post.images?.length
                  ? post.images
                  : post.media
                    ? [post.media]
                    : [];

                return (
                  <article
                    key={`${post.type}-${post.id}`}
                    className="usr-card usr-content-card p-4 sm:p-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-xs font-black text-teal-700">
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
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {post.isRepost ? `${displayName} reposted` : displayName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${typeMeta.chip}`}
                          >
                            <TypeIcon className="h-3 w-3" />
                            {post.isRepost ? "Repost" : typeMeta.label}
                          </span>
                          <time
                            className="text-xs text-slate-500"
                            dateTime={post.date || undefined}
                          >
                            {formatPostDate(post.date)}
                          </time>
                        </div>
                      </div>
                    </div>

                    {post.isRepost && post.repostQuote ? (
                      <p className="mt-3 border-l-2 border-teal-200 pl-3 text-[13px] leading-6 text-slate-700">
                        {post.repostQuote}
                      </p>
                    ) : null}

                    {post.isRepost && post.originalAuthor ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Originally shared by{" "}
                        <span className="font-bold text-slate-700">
                          {post.originalAuthor.full_name || "Community member"}
                        </span>
                      </p>
                    ) : null}

                    {post.title ? (
                      <Link href={post.href} className="mt-3 block">
                        <h3 className="text-base font-bold leading-6 text-slate-900 transition hover:text-teal-700">
                          {post.title}
                        </h3>
                      </Link>
                    ) : null}

                    {post.text ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                        {post.text}
                      </p>
                    ) : null}

                    {mediaList.length ? (
                      <Link
                        href={post.href}
                        className="mt-3 block overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={mediaList[0]}
                          alt={post.title || "Shared media"}
                          className="aspect-[16/8.5] w-full object-cover transition hover:brightness-95"
                        />
                      </Link>
                    ) : null}

                    {post.videos?.length ? (
                      <video
                        src={post.videos[0]}
                        controls
                        className="mt-3 aspect-[16/8.5] w-full rounded-[16px] object-cover"
                        preload="metadata"
                      />
                    ) : null}

                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <ProfileFeedActions post={post} userId={viewerId} />
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
                  : "No published content yet"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isBlocked
                  ? `Unblock ${firstName} to see their stories, events, and discussions again.`
                  : `${firstName} has not shared a story, event, or discussion yet. Check back soon.`}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

