CREATE TABLE IF NOT EXISTS public.auth_login_failures (
  email_hash text PRIMARY KEY CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  failure_count integer NOT NULL CHECK (failure_count > 0),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_login_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_login_failures TO service_role;

CREATE OR REPLACE FUNCTION public.check_auth_login_lockout(p_email_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login lockout key';
  END IF;

  SELECT locked_until INTO v_locked_until
  FROM public.auth_login_failures
  WHERE email_hash = p_email_hash;

  IF v_locked_until <= now() THEN
    RETURN NULL;
  END IF;

  RETURN v_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.check_auth_login_lockout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_login_lockout(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_auth_login_failure(p_email_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_locked_until timestamptz;
BEGIN
  IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login lockout key';
  END IF;

  INSERT INTO public.auth_login_failures (email_hash, failure_count, window_started_at, updated_at)
  VALUES (p_email_hash, 1, v_now, v_now)
  ON CONFLICT (email_hash) DO UPDATE
  SET failure_count = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - interval '15 minutes' THEN 1
        ELSE public.auth_login_failures.failure_count + 1
      END,
      window_started_at = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - interval '15 minutes' THEN v_now
        ELSE public.auth_login_failures.window_started_at
      END,
      locked_until = CASE
        WHEN public.auth_login_failures.window_started_at <= v_now - interval '15 minutes' THEN NULL
        WHEN public.auth_login_failures.failure_count + 1 >= 5 THEN v_now + interval '15 minutes'
        ELSE public.auth_login_failures.locked_until
      END,
      updated_at = v_now
  RETURNING locked_until INTO v_locked_until;

  RETURN v_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.record_auth_login_failure(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_auth_login_failure(text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_auth_login_failures(p_email_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login lockout key';
  END IF;

  DELETE FROM public.auth_login_failures WHERE email_hash = p_email_hash;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_auth_login_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_auth_login_failures(text) TO service_role;
