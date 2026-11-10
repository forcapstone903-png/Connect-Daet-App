BEGIN;

DO $$
DECLARE
  author_id UUID;
  matching_admin_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO matching_admin_count
  FROM public.info_users AS app_user
  LEFT JOIN public.profiles AS profile ON profile.user_id = app_user.id
  WHERE app_user.user_type = 'admin'
    AND app_user.status = 'active'
    AND LOWER(BTRIM(COALESCE(NULLIF(profile.full_name, ''), app_user.full_name))) = 'marvin sarmiento';

  IF matching_admin_count = 1 THEN
    SELECT app_user.id
    INTO author_id
    FROM public.info_users AS app_user
    LEFT JOIN public.profiles AS profile ON profile.user_id = app_user.id
    WHERE app_user.user_type = 'admin'
      AND app_user.status = 'active'
      AND LOWER(BTRIM(COALESCE(NULLIF(profile.full_name, ''), app_user.full_name))) = 'marvin sarmiento';

    UPDATE public.info_tourist_spots
    SET created_by = author_id
    WHERE id IN (
      'da000001-2026-4da0-8e10-000000000001',
      'da000001-2026-4da0-8e10-000000000002',
      'da000001-2026-4da0-8e10-000000000003',
      'da000001-2026-4da0-8e10-000000000004'
    )
      AND created_by IS DISTINCT FROM author_id;

    UPDATE public.info_blogs
    SET created_by = author_id
    WHERE id IN (
      'db000001-2026-4db0-8e10-000000000001',
      'db000001-2026-4db0-8e10-000000000002',
      'db000001-2026-4db0-8e10-000000000003',
      'db000001-2026-4db0-8e10-000000000004',
      'db000001-2026-4db0-8e10-000000000005'
    )
      AND created_by IS DISTINCT FROM author_id;
  ELSE
    RAISE NOTICE 'Editorial author repair skipped: expected one active admin named Marvin Sarmiento, found %.', matching_admin_count;
  END IF;
END;
$$;

COMMIT;
