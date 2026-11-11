CREATE OR REPLACE FUNCTION public.admin_edit_info_blog(
  p_blog_id UUID,
  p_reviewer_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_excerpt TEXT,
  p_category TEXT,
  p_featured_image TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  blog_row public.info_blogs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Administrator service access is required';
  END IF;
  IF p_reviewer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.info_users WHERE id = p_reviewer_id AND user_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'The editor must be an administrator';
  END IF;
  IF NULLIF(BTRIM(p_title), '') IS NULL OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'A title of 200 characters or fewer is required';
  END IF;
  IF NULLIF(BTRIM(p_content), '') IS NULL OR length(p_content) > 50000 THEN
    RAISE EXCEPTION 'Post content is required and must be 50,000 characters or fewer';
  END IF;
  IF NULLIF(BTRIM(p_category), '') IS NULL OR length(p_category) > 80 THEN
    RAISE EXCEPTION 'A category of 80 characters or fewer is required';
  END IF;
  IF length(COALESCE(p_excerpt, '')) > 5000 OR length(COALESCE(p_featured_image, '')) > 2048 THEN
    RAISE EXCEPTION 'The excerpt or featured image URL is too long';
  END IF;

  SELECT * INTO blog_row
  FROM public.info_blogs
  WHERE id = p_blog_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blog post not found';
  END IF;
  IF blog_row.created_by IS DISTINCT FROM p_reviewer_id THEN
    RAISE EXCEPTION 'Administrators may only edit their own blog posts';
  END IF;

  UPDATE public.info_blogs
  SET title = BTRIM(p_title),
      content = p_content,
      excerpt = NULLIF(BTRIM(p_excerpt), ''),
      category = BTRIM(p_category),
      featured_image = NULLIF(BTRIM(p_featured_image), ''),
      updated_at = NOW()
  WHERE id = p_blog_id
  RETURNING * INTO blog_row;

  INSERT INTO public.blog_moderation_history (
    blog_id, blog_title, blog_author_id, reviewed_by, action, reason, previous_status, new_status
  )
  VALUES (
    blog_row.id, blog_row.title, blog_row.created_by, p_reviewer_id,
    'edited', 'Updated by administrator', blog_row.approval_status, blog_row.approval_status
  );

  RETURN jsonb_build_object(
    'id', blog_row.id,
    'title', blog_row.title,
    'excerpt', blog_row.excerpt,
    'content', blog_row.content,
    'category', blog_row.category,
    'featured_image', blog_row.featured_image,
    'approval_status', blog_row.approval_status,
    'status', blog_row.status,
    'updated_at', blog_row.updated_at
  );
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_admin_editing_other_users_blog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR NOT public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Blog post ownership cannot be changed';
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.created_by AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.excerpt IS DISTINCT FROM OLD.excerpt
    OR NEW.featured_image IS DISTINCT FROM OLD.featured_image
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.images IS DISTINCT FROM OLD.images
    OR NEW.videos IS DISTINCT FROM OLD.videos
    OR NEW.media_layout IS DISTINCT FROM OLD.media_layout
    OR NEW.location IS DISTINCT FROM OLD.location
  ) THEN
    RAISE EXCEPTION 'Administrators may only edit their own blog posts';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS info_blogs_admin_edit_ownership ON public.info_blogs;
CREATE TRIGGER info_blogs_admin_edit_ownership
  BEFORE UPDATE ON public.info_blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_editing_other_users_blog();
