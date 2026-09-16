"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  FileText,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import UserProfileLink from "@/app/components/user/UserProfileLink";
import ProfileFeedActions from "@/app/components/user/ProfileFeedActions";
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

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = params?.id;
  const fromReactions = searchParams.get("from") === "reactions";
  const fromComments = searchParams.get("from") === "comments";
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [viewerId, setViewerId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileId) return;

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const storedSession = getStoredSessionObject();
        const viewerId =
          getAuthCookieFromDocument()?.user_id ||
          storedSession?.user_id ||
          storedSession?.id ||
          storedSession?.userId ||
          storedSession?.sub ||
          "anonymous";
        if (viewerId === profileId) {
          router.replace("/user/profile");
          return;
        }
        const cacheKey = getCacheKey(
          "profile",
          "user",
          profileId,
          "viewer",
          viewerId,
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
            profileResult.viewer_id || viewerId,
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

    const applyProfileResult = (profileResult) => {
      const currentViewerId = profileResult.viewer_id || null;
      const content = profileResult.content || {};
      setViewerId(currentViewerId);
      setProfile(profileResult.profile);
      setIsFollowing(Boolean(profileResult.is_following));
      setIsFollowedBy(Boolean(profileResult.is_followed_by));
      setIsMutual(Boolean(profileResult.is_mutual));
      setFollowers(profileResult.followers || []);
      setFollowing(profileResult.following || []);
      setFollowerCount(
        profileResult.followers_count ?? profileResult.followers?.length ?? 0,
      );
      setFollowingCount(
        profileResult.following_count ?? profileResult.following?.length ?? 0,
      );
      setPosts(
        [
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
            const repostType = {
              blog: { type: "Blog", text: post.excerpt || post.content || "Shared a new story with the community.", href: `/user/blogs/${post.original_content_id}`, label: "Travel story" },
              forum_thread: { type: "Forum", text: post.content || "Started a community discussion.", href: `/user/forums/${post.original_content_id}`, label: "Discussion" },
              event: { type: "Event", text: post.description || "Shared a community event.", href: `/user/events/${post.original_content_id}`, label: "Event" },
              user_post: { type: "Post", text: post.content || "Shared a community post.", href: `/user/posts/${post.original_content_id}`, label: "Community post" },
            }[post.original_content_type] || { type: "Post", text: post.content || "Shared a community post.", href: `/user/posts/${post.original_content_id}`, label: "Community post" }
            return {
              id: `repost-${post.repost_id}`,
              repost_id: post.repost_id,
              reposted_by: post.reposted_by || post.user_id,
              original_content_id: post.original_content_id,
              original_content_type: post.original_content_type,
              type: repostType.type,
              title: post.title,
              text: repostType.text,
              date: post.created_at,
              media: post.featured_image || (post.images || [])[0] || "",
              images: Array.isArray(post.images) ? post.images : [],
              videos: Array.isArray(post.videos) ? post.videos : [],
            images: Array.isArray(post.images) ? post.images : [],
            videos: Array.isArray(post.videos) ? post.videos : [],
            images: Array.isArray(post.images) ? post.images : [],
            videos: Array.isArray(post.videos) ? post.videos : [],
            images: Array.isArray(post.images) ? post.images : [],
            videos: Array.isArray(post.videos) ? post.videos : [],
              reactionsCount: 0,
              commentsCount: 0,
              href: repostType.href,
              isRepost: true,
              repostQuote: post.repost_quote,
              originalAuthor: post.original_author,
              original_post: post.original_post,
            }
          }),
        ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
      );
    };

    void loadProfile();
  }, [profileId, router]);

  const toggleFollow = async () => {
    if (!viewerId) {
      alert("Please log in to follow this user.");
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        const response = await fetch(`/api/users/${profileId}/follow`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.message || "Unable to unfollow this user.");
        setIsFollowing(Boolean(result.is_following));
        setIsMutual(Boolean(result.is_mutual));
        setFollowerCount(result.followers_count ?? 0);
        setFollowingCount(result.following_count ?? 0);
        invalidateCachePrefix(`profile:user:${profileId}`);
        if (viewerId) invalidateCachePrefix(`feed:user:${viewerId}`);
      } else {
        const response = await fetch(`/api/users/${profileId}/follow`, {
          method: "POST",
          credentials: "same-origin",
        });
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.message || "Unable to follow this user.");
        setIsFollowing(Boolean(result.is_following));
        setIsFollowedBy(Boolean(result.is_followed_by));
        setIsMutual(Boolean(result.is_mutual));
        setFollowerCount(result.followers_count ?? 0);
        setFollowingCount(result.following_count ?? 0);
        invalidateCachePrefix(`profile:user:${profileId}`);
        invalidateCachePrefix(`feed:user:${viewerId}`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("daet-notifications-updated"));
        }
      }
    } catch (followError) {
      console.error(
        "Follow update failed:",
        followError?.message || followError,
      );
      alert(followError?.message || "Unable to update your follow right now.");
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4">
        <div className="mx-auto max-w-2xl animate-pulse rounded-[24px] bg-white p-6 shadow-sm">
          <div className="h-8 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-4 w-64 rounded bg-slate-200" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-slate-600">{error || "Profile unavailable."}</p>
        </div>
      </main>
    );
  }

  const location =
    [profile.city, profile.country].filter(Boolean).join(", ") ||
    "Daet, Camarines Norte";
  const isOwnProfile = viewerId === profile.id;
  const typeStyles = {
    Post: {
      icon: MessageCircle,
      tone: "bg-amber-50 text-amber-700",
      label: "Community post",
    },
    Blog: {
      icon: FileText,
      tone: "bg-sky-50 text-sky-700",
      label: "Travel story",
    },
    Forum: {
      icon: MessageCircle,
      tone: "bg-cyan-50 text-cyan-700",
      label: "Discussion",
    },
    Event: {
      icon: CalendarDays,
      tone: "bg-emerald-50 text-emerald-700",
      label: "Event",
    },
  };

  return (
    <main className="tourism-shell min-h-screen text-slate-900">
      <div className="mx-auto w-full max-w-[1280px] px-0 pb-24 sm:px-0 sm:pb-10 lg:px-6">
        {(fromReactions || fromComments) && (
          <div className="pt-3 sm:pt-5">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label={
                fromComments ? "Back to comments" : "Back to reactions"
              }
              title={fromComments ? "Back to comments" : "Back to reactions"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        <section className="tourism-panel overflow-hidden rounded-[22px]">
          <div className="profile-cover-frame h-40 bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 sm:h-56">
            {profile.cover_photo_url && (
              <img
                src={profile.cover_photo_url}
                alt={`${profile.full_name || "User"} cover`}
                className="profile-cover-image"
              />
            )}
            <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.35),_transparent_28%),linear-gradient(135deg,_rgba(2,6,23,0.12),_rgba(15,23,42,0.35))]" />
          </div>
          <div className="border-b border-slate-200 px-4 pb-4 sm:px-7 sm:pb-5">
            <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 items-end gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-sky-100 text-2xl font-black text-sky-700 shadow-lg sm:h-24 sm:w-24">
                  {profile.profile_image_url ? (
                    <img
                      src={profile.profile_image_url}
                      alt={profile.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(profile.full_name)
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <h1 className="break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                    {profile.full_name || "Community member"}
                  </h1>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-4 w-4 text-sky-600" />
                    {location}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOwnProfile ? (
                  <Link
                    href="/user/blogs/new"
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-100"
                  >
                    Create post
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={toggleFollow}
                      disabled={followLoading}
                      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-black transition ${isFollowing ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-sky-600 text-white shadow-sm hover:bg-sky-700"} disabled:opacity-60`}
                    >
                      {isFollowing ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      {followLoading
                        ? "Updating..."
                        : isFollowing
                          ? "Following"
                          : isFollowedBy && !isMutual
                            ? "Follow Back"
                            : "Follow"}
                    </button>
                    {isMutual && (
                      <Link
                        href={`/user/messaging/${encodeURIComponent(profile.id)}`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Message
                      </Link>
                    )}
                  </>
                )}
                <Link
                  href="/user/settings"
                  aria-label="Open profile settings"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#dfe7e1] bg-[#fffefa] text-center">
            <div className="border-r border-slate-200 px-2 py-3">
              <p className="text-lg font-black text-slate-900">
                {posts.length}
              </p>
              <p className="text-[11px] text-slate-500">Posts</p>
            </div>
            <Link
              href={`/user/profile/connections?user=${profile.id}&tab=followers`}
              className="border-r border-slate-200 px-2 py-3 hover:bg-slate-50"
            >
              <p className="text-lg font-black text-slate-900">
                {followerCount}
              </p>
              <p className="text-[11px] text-slate-500">Followers</p>
            </Link>
            <Link
              href={`/user/profile/connections?user=${profile.id}&tab=following`}
              className="px-2 py-3 hover:bg-slate-50"
            >
              <p className="text-lg font-black text-slate-900">
                {followingCount}
              </p>
              <p className="text-[11px] text-slate-500">Following</p>
            </Link>
          </div>

          <div className="p-0">
            <section className="mb-5 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                About
              </p>
              <p className="max-w-3xl text-sm leading-6 text-slate-700">
                {profile.bio ||
                  "Sharing local experiences and community discoveries."}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {location}
                </span>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  {profile.points || 0} points
                </span>
              </div>
            </section>
          </div>
        </section>

        <div className="mt-3">
          <section className="min-w-0 rounded-[16px] border border-slate-200 bg-white px-0 py-4 sm:py-5">
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="pl-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
                  Wall
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  Shared content{" "}
                  <span className="ml-1 text-xs font-bold text-slate-400">
                    {posts.length}
                  </span>
                </h2>
              </div>
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                <Link
                  href="/user/blogs/new"
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 sm:flex-none"
                >
                  <FileText className="h-4 w-4" /> Write blog
                </Link>
                <Link
                  href="/user/forums"
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 sm:flex-none"
                >
                  <MessageCircle className="h-4 w-4" /> Start forum
                </Link>
              </div>
            </div>
            {posts.length ? (
              <div className="space-y-0">
                {posts.map((post) => {
                  return (
                    <article
                      key={`${post.type}-${post.id}`}
                      className={`tourism-panel feed-card overflow-hidden rounded-[22px] border border-slate-200 bg-white lg:rounded-[16px] ${post.type === "Blog" ? "border-l-4 border-l-violet-300 bg-violet-50/30" : post.type === "Forum" ? "border-l-4 border-l-emerald-300 bg-emerald-50/40" : post.type === "Event" ? "border-l-4 border-l-amber-200 bg-amber-50/30" : "border-l-4 border-l-slate-200"}`}
                    >
                      <div className="p-4 sm:p-5 lg:p-6">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-black uppercase text-sky-700 lg:h-12 lg:w-12">
                          {profile.profile_image_url ? (
                            <img
                              src={profile.profile_image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(profile.full_name)
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900 lg:text-sm">
                            {post.isRepost ? `${profile.full_name} 🔄 reposted` : profile.full_name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700"><span>{post.isRepost ? "Repost" : post.type}</span>{post.type === "Blog" && <span className="text-[10px] font-medium normal-case tracking-normal text-slate-500">Travel story</span>}</div>
                        </div>
                        <time className="shrink-0 text-xs text-slate-500">
                          {post.date
                            ? new Date(post.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Recently"}
                        </time>
                      </div>
                      {post.isRepost && post.repostQuote && (
                        <p className="mb-3 text-[13px] leading-6 text-slate-700">
                          {post.repostQuote}
                        </p>
                      )}
                      {post.isRepost && (
                        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">Originally shared by</span>
                          <span>{post.originalAuthor?.full_name || "Community member"}</span>
                        </div>
                      )}
                      <Link href={post.href} className="block w-full pl-0 text-left"><h3 className="m-0 text-left text-base font-bold leading-6 text-slate-900 hover:text-sky-700">
                        {post.title || "Untitled community update"}
                      </h3></Link>
                      <p className="mt-2 text-[13px] leading-6 text-slate-600">
                        {post.text}
                      </p>
                      {(post.images?.length > 0 || post.videos?.length > 0 || post.media) && <div className="mt-4 grid gap-1 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100 lg:mt-5 lg:rounded-[18px] sm:grid-cols-2">
                        {(post.images?.length ? post.images : (post.media ? [post.media] : [])).map((url, index) => <Link key={`${url}-${index}`} href={post.href} className="block"><img src={url} alt={`${post.title || 'Post'} ${index + 1}`} className="aspect-[16/8.5] w-full object-cover transition hover:brightness-95" /></Link>)}
                        {(post.videos || []).map((url, index) => <video key={`${url}-${index}`} src={url} controls className="aspect-[16/8.5] w-full object-cover" preload="metadata" />)}
                      </div>}
                      <ProfileFeedActions post={post} userId={viewerId} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No published content yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
