BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_comment_mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  muted_by UUID NOT NULL REFERENCES public.info_users(id) ON DELETE RESTRICT,
  muted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_comment_mutes_one_unlifted_per_user
  ON public.admin_comment_mutes(user_id)
  WHERE lifted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_comment_mutes_active_expiry
  ON public.admin_comment_mutes(user_id, expires_at)
  WHERE lifted_at IS NULL;

ALTER TABLE public.admin_comment_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_comment_mutes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_comment_mutes TO service_role;

CREATE OR REPLACE FUNCTION public.reject_muted_comment_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL
     OR public.is_admin(NEW.user_id)
     OR public.is_moderator(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.admin_comment_mutes
     WHERE user_id = NEW.user_id
       AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'This account is currently muted from commenting.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reject_muted_content_comment ON public.content_comments;
CREATE TRIGGER tr_reject_muted_content_comment
  BEFORE INSERT ON public.content_comments
  FOR EACH ROW EXECUTE FUNCTION public.reject_muted_comment_user();

DROP TRIGGER IF EXISTS tr_reject_muted_info_comment ON public.info_comments;
CREATE TRIGGER tr_reject_muted_info_comment
  BEFORE INSERT ON public.info_comments
  FOR EACH ROW EXECUTE FUNCTION public.reject_muted_comment_user();

DROP TRIGGER IF EXISTS tr_reject_muted_forum_reply ON public.forum_replies;
CREATE TRIGGER tr_reject_muted_forum_reply
  BEFORE INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.reject_muted_comment_user();

NOTIFY pgrst, 'reload schema';

COMMIT;
