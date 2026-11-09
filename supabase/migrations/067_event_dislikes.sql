BEGIN;

ALTER TABLE public.content_reactions
  DROP CONSTRAINT IF EXISTS content_reactions_reaction_type_check;

ALTER TABLE public.content_reactions
  ADD CONSTRAINT content_reactions_reaction_type_check
  CHECK (reaction_type IN ('like', 'love', 'laugh', 'wow', 'sad', 'angry', 'dislike'));

COMMIT;
