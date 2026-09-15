BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_push_edge_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  function_url CONSTANT TEXT := 'https://ttcmbktxritcfeecezfk.supabase.co/functions/v1/push';
  webhook_token CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y21ia3R4cml0Y2ZlZWNlemZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDEwNDEsImV4cCI6MjEwMjI3NzA0MX0.qqg5SuWvlgCSwPk4bdnD5gS1sxCIkfLhh9Yyy7TJw6o';
BEGIN
  PERFORM net.http_post(
    function_url,
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
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_token
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
