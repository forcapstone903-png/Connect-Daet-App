CREATE TABLE IF NOT EXISTS public.user_session_versions (
  user_id uuid PRIMARY KEY REFERENCES public.info_users(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_session_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_session_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_session_versions TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version integer;
BEGIN
  INSERT INTO public.user_session_versions (user_id, version, updated_at)
  VALUES (p_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET version = public.user_session_versions.version + 1,
      updated_at = now()
  RETURNING version INTO v_version;

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.password_reset_rate_limits (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.password_reset_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_password_reset_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_bucket_key !~ '^[0-9a-f]{64}$'
     OR p_window_seconds < 60
     OR p_window_seconds > 86400
     OR p_max_requests < 1
     OR p_max_requests > 100 THEN
    RAISE EXCEPTION 'Invalid password reset rate-limit arguments';
  END IF;

  DELETE FROM public.password_reset_rate_limits
  WHERE updated_at < v_now - interval '1 day';

  INSERT INTO public.password_reset_rate_limits (bucket_key, window_started_at, request_count, updated_at)
  VALUES (p_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET window_started_at = CASE
        WHEN public.password_reset_rate_limits.window_started_at
          <= v_now - make_interval(secs => p_window_seconds)
          THEN v_now
        ELSE public.password_reset_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN public.password_reset_rate_limits.window_started_at
          <= v_now - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE public.password_reset_rate_limits.request_count + 1
      END,
      updated_at = v_now
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_password_reset_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_rate_limit(text, integer, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.password_reset_token_uses (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_token_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_token_uses FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.password_reset_token_uses TO service_role;

CREATE OR REPLACE FUNCTION public.consume_password_reset_token(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.password_reset_token_uses
  WHERE consumed_at < now() - interval '8 days';

  INSERT INTO public.password_reset_token_uses (token_hash)
  VALUES (p_token_hash)
  ON CONFLICT (token_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_password_reset_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_token(text) TO service_role;
