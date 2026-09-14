BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Replace both placeholders before applying this migration. Keep the token out
-- of source control where possible, or deploy the function with JWT verification
-- disabled and validate a dedicated secret header inside the Edge Function.
CREATE OR REPLACE FUNCTION public.invoke_push_edge_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  function_url CONSTANT TEXT := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/push';
  webhook_token CONSTANT TEXT := 'REPLACE_WITH_WEBHOOK_SECRET_OR_ANON_KEY';
BEGIN
  PERFORM net.http_post(
    function_url,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_token
    ),
    jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'title', NEW.title,
        'body', NEW.body,
        'url', NEW.url,
        'created_at', NEW.created_at
      )
    ),
    1000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_invoke_push_edge_function ON public.notifications;
CREATE TRIGGER trigger_invoke_push_edge_function
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_edge_function();

COMMIT;
