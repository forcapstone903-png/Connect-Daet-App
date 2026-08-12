-- Add points column to info_users if missing
ALTER TABLE public.info_users
ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- Ensure index for common queries
CREATE INDEX IF NOT EXISTS idx_info_users_points ON public.info_users(points);
