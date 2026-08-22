BEGIN;

-- ============================================================
-- Reactions System
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'amenity', 'forum_thread', 'forum_reply', 'comment', 'announcement', 'user_post', 'rating', 'poll')),
  content_id UUID NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love', 'laugh', 'wow', 'sad', 'angry')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reactions_content ON public.content_reactions(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_reactions_user ON public.content_reactions(user_id);

-- ============================================================
-- Comment System (threaded, with reactions)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'amenity', 'forum_thread', 'forum_reply', 'announcement', 'user_post', 'rating', 'poll')),
  content_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.content_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  gif_url TEXT,
  sticker_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_best_answer BOOLEAN NOT NULL DEFAULT FALSE,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_comments_content ON public.content_comments(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_comments_parent ON public.content_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_content_comments_pinned ON public.content_comments(content_type, content_id, is_pinned DESC);
CREATE INDEX IF NOT EXISTS idx_content_comments_created ON public.content_comments(created_at DESC);

-- Comment reactions (reuse content_reactions with content_type='comment')
-- ============================================================
-- Mentions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentioned_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  mentioned_by_user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'forum_thread', 'comment', 'user_post')),
  content_id UUID NOT NULL,
  mention_text TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentioned_user_id, content_type, content_id, mentioned_by_user_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON public.mentions(mentioned_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_mentions_content ON public.mentions(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_mentions_by_user ON public.mentions(mentioned_by_user_id);

-- ============================================================
-- Hashtags
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  is_branded BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hashtags_trending ON public.hashtags(is_trending, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON public.hashtags(name);

CREATE TABLE IF NOT EXISTS public.content_hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'forum_thread', 'comment', 'user_post')),
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hashtag_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_hashtags_content ON public.content_hashtags(content_type, content_id);

CREATE TABLE IF NOT EXISTS public.hashtag_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_follows_user ON public.hashtag_follows(user_id);

-- ============================================================
-- Repost / Share
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'amenity', 'forum_thread', 'announcement', 'user_post')),
  content_id UUID NOT NULL,
  share_type TEXT NOT NULL DEFAULT 'repost' CHECK (share_type IN ('repost', 'quote', 'dm', 'external')),
  caption TEXT,
  recipient_user_id UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_shares_content ON public.content_shares(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_shares_user ON public.content_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_content_shares_recipient ON public.content_shares(recipient_user_id);

CREATE TABLE IF NOT EXISTS public.reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  original_content_type TEXT NOT NULL CHECK (original_content_type IN ('blog', 'event', 'amenity', 'forum_thread', 'announcement', 'user_post')),
  original_content_id UUID NOT NULL,
  quote_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, original_content_type, original_content_id)
);

CREATE INDEX IF NOT EXISTS idx_reposts_original ON public.reposts(original_content_type, original_content_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user ON public.reposts(user_id);

-- ============================================================
-- Polls & Questions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'event', 'forum_thread', 'user_post')),
  content_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (poll_type IN ('multiple_choice', 'open_ended', 'quiz')),
  options JSONB DEFAULT '[]',
  correct_option_index INTEGER,
  results_visibility TEXT NOT NULL DEFAULT 'after_vote' CHECK (results_visibility IN ('immediate', 'after_vote', 'hidden')),
  duration_hours INTEGER NOT NULL DEFAULT 168,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  total_votes INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_polls_content ON public.content_polls(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_polls_active ON public.content_polls(is_active, ends_at);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.content_polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  selected_option_index INTEGER,
  answer_text TEXT,
  is_correct BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);

-- ============================================================
-- User Polls & Ratings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attraction_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  attraction_type TEXT NOT NULL CHECK (attraction_type IN ('tourist_spot', 'amenity', 'event')),
  attraction_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, attraction_type, attraction_id)
);

CREATE INDEX IF NOT EXISTS idx_attraction_ratings_attraction ON public.attraction_ratings(attraction_type, attraction_id);

CREATE TABLE IF NOT EXISTS public.review_helpfulness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_type TEXT NOT NULL CHECK (review_type IN ('attraction_rating', 'comment')),
  review_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  is_helpful BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_type, review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_helpfulness_review ON public.review_helpfulness(review_type, review_id);

