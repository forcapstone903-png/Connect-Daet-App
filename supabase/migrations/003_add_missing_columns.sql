BEGIN;

-- ============================================================
-- Add missing columns for info_events
-- ============================================================
ALTER TABLE public.info_events
  ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Add missing columns for info_announcements
-- ============================================================
ALTER TABLE public.info_announcements
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Add missing columns for info_tourist_spots
-- ============================================================
ALTER TABLE public.info_tourist_spots
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Add missing columns for info_amenities
-- ============================================================
ALTER TABLE public.info_amenities
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}';

-- ============================================================
-- Add missing columns for info_users
-- ============================================================
ALTER TABLE public.info_users
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- Add missing columns for info_blogs
-- ============================================================
ALTER TABLE public.info_blogs
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Add missing columns for forum_threads
-- ============================================================
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Add missing columns for info_inquiries
-- ============================================================
ALTER TABLE public.info_inquiries
  ADD COLUMN IF NOT EXISTS admin_response TEXT,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL;

-- ============================================================
-- Expand info_user_posts status constraint to include 'pending'
-- ============================================================
ALTER TABLE public.info_user_posts
  DROP CONSTRAINT IF EXISTS info_user_posts_status_check;
ALTER TABLE public.info_user_posts
  ADD CONSTRAINT info_user_posts_status_check
  CHECK (status IN ('draft', 'published', 'pending', 'flagged'));

-- ============================================================
-- Expand info_inquiries status constraint to include 'in_progress' and 'answered'
-- ============================================================
ALTER TABLE public.info_inquiries
  DROP CONSTRAINT IF EXISTS info_inquiries_status_check;
ALTER TABLE public.info_inquiries
  ADD CONSTRAINT info_inquiries_status_check
  CHECK (status IN ('open', 'in_progress', 'answered', 'reviewing', 'resolved', 'closed'));

COMMIT;