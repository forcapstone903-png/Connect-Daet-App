BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_profanity_word(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT regexp_replace(
    regexp_replace(
      translate(normalize(lower(p_text), NFC), '0123456789', 'oizeasgtbg'),
      '[^[:alnum:]_]',
      '',
      'g'
    ),
    '([[:alpha:]])\1+',
    '\1',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.profanity_token_matches(
  p_term TEXT,
  p_raw_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  masked_token TEXT;
  term_length INTEGER := char_length(p_term);
  term_position INTEGER := 1;
  token_position INTEGER := 1;
  masked_characters INTEGER := 0;
  max_masked_characters CONSTANT INTEGER := 3;
BEGIN
  IF p_term = public.normalize_profanity_word(p_raw_token) THEN
    RETURN TRUE;
  END IF;

  masked_token := translate(
    normalize(lower(p_raw_token), NFC),
    '0123456789',
    'oizeasgtbg'
  );
  masked_token := regexp_replace(
    masked_token,
    '^[^[:alnum:]_]+|[^[:alnum:]_]+$',
    '',
    'g'
  );
  masked_token := regexp_replace(masked_token, '[^[:alnum:]_]+', '?', 'g');
  masked_token := regexp_replace(masked_token, '([[:alpha:]])\1+', '\1', 'g');
  IF strpos(masked_token, '?') = 0 THEN
    RETURN FALSE;
  END IF;

  WHILE token_position <= char_length(masked_token) LOOP
    IF substr(masked_token, token_position, 1) = '?' THEN
      term_position := term_position + 1;
      masked_characters := masked_characters + 1;
      IF masked_characters > max_masked_characters THEN
        RETURN FALSE;
      END IF;
    ELSIF substr(p_term, term_position, 1) = substr(masked_token, token_position, 1) THEN
      term_position := term_position + 1;
    ELSE
      RETURN FALSE;
    END IF;
    token_position := token_position + 1;
  END LOOP;

  RETURN term_position > term_length;
END;
$$;

CREATE OR REPLACE FUNCTION public.profanity_phrase_matches(
  p_terms TEXT[],
  p_candidates TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  term_count INTEGER := cardinality(p_terms);
  candidate_count INTEGER := cardinality(p_candidates);
  candidate_start INTEGER;
  term_position INTEGER;
  phrase_matches BOOLEAN;
BEGIN
  IF term_count = 0 OR candidate_count < term_count THEN
    RETURN FALSE;
  END IF;

  FOR candidate_start IN 1..(candidate_count - term_count + 1)
  LOOP
    phrase_matches := TRUE;
    FOR term_position IN 1..term_count
    LOOP
      IF NOT public.profanity_token_matches(
        p_terms[term_position],
        p_candidates[candidate_start + term_position - 1]
      ) THEN
        phrase_matches := FALSE;
        EXIT;
      END IF;
    END LOOP;

    IF phrase_matches THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_profanity_word(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profanity_token_matches(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profanity_phrase_matches(TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_profanity_word(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.profanity_token_matches(TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.profanity_phrase_matches(TEXT[], TEXT[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.flag_content_with_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_data JSONB := to_jsonb(NEW);
  previous_data JSONB;
  setting_value JSONB;
  terms JSONB;
  owner_id UUID;
  content_text TEXT;
  term TEXT;
  term_token TEXT;
  normalized_term TEXT;
  term_tokens TEXT[];
  normalized_term_tokens TEXT[] := ARRAY[]::TEXT[];
  matched_terms TEXT[] := ARRAY[]::TEXT[];
  content_tokens TEXT[];
  punctuation_separated_tokens TEXT[];
  term_matched BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_data := to_jsonb(OLD);
    IF COALESCE(previous_data->>'title', '') = COALESCE(row_data->>'title', '')
       AND COALESCE(previous_data->>'excerpt', '') = COALESCE(row_data->>'excerpt', '')
       AND COALESCE(previous_data->>'content', '') = COALESCE(row_data->>'content', '')
       AND COALESCE(previous_data->>'body', '') = COALESCE(row_data->>'body', '') THEN
      RETURN NEW;
    END IF;
  END IF;

  owner_id := COALESCE(
    NULLIF(row_data->>'created_by', '')::UUID,
    NULLIF(row_data->>'user_id', '')::UUID
  );
  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  content_text := concat_ws(
    ' ',
    row_data->>'title',
    row_data->>'excerpt',
    row_data->>'content',
    row_data->>'body'
  );
  content_tokens := regexp_split_to_array(content_text, '[[:space:]]+');
  punctuation_separated_tokens := regexp_split_to_array(
    content_text,
    '[^[:alnum:]_]+'
  );

  SELECT value INTO setting_value
    FROM public.admin_app_settings
   WHERE id = 'moderation';
  terms := setting_value->'profanityTerms';
  IF COALESCE(jsonb_typeof(terms), '') <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR term IN
    SELECT value
      FROM jsonb_array_elements_text(terms) AS configured(value)
  LOOP
    IF term IS NULL OR btrim(term) = '' THEN
      CONTINUE;
    END IF;

    term_tokens := regexp_split_to_array(btrim(term), '[[:space:]]+');
    normalized_term_tokens := ARRAY[]::TEXT[];
    FOREACH term_token IN ARRAY term_tokens
    LOOP
      normalized_term := public.normalize_profanity_word(term_token);
      IF normalized_term <> '' THEN
        normalized_term_tokens := array_append(normalized_term_tokens, normalized_term);
      END IF;
    END LOOP;

    IF cardinality(normalized_term_tokens) = 0 THEN
      CONTINUE;
    END IF;

    term_matched := public.profanity_phrase_matches(
      normalized_term_tokens,
      content_tokens
    ) OR public.profanity_phrase_matches(
      normalized_term_tokens,
      punctuation_separated_tokens
    );

    IF term_matched THEN
      matched_terms := array_append(
        matched_terms,
        array_to_string(normalized_term_tokens, ' ')
      );
    END IF;
  END LOOP;

  IF cardinality(matched_terms) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.info_moderation (
    report_type,
    reason,
    description,
    severity,
    reported_by,
    reported_user_id,
    reported_item_id,
    reported_item_table,
    status
  )
  VALUES (
    'profanity',
    'Automatic profanity filter match',
    'Matched configured terms: ' || array_to_string(matched_terms, ', '),
    'medium',
    NULL,
    owner_id,
    NULLIF(row_data->>'id', '')::UUID,
    TG_TABLE_NAME,
    'pending'
  )
  ON CONFLICT (reported_item_table, reported_item_id)
    WHERE report_type = 'profanity'
      AND status IN ('pending', 'reviewing')
      AND reported_item_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

COMMIT;
