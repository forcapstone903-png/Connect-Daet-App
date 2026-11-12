BEGIN;

CREATE TABLE IF NOT EXISTS public.info_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question VARCHAR(240) NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.info_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT info_faqs_question_nonempty CHECK (char_length(btrim(question)) > 0),
  CONSTRAINT info_faqs_answer_nonempty CHECK (char_length(btrim(answer)) > 0),
  CONSTRAINT info_faqs_answer_length CHECK (char_length(answer) <= 5000),
  CONSTRAINT info_faqs_sort_order_range CHECK (sort_order BETWEEN 0 AND 1000000)
);

CREATE UNIQUE INDEX IF NOT EXISTS info_faqs_question_unique
  ON public.info_faqs (lower(question));

CREATE INDEX IF NOT EXISTS info_faqs_published_order_idx
  ON public.info_faqs (sort_order, created_at, id)
  WHERE is_published = TRUE;

ALTER TABLE public.info_faqs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.info_faqs FROM anon, authenticated;
GRANT ALL ON TABLE public.info_faqs TO service_role;

DROP TRIGGER IF EXISTS tr_info_faqs_updated_at ON public.info_faqs;
CREATE TRIGGER tr_info_faqs_updated_at
  BEFORE UPDATE ON public.info_faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.info_faqs (question, answer, sort_order, is_published)
VALUES
  ('Do I need an account to browse Connect Daet?', 'No. Visitors can browse places, events, public alerts, stories, forum discussions, and reviews without signing in. An account is needed to save favorites, post, review, comment, or submit and track a message to the tourism office.', 10, TRUE),
  ('How can I find places, events, and local stories?', 'Use the Places, Events, and Stories sections to browse. Search and available filters help narrow results by category and location.', 20, TRUE),
  ('How do I get directions to a place?', 'Open a place listing and choose Get directions. The link opens directions in Google Maps.', 30, TRUE),
  ('How can I contact the tourism office or submit a complaint?', 'Sign in and open Feedback & complaints from your dashboard to submit a question, inquiry, suggestion, or complaint and track its status and replies. Visitors can use the Contact page for office details.', 40, TRUE),
  ('How do I report inappropriate content?', 'While signed in, choose Report from the content menu and select the reason that best describes the issue. Reports are reviewed by the moderation team.', 50, TRUE),
  ('Where can I see public alerts?', 'Current public alerts appear on the visitor home page and the Alerts page. Signed-in users can choose notification categories in their notification settings.', 60, TRUE),
  ('What should I do in an emergency?', 'Call 911 or the local emergency hotline listed on the Contact page. Connect Daet shares public advisories but is not an emergency service.', 70, TRUE)
ON CONFLICT DO NOTHING;

COMMIT;
