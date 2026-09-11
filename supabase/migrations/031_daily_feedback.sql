BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_feedback_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  feedback_date DATE NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.daily_feedback_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.daily_feedback_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.info_users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('positive', 'neutral', 'concern')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id)
);

ALTER TABLE public.daily_feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_feedback_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_feedback_questions_select_active" ON public.daily_feedback_questions;
DROP POLICY IF EXISTS "daily_feedback_questions_manage_admin" ON public.daily_feedback_questions;
DROP POLICY IF EXISTS "daily_feedback_votes_select_all" ON public.daily_feedback_votes;
DROP POLICY IF EXISTS "daily_feedback_votes_insert_own" ON public.daily_feedback_votes;
DROP POLICY IF EXISTS "daily_feedback_votes_update_own" ON public.daily_feedback_votes;

CREATE POLICY "daily_feedback_questions_select_active" ON public.daily_feedback_questions
  FOR SELECT USING (is_active = TRUE OR public.is_admin(auth.uid()));
CREATE POLICY "daily_feedback_questions_manage_admin" ON public.daily_feedback_questions
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "daily_feedback_votes_select_all" ON public.daily_feedback_votes
  FOR SELECT USING (TRUE);
CREATE POLICY "daily_feedback_votes_insert_own" ON public.daily_feedback_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_feedback_votes_update_own" ON public.daily_feedback_votes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.daily_feedback_questions, public.daily_feedback_votes TO authenticated;

COMMIT;
