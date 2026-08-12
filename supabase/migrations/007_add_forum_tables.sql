-- ============================================================================
-- Forum tables for Admin-managed forum
-- ============================================================================

-- Threads
CREATE TABLE IF NOT EXISTS public.forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reply_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'published' CHECK (status IN ('published','closed','archived'))
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_created_at ON public.forum_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_threads_last_activity ON public.forum_threads(last_activity_at DESC);

-- Replies
CREATE TABLE IF NOT EXISTS public.forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_moderator_reply BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id ON public.forum_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created_at ON public.forum_replies(created_at DESC);

-- Trigger to update thread reply_count and last_activity
CREATE OR REPLACE FUNCTION public.update_thread_activity() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.forum_threads SET reply_count = reply_count + 1, last_activity_at = NEW.created_at WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.forum_threads SET reply_count = GREATEST(0, reply_count - 1), last_activity_at = NOW() WHERE id = OLD.thread_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE public.forum_threads SET last_activity_at = NEW.updated_at WHERE id = NEW.thread_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forum_reply_activity
AFTER INSERT OR DELETE OR UPDATE ON public.forum_replies
FOR EACH ROW EXECUTE FUNCTION public.update_thread_activity();

-- RLS: allow admins and moderators to manage forum
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_threads_select" ON public.forum_threads FOR SELECT USING (status = 'published' OR is_admin(auth.uid()) OR auth.uid()::text = created_by::text);
CREATE POLICY "forum_threads_insert" ON public.forum_threads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "forum_threads_update" ON public.forum_threads FOR UPDATE USING (is_admin(auth.uid()) OR auth.uid()::text = created_by::text) WITH CHECK (is_admin(auth.uid()) OR auth.uid()::text = created_by::text);
CREATE POLICY "forum_threads_delete" ON public.forum_threads FOR DELETE USING (is_admin(auth.uid()));

CREATE POLICY "forum_replies_select" ON public.forum_replies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "forum_replies_insert" ON public.forum_replies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid()::text = user_id::text);
CREATE POLICY "forum_replies_update" ON public.forum_replies FOR UPDATE USING (is_admin(auth.uid()) OR auth.uid()::text = user_id::text) WITH CHECK (is_admin(auth.uid()) OR auth.uid()::text = user_id::text);
CREATE POLICY "forum_replies_delete" ON public.forum_replies FOR DELETE USING (is_admin(auth.uid()) OR auth.uid()::text = user_id::text);

GRANT ALL ON public.forum_threads TO authenticated, service_role;
GRANT ALL ON public.forum_replies TO authenticated, service_role;
