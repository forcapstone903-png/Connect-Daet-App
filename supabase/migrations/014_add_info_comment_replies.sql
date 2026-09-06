BEGIN;

ALTER TABLE public.info_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.info_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_info_comments_parent ON public.info_comments(parent_id);

COMMIT;