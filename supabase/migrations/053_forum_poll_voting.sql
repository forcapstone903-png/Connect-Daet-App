BEGIN;

ALTER TABLE public.content_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_polls_select_authenticated ON public.content_polls;
CREATE POLICY content_polls_select_authenticated
  ON public.content_polls FOR SELECT
  USING (is_active = TRUE OR auth.uid() = created_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS content_polls_insert_own ON public.content_polls;
CREATE POLICY content_polls_insert_own
  ON public.content_polls FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS poll_votes_select_authenticated ON public.poll_votes;
CREATE POLICY poll_votes_select_authenticated
  ON public.poll_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS poll_votes_insert_own ON public.poll_votes;
CREATE POLICY poll_votes_insert_own
  ON public.poll_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMIT;