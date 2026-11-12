BEGIN;

CREATE TABLE IF NOT EXISTS public.tourist_spot_geocode_cache (
  query_key text PRIMARY KEY,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  expires_at timestamptz NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tourist_spot_geocode_cache_expires_at_idx
  ON public.tourist_spot_geocode_cache (expires_at);

ALTER TABLE public.tourist_spot_geocode_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tourist_spot_geocode_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourist_spot_geocode_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.tourist_spot_geocode_rate_limit (
  id smallint PRIMARY KEY CHECK (id = 1),
  next_allowed_at timestamptz NOT NULL
);

ALTER TABLE public.tourist_spot_geocode_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tourist_spot_geocode_rate_limit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tourist_spot_geocode_rate_limit TO service_role;

CREATE OR REPLACE FUNCTION public.wait_for_tourist_spot_geocode_slot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_next_allowed_at timestamptz;
  v_wait_seconds double precision;
BEGIN
  DELETE FROM public.tourist_spot_geocode_cache
  WHERE expires_at < clock_timestamp();

  INSERT INTO public.tourist_spot_geocode_rate_limit (id, next_allowed_at)
  VALUES (1, clock_timestamp())
  ON CONFLICT (id) DO NOTHING;

  SELECT next_allowed_at
  INTO v_next_allowed_at
  FROM public.tourist_spot_geocode_rate_limit
  WHERE id = 1
  FOR UPDATE;

  v_wait_seconds := GREATEST(
    0,
    EXTRACT(EPOCH FROM (v_next_allowed_at - clock_timestamp()))
  );
  IF v_wait_seconds > 0 THEN
    PERFORM pg_sleep(v_wait_seconds);
  END IF;

  UPDATE public.tourist_spot_geocode_rate_limit
  SET next_allowed_at = clock_timestamp() + interval '1 second'
  WHERE id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.wait_for_tourist_spot_geocode_slot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wait_for_tourist_spot_geocode_slot() TO service_role;

COMMIT;