CREATE TABLE IF NOT EXISTS public.user_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL DEFAULT '{}',
  category TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  total_votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_polls_created ON public.user_polls(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.user_polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  selected_option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_poll_votes_poll ON public.user_poll_votes(poll_id);

-- ============================================================
-- Share analytics counter
-- ============================================================

CREATE TABLE IF NOT EXISTS public.share_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  platform TEXT NOT NULL,
  share_count INTEGER NOT NULL DEFAULT 0,
  last_shared_at TIMESTAMPTZ,
  UNIQUE (content_type, content_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_share_analytics_content ON public.share_analytics(content_type, content_id);

-- ============================================================
-- RLS Policies for new tables
-- ============================================================

ALTER TABLE public.content_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attraction_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_helpfulness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_analytics ENABLE ROW LEVEL SECURITY;

-- content_reactions policies
CREATE POLICY "content_reactions_select_all" ON public.content_reactions FOR SELECT USING (true);
CREATE POLICY "content_reactions_insert_own" ON public.content_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "content_reactions_delete_own" ON public.content_reactions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "content_reactions_update_own" ON public.content_reactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- content_comments policies
CREATE POLICY "content_comments_select_all" ON public.content_comments FOR SELECT USING (status = 'active' OR auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "content_comments_insert_own" ON public.content_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "content_comments_update_own_or_admin" ON public.content_comments FOR UPDATE USING (auth.uid() = user_id OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "content_comments_delete_own_or_admin" ON public.content_comments FOR DELETE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- mentions policies
CREATE POLICY "mentions_select_own" ON public.mentions FOR SELECT USING (auth.uid() = mentioned_user_id OR auth.uid() = mentioned_by_user_id OR public.is_admin(auth.uid()));
CREATE POLICY "mentions_insert_own" ON public.mentions FOR INSERT WITH CHECK (auth.uid() = mentioned_by_user_id);
CREATE POLICY "mentions_update_own" ON public.mentions FOR UPDATE USING (auth.uid() = mentioned_user_id OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = mentioned_user_id OR public.is_admin(auth.uid()));

-- hashtags policies
CREATE POLICY "hashtags_select_all" ON public.hashtags FOR SELECT USING (true);
CREATE POLICY "hashtags_manage_admin" ON public.hashtags FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- content_hashtags policies
CREATE POLICY "content_hashtags_select_all" ON public.content_hashtags FOR SELECT USING (true);
CREATE POLICY "content_hashtags_insert_auth" ON public.content_hashtags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "content_hashtags_delete_auth" ON public.content_hashtags FOR DELETE USING (auth.uid() IS NOT NULL);

-- hashtag_follows policies
CREATE POLICY "hashtag_follows_select_own" ON public.hashtag_follows FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "hashtag_follows_insert_own" ON public.hashtag_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hashtag_follows_delete_own" ON public.hashtag_follows FOR DELETE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- content_shares policies
CREATE POLICY "content_shares_select_all" ON public.content_shares FOR SELECT USING (true);
CREATE POLICY "content_shares_insert_own" ON public.content_shares FOR INSERT WITH CHECK (auth.uid() = user_id);

-- reposts policies
CREATE POLICY "reposts_select_all" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "reposts_insert_own" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reposts_delete_own" ON public.reposts FOR DELETE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- content_polls policies
CREATE POLICY "content_polls_select_all" ON public.content_polls FOR SELECT USING (true);
CREATE POLICY "content_polls_insert_own" ON public.content_polls FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "content_polls_update_own_or_admin" ON public.content_polls FOR UPDATE USING (auth.uid() = created_by OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- poll_votes policies
CREATE POLICY "poll_votes_select_all" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "poll_votes_insert_own" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- attraction_ratings policies
CREATE POLICY "attraction_ratings_select_all" ON public.attraction_ratings FOR SELECT USING (true);
CREATE POLICY "attraction_ratings_insert_own" ON public.attraction_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attraction_ratings_update_own" ON public.attraction_ratings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- review_helpfulness policies
CREATE POLICY "review_helpfulness_select_all" ON public.review_helpfulness FOR SELECT USING (true);
CREATE POLICY "review_helpfulness_insert_own" ON public.review_helpfulness FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "review_helpfulness_delete_own" ON public.review_helpfulness FOR DELETE USING (auth.uid() = user_id);

-- user_polls policies
CREATE POLICY "user_polls_select_all" ON public.user_polls FOR SELECT USING (true);
CREATE POLICY "user_polls_insert_own" ON public.user_polls FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "user_polls_update_own_or_admin" ON public.user_polls FOR UPDATE USING (auth.uid() = created_by OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = created_by OR public.is_admin(auth.uid()));

-- user_poll_votes policies
CREATE POLICY "user_poll_votes_select_all" ON public.user_poll_votes FOR SELECT USING (true);
CREATE POLICY "user_poll_votes_insert_own" ON public.user_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- share_analytics policies
CREATE POLICY "share_analytics_select_all" ON public.share_analytics FOR SELECT USING (true);
CREATE POLICY "share_analytics_upsert_auth" ON public.share_analytics FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER tr_content_comments_updated_at
BEFORE UPDATE ON public.content_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_content_reactions_updated_at
BEFORE UPDATE ON public.content_reactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_attraction_ratings_updated_at
BEFORE UPDATE ON public.attraction_ratings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tr_content_polls_updated_at
BEFORE UPDATE ON public.content_polls
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Function to update hashtag usage count
CREATE OR REPLACE FUNCTION public.update_hashtag_usage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.hashtags
    SET usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = NEW.hashtag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.hashtags
    SET usage_count = GREATEST(usage_count - 1, 0)
    WHERE id = OLD.hashtag_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_content_hashtags_usage
AFTER INSERT OR DELETE ON public.content_hashtags
FOR EACH ROW EXECUTE FUNCTION public.update_hashtag_usage();

-- Function to check poll expiry
CREATE OR REPLACE FUNCTION public.check_poll_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at < NOW() THEN
    NEW.is_active = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_content_polls_expiry
BEFORE INSERT OR UPDATE ON public.content_polls
FOR EACH ROW EXECUTE FUNCTION public.check_poll_expiry();

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_reactions, public.content_comments, public.mentions, public.content_hashtags, public.hashtag_follows, public.content_shares, public.reposts, public.poll_votes, public.attraction_ratings, public.review_helpfulness, public.user_poll_votes, public.share_analytics TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hashtags, public.content_polls, public.user_polls TO authenticated;

COMMIT;